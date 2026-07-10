import React from "react";
import { ChainStage, PermitStatus } from "@/lib/permits";

// 결재 진척 단계: 제출 → 담당자 1차 → 환경안전 → 공장장 최종(승인완료)
const CHAIN_STEPS = ["제출", "담당자", "환경안전", "공장장"] as const;
// stage(현재 '대기 중'인 단계) → 완료된 스텝 수. submitted+manager이면 제출(1)까지 끝, 담당자 결재 대기.
const STAGE_DONE: Record<ChainStage, number> = { manager: 1, safety: 2, factory: 3, done: 4 };

export default function ProgressChain({ stage, status }: { stage?: ChainStage; status: PermitStatus }) {
  // 승인완료/완료면 전 단계 완료, 그 외엔 stage 기준(미지정 legacy는 제출만 완료로 간주)
  const done = status === "approved" || status === "completed" ? 4 : STAGE_DONE[stage ?? "manager"] ?? 1;
  const pending = done < 4 ? done : -1; // 현재 진행(대기) 중인 스텝 인덱스
  return (
    <div style={{ minWidth: 168 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {CHAIN_STEPS.map((label, i) => {
          const isDone = i < done;
          const isNow = i === pending;
          const color = isDone ? "#22c55e" : isNow ? "#f59e0b" : "#cbd5e1";
          return (
            <React.Fragment key={label}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", background: color, flexShrink: 0,
                boxShadow: isNow ? "0 0 0 3px rgba(245,158,11,0.25)" : "none", transition: "background .2s" }} />
              {i < CHAIN_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 3, background: i < done - 1 ? "#22c55e" : "#e2e8f0", minWidth: 14 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
        {CHAIN_STEPS.map((label, i) => (
          <span key={label} style={{ color: i < done ? "#16a34a" : i === pending ? "#d97706" : "#94a3b8",
            fontWeight: i === pending ? 700 : 500 }}>{label}</span>
        ))}
      </div>
    </div>
  );
}
