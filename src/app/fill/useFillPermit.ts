import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useSearchParams, useRouter } from "next/navigation";
import { usePermit } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { confirmableItems, WORK_TYPES } from "@/lib/form";
import { PermitData, JsaRow } from "@/lib/types";
import {
  savePermit, submitPermit, getPermit, saveAdminFields, completePermit, chainAction,
  PermitStatus, ChainStage, PermitChain,
} from "@/lib/permits";
import { listTemplates, getTemplate, createTemplate, updateTemplate, PermitTemplate } from "@/lib/templates";
import { auth, db } from "@/lib/firebase";
import { PermitAttachment } from "@/lib/attachments";
import { getAttachConfigs, AttachConfigMap } from "@/lib/appConfig";
import { FieldSignatureKey, SignatureTarget, FIELD_SIGNATURE_LABELS } from "./constants";
import { todayYmd, splitCutoffTime, joinCutoffTime } from "./utils";

export function useFillPermit() {
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
  // 관리자가 설정한 작업형태별 첨부 설정(안내 목록 + 업로드 표시 여부)
  const [attachCfgs, setAttachCfgs] = useState<AttachConfigMap>({});

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

  // 관리자 설정 작업형태별 첨부 설정 로드 (작성 화면 첨부 섹션에 반영)
  useEffect(() => {
    getAttachConfigs().then(setAttachCfgs).catch(() => { /* 설정 없음 → 기본값 */ });
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

  const isGuest = user?.role === "guest";
  // 업체(게스트): draft/rejected 만 편집. 관리자/시스템관리자: 기존 건은 읽기전용(결재 패널로만 처리). 템플릿 편집은 예외.
  const isReadOnly = templateMode ? false
    : (!isGuest ? !!permitId
      : (!!permitStatus && permitStatus !== "draft" && permitStatus !== "rejected"));

  // 일반작업(공통)은 항상 선택 상태로 유지. 템플릿 편집 시엔 해당 작업형태도 포함.
  useEffect(() => {
    if (isReadOnly) return;
    if (templateMode && (!loaded || !cloudLoaded)) return;
    setData((d) => {
      const additions: string[] = [];
      if (!d.workTypes.includes("general")) additions.push("general");
      if (templateMode && templateWorkType && templateWorkType !== "general" && !d.workTypes.includes(templateWorkType)) {
        additions.push(templateWorkType);
      }
      if (!additions.length) return d;
      return { ...d, workTypes: [...additions, ...d.workTypes] };
    });
  }, [templateMode, loaded, cloudLoaded, templateWorkType, isReadOnly, data.workTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  // JSA 행을 선택한 작업형태에 1:1 자동 동기화(작업형태별 1행). 기존 내용은 workType/step 으로 매칭해 보존.
  // workType 태그가 없는 레거시 행(과거 라벨 표기가 달라 step 이 안 맞는 경우 포함)은
  // 순서대로 소비해 최대한 내용을 보존한다 — 매칭 실패로 입력했던 위험성평가가 사라지지 않도록.
  useEffect(() => {
    if (isReadOnly) return;
    setData((d) => {
      const sel = WORK_TYPES.filter((w) => w.v !== "etc" && d.workTypes.includes(w.v));
      const labelOf = (w: { label: string }) => w.label.split(" (")[0];
      const byWorkType = new Map<string, number>();
      d.jsa.forEach((r, i) => { if (r.workType && !byWorkType.has(r.workType)) byWorkType.set(r.workType, i); });
      const legacyPool = d.jsa.map((r, i) => ({ r, i })).filter(({ r }) => !r.workType);
      const usedIdx = new Set<number>();
      let legacyCursor = 0;
      const next = sel.map((w) => {
        const label = labelOf(w);
        let src: JsaRow | undefined;
        const wtIdx = byWorkType.get(w.v);
        if (wtIdx !== undefined) {
          src = d.jsa[wtIdx]; usedIdx.add(wtIdx);
        } else {
          const exact = legacyPool.find(({ r, i }) => !usedIdx.has(i) && r.step === label);
          if (exact) { src = exact.r; usedIdx.add(exact.i); } else {
            while (legacyCursor < legacyPool.length && usedIdx.has(legacyPool[legacyCursor].i)) legacyCursor++;
            if (legacyCursor < legacyPool.length) {
              src = legacyPool[legacyCursor].r; usedIdx.add(legacyPool[legacyCursor].i); legacyCursor++;
            }
          }
        }
        const base = src ?? { step: label, workType: w.v, hazard: "", frequency: "" as const, severity: "" as const, current: "", reduction: "" };
        if (base.workType === w.v && base.step === label) return base;
        return { ...base, workType: w.v, step: label };
      });
      const same = next.length === d.jsa.length && next.every((r, i) => r === d.jsa[i]);
      return same ? d : { ...d, jsa: next };
    });
  }, [data.workTypes, isReadOnly]); // eslint-disable-line react-hooks/exhaustive-deps
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
            company: submissionData.company,
            workContent: submissionData.workContent,
            workDate: submissionData.workDate,
            startTime: submissionData.startTime,
            endTime: submissionData.endTime,
            supervisor: submissionData.supervisor,
            permitId: id,
            permitData: submissionData,
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

  // 특정 작업형태의 예시만 불러오기 — 해당 작업형태의 체크항목 카드 + 그 작업형태의 JSA 행만 채운다.
  // (JSA 행 옆 버튼에서 호출. 다른 작업형태·기본정보·서명 등은 건드리지 않는다.)
  const CHECKLIST_KEYS = ["general", "hot", "confined", "electrical", "elevated", "excavation", "heavy", "radiation"];
  const hasTemplateFor = (wt: string) => templates.some((x) => x.workType === wt);
  const applyTemplateWorkType = (wt: string) => {
    const label = WORK_TYPES.find((w) => w.v === wt)?.label.split(" (")[0] ?? wt;
    const t = templates.find((x) => x.workType === wt);
    if (!t) { alert(`${label} 예시 양식이 등록되어 있지 않습니다.`); return; }
    if (!window.confirm(`${label} 예시를 불러올까요? 해당 작업의 체크항목과 위험성평가(JSA)만 채워집니다.`)) return;
    const td = t.data;
    const srcRow = td.jsa.find((r) => r.workType === wt) ?? td.jsa.find((r) => r.step === label);
    setData((d) => {
      const next: PermitData = { ...d };
      if (CHECKLIST_KEYS.includes(wt)) {
        const arr = (td as unknown as Record<string, unknown>)[wt];
        (next as unknown as Record<string, unknown>)[wt] = Array.isArray(arr) ? [...arr] : [];
      }
      if (srcRow) {
        next.jsa = d.jsa.map((r) => (r.workType === wt
          ? { ...r, hazard: srcRow.hazard, current: srcRow.current, reduction: srcRow.reduction, frequency: srcRow.frequency, severity: srcRow.severity }
          : r));
      }
      return next;
    });
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

  const [electricalCutoffStart, electricalCutoffEnd] = splitCutoffTime(data.electricalCutoffTime);

  return {
    router, user, authLoading, logout,
    cloudId, templateId, isNewTemplate, templateMode,
    data, setData, update, toggleIn, loaded,
    showPreview, setShowPreview,
    permitId, permitStatus, permitStage, chain, adminNote, saving, cloudLoaded,
    templates, templateName, templateWorkType, setTemplateWorkType, templateOrder, setTemplateOrder,
    signatureTarget, setSignatureTarget, saveApprovalPreset, setSaveApprovalPreset,
    loadError,
    attachments, setAttachments, attachCfgs,
    isGuest, isReadOnly, canSubmit,
    handleSave, handleSubmit, handleSaveTemplate, applyTemplateWorkType, hasTemplateFor,
    toggleConfirm, confirmAll, clearConfirm, handleSaveConfirm,
    doReject, doResubmit, handleComplete,
    addSigner, updateSignerName, setSignerSign, removeSigner, setReviewer,
    signatureTitle, signatureInitial, saveSignature,
    electricalCutoffStart, electricalCutoffEnd,
    requestApprovalSignature: () => setSignatureTarget({ kind: "approval" }),
  };
}
