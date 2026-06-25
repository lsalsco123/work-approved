"use client";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore, doc, setDoc, collection, query, where, getDocs,
} from "firebase/firestore";
import { db } from "./firebase";

// 게스트(외주업체) 로그인 아이디는 도메인 없는 아이디만 입력받고 내부적으로 가짜 도메인을 붙인다.
const FAKE_DOMAIN = "@alsco.permit";
const toFbEmail = (id: string) => (id.includes("@") ? id : id + FAKE_DOMAIN);

const fbConfig = {
  apiKey: process.env.NEXT_PUBLIC_FB_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FB_APP_ID,
};

// 보조 Firebase 앱 — 계정 생성 시 현재 관리자 로그인 세션이 새 계정으로 대체되지 않도록 분리
const SECONDARY = "admin-account-create";
function secondaryApp(): FirebaseApp {
  return getApps().find((a) => a.name === SECONDARY) ?? initializeApp(fbConfig as any, SECONDARY);
}

export interface CompanyAccount {
  uid: string;
  loginId: string; // 표시용 아이디 (가짜 도메인 제거)
  company: string;
  createdAt?: string;
}

const toDisplayId = (email: string) =>
  email.endsWith(FAKE_DOMAIN) ? email.slice(0, -FAKE_DOMAIN.length) : email;

// 관리자가 업체 계정을 생성한다.
// 보조 앱(별도 auth 컨텍스트)으로 가입 → 그 사용자 본인 컨텍스트로 users 문서 작성하여
// Firestore rules 의 isSelf(role=guest) 경로를 통과시킨다. 끝나면 보조 세션은 로그아웃.
export async function createCompanyAccount(
  loginId: string, company: string, password: string
): Promise<string> {
  const id = loginId.trim();
  if (!id) throw new Error("아이디를 입력하세요.");
  if (!company.trim()) throw new Error("업체명을 입력하세요.");
  if (password.length < 6) throw new Error("비밀번호는 6자 이상이어야 합니다.");

  const app = secondaryApp();
  const secAuth = getAuth(app);
  const secDb = getFirestore(app, "default");
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, toFbEmail(id), password);
    await setDoc(doc(secDb, "users", cred.user.uid), {
      email: id,
      role: "guest",
      company: company.trim(),
      createdAt: new Date().toISOString(),
    });
    return cred.user.uid;
  } finally {
    try { await signOut(secAuth); } catch {}
  }
}

// 업체(게스트) 계정 목록 — 관리자 전용 (rules: isAdmin 이면 users 조회 허용)
export async function listCompanyAccounts(): Promise<CompanyAccount[]> {
  const q = query(collection(db, "users"), where("role", "==", "guest"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() as { email?: string; company?: string; createdAt?: string };
      return {
        uid: d.id,
        loginId: toDisplayId(data.email ?? ""),
        company: data.company ?? "",
        createdAt: data.createdAt,
      };
    })
    .sort((a, b) => a.company.localeCompare(b.company, "ko"));
}
