"use client";
import React from "react";
import { PermitData } from "@/lib/types";
import { buildOverlays, Overlay, PAGE_W, PAGE_H } from "@/lib/form";

// pt -> cqw (1 cqw = 1% of page container width; page width = PAGE_W pt)
const cqw = (pt: number) => `${(pt / PAGE_W) * 100}cqw`;
const pctX = (n: number) => `${n * 100}%`;
const pctY = (n: number) => `${n * 100}%`;

function PageBox({ page, overlays }: { page: number; overlays: Overlay[] }) {
  const items = overlays.filter((o) => o.page === page);
  return (
    <div className="permit-page" data-page={page}>
      <img className="permit-bg" src={`/asset_page${page}.png`} alt={`page ${page}`} />
      {items.map((o, i) => {
        if (o.kind === "text") {
          return (
            <div
              key={i}
              className="ov-text"
              style={{
                left: pctX(o.x), top: pctY(o.y),
                width: pctX(o.w), height: pctY(o.h),
                fontSize: cqw(o.fontPt),
                justifyContent: o.align === "center" ? "center" : o.align === "right" ? "flex-end" : "flex-start",
                alignItems: o.valign === "middle" ? "center" : "flex-start",
                textAlign: o.align,
                whiteSpace: o.wrap ? "pre-wrap" : "nowrap",
              }}
            >
              {o.cover && <span className="ov-cover" />}
              <span className="ov-text-inner">{o.text}</span>
            </div>
          );
        }
        if (o.kind === "mark") {
          const sz = cqw(o.sizePt);
          return (
            <span
              key={i}
              className={o.glyph === "square" ? "ov-square" : "ov-circle"}
              style={{ left: pctX(o.x), top: pctY(o.y), width: sz, height: sz }}
            />
          );
        }
        if (o.kind === "image") {
          // 직접 서명 이미지
          return (
            <img
              key={i}
              src={o.src}
              alt=""
              style={{
                position: "absolute",
                left: pctX(o.x), top: pctY(o.y),
                width: pctX(o.w), height: pctY(o.h),
                objectFit: "contain",
              }}
            />
          );
        }
        // oval (process selection) — red ellipse
        return (
          <span
            key={i}
            className="ov-oval"
            style={{ left: pctX(o.x), top: pctY(o.y), width: pctX(o.w), height: pctY(o.h) }}
          />
        );
      })}
    </div>
  );
}

export default function FormRenderer({ data }: { data: PermitData }) {
  const overlays = buildOverlays(data);
  return (
    <div className="permit-doc">
      <PageBox page={1} overlays={overlays} />
      <PageBox page={2} overlays={overlays} />
    </div>
  );
}

export { PAGE_W, PAGE_H };
