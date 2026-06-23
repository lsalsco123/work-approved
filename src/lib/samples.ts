import { emptyPermit, PermitData } from "./types";

// 검증용: 신우기전 시트 실제 값
export function sampleSinwoo(): PermitData {
  return {
    ...emptyPermit(),
    company: "LS알스코",
    representative: "홍길동",
    supervisor: "홍길동",
    workerCount: "1",
    emergencyContact: "010-0000-0000",
    workDate: "2026-02-27",
    startTime: "13:00",
    endTime: "18:00",
    workContent: "컨펌 4호 T/U 개체",
    workTypes: ["general"],
    processes: ["컨펌"],
    gear: ["안전모", "안전화"],
    general: ["작업구역 설정 및 통제", "작업장 위험요인 제거", "유해·위험 기계·기구 위험성 확인", "작업지휘자 배치 및 작업 현황판 설치", "2인 1조 작업"],
    energyMode: "none",
    worksheetAuthor: "홍길동",
    riskParticipants: "홍길동",
    jsa: [
      { step: "일반작업", hazard: "1. 현장 외 구역 무단출입으로 인한 충돌\n2. 작업특성 미인지로 인한 부상\n3. 반복작업으로 인한 근골격계 질환\n4. 전동공구 사용시 감전사고\n5. 공도구 불량으로 인한 부상", frequency: 1, severity: 2, current: "1. 작업구획에 대한 사전교육\n2. 작업전 개인별 작업지시\n3. 작업 중 주기적인 휴식시간 부여\n4. 전동공구 및 작업선 사전상태 확인\n5. 작업 전 공구상태 확인", reduction: "" },
    ],
    representativeSignName: "홍길동",
    representativeSignDate: "2026-02-27",
    privacyConsent: "agree",
    applicantDept: "LS알스코",
    applicantName: "홍길동",
    applicantDate: "2026-02-27",
    admin: {
      issue: { name: "", dept: "", date: "" },
      review: { name: "", dept: "", date: "" },
      approve: { name: "", dept: "", date: "" },
      complete: { name: "", dept: "", date: "" },
    },
  };
}
