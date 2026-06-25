"use client";
import React, { useState } from "react";
import { JsaRow, riskGrade } from "@/lib/types";

const blank: JsaRow = { step: "", hazard: "", frequency: "", severity: "", current: "", reduction: "" };

// 위험등급 색상/설명 (riskGrade 로직과 일치)
const GRADE_INFO: Record<string, { color: string; label: string }> = {
  A: { color: "#dc2626", label: "매우 높음" },
  B: { color: "#ea580c", label: "높음" },
  C: { color: "#f59e0b", label: "보통" },
  D: { color: "#65a30d", label: "낮음" },
  E: { color: "#16a34a", label: "매우 낮음" },
};
const FREQ_DESC = ["", "거의 발생 안 함", "드물게 발생", "가끔 발생", "자주 발생", "매우 빈번"];
const SEV_DESC = ["", "경미(무상해)", "경상", "휴업 재해", "중상해", "사망·중대재해"];

function RefTableModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 620, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>위험성평가 참고표</h3>
          <div style={{ flex: 1 }} />
          <button className="mini" onClick={onClose}>닫기 ✕</button>
        </div>

        <p style={{ fontSize: 13, color: "#475569", margin: "0 0 14px" }}>
          위험등급 = <b>발생빈도 × 치명도</b> 점수로 자동 계산됩니다.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <table className="ref-tbl">
            <thead><tr><th>발생빈도</th><th>기준</th></tr></thead>
            <tbody>{[1, 2, 3, 4, 5].map((n) => <tr key={n}><td style={{ textAlign: "center", fontWeight: 700 }}>{n}</td><td>{FREQ_DESC[n]}</td></tr>)}</tbody>
          </table>
          <table className="ref-tbl">
            <thead><tr><th>치명도</th><th>기준</th></tr></thead>
            <tbody>{[1, 2, 3, 4, 5].map((n) => <tr key={n}><td style={{ textAlign: "center", fontWeight: 700 }}>{n}</td><td>{SEV_DESC[n]}</td></tr>)}</tbody>
          </table>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>위험등급 매트릭스 (행=치명도, 열=발생빈도)</div>
        <table className="ref-matrix">
          <thead>
            <tr><th></th>{[1, 2, 3, 4, 5].map((f) => <th key={f}>빈도 {f}</th>)}</tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((sev) => (
              <tr key={sev}>
                <th>치명 {sev}</th>
                {[1, 2, 3, 4, 5].map((freq) => {
                  const g = riskGrade(freq, sev);
                  return <td key={freq} style={{ background: GRADE_INFO[g].color, color: "#fff", textAlign: "center", fontWeight: 700 }}>{g}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {Object.entries(GRADE_INFO).map(([g, info]) => (
            <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: info.color, display: "inline-block" }} />
              <b>{g}</b> {info.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function JsaEditor({ rows, onChange, readOnly, stepOptions }: {
  rows: JsaRow[]; onChange: (r: JsaRow[]) => void; readOnly?: boolean; stepOptions?: string[];
}) {
  const [showRef, setShowRef] = useState(false);
  const set = (i: number, patch: Partial<JsaRow>) => {
    if (readOnly) return;
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const add = () => { if (!readOnly && rows.length < 6) onChange([...rows, { ...blank }]); };
  const del = (i: number) => { if (!readOnly) onChange(rows.filter((_, j) => j !== i)); };
  const useSelect = !readOnly && !!stepOptions && stepOptions.length > 0;

  return (
    <div className="jsa">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <p className="muted" style={{ flex: 1 }}>⑫ 작업 위험성평가(JSA) — 참고표를 보고 작성하세요. 위험등급은 자동 계산됩니다. (최대 6행)</p>
        <button type="button" className="mini btn-accent" onClick={() => setShowRef(true)}>📋 참고표 보기</button>
      </div>
      {!readOnly && !useSelect && (
        <p className="muted" style={{ color: "#b45309" }}>※ 단계/작업종류는 위에서 <b>작업형태</b>를 선택하면 드롭다운으로 고를 수 있습니다.</p>
      )}
      {rows.map((r, i) => {
        const grade = r.frequency !== "" && r.severity !== "" ? riskGrade(Number(r.frequency), Number(r.severity)) : "";
        return (
          <div key={i} className="jsa-row">
            <div className="jsa-rowhead">
              <strong>#{i + 1}</strong>
              {!readOnly && <button type="button" className="mini danger" onClick={() => del(i)}>삭제</button>}
            </div>
            <div className="jsa-grid">
              <label>단계/작업종류
                {useSelect ? (
                  <select className="inp" value={r.step} onChange={(e) => set(i, { step: e.target.value })}>
                    <option value="">선택</option>
                    {stepOptions!.map((o) => <option key={o} value={o}>{o}</option>)}
                    {r.step && !stepOptions!.includes(r.step) && <option value={r.step}>{r.step}</option>}
                  </select>
                ) : (
                  <input className="inp" value={r.step} readOnly={readOnly} onChange={(e) => set(i, { step: e.target.value })} />
                )}
              </label>
              <label className="wide">유해위험요인<textarea className="inp" rows={2} value={r.hazard} readOnly={readOnly} onChange={(e) => set(i, { hazard: e.target.value })} /></label>
              <label>발생빈도
                <select className="inp" value={r.frequency} disabled={readOnly} onChange={(e) => set(i, { frequency: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="">-</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>치명도
                <select className="inp" value={r.severity} disabled={readOnly} onChange={(e) => set(i, { severity: e.target.value === "" ? "" : Number(e.target.value) })}>
                  <option value="">-</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>위험등급<input className="inp" readOnly value={grade} style={{ background: "#eef", textAlign: "center", fontWeight: 700 }} /></label>
              <label className="wide">현재안전조치<textarea className="inp" rows={2} value={r.current} readOnly={readOnly} onChange={(e) => set(i, { current: e.target.value })} /></label>
              <label className="wide">위험제거/감소대책<textarea className="inp" rows={2} value={r.reduction} readOnly={readOnly} onChange={(e) => set(i, { reduction: e.target.value })} /></label>
            </div>
          </div>
        );
      })}
      {!readOnly && rows.length < 6 && <button type="button" className="mini" onClick={add}>+ 행 추가</button>}
      {showRef && <RefTableModal onClose={() => setShowRef(false)} />}
    </div>
  );
}
