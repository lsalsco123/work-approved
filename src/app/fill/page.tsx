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

type UiRole = "guest" | "admin";

function selectedCircleCells(d: ReturnType<typeof usePermit>["data"]): string[] {
  const refs: string[] = [];
  const add = (defs: { v: string; cell: string }[], sel: string[]) =>
    defs.forEach((x) => { if (sel.includes(x.v)) refs.push(x.cell); });
  add(WORK_TYPES as any, d.workTypes);
  add(GEAR, d.gear); add(GENERAL, d.general); add(HOT, d.hot); add(CONFINED, d.confined);
  add(ELECTRICAL, d.electrical); add(ELEVATED, d.elevated); add(EXCAVATION, d.excavation);
  add(HEAVY, d.heavy); add(RADIATION, d.radiation);
  return refs;
}

const STATUS_LABEL: Record<PermitStatus, { text: string; color: string }> = {
  draft:     { text: "임시저장", color: "#94a3b8" },
  submitted: { text: "검토대기", color: "#f59e0b" },
  approved:  { text: "승인완료", color: "#22c55e" },
  rejected:  { text: "반려됨",   color: "#ef4444" },
  completed: { text: "완료",     color: "#64748b" },
};

function FillInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const cloudId = searchParams.get("id");
  const { data, setData, update, toggleIn, reset, loaded } = usePermit({ disableLocalStorage: !!cloudId });

  const [uiRole, setUiRole] = useState<UiRole>("guest");
  const [showPreview, setShowPreview] = useState(true);
  const [permitId, setPermitId] = useState<string | null>(cloudId);
  const [permitStatus, setPermitStatus] = useState<PermitStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(!cloudId);

  // 클라우드에서 허가서 로드
  useEffect(() => {
    if (!cloudId) return;
    getPermit(cloudId).then((rec) => {
      if (rec) {
        setData(rec.data);
        setPermitStatus(rec.status);
        if (rec.status !== "draft") setUiRole("admin");
      }
      setCloudLoaded(true);
    });
  }, [cloudId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded || !cloudLoaded) return <div style={{ padding: 24 }}>불러오는 중…</div>;

  const isReadOnly = !!permitStatus && permitStatus !== "draft";

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

  const handleSubmit = async () => {
    if (!user) { alert("로그인 후 이용 가능합니다."); return; }
    let id = permitId;
    if (!id) id = await handleSave();
    if (!id) return;
    if (!window.confirm("작업허가서를 관리자에게 제출하시겠습니까?")) return;
    setSaving(true);
    try {
      await submitPermit(id);
      setPermitStatus("submitted");
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: data.company,
          workContent: data.workContent,
          workDate: data.workDate,
          startTime: data.startTime,
          endTime: data.endTime,
          supervisor: data.supervisor,
          permitId: id,
        }),
      }).catch(() => {});
    } catch (e) {
      alert("제출 실패: " + e);
    } finally {
      setSaving(false);
    }
  };

  const handleAdminSave = async () => {
    if (!permitId) { alert("먼저 저장하세요."); return; }
    setSaving(true);
    try {
      await savePermit(user!.uid, user!.email, user!.company || data.company, data, permitId);
    } catch (e) {
      alert("저장 실패: " + e);
    } finally {
      setSaving(false);
    }
  };

  const confirmAll = () => update("confirmed", selectedCircleCells(data));
  const clearConfirm = () => update("confirmed", []);
  const syncDates = () => {
    const d = data.workDate;
    setData((p) => ({
      ...p, applicantDate: d, representativeSignDate: d,
      admin: {
        issue: { ...p.admin.issue, date: d }, review: { ...p.admin.review, date: d },
        approve: { ...p.admin.approve, date: d }, complete: { ...p.admin.complete, date: d },
      },
    }));
  };

  const statusInfo = permitStatus ? STATUS_LABEL[permitStatus] : null;

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
            <button onClick={() => router.push(user.role === "admin" ? "/admin" : "/fill")}>
              {user.role === "admin" ? "목록" : "내 허가서"}
            </button>
          </>
        ) : (
          <button onClick={() => router.push("/login")}>로그인</button>
        )}
        <div className="rolesw">
          <button className={uiRole === "guest" ? "on" : ""} onClick={() => setUiRole("guest")}>업체(작성)</button>
          <button className={uiRole === "admin" ? "on" : ""} onClick={() => setUiRole("admin")}>관리자(승인)</button>
        </div>
        <button onClick={() => setShowPreview((s) => !s)}>{showPreview ? "미리보기 숨기기" : "미리보기"}</button>
        {user && !isReadOnly && uiRole === "guest" && (
          <>
            <button onClick={handleSave} disabled={saving}>{saving ? "저장 중…" : "클라우드 저장"}</button>
            {(!permitStatus || permitStatus === "draft") && (
              <button onClick={handleSubmit} disabled={saving} className="primary">제출</button>
            )}
          </>
        )}
        {user?.role === "admin" && permitId && (
          <button onClick={handleAdminSave} disabled={saving}>{saving ? "저장 중…" : "승인정보 저장"}</button>
        )}
        <button onClick={() => window.print()} className="primary">인쇄 / PDF</button>
      </header>

      <div className="body">
        <div className="formcol no-print">
          {!isReadOnly && (
            <div className="toolbar">
              <button className="mini" onClick={() => setData(sampleSinwoo())}>예시 채우기</button>
              <button className="mini danger" onClick={() => { if (window.confirm("모든 입력을 초기화할까요?")) reset(); }}>초기화</button>
            </div>
          )}
          {permitStatus === "rejected" && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", marginBottom: 10, fontSize: 13, color: "#dc2626" }}>
              ⚠ 이 허가서는 반려되었습니다. 수정 후 재제출이 필요하면 관리자에게 문의하세요.
            </div>
          )}

          <Section title="① 기본 정보">
            <Row label="업체명(부서명)"><Text value={data.company} onChange={(v) => update("company", v)} /></Row>
            <Row label="대표자"><Text value={data.representative} onChange={(v) => update("representative", v)} /></Row>
            <Row label="작업감독자"><Text value={data.supervisor} onChange={(v) => update("supervisor", v)} /></Row>
            <Row label="작업인원"><Text value={data.workerCount} onChange={(v) => update("workerCount", v)} type="number" /></Row>
            <Row label="비상연락망"><Text value={data.emergencyContact} onChange={(v) => update("emergencyContact", v)} placeholder="010-0000-0000" /></Row>
            <Row label="작업일자" hint="당일만 · 여러 날은 날짜만 바꿔 재발급"><Text value={data.workDate} onChange={(v) => update("workDate", v)} type="date" /></Row>
            <div className="tworow">
              <Row label="시작시간"><Text value={data.startTime} onChange={(v) => update("startTime", v)} type="time" /></Row>
              <Row label="종료시간"><Text value={data.endTime} onChange={(v) => update("endTime", v)} type="time" /></Row>
            </div>
            <Row label="작업내용"><Area value={data.workContent} onChange={(v) => update("workContent", v)} /></Row>
            <button className="mini" onClick={syncDates}>신청·승인 날짜를 작업일자로 동기화</button>
          </Section>

          <Section title="⑦ 작업형태 (복수 선택)">
            <CheckGroup options={WORK_TYPES.map((w) => ({ v: w.v, label: w.label }))} selected={data.workTypes} onToggle={(v) => toggleIn("workTypes", v)} cols={1} />
            {data.workTypes.includes("etc") && <Row label="기타 내용"><Text value={data.workTypeEtc} onChange={(v) => update("workTypeEtc", v)} /></Row>}
          </Section>

          <Section title="작업장소 / 공정 (복수 선택)">
            <p className="muted">선택한 공정 위에 빨간 동그라미가 표시됩니다.</p>
            <CheckGroup options={PROCESSES.map((p) => ({ v: p.name }))} selected={data.processes} onToggle={(v) => toggleIn("processes", v)} cols={3} />
          </Section>

          <Section title="① 안전보호구">
            <CheckGroup options={GEAR} selected={data.gear} onToggle={(v) => toggleIn("gear", v)} cols={3} />
            {data.gear.includes("기타") && <Row label="기타 보호구"><Text value={data.gearEtc} onChange={(v) => update("gearEtc", v)} /></Row>}
          </Section>

          <Section title="② 일반작업 (공통사항)" defaultOpen={false}>
            <CheckGroup options={GENERAL} selected={data.general} onToggle={(v) => toggleIn("general", v)} cols={1} />
          </Section>

          <Section title="③ 화기작업" defaultOpen={false}>
            <CheckGroup options={HOT} selected={data.hot} onToggle={(v) => toggleIn("hot", v)} cols={1} />
            <div className="tworow">
              <Row label="화재감시자"><Text value={data.hotFireWatcher} onChange={(v) => update("hotFireWatcher", v)} /></Row>
              <Row label="소방안전관리자"><Text value={data.hotFireManager} onChange={(v) => update("hotFireManager", v)} /></Row>
            </div>
          </Section>

          <Section title="④ 밀폐공간작업" defaultOpen={false}>
            <CheckGroup options={CONFINED} selected={data.confined} onToggle={(v) => toggleIn("confined", v)} cols={1} />
            <Row label="감시인"><Text value={data.confinedWatcher} onChange={(v) => update("confinedWatcher", v)} /></Row>
          </Section>

          <Section title="⑤ 전기차단(정전)작업" defaultOpen={false}>
            <CheckGroup options={ELECTRICAL} selected={data.electrical} onToggle={(v) => toggleIn("electrical", v)} cols={1} />
            <div className="tworow">
              <Row label="차단시간"><Text value={data.electricalCutoffTime} onChange={(v) => update("electricalCutoffTime", v)} /></Row>
              <Row label="차단인"><Text value={data.electricalCutoffPerson} onChange={(v) => update("electricalCutoffPerson", v)} /></Row>
            </div>
          </Section>

          <Section title="⑥ 고소작업" defaultOpen={false}>
            <CheckGroup options={ELEVATED} selected={data.elevated} onToggle={(v) => toggleIn("elevated", v)} cols={1} />
          </Section>

          <Section title="⑦ 굴착작업" defaultOpen={false}>
            <CheckGroup options={EXCAVATION} selected={data.excavation} onToggle={(v) => toggleIn("excavation", v)} cols={1} />
            <Row label="매설확인자"><Text value={data.excavationBuriedChecker} onChange={(v) => update("excavationBuriedChecker", v)} /></Row>
          </Section>

          <Section title="⑧ 중장비취급작업" defaultOpen={false}>
            <CheckGroup options={HEAVY} selected={data.heavy} onToggle={(v) => toggleIn("heavy", v)} cols={1} />
            <div className="tworow">
              <Row label="신호수/유도자"><Text value={data.heavySignaler} onChange={(v) => update("heavySignaler", v)} /></Row>
              <Row label="장비종류"><Text value={data.heavyEquipType} onChange={(v) => update("heavyEquipType", v)} /></Row>
            </div>
          </Section>

          <Section title="⑨ 방사능작업" defaultOpen={false}>
            <CheckGroup options={RADIATION} selected={data.radiation} onToggle={(v) => toggleIn("radiation", v)} cols={1} />
          </Section>

          <Section title="⑪ 에너지원 안전잠금장치">
            <RadioGroup
              options={[{ v: "none", label: "해당사항 없음" }, { v: "general", label: "②항 에너지원차단·표찰부착 체크 시 조치사항 기재" }]}
              value={data.energyMode as any}
              onChange={(v) => update("energyMode", v as any)}
            />
            {data.energyMode === "general" && (
              <>
                <label className="chk" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={data.energyDeferred} onChange={(e) => update("energyDeferred", e.target.checked)} />
                  <span>발급 후 작성 예정 (차단대상/위치/차단인을 현장에서 기재)</span>
                </label>
                {!data.energyDeferred && (
                  <>
                    <Row label="에너지 차단 대상"><Text value={data.energyTarget} onChange={(v) => update("energyTarget", v)} /></Row>
                    <Row label="차단 위치"><Text value={data.energyLocation} onChange={(v) => update("energyLocation", v)} /></Row>
                    <Row label="차단인"><Text value={data.energyPerson} onChange={(v) => update("energyPerson", v)} /></Row>
                  </>
                )}
              </>
            )}
          </Section>

          <Section title="⑫ Work Sheet (JSA)">
            <div className="tworow">
              <Row label="작성자/담당자"><Text value={data.worksheetAuthor} onChange={(v) => update("worksheetAuthor", v)} /></Row>
              <Row label="위험성평가 참여자"><Text value={data.riskParticipants} onChange={(v) => update("riskParticipants", v)} /></Row>
            </div>
            <JsaEditor rows={data.jsa} onChange={(r) => update("jsa", r)} />
          </Section>

          <Section title="환경안전 교육실시 및 서약">
            <p className="muted">대표자가 작업자에게 교육 후 서명. 작업자 서명란은 출력 후 현장 수기.</p>
            <div className="tworow">
              <Row label="대표자(강사) 성명"><Text value={data.representativeSignName} onChange={(v) => update("representativeSignName", v)} /></Row>
              <Row label="교육 일자"><Text value={data.representativeSignDate} onChange={(v) => update("representativeSignDate", v)} type="date" /></Row>
            </div>
          </Section>

          <Section title="개인정보 수집·이용 동의">
            <p className="muted">※ 수집항목: 성명·소속·주소·전화번호·휴대전화번호 / 목적: 환경안전작업 허가 및 관리 / 보유: 환경안전작업허가 기간. 거부 시 작업허가 불가.</p>
            <RadioGroup options={[{ v: "agree", label: "동의 함" }, { v: "disagree", label: "동의하지 않음" }]} value={data.privacyConsent as any} onChange={(v) => update("privacyConsent", v as any)} />
          </Section>

          <Section title="신청 (업체)">
            <div className="tworow">
              <Row label="소속"><Text value={data.applicantDept} onChange={(v) => update("applicantDept", v)} /></Row>
              <Row label="성명"><Text value={data.applicantName} onChange={(v) => update("applicantName", v)} /></Row>
            </div>
            <Row label="신청일자"><Text value={data.applicantDate} onChange={(v) => update("applicantDate", v)} type="date" /></Row>
          </Section>

          {uiRole === "admin" && (
            <Section title="⑰ 작업승인 (관리자 전용)">
              <div className="admin-note">환경안전팀 확인(○) 표시</div>
              <div className="tworow">
                <button className="mini" onClick={confirmAll}>선택 항목 전체 확인(○ 채우기)</button>
                <button className="mini danger" onClick={clearConfirm}>확인 표시 해제</button>
              </div>
              {(["issue", "review", "approve", "complete"] as const).map((k) => {
                const labels = { issue: "발급", review: "검토", approve: "승인", complete: "작업완료 확인" };
                const s = data.admin[k];
                return (
                  <div key={k} className="admin-row">
                    <strong>{labels[k]}</strong>
                    <input className="inp" placeholder="소속" value={s.dept || ""} onChange={(e) => setData((p) => ({ ...p, admin: { ...p.admin, [k]: { ...p.admin[k], dept: e.target.value } } }))} />
                    <input className="inp" placeholder="성명" value={s.name} onChange={(e) => setData((p) => ({ ...p, admin: { ...p.admin, [k]: { ...p.admin[k], name: e.target.value } } }))} />
                    <input className="inp" type="date" value={s.date || ""} onChange={(e) => setData((p) => ({ ...p, admin: { ...p.admin, [k]: { ...p.admin[k], date: e.target.value } } }))} />
                  </div>
                );
              })}
            </Section>
          )}
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
