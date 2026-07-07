"use client";
// 관리자가 작업형태별로 미리 올려두는 "예시 양식 파일" — Cloud Storage 업로드/삭제.
// 저장 경로: formTemplates/{workType}/{timestamp}_{safeName}
// 쓰기/삭제는 admin 커스텀 클레임 보유자만(Storage rules). 읽기는 로그인 사용자 전체.
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { storage, functions, auth } from "./firebase";
import type { FormTemplateFile } from "./appConfig";

export const MAX_FORM_TEMPLATE_BYTES = 25 * 1024 * 1024; // 25MB / 파일

function safeFileName(name: string): string {
  const base = name.replace(/[ -/\\?%*:|"<>]/g, "_").trim();
  return base.slice(0, 120) || "form";
}

// 업로드 전 현재 사용자의 admin 커스텀 클레임을 보장한다.
// (기존 관리자는 클레임이 없을 수 있어, 서버에서 role 을 확인해 클레임을 심고 토큰을 갱신한다.)
export async function ensureAdminClaim(): Promise<boolean> {
  const cur = auth.currentUser;
  if (!cur) throw new Error("로그인이 필요합니다.");
  // 이미 클레임이 있으면 스킵
  const tok = await cur.getIdTokenResult();
  if (tok.claims.admin === true) return true;
  // 서버에서 role 기반으로 클레임 동기화 후 토큰 강제 갱신
  const res = await httpsCallable(functions, "syncAdminClaim")();
  const isAdmin = !!(res.data as { admin?: boolean })?.admin;
  await cur.getIdToken(true); // 새 클레임을 담은 토큰으로 갱신
  return isAdmin;
}

// 예시 양식 파일 업로드 → Storage 저장 + 메타 반환. (appConfig 저장은 호출부에서 setAttachConfig 로)
export async function uploadFormTemplate(workType: string, file: File): Promise<FormTemplateFile> {
  if (file.size > MAX_FORM_TEMPLATE_BYTES) {
    throw new Error(`${file.name}: 파일이 너무 큽니다(최대 25MB).`);
  }
  await ensureAdminClaim();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `formTemplates/${workType}/${ts}_${rand}_${safeFileName(file.name)}`;
  const sref = ref(storage, path);
  await uploadBytes(sref, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(sref);
  return {
    name: file.name,
    path,
    url,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  };
}

// 예시 양식 파일 삭제 (Storage 객체 제거). 이미 없으면 무시.
export async function deleteFormTemplate(meta: FormTemplateFile): Promise<void> {
  await ensureAdminClaim();
  try {
    await deleteObject(ref(storage, meta.path));
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "storage/object-not-found") throw e;
  }
}
