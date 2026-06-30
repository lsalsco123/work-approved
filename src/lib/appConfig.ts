"use client";
// 앱 운영 설정 — 작업형태별 "첨부 필요 서류 안내" + 업로드 칸 표시 여부.
// 단일 문서 appConfig/attachments 의 byType 맵에 작업형태별 설정을 저장한다.
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export interface AttachTypeConfig {
  items: string[];   // 필요 서류 안내 목록
  upload: boolean;   // 첨부 업로드 칸 표시 여부
}
export type AttachConfigMap = Record<string, AttachTypeConfig>;

const COL = "appConfig";
const ID = "attachments";

// 작업형태별 첨부 설정 전체를 읽는다. (로그인 사용자 모두)
export async function getAttachConfigs(): Promise<AttachConfigMap> {
  const snap = await getDoc(doc(db, COL, ID));
  if (!snap.exists()) return {};
  const byType = (snap.data() as { byType?: unknown }).byType;
  if (!byType || typeof byType !== "object") return {};
  const out: AttachConfigMap = {};
  for (const [k, v] of Object.entries(byType as Record<string, { items?: unknown; upload?: unknown }>)) {
    const items = Array.isArray(v?.items) ? v.items.filter((x): x is string => typeof x === "string") : [];
    const upload = v?.upload !== false; // 미설정 시 기본 표시
    out[k] = { items, upload };
  }
  return out;
}

// 특정 작업형태 첨부 설정 저장 (관리자 전용 — rules 가 admin 쓰기를 강제).
// merge:true 로 다른 작업형태 설정은 보존된다.
export async function setAttachConfig(workType: string, cfg: AttachTypeConfig, email: string): Promise<void> {
  await setDoc(
    doc(db, COL, ID),
    { byType: { [workType]: { items: cfg.items, upload: cfg.upload } }, updatedAt: serverTimestamp(), updatedBy: email },
    { merge: true },
  );
}
