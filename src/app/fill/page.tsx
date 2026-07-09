"use client";
import React, { Suspense, useState } from "react";
import { Section, Row, Text, Area, CheckGroup, RadioGroup } from "@/components/fields";
import JsaEditor from "@/components/JsaEditor";
import FormRenderer from "@/components/FormRenderer";
import {
  WORK_TYPES, GEAR, GENERAL, HOT, CONFINED, ELECTRICAL, ELEVATED, EXCAVATION, HEAVY, RADIATION, PROCESSES,
} from "@/lib/form";
import SignaturePad from "@/components/SignaturePad";
import SignatureField from "@/components/SignatureField";
import { emptyPermit } from "@/lib/types";
import { MANAGERS } from "@/lib/managers";
import AccessGate from "@/components/AccessGate";
import Attachments from "@/components/Attachments";
import { STATUS_LABEL } from "./constants";
import { joinCutoffTime } from "./utils";
import { useFillPermit } from "./useFillPermit";
import ApprovalPanel from "./ApprovalPanel";

function FormListButton({ files }: { files: { path: string; name: string; url: string }[] }) {
  const [open, setOpen] = useState(false);
  if (files.length === 0) return null;
  return (
    <div style={{ position: "relative" }}>
      <button className="primary" onClick={() => setOpen((s) => !s)}>양식 목록</button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,.15)", minWidth: 220, zIndex: 999, padding: 6 }}>
            {files.map((f) => (
              <a
                key={f.path}
                href={f.url}
                download={f.name}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                style={{ display: "block", padding: "8px 10px", fontSize: 13, color: "#1e293b", textDecoration: "none", borderRadius: 6, whiteSpace: "nowrap" }}
              >
                📄 {f.name}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FillInner() {
  const f = useFillPermit();
  const {
    router, user, authLoading, logout,
    templateMode,
    data, update, toggleIn,
    showPreview, setShowPreview,
    permitId, permitStatus, permitStage, chain, adminNote, saving, cloudLoaded, loaded,
    signatureTarget, setSignatureTarget, saveApprovalPreset, setSaveApprovalPreset,
    loadError,
    attachments, setAttachments, attachCfgs, commonFormFiles,
    isGuest, isReadOnly, canSubmit,
    handleSave, handleSubmit, handleSaveTemplate, applyTemplateWorkType, hasTemplateFor,
    toggleConfirm, confirmAll, clearConfirm, handleSaveConfirm,
    doReject, doResubmit, handleComplete,
    addSigner, updateSignerName, removeSigner, setReviewer,
    signatureTitle, signatureInitial, saveSignature,
    electricalCutoffStart, electricalCutoffEnd,
    requestApprovalSignature,
  } = f;

  // 인증 확인 중이거나 미로그인(리다이렉트 대기) 상태에서는 내부 UI를 렌더하지 않음
  if (authLoading || !user) return <div className="loading"><span className="spinner" />불러오는 중…</div>;

  if (!loaded || !cloudLoaded) return <div className="loading"><span className="spinner" />불러오는 중…</div>;

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="panel" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 18, color: "var(--fl-navy-900)" }}>
            {loadError === "notfound" ? "허가서를 찾을 수 없습니다" : "허가서를 불러오지 못했습니다"}
          </h1>
          <p className="note note-error" style={{ justifyContent: "center", marginBottom: 20 }}>
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

  const statusInfo = permitStatus ? STATUS_LABEL[permitStatus] : null;

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
        <FormListButton files={commonFormFiles} />
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
          {!templateMode && permitId && (user?.role === "admin" || user?.role === "manager") && (
            <ApprovalPanel
              user={user}
              data={data}
              permitStatus={permitStatus}
              permitStage={permitStage}
              chain={chain}
              saving={saving}
              setReviewer={setReviewer}
              toggleConfirm={toggleConfirm}
              confirmAll={confirmAll}
              clearConfirm={clearConfirm}
              handleSaveConfirm={handleSaveConfirm}
              doReject={doReject}
              requestApprovalSignature={requestApprovalSignature}
              handleComplete={handleComplete}
              doResubmit={doResubmit}
            />
          )}
          {templateMode && (
            <div className="note note-info" style={{ marginBottom: 12 }}>
              <span className="ico">ℹ</span>
              <span>예시 양식 편집 — <b>작업형태별 체크항목</b>과 <b>Work Sheet(JSA)</b>만 미리 채웁니다. 일반작업은 공통사항이라 함께 편집되며, 이 예시에만 저장됩니다(다른 작업형태와 공유 안 함).</span>
            </div>
          )}
          {!templateMode && !isReadOnly && (
            <div className="toolbar">
              <span className="muted" style={{ flex: 1, margin: 0 }}>※ 예시 양식은 아래 <b>Work Sheet(JSA)</b>의 각 작업형태 행에서 불러올 수 있습니다.</span>
              <button className="mini danger" onClick={() => {
                if (window.confirm("모든 입력을 초기화할까요?")) {
                  f.setData({ ...emptyPermit(), company: user.company || "", applicantDept: user.company || "" });
                }
              }}>초기화</button>
            </div>
          )}

          {!templateMode && (<>
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
            <CheckGroup options={WORK_TYPES.map((w) => ({ v: w.v, label: w.label }))} selected={data.workTypes} onToggle={(v) => toggleIn("workTypes", v)} cols={1} readOnly={isReadOnly} locked={["general"]} />
            {data.workTypes.includes("etc") && <Row label="기타 내용"><Text value={data.workTypeEtc} onChange={(v) => update("workTypeEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>
          </>)}

          {!templateMode && (() => {
            // 선택한 작업형태들의 첨부 설정을 취합 (업로드 표시 여부 + 안내문)
            const rel = data.workTypes.filter((wt) => wt !== "etc");
            const uploadVisible = rel.length === 0 ? true : rel.some((wt) => attachCfgs[wt]?.upload !== false);
            const docLines = rel
              .map((wt) => ({ label: WORK_TYPES.find((w) => w.v === wt)?.label.split(" (")[0] ?? wt, items: attachCfgs[wt]?.items ?? [] }))
              .filter((x) => x.items.length > 0)
              .map((x) => `${x.label}: ${x.items.join(", ")}`);
            // 업로드 숨김이고, 기존 첨부도 없으면 섹션 자체를 표시하지 않음
            if (!uploadVisible && attachments.length === 0) return null;
            return (
              <Section title="📎 첨부파일">
                <Attachments
                  permitId={permitId}
                  ensureId={handleSave}
                  uid={user.uid}
                  canUpload={user.role === "admin" || (isGuest && !isReadOnly)}
                  value={attachments}
                  onChange={setAttachments}
                  requiredDocs={docLines}
                  uploadEnabled={uploadVisible}
                />
              </Section>
            );
          })()}

          {!templateMode && (<>
          <Section title="작업장소 / 공정 (복수 선택)" id="sec-process">
            <p className="muted">선택한 공정 위에 빨간 동그라미가 표시됩니다.</p>
            <CheckGroup options={PROCESSES.map((p) => ({ v: p.name }))} selected={data.processes} onToggle={(v) => toggleIn("processes", v)} cols={3} readOnly={isReadOnly} />
            {data.processes.includes("기타") && <Row label="기타 장소/공정"><Text value={data.processEtc} onChange={(v) => update("processEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>

          <Section title="① 안전보호구">
            <CheckGroup options={GEAR} selected={data.gear} onToggle={(v) => toggleIn("gear", v)} cols={3} readOnly={isReadOnly} />
            {data.gear.includes("기타") && <Row label="기타 보호구"><Text value={data.gearEtc} onChange={(v) => update("gearEtc", v)} readOnly={isReadOnly} /></Row>}
          </Section>
          </>)}

          {/* ②~⑨ : 위에서 선택한 작업형태의 체크리스트만 노출 */}
          {!templateMode && data.workTypes.length === 0 && !isReadOnly && (
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

          {!templateMode && (
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
          )}

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
              onLoadExample={!templateMode && !isReadOnly ? applyTemplateWorkType : undefined}
              canLoadExample={hasTemplateFor}
            />
          </Section>

          {!templateMode && (<>
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
                    ? <img src={s.sign} alt="서명" className="sig-thumb-sm" />
                    : <span className="sig-empty" style={{ width: 90, textAlign: "center" }}>미서명</span>}
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
                  ? <img src={data.applicantSign} alt="신청자 서명" className="sig-thumb-lg" />
                  : <span className="sig-empty">미서명</span>}
                {!isReadOnly && (
                  <button className="mini" onClick={() => setSignatureTarget({ kind: "applicant" })}>
                    {data.applicantSign ? "서명 수정" : "서명"}
                  </button>
                )}
              </div>
            </Row>
          </Section>
          </>)}
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
