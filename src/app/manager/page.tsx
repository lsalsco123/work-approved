"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import BuiltBy from "@/components/BuiltBy";
import { listChainPermits, PermitRecord, PermitStatus } from "@/lib/permits";
import SheetTable, { SheetColumn } from "@/components/SheetTable";

const STATUS_LABEL: Record<PermitStatus, string> = {
  draft: "임시저장", submitted: "승인 대기", approved: "승인", rejected: "반려됨", completed: "완료",
};
const FILTERS: { k: "all" | PermitStatus; label: string }[] = [
  { k: "all", label: "전체" },
  { k: "submitted", label: "승인 대기" },
  { k: "approved", label: "승인" },
  { k: "rejected", label: "반려" },
  { k: "completed", label: "지난(완료)" },
];

function tsToStr(ts: unknown): string {
  if (!ts) return "-";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
    + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

const KIND_LABEL: Record<string, string> = { requester: "담당자", safety: "환경안전", factory: "공장장" };
const STAGE_LABEL: Record<string, string> = { manager: "담당자 1차", safety: "환경안전", factory: "공장장 최종", done: "완료" };

export default function ManagerPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"all" | PermitStatus>("submitted");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role === "admin") { router.replace("/admin"); return; }
    if (user.role === "guest") { router.replace("/my"); return; }
  }, [user, loading, router]);

  const fetchPermits = async () => {
    if (user?.role !== "manager") return;
    setFetching(true); setLoadError(false);
    try { setPermits(await listChainPermits(user.managerKind, user.managerName)); }
    catch (e) { console.error("결재 목록 조회 실패:", e); setLoadError(true); }
    setFetching(false);
  };
  useEffect(() => { fetchPermits(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user || user.role !== "manager") {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }

  const isMyTurn = (p: PermitRecord) =>
    p.status === "submitted" && (
      (user.managerKind === "requester" && p.stage === "manager") ||
      (user.managerKind === "factory" && p.stage === "factory")
    );
  const filtered = permits.filter((p) => filter === "all" || p.status === filter);
  const count = (s: PermitStatus) => permits.filter((p) => p.status === s).length;
  const myTurnCount = permits.filter(isMyTurn).length;
  const permitCols: SheetColumn<PermitRecord>[] = [
    {
      key: "company", header: "업체", width: 200,
      copyText: (p) => p.company || p.createdByEmail,
      render: (p) => <span style={{ fontWeight: 600 }}>{p.company || p.createdByEmail}</span>,
    },
    {
      key: "workContent", header: "작업내용", width: 280,
      copyText: (p) => p.data.workContent || "-",
    },
    {
      key: "workDate", header: "작업일자", width: 110,
      copyText: (p) => p.data.workDate || "-",
    },
    {
      key: "status", header: "상태", width: 160, wrap: true,
      copyText: (p) => {
        const parts = [STATUS_LABEL[p.status]];
        if (p.status === "submitted" && p.stage) parts.push(STAGE_LABEL[p.stage]);
        if (isMyTurn(p)) parts.push("내 차례");
        return parts.join(" / ");
      },
      render: (p) => (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <span className={`chip chip-${p.status}`}>{STATUS_LABEL[p.status]}</span>
          {p.status === "submitted" && p.stage && <span style={{ fontSize: 11, color: "#64748b" }}>{STAGE_LABEL[p.stage]}</span>}
          {isMyTurn(p) && <span className="chip chip-submitted">내 차례</span>}
        </div>
      ),
    },
    {
      key: "submittedAt", header: "제출일시", width: 120,
      copyText: (p) => tsToStr(p.submittedAt),
      render: (p) => <span style={{ fontSize: 12 }}>{tsToStr(p.submittedAt)}</span>,
    },
    {
      key: "action", header: "", width: 90, noSelect: true,
      copyText: () => "",
      render: (p) => (
        <div className="cellbtns">
          <button className={`mini ${isMyTurn(p) ? "btn-accent" : ""}`} onClick={() => router.push(`/fill?id=${p.id}`)}>
            {isMyTurn(p) ? "결재" : "보기"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="layout">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>결재 — {KIND_LABEL[user.managerKind] || "관리자"}{user.managerName ? ` · ${user.managerName}` : ""}</h1>
        <div className="spacer" />
        <span style={{ fontSize: 12, opacity: 0.75 }}>{user.email}</span>
        <button onClick={fetchPermits} disabled={fetching}>↻ 새로고침</button>
        <button onClick={() => { logout(); router.replace("/login"); }}>로그아웃</button>
      </header>

      <div className="page">
        <div className="page-head">
          <h2>결재함</h2>
          <span className="sub"><b style={{ color: "#b45309" }}>내 차례 {myTurnCount}</b> · 대기 {count("submitted")} · 승인 {count("approved")} · 반려 {count("rejected")} · 완료 {count("completed")}</span>
        </div>

        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.k} className={`mini ${filter === f.k ? "btn-accent" : ""}`} onClick={() => setFilter(f.k)}>
              {f.label}
            </button>
          ))}
        </div>

        {fetching ? (
          <div className="loading"><span className="spinner" />불러오는 중…</div>
        ) : loadError ? (
          <p className="note note-error"><span className="ico">⚠</span>목록을 불러오지 못했습니다.</p>
        ) : filtered.length === 0 ? (
          <div className="empty-rich"><div className="t">해당 상태의 결재 건이 없습니다.</div></div>
        ) : (
          <SheetTable columns={permitCols} rows={filtered} rowKey={(p) => p.id} />
        )}
      </div>
      <BuiltBy />
    </div>
  );
}
