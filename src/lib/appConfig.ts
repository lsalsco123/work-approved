"use client";
// 앱 운영 설정 — 작업형태별 "첨부 필요 서류 안내" + 업로드 칸 표시 여부.
// 단일 문서 appConfig/attachments 의 byType 맵에 작업형태별 설정을 저장한다.
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// 관리자가 미리 올려두는 예시 양식 파일 메타 (Storage: formTemplates/{workType}/...)
export interface FormTemplateFile {
  name: string;        // 원본 파일명
  path: string;        // Storage 전체 경로
  url: string;         // 다운로드 URL
  size: number;        // 바이트
  contentType: string; // MIME
}

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
    {
      byType: { [workType]: { items: cfg.items, upload: cfg.upload } },
      updatedAt: serverTimestamp(),
      updatedBy: email,
    },
    { merge: true },
  );
}

// 공통 양식 파일 목록 — 작업형태와 무관하게 모든 업체가 작성 화면에서 다운로드할 수 있다.
export async function getCommonFormFiles(): Promise<FormTemplateFile[]> {
  const snap = await getDoc(doc(db, COL, ID));
  if (!snap.exists()) return [];
  const arr = (snap.data() as { commonFormFiles?: unknown }).commonFormFiles;
  if (!Array.isArray(arr)) return [];
  return arr.filter((f): f is FormTemplateFile => !!f && typeof f === "object" && typeof (f as FormTemplateFile).url === "string");
}

// 공통 양식 파일 목록 저장 (관리자 전용).
export async function setCommonFormFiles(files: FormTemplateFile[], email: string): Promise<void> {
  await setDoc(
    doc(db, COL, ID),
    { commonFormFiles: files, updatedAt: serverTimestamp(), updatedBy: email },
    { merge: true },
  );
}
