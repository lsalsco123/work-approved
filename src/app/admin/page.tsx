"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listAllPermits, approvePermit, rejectPermit, completePermit,
  PermitRecord, PermitStatus,
} from "@/lib/permits";
import { listTemplates, deleteTemplate, createTemplate, PermitTemplate } from "@/lib/templates";
import { DEFAULT_TEMPLATES } from "@/lib/samples";

const STATUS_LABEL: Record<PermitStatus, string> = {
  draft: "임시저장",
  submitted: "제출됨",
  approved: "승인완료",
  rejected: "반려됨",
  completed: "완료",
};

const TABS: { key: "all" | PermitStatus; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "submitted", label: "제출됨" },
  { key: "draft", label: "임시저장" },
  { key: "approved", label: "승인완료" },
  { key: "rejected", label: "반려됨" },
  { key: "completed", label: "완료" },
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
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"all" | PermitStatus>("submitted");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<PermitTemplate[]>([]);
  const [tplBusy, setTplBusy] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/login");
  }, [user, loading, router]);

  const fetchAll = async () => {
    setFetching(true);
    setLoadError(false);
    try { setPermits(await listAllPermits()); }
    catch (e) { console.error("목록 조회 실패:", e); setLoadError(true); }
    setFetching(false);
  };

  const fetchTemplates = async () => {
    try { setTemplates(await listTemplates()); }
    catch (e) { console.error("예시 양식 조회 실패:", e); }
  };

  useEffect(() => { if (user?.role === "admin") { fetchAll(); fetchTemplates(); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const seedDefaults = async () => {
    if (!user) return;
    if (!window.confirm(`기본 예시 양식 ${DEFAULT_TEMPLATES.length}종을 생성할까요?`)) return;
    setTplBusy(true);
    try {
      for (const t of DEFAULT_TEMPLATES) await createTemplate(t, user.email);
      await fetchTemplates();
    } catch (e) { alert("생성 실패: " + e); }
    finally { setTplBusy(false); }
  };

  const removeTemplate = async (t: PermitTemplate) => {
    if (!window.confirm(`"${t.name}" 예시 양식을 삭제할까요?`)) return;
    setTplBusy(true);
    try { await deleteTemplate(t.id); await fetchTemplates(); }
    catch (e) { alert("삭제 실패: " + e); }
    finally { setTplBusy(false); }
  };

  const [busyId, setBusyId] = useState<string | null>(null);

  const doApprove = async (p: PermitRecord) => {
    if (!user) return;
    if (!window.confirm(`[${p.company || p.createdByEmail}] 허가서를 승인하시겠습니까?`)) return;
    setBusyId(p.id);
    try { await approvePermit(p.id, user.email); await fetchAll(); }
    catch (e) { alert("승인 실패: " + e); }
    finally { setBusyId(null); }
  };

  const doReject = async (p: PermitRecord) => {
    if (!user) return;
    const note = window.prompt("반려 사유를 입력하세요 (작성자에게 표시됩니다):", "");
    if (note === null) return;
    setBusyId(p.id);
    try { await rejectPermit(p.id, note.trim()); await fetchAll(); }
    catch (e) { alert("반려 실패: " + e); }
    finally { setBusyId(null); }
  };

  const doComplete = async (p: PermitRecord) => {
    if (!window.confirm(`[${p.company || p.createdByEmail}] 작업완료 처리하시겠습니까?`)) return;
    setBusyId(p.id);
    try { await completePermit(p.id); await fetchAll(); }
    catch (e) { alert("완료 처리 실패: " + e); }
    finally { setBusyId(null); }
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

  if (loading || !user) return <div className="loading"><span className="spinner" />불러오는 중…</div>;

  return (
    <div className="layout">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>작업허가서 접수 내역</h1>
        <div className="spacer" />
        <span style={{ fontSize: 13, opacity: 0.8 }}>{user.email}</span>
        <button onClick={() => { logout(); router.replace("/login"); }}>로그아웃</button>
      </header>

      <div style={{ padding: 16, maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 16, background: "#faf5ff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14, color: "#6d28d9" }}>예시 양식 관리</strong>
            <span style={{ fontSize: 12, color: "#64748b" }}>외주업체가 작성 화면에서 불러오는 예시입니다.</span>
            <div style={{ flex: 1 }} />
            <button className="mini" onClick={() => router.push("/fill?templateNew=1")}>+ 새 예시 양식</button>
            {templates.length === 0 && (
              <button className="mini" disabled={tplBusy} onClick={seedDefaults}>{tplBusy ? "생성 중…" : "기본 예시 생성"}</button>
            )}
          </div>
          {templates.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
              아직 예시 양식이 없습니다. “기본 예시 생성”으로 작업형태별 기본 양식 7종을 만들 수 있어요.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {templates.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #e9d5ff", borderRadius: 8, padding: "6px 10px", background: "#fff" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                  <button className="mini" disabled={tplBusy} onClick={() => router.push(`/fill?template=${t.id}`)}>수정</button>
                  <button className="mini danger" disabled={tplBusy} onClick={() => removeTemplate(t)}>삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span className="stat-badge badge-submitted">제출됨 {count("submitted")}건</span>
          <span className="stat-badge badge-completed">완료 {count("completed")}건</span>
          <button className="mini" onClick={fetchAll} style={{ marginLeft: 4 }}>↻ 새로고침</button>
        </div>

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

        {fetching ? (
          <div className="loading"><span className="spinner" />불러오는 중…</div>
        ) : loadError ? (
          <div style={{ padding: 32, textAlign: "center", color: "#b91c1c" }}>
            목록을 불러오지 못했습니다.
            <div style={{ marginTop: 10 }}>
              <button className="mini" onClick={fetchAll}>다시 시도</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">해당 항목이 없습니다.</div>
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
                  <th style={{ width: 100 }}>보기</th>
                  <th style={{ width: 150 }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
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
                      <a className="mini" href={`/fill?id=${p.id}`} target="_blank" rel="noreferrer">보기/출력</a>
                    </td>
                    <td>
                      {busyId === p.id ? (
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>처리 중…</span>
                      ) : p.status === "submitted" ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="mini" style={{ background: "#16a34a", color: "#fff" }} onClick={() => doApprove(p)}>승인</button>
                          <button className="mini" style={{ background: "#ef4444", color: "#fff" }} onClick={() => doReject(p)}>반려</button>
                        </div>
                      ) : p.status === "approved" ? (
                        <button className="mini" onClick={() => doComplete(p)}>작업완료</button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#cbd5e1" }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
