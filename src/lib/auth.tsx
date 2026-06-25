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

export type UserRole = "guest" | "admin";
export type AccountStatus = "pending" | "active" | "blocked";

export interface AuthUser {
  uid: string;
  email: string;
  role: UserRole;
  company: string;
  status: AccountStatus;      // legacy(상태 없음)는 active 로 승격해 호환
  emailVerified: boolean;
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

  const buildUser = async (fbUser: import("firebase/auth").User): Promise<AuthUser> => {
    let role: UserRole = "guest";
    let company = "";
    let status: AccountStatus = "active";
    try {
      const snap = await Promise.race([
        getDoc(doc(db, "users", fbUser.uid)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
      ]);
      const d = (snap as Awaited<ReturnType<typeof getDoc>>).data() as
        { role?: UserRole; company?: string; status?: AccountStatus } | undefined;
      role = d?.role ?? "guest";
      company = d?.company ?? "";
      status = d?.status ?? "active"; // 상태 필드 없는 legacy 계정은 active 취급
    } catch { /* 프로필 조회 실패 시 최소 정보로 진행 */ }
    return {
      uid: fbUser.uid,
      email: toDisplayId(fbUser.email ?? ""),
      role,
      company,
      status,
      emailVerified: fbUser.emailVerified,
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
