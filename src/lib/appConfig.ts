"use client";
// 앱 운영 설정 — 관리자가 작성 화면에 노출할 "첨부 필요 서류" 안내 목록 등.
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const ATTACH_DOC = ["appConfig", "attachments"] as const;

// 업체 작성 화면 첨부 섹션에 안내할 "필요 서류" 목록을 읽는다. (로그인 사용자 모두 읽기 가능)
export async function getRequiredDocs(): Promise<string[]> {
  const snap = await getDoc(doc(db, ATTACH_DOC[0], ATTACH_DOC[1]));
  if (!snap.exists()) return [];
  const items = (snap.data() as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter((x): x is string => typeof x === "string") : [];
}

// 필요 서류 목록 저장 (관리자 전용 — rules 가 admin 쓰기를 강제).
export async function setRequiredDocs(items: string[], email: string): Promise<void> {
  await setDoc(
    doc(db, ATTACH_DOC[0], ATTACH_DOC[1]),
    { items, updatedAt: serverTimestamp(), updatedBy: email },
    { merge: true },
  );
}
