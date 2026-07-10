"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import BuiltBy from "@/components/BuiltBy";
import { ProfileErrorRetry } from "@/components/AccessGate";
import { listChainPermits, deletePermit, PermitRecord, PermitStatus } from "@/lib/permits";
import SheetTable, { SheetColumn } from "@/components/SheetTable";
import { tsToStr, tsToDateOnly } from "@/lib/dateFmt";
import ProgressChain from "@/components/ProgressChain";

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

const KIND_LABEL: Record<string, string> = { requester: "담당자", safety: "환경안전", factory: "공장장" };
const STAGE_LABEL: Record<string, string> = { manager: "담당자 1차", safety: "환경안전", factory: "공장장 최종", done: "완료" };

export default function ManagerPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [listTruncated, setListTruncated] = useState(false);
  const [filter, setFilter] = useState<"all" | PermitStatus>("submitted");
  const [permitBusyId, setPermitBusyId] = useState("");

  // 조회 날짜 범위 — 제출일시/작업일자 각각 독립 지정, 시스템관리자 화면과 동일한 방식.
  const [subFrom, setSubFrom] = useState("");
  const [subTo, setSubTo] = useState("");
  const [wdFrom, setWdFrom] = useState("");
  const [wdTo, setWdTo] = useState("");
  const resetDateFilters = () => { setSubFrom(""); setSubTo(""); setWdFrom(""); setWdTo(""); };

  useEffect(() => {
    if (loading || user?.profileError) return; // 프로필 조회 실패 시엔 오판 리다이렉트 대신 재시도 화면
    if (!user) { router.replace("/login"); return; }
    if (user.role === "admin") { router.replace("/admin"); return; }
    if (user.role === "guest") { router.replace("/my"); return; }
  }, [user, loading, router]);

  const fetchPermits = async () => {
    if (user?.role !== "manager") return;
    setFetching(true); setLoadError(false);
    try {
      const { permits, truncated } = await listChainPermits(user.managerKind, user.managerName);
      setPermits(permits);
      setListTruncated(truncated);
    }
    catch (e) { console.error("결재 목록 조회 실패:", e); setLoadError(true); }
    setFetching(false);
  };
  useEffect(() => { fetchPermits(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user) {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }
  if (user.profileError) return <ProfileErrorRetry />;
  if (user.role !== "manager") {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }

  const isMyTurn = (p: PermitRecord) =>
    p.status === "submitted" && (
      (user.managerKind === "requester" && p.stage === "manager") ||
      (user.managerKind === "factory" && p.stage === "factory")
    );
  const filtered = permits.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (subFrom || subTo) {
      const sd = tsToDateOnly(p.submittedAt);
      if (!sd) return false;
      if (subFrom && sd < subFrom) return false;
      if (subTo && sd > subTo) return false;
    }
    if (wdFrom || wdTo) {
      const wd = p.data.workDate || "";
      if (!wd) return false;
      if (wdFrom && wd < wdFrom) return false;
      if (wdTo && wd > wdTo) return false;
    }
    return true;
  });
  const count = (s: PermitStatus) => permits.filter((p) => p.status === s).length;
  const myTurnCount = permits.filter(isMyTurn).length;
  const canDelete = user.managerKind === "requester";

  const removePermit = async (p: PermitRecord) => {
    if (!window.confirm(`"${p.company || p.createdByEmail}" 허가서(${p.data.workContent || "-"})를 완전히 삭제할까요?\n삭제 후 되돌릴 수 없습니다.`)) return;
    setPermitBusyId(p.id);
    try { await deletePermit(p.id); await fetchPermits(); }
    catch (e) { alert("삭제 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setPermitBusyId(""); }
  };
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
      key: "status", header: "상태", width: 190, wrap: true,
      copyText: (p) => {
        const parts = [STATUS_LABEL[p.status]];
        if (p.status === "submitted" && p.stage) parts.push(STAGE_LABEL[p.stage]);
        if (isMyTurn(p)) parts.push("내 차례");
        return parts.join(" / ");
      },
      render: (p) => (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          {p.status === "submitted" ? (
            <ProgressChain stage={p.stage} status={p.status} />
          ) : (
            <span className={`chip chip-${p.status}`}>{STATUS_LABEL[p.status]}</span>
          )}
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
      key: "action", header: "", width: canDelete ? 160 : 90, noSelect: true,
      copyText: () => "",
      render: (p) => (
        <div className="cellbtns">
          <button className={`mini ${isMyTurn(p) ? "btn-accent" : ""}`} onClick={() => router.push(`/fill?id=${p.id}`)}>
            {isMyTurn(p) ? "결재" : "보기"}
          </button>
          {canDelete && (
            <button className="mini danger" disabled={permitBusyId === p.id} onClick={() => removePermit(p)}>삭제</button>
          )}
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

        {listTruncated && (
          <p className="note note-warn" style={{ marginBottom: 10 }}>
            <span className="ico">⚠</span>
            최근 {permits.length}건만 불러왔습니다 — 이보다 오래된 허가서는 날짜 필터를 조정해도 표시되지 않을 수 있습니다.
          </p>
        )}

        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.k} className={`mini ${filter === f.k ? "btn-accent" : ""}`} onClick={() => setFilter(f.k)}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#475569" }}>제출일시</span>
          <input type="date" className="inp" style={{ width: 130 }} value={subFrom} onChange={(e) => setSubFrom(e.target.value)} />
          <span style={{ color: "#94a3b8" }}>~</span>
          <input type="date" className="inp" style={{ width: 130 }} value={subTo} onChange={(e) => setSubTo(e.target.value)} />
          <span style={{ fontSize: 13, color: "#475569", marginLeft: 12 }}>작업일자</span>
          <input type="date" className="inp" style={{ width: 130 }} value={wdFrom} onChange={(e) => setWdFrom(e.target.value)} />
          <span style={{ color: "#94a3b8" }}>~</span>
          <input type="date" className="inp" style={{ width: 130 }} value={wdTo} onChange={(e) => setWdTo(e.target.value)} />
          <button className="mini" onClick={resetDateFilters}>초기화</button>
          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{filtered.length}건</span>
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
