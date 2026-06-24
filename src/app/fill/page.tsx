"use client";
import React, { Suspense, useEffect, useState } from "react";
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
import { MANAGERS, SAFETY_REVIEWERS } from "@/lib/managers";
import { savePermit, submitPermit, getPermit, saveAdminFields, PermitStatus } from "@/lib/permits";
import {
  listTemplates, getTemplate, createTemplate, updateTemplate, PermitTemplate,
} from "@/lib/templates";
import { auth } from "@/lib/firebase";

const STATUS_LABEL: Record<PermitStatus, { text: string; color: string }> = {
  draft:     { text: "임시저장", color: "#94a3b8" },
  submitted: { text: "제출됨",   color: "#f59e0b" },
  approved:  { text: "승인완료", color: "#22c55e" },
  rejected:  { text: "반려됨",   color: "#ef4444" },
  completed: { text: "완료",     color: "#64748b" },
};

function FillInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const cloudId = searchParams.get("id");
  // 관리자 예시 양식 편집 모드: ?template=<id>(수정) / ?templateNew=1(신규)
  const templateId = searchParams.get("template");
  const isNewTemplate = searchParams.get("templateNew") === "1";
  const templateMode = !!templateId || isNewTemplate;
  const { data, setData, update, toggleIn, reset, loaded } = usePermit({ disableLocalStorage: !!cloudId || templateMode });

  const [showPreview, setShowPreview] = useState(true);
  const [permitId, setPermitId] = useState<string | null>(cloudId);
  const [permitStatus, setPermitStatus] = useState<PermitStatus | null>(null);
  const [adminNote, setAdminNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(!cloudId && !templateId);
  // 작성 모드에서 게스트가 고를 예시 양식 목록
  const [templates, setTemplates] = useState<PermitTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateWorkType, setTemplateWorkType] = useState("");
  const [templateOrder, setTemplateOrder] = useState(999);
  // 서명 팝업 대상 참여자 인덱스 (null=닫힘)
  const [signingIndex, setSigningIndex] = useState<number | null>(null);
  // 클라우드 허가서 로드 결과: null=정상, "notfound"=문서 없음/권한 없음, "error"=조회 실패
  const [loadError, setLoadError] = useState<null | "notfound" | "error">(null);

  useEffect(() => {
    if (!cloudId) return;
    getPermit(cloudId)
      .then((rec) => {
        if (rec) {
          setData(rec.data);
          setPermitStatus(rec.status);
          setAdminNote(rec.adminNote ?? "");
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
            <button className="primary" onClick={() => router.push("/fill")}>새 허가서 작성</button>
            <button onClick={() => router.push("/")}>처음으로</button>
          </div>
        </div>
      </div>
    );
  }

  // draft / rejected 상태에서만 편집 가능 (반려건은 수정 후 재제출 허용)
  const isReadOnly = !!permitStatus && permitStatus !== "draft" && permitStatus !== "rejected";
  const canSubmit = !permitStatus || permitStatus === "draft" || permitStatus === "rejected";

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

  const validate = (): string[] => {
    const miss: string[] = [];
    if (!data.company.trim()) miss.push("업체명(부서명)");
    if (!data.supervisor.trim()) miss.push("작업감독자");
    if (!data.manager) miss.push("담당자(의뢰자)");
    if (!data.workDate) miss.push("작업일자");
    if (!data.workContent.trim()) miss.push("작업내용");
    if (data.privacyConsent !== "agree") miss.push("개인정보 수집·이용 동의(동의 함)");
    return miss;
  };

  const handleSubmit = async () => {
    if (!user) { alert("로그인 후 이용 가능합니다."); return; }
    const missing = validate();
    if (missing.length) {
      alert("다음 필수 항목을 확인해주세요:\n\n· " + missing.join("\n· "));
      return;
    }
    let id = permitId;
    if (!id) id = await handleSave();
    if (!id) return;
    if (!window.confirm("작업허가서를 제출하시겠습니까? 제출 후에는 수정이 불가합니다.")) return;
    setSaving(true);
    try {
      await submitPermit(id);
      setPermitStatus("submitted");
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
        let notifyOk = nr.ok;
        try {
          const nj = await nr.json();
          notifyOk = notifyOk && nj.ok !== false;
          if (!notifyOk) console.error("이메일 전송 실패:", nj.error);
        } catch {
          notifyOk = false;
        }
        if (!notifyOk) {
          alert("제출은 완료되었으나 관리자 알림 메일 발송에 실패했습니다. 관리자에게 직접 알려주세요.");
        }
      } catch (ne) {
        console.error("이메일 API 호출 실패:", ne);
        alert("제출은 완료되었으나 관리자 알림 메일 발송에 실패했습니다. 관리자에게 직접 알려주세요.");
      }
    } catch (e) {
      alert("제출 실패: " + e);
    } finally {
      setSaving(false);
    }
  };

  const syncDates = () => {
    const d = data.workDate;
    setData((p) => ({ ...p, applicantDate: d, representativeSignDate: d }));
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
      setData(t.data);
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

  const statusInfo = permitStatus ? STATUS_LABEL[permitStatus] : null;
  const isGuest = user?.role !== "admin";

  return (
    <div className="layout">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>{templateMode ? "예시 양식 편집" : "환경안전 작업허가서"}</h1>
        {templateMode && (
          <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 4, background: "#7c3aed", color: "#fff", fontWeight: 700 }}>
            관리자 · 예시 양식
          </span>
        )}
        {!templateMode && statusInfo && (
          <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 4, background: statusInfo.color, color: "#fff", fontWeight: 700 }}>
            {statusInfo.text}
          </span>
        )}
        <div className="spacer" />
        {user ? (
          <>
            <span style={{ fontSize: 12, opacity: 0.75, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
            {!isGuest && (
              <button onClick={() => router.push("/admin")}>목록</button>
            )}
            <button onClick={() => { logout(); router.replace("/login"); }}>로그아웃</button>
          </>
        ) : (
          <button onClick={() => router.push("/login")}>로그인</button>
        )}
        {isReadOnly && (
          <button onClick={() => router.push("/fill")}>새 허가서 작성</button>
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
        <div className="no-print" style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca", padding: "12px 20px", color: "#991b1b", fontSize: 13 }}>
          <strong>반려됨</strong> — 내용을 수정한 뒤 다시 제출하실 수 있습니다.
          {adminNote && <div style={{ marginTop: 4, color: "#7f1d1d" }}>사유: {adminNote}</div>}
        </div>
      )}
      {permitStatus === "approved" && (
        <div className="no-print" style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", padding: "12px 20px", color: "#166534", fontSize: 13 }}>
          <strong>승인 완료</strong> — 인쇄/PDF로 출력하여 현장에 비치하세요.
        </div>
      )}

      <div className="body">
        <div className="formcol no-print">
          {!templateMode && user?.role === "admin" && permitId && (() => {
            const items = confirmableItems(data);
            return (
              <div style={{ border: "1px solid #c7d2fe", borderRadius: 10, padding: 14, marginBottom: 14, background: "#eef2ff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14, color: "#3730a3" }}>관리자 확인</strong>
                  <span style={{ fontSize: 12, color: "#64748b" }}>업체가 체크한 항목을 확인하면 ●로 표시됩니다.</span>
                  <div style={{ flex: 1 }} />
                  <button className="mini" onClick={confirmAll}>일괄 확인</button>
                  <button className="mini" onClick={clearConfirm}>전체 해제</button>
                  <button className="mini" onClick={handleSaveConfirm} disabled={saving} style={{ background: "#4f46e5", color: "#fff" }}>
                    {saving ? "저장 중…" : "확인 저장"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 10, fontSize: 13 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    검토자(환경안전):
                    <select className="inp" value={data.admin.review.name} onChange={(e) => setReviewer(e.target.value)}>
                      <option value="">선택</option>
                      {SAFETY_REVIEWERS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <span style={{ color: "#475569" }}>승인: <strong>공장장 이태훈</strong> <span style={{ color: "#94a3b8" }}>(자동)</span></span>
                </div>
                {items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>확인할 체크 항목이 없습니다.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {items.map((it) => {
                      const on = data.confirmed.includes(it.ref);
                      return (
                        <button
                          key={it.ref}
                          onClick={() => toggleConfirm(it.ref)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            border: `1px solid ${on ? "#6366f1" : "#cbd5e1"}`,
                            background: on ? "#e0e7ff" : "#fff",
                            borderRadius: 16, padding: "4px 10px", fontSize: 12, cursor: "pointer",
                            color: on ? "#3730a3" : "#475569",
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{on ? "●" : "○"}</span>{it.label}
                        </button>
                      );
                    })}
                  </div>
                )}
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
                  <button className="mini" onClick={() => setData(sampleGeneral())}>예시 채우기</button>
                )
              )}
              <button className="mini danger" onClick={() => { if (window.confirm("모든 입력을 초기화할까요?")) reset(); }}>초기화</button>
            </div>
          )}

          <Section title="① 기본 정보">
            <Row label="업체명(부서명)" required><Text value={data.company} onChange={(v) => update("company", v)} readOnly={isReadOnly} /></Row>
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
            <Row label="비상연락망"><Text value={data.emergencyContact} onChange={(v) => update("emergencyContact", v)} placeholder="010-0000-0000" readOnly={isReadOnly} /></Row>
            <Row label="작업일자" required hint="당일만 · 여러 날은 날짜만 바꿔 재발급"><Text value={data.workDate} onChange={(v) => update("workDate", v)} type="date" readOnly={isReadOnly} /></Row>
            <div className="tworow">
              <Row label="시작시간"><Text value={data.startTime} onChange={(v) => update("startTime", v)} type="time" readOnly={isReadOnly} /></Row>
              <Row label="종료시간"><Text value={data.endTime} onChange={(v) => update("endTime", v)} type="time" readOnly={isReadOnly} /></Row>
            </div>
            <Row label="작업내용" required><Area value={data.workContent} onChange={(v) => update("workContent", v)} readOnly={isReadOnly} /></Row>
            {!isReadOnly && <button className="mini" onClick={syncDates}>신청 날짜를 작업일자로 동기화</button>}
          </Section>

          <Section title="⑦ 작업형태 (복수 선택)">
            <CheckGroup options={WORK_TYPES.map((w) => ({ v: w.v, label: w.label }))} selected={data.workTypes} onToggle={(v) => toggleIn("workTypes", v)} cols={1} readOnly={isReadOnly} />
            {data.workTypes.includes("etc") && <Row label="기타 내용"><Text value={data.workTypeEtc} onChange={(v) => update("workTypeEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          <Section title="작업장소 / 공정 (복수 선택)">
            <p className="muted">선택한 공정 위에 빨간 동그라미가 표시됩니다.</p>
            <CheckGroup options={PROCESSES.map((p) => ({ v: p.name }))} selected={data.processes} onToggle={(v) => toggleIn("processes", v)} cols={3} readOnly={isReadOnly} />
            {data.processes.includes("기타") && <Row label="기타 장소/공정"><Text value={data.processEtc} onChange={(v) => update("processEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          <Section title="① 안전보호구">
            <CheckGroup options={GEAR} selected={data.gear} onToggle={(v) => toggleIn("gear", v)} cols={3} readOnly={isReadOnly} />
            {data.gear.includes("기타") && <Row label="기타 보호구"><Text value={data.gearEtc} onChange={(v) => update("gearEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          <Section title="② 일반작업 (공통사항)" defaultOpen={false}>
            <CheckGroup options={GENERAL} selected={data.general} onToggle={(v) => toggleIn("general", v)} cols={1} readOnly={isReadOnly} />
          </Section>

          <Section title="③ 화기작업" defaultOpen={false}>
            <CheckGroup options={HOT} selected={data.hot} onToggle={(v) => toggleIn("hot", v)} cols={1} readOnly={isReadOnly} />
            <div className="tworow">
              <Row label="화재감시자"><Text value={data.hotFireWatcher} onChange={(v) => update("hotFireWatcher", v)} readOnly={isReadOnly} /></Row>
              <Row label="소방안전관리자"><Text value={data.hotFireManager} onChange={(v) => update("hotFireManager", v)} readOnly={isReadOnly} /></Row>
            </div>
          </Section>

          <Section title="④ 밀폐공간작업" defaultOpen={false}>
            <CheckGroup options={CONFINED} selected={data.confined} onToggle={(v) => toggleIn("confined", v)} cols={1} readOnly={isReadOnly} />
            <Row label="감시인"><Text value={data.confinedWatcher} onChange={(v) => update("confinedWatcher", v)} readOnly={isReadOnly} /></Row>
          </Section>

          <Section title="⑤ 전기차단(정전)작업" defaultOpen={false}>
            <CheckGroup options={ELECTRICAL} selected={data.electrical} onToggle={(v) => toggleIn("electrical", v)} cols={1} readOnly={isReadOnly} />
            <div className="tworow">
              <Row label="차단시간"><Text value={data.electricalCutoffTime} onChange={(v) => update("electricalCutoffTime", v)} readOnly={isReadOnly} /></Row>
              <Row label="차단인"><Text value={data.electricalCutoffPerson} onChange={(v) => update("electricalCutoffPerson", v)} readOnly={isReadOnly} /></Row>
            </div>
          </Section>

          <Section title="⑥ 고소작업" defaultOpen={false}>
            <CheckGroup options={ELEVATED} selected={data.elevated} onToggle={(v) => toggleIn("elevated", v)} cols={1} readOnly={isReadOnly} />
          </Section>

          <Section title="⑦ 굴착작업" defaultOpen={false}>
            <CheckGroup options={EXCAVATION} selected={data.excavation} onToggle={(v) => toggleIn("excavation", v)} cols={1} readOnly={isReadOnly} />
            <Row label="매설확인자"><Text value={data.excavationBuriedChecker} onChange={(v) => update("excavationBuriedChecker", v)} readOnly={isReadOnly} /></Row>
          </Section>

          <Section title="⑧ 중장비취급작업" defaultOpen={false}>
            <CheckGroup options={HEAVY} selected={data.heavy} onToggle={(v) => toggleIn("heavy", v)} cols={1} readOnly={isReadOnly} />
            <div className="tworow">
              <Row label="신호수/유도자"><Text value={data.heavySignaler} onChange={(v) => update("heavySignaler", v)} readOnly={isReadOnly} /></Row>
              <Row label="장비종류"><Text value={data.heavyEquipType} onChange={(v) => update("heavyEquipType", v)} readOnly={isReadOnly} /></Row>
            </div>
          </Section>

          <Section title="⑨ 방사능작업" defaultOpen={false}>
            <CheckGroup options={RADIATION} selected={data.radiation} onToggle={(v) => toggleIn("radiation", v)} cols={1} readOnly={isReadOnly} />
          </Section>

          <Section title="⑪ 에너지원 안전잠금장치">
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
                  </>
                )}
              </>
            )}
          </Section>

          <Section title="⑫ Work Sheet (JSA)">
            <div className="tworow">
              <Row label="작성자/담당자"><Text value={data.worksheetAuthor} onChange={(v) => update("worksheetAuthor", v)} readOnly={isReadOnly} /></Row>
              <Row label="위험성평가 참여자"><Text value={data.riskParticipants} onChange={(v) => update("riskParticipants", v)} readOnly={isReadOnly} /></Row>
            </div>
            <JsaEditor rows={data.jsa} onChange={(r) => update("jsa", r)} readOnly={isReadOnly} />
          </Section>

          <Section title="환경안전 교육실시 및 서약">
            <p className="muted">대표자가 함께 작업하는 인원을 등록하고, 각자 직접 서명합니다. (최대 18명)</p>
            <div className="tworow">
              <Row label="대표자(강사) 성명"><Text value={data.representativeSignName} onChange={(v) => update("representativeSignName", v)} readOnly={isReadOnly} /></Row>
              <Row label="교육 일자"><Text value={data.representativeSignDate} onChange={(v) => update("representativeSignDate", v)} type="date" readOnly={isReadOnly} /></Row>
            </div>
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
                      <button className="mini" onClick={() => setSigningIndex(i)}>{s.sign ? "서명 수정" : "서명"}</button>
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

          <Section title="개인정보 수집·이용 동의">
            <p className="muted">※ 수집항목: 성명·소속·주소·전화번호·휴대전화번호 / 목적: 환경안전작업 허가 및 관리 / 보유: 환경안전작업허가 기간. 거부 시 작업허가 불가.</p>
            <RadioGroup options={[{ v: "agree", label: "동의 함" }, { v: "disagree", label: "동의하지 않음" }]} value={data.privacyConsent as any} onChange={(v) => update("privacyConsent", v as any)} readOnly={isReadOnly} />
          </Section>

          <Section title="신청 (업체)">
            <div className="tworow">
              <Row label="소속"><Text value={data.applicantDept} onChange={(v) => update("applicantDept", v)} readOnly={isReadOnly} /></Row>
              <Row label="성명"><Text value={data.applicantName} onChange={(v) => update("applicantName", v)} readOnly={isReadOnly} /></Row>
            </div>
            <Row label="신청일자"><Text value={data.applicantDate} onChange={(v) => update("applicantDate", v)} type="date" readOnly={isReadOnly} /></Row>
          </Section>
        </div>

        {showPreview && (
          <div className="previewcol">
            <FormRenderer data={data} />
          </div>
        )}
      </div>

      {signingIndex !== null && (
        <SignaturePad
          title={`${data.eduSigners[signingIndex]?.name || `${signingIndex + 1}번`} 참여자 서명`}
          initial={data.eduSigners[signingIndex]?.sign}
          onSave={(d) => { setSignerSign(signingIndex, d); setSigningIndex(null); }}
          onClose={() => setSigningIndex(null)}
        />
      )}
    </div>
  );
}

export default function FillPage() {
  return (
    <Suspense fallback={<div className="loading"><span className="spinner" />불러오는 중…</div>}>
      <FillInner />
    </Suspense>
  );
}
