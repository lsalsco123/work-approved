"use client";
import React, { useEffect, useState } from "react";
import { JsaRow, riskGrade } from "@/lib/types";

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

// ── 건(항목)별 세트 ↔ 멀티라인 문자열 상호변환 ─────────────────────────────
// 저장 포맷(hazard/current/reduction 각각 "1. …\n2. …")은 그대로 유지하되,
// 에디터에서는 같은 번호끼리 한 세트로 묶어 편집한다. (인쇄 양식·메일 호환)
interface JsaItem { hazard: string; current: string; reduction: string }
type ItemField = keyof JsaItem;

function parseField(s: string): string[] {
  const arr: string[] = [];
  let auto = 0;
  (s || "").split("\n").forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const m = t.match(/^(\d+)\.\s*(.*)$/);
    if (m) { arr[Number(m[1]) - 1] = m[2].trim(); }
    else { while (arr[auto] !== undefined) auto++; arr[auto] = t; auto++; }
  });
  return arr;
}
function parseItems(row: JsaRow): JsaItem[] {
  const H = parseField(row.hazard), C = parseField(row.current), R = parseField(row.reduction);
  const n = Math.max(H.length, C.length, R.length, 1);
  const items: JsaItem[] = [];
  for (let i = 0; i < n; i++) items.push({ hazard: H[i] || "", current: C[i] || "", reduction: R[i] || "" });
  return items;
}
function serializeItems(items: JsaItem[]): Pick<JsaRow, "hazard" | "current" | "reduction"> {
  const build = (field: ItemField) =>
    items.map((it, i) => { const t = (it[field] || "").trim(); return t ? `${i + 1}. ${t}` : null; })
      .filter((x): x is string => x !== null).join("\n");
  return { hazard: build("hazard"), current: build("current"), reduction: build("reduction") };
}

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

// 개별 작업(행) 편집기 — 단계는 작업형태에 따라 자동 설정(읽기전용), 위험요인 세트는 건별로 관리
function JsaRowEditor({ row, index, onPatch, readOnly }: {
  row: JsaRow; index: number; onPatch: (patch: Partial<JsaRow>) => void; readOnly?: boolean;
}) {
  const [items, setItems] = useState<JsaItem[]>(() => parseItems(row));
  const serialized = serializeItems(items);
  // 외부에서 행 내용이 바뀌면(예시 불러오기/초기화) 세트를 다시 파싱
  useEffect(() => {
    if (row.hazard !== serialized.hazard || row.current !== serialized.current || row.reduction !== serialized.reduction) {
      setItems(parseItems(row));
    }
  }, [row.hazard, row.current, row.reduction]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: JsaItem[]) => {
    setItems(next);
    onPatch(serializeItems(next));
  };
  const setItem = (k: number, field: ItemField, value: string) => {
    if (readOnly) return;
    commit(items.map((it, j) => (j === k ? { ...it, [field]: value } : it)));
  };
  const addItem = () => { if (!readOnly) commit([...items, { hazard: "", current: "", reduction: "" }]); };
  const delItem = (k: number) => {
    if (readOnly) return;
    const next = items.filter((_, j) => j !== k);
    commit(next.length ? next : [{ hazard: "", current: "", reduction: "" }]);
  };

  const grade = row.frequency !== "" && row.severity !== "" ? riskGrade(Number(row.frequency), Number(row.severity)) : "";

  return (
    <div className="jsa-row">
      <div className="jsa-rowhead">
        <span className="jsa-wt"><strong>#{index + 1}</strong> 단계/작업종류: <b>{row.step || "-"}</b></span>
      </div>

      {/* 2) 발생빈도 / 치명도 / 위험등급 (작업 전체 기준) */}
      <div className="jsa-grade">
        <label>발생빈도
          <select className="inp" value={row.frequency} disabled={readOnly} onChange={(e) => onPatch({ frequency: e.target.value === "" ? "" : Number(e.target.value) })}>
            <option value="">-</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>치명도
          <select className="inp" value={row.severity} disabled={readOnly} onChange={(e) => onPatch({ severity: e.target.value === "" ? "" : Number(e.target.value) })}>
            <option value="">-</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>위험등급<input className="inp" readOnly value={grade} style={{ background: "#eef", textAlign: "center", fontWeight: 700 }} /></label>
      </div>

      {/* 3) 유해위험요인 → 현재안전조치 → 위험제거/감소대책 (건별 세트) */}
      <div className="jsa-items">
        <div className="jsa-items-head">위험요인별 항목 <span className="muted" style={{ fontWeight: 400 }}>— 한 건씩 짝지어 입력</span></div>
        {items.map((it, k) => (
          <div key={k} className="jsa-item">
            <div className="jsa-item-head">
              <span className="jsa-item-no">{k + 1}건</span>
              {!readOnly && items.length > 1 && <button type="button" className="mini danger" onClick={() => delItem(k)}>삭제</button>}
            </div>
            <label>유해위험요인
              <textarea className="inp" rows={2} value={it.hazard} readOnly={readOnly} onChange={(e) => setItem(k, "hazard", e.target.value)} />
            </label>
            <label>현재안전조치
              <textarea className="inp" rows={2} value={it.current} readOnly={readOnly} onChange={(e) => setItem(k, "current", e.target.value)} />
            </label>
            <label>위험제거/감소대책
              <textarea className="inp" rows={2} value={it.reduction} readOnly={readOnly} onChange={(e) => setItem(k, "reduction", e.target.value)} />
            </label>
          </div>
        ))}
        {!readOnly && <button type="button" className="mini" onClick={addItem}>+ 항목(건) 추가</button>}
      </div>
    </div>
  );
}

export default function JsaEditor({ rows, onChange, readOnly }: {
  rows: JsaRow[]; onChange: (r: JsaRow[]) => void; readOnly?: boolean; stepOptions?: string[];
}) {
  const [showRef, setShowRef] = useState(false);
  const patch = (i: number, p: Partial<JsaRow>) => {
    if (readOnly) return;
    onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  };

  return (
    <div className="jsa">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <p className="muted" style={{ flex: 1 }}>⑫ 작업 위험성평가(JSA) — 행은 선택한 <b>작업형태</b>에 따라 자동으로 만들어집니다. 위험등급은 자동 계산됩니다.</p>
        <button type="button" className="mini btn-accent" onClick={() => setShowRef(true)}>📋 참고표 보기</button>
      </div>
      {!readOnly && rows.length === 0 && (
        <p className="muted" style={{ color: "#b45309" }}>※ 위 <b>작업형태</b>를 선택하면 해당 작업의 JSA 행이 나타납니다.</p>
      )}
      {rows.map((r, i) => (
        <JsaRowEditor key={r.workType || i} row={r} index={i} onPatch={(p) => patch(i, p)} readOnly={readOnly} />
      ))}
      {showRef && <RefTableModal onClose={() => setShowRef(false)} />}
    </div>
  );
}
