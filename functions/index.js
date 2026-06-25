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

// 계정 차단/해제: Auth disabled 토글 + Firestore status 반영
exports.adminSetBlocked = onCall(async (request) => {
  await assertAdmin(request);
  const uid = requireUid(request.data);
  const blocked = !!(request.data && request.data.blocked);
  await auth().updateUser(uid, {disabled: blocked});
  await db().collection("users").doc(uid).set(
      {status: blocked ? "blocked" : "active"},
      {merge: true},
  );
  return {ok: true, blocked};
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
  return {ok: true, ...patch};
});
