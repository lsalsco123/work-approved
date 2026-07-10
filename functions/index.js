/**
 * 작업허가서(PTW) 관리자용 Cloud Functions.
 * admin SDK 권한으로 업체(게스트) 계정의 승인/차단/비밀번호를 처리한다.
 * 모든 함수는 호출자가 Firestore users/{uid}.role == 'admin' 인지 검증한다.
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

// 이 프로젝트의 Firestore 는 named DB "default" (클라 getFirestore(app,"default") 와 일치).
// admin.firestore() 의 기본 "(default)" 가 아니라 named DB 를 명시해야 한다.
const auth = () => admin.auth();
const db = () => getFirestore("default");

// 환경안전 검토자 허용 명단 — src/lib/managers.ts 의 SAFETY_REVIEWERS 와 반드시 동기화해야 한다.
// (빌드 단계가 분리되어 있어 공유 모듈로 import 할 수 없다.)
const SAFETY_REVIEWERS = ["황성재", "이승준", "박세현"];

/**
 * 호출자가 admin 인지 검증한다. 아니면 throw.
 * @param {object} request onCall 요청 객체
 * @return {Promise<string>} 호출자 uid
 */
async function assertAdmin(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const snap = await db().collection("users").doc(uid).get();
  const d = snap.exists ? snap.data() : {};
  if (d.role !== "admin") {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }
  const status = d.status || "active";
  if (status !== "active") {
    throw new HttpsError(
        "permission-denied",
        status === "blocked" ? "차단된 계정입니다." : "계정이 아직 승인되지 않았습니다.",
    );
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
// Auth 조회(getUser)를 계정별로 병렬 처리한다 — 순차 await 는 계정 수에 비례해 느려진다.
exports.adminListAccounts = onCall(async (request) => {
  await assertAdmin(request);
  const snap = await db().collection("users").get();
  const out = await Promise.all(snap.docs.map(async (docSnap) => {
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
    return {
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
    };
  }));
  out.sort((a, b) => (a.company || "").localeCompare(b.company || "", "ko"));
  return {accounts: out};
});

// 가입 승인: status -> active. 이메일 인증 완료 여부를 서버에서도 재검증한다
// (클라이언트는 "승인" 버튼을 미인증 계정에 disabled 처리할 뿐이라, 직접 호출 시 우회될 수 있었다).
exports.adminApprove = onCall(async (request) => {
  const adminUid = await assertAdmin(request);
  const uid = requireUid(request.data);
  let verified = false;
  try {
    verified = (await auth().getUser(uid)).emailVerified;
  } catch (e) {/* Auth 사용자 없음 — 미인증으로 간주 */}
  if (!verified) {
    throw new HttpsError(
        "failed-precondition", "이메일 인증이 완료되지 않은 계정은 승인할 수 없습니다.",
    );
  }
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
  if (password.length < 6 || password.length > 128) {
    throw new HttpsError("invalid-argument", "비밀번호는 6자 이상 128자 이하이어야 합니다.");
  }
  await auth().updateUser(uid, {password});
  return {ok: true};
});

/**
 * 계정 차단/차단 해제 — status 를 active ↔ blocked 로 전환한다.
 * 삭제(adminDeleteAccount)와 달리 되돌릴 수 있는 정지 조치. 본인 계정은 차단할 수 없다.
 * 차단 해제는 현재 status 가 blocked 인 계정에만 허용한다(pending 승인 우회 방지 —
 * 아직 승인되지 않은 계정을 활성화하려면 반드시 adminApprove 를 거쳐야 한다).
 * 차단 시에는 기존 발급 토큰을 즉시 무효화해 최대 1시간 대기 없이 바로 효력이 발생하게 한다.
 */
exports.adminSetBlocked = onCall(async (request) => {
  const adminUid = await assertAdmin(request);
  const uid = requireUid(request.data);
  const blocked = !!(request.data && request.data.blocked);
  if (blocked && uid === adminUid) {
    throw new HttpsError("failed-precondition", "본인 계정은 차단할 수 없습니다.");
  }
  if (!blocked) {
    const beforeSnap = await db().collection("users").doc(uid).get();
    const beforeStatus =
      (beforeSnap.exists && beforeSnap.data().status) || "active";
    if (beforeStatus !== "blocked") {
      throw new HttpsError("failed-precondition", "차단된 계정만 차단 해제할 수 있습니다.");
    }
  }
  await db().collection("users").doc(uid).set(
      {
        status: blocked ? "blocked" : "active",
        ...(blocked ?
          {blockedAt: new Date().toISOString(), blockedBy: adminUid} :
          {unblockedAt: new Date().toISOString(), unblockedBy: adminUid}),
      },
      {merge: true},
  );
  if (blocked) {
    try {
      await auth().revokeRefreshTokens(uid);
    } catch (e) {/* Auth 사용자 없음 등은 무시 */}
  }
  return {ok: true, status: blocked ? "blocked" : "active"};
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
  const comment = String(d.comment || "").trim().slice(0, 500);
  const reviewerName = String(d.reviewerName || "").trim().slice(0, 50);
  const signature = String(d.signature || "");
  if (!permitId) throw new HttpsError("invalid-argument", "permitId 가 필요합니다.");
  if (!["approve", "reject", "resubmit"].includes(action)) {
    throw new HttpsError("invalid-argument", "action 이 올바르지 않습니다.");
  }
  const PNG_PREFIX = "data:image/png;base64,";
  const PNG_MAGIC =
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (action === "approve") {
    if (!signature.startsWith(PNG_PREFIX) || signature.length > 100000) {
      throw new HttpsError("invalid-argument", "유효한 서명을 입력하세요.");
    }
    // 접두어만이 아니라 실제 PNG 매직바이트까지 확인한다 — 접두어만 검사하면
    // 접두어 뒤에 PNG 가 아닌 임의 base64 문자열을 붙여도 통과해 영구 기록에 남는다.
    const decoded = Buffer.from(signature.slice(PNG_PREFIX.length), "base64");
    if (decoded.length < 8 || !decoded.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new HttpsError("invalid-argument", "유효한 PNG 서명 이미지가 아닙니다.");
    }
  }

  // 호출자 역할은 트랜잭션 중 불변이므로 밖에서 1회 조회
  const usnap = await db().collection("users").doc(callerUid).get();
  const u = usnap.exists ? usnap.data() : {};
  const callerStatus = u.status || "active";
  if (callerStatus !== "active") {
    throw new HttpsError(
        "permission-denied",
        callerStatus === "blocked" ? "차단된 계정입니다." : "계정이 아직 승인되지 않았습니다.",
    );
  }
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
      // reviewerName 은 클라이언트가 보내는 값이므로, 실제 검토자 명단(SAFETY_REVIEWERS)에
      // 있는 이름인지 서버에서도 재검증한다 — 클라 드롭다운만 믿으면 임의 이름이 기록될 수 있다.
      const finalReviewer = reviewerName || "박세현";
      if (!SAFETY_REVIEWERS.includes(finalReviewer)) {
        throw new HttpsError("invalid-argument", "환경안전 검토자 이름이 올바르지 않습니다.");
      }
      upd["data.admin.review.name"] = finalReviewer;
      upd["data.admin.review.dept"] = "환경안전";
      upd["data.admin.review.date"] = today;
      upd["data.admin.review.sign"] = signature;
      // 화기작업: 소방안전관리자 서명은 업체가 아닌 환경안전(박세현) 검토 단계에서 기재한다.
      const wts = (permit.data && permit.data.workTypes) || [];
      if (Array.isArray(wts) && wts.includes("hot")) {
        upd["data.hotFireManager"] = finalReviewer;
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
  // 강등 여부(admin → 그 외)를 쓰기 전에 미리 확인해 둔다 — 토큰 revoke 판단용.
  const beforeSnap = await db().collection("users").doc(uid).get();
  const wasAdmin = beforeSnap.exists && beforeSnap.data().role === "admin";

  await db().collection("users").doc(uid).set(patch, {merge: true});
  // 시스템관리자 여부를 커스텀 클레임에도 반영 → Storage 규칙이 토큰만으로 검사 가능.
  // (승격은 다음 토큰 갱신/재로그인 시 클레임이 적용된다 — syncAdminClaim 으로 즉시 반영 가능.)
  try {
    await auth().setCustomUserClaims(uid, {admin: role === "admin"});
  } catch (e) {/* 클레임 설정 실패는 역할 저장 자체를 막지 않음 */}
  // admin 에서 강등되는 경우, 기존에 발급된 ID 토큰(admin 클레임 포함)을 즉시 무효화.
  // 그대로 두면 토큰 만료 전까지 최대 1시간 formTemplates Storage 쓰기 권한이 남는다.
  if (wasAdmin && role !== "admin") {
    try {
      await auth().revokeRefreshTokens(uid);
    } catch (e) {/* Auth 사용자 없음 등은 무시 */}
  }
  return {ok: true, ...patch};
});

/**
 * 계정 프로필(업체명/소속, 이름) 수정 — 가입 시 1회만 기록되던 값을 시스템관리자가 정정할 수 있게 한다.
 */
exports.adminSetProfile = onCall(async (request) => {
  await assertAdmin(request);
  const uid = requireUid(request.data);
  const d = request.data || {};
  const company = String(d.company || "").trim();
  const name = String(d.name || "").trim();
  if (!company) throw new HttpsError("invalid-argument", "업체명(소속)을 입력하세요.");
  if (!name) throw new HttpsError("invalid-argument", "이름을 입력하세요.");
  if (company.length > 100) {
    throw new HttpsError("invalid-argument", "업체명(소속)이 너무 깁니다.");
  }
  if (name.length > 100) {
    throw new HttpsError("invalid-argument", "이름이 너무 깁니다.");
  }
  await db().collection("users").doc(uid).set({company, name}, {merge: true});
  return {ok: true, company, name};
});

/**
 * 첨부파일 열람용 단기 서명 URL 발급.
 * Firebase Storage 의 getDownloadURL() 토큰은 Security Rules 를 완전히 우회하므로
 * (한 번 유출되면 규칙과 무관하게 영구 열람권이 된다), 첨부파일은 이 함수로만 접근하게 하고
 * 매 요청마다 permit 소유권/결재라인을 다시 검증한 뒤 만료되는(기본 15분) 서명 URL만 내려준다.
 * 준비 단계: storage.rules 의 직접 read 를 막기 전까지는 이 함수가 없어도 기존 방식이 동작하므로,
 * rules 를 실제로 잠그는 시점에 이 함수로 전환한다 (그 전엔 사전에 GCP IAM 에서
 * 이 함수의 서비스계정에 "Service Account Token Creator" 역할이 있는지 반드시 확인해야 한다 —
 * 없으면 getSignedUrl 이 권한 오류로 실패한다).
 */
exports.getAttachmentUrl = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const permitId = String((request.data && request.data.permitId) || "").trim();
  const path = String((request.data && request.data.path) || "").trim();
  if (!permitId || !path) {
    throw new HttpsError("invalid-argument", "permitId, path 가 필요합니다.");
  }
  // path 는 반드시 이 permitId 소유 폴더 하위여야 한다 (다른 permit 의 첨부 경로 조회 방지).
  if (!path.startsWith(`permits/${permitId}/`)) {
    throw new HttpsError("invalid-argument", "path 가 permitId 와 일치하지 않습니다.");
  }

  const usnap = await db().collection("users").doc(uid).get();
  const u = usnap.exists ? usnap.data() : {};
  if ((u.status || "active") === "blocked") {
    throw new HttpsError("permission-denied", "차단된 계정입니다.");
  }
  const psnap = await db().collection("permits").doc(permitId).get();
  if (!psnap.exists) throw new HttpsError("not-found", "허가서를 찾을 수 없습니다.");
  const permit = psnap.data();

  // firestore.rules 의 permits 읽기 권한과 동일한 기준을 그대로 재현한다.
  const role = u.role || "guest";
  const isSys = role === "admin";
  const isOwner = permit.createdBy === uid;
  const reqMgr = (permit.data && permit.data.manager) || "";
  const isReqMgr = role === "manager" &&
    u.managerKind === "requester" && u.managerName === reqMgr;
  const isFactoryMgr = role === "manager" &&
    u.managerKind === "factory" &&
    (permit.stage === "factory" ||
      ["approved", "completed"].includes(permit.status));
  const canRead = isSys || isOwner ||
    (permit.status !== "draft" && (isReqMgr || isFactoryMgr));
  if (!canRead) {
    throw new HttpsError("permission-denied", "이 허가서 첨부파일을 열람할 권한이 없습니다.");
  }

  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "파일을 찾을 수 없습니다.");
  const [url] = await file.getSignedUrl({
    version: "v4", action: "read", expires: Date.now() + 15 * 60 * 1000,
  });
  return {url};
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
