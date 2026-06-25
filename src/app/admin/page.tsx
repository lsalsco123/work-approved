"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listAllPermits, PermitRecord, PermitStatus,
} from "@/lib/permits";
import { listTemplates, deleteTemplate, createTemplate, PermitTemplate } from "@/lib/templates";
import { createCompanyAccount, listCompanyAccounts, CompanyAccount } from "@/lib/accounts";
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

  // 업체(게스트) 계정 관리
  const [accounts, setAccounts] = useState<CompanyAccount[]>([]);
  const [acctBusy, setAcctBusy] = useState(false);
  const [showAcctForm, setShowAcctForm] = useState(false);
  const [acctCompany, setAcctCompany] = useState("");
  const [acctId, setAcctId] = useState("");
  const [acctPw, setAcctPw] = useState("");

  const fetchAccounts = async () => {
    try { setAccounts(await listCompanyAccounts()); }
    catch (e) { console.error("업체 계정 조회 실패:", e); }
  };

  useEffect(() => { if (user?.role === "admin") fetchAccounts(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateAccount = async () => {
    if (acctBusy) return;
    setAcctBusy(true);
    try {
      await createCompanyAccount(acctId, acctCompany, acctPw);
      alert(`업체 계정이 생성되었습니다.\n업체: ${acctCompany}\n아이디: ${acctId}`);
      setAcctCompany(""); setAcctId(""); setAcctPw(""); setShowAcctForm(false);
      await fetchAccounts();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? "";
      const msg = code === "auth/email-already-in-use" ? "이미 존재하는 아이디입니다."
        : code === "auth/weak-password" ? "비밀번호는 6자 이상이어야 합니다."
        : code === "auth/invalid-email" ? "사용할 수 없는 아이디입니다."
        : (e as Error)?.message ?? String(e);
      alert("계정 생성 실패: " + msg);
    } finally { setAcctBusy(false); }
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

      <div className="page">
        {/* 업체(외주) 계정 관리 */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title" style={{ color: "#0369a1" }}>업체 계정 관리</span>
            <span className="panel-sub">외주업체별로 개별 로그인 계정을 발급합니다. (업체는 자기 허가서만 조회·작성)</span>
            <div className="grow" />
            <button className="mini" onClick={() => setShowAcctForm((s) => !s)}>{showAcctForm ? "닫기" : "+ 업체 계정 생성"}</button>
          </div>

          {showAcctForm && (
            <div className="form-row">
              <label className="field">
                <span>업체명</span>
                <input className="inp" style={{ width: 180 }} value={acctCompany} onChange={(e) => setAcctCompany(e.target.value)} placeholder="예: 신우기전" />
              </label>
              <label className="field">
                <span>로그인 아이디</span>
                <input className="inp" style={{ width: 160 }} value={acctId} onChange={(e) => setAcctId(e.target.value)} placeholder="예: sinwoo" autoComplete="off" />
              </label>
              <label className="field">
                <span>초기 비밀번호 (6자 이상)</span>
                <input className="inp" style={{ width: 160 }} type="text" value={acctPw} onChange={(e) => setAcctPw(e.target.value)} placeholder="업체에 전달할 비밀번호" autoComplete="new-password" />
              </label>
              <button className="mini btn-accent" disabled={acctBusy} onClick={handleCreateAccount}>
                {acctBusy ? "생성 중…" : "계정 생성"}
              </button>
            </div>
          )}

          {accounts.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>아직 발급된 업체 계정이 없습니다. “+ 업체 계정 생성”으로 추가하세요.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {accounts.map((a) => (
                <div key={a.uid} className="tagcard">
                  <span className="lead">{a.company || "(업체명 없음)"}</span>
                  <span className="meta">아이디 {a.loginId}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title" style={{ color: "#6d28d9" }}>예시 양식 관리</span>
            <span className="panel-sub">외주업체가 작성 화면에서 불러오는 예시입니다.</span>
            <div className="grow" />
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
                <div key={t.id} className="tagcard">
                  <span className="lead">{t.name}</span>
                  <button className="mini" disabled={tplBusy} onClick={() => router.push(`/fill?template=${t.id}`)}>수정</button>
                  <button className="mini danger" disabled={tplBusy} onClick={() => removeTemplate(t)}>삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-head">
          <h2>접수 현황</h2>
          <div className="grow" />
          <button className="mini" onClick={fetchAll} disabled={fetching}>↻ 새로고침</button>
        </div>
        <div className="kpi-row">
          {([
            { k: "submitted", label: "제출됨", color: "#b45309" },
            { k: "approved", label: "승인완료", color: "#15803d" },
            { k: "rejected", label: "반려됨", color: "#dc2626" },
            { k: "completed", label: "완료", color: "#475569" },
          ] as { k: PermitStatus; label: string; color: string }[]).map((c) => (
            <button
              key={c.k}
              className={`kpi-card ${filter === c.k ? "on" : ""}`}
              style={{ borderTopColor: c.color }}
              onClick={() => setFilter(c.k)}
              aria-pressed={filter === c.k}
            >
              <span className="kpi-num">{count(c.k)}</span>
              <span className="kpi-label">{c.label}</span>
            </button>
          ))}
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
                  <th style={{ width: 130 }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td data-label="번호" style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{p.id.slice(0, 8)}</td>
                    <td data-label="업체명" style={{ fontWeight: 600 }}>{p.company || p.createdByEmail}</td>
                    <td data-label="작업내용" className="cell-ellipsis" style={{ maxWidth: 260 }}>
                      {p.data.workContent || "-"}
                    </td>
                    <td data-label="작업일자">{p.data.workDate || "-"}</td>
                    <td data-label="상태">
                      <span className={`chip chip-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                    </td>
                    <td data-label="제출일시" style={{ fontSize: 12 }}>{tsToStr(p.submittedAt)}</td>
                    <td className="act">
                      <button
                        className="mini"
                        onClick={() => router.push(`/fill?id=${p.id}`)}
                        style={p.status === "submitted" ? { background: "#0a2240", color: "#fff" } : undefined}
                      >
                        {p.status === "submitted" ? "검토/처리" : "보기/출력"}
                      </button>
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
