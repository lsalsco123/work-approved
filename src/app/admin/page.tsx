"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  listAllPermits, PermitRecord, PermitStatus,
} from "@/lib/permits";
import { listTemplates, deleteTemplate, createTemplate, PermitTemplate } from "@/lib/templates";
import { listCompanyAccounts, adminApprove, adminSetBlocked, adminSetPassword, adminSetRole, sendResetEmail, CompanyAccount } from "@/lib/accounts";
import { MANAGERS } from "@/lib/managers";
import { DEFAULT_TEMPLATES } from "@/lib/samples";
import { listJsaRefs, getJsaRef, saveJsaRef, deleteJsaRef } from "@/lib/jsaRefs";
import { WORK_TYPES } from "@/lib/form";
import { JsaRow } from "@/lib/types";
import JsaEditor from "@/components/JsaEditor";

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

  // 업체(게스트) 계정 관리 — 업체는 셀프 회원가입, 관리자는 승인/차단/비번 관리
  const [accounts, setAccounts] = useState<CompanyAccount[]>([]);
  const [acctLoading, setAcctLoading] = useState(true);
  const [acctError, setAcctError] = useState("");
  const [busyUid, setBusyUid] = useState<string>("");

  const fetchAccounts = async () => {
    setAcctLoading(true); setAcctError("");
    try { setAccounts(await listCompanyAccounts()); }
    catch (e) {
      console.error("업체 계정 조회 실패:", e);
      setAcctError("계정 목록을 불러오지 못했습니다. (Cloud Function 배포 여부를 확인하세요)");
    } finally { setAcctLoading(false); }
  };

  useEffect(() => { if (user?.role === "admin") fetchAccounts(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (uid: string, fn: () => Promise<void>, okMsg?: string) => {
    if (busyUid) return;
    setBusyUid(uid);
    try { await fn(); if (okMsg) alert(okMsg); await fetchAccounts(); }
    catch (e: unknown) { alert("처리 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setBusyUid(""); }
  };

  const onApprove = (a: CompanyAccount) => run(a.uid, () => adminApprove(a.uid), `${a.company} 계정을 승인했습니다.`);
  const onToggleBlock = (a: CompanyAccount) => {
    const blocking = a.status !== "blocked";
    if (blocking && !confirm(`${a.company} 계정을 차단할까요? 차단 시 로그인·제출이 막힙니다.`)) return;
    run(a.uid, () => adminSetBlocked(a.uid, blocking), blocking ? "차단했습니다." : "차단을 해제했습니다.");
  };
  const onSetPassword = (a: CompanyAccount) => {
    const pw = window.prompt(`${a.company} 계정의 새 비밀번호 (6자 이상):`);
    if (pw == null) return;
    run(a.uid, () => adminSetPassword(a.uid, pw), "비밀번호를 변경했습니다. 업체에 전달하세요.");
  };
  const onResetEmail = (a: CompanyAccount) =>
    run(a.uid, () => sendResetEmail(a.email), `${a.email} 로 비밀번호 재설정 메일을 보냈습니다.`);

  // 역할 분류: 업체 / 시스템관리자 / 관리자(담당자·공장장)
  const roleValue = (a: CompanyAccount) =>
    a.role === "admin" ? "admin"
      : a.role !== "manager" ? "guest"
        : a.managerKind === "factory" ? "factory"
          : `req:${a.managerName}`;
  const onSetRole = (a: CompanyAccount, v: string) => {
    if (v === roleValue(a)) return;
    if (v === "guest") return run(a.uid, () => adminSetRole(a.uid, "guest"), "업체로 변경했습니다.");
    if (v === "admin") return run(a.uid, () => adminSetRole(a.uid, "admin"), "시스템관리자로 지정했습니다.");
    if (v === "factory") return run(a.uid, () => adminSetRole(a.uid, "manager", "factory", "이태훈"), "공장장으로 지정했습니다.");
    if (v.startsWith("req:")) return run(a.uid, () => adminSetRole(a.uid, "manager", "requester", v.slice(4)), "담당자로 지정했습니다.");
  };
  const RoleSelect = ({ a }: { a: CompanyAccount }) => (
    <select className="inp" style={{ width: 160, fontSize: 12 }} value={roleValue(a)} disabled={busyUid === a.uid} onChange={(e) => onSetRole(a, e.target.value)}>
      <option value="guest">업체</option>
      <option value="admin">시스템관리자</option>
      <option value="factory">관리자·공장장</option>
      <optgroup label="관리자·담당자">
        {MANAGERS.map((m) => <option key={m.name} value={`req:${m.name}`}>{m.name} ({m.dept})</option>)}
      </optgroup>
    </select>
  );

  const pending = accounts.filter((a) => a.status === "pending");
  const others = accounts.filter((a) => a.status !== "pending");

  // 작업형태별 JSA 레퍼런스 관리
  const [refTypes, setRefTypes] = useState<string[]>([]);     // 레퍼런스가 등록된 작업형태 키
  const [refWT, setRefWT] = useState<string>("");             // 편집 중인 작업형태
  const [refRows, setRefRows] = useState<JsaRow[]>([]);
  const [refBusy, setRefBusy] = useState(false);

  const fetchRefTypes = async () => {
    try { setRefTypes((await listJsaRefs()).map((r) => r.workType)); }
    catch (e) { console.error("JSA 레퍼런스 목록 조회 실패:", e); }
  };
  useEffect(() => { if (user?.role === "admin") fetchRefTypes(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRefWT = async (wt: string) => {
    setRefWT(wt);
    if (!wt) { setRefRows([]); return; }
    setRefBusy(true);
    try { const r = await getJsaRef(wt); setRefRows(r?.rows ?? []); }
    catch { setRefRows([]); }
    finally { setRefBusy(false); }
  };
  const saveRef = async () => {
    if (!refWT || !user) return;
    setRefBusy(true);
    try { await saveJsaRef(refWT, refRows, user.email); alert("JSA 레퍼런스를 저장했습니다."); await fetchRefTypes(); }
    catch (e) { alert("저장 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setRefBusy(false); }
  };
  const removeRef = async () => {
    if (!refWT || !confirm("이 작업형태의 JSA 레퍼런스를 삭제할까요?")) return;
    setRefBusy(true);
    try { await deleteJsaRef(refWT); setRefRows([]); await fetchRefTypes(); }
    catch (e) { alert("삭제 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setRefBusy(false); }
  };
  const refWTLabel = (wt: string) => WORK_TYPES.find((w) => w.v === wt)?.label.split(" (")[0] ?? wt;

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
        {/* 업체(외주) 계정 관리 — 업체 셀프 회원가입 / 관리자 승인·차단·비번관리 */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title" style={{ color: "#0369a1" }}>업체 계정 관리</span>
            <span className="panel-sub">업체/관리자 모두 회원가입 후, 여기서 역할(업체·관리자) 분류 및 승인·차단·비밀번호를 관리합니다.</span>
            <div className="grow" />
            <button className="mini" onClick={fetchAccounts} disabled={acctLoading}>↻ 새로고침</button>
          </div>

          {acctError && <p className="note note-error" style={{ marginBottom: 10 }}><span className="ico">⚠</span>{acctError}</p>}

          {/* 승인 대기 */}
          {pending.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309", marginBottom: 8 }}>승인 대기 {pending.length}건</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pending.map((a) => (
                  <div key={a.uid} className="acct-row">
                    <div className="acct-info">
                      <span className="lead">{a.company || "(업체명 없음)"}</span>
                      <span className="meta">{a.email}</span>
                      <span className={`chip ${a.emailVerified ? "chip-approved" : "chip-submitted"}`}>{a.emailVerified ? "이메일 인증됨" : "이메일 미인증"}</span>
                      <RoleSelect a={a} />
                    </div>
                    <div className="acct-actions">
                      <button className="mini btn-approve" disabled={busyUid === a.uid || !a.emailVerified} title={a.emailVerified ? "" : "이메일 인증 후 승인 가능"} onClick={() => onApprove(a)}>승인</button>
                      <button className="mini" disabled={busyUid === a.uid} onClick={() => onResetEmail(a)}>재설정 메일</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 활성/차단 계정 */}
          {acctLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>불러오는 중…</p>
          ) : others.length === 0 && pending.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>아직 가입한 업체가 없습니다. 업체가 로그인 화면의 “업체 회원가입”으로 가입합니다.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {others.map((a) => (
                <div key={a.uid} className="acct-row">
                  <div className="acct-info">
                    <span className="lead">{a.company || "(업체명 없음)"}</span>
                    <span className="meta">{a.email}</span>
                    <span className={`chip chip-${a.status === "blocked" ? "rejected" : "approved"}`}>{a.status === "blocked" ? "차단됨" : "활성"}</span>
                    {!a.emailVerified && <span className="chip chip-submitted">이메일 미인증</span>}
                    <RoleSelect a={a} />
                  </div>
                  <div className="acct-actions">
                    <button className="mini" disabled={busyUid === a.uid} onClick={() => onSetPassword(a)}>비번 변경</button>
                    <button className="mini" disabled={busyUid === a.uid} onClick={() => onResetEmail(a)}>재설정 메일</button>
                    <button className={`mini ${a.status === "blocked" ? "btn-approve" : "btn-reject"}`} disabled={busyUid === a.uid} onClick={() => onToggleBlock(a)}>
                      {a.status === "blocked" ? "차단 해제" : "차단"}
                    </button>
                  </div>
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

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title" style={{ color: "#0d9488" }}>작업형태별 JSA 레퍼런스</span>
            <span className="panel-sub">작업형태마다 미리 작성해두면 업체가 작성 화면에서 “레퍼런스 불러오기”로 채웁니다.</span>
          </div>
          <div className="form-row" style={{ alignItems: "center" }}>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <span>작업형태</span>
              <select className="inp" style={{ width: 200 }} value={refWT} onChange={(e) => selectRefWT(e.target.value)}>
                <option value="">선택…</option>
                {WORK_TYPES.filter((w) => w.v !== "etc").map((w) => (
                  <option key={w.v} value={w.v}>{w.label.split(" (")[0]}{refTypes.includes(w.v) ? " ✓" : ""}</option>
                ))}
              </select>
            </label>
            {refWT && (
              <>
                <button className="mini btn-accent" disabled={refBusy} onClick={saveRef}>{refBusy ? "처리 중…" : "저장"}</button>
                {refTypes.includes(refWT) && <button className="mini danger" disabled={refBusy} onClick={removeRef}>삭제</button>}
              </>
            )}
          </div>
          {refWT ? (
            <div style={{ marginTop: 4 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#64748b" }}>
                <b>{refWTLabel(refWT)}</b> 레퍼런스 — 단계/작업종류는 자유 입력입니다(이 영역은 관리자 작성용).
              </p>
              <JsaEditor rows={refRows} onChange={setRefRows} />
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
              작업형태를 선택하면 해당 JSA 레퍼런스를 작성/수정할 수 있습니다. {refTypes.length > 0 && `(등록됨: ${refTypes.map(refWTLabel).join(", ")})`}
            </p>
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
