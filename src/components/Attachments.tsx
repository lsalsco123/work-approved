"use client";
import React, { useRef, useState } from "react";
import {
  PermitAttachment, uploadAttachment, removeAttachment, getAttachmentSignedUrl, formatBytes, MAX_ATTACHMENT_BYTES,
} from "@/lib/attachments";

// 첨부파일 섹션. 여러 파일 업로드 + 목록/다운로드/삭제.
// permitId 가 없으면(신규 임시저장 전) ensureId()로 먼저 draft 를 생성해 id 를 확보한다.
export default function Attachments({
  permitId, ensureId, uid, canUpload, value, onChange, requiredDocs = [], uploadEnabled = true,
}: {
  permitId: string | null;
  ensureId: () => Promise<string | null>;
  uid: string;
  canUpload: boolean;
  value: PermitAttachment[];
  onChange: (next: PermitAttachment[]) => void;
  requiredDocs?: string[];
  uploadEnabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 열람은 항상 새로 발급받은 단기 서명 URL로만 한다 (저장된 att.url 은 레거시 필드, 신뢰하지 않음).
  // 팝업 차단을 피하려고 클릭 시점에 빈 탭을 먼저 열고, URL을 받으면 그 탭의 위치를 옮긴다.
  const handleOpen = async (att: PermitAttachment) => {
    if (!permitId) return;
    const win = window.open("", "_blank");
    setMsg(""); setOpeningPath(att.path);
    try {
      const url = await getAttachmentSignedUrl(permitId, att.path);
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      win?.close();
      setMsg("파일 열기 실패: " + ((e as { message?: string })?.message || e));
    } finally {
      setOpeningPath(null);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setMsg(""); setBusy(true);
    try {
      let id = permitId;
      if (!id) id = await ensureId();
      if (!id) { setMsg("업로드 전 임시저장이 필요합니다. 다시 시도해주세요."); return; }
      const added: PermitAttachment[] = [];
      const skipped: string[] = [];
      for (const f of Array.from(files)) {
        if (f.size > MAX_ATTACHMENT_BYTES) { skipped.push(`${f.name}(용량초과)`); continue; }
        const meta = await uploadAttachment(id, f, uid);
        added.push(meta);
      }
      if (added.length) onChange([...value, ...added]);
      setMsg(
        (added.length ? `${added.length}개 업로드 완료.` : "") +
        (skipped.length ? ` 제외: ${skipped.join(", ")} (최대 25MB)` : "")
      );
    } catch (e) {
      setMsg("업로드 실패: " + ((e as { message?: string })?.message || e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (att: PermitAttachment) => {
    if (!permitId) return;
    if (!window.confirm(`'${att.name}' 파일을 삭제할까요?`)) return;
    setMsg(""); setBusy(true);
    try {
      await removeAttachment(permitId, att);
      onChange(value.filter((a) => a.path !== att.path));
    } catch (e) {
      setMsg("삭제 실패: " + ((e as { message?: string })?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {requiredDocs.length > 0 && (
        <div style={{ fontSize: 13, color: "#334155" }}>
          <b>필요 서류</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {requiredDocs.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      {canUpload && uploadEnabled && (
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
            style={{ fontSize: 13 }}
          />
          {busy && <span style={{ marginLeft: 8, fontSize: 12, color: "#f59e0b" }}>업로드 중…</span>}
        </div>
      )}

      {value.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {value.map((att) => (
            <li
              key={att.path}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", background: "#f8fafc",
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  onClick={() => handleOpen(att)}
                  disabled={openingPath === att.path}
                  style={{ border: "none", background: "none", padding: 0, color: "#2563eb", cursor: openingPath === att.path ? "wait" : "pointer", font: "inherit" }}
                >
                  📎 {att.name}{openingPath === att.path ? " (여는 중…)" : ""}
                </button>
                <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{formatBytes(att.size)}</span>
              </span>
              {canUpload && (
                <button
                  type="button"
                  onClick={() => handleRemove(att)}
                  disabled={busy}
                  style={{
                    border: "none", background: "transparent", color: "#ef4444",
                    cursor: "pointer", fontSize: 13, padding: "2px 4px",
                  }}
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>첨부된 파일이 없습니다.</p>
      )}

      {msg && <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>{msg}</p>}
    </div>
  );
}
