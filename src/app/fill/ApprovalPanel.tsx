import { confirmableItems } from "@/lib/form";
import { PermitData } from "@/lib/types";
import { PermitStatus, ChainStage, PermitChain } from "@/lib/permits";
import { AuthUser } from "@/lib/auth";
import { SAFETY_REVIEWERS } from "@/lib/managers";
import { STAGE_LABEL } from "./constants";

export default function ApprovalPanel({
  user,
  data,
  permitStatus,
  permitStage,
  chain,
  saving,
  setReviewer,
  toggleConfirm,
  confirmAll,
  clearConfirm,
  handleSaveConfirm,
  doReject,
  requestApprovalSignature,
  handleComplete,
  doResubmit,
}: {
  user: AuthUser;
  data: PermitData;
  permitStatus: PermitStatus | null;
  permitStage: ChainStage | null;
  chain: PermitChain | null;
  saving: boolean;
  setReviewer: (name: string) => void;
  toggleConfirm: (ref: string) => void;
  confirmAll: () => void;
  clearConfirm: () => void;
  handleSaveConfirm: () => void;
  doReject: () => void;
  requestApprovalSignature: () => void;
  handleComplete: () => void;
  doResubmit: () => void;
}) {
  const role = user.role;
  const isSys = role === "admin";
  const stageNow = permitStage || (permitStatus === "submitted" ? "manager" : null);
  const canActNow = permitStatus === "submitted" && (isSys
    || (role === "manager" && (
      (stageNow === "manager" && user.managerKind === "requester" && user.managerName === data.manager)
      || (stageNow === "factory" && user.managerKind === "factory")
    )));
  const canResubmit = permitStatus === "rejected"
    && (isSys || (role === "manager" && user.managerKind === "requester" && user.managerName === data.manager));
  const items = confirmableItems(data);

  return (
    <div className="panel panel-approval">
      <div className="panel-head">
        <span className="panel-title">결재</span>
        <span className="panel-sub">
          {["manager", "safety", "factory"].map((s) => STAGE_LABEL[s] + (stageNow === s ? " ◀" : "")).join("  →  ")}
        </span>
        {isSys && <span style={{ fontSize: 11, color: "#94a3b8" }}>(시스템관리자: 모든 단계 처리 가능)</span>}
      </div>

      {/* 단계별 결재 코멘트 이력 */}
      {(chain?.manager || chain?.safety || chain?.factory || chain?.rejected) && (
        <div className="approval-history">
          {chain?.manager && <div>· 담당자 {chain.manager.by}: {chain.manager.comment || "(의견 없음)"}</div>}
          {chain?.safety && <div>· 환경안전 {chain.safety.by}: {chain.safety.comment || "(의견 없음)"}</div>}
          {chain?.factory && <div>· 공장장 {chain.factory.by}: {chain.factory.comment || "(의견 없음)"}</div>}
          {chain?.rejected && <div className="rejected">· 반려({STAGE_LABEL[chain.rejected.stage || ""] || chain.rejected.stage}) {chain.rejected.by}: {chain.rejected.reason}</div>}
        </div>
      )}

      {/* 환경안전 단계: 검토자 선택 (시스템관리자) */}
      {isSys && stageNow === "safety" && permitStatus === "submitted" && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 10 }}>
          검토자(환경안전):
          <select className="inp" value={data.admin.review.name || "박세현"} onChange={(e) => setReviewer(e.target.value)}>
            {SAFETY_REVIEWERS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}

      {/* 관리자 확인(●) — 시스템관리자, 제출 단계 */}
      {isSys && stageNow === "safety" && permitStatus === "submitted" && items.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>업체 체크 확인(●)</span>
            <button className="mini" onClick={confirmAll}>일괄</button>
            <button className="mini" onClick={clearConfirm}>해제</button>
            <button className="mini btn-accent" onClick={handleSaveConfirm} disabled={saving}>저장</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {items.map((it) => {
              const on = data.confirmed.includes(it.ref);
              return (
                <button key={it.ref} onClick={() => toggleConfirm(it.ref)} className={`chip-toggle${on ? " on" : ""}`}>
                  <span className="dot">{on ? "●" : "○"}</span>{it.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 액션 */}
      <div style={{ paddingTop: 10, borderTop: "1px dashed #c7d2fe", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }} />
        {permitStatus === "submitted" ? (
          canActNow ? (
            <>
              <button className="mini btn-reject" onClick={doReject} disabled={saving}>반려</button>
              <button className="mini btn-approve" onClick={requestApprovalSignature} disabled={saving}>
                {saving ? "처리 중…" : (stageNow === "factory" ? "최종 승인" : "승인")}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>현재 '{STAGE_LABEL[stageNow || ""]}' 단계 — 결재 권한이 없습니다.</span>
          )
        ) : permitStatus === "approved" ? (
          isSys ? <button className="mini btn-dark" onClick={handleComplete} disabled={saving}>{saving ? "처리 중…" : "작업완료 처리"}</button>
            : <span style={{ fontSize: 12, color: "#15803d" }}>최종 승인 완료</span>
        ) : permitStatus === "rejected" ? (
          <>
            <span style={{ fontSize: 12, color: "#dc2626" }}>반려됨</span>
            {canResubmit && <button className="mini btn-approve" onClick={doResubmit} disabled={saving}>재상신</button>}
          </>
        ) : (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{permitStatus === "completed" ? "완료된 허가서" : "임시저장"}</span>
        )}
      </div>
    </div>
  );
}
