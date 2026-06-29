"use client";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";

export type ManagerKind = "" | "requester" | "safety" | "factory";

export interface CompanyAccount {
  uid: string;
  email: string;
  company: string;
  name: string;
  status: "pending" | "active" | "blocked";
  role: "guest" | "manager" | "admin";
  managerKind: ManagerKind;
  managerName: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt?: string | null;
  approvedAt?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 업체 셀프 회원가입: 실제 이메일로 가입 → 인증메일 발송 → users 문서(status=pending) 작성.
// 가입 직후 본인 세션으로 로그인되지만, 이메일 인증 + 관리자 승인 전까지 게이트에서 차단된다.
export async function signUpCompany(
  email: string, company: string, name: string, password: string
): Promise<void> {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new Error("올바른 이메일 주소를 입력하세요.");
  if (!company.trim()) throw new Error("업체명(소속)을 입력하세요.");
  if (!name.trim()) throw new Error("이름을 입력하세요.");
  if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");

  const cred = await createUserWithEmailAndPassword(auth, mail, password);
  try { await sendEmailVerification(cred.user); } catch { /* 발송 실패해도 가입은 유지, 재발송 가능 */ }
  await setDoc(doc(db, "users", cred.user.uid), {
    email: mail,
    role: "guest",
    company: company.trim(), // 업체명(또는 LS알스코)
    name: name.trim(),       // 가입자 이름 — 업체명과 별개로 관리
    status: "pending",
    createdAt: new Date().toISOString(),
  });
}

// 비밀번호 재설정 메일 (본인/관리자 트리거 공용 — 실제 이메일로 발송)
export async function sendResetEmail(email: string): Promise<void> {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new Error("올바른 이메일 주소를 입력하세요.");
  await sendPasswordResetEmail(auth, mail);
}

// ── 관리자 전용 (Cloud Function, admin SDK 백엔드) ───────────────────────────
export async function listCompanyAccounts(): Promise<CompanyAccount[]> {
  const fn = httpsCallable<unknown, { accounts: CompanyAccount[] }>(functions, "adminListAccounts");
  const res = await fn({});
  return res.data.accounts;
}

export async function adminApprove(uid: string): Promise<void> {
  await httpsCallable(functions, "adminApprove")({ uid });
}

export async function adminDeleteAccount(uid: string): Promise<void> {
  await httpsCallable(functions, "adminDeleteAccount")({ uid });
}

export async function adminSetPassword(uid: string, password: string): Promise<void> {
  if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");
  await httpsCallable(functions, "adminSetPassword")({ uid, password });
}

// 역할 분류: 업체(guest)/관리자(manager)/시스템관리자(admin). 관리자면 kind(requester/factory)+이름.
export async function adminSetRole(
  uid: string, role: "guest" | "manager" | "admin", managerKind: ManagerKind = "", managerName = "",
): Promise<void> {
  await httpsCallable(functions, "adminSetRole")({ uid, role, managerKind, managerName });
}
