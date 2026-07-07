"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import BuiltBy from "@/components/BuiltBy";
import AccessGate from "@/components/AccessGate";
import { listMyPermits, PermitRecord, PermitStatus, ChainStage } from "@/lib/permits";

const STATUS_LABEL: Record<PermitStatus, { text: string; color: string }> = {
  draft:     { text: "임시저장", color: "#94a3b8" },
  submitted: { text: "제출됨",   color: "#f59e0b" },
  approved:  { text: "승인완료", color: "#22c55e" },
  rejected:  { text: "반려됨",   color: "#ef4444" },
  completed: { text: "완료",     color: "#64748b" },
};

// 결재 진척 단계: 제출 → 담당자 1차 → 환경안전 → 공장장 최종(승인완료)
const CHAIN_STEPS = ["제출", "담당자", "환경안전", "공장장"] as const;
// stage(현재 '대기 중'인 단계) → 완료된 스텝 수. submitted+manage이면 제출(1)까지 끝, 담당자 결재 대기.
const STAGE_DONE: Record<ChainStage, number> = { manager: 1, safety: 2, factory: 3, done: 4 };

function ProgressChain({ stage, status }: { stage?: ChainStage; status: PermitStatus }) {
  // 승인완료/완료면 전 단계 완료, 그 외엔 stage 기준(미지정 legacy는 제출만 완료로 간주)
  const done = status === "approved" || status === "completed" ? 4 : STAGE_DONE[stage ?? "manager"] ?? 1;
  const pending = done < 4 ? done : -1; // 현재 진행(대기) 중인 스텝 인덱스
  return (
    <div style={{ minWidth: 168 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {CHAIN_STEPS.map((label, i) => {
          const isDone = i < done;
          const isNow = i === pending;
          const color = isDone ? "#22c55e" : isNow ? "#f59e0b" : "#cbd5e1";
          return (
            <React.Fragment key={label}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", background: color, flexShrink: 0,
                boxShadow: isNow ? "0 0 0 3px rgba(245,158,11,0.25)" : "none", transition: "background .2s" }} />
              {i < CHAIN_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 3, background: i < done - 1 ? "#22c55e" : "#e2e8f0", minWidth: 14 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
        {CHAIN_STEPS.map((label, i) => (
          <span key={label} style={{ color: i < done ? "#16a34a" : i === pending ? "#d97706" : "#94a3b8",
            fontWeight: i === pending ? 700 : 500 }}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function tsToStr(ts: unknown): string {
  if (!ts) return "-";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
    + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function MyPage() {
  return <AccessGate><MyDashboard /></AccessGate>;
}

function MyDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 게스트 전용. 미로그인→로그인, 관리자→관리자 화면.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "admin") router.replace("/admin");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "guest") return;
    (async () => {
      setFetching(true);
      setLoadError(false);
      try { setPermits(await listMyPermits(user.uid)); }
      catch (e) { console.error("내 허가서 조회 실패:", e); setLoadError(true); }
      setFetching(false);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user || user.role === "admin") {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }

  const rejected = permits.filter((p) => p.status === "rejected").length;

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
          <button className="mini" onClick={() => location.reload()} disabled={fetching}>↻ 새로고침</button>
          <div className="grow" />
          <button className="mini btn-accent" onClick={() => window.location.assign("/fill")}>+ 새 허가서 작성</button>
        </div>

        {rejected > 0 && (
          <div className="no-print note note-warn" style={{ marginBottom: 12 }}>
            <span className="ico">⚠</span>
            <span>반려된 허가서가 <strong>{rejected}건</strong> 있습니다. 내용을 수정한 뒤 다시 제출해 주세요.</span>
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
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>작업일자</th>
                  <th>작업내용</th>
                  <th style={{ width: 190 }}>상태</th>
                  <th style={{ width: 120 }}>최종수정</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {permits.map((p) => {
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
                        <button className="mini" onClick={() => router.push(`/fill?id=${p.id}`)}>
                          {editable ? "수정" : "보기"}
                        </button>
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
