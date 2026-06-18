"use client";
import React from "react";
import { JsaRow, riskGrade } from "@/lib/types";

const blank: JsaRow = { step: "", hazard: "", frequency: "", severity: "", current: "", reduction: "" };

export default function JsaEditor({ rows, onChange, readOnly }: {
  rows: JsaRow[]; onChange: (r: JsaRow[]) => void; readOnly?: boolean;
}) {
  const set = (i: number, patch: Partial<JsaRow>) => {
    if (readOnly) return;
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const add = () => { if (!readOnly && rows.length < 6) onChange([...rows, { ...blank }]); };
  const del = (i: number) => { if (!readOnly) onChange(rows.filter((_, j) => j !== i)); };

  return (
    <div className="jsa">
      <p className="muted">⑫ 작업 위험성평가(JSA) — 우측 참고표(발생빈도·치명도·위험등급)를 보고 작성. 위험등급은 자동 계산됩니다. (최대 6행)</p>
      {rows.map((r, i) => {
        const grade = r.frequency !== "" && r.severity !== "" ? riskGrade(Number(r.frequency), Number(r.severity)) : "";
        return (
          <div key={i} className="jsa-row">
            <div className="jsa-rowhead">
              <strong>#{i + 1}</strong>
              {!readOnly && <button type="button" className="mini danger" onClick={() => del(i)}>삭제</button>}
            </div>
            <div className="jsa-grid">
              <label>단계/작업명<input className="inp" value={r.step} readOnly={readOnly} onChange={(e) => set(i, { step: e.target.value })} /></label>
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
    </div>
  );
}
