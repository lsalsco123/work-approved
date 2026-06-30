"use client";
import React, { Suspense, useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useSearchParams, useRouter } from "next/navigation";
import { usePermit } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Section, Row, Text, Area, CheckGroup, RadioGroup } from "@/components/fields";
import JsaEditor from "@/components/JsaEditor";
import FormRenderer from "@/components/FormRenderer";
import {
  WORK_TYPES, GEAR, GENERAL, HOT, CONFINED, ELECTRICAL, ELEVATED, EXCAVATION, HEAVY, RADIATION, PROCESSES,
  confirmableItems,
} from "@/lib/form";
import SignaturePad from "@/components/SignaturePad";
import { sampleGeneral } from "@/lib/samples";
import { emptyPermit, PermitData } from "@/lib/types";
import { MANAGERS, SAFETY_REVIEWERS } from "@/lib/managers";
import { savePermit, submitPermit, getPermit, saveAdminFields, completePermit, chainAction, PermitStatus, ChainStage, PermitChain } from "@/lib/permits";
import {
  listTemplates, getTemplate, createTemplate, updateTemplate, PermitTemplate,
} from "@/lib/templates";
import { auth, db } from "@/lib/firebase";
import AccessGate from "@/components/AccessGate";
import Attachments from "@/components/Attachments";
import { PermitAttachment } from "@/lib/attachments";
import { getRequiredDocs } from "@/lib/appConfig";

const STATUS_LABEL: Record<PermitStatus, { text: string; color: string }> = {
  draft:     { text: "임시저장", color: "#94a3b8" },
  submitted: { text: "제출됨",   color: "#f59e0b" },
  approved:  { text: "승인완료", color: "#22c55e" },
  rejected:  { text: "반려됨",   color: "#ef4444" },
  completed: { text: "완료",     color: "#64748b" },
};

type SignatureTarget =
  | { kind: "education"; index: number }
  | { kind: "applicant" }
  | { kind: "field"; field: FieldSignatureKey }
  | { kind: "approval" }
  | null;

type FieldSignatureKey =
  | "supervisorSign"
  | "hotFireWatcherSign"
  | "hotFireManagerSign"
  | "confinedWatcherSign"
  | "electricalCutoffPersonSign"
  | "excavationBuriedCheckerSign"
  | "heavySignalerSign"
  | "energyPersonSign"
  | "worksheetAuthorSign"
  | "representativeSign";

const FIELD_SIGNATURE_LABELS: Record<FieldSignatureKey, string> = {
  supervisorSign: "작업감독자 서명",
  hotFireWatcherSign: "화재감시자 서명",
  hotFireManagerSign: "소방안전관리자 서명",
  confinedWatcherSign: "감시인 서명",
  electricalCutoffPersonSign: "차단인 서명",
  excavationBuriedCheckerSign: "매설확인자 서명",
  heavySignalerSign: "신호수/유도자 서명",
  energyPersonSign: "에너지원 차단인 서명",
  worksheetAuthorSign: "작성자/담당자 서명",
  representativeSign: "신청/강사 서명",
};

function SignatureField({
  value,
  readOnly,
  onClick,
}: {
  value: string;
  readOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {value
        ? <img src={value} alt="서명" style={{ height: 38, width: 110, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff" }} />
        : <span style={{ fontSize: 12, color: "#94a3b8" }}>미서명</span>}
      {!readOnly && <button className="mini" onClick={onClick}>{value ? "서명 수정" : "서명"}</button>}
    </div>
  );
}

function todayYmd(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function splitCutoffTime(value: string): [string, string] {
  const [start = "", end = ""] = value.split("~", 2).map((part) => part.trim());
  return [start, end];
}

function joinCutoffTime(start: string, end: string): string {
  if (!start && !end) return "";
  return `${start} ~ ${end}`;
}

function FillInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, logout, refresh } = useAuth();
  const cloudId = searchParams.get("id");
  // 관리자 예시 양식 편집 모드: ?template=<id>(수정) / ?templateNew=1(신규)
  const templateId = searchParams.get("template");
  const isNewTemplate = searchParams.get("templateNew") === "1";
  const templateMode = !!templateId || isNewTemplate;
  // 새 허가서는 항상 빈 양식으로 시작한다. 임시저장은 Firestore 문서로만 관리한다.
  const { data, setData, update, toggleIn, loaded } = usePermit({ disableLocalStorage: true });

  const [showPreview, setShowPreview] = useState(true);
  const [permitId, setPermitId] = useState<string | null>(cloudId);
  const [permitStatus, setPermitStatus] = useState<PermitStatus | null>(null);
  const [permitStage, setPermitStage] = useState<ChainStage | null>(null);
  const [chain, setChain] = useState<PermitChain | null>(null);
  const [adminNote, setAdminNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(!cloudId && !templateId);
  // 작업형태별 JSA 레퍼런스가 등록된 작업형태 키
  // 작성 모드에서 게스트가 고를 예시 양식 목록
  const [templates, setTemplates] = useState<PermitTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  // 새 예시 양식 작성 시 ?wt=<작업형태> 로 대표 작업형태 prefill
  const [templateWorkType, setTemplateWorkType] = useState(searchParams.get("wt") || "");
  const [templateOrder, setTemplateOrder] = useState(999);
  const [signatureTarget, setSignatureTarget] = useState<SignatureTarget>(null);
  const [saveApprovalPreset, setSaveApprovalPreset] = useState(false);
  // 클라우드 허가서 로드 결과: null=정상, "notfound"=문서 없음/권한 없음, "error"=조회 실패
  const [loadError, setLoadError] = useState<null | "notfound" | "error">(null);
  // 첨부파일 메타데이터 (permit 문서 top-level)
  const [attachments, setAttachments] = useState<PermitAttachment[]>([]);
  // 관리자가 설정한 "필요 서류" 안내 목록
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);

  useEffect(() => {
    if (!cloudId) return;
    getPermit(cloudId)
      .then((rec) => {
        if (rec) {
          setData(rec.data);
          setPermitStatus(rec.status);
          setPermitStage(rec.stage ?? null);
          setChain(rec.chain ?? null);
          setAdminNote(rec.adminNote ?? "");
          setAttachments(rec.attachments ?? []);
        } else {
          // 존재하지 않는 문서 → 빈 폼 대신 안내 표시 (권한 거부는 catch에서 처리)
          setLoadError("notfound");
        }
        setCloudLoaded(true);
      })
      .catch((e) => {
        console.error("허가서 조회 실패:", e);
        // 읽기 권한 거부(rules deny)는 permission-denied 예외로 throw됨 → "찾을 수 없음"으로 통합(정보노출 최소화)
        setLoadError(e?.code === "permission-denied" ? "notfound" : "error");
        setCloudLoaded(true);
      });
  }, [cloudId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 관리자 설정 "필요 서류" 안내 로드 (작성 화면 첨부 섹션에 표시)
  useEffect(() => {
    getRequiredDocs().then(setRequiredDocs).catch(() => { /* 설정 없음 → 빈 목록 */ });
  }, []);

  // 예시 양식 편집 모드: 기존 템플릿 로드
  useEffect(() => {
    if (!templateId) return;
    getTemplate(templateId)
      .then((t) => {
        if (t) {
          setData(t.data);
          setTemplateName(t.name);
          setTemplateWorkType(t.workType);
          setTemplateOrder(t.order);
        } else {
          setLoadError("notfound");
        }
        setCloudLoaded(true);
      })
      .catch((e) => {
        console.error("예시 양식 조회 실패:", e);
        setLoadError(e?.code === "permission-denied" ? "notfound" : "error");
        setCloudLoaded(true);
      });
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 작성 모드: 게스트가 불러올 예시 양식 목록
  useEffect(() => {
    if (templateMode) return;
    listTemplates().then(setTemplates).catch(() => {});
  }, [templateMode]);

  // 인증 가드: 로그인하지 않은 사용자는 내부 양식을 볼 수 없도록 로그인 페이지로 이동
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // 업체 계정의 허가서는 신규/임시저장 모두 계정에 등록된 업체명을 기준으로 한다.
  useEffect(() => {
    if (!loaded || !cloudLoaded || !user || user.role !== "guest") return;
    if (templateMode || !user.company) return;
    setData((d) => {
      const nextCompany = user.company;
      if (d.company === nextCompany && d.applicantDept === nextCompany) return d;
      return { ...d, company: nextCompany, applicantDept: nextCompany };
    });
  }, [loaded, cloudLoaded, user, templateMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 인증 확인 중이거나 미로그인(리다이렉트 대기) 상태에서는 내부 UI를 렌더하지 않음
  if (authLoading || !user) return <div className="loading"><span className="spinner" />불러오는 중…</div>;

  if (!loaded || !cloudLoaded) return <div className="loading"><span className="spinner" />불러오는 중…</div>;

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f8fafc" }}>
        <div style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 32 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 18, color: "#0a2240" }}>
            {loadError === "notfound" ? "허가서를 찾을 수 없습니다" : "허가서를 불러오지 못했습니다"}
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
            {loadError === "notfound"
              ? "요청하신 허가서가 존재하지 않거나 접근 권한이 없습니다."
              : "조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="primary" onClick={() => window.location.assign("/fill")}>새 허가서 작성</button>
            <button onClick={() => router.push("/")}>처음으로</button>
          </div>
        </div>
      </div>
    );
  }

  const isGuest = user?.role === "guest";
  // 업체(게스트): draft/rejected 만 편집. 관리자/시스템관리자: 기존 건은 읽기전용(결재 패널로만 처리). 템플릿 편집은 예외.
  const isReadOnly = templateMode ? false
    : (!isGuest ? !!permitId
      : (!!permitStatus && permitStatus !== "draft" && permitStatus !== "rejected"));
  const canSubmit = isGuest && (!permitStatus || permitStatus === "draft" || permitStatus === "rejected");

  const handleSave = async (): Promise<string | null> => {
    if (!user) { alert("로그인 후 이용 가능합니다."); return null; }
    setSaving(true);
    try {
      const id = await savePermit(user.uid, user.email, user.company || data.company, data, permitId ?? undefined);
      setPermitId(id);
      setPermitStatus("draft");
      window.history.replaceState({}, "", `/fill?id=${id}`);
      return id;
    } catch (e) {
      alert("저장 실패: " + e);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const requiredSignatureChecks = () => {
    // 소방안전관리자(박세현) 서명은 업체가 아니라 환경안전 검토 단계에서 기재 → 업체 제출 필수에서 제외.
    const checks: { label: string; name: string; sign: string; anchor: string }[] = [
      { label: "일반작업 작업감독자", name: data.supervisor, sign: data.supervisorSign, anchor: "sec-general" },
      { label: "Work Sheet 작성자/담당자", name: data.worksheetAuthor, sign: data.worksheetAuthorSign, anchor: "sec-jsa" },
      { label: "신청/강사", name: data.representativeSignName, sign: data.representativeSign, anchor: "sec-edu" },
    ];
    if (data.workTypes.includes("hot")) {
      checks.push({ label: "화재감시자", name: data.hotFireWatcher, sign: data.hotFireWatcherSign, anchor: "sec-hot" });
    }
    if (data.workTypes.includes("confined")) checks.push({ label: "감시인", name: data.confinedWatcher, sign: data.confinedWatcherSign, anchor: "sec-confined" });
    if (data.workTypes.includes("electrical")) checks.push({ label: "차단인", name: data.electricalCutoffPerson, sign: data.electricalCutoffPersonSign, anchor: "sec-electrical" });
    if (data.workTypes.includes("excavation")) checks.push({ label: "매설확인자", name: data.excavationBuriedChecker, sign: data.excavationBuriedCheckerSign, anchor: "sec-excavation" });
    if (data.workTypes.includes("heavy")) checks.push({ label: "신호수/유도자", name: data.heavySignaler, sign: data.heavySignalerSign, anchor: "sec-heavy" });
    if (data.energyMode === "general" && !data.energyDeferred) {
      checks.push({ label: "에너지원 차단인", name: data.energyPerson, sign: data.energyPersonSign || "", anchor: "sec-energy" });
    }
    return checks;
  };

  // 검증 결과: 각 미작성 항목과 이동할 화면 앵커(섹션 id).
  const validate = (): { label: string; anchor: string }[] => {
    const miss: { label: string; anchor: string }[] = [];
    const add = (label: string, anchor: string) => miss.push({ label, anchor });
    if (!data.company.trim()) add("업체명(부서명)", "sec-basic");
    if (!data.supervisor.trim()) add("작업감독자", "sec-basic");
    if (!data.manager) add("담당자(의뢰자)", "sec-basic");
    if (!data.workDate) add("작업일자", "sec-basic");
    if (!data.workContent.trim()) add("작업내용", "sec-basic");
    if (data.workTypes.length === 0) add("작업형태(1개 이상 선택)", "sec-worktypes");
    if (data.processes.length === 0) add("작업장소 / 공정(1개 이상 선택)", "sec-process");
    if (data.privacyConsent !== "agree") add("개인정보 수집·이용 동의(동의 함)", "sec-privacy");
    if (!data.applicantName.trim()) add("신청(업체) 성명", "sec-applicant");
    if (!data.applicantSign) add("신청(업체) 서명", "sec-applicant");
    requiredSignatureChecks().forEach((item) => {
      if (!item.name.trim()) add(`${item.label} 성명`, item.anchor);
      if (!item.sign) add(`${item.label} 서명`, item.anchor);
    });
    return miss;
  };

  // 미작성 항목 위치로 스크롤 + 잠깐 강조
  const flashAnchor = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("fl-flash");
    window.setTimeout(() => el.classList.remove("fl-flash"), 2200);
  };

  const handleSubmit = async () => {
    if (!user) { alert("로그인 후 이용 가능합니다."); return; }
    const missing = validate();
    if (missing.length) {
      flashAnchor(missing[0].anchor);
      alert("다음 필수 항목을 확인해주세요:\n\n· " + missing.map((m) => m.label).join("\n· ") + "\n\n첫 항목 위치로 이동했습니다.");
      return;
    }
    // 실제로 비어 있는 권장 항목만 경고로 모은다 (필수 항목은 위 validate 에서 이미 차단됨).
    const warns: string[] = [];
    if (data.jsa.filter((r) => r.step.trim() || r.hazard.trim()).length === 0) warns.push("위험성평가(JSA)가 작성되지 않았습니다");
    if (data.eduSigners.filter((s) => s.name.trim()).length === 0) warns.push("교육서약 참여자 서명이 없습니다");
    // 서명 수는 안내 정보일 뿐 — '비어 있음' 경고가 아니라 별도 안내문으로만 표기한다.
    const requiredSignCount = requiredSignatureChecks().length + 1 + data.eduSigners.filter((s) => s.name.trim()).length;
    const signInfo = `참고: 이 문서에 필요한 서명 수는 총 ${requiredSignCount}건입니다.`;
    const confirmMsg = warns.length
      ? "⚠️ 다음 권장 항목이 비어 있습니다:\n\n· " + warns.join("\n· ") + `\n\n${signInfo}\n\n그래도 작업허가서를 제출하시겠습니까? (제출 후 수정 불가)`
      : `작업허가서를 제출하시겠습니까? 제출 후에는 수정이 불가합니다.\n\n${signInfo}`;
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    try {
      // 기존 임시저장 문서도 제출 직전에 현재 폼 전체를 다시 저장해야
      // 마지막으로 선택한 담당자와 수정 내용이 결재 문서에 반영된다.
      const submissionData = {
        ...data,
        company: user.company || data.company,
        emergencyContact: data.emergencyContact === "010-0000-0000" ? "" : data.emergencyContact,
        applicantDate: data.applicantDate || todayYmd(),
      };
      const id = await savePermit(
        user.uid,
        user.email,
        user.company || submissionData.company,
        submissionData,
        permitId ?? undefined,
      );
      setData(submissionData);
      setPermitId(id);
      window.history.replaceState({}, "", `/fill?id=${id}`);
      await submitPermit(id);
      setPermitStatus("submitted");
      let notifyOk = true;
      try {
        const token = await auth.currentUser?.getIdToken();
        const nr = await fetch("/api/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            company: data.company,
            workContent: data.workContent,
            workDate: data.workDate,
            startTime: data.startTime,
            endTime: data.endTime,
            supervisor: data.supervisor,
            permitId: id,
            permitData: data,
          }),
        });
        // 제출 자체는 성공(submitted 유지). 알림 메일 발송이 실패하면
        // 사용자에게 비차단 안내만 띄운다(흐름은 깨지 않음).
        notifyOk = nr.ok;
        try {
          const nj = await nr.json();
          notifyOk = notifyOk && nj.ok !== false;
          if (!notifyOk) console.error("이메일 전송 실패:", nj.error);
        } catch {
          notifyOk = false;
        }
      } catch (ne) {
        console.error("이메일 API 호출 실패:", ne);
        notifyOk = false;
      }
      // 제출 성공 피드백 (메일 발송 성공 여부에 따라 메시지 분기)
      if (notifyOk) {
        alert("작업허가서가 제출되었습니다. ✅\n관리자 검토 후 결과가 반영됩니다. '내 목록'에서 진행 상태를 확인할 수 있어요.");
      } else {
        alert("제출은 완료되었습니다. ✅\n다만 관리자 알림 메일 발송에 실패했으니 담당자에게 직접 알려주세요.");
      }
      router.replace("/my");
    } catch (e) {
      alert("제출 실패: " + e);
    } finally {
      setSaving(false);
    }
  };

  // 예시 양식 저장 (관리자 전용)
  const handleSaveTemplate = async () => {
    if (!user || user.role !== "admin") { alert("관리자만 예시 양식을 저장할 수 있습니다."); return; }
    const name = window.prompt("예시 양식 이름:", templateName || "");
    if (name === null) return;
    if (!name.trim()) { alert("이름을 입력해주세요."); return; }
    setSaving(true);
    try {
      if (templateId) {
        await updateTemplate(templateId, { name: name.trim(), workType: templateWorkType, order: templateOrder, data }, user.email);
      } else {
        await createTemplate({ name: name.trim(), workType: templateWorkType, order: Date.now(), data }, user.email);
      }
      alert("예시 양식이 저장되었습니다.");
      router.push("/admin");
    } catch (e) {
      alert("저장 실패: " + e);
    } finally {
      setSaving(false);
    }
  };

  // 게스트가 예시 양식 선택 → 폼에 적용
  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (window.confirm(`"${t.name}" 예시를 불러올까요? 현재 입력 내용을 덮어씁니다.`)) {
      const blank = emptyPermit();
      setData({
        ...blank,
        ...t.data,
        company: user?.company || data.company,
        applicantDept: user?.company || data.company,
        emergencyContact: t.data.emergencyContact === "010-0000-0000" ? "" : t.data.emergencyContact,
        riskParticipants: t.data.riskParticipants === "홍길동"
          ? "홍길동, 김민수, 김철수, 김박수"
          : t.data.riskParticipants,
        applicantDate: "",
        applicantSign: "",
        eduSigners: (t.data.eduSigners || []).map((signer) => ({ ...signer, sign: "" })),
        admin: blank.admin,
      });
    }
  };

  // 관리자 확인(○ → ●) 토글/일괄/저장
  const toggleConfirm = (ref: string) => {
    setData((d) => {
      const has = d.confirmed.includes(ref);
      return { ...d, confirmed: has ? d.confirmed.filter((x) => x !== ref) : [...d.confirmed, ref] };
    });
  };
  const confirmAll = () => {
    const refs = confirmableItems(data).map((i) => i.ref);
    setData((d) => ({ ...d, confirmed: refs }));
  };
  const clearConfirm = () => setData((d) => ({ ...d, confirmed: [] }));
  const handleSaveConfirm = async () => {
    if (!permitId) return;
    setSaving(true);
    try { await saveAdminFields(permitId, data.confirmed, data.admin.review.name); alert("확인 내용이 저장되었습니다."); }
    catch (e) { alert("저장 실패: " + e); }
    finally { setSaving(false); }
  };

  // 결재 처리 — 단계별 승인/반려/재상신 (서버 chainAction 이 권한·단계 검증)
  const backList = () => router.push(user?.role === "admin" ? "/admin" : "/manager");
  // 단계별 알림 메일 (비차단 — 실패해도 결재 흐름은 유지)
  const postNotify = async (kind: string, reason = ""): Promise<{ ok: boolean; error?: string }> => {
    if (!permitId) return { ok: false, error: "permit_id_missing" };
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          kind, reason, permitId, permitData: data,
          company: data.company, workContent: data.workContent, workDate: data.workDate,
          startTime: data.startTime, endTime: data.endTime, supervisor: data.supervisor,
        }),
      });
      const result = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
      if (!response.ok || result.ok === false) {
        const error = result.error || `http_${response.status}`;
        console.error("notify 실패:", error);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      const error = (e as Error)?.message ?? String(e);
      console.error("notify 실패:", error);
      return { ok: false, error };
    }
  };
  const doApprove = async (signature: string) => {
    if (!permitId) return;
    // 환경안전(safety) 단계는 검토자명 필요(기본 박세현)
    let reviewerName = "";
    if (permitStage === "safety") {
      reviewerName = data.admin.review.name || "박세현";
    }
    let comment = "";
    if (permitStage !== "factory") {
      const input = window.prompt("결재 의견 (선택 — 담당자 1차는 공사 내용을 적어 올리세요):", "");
      if (input === null) return;
      comment = input.trim();
    }
    const prevStage = permitStage || "manager";
    setSaving(true);
    try {
      const r = await chainAction(permitId, "approve", comment, reviewerName, signature);
      const kind = prevStage === "manager" ? "to_safety" : prevStage === "safety" ? "to_factory" : "final";
      const notifyResult = await postNotify(kind);
      if (r.status === "approved") {
        alert(notifyResult.ok
          ? "최종 승인되었습니다.\n1차 담당자와 박세현에게 완료 메일을 발송했습니다."
          : `최종 승인은 완료됐지만 메일 발송에 실패했습니다.\n오류: ${notifyResult.error || "unknown"}`);
      } else {
        alert(notifyResult.ok
          ? "승인하여 다음 단계로 넘겼습니다."
          : `승인은 완료됐지만 다음 단계 알림 메일 발송에 실패했습니다.\n오류: ${notifyResult.error || "unknown"}`);
      }
      backList();
    } catch (e) { alert("처리 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setSaving(false); }
  };
  const doReject = async () => {
    if (!permitId) return;
    const reason = window.prompt("반려 사유 (필수) — 담당자에게 전달됩니다:", "");
    if (reason === null) return;
    if (!reason.trim()) { alert("반려 사유는 필수입니다."); return; }
    setSaving(true);
    try {
      await chainAction(permitId, "reject", reason.trim());
      await postNotify("reject", reason.trim());
      alert("반려되었습니다. 담당자에게 반환됩니다.");
      backList();
    } catch (e) { alert("반려 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setSaving(false); }
  };
  const doResubmit = async () => {
    if (!permitId) return;
    if (!window.confirm("이 건을 다시 결재 라인에 올릴까요? (1차 결재부터 재진행)")) return;
    setSaving(true);
    try {
      await chainAction(permitId, "resubmit");
      alert("재상신되었습니다.");
      backList();
    } catch (e) { alert("재상신 실패: " + ((e as Error)?.message ?? String(e))); }
    finally { setSaving(false); }
  };
  const handleComplete = async () => {
    if (!permitId) return;
    if (!window.confirm("작업완료 처리하시겠습니까?")) return;
    setSaving(true);
    try {
      await completePermit(permitId);
      alert("작업완료 처리되었습니다.");
      router.push("/admin");
    } catch (e) { alert("완료 처리 실패: " + e); }
    finally { setSaving(false); }
  };

  // 교육서약 참여자 (이름 + 직접 서명)
  const addSigner = () => setData((d) => ({ ...d, eduSigners: [...d.eduSigners, { name: "", sign: "" }] }));
  const updateSignerName = (i: number, name: string) =>
    setData((d) => { const arr = [...d.eduSigners]; arr[i] = { ...arr[i], name }; return { ...d, eduSigners: arr }; });
  const setSignerSign = (i: number, sign: string) =>
    setData((d) => { const arr = [...d.eduSigners]; arr[i] = { ...arr[i], sign }; return { ...d, eduSigners: arr }; });
  const removeSigner = (i: number) =>
    setData((d) => ({ ...d, eduSigners: d.eduSigners.filter((_, j) => j !== i) }));
  const setReviewer = (name: string) =>
    setData((d) => ({ ...d, admin: { ...d.admin, review: { ...d.admin.review, name, dept: "환경안전" } } }));
  const saveMyApprovalSignature = async (signature: string) => {
    if (!user || (user.role !== "manager" && user.role !== "admin")) return;
    await updateDoc(doc(db, "users", user.uid), { savedApprovalSign: signature });
    await refresh();
  };
  const setFieldSignature = (field: FieldSignatureKey, signature: string) =>
    setData((d) => ({ ...d, [field]: signature } as PermitData));

  const signatureTitle = signatureTarget?.kind === "education"
    ? `${data.eduSigners[signatureTarget.index]?.name || `${signatureTarget.index + 1}번`} 참여자 서명`
    : signatureTarget?.kind === "applicant"
      ? `${data.applicantName || "신청자"} 업체 신청 서명`
      : signatureTarget?.kind === "field"
        ? FIELD_SIGNATURE_LABELS[signatureTarget.field]
      : `${permitStage === "factory" ? "공장장 최종" : permitStage === "safety" ? "환경안전" : "담당자 1차"} 승인 서명`;
  const signatureInitial = signatureTarget?.kind === "education"
    ? data.eduSigners[signatureTarget.index]?.sign
    : signatureTarget?.kind === "applicant"
      ? data.applicantSign
      : signatureTarget?.kind === "field"
        ? data[signatureTarget.field]
        : undefined;
  const saveSignature = async (signature: string) => {
    const target = signatureTarget;
    const shouldSaveApprovalPreset = saveApprovalPreset;
    if (!target) return;
    setSignatureTarget(null);
    setSaveApprovalPreset(false);
    if (target.kind === "education") {
      setSignerSign(target.index, signature);
    } else if (target.kind === "applicant") {
      setData((d) => ({
        ...d,
        applicantSign: signature,
        applicantDate: todayYmd(),
      }));
    } else if (target.kind === "field") {
      setFieldSignature(target.field, signature);
    } else {
      try {
        if (shouldSaveApprovalPreset) await saveMyApprovalSignature(signature);
      } catch (e) {
        alert("서명 저장 실패: " + ((e as Error)?.message ?? String(e)));
        return;
      }
      await doApprove(signature);
    }
  };

  const statusInfo = permitStatus ? STATUS_LABEL[permitStatus] : null;
  const [electricalCutoffStart, electricalCutoffEnd] = splitCutoffTime(data.electricalCutoffTime);

  return (
    <div className="layout layout-split">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>{templateMode ? "예시 양식 편집" : "환경안전 작업허가서"}</h1>
        {templateMode && (
          <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 4, background: "#7c3aed", color: "#fff", fontWeight: 700 }}>
            관리자 · 예시 양식
          </span>
        )}
        {!templateMode && statusInfo && permitStatus && (
          <span className={`chip chip-${permitStatus}`}>{statusInfo.text}</span>
        )}
        <div className="spacer" />
        {user ? (
          <>
            <span style={{ fontSize: 12, opacity: 0.75, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
            {!isGuest && (
              <button onClick={() => router.push("/admin")}>목록</button>
            )}
            {isGuest && !templateMode && (
              <button onClick={() => router.push("/my")}>내 목록</button>
            )}
            <button onClick={() => { logout(); router.replace("/login"); }}>로그아웃</button>
          </>
        ) : (
          <button onClick={() => router.push("/login")}>로그인</button>
        )}
        {isReadOnly && isGuest && (
          <button onClick={() => window.location.assign("/fill")}>새 허가서 작성</button>
        )}
        <button onClick={() => setShowPreview((s) => !s)}>{showPreview ? "미리보기 숨기기" : "미리보기"}</button>
        {templateMode ? (
          <>
            <button onClick={() => router.push("/admin")}>취소</button>
            <button onClick={handleSaveTemplate} disabled={saving} className="primary">
              {saving ? "저장 중…" : "예시 양식 저장"}
            </button>
          </>
        ) : (
          <>
            {user && !isReadOnly && isGuest && (
              <>
                <button onClick={handleSave} disabled={saving}>{saving ? "저장 중…" : "임시저장"}</button>
                {canSubmit && (
                  <button onClick={handleSubmit} disabled={saving} className="primary">
                    {permitStatus === "rejected" ? "재제출" : "제출"}
                  </button>
                )}
              </>
            )}
            <button onClick={() => window.print()} className="primary">인쇄 / PDF</button>
          </>
        )}
      </header>

      {permitStatus === "rejected" && (
        <div className="no-print banner banner-error">
          <strong>반려됨</strong> — 내용을 수정한 뒤 다시 제출하실 수 있습니다.
          {adminNote && <div style={{ marginTop: 4 }}>사유: {adminNote}</div>}
        </div>
      )}
      {permitStatus === "submitted" && isGuest && (
        <div className="no-print banner banner-warn">
          <strong>제출 완료</strong> — 관리자 검토를 기다려 주세요. 제출 후에는 수정할 수 없습니다.
        </div>
      )}
      {permitStatus === "approved" && (
        <div className="no-print banner banner-success">
          <strong>승인 완료</strong> — 인쇄/PDF로 출력하여 현장에 비치하세요.
        </div>
      )}

      <div className="body">
        <div className="formcol no-print">
          {!templateMode && permitId && (user?.role === "admin" || user?.role === "manager") && (() => {
            const role = user!.role;
            const isSys = role === "admin";
            const STAGE_LABEL: Record<string, string> = { manager: "담당자 1차", safety: "환경안전", factory: "공장장 최종", done: "완료" };
            const stageNow = permitStage || (permitStatus === "submitted" ? "manager" : null);
            const canActNow = permitStatus === "submitted" && (isSys
              || (role === "manager" && (
                (stageNow === "manager" && user!.managerKind === "requester" && user!.managerName === data.manager)
                || (stageNow === "factory" && user!.managerKind === "factory")
              )));
            const canResubmit = permitStatus === "rejected"
              && (isSys || (role === "manager" && user!.managerKind === "requester" && user!.managerName === data.manager));
            const items = confirmableItems(data);
            return (
              <div style={{ border: "1px solid #c7d2fe", borderRadius: 10, padding: 14, marginBottom: 14, background: "#eef2ff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14, color: "#3730a3" }}>결재</strong>
                  <span style={{ fontSize: 12, color: "#475569" }}>
                    {["manager", "safety", "factory"].map((s) => STAGE_LABEL[s] + (stageNow === s ? " ◀" : "")).join("  →  ")}
                  </span>
                  {isSys && <span style={{ fontSize: 11, color: "#94a3b8" }}>(시스템관리자: 모든 단계 처리 가능)</span>}
                </div>

                {/* 단계별 결재 코멘트 이력 */}
                {(chain?.manager || chain?.safety || chain?.factory || chain?.rejected) && (
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                    {chain?.manager && <div>· 담당자 {chain.manager.by}: {chain.manager.comment || "(의견 없음)"}</div>}
                    {chain?.safety && <div>· 환경안전 {chain.safety.by}: {chain.safety.comment || "(의견 없음)"}</div>}
                    {chain?.factory && <div>· 공장장 {chain.factory.by}: {chain.factory.comment || "(의견 없음)"}</div>}
                    {chain?.rejected && <div style={{ color: "#dc2626" }}>· 반려({STAGE_LABEL[chain.rejected.stage || ""] || chain.rejected.stage}) {chain.rejected.by}: {chain.rejected.reason}</div>}
                  </div>
                )}

                {/* 환경안전 단계: 검토자 선택 (시스템관리자) */}
                {isSys && stageNow === "safety" && permitStatus === "submitted" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 10 }}>
                    검토자(환경안전):
                    <select className="inp" value={data.admin.review.name || "박세현"} onChange={(e) => setReviewer(e.target.value)}>
                      {SAFETY_REVIEWERS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}

                {/* 관리자 확인(●) — 시스템관리자, 제출 단계 */}
                {isSys && stageNow === "safety" && permitStatus === "submitted" && items.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>업체 체크 확인(●)</span>
                      <button className="mini" onClick={confirmAll}>일괄</button>
                      <button className="mini" onClick={clearConfirm}>해제</button>
                      <button className="mini" onClick={handleSaveConfirm} disabled={saving} style={{ background: "#4f46e5", color: "#fff" }}>저장</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {items.map((it) => {
                        const on = data.confirmed.includes(it.ref);
                        return (
                          <button key={it.ref} onClick={() => toggleConfirm(it.ref)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${on ? "#6366f1" : "#cbd5e1"}`, background: on ? "#e0e7ff" : "#fff", borderRadius: 16, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: on ? "#3730a3" : "#475569" }}>
                            <span style={{ fontSize: 14 }}>{on ? "●" : "○"}</span>{it.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 액션 */}
                <div style={{ paddingTop: 10, borderTop: "1px dashed #c7d2fe", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }} />
                  {permitStatus === "submitted" ? (
                    canActNow ? (
                      <>
                        <button className="mini btn-reject" onClick={doReject} disabled={saving}>반려</button>
                        <button className="mini btn-approve" onClick={() => setSignatureTarget({ kind: "approval" })} disabled={saving}>
                          {saving ? "처리 중…" : (stageNow === "factory" ? "최종 승인" : "승인")}
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>현재 ‘{STAGE_LABEL[stageNow || ""]}’ 단계 — 결재 권한이 없습니다.</span>
                    )
                  ) : permitStatus === "approved" ? (
                    isSys ? <button className="mini btn-dark" onClick={handleComplete} disabled={saving}>{saving ? "처리 중…" : "작업완료 처리"}</button>
                      : <span style={{ fontSize: 12, color: "#15803d" }}>최종 승인 완료</span>
                  ) : permitStatus === "rejected" ? (
                    <>
                      <span style={{ fontSize: 12, color: "#dc2626" }}>반려됨</span>
                      {canResubmit && <button className="mini btn-approve" onClick={doResubmit} disabled={saving}>재상신</button>}
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{permitStatus === "completed" ? "완료된 허가서" : "임시저장"}</span>
                  )}
                </div>
              </div>
            );
          })()}
          {!isReadOnly && (
            <div className="toolbar">
              {!templateMode && (
                templates.length > 0 ? (
                  <select
                    className="mini"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = ""; } }}
                  >
                    <option value="">예시 양식 불러오기…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <button className="mini" onClick={() => {
                    const sample = sampleGeneral();
                    const fixedCompany = user.company || sample.company;
                    setData({ ...sample, company: fixedCompany, applicantDept: fixedCompany });
                  }}>예시 채우기</button>
                )
              )}
              <button className="mini danger" onClick={() => {
                if (window.confirm("모든 입력을 초기화할까요?")) {
                  setData({ ...emptyPermit(), company: user.company || "", applicantDept: user.company || "" });
                }
              }}>초기화</button>
            </div>
          )}

          <Section title="① 기본 정보" id="sec-basic">
            <Row label="업체명(부서명)" required><Text value={data.company} onChange={(v) => update("company", v)} readOnly={isReadOnly || isGuest} /></Row>
            <Row label="대표자"><Text value={data.representative} onChange={(v) => update("representative", v)} readOnly={isReadOnly} /></Row>
            <Row label="작업감독자" required><Text value={data.supervisor} onChange={(v) => update("supervisor", v)} readOnly={isReadOnly} /></Row>
            <Row label="담당자(의뢰자)" required hint="공사를 의뢰한 사내 담당자 · 뒷장 발급자로 표기됨">
              <select
                className="inp"
                value={data.manager}
                onChange={(e) => update("manager", e.target.value)}
                disabled={isReadOnly}
                style={{ width: "100%" }}
              >
                <option value="">선택하세요</option>
                {MANAGERS.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.dept})</option>)}
              </select>
            </Row>
            <Row label="작업인원"><Text value={data.workerCount} onChange={(v) => update("workerCount", v)} type="number" readOnly={isReadOnly} /></Row>
            <Row label="비상연락망"><Text value={data.emergencyContact === "010-0000-0000" ? "" : data.emergencyContact} onChange={(v) => update("emergencyContact", v)} readOnly={isReadOnly} /></Row>
            <Row label="작업일자" required hint="당일만 · 여러 날은 날짜만 바꿔 재발급"><Text value={data.workDate} onChange={(v) => update("workDate", v)} type="date" readOnly={isReadOnly} /></Row>
            <div className="tworow">
              <Row label="시작시간"><Text value={data.startTime} onChange={(v) => update("startTime", v)} type="time" readOnly={isReadOnly} /></Row>
              <Row label="종료시간"><Text value={data.endTime} onChange={(v) => update("endTime", v)} type="time" readOnly={isReadOnly} /></Row>
            </div>
            <Row label="작업내용" required><Area value={data.workContent} onChange={(v) => update("workContent", v)} readOnly={isReadOnly} /></Row>
          </Section>

          <Section title="⑦ 작업형태 (복수 선택)" id="sec-worktypes">
            <CheckGroup options={WORK_TYPES.map((w) => ({ v: w.v, label: w.label }))} selected={data.workTypes} onToggle={(v) => toggleIn("workTypes", v)} cols={1} readOnly={isReadOnly} />
            {data.workTypes.includes("etc") && <Row label="기타 내용"><Text value={data.workTypeEtc} onChange={(v) => update("workTypeEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          {!templateMode && (
            <Section title="📎 첨부파일 (필요 서류)">
              <Attachments
                permitId={permitId}
                ensureId={handleSave}
                uid={user.uid}
                canUpload={user.role === "admin" || (isGuest && !isReadOnly)}
                value={attachments}
                onChange={setAttachments}
                requiredDocs={requiredDocs}
              />
            </Section>
          )}

          <Section title="작업장소 / 공정 (복수 선택)" id="sec-process">
            <p className="muted">선택한 공정 위에 빨간 동그라미가 표시됩니다.</p>
            <CheckGroup options={PROCESSES.map((p) => ({ v: p.name }))} selected={data.processes} onToggle={(v) => toggleIn("processes", v)} cols={3} readOnly={isReadOnly} />
            {data.processes.includes("기타") && <Row label="기타 장소/공정"><Text value={data.processEtc} onChange={(v) => update("processEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          <Section title="① 안전보호구">
            <CheckGroup options={GEAR} selected={data.gear} onToggle={(v) => toggleIn("gear", v)} cols={3} readOnly={isReadOnly} />
            {data.gear.includes("기타") && <Row label="기타 보호구"><Text value={data.gearEtc} onChange={(v) => update("gearEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          {/* ②~⑨ : 위에서 선택한 작업형태의 체크리스트만 노출 */}
          {data.workTypes.length === 0 && !isReadOnly && (
            <p className="muted" style={{ padding: "0 4px" }}>※ 위 <b>작업형태</b>를 먼저 선택하면 해당 작업의 체크리스트가 나타납니다.</p>
          )}

          {data.workTypes.includes("general") && (
            <Section title="② 일반작업 (공통사항)" id="sec-general">
              <CheckGroup options={GENERAL} selected={data.general} onToggle={(v) => toggleIn("general", v)} cols={1} readOnly={isReadOnly} />
              <Row label="작업감독자 서명" required>
                <SignatureField value={data.supervisorSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "supervisorSign" })} />
              </Row>
            </Section>
          )}

          {data.workTypes.includes("hot") && (
            <Section title="③ 화기작업" id="sec-hot">
              <CheckGroup options={HOT} selected={data.hot} onToggle={(v) => toggleIn("hot", v)} cols={1} readOnly={isReadOnly} />
              <div className="tworow">
                <Row label="화재감시자"><Text value={data.hotFireWatcher} onChange={(v) => update("hotFireWatcher", v)} readOnly={isReadOnly} /></Row>
                <Row label="소방안전관리자" hint="고정"><Text value="박세현" onChange={() => {}} readOnly /></Row>
              </div>
              <div className="tworow">
                <Row label="화재감시자 서명" required>
                  <SignatureField value={data.hotFireWatcherSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "hotFireWatcherSign" })} />
                </Row>
                <Row label="소방안전관리자 서명" hint="환경안전(박세현) 검토 단계에서 서명됩니다">
                  <SignatureField value={data.hotFireManagerSign} readOnly onClick={() => {}} />
                </Row>
              </div>
            </Section>
          )}

          {data.workTypes.includes("confined") && (
            <Section title="④ 밀폐공간작업" id="sec-confined">
              <CheckGroup options={CONFINED} selected={data.confined} onToggle={(v) => toggleIn("confined", v)} cols={1} readOnly={isReadOnly} />
              <Row label="감시인"><Text value={data.confinedWatcher} onChange={(v) => update("confinedWatcher", v)} readOnly={isReadOnly} /></Row>
              <Row label="감시인 서명" required>
                <SignatureField value={data.confinedWatcherSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "confinedWatcherSign" })} />
              </Row>
            </Section>
          )}

          {data.workTypes.includes("electrical") && (
            <Section title="⑤ 전기차단(정전)작업" id="sec-electrical">
              <CheckGroup options={ELECTRICAL} selected={data.electrical} onToggle={(v) => toggleIn("electrical", v)} cols={1} readOnly={isReadOnly} />
              <div className="tworow">
                <Row label="차단시간">
                  <span style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
                    <Text
                      value={electricalCutoffStart}
                      onChange={(v) => update("electricalCutoffTime", joinCutoffTime(v, electricalCutoffEnd))}
                      type="time"
                      readOnly={isReadOnly}
                    />
                    <span aria-hidden="true">~</span>
                    <Text
                      value={electricalCutoffEnd}
                      onChange={(v) => update("electricalCutoffTime", joinCutoffTime(electricalCutoffStart, v))}
                      type="time"
                      readOnly={isReadOnly}
                    />
                  </span>
                </Row>
                <Row label="차단인"><Text value={data.electricalCutoffPerson} onChange={(v) => update("electricalCutoffPerson", v)} readOnly={isReadOnly} /></Row>
              </div>
              <Row label="차단인 서명" required>
                <SignatureField value={data.electricalCutoffPersonSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "electricalCutoffPersonSign" })} />
              </Row>
            </Section>
          )}

          {data.workTypes.includes("elevated") && (
            <Section title="⑥ 고소작업">
              <CheckGroup options={ELEVATED} selected={data.elevated} onToggle={(v) => toggleIn("elevated", v)} cols={1} readOnly={isReadOnly} />
            </Section>
          )}

          {data.workTypes.includes("excavation") && (
            <Section title="⑦ 굴착작업" id="sec-excavation">
              <CheckGroup options={EXCAVATION} selected={data.excavation} onToggle={(v) => toggleIn("excavation", v)} cols={1} readOnly={isReadOnly} />
              <Row label="매설확인자"><Text value={data.excavationBuriedChecker} onChange={(v) => update("excavationBuriedChecker", v)} readOnly={isReadOnly} /></Row>
              <Row label="매설확인자 서명" required>
                <SignatureField value={data.excavationBuriedCheckerSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "excavationBuriedCheckerSign" })} />
              </Row>
            </Section>
          )}

          {data.workTypes.includes("heavy") && (
            <Section title="⑧ 중장비취급작업" id="sec-heavy">
              <CheckGroup options={HEAVY} selected={data.heavy} onToggle={(v) => toggleIn("heavy", v)} cols={1} readOnly={isReadOnly} />
              <div className="tworow">
                <Row label="신호수/유도자"><Text value={data.heavySignaler} onChange={(v) => update("heavySignaler", v)} readOnly={isReadOnly} /></Row>
                <Row label="장비종류"><Text value={data.heavyEquipType} onChange={(v) => update("heavyEquipType", v)} readOnly={isReadOnly} /></Row>
              </div>
              <Row label="신호수/유도자 서명" required>
                <SignatureField value={data.heavySignalerSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "heavySignalerSign" })} />
              </Row>
            </Section>
          )}

          {data.workTypes.includes("radiation") && (
            <Section title="⑨ 방사능작업">
              <CheckGroup options={RADIATION} selected={data.radiation} onToggle={(v) => toggleIn("radiation", v)} cols={1} readOnly={isReadOnly} />
            </Section>
          )}

          <Section title="⑪ 에너지원 안전잠금장치" id="sec-energy">
            <RadioGroup
              options={[{ v: "none", label: "해당사항 없음" }, { v: "general", label: "②항 에너지원차단·표찰부착 체크 시 조치사항 기재" }]}
              value={data.energyMode as any}
              onChange={(v) => update("energyMode", v as any)}
              readOnly={isReadOnly}
            />
            {data.energyMode === "general" && (
              <>
                <label className="chk" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={data.energyDeferred} onChange={(e) => update("energyDeferred", e.target.checked)} disabled={isReadOnly} />
                  <span>발급 후 작성 예정 (차단대상/위치/차단인을 현장에서 기재)</span>
                </label>
                {!data.energyDeferred && (
                  <>
                    <Row label="에너지 차단 대상"><Text value={data.energyTarget} onChange={(v) => update("energyTarget", v)} readOnly={isReadOnly} /></Row>
                    <Row label="차단 위치"><Text value={data.energyLocation} onChange={(v) => update("energyLocation", v)} readOnly={isReadOnly} /></Row>
                    <Row label="차단인"><Text value={data.energyPerson} onChange={(v) => update("energyPerson", v)} readOnly={isReadOnly} /></Row>
                    <Row label="차단인 서명" required>
                      <SignatureField value={data.energyPersonSign || ""} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "energyPersonSign" })} />
                    </Row>
                  </>
                )}
              </>
            )}
          </Section>

          <Section title="⑫ Work Sheet (JSA)" id="sec-jsa">
            <div className="tworow">
              <Row label="작성자/담당자"><Text value={data.worksheetAuthor} onChange={(v) => update("worksheetAuthor", v)} readOnly={isReadOnly} /></Row>
              <Row label="위험성평가 참여자"><Text value={data.riskParticipants} onChange={(v) => update("riskParticipants", v)} readOnly={isReadOnly} /></Row>
            </div>
            <Row label="작성자/담당자 서명" required>
              <SignatureField value={data.worksheetAuthorSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "worksheetAuthorSign" })} />
            </Row>
            <JsaEditor
              rows={data.jsa}
              onChange={(r) => update("jsa", r)}
              readOnly={isReadOnly}
              stepOptions={WORK_TYPES.filter((w) => data.workTypes.includes(w.v)).map((w) => w.label.split(" (")[0])}
            />
          </Section>

          <Section title="환경안전 교육실시 및 서약" id="sec-edu">
            <p className="muted">대표자가 함께 작업하는 인원을 등록하고, 각자 직접 서명합니다. (최대 18명)</p>
            <div className="tworow">
              <Row label="대표자(강사) 성명"><Text value={data.representativeSignName} onChange={(v) => update("representativeSignName", v)} readOnly={isReadOnly} /></Row>
              <Row label="교육 일자"><Text value={data.representativeSignDate} onChange={(v) => update("representativeSignDate", v)} type="date" readOnly={isReadOnly} /></Row>
            </div>
            <Row label="신청/강사 서명" required>
              <SignatureField value={data.representativeSign} readOnly={isReadOnly} onClick={() => setSignatureTarget({ kind: "field", field: "representativeSign" })} />
            </Row>
            <div style={{ marginTop: 10 }}>
              {data.eduSigners.length === 0 && <p className="muted">등록된 참여자가 없습니다.</p>}
              {data.eduSigners.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                  <span style={{ width: 22, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{i + 1}</span>
                  <input
                    className="inp" style={{ flex: 1 }} placeholder="성명" value={s.name}
                    onChange={(e) => updateSignerName(i, e.target.value)} disabled={isReadOnly}
                  />
                  {s.sign
                    ? <img src={s.sign} alt="서명" style={{ height: 34, width: 90, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff" }} />
                    : <span style={{ fontSize: 12, color: "#94a3b8", width: 90, textAlign: "center" }}>미서명</span>}
                  {!isReadOnly && (
                    <>
                      <button className="mini" onClick={() => setSignatureTarget({ kind: "education", index: i })}>{s.sign ? "서명 수정" : "서명"}</button>
                      <button className="mini danger" onClick={() => removeSigner(i)}>삭제</button>
                    </>
                  )}
                </div>
              ))}
              {!isReadOnly && (
                <button className="mini" onClick={addSigner} disabled={data.eduSigners.length >= 18} style={{ marginTop: 6 }}>
                  + 참여자 추가
                </button>
              )}
            </div>
          </Section>

          <Section title="개인정보 수집·이용 동의" id="sec-privacy">
            <p className="muted">※ 수집항목: 성명·소속·주소·전화번호·휴대전화번호 / 목적: 환경안전작업 허가 및 관리 / 보유: 환경안전작업허가 기간. 거부 시 작업허가 불가.</p>
            <RadioGroup options={[{ v: "agree", label: "동의 함" }, { v: "disagree", label: "동의하지 않음" }]} value={data.privacyConsent as any} onChange={(v) => update("privacyConsent", v as any)} readOnly={isReadOnly} />
          </Section>

          <Section title="신청 (업체)" id="sec-applicant">
            <div className="tworow">
              <Row label="소속"><Text value={data.applicantDept} onChange={(v) => update("applicantDept", v)} readOnly={isReadOnly || isGuest} /></Row>
              <Row label="성명"><Text value={data.applicantName} onChange={(v) => update("applicantName", v)} readOnly={isReadOnly} /></Row>
            </div>
            <Row label="신청일자" hint="서명 저장 시 오늘 날짜가 자동 입력됩니다."><Text value={data.applicantDate} onChange={() => {}} type="date" readOnly /></Row>
            <Row label="신청자 서명" required>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {data.applicantSign
                  ? <img src={data.applicantSign} alt="신청자 서명" style={{ height: 40, width: 120, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff" }} />
                  : <span style={{ fontSize: 12, color: "#94a3b8" }}>미서명</span>}
                {!isReadOnly && (
                  <button className="mini" onClick={() => setSignatureTarget({ kind: "applicant" })}>
                    {data.applicantSign ? "서명 수정" : "서명"}
                  </button>
                )}
              </div>
            </Row>
          </Section>
        </div>

        {showPreview && (
          <div className="previewcol">
            <FormRenderer data={data} />
          </div>
        )}
      </div>

      {signatureTarget && (
        <SignaturePad
          title={signatureTitle}
          initial={signatureInitial}
          savedSignature={signatureTarget.kind === "approval" ? user?.savedApprovalSign : undefined}
          canSavePreset={signatureTarget.kind === "approval" && !!user && (user.role === "manager" || user.role === "admin")}
          savePreset={saveApprovalPreset}
          onSave={saveSignature}
          onUseSaved={() => {
            if (!user?.savedApprovalSign) return;
            void saveSignature(user.savedApprovalSign);
          }}
          onToggleSavePreset={setSaveApprovalPreset}
          onClose={() => { setSignatureTarget(null); setSaveApprovalPreset(false); }}
        />
      )}
    </div>
  );
}

export default function FillPage() {
  return (
    <Suspense fallback={<div className="loading"><span className="spinner" />불러오는 중…</div>}>
      <AccessGate><FillInner /></AccessGate>
    </Suspense>
  );
}
