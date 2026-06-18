"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listAllPermits, approvePermit, rejectPermit, completePermit,
  PermitRecord, PermitStatus,
} from "@/lib/permits";

const STATUS_LABEL: Record<PermitStatus, string> = {
  draft: "임시저장",
  submitted: "검토대기",
  approved: "승인완료",
  rejected: "반려됨",
  completed: "완료",
};

const TABS: { key: "all" | PermitStatus; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "submitted", label: "검토대기" },
  { key: "approved", label: "승인완료" },
  { key: "rejected", label: "반려됨" },
  { key: "completed", label: "완료" },
  { key: "draft", label: "임시저장" },
];

function tsToStr(ts: unknown): string {
  if (!ts) return "-";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
    + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState<"all" | PermitStatus>("submitted");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/login");
  }, [user, loading, router]);

  const fetchAll = async () => {
    setFetching(true);
    try { setPermits(await listAllPermits()); } catch {}
    setFetching(false);
  };

  useEffect(() => { if (user?.role === "admin") fetchAll(); }, [user]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setActing(id);
    try { await fn(); await fetchAll(); } catch (e) { alert("오류: " + e); }
    setActing(null);
  };

  const handleApprove = (p: PermitRecord) => {
    const name = window.prompt(`[${p.company}] 허가서를 승인합니다.\n승인자 성명:`, user?.email ?? "");
    if (name === null) return;
    act(p.id, () => approvePermit(p.id, name));
  };

  const handleComplete = (p: PermitRecord) => {
    if (window.confirm(`[${p.company}] 작업완료 처리하시겠습니까?`))
      act(p.id, () => completePermit(p.id));
  };

  const confirmReject = () => {
    if (!rejectTarget || !rejectNote.trim()) return;
    const id = rejectTarget;
    const note = rejectNote;
    setRejectTarget(null);
    act(id, () => rejectPermit(id, note));
  };

  const count = (s: PermitStatus) => permits.filter((p) => p.status === s).length;

  const filtered = permits.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.company.toLowerCase().includes(q) || (p.data.workContent ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  if (loading || !user) return <div style={{ padding: 24 }}>불러오는 중…</div>;

  return (
    <div className="layout">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>관리자 — 작업허가서 목록</h1>
        <div className="spacer" />
        <span style={{ fontSize: 13, opacity: 0.8 }}>{user.email}</span>
        <button onClick={() => { logout(); router.replace("/login"); }}>로그아웃</button>
      </header>

      <div style={{ padding: 16, maxWidth: 1280, margin: "0 auto" }}>
        {/* 요약 배지 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span className="stat-badge badge-submitted">검토대기 {count("submitted")}건</span>
          <span className="stat-badge badge-approved">승인완료 {count("approved")}건</span>
          <span className="stat-badge badge-rejected">반려 {count("rejected")}건</span>
          <span className="stat-badge badge-completed">완료 {count("completed")}건</span>
          <button className="mini" onClick={fetchAll} style={{ marginLeft: 4 }}>↻ 새로고침</button>
        </div>

        {/* 필터 + 검색 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="rolesw">
            {TABS.map((t) => (
              <button key={t.key} className={filter === t.key ? "on" : ""} onClick={() => setFilter(t.key)}>
                {t.label}
                {t.key !== "all" ? ` (${count(t.key as PermitStatus)})` : ` (${permits.length})`}
              </button>
            ))}
          </div>
          <input className="inp" style={{ width: 200 }} placeholder="업체명 / 작업내용 검색"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* 테이블 */}
        {fetching ? (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>해당 항목이 없습니다.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>번호</th>
                  <th style={{ width: 130 }}>업체명</th>
                  <th>작업내용</th>
                  <th style={{ width: 100 }}>작업일자</th>
                  <th style={{ width: 90 }}>상태</th>
                  <th style={{ width: 110 }}>제출일시</th>
                  <th style={{ width: 220 }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} style={{ opacity: acting === p.id ? 0.5 : 1 }}>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{p.id.slice(0, 8)}</td>
                    <td style={{ fontWeight: 600 }}>{p.company || p.createdByEmail}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.data.workContent || "-"}
                    </td>
                    <td>{p.data.workDate || "-"}</td>
                    <td>
                      <span className={`status-badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{tsToStr(p.submittedAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <a className="mini" href={`/fill?id=${p.id}`} target="_blank" rel="noreferrer">보기/출력</a>
                        {p.status === "submitted" && <>
                          <button className="mini primary" onClick={() => handleApprove(p)} disabled={!!acting}>승인</button>
                          <button className="mini danger" onClick={() => { setRejectTarget(p.id); setRejectNote(""); }} disabled={!!acting}>반려</button>
                        </>}
                        {p.status === "approved" && (
                          <button className="mini" onClick={() => handleComplete(p)} disabled={!!acting}>완료확인</button>
                        )}
                        {p.status === "rejected" && p.adminNote && (
                          <span style={{ fontSize: 11, color: "#ef4444" }} title={p.adminNote}>사유 있음</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 반려 사유 모달 */}
      {rejectTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 380, boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>반려 사유 입력</h3>
            <textarea className="inp" rows={3} style={{ resize: "vertical" }}
              placeholder="반려 사유를 입력하세요 (업체 확인용)"
              value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="mini" onClick={() => setRejectTarget(null)}>취소</button>
              <button className="mini danger" onClick={confirmReject} disabled={!rejectNote.trim()}>반려 확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
