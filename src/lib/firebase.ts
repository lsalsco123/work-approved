import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// SSR 프리렌더링 시 서버에서 실행되므로 window 체크로 클라이언트에서만 초기화
const isClient = typeof window !== "undefined";
const apiKey = process.env.NEXT_PUBLIC_FB_API_KEY;

const app = isClient && apiKey
  ? (getApps().length ? getApps()[0] : initializeApp({
      apiKey,
      authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID!,
      storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET!,
      messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID!,
      appId: process.env.NEXT_PUBLIC_FB_APP_ID!,
    }))
  : null;

export const auth = app ? getAuth(app) : ({} as ReturnType<typeof getAuth>);
export const db = app ? getFirestore(app, "default") : ({} as ReturnType<typeof getFirestore>);
// Cloud Functions(admin SDK 백엔드) — 기본 리전 us-central1 (functions setGlobalOptions와 일치)
export const functions = app ? getFunctions(app) : ({} as ReturnType<typeof getFunctions>);
