"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import BuiltBy from "@/components/BuiltBy";
import { ProfileErrorRetry } from "@/components/AccessGate";
import {
  listAllPermits, deletePermit, PermitRecord, PermitStatus,
} from "@/lib/permits";
import { listTemplates, deleteTemplate, createTemplate, PermitTemplate } from "@/lib/templates";
import { listCompanyAccounts, adminApprove, adminDeleteAccount, adminSetPassword, adminSetRole, adminSetProfile, sendResetEmail, CompanyAccount } from "@/lib/accounts";
import { MANAGERS } from "@/lib/managers";
import { DEFAULT_TEMPLATES } from "@/lib/samples";
import { getAttachConfigs, setAttachConfig, getCommonFormFiles, setCommonFormFiles, AttachConfigMap, FormTemplateFile } from "@/lib/appConfig";
import { uploadFormTemplate, deleteFormTemplate, MAX_FORM_TEMPLATE_BYTES } from "@/lib/formTemplateFiles";
import { WORK_TYPES } from "@/lib/form";
import SheetTable, { SheetColumn } from "@/components/SheetTable";

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

// YYYY-MM-DD (로컬 기준) — <input type="date"> 값 및 날짜 범위 비교용
function dateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function tsToDateOnly(ts: unknown): string {
  if (!ts) return "";
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return dateOnly(d);
}

export default function AdminPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"all" | PermitStatus>("submitted");
  const [search, setSearch] = useState("");
  // 접수 현황 날짜 범위 — 제출일시/작업일자 각각 독립 지정, 둘 다 또는 하나만 적용 가능.
  // 기본값: 작업일자는 미지정, 제출일시는 당월 1일~오늘.
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [subFrom, setSubFrom] = useState(dateOnly(monthStart));
  const [subTo, setSubTo] = useState(dateOnly(today));
  const [wdFrom, setWdFrom] = useState("");
  const [wdTo, setWdTo] = useState("");
  const [templates, setTemplates] = useState<PermitTemplate[]>([]);
  const [tplBusy, setTplBusy] = useState(false);

  useEffect(() => {
    if (loading || user?.profileError) return; // 프로필 조회 실패 시엔 오판 리다이렉트 대신 재시도 화면
    if (!user || user.role !== "admin") router.replace("/login");
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
    // 이미 등록된 작업형태는 건너뛰고 미등록 기본 양식만 생성한다(중복 방지).
    const existing = new Set(templates.map((t) => t.workType));
    const toCreate = DEFAULT_TEMPLATES.filter((t) => !existing.has(t.workType));
    if (toCreate.length === 0) { alert("모든 기본 작업형태 예시가 이미 등록되어 있습니다."); return; }
    if (!window.confirm(`미등록 기본 예시 ${toCreate.length}종을 생성할까요?`)) return;
    setTplBusy(true);
    try {
      for (const t of toCreate) await createTemplate(t, user.email);
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

  const [permitBusyId, setPermitBusyId] = useState("");
  const removePermit = async (p: PermitRecord) => {
    if (!window.confirm(`"${p.company || p.createdByEmail}" 허가서(${p.data.workContent || "-"})를 완전히 삭제할까요?\n삭제 후 되돌릴 수 없습니다.`)) return;
    setPermitBusyId(p.id);
    try { await deletePermit(p.id); await fetchAll(); }
    catch (e) { alert("삭제 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setPermitBusyId(""); }
  };

  // 업체(게스트) 계정 관리 — 업체는 셀프 회원가입, 관리자는 승인/차단/비번 관리
  const [accounts, setAccounts] = useState<CompanyAccount[]>([]);
  const [acctLoading, setAcctLoading] = useState(true);
  const [acctError, setAcctError] = useState("");
  const [busyUid, setBusyUid] = useState<string>("");
  const [acctSearch, setAcctSearch] = useState("");
  const [acctStatusFilter, setAcctStatusFilter] = useState("all");
  const [acctRoleFilter, setAcctRoleFilter] = useState("all");
  const [acctPage, setAcctPage] = useState(0);
  const ACCT_PAGE_SIZE = 10;

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

  useEffect(() => { setAcctPage(0); }, [acctSearch, acctStatusFilter, acctRoleFilter]);

  const onApprove = (a: CompanyAccount) => run(a.uid, () => adminApprove(a.uid), `${a.company}${a.name ? ` ${a.name}` : ""} 계정을 승인했습니다.`);
  const onDelete = (a: CompanyAccount) => {
    if (!confirm(`${a.company || a.email} 계정을 완전히 삭제할까요?\n로그인 계정과 프로필이 영구 삭제됩니다. (작성한 허가서 문서는 보존)`)) return;
    run(a.uid, () => adminDeleteAccount(a.uid), "계정을 삭제했습니다.");
  };
  const onSetPassword = (a: CompanyAccount) => {
    const pw = window.prompt(`${a.company} 계정의 새 비밀번호 (6자 이상):`);
    if (pw == null) return;
    run(a.uid, () => adminSetPassword(a.uid, pw), "비밀번호를 변경했습니다. 업체에 전달하세요.");
  };
  const onResetEmail = (a: CompanyAccount) =>
    run(a.uid, () => sendResetEmail(a.email), `${a.email} 로 비밀번호 재설정 메일을 보냈습니다.`);
  const onEditProfile = (a: CompanyAccount) => {
    const company = window.prompt("업체명/소속:", a.company || "");
    if (company == null) return;
    const name = window.prompt("이름:", a.name || "");
    if (name == null) return;
    run(a.uid, () => adminSetProfile(a.uid, company, name), "업체명/이름을 수정했습니다.");
  };

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
  const RoleSelect = ({ a }: { a: CompanyAccount }) => {
    const isSelf = a.uid === user?.uid;
    // 미인증/승인대기 계정을 매니저·관리자로 승격하면 검증 절차를 건너뛰고 즉시 전체 접근이 열림.
    const notReady = a.status !== "active" || !a.emailVerified;
    return (
      <select
        className="inp" style={{ width: 160, fontSize: 12 }} value={roleValue(a)}
        disabled={busyUid === a.uid || isSelf}
        title={isSelf ? "본인 역할은 변경할 수 없습니다." : notReady ? "승인·이메일인증 완료 후 역할을 지정하세요." : undefined}
        onChange={(e) => {
          if (e.target.value !== "guest" && notReady
              && !window.confirm("아직 승인/이메일 인증이 완료되지 않은 계정입니다. 그래도 역할을 지정할까요?")) {
            return;
          }
          onSetRole(a, e.target.value);
        }}
      >
        <option value="guest">업체</option>
        <option value="admin">시스템관리자</option>
        <option value="factory">관리자·공장장</option>
        <optgroup label="관리자·담당자">
          {MANAGERS.map((m) => <option key={m.name} value={`req:${m.name}`}>{m.name} ({m.dept})</option>)}
        </optgroup>
      </select>
    );
  };

  const pending = accounts.filter((a) => a.status === "pending");
  const others = accounts.filter((a) => a.status !== "pending");

  // 작업형태별 첨부 설정(필요 서류 안내 + 업로드 칸 표시) — 예시 양식 관리에 통합
  const wtLabel = (wt: string) => WORK_TYPES.find((w) => w.v === wt)?.label.split(" (")[0] ?? wt;
  const [attachCfgs, setAttachCfgs] = useState<AttachConfigMap>({});
  const [attachWT, setAttachWT] = useState("");        // 편집 중인 작업형태
  const [attachText, setAttachText] = useState("");
  const [attachUpload, setAttachUpload] = useState(true);
  const [attachBusy, setAttachBusy] = useState(false);
  const fetchAttachCfgs = async () => {
    try { setAttachCfgs(await getAttachConfigs()); }
    catch (e) { console.error("첨부 설정 조회 실패:", e); }
  };
  useEffect(() => { if (user?.role === "admin") fetchAttachCfgs(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectAttachWT = (wt: string) => {
    setAttachWT(wt);
    const c = attachCfgs[wt];
    setAttachText((c?.items ?? []).join("\n"));
    setAttachUpload(c?.upload !== false);
  };
  const saveAttach = async () => {
    if (!attachWT || !user) return;
    const items = attachText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    setAttachBusy(true);
    try { await setAttachConfig(attachWT, { items, upload: attachUpload }, user.email); await fetchAttachCfgs(); alert(`${wtLabel(attachWT)} 첨부 설정을 저장했습니다.`); }
    catch (e) { alert("저장 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setAttachBusy(false); }
  };

  // 공통 양식 파일 — 작업형태와 무관하게 일괄 업로드, 업체는 작성 화면에서 "양식 목록"으로 다운로드.
  const [commonFiles, setCommonFiles] = useState<FormTemplateFile[]>([]);
  const [commonBusy, setCommonBusy] = useState(false);
  const fetchCommonFiles = async () => {
    try { setCommonFiles(await getCommonFormFiles()); }
    catch (e) { console.error("공통 양식 조회 실패:", e); }
  };
  useEffect(() => { if (user?.role === "admin") fetchCommonFiles(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const uploadCommonFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setCommonBusy(true);
    try {
      const metas: FormTemplateFile[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_FORM_TEMPLATE_BYTES) { alert(`${file.name}: 파일이 너무 큽니다(최대 25MB).`); continue; }
        metas.push(await uploadFormTemplate("common", file));
      }
      if (metas.length === 0) return;
      const next = [...commonFiles, ...metas];
      await setCommonFormFiles(next, user.email);
      setCommonFiles(next);
    } catch (e) { alert("업로드 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setCommonBusy(false); }
  };
  const removeCommonFile = async (f: FormTemplateFile) => {
    if (!user) return;
    if (!window.confirm(`'${f.name}' 양식 파일을 삭제할까요?`)) return;
    setCommonBusy(true);
    try {
      await deleteFormTemplate(f);
      const next = commonFiles.filter((x) => x.path !== f.path);
      await setCommonFormFiles(next, user.email);
      setCommonFiles(next);
    } catch (e) { alert("삭제 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setCommonBusy(false); }
  };

  const count = (s: PermitStatus) => permits.filter((p) => p.status === s).length;

  const filtered = permits.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.company.toLowerCase().includes(q) && !(p.data.workContent ?? "").toLowerCase().includes(q)) return false;
    }
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
  const resetDateFilters = () => {
    setSubFrom(dateOnly(monthStart)); setSubTo(dateOnly(today));
    setWdFrom(""); setWdTo("");
  };

  // ── 엑셀형 표 컬럼 정의 ─────────────────────────────────────────────
  const roleLabel = (a: CompanyAccount) =>
    a.role === "admin" ? "시스템관리자"
      : a.role !== "manager" ? "업체"
        : a.managerKind === "factory" ? "관리자·공장장"
          : `관리자·담당자(${a.managerName})`;
  const acctStatusLabel = (a: CompanyAccount) =>
    a.status === "pending" ? "승인대기" : a.status === "blocked" ? "차단" : "활성";

  const acctRows = [...pending, ...others];
  const filteredAccts = acctRows.filter((a) => {
    if (acctSearch) {
      const q = acctSearch.toLowerCase();
      if (!a.company.toLowerCase().includes(q) && !(a.name || "").toLowerCase().includes(q)) return false;
    }
    if (acctStatusFilter !== "all" && a.status !== acctStatusFilter) return false;
    if (acctRoleFilter !== "all" && a.role !== acctRoleFilter) return false;
    return true;
  });
  const acctPageCount = Math.max(1, Math.ceil(filteredAccts.length / ACCT_PAGE_SIZE));
  const acctPageRows = filteredAccts.slice(acctPage * ACCT_PAGE_SIZE, (acctPage + 1) * ACCT_PAGE_SIZE);

  const acctCols: SheetColumn<CompanyAccount>[] = [
    { key: "company", header: "업체명/소속", width: 130, copyText: (a) => a.company || "(없음)" },
    { key: "name", header: "이름", width: 90, copyText: (a) => a.name || "-" },
    { key: "email", header: "이메일(아이디)", width: 200, copyText: (a) => a.email },
    {
      key: "status", header: "상태", width: 150, wrap: true,
      copyText: (a) => `${acctStatusLabel(a)}${a.emailVerified ? "/인증" : "/미인증"}`,
      render: (a) => (
        <div className="cellchips">
          <span className={`chip chip-${a.status === "pending" ? "submitted" : a.status === "blocked" ? "rejected" : "approved"}`}>{acctStatusLabel(a)}</span>
          {a.role === "admin" && <span className="chip chip-approved">시스템관리자</span>}
          {!a.emailVerified && <span className="chip chip-submitted">이메일 미인증</span>}
        </div>
      ),
    },
    { key: "role", header: "역할", width: 180, noSelect: true, wrap: true, copyText: roleLabel, render: (a) => <RoleSelect a={a} /> },
    {
      key: "act", header: "처리", width: 230, noSelect: true, wrap: true, copyText: () => "",
      render: (a) => {
        const isSelf = a.uid === user?.uid;
        return (
          <div className="cellbtns">
            {a.status === "pending"
              ? <button className="mini btn-approve" disabled={busyUid === a.uid || !a.emailVerified} title={a.emailVerified ? "" : "이메일 인증 후 승인 가능"} onClick={() => onApprove(a)}>승인</button>
              : <button className="mini" disabled={busyUid === a.uid} onClick={() => onSetPassword(a)}>비번 변경</button>}
            <button className="mini" disabled={busyUid === a.uid} onClick={() => onEditProfile(a)}>정보수정</button>
            <button className="mini" disabled={busyUid === a.uid} onClick={() => onResetEmail(a)}>재설정 메일</button>
            <button className="mini btn-reject" disabled={busyUid === a.uid || isSelf} title={isSelf ? "본인 계정은 삭제할 수 없습니다." : undefined} onClick={() => onDelete(a)}>삭제</button>
          </div>
        );
      },
    },
  ];

  // 예시 양식: 작업형태별로 등록 여부를 표시 (JSA 레퍼런스와 동일한 방식)
  const tplByType = (wt: string): PermitTemplate | undefined => templates.find((t) => t.workType === wt);
  type TplTypeRow = { v: string; label: string };
  const tplTypeRows: TplTypeRow[] = WORK_TYPES.filter((w) => w.v !== "etc").map((w) => ({ v: w.v, label: w.label.split(" (")[0] }));
  const tplCols: SheetColumn<TplTypeRow>[] = [
    { key: "label", header: "작업형태", width: 220, copyText: (w) => w.label },
    {
      key: "status", header: "등록상태", width: 120, wrap: true,
      copyText: (w) => (tplByType(w.v) ? "등록됨" : "미등록"),
      render: (w) => <span className={`chip ${tplByType(w.v) ? "chip-approved" : "chip-draft"}`}>{tplByType(w.v) ? "등록됨" : "미등록"}</span>,
    },
    {
      key: "act", header: "예시 양식", width: 170, noSelect: true, wrap: true, copyText: () => "",
      render: (w) => {
        const t = tplByType(w.v);
        return (
          <div className="cellbtns">
            {t
              ? <button className="mini" disabled={tplBusy} onClick={() => router.push(`/fill?template=${t.id}`)}>수정</button>
              : <button className="mini btn-accent" disabled={tplBusy} onClick={() => router.push(`/fill?templateNew=1&wt=${w.v}`)}>작성</button>}
            {t && <button className="mini danger" disabled={tplBusy} onClick={() => removeTemplate(t)}>삭제</button>}
          </div>
        );
      },
    },
    {
      key: "attach", header: "첨부 안내", width: 220, noSelect: true, wrap: true,
      copyText: (w) => `${attachCfgs[w.v]?.upload !== false ? "업로드표시" : "업로드숨김"} / 안내 ${attachCfgs[w.v]?.items?.length ?? 0}줄`,
      render: (w) => {
        const c = attachCfgs[w.v];
        const on = c?.upload !== false;
        const n = c?.items?.length ?? 0;
        return (
          <div className="cellbtns" style={{ alignItems: "center" }}>
            <span className={`chip ${on ? "chip-approved" : "chip-draft"}`}>{on ? "업로드 표시" : "업로드 숨김"}</span>
            {n > 0 && <span style={{ fontSize: 11, color: "#64748b" }}>안내 {n}줄</span>}
            <button className={`mini ${attachWT === w.v ? "btn-accent" : ""}`} disabled={attachBusy} onClick={() => selectAttachWT(w.v)}>{attachWT === w.v ? "편집 중" : "설정"}</button>
          </div>
        );
      },
    },
  ];

  const permitCols: SheetColumn<PermitRecord>[] = [
    { key: "no", header: "번호", width: 90, copyText: (p) => p.id.slice(0, 8) },
    { key: "company", header: "업체명", width: 130, copyText: (p) => p.company || p.createdByEmail },
    { key: "work", header: "작업내용", width: 280, copyText: (p) => p.data.workContent || "-" },
    { key: "date", header: "작업일자", width: 110, copyText: (p) => p.data.workDate || "-" },
    { key: "status", header: "상태", width: 100, wrap: true, copyText: (p) => STATUS_LABEL[p.status],
      render: (p) => <span className={`chip chip-${p.status}`}>{STATUS_LABEL[p.status]}</span> },
    { key: "submitted", header: "제출일시", width: 120, copyText: (p) => tsToStr(p.submittedAt) },
    { key: "act", header: "처리", width: 190, noSelect: true, wrap: true, copyText: () => "",
      render: (p) => (
        <div className="cellbtns">
          <button className="mini" onClick={() => router.push(`/fill?id=${p.id}`)} style={p.status === "submitted" ? { background: "#0a2240", color: "#fff" } : undefined}>
            {p.status === "submitted" ? "검토/처리" : "보기/출력"}
          </button>
          <button className="mini danger" disabled={permitBusyId === p.id} onClick={() => removePermit(p)}>삭제</button>
        </div>
      ) },
  ];

  if (loading || !user) return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  if (user.profileError) return <ProfileErrorRetry />;

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
        <div style={{ marginBottom: 16 }}>
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

          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#475569" }}>제출일시</span>
            <input type="date" className="inp" style={{ width: 130 }} value={subFrom} onChange={(e) => setSubFrom(e.target.value)} />
            <span style={{ color: "#94a3b8" }}>~</span>
            <input type="date" className="inp" style={{ width: 130 }} value={subTo} onChange={(e) => setSubTo(e.target.value)} />
            <span style={{ fontSize: 13, color: "#475569", marginLeft: 12 }}>작업일자</span>
            <input type="date" className="inp" style={{ width: 130 }} value={wdFrom} onChange={(e) => setWdFrom(e.target.value)} />
            <span style={{ color: "#94a3b8" }}>~</span>
            <input type="date" className="inp" style={{ width: 130 }} value={wdTo} onChange={(e) => setWdTo(e.target.value)} />
            <button className="mini" onClick={resetDateFilters}>기본값</button>
            <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{filtered.length}건</span>
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
            <SheetTable columns={permitCols} rows={filtered} rowKey={(p) => p.id} />
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-head">
              <span className="panel-title" style={{ color: "#6d28d9" }}>예시 양식 관리</span>
              <span className="panel-sub">작업형태별로 예시 양식(작성/수정)과 첨부 안내(필요 서류·업로드 칸 표시)를 설정합니다. 업체는 선택한 작업형태에 따라 안내를 보게 됩니다.</span>
              <div className="grow" />
              <button className="mini" disabled={tplBusy} onClick={seedDefaults}>{tplBusy ? "생성 중…" : "기본 예시 일괄 생성"}</button>
            </div>

            <div style={{ marginBottom: 12, padding: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fbfcfe" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>공통 양식 파일</b>
                <span className="sheet-hint" style={{ margin: 0 }}>작업형태와 무관하게 모든 업체가 작성 화면에서 "양식 목록" 버튼으로 다운로드할 수 있습니다. (파일당 최대 25MB, 저장 버튼 없이 즉시 반영)</span>
                <div className="grow" />
                <label className="mini btn-accent" style={{ cursor: commonBusy ? "not-allowed" : "pointer" }}>
                  {commonBusy ? "처리 중…" : "양식 추가"}
                  <input type="file" multiple style={{ display: "none" }} disabled={commonBusy}
                    onChange={(e) => { uploadCommonFiles(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              {commonFiles.length === 0 ? (
                <p className="sheet-hint" style={{ margin: 0 }}>등록된 공통 양식 파일이 없습니다.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {commonFiles.map((f) => (
                    <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontSize: 13, fontWeight: 600 }}>📄 {f.name}</a>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{(f.size / 1024 / 1024).toFixed(2)}MB</span>
                      <button className="mini danger" disabled={commonBusy} onClick={() => removeCommonFile(f)}>삭제</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SheetTable columns={tplCols} rows={tplTypeRows} rowKey={(w) => w.v} />
            {attachWT && (
              <div style={{ marginTop: 12, padding: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fbfcfe" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <b style={{ fontSize: 13 }}>{wtLabel(attachWT)} — 첨부 안내 설정</b>
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={attachUpload} onChange={(e) => setAttachUpload(e.target.checked)} />
                    첨부 업로드 칸 표시
                  </label>
                  <div className="grow" />
                  <button className="mini btn-accent" disabled={attachBusy} onClick={saveAttach}>{attachBusy ? "저장 중…" : "저장"}</button>
                  <button className="mini" disabled={attachBusy} onClick={() => setAttachWT("")}>닫기</button>
                </div>
                <textarea
                  className="inp"
                  style={{ width: "100%", minHeight: 110, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
                  placeholder={"필요 서류를 한 줄에 하나씩 (또는 쉼표로 구분)\n예)\n작업계획서\nMSDS(물질안전보건자료)\n보험증권 사본"}
                  value={attachText}
                  onChange={(e) => setAttachText(e.target.value)}
                />
                <p className="sheet-hint" style={{ marginTop: 6 }}>“업로드 칸 표시”를 끄면 해당 작업형태에서는 업체에게 첨부 업로드 칸이 보이지 않습니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* 업체(외주) 계정 관리 — 업체 셀프 회원가입 / 관리자 승인·차단·비번관리 */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title" style={{ color: "#0369a1" }}>계정 관리</span>
            <span className="panel-sub">업체/관리자 모두 회원가입 후, 여기서 역할(업체·관리자) 분류 및 승인·차단·비밀번호를 관리합니다.</span>
            <div className="grow" />
            <button className="mini" onClick={fetchAccounts} disabled={acctLoading}>↻ 새로고침</button>
          </div>

          {acctError && <p className="note note-error" style={{ marginBottom: 10 }}><span className="ico">⚠</span>{acctError}</p>}

          {pending.length > 0 && <p className="sheet-hint">승인 대기 {pending.length}건 — 이메일 인증이 완료된 계정만 “승인”할 수 있습니다. (셀을 드래그해 선택 후 Ctrl/⌘+C로 복사)</p>}

          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input className="inp" style={{ width: 170 }} placeholder="업체/이름 검색"
              value={acctSearch} onChange={(e) => setAcctSearch(e.target.value)} />
            <select className="inp" style={{ width: 110 }} value={acctStatusFilter} onChange={(e) => setAcctStatusFilter(e.target.value)}>
              <option value="all">상태 전체</option>
              <option value="pending">승인대기</option>
              <option value="active">활성</option>
              <option value="blocked">차단</option>
            </select>
            <select className="inp" style={{ width: 130 }} value={acctRoleFilter} onChange={(e) => setAcctRoleFilter(e.target.value)}>
              <option value="all">역할 전체</option>
              <option value="guest">업체</option>
              <option value="manager">관리자</option>
              <option value="admin">시스템관리자</option>
            </select>
            <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{filteredAccts.length}건</span>
          </div>

          {acctLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>불러오는 중…</p>
          ) : (
            <SheetTable
              columns={acctCols}
              rows={acctPageRows}
              rowKey={(a) => a.uid}
              emptyText="해당하는 계정이 없습니다."
            />
          )}
          {acctPageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 10 }}>
              <button className="mini" disabled={acctPage === 0} onClick={() => setAcctPage(0)}>«</button>
              <button className="mini" disabled={acctPage === 0} onClick={() => setAcctPage((p) => p - 1)}>‹</button>
              <span style={{ fontSize: 13, color: "#475569", minWidth: 80, textAlign: "center" }}>{acctPage + 1} / {acctPageCount} 페이지</span>
              <button className="mini" disabled={acctPage >= acctPageCount - 1} onClick={() => setAcctPage((p) => p + 1)}>›</button>
              <button className="mini" disabled={acctPage >= acctPageCount - 1} onClick={() => setAcctPage(acctPageCount - 1)}>»</button>
            </div>
          )}
        </div>
      </div>
      <BuiltBy />
    </div>
  );
}
