"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

// 엑셀형 표: 셀 범위 드래그 선택 + Ctrl/Cmd+C 복사(TSV, 엑셀 붙여넣기 호환) + 열 너비 조절.
export interface SheetColumn<T> {
  key: string;
  header: string;
  width?: number;
  minWidth?: number;
  align?: "left" | "center" | "right";
  /** 셀 표시(버튼·셀렉트 등 인터랙티브 요소 가능). 없으면 copyText 값을 그대로 표시 */
  render?: (row: T, rowIndex: number) => React.ReactNode;
  /** 복사·정렬용 평문 값 */
  copyText?: (row: T, rowIndex: number) => string;
  /** 버튼/셀렉트가 든 셀 — 범위 선택을 시작하지 않음(클릭 동작 보존) */
  noSelect?: boolean;
  /** 줄바꿈 허용(칩·버튼 묶음 등) */
  wrap?: boolean;
}

interface Props<T> {
  columns: SheetColumn<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  emptyText?: string;
}

type Cell = { r: number; c: number };

export default function SheetTable<T>({ columns, rows, rowKey, emptyText }: Props<T>) {
  const [widths, setWidths] = useState<number[]>(() => columns.map((c) => c.width ?? 140));
  // 컬럼 구성이 바뀌면 너비 배열 길이 맞추기(기존 너비는 보존)
  useEffect(() => {
    setWidths((prev) => columns.map((c, i) => prev[i] ?? c.width ?? 140));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [focus, setFocus] = useState<Cell | null>(null);
  const selecting = useRef(false);
  const active = useRef(false); // 이 표가 마지막으로 클릭된 표인지(복사 대상 판별)
  const rootRef = useRef<HTMLDivElement>(null);
  const resize = useRef<{ idx: number; startX: number; startW: number } | null>(null);

  const onResizeDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    resize.current = { idx, startX: e.clientX, startW: widths[idx] };
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const r = resize.current;
      if (!r) return;
      const min = columns[r.idx]?.minWidth ?? 56;
      const w = Math.max(min, r.startW + (e.clientX - r.startX));
      setWidths((prev) => prev.map((x, i) => (i === r.idx ? w : x)));
    };
    const up = () => { resize.current = null; selecting.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [columns]);

  // 표 밖을 클릭하면 이 표의 선택 해제
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const inside = !!rootRef.current && rootRef.current.contains(e.target as Node);
      active.current = inside;
      if (!inside) { setAnchor(null); setFocus(null); }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const inRange = useCallback((r: number, c: number) => {
    if (!anchor || !focus) return false;
    return r >= Math.min(anchor.r, focus.r) && r <= Math.max(anchor.r, focus.r)
      && c >= Math.min(anchor.c, focus.c) && c <= Math.max(anchor.c, focus.c);
  }, [anchor, focus]);

  const onCellDown = (e: React.MouseEvent, r: number, c: number) => {
    if (columns[c].noSelect || e.button !== 0) return;
    e.preventDefault(); // 네이티브 텍스트 선택 억제 → 자체 범위 선택
    selecting.current = true;
    setAnchor({ r, c });
    setFocus({ r, c });
  };

  // 복사: 선택 범위를 TSV로
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || !(e.ctrlKey || e.metaKey)) return;
      if (!active.current || !anchor || !focus) return;
      const r0 = Math.min(anchor.r, focus.r), r1 = Math.max(anchor.r, focus.r);
      const c0 = Math.min(anchor.c, focus.c), c1 = Math.max(anchor.c, focus.c);
      const lines: string[] = [];
      for (let r = r0; r <= r1; r++) {
        const cells: string[] = [];
        for (let c = c0; c <= c1; c++) {
          const col = columns[c];
          const txt = col.copyText ? col.copyText(rows[r], r) : "";
          cells.push((txt ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " "));
        }
        lines.push(cells.join("\t"));
      }
      navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, focus, columns, rows]);

  return (
    <div className="sheet-wrap" ref={rootRef} tabIndex={0}>
      <table className="sheet" style={{ width: "100%", minWidth: widths.reduce((a, b) => a + b, 0) }}>
        <colgroup>{columns.map((c, i) => <col key={c.key} style={{ width: widths[i] }} />)}</colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} style={{ textAlign: c.align ?? "left" }}>
                <span className="sheet-h">{c.header}</span>
                <span className="sheet-resizer" onMouseDown={(e) => onResizeDown(e, i)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="sheet-empty" colSpan={columns.length}>{emptyText ?? "데이터가 없습니다."}</td></tr>
          ) : rows.map((row, r) => (
            <tr key={rowKey(row, r)}>
              {columns.map((col, c) => (
                <td
                  key={col.key}
                  className={[inRange(r, c) ? "sel" : "", col.noSelect ? "nosel" : "", col.wrap ? "wrap" : ""].filter(Boolean).join(" ")}
                  style={{ textAlign: col.align ?? "left" }}
                  onMouseDown={(e) => onCellDown(e, r, c)}
                  onMouseEnter={() => { if (selecting.current) setFocus({ r, c }); }}
                >
                  {col.render ? col.render(row, r) : (col.copyText ? col.copyText(row, r) : "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
