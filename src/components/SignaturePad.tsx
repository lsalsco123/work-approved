"use client";
import React, { useEffect, useRef, useState } from "react";

// 카드 결제 서명처럼 큰 팝업에서 직접 서명하는 캔버스 패드.
// onSave(dataURL) 로 PNG 서명 이미지를 돌려준다. 빈 서명은 저장 불가.
export default function SignaturePad({
  title = "직접 서명",
  initial,
  onSave,
  onClose,
}: {
  title?: string;
  initial?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(!!initial);

  // 캔버스 내부 해상도(저장 용량을 위해 적당히 작게)
  const W = 700, H = 280;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a2240";
    if (initial) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, W, H);
      img.src = initial;
    }
  }, [initial]);

  const pos = (e: React.PointerEvent) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
    if (!hasInk) setHasInk(true);
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    dirty.current = false;
    setHasInk(false);
  };

  const save = () => {
    if (!hasInk) { alert("서명을 입력해주세요."); return; }
    onSave(canvasRef.current!.toDataURL("image/png"));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,34,64,.55)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, padding: 20, width: "min(760px, 96vw)", boxShadow: "0 12px 48px rgba(0,0,0,.35)" }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <strong style={{ fontSize: 16, color: "#0a2240" }}>{title}</strong>
          <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>아래 칸에 손가락 또는 마우스로 서명하세요.</span>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          style={{
            width: "100%", height: "auto", aspectRatio: `${W} / ${H}`,
            border: "2px dashed #cbd5e1", borderRadius: 10, background: "#f8fafc",
            touchAction: "none", cursor: "crosshair", display: "block",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={clear} style={btn("#fff", "#475569", "#cbd5e1")}>지우기</button>
          <button onClick={onClose} style={btn("#fff", "#475569", "#cbd5e1")}>취소</button>
          <button onClick={save} style={btn("#003377", "#fff", "#003377")}>서명 저장</button>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: "10px 18px", fontSize: 14, fontWeight: 700, borderRadius: 8,
    background: bg, color, border: `1px solid ${border}`, cursor: "pointer",
  };
}
