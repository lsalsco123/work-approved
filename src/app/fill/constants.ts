import { PermitStatus } from "@/lib/permits";

export const STATUS_LABEL: Record<PermitStatus, { text: string; color: string }> = {
  draft:     { text: "임시저장", color: "#94a3b8" },
  submitted: { text: "제출됨",   color: "#f59e0b" },
  approved:  { text: "승인완료", color: "#22c55e" },
  rejected:  { text: "반려됨",   color: "#ef4444" },
  completed: { text: "완료",     color: "#64748b" },
};

export type FieldSignatureKey =
  | "supervisorSign"
  | "hotFireWatcherSign"
  | "hotFireManagerSign"
  | "confinedWatcherSign"
  | "electricalCutoffPersonSign"
  | "excavationBuriedCheckerSign"
  | "heavySignalerSign"
  | "energyPersonSign"
  | "worksheetAuthorSign"
  | "representativeSign";

export type SignatureTarget =
  | { kind: "education"; index: number }
  | { kind: "applicant" }
  | { kind: "field"; field: FieldSignatureKey }
  | { kind: "approval" }
  | null;

export const FIELD_SIGNATURE_LABELS: Record<FieldSignatureKey, string> = {
  supervisorSign: "작업감독자 서명",
  hotFireWatcherSign: "화재감시자 서명",
  hotFireManagerSign: "소방안전관리자 서명",
  confinedWatcherSign: "감시인 서명",
  electricalCutoffPersonSign: "차단인 서명",
  excavationBuriedCheckerSign: "매설확인자 서명",
  heavySignalerSign: "신호수/유도자 서명",
  energyPersonSign: "에너지원 차단인 서명",
  worksheetAuthorSign: "작성자/담당자 서명",
  representativeSign: "신청/강사 서명",
};

export const STAGE_LABEL: Record<string, string> = {
  manager: "담당자 1차",
  safety: "환경안전",
  factory: "공장장 최종",
  done: "완료",
};
