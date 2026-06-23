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
} from "@/lib/form";
import { sampleSinwoo } from "@/lib/samples";
import { savePermit, submitPermit, getPermit, PermitStatus } from "@/lib/permits";
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
  const { data, setData, update, toggleIn, reset, loaded } = usePermit({ disableLocalStorage: !!cloudId });

  const [showPreview, setShowPreview] = useState(true);
  const [permitId, setPermitId] = useState<string | null>(cloudId);
  const [permitStatus, setPermitStatus] = useState<PermitStatus | null>(null);
  const [adminNote, setAdminNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(!cloudId);
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

  if (!loaded || !cloudLoaded) return <div style={{ padding: 24 }}>불러오는 중…</div>;

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

  const statusInfo = permitStatus ? STATUS_LABEL[permitStatus] : null;
  const isGuest = user?.role !== "admin";

  return (
    <div className="layout">
      <header className="topbar no-print">
        <img src="/ls_alsco_logo.png" alt="LS Alsco" className="topbar-logo" />
        <h1>환경안전 작업허가서</h1>
        {statusInfo && (
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
          {!isReadOnly && (
            <div className="toolbar">
              <button className="mini" onClick={() => setData(sampleSinwoo())}>예시 채우기</button>
              <button className="mini danger" onClick={() => { if (window.confirm("모든 입력을 초기화할까요?")) reset(); }}>초기화</button>
            </div>
          )}

          <Section title="① 기본 정보">
            <Row label="업체명(부서명)"><Text value={data.company} onChange={(v) => update("company", v)} readOnly={isReadOnly} /></Row>
            <Row label="대표자"><Text value={data.representative} onChange={(v) => update("representative", v)} readOnly={isReadOnly} /></Row>
            <Row label="작업감독자"><Text value={data.supervisor} onChange={(v) => update("supervisor", v)} readOnly={isReadOnly} /></Row>
            <Row label="작업인원"><Text value={data.workerCount} onChange={(v) => update("workerCount", v)} type="number" readOnly={isReadOnly} /></Row>
            <Row label="비상연락망"><Text value={data.emergencyContact} onChange={(v) => update("emergencyContact", v)} placeholder="010-0000-0000" readOnly={isReadOnly} /></Row>
            <Row label="작업일자" hint="당일만 · 여러 날은 날짜만 바꿔 재발급"><Text value={data.workDate} onChange={(v) => update("workDate", v)} type="date" readOnly={isReadOnly} /></Row>
            <div className="tworow">
              <Row label="시작시간"><Text value={data.startTime} onChange={(v) => update("startTime", v)} type="time" readOnly={isReadOnly} /></Row>
              <Row label="종료시간"><Text value={data.endTime} onChange={(v) => update("endTime", v)} type="time" readOnly={isReadOnly} /></Row>
            </div>
            <Row label="작업내용"><Area value={data.workContent} onChange={(v) => update("workContent", v)} readOnly={isReadOnly} /></Row>
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
            <p className="muted">대표자가 작업자에게 교육 후 서명. 작업자 서명란은 출력 후 현장 수기.</p>
            <div className="tworow">
              <Row label="대표자(강사) 성명"><Text value={data.representativeSignName} onChange={(v) => update("representativeSignName", v)} readOnly={isReadOnly} /></Row>
              <Row label="교육 일자"><Text value={data.representativeSignDate} onChange={(v) => update("representativeSignDate", v)} type="date" readOnly={isReadOnly} /></Row>
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
    </div>
  );
}

export default function FillPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>불러오는 중…</div>}>
      <FillInner />
    </Suspense>
  );
}
