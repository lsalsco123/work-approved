"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type UserRole = "guest" | "admin";

export interface AuthUser {
  uid: string;
  email: string;
  role: UserRole;
  company: string;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const FAKE_DOMAIN = "@alsco.permit";
const toFbEmail = (id: string) => id.includes("@") ? id : id + FAKE_DOMAIN;
const toDisplayId = (fbEmail: string) =>
  fbEmail.endsWith(FAKE_DOMAIN) ? fbEmail.slice(0, -FAKE_DOMAIN.length) : fbEmail;

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof (auth as any).onAuthStateChanged !== "function") {
      setLoading(false);
      return;
    }
    const timeout = setTimeout(() => setLoading(false), 5000);
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(timeout);
      if (fbUser) {
        try {
          const snap = await Promise.race([
            getDoc(doc(db, "users", fbUser.uid)),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
          ]);
          const d = (snap as Awaited<ReturnType<typeof getDoc>>).data() as { role?: UserRole; company?: string } | undefined;
          setUser({
            uid: fbUser.uid,
            email: toDisplayId(fbUser.email!),
            role: d?.role ?? "guest",
            company: d?.company ?? "",
          });
        } catch {
          setUser({ uid: fbUser.uid, email: toDisplayId(fbUser.email!), role: "guest", company: "" });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, toFbEmail(email), password);
  };

  const logout = async () => signOut(auth);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
