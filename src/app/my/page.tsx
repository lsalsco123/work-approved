"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import BuiltBy from "@/components/BuiltBy";
import AccessGate from "@/components/AccessGate";
import { listMyPermits, deletePermit, PermitRecord, PermitStatus } from "@/lib/permits";
import { tsToStr, tsToDateOnly } from "@/lib/dateFmt";
import ProgressChain from "@/components/ProgressChain";

const STATUS_LABEL: Record<PermitStatus, { text: string; color: string }> = {
  draft:     { text: "임시저장", color: "#94a3b8" },
  submitted: { text: "제출됨",   color: "#f59e0b" },
  approved:  { text: "승인완료", color: "#22c55e" },
  rejected:  { text: "반려됨",   color: "#ef4444" },
  completed: { text: "완료",     color: "#64748b" },
};

export default function MyPage() {
  return <AccessGate><MyDashboard /></AccessGate>;
}

function MyDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [permitBusyId, setPermitBusyId] = useState("");

  // 조회 날짜 범위 — 제출일시/작업일자 각각 독립 지정, 관리자 화면과 동일한 방식.
  const [subFrom, setSubFrom] = useState("");
  const [subTo, setSubTo] = useState("");
  const [wdFrom, setWdFrom] = useState("");
  const [wdTo, setWdTo] = useState("");
  const resetDateFilters = () => { setSubFrom(""); setSubTo(""); setWdFrom(""); setWdTo(""); };

  // 게스트 전용. 미로그인→로그인, 관리자→관리자 화면, 담당자/공장장→관리자 결재함.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "admin") router.replace("/admin");
    else if (user.role === "manager") router.replace("/manager");
  }, [user, loading, router]);

  const fetchMine = async () => {
    if (user?.role !== "guest") return;
    setFetching(true);
    setLoadError(false);
    try { setPermits(await listMyPermits(user.uid)); }
    catch (e) { console.error("내 허가서 조회 실패:", e); setLoadError(true); }
    setFetching(false);
  };
  useEffect(() => { fetchMine(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const removePermit = async (p: PermitRecord) => {
    if (!window.confirm(`"${p.data.workContent || "-"}" 허가서를 완전히 삭제할까요?\n삭제 후 되돌릴 수 없습니다.`)) return;
    setPermitBusyId(p.id);
    try { await deletePermit(p.id); await fetchMine(); }
    catch (e) { alert("삭제 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setPermitBusyId(""); }
  };

  if (loading || !user || user.role !== "guest") {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }

  const rejected = permits.filter((p) => p.status === "rejected").length;

  const filtered = permits.filter((p) => {
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

  return (
    <div className="layout">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>내 작업허가서</h1>
        <div className="spacer" />
        <span style={{ fontSize: 12, opacity: 0.75, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.company ? `${user.company} · ` : ""}{user.email}
        </span>
        <button onClick={() => { logout(); router.replace("/login"); }}>로그아웃</button>
      </header>

      <div className="page-narrow">
        <div className="page-head">
          <h2>작성 내역</h2>
          {!fetching && !loadError && permits.length > 0 && (
            <span className="sub">총 {permits.length}건</span>
          )}
          <button className="mini" onClick={fetchMine} disabled={fetching}>↻ 새로고침</button>
          <div className="grow" />
          <button className="mini btn-accent" onClick={() => window.location.assign("/fill")}>+ 새 허가서 작성</button>
        </div>

        {!fetching && !loadError && permits.length > 0 && (
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
        )}

        {rejected > 0 && (
          <div className="no-print note note-warn" style={{ marginBottom: 12 }}>
            <span className="ico">⚠</span>
            <div>
              <span>반려된 허가서가 <strong>{rejected}건</strong> 있습니다. 내용을 수정한 뒤 다시 제출해 주세요.</span>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {permits.filter((p) => p.status === "rejected").map((p) => (
                  <li key={p.id} style={{ fontSize: 13 }}>
                    {p.data.workContent || "-"}{p.adminNote ? ` — ${p.adminNote}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {fetching ? (
          <div className="loading"><span className="spinner" />불러오는 중…</div>
        ) : loadError ? (
          <div className="empty-rich">
            <div className="t" style={{ color: "#b91c1c" }}>목록을 불러오지 못했습니다.</div>
            <button className="mini" onClick={() => location.reload()}>다시 시도</button>
          </div>
        ) : permits.length === 0 ? (
          <div className="empty-rich">
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M9 13h6M9 17h4" />
            </svg>
            <div className="t">아직 작성한 허가서가 없습니다.</div>
            <button className="mini btn-accent" onClick={() => window.location.assign("/fill")}>+ 첫 허가서 작성하기</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-rich"><div className="t">조건에 맞는 허가서가 없습니다.</div></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>작업일자</th>
                  <th>작업내용</th>
                  <th style={{ width: 190 }}>상태</th>
                  <th style={{ width: 120 }}>최종수정</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const st = STATUS_LABEL[p.status];
                  const editable = p.status === "draft" || p.status === "rejected";
                  return (
                    <tr key={p.id}>
                      <td data-label="작업일자">{p.data.workDate || "-"}</td>
                      <td data-label="작업내용" className="cell-ellipsis" style={{ maxWidth: 360 }}>
                        {p.data.workContent || "-"}
                      </td>
                      <td data-label="상태">
                        {p.status === "submitted" ? (
                          <ProgressChain stage={p.stage} status={p.status} />
                        ) : (
                          <span className={`chip chip-${p.status}`}>{st.text}</span>
                        )}
                      </td>
                      <td data-label="최종수정" style={{ fontSize: 12, color: "#64748b" }}>{tsToStr(p.updatedAt)}</td>
                      <td className="act">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button className="mini" onClick={() => router.push(`/fill?id=${p.id}`)}>
                            {editable ? "수정" : "보기"}
                          </button>
                          <button className="mini danger" disabled={permitBusyId === p.id} onClick={() => removePermit(p)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <BuiltBy />
    </div>
  );
}
