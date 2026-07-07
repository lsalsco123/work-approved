/**
 * 작업허가서(PTW) 관리자용 Cloud Functions.
 * admin SDK 권한으로 업체(게스트) 계정의 승인/차단/비밀번호를 처리한다.
 * 모든 함수는 호출자가 Firestore users/{uid}.role == 'admin' 인지 검증한다.
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

// 이 프로젝트의 Firestore 는 named DB "default" (클라 getFirestore(app,"default") 와 일치).
// admin.firestore() 의 기본 "(default)" 가 아니라 named DB 를 명시해야 한다.
const auth = () => admin.auth();
const db = () => getFirestore("default");

/**
 * 호출자가 admin 인지 검증한다. 아니면 throw.
 * @param {object} request onCall 요청 객체
 * @return {Promise<string>} 호출자 uid
 */
async function assertAdmin(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const snap = await db().collection("users").doc(uid).get();
  if (!snap.exists || snap.data().role !== "admin") {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }
  return uid;
}

/**
 * 요청 데이터에서 대상 uid 를 꺼낸다. 없으면 throw.
 * @param {object} data onCall request.data
 * @return {string} 대상 uid
 */
function requireUid(data) {
  const uid = (data && data.uid && String(data.uid).trim()) || "";
  if (!uid) throw new HttpsError("invalid-argument", "대상 uid 가 필요합니다.");
  return uid;
}

// 계정 목록 — 업체(guest)+관리자(manager)+시스템관리자(admin) 전체.
exports.adminListAccounts = onCall(async (request) => {
  await assertAdmin(request);
  const snap = await db().collection("users").get();
  const out = [];
  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    let emailVerified = false;
    let disabled = false;
    let authEmail = d.email || "";
    try {
      const u = await auth().getUser(docSnap.id);
      emailVerified = u.emailVerified;
      disabled = u.disabled;
      authEmail = u.email || authEmail;
    } catch (e) {
      // Auth 사용자 없음(삭제됨 등) — Firestore 값만 사용
    }
    out.push({
      uid: docSnap.id,
      email: authEmail,
      company: d.company || "",
      name: d.name || "",
      status: d.status || "active", // legacy(상태 없음)는 active 취급
      role: d.role || "guest",
      managerKind: d.managerKind || "",
      managerName: d.managerName || "",
      emailVerified,
      disabled,
      createdAt: d.createdAt || null,
      approvedAt: d.approvedAt || null,
    });
  }
  out.sort((a, b) => (a.company || "").localeCompare(b.company || "", "ko"));
  return {accounts: out};
});

// 가입 승인: status -> active
exports.adminApprove = onCall(async (request) => {
  const adminUid = await assertAdmin(request);
  const uid = requireUid(request.data);
  await db().collection("users").doc(uid).set(
      {
        status: "active",
        approvedAt: new Date().toISOString(),
        approvedBy: adminUid,
      },
      {merge: true},
  );
  return {ok: true};
});

// 계정 완전 삭제: Auth 사용자 + users 문서 제거. 본인 계정은 삭제 불가.
exports.adminDeleteAccount = onCall(async (request) => {
  const callerUid = await assertAdmin(request);
  const uid = requireUid(request.data);
  if (uid === callerUid) {
    throw new HttpsError("failed-precondition", "본인 계정은 삭제할 수 없습니다.");
  }
  try {
    await db().collection("users").doc(uid).delete();
  } catch (e) {/* 문서 없음 무시 */}
  try {
    await auth().deleteUser(uid);
  } catch (e) {/* Auth 사용자 없음 무시 */}
  return {ok: true};
});

// 비밀번호 직접 지정(관리자 초기화)
exports.adminSetPassword = onCall(async (request) => {
  await assertAdmin(request);
  const uid = requireUid(request.data);
  const password = (request.data && String(request.data.password)) || "";
  if (password.length < 6) {
    throw new HttpsError("invalid-argument", "비밀번호는 6자 이상이어야 합니다.");
  }
  await auth().updateUser(uid, {password});
  return {ok: true};
});

/**
 * 결재 진행 — 단계별 승인/반려/재상신. 서버에서 역할·단계 검증 후 전이.
 * 단계: manager(담당자 1차) → safety(환경안전=admin) → factory(공장장) → 최종 approved.
 * 권한: requester 담당자=본인 manager단계 / 공장장=factory단계 / 시스템관리자=모든 단계 override.
 * 반려는 사유(comment) 필수 → status=rejected (담당자에게 반환). 재상신은 담당자/관리자가.
 */
exports.chainAction = onCall(async (request) => {
  const callerUid = request.auth && request.auth.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const d = request.data || {};
  const permitId = String(d.permitId || "").trim();
  const action = String(d.action || "");
  const comment = String(d.comment || "").trim();
  const reviewerName = String(d.reviewerName || "").trim();
  const signature = String(d.signature || "");
  if (!permitId) throw new HttpsError("invalid-argument", "permitId 가 필요합니다.");
  if (!["approve", "reject", "resubmit"].includes(action)) {
    throw new HttpsError("invalid-argument", "action 이 올바르지 않습니다.");
  }
  if (action === "approve" &&
      (!signature.startsWith("data:image/png;base64,") ||
       signature.length > 100000)) {
    throw new HttpsError("invalid-argument", "유효한 서명을 입력하세요.");
  }

  // 호출자 역할은 트랜잭션 중 불변이므로 밖에서 1회 조회
  const usnap = await db().collection("users").doc(callerUid).get();
  const u = usnap.exists ? usnap.data() : {};
  const role = u.role || "guest";
  const isSys = role === "admin";
  const callerName = u.managerName || u.name ||
    (isSys ? "시스템관리자" : "");
  const pref = db().collection("permits").doc(permitId);

  // 동시 결재 경쟁 방지: permit 읽기·검증·쓰기를 트랜잭션으로 원자 처리
  const result = await db().runTransaction(async (tx) => {
    const psnap = await tx.get(pref);
    if (!psnap.exists) throw new HttpsError("not-found", "허가서를 찾을 수 없습니다.");
    const permit = psnap.data();
    const stage = permit.stage || "manager";
    const reqMgr = (permit.data && permit.data.manager) || "";
    const isReqMgr = role === "manager" &&
      u.managerKind === "requester" && u.managerName === reqMgr;
    const canAtStage = (st) => {
      if (isSys) return true; // override
      if (role !== "manager") return false;
      if (st === "manager") return isReqMgr;
      if (st === "factory") return u.managerKind === "factory";
      return false; // safety 단계는 시스템관리자 전담
    };
    const now = new Date().toISOString();
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

    // 재상신: 반려건을 담당자/관리자가 다시 결재 라인에 올림
    if (action === "resubmit") {
      if (permit.status !== "rejected") {
        throw new HttpsError("failed-precondition", "반려 상태에서만 재상신할 수 있습니다.");
      }
      if (!(isSys || isReqMgr)) {
        throw new HttpsError("permission-denied", "재상신 권한이 없습니다.");
      }
      tx.update(pref, {
        status: "submitted", stage: "manager", chain: {}, updatedAt: now,
      });
      return {stage: "manager", status: "submitted"};
    }

    if (permit.status !== "submitted") {
      throw new HttpsError("failed-precondition", "진행 중(제출됨) 건만 결재할 수 있습니다.");
    }
    if (stage === "manager" && !reqMgr && !isSys) {
      throw new HttpsError("failed-precondition",
          "담당자(의뢰자)가 지정되지 않은 건입니다. 업체가 담당자를 지정해 재제출해야 합니다.");
    }
    if (!canAtStage(stage)) {
      throw new HttpsError("permission-denied", "이 단계를 결재할 권한이 없습니다.");
    }

    if (action === "reject") {
      if (!comment) throw new HttpsError("invalid-argument", "반려 사유를 입력하세요.");
      tx.update(pref, {
        "status": "rejected",
        "chain.rejected": {stage, by: callerName, reason: comment, at: now},
        "adminNote": comment, "updatedAt": now,
      });
      return {status: "rejected"};
    }

    // approve: 단계 기록 + 다음 단계로 전이
    const upd = {updatedAt: now};
    upd[`chain.${stage}`] = {by: callerName, comment, at: now};
    if (stage === "manager") {
      upd["data.admin.issue.name"] = reqMgr;
      upd["data.admin.issue.date"] = today;
      upd["data.admin.issue.sign"] = signature;
      upd.stage = "safety";
    } else if (stage === "safety") {
      upd["data.admin.review.name"] = reviewerName || "박세현";
      upd["data.admin.review.dept"] = "환경안전";
      upd["data.admin.review.date"] = today;
      upd["data.admin.review.sign"] = signature;
      // 화기작업: 소방안전관리자 서명은 업체가 아닌 환경안전(박세현) 검토 단계에서 기재한다.
      const wts = (permit.data && permit.data.workTypes) || [];
      if (Array.isArray(wts) && wts.includes("hot")) {
        upd["data.hotFireManager"] = reviewerName || "박세현";
        upd["data.hotFireManagerSign"] = signature;
      }
      upd.stage = "factory";
    } else if (stage === "factory") {
      const approverName = callerName || "이태훈";
      upd["data.admin.approve.name"] = approverName;
      upd["data.admin.approve.dept"] = "공장장";
      upd["data.admin.approve.date"] = today;
      upd["data.admin.approve.sign"] = signature;
      upd.status = "approved";
      upd.approvedBy = approverName;
      upd.approvedAt = now;
      upd.stage = "done";
    }
    tx.update(pref, upd);
    return {stage: upd.stage, status: upd.status || "submitted"};
  });
  return {ok: true, ...result};
});

/**
 * 계정 역할 분류: 업체(guest) / 관리자(manager) / 시스템관리자(admin).
 * 관리자는 managerKind(requester=담당자 / factory=공장장) + managerName 지정.
 * 시스템관리자(admin)는 최고 권한. 자기 자신의 역할은 바꿀 수 없다(자기 잠금 방지).
 */
exports.adminSetRole = onCall(async (request) => {
  const callerUid = await assertAdmin(request);
  const uid = requireUid(request.data);
  if (uid === callerUid) {
    throw new HttpsError("failed-precondition", "본인 역할은 변경할 수 없습니다.");
  }
  const role = String((request.data && request.data.role) || "");
  if (!["guest", "manager", "admin"].includes(role)) {
    throw new HttpsError("invalid-argument", "role 이 올바르지 않습니다.");
  }
  const patch = {role, managerKind: "", managerName: ""};
  if (role === "manager") {
    const d = request.data || {};
    const kind = String(d.managerKind || "requester");
    if (!["requester", "factory"].includes(kind)) {
      throw new HttpsError("invalid-argument", "managerKind 가 올바르지 않습니다.");
    }
    patch.managerKind = kind;
    patch.managerName = String(d.managerName || "").trim();
    if (kind === "requester" && !patch.managerName) {
      throw new HttpsError("invalid-argument", "담당자는 담당자명을 지정해야 합니다.");
    }
  }
  await db().collection("users").doc(uid).set(patch, {merge: true});
  // 시스템관리자 여부를 커스텀 클레임에도 반영 → Storage 규칙이 토큰만으로 검사 가능.
  // (대상 사용자는 다음 토큰 갱신/재로그인 시 클레임이 적용된다.)
  try {
    await auth().setCustomUserClaims(uid, {admin: role === "admin"});
  } catch (e) {/* 클레임 설정 실패는 역할 저장 자체를 막지 않음 */}
  return {ok: true, ...patch};
});

/**
 * 본인 커스텀 클레임(admin) 동기화 — 호출자의 Firestore users/{uid}.role 을 읽어
 * admin 여부를 토큰 클레임에 반영한다. 기존 관리자가 재지정 없이 클레임을 받도록 하는 셀프 경로.
 * 안전성: 게스트가 호출해도 본인 Firestore role 은 스스로 admin 으로 바꿀 수 없으므로(rules),
 * 이 함수는 이미 부여된 역할만 클레임에 복제할 뿐 권한 상승 경로가 아니다.
 */
exports.syncAdminClaim = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const snap = await db().collection("users").doc(uid).get();
  const isAdmin = snap.exists && snap.data().role === "admin";
  await auth().setCustomUserClaims(uid, {admin: isAdmin});
  return {admin: isAdmin};
});
