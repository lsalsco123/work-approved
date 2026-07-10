"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type UserRole = "guest" | "manager" | "admin"; // admin = 시스템관리자
export type AccountStatus = "pending" | "active" | "blocked";
// "safety"는 관리자 계정 분류로는 존재한 적 없는 죽은 값이었다(adminSetRole 은 requester/factory 만
// 허용). 환경안전 검토 단계 자체(ChainStage="safety", src/lib/permits.ts)는 admin 이 전담하며 계속 유효하다.
export type ManagerKind = "" | "requester" | "factory";

export interface AuthUser {
  uid: string;
  email: string;
  role: UserRole;
  company: string;
  status: AccountStatus;      // legacy(상태 없음)는 active 로 승격해 호환
  emailVerified: boolean;
  managerKind: ManagerKind;   // role=manager 일 때: requester/factory
  managerName: string;        // role=manager 일 때 담당자명(requester) 등
  savedApprovalSign: string;  // 결재자 본인 저장 서명(PNG data URL)
  profileError: boolean;      // Firestore 프로필 조회 실패(네트워크 지연 등) — role 등은 guest 기본값일 뿐 신뢰하지 말 것
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resendVerification: () => Promise<void>;
  refresh: () => Promise<void>;
}

// 레거시 호환: @ 없는 입력은 가짜 도메인을 붙여 기존(공용/구) 계정 로그인을 유지.
// 신규 계정은 실제 이메일이라 @ 를 포함하므로 그대로 사용.
const FAKE_DOMAIN = "@alsco.permit";
const toFbEmail = (id: string) => (id.includes("@") ? id.trim() : id.trim() + FAKE_DOMAIN);
const toDisplayId = (fbEmail: string) =>
  fbEmail.endsWith(FAKE_DOMAIN) ? fbEmail.slice(0, -FAKE_DOMAIN.length) : fbEmail;

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: async () => {}, logout: async () => {},
  resendVerification: async () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 타임아웃이 걸린 getDoc 한 번 시도. 실패 시 null.
  const tryGetProfile = async (uid: string, timeoutMs: number) => {
    try {
      return await Promise.race([
        getDoc(doc(db, "users", uid)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
      ]);
    } catch { return null; }
  };

  const buildUser = async (fbUser: import("firebase/auth").User): Promise<AuthUser> => {
    let role: UserRole = "guest";
    let company = "";
    let status: AccountStatus = "active";
    let managerKind: ManagerKind = "";
    let managerName = "";
    let savedApprovalSign = "";
    // 실제 admin/manager 계정이 일시적 네트워크 지연으로 guest 로 오판되는 것을 막기 위해
    // 첫 시도(3초) 실패 시 한 번 더(6초) 재시도한 뒤에만 최소 정보(guest)로 진행한다.
    let profileError = false;
    let snap = await tryGetProfile(fbUser.uid, 3000);
    if (!snap) snap = await tryGetProfile(fbUser.uid, 6000);
    if (snap) {
      const d = snap.data() as
        {
          role?: UserRole; company?: string; status?: AccountStatus;
          managerKind?: ManagerKind; managerName?: string; savedApprovalSign?: string;
        } | undefined;
      role = d?.role ?? "guest";
      company = d?.company ?? "";
      status = d?.status ?? "active"; // 상태 필드 없는 legacy 계정은 active 취급
      managerKind = d?.managerKind ?? "";
      managerName = d?.managerName ?? "";
      savedApprovalSign = d?.savedApprovalSign ?? "";
    } else {
      profileError = true;
      console.error("사용자 프로필 조회 실패(네트워크 지연/오류) — 최소 정보로 진행:", fbUser.uid);
    }
    return {
      uid: fbUser.uid,
      email: toDisplayId(fbUser.email ?? ""),
      role,
      company,
      status,
      emailVerified: fbUser.emailVerified,
      managerKind,
      managerName,
      savedApprovalSign,
      profileError,
    };
  };

  useEffect(() => {
    if (typeof (auth as { onAuthStateChanged?: unknown }).onAuthStateChanged !== "function") {
      setLoading(false);
      return;
    }
    const timeout = setTimeout(() => setLoading(false), 5000);
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(timeout);
      setUser(fbUser ? await buildUser(fbUser) : null);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, toFbEmail(email), password);
  };

  const logout = async () => signOut(auth);

  const resendVerification = async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  };

  // 이메일 인증/상태 변경 후 최신화 (Auth 토큰 + 프로필 재조회)
  const refresh = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser(await buildUser(auth.currentUser));
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, resendVerification, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
