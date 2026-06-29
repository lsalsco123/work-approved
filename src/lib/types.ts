// 작업허가서 데이터 모델

export interface JsaRow {
  step: string;          // 단계 / 작업명
  hazard: string;        // 유해위험요인
  frequency: number | ""; // 발생빈도 1~5
  severity: number | ""; // 치명도 1~5
  current: string;       // 현재안전조치
  reduction: string;     // 위험제거/감소대책
}

export interface SignSlot {
  name: string;
  dept?: string;
  date?: string; // YYYY-MM-DD
  sign?: string; // 직접 서명 이미지 (PNG dataURL)
}

export interface PermitData {
  // ① 기본정보
  company: string;          // C3 업체명
  representative: string;   // C5 대표자
  supervisor: string;       // C7 작업감독자
  workerCount: string;      // J5 작업인원
  emergencyContact: string; // J7 비상연락망
  manager: string;          // 사내 담당자(의뢰자) = 뒷장 발급자
  workDate: string;         // C9 날짜 (YYYY-MM-DD)
  startTime: string;        // C9 시작 (HH:MM)
  endTime: string;          // C9 종료 (HH:MM)
  workContent: string;      // C11 작업내용

  // ⑦ 작업형태 (복수선택)
  workTypes: string[];      // general/hot/confined/electrical/elevated/excavation/heavy/radiation/etc
  workTypeEtc: string;      // 기타 내용 (K21)

  // 공정 (복수선택) — 빨간 동그라미
  processes: string[];
  processEtc: string;

  // ① 안전보호구
  gear: string[];
  gearEtc: string;

  // ② 일반작업(공통사항)
  general: string[];
  supervisorSign: string;   // 일반작업 작업감독자 서명
  // ③ 화기작업
  hot: string[];
  hotFireWatcher: string;   // 화재감시자
  hotFireWatcherSign: string;
  hotFireManager: string;   // 소방안전관리자
  hotFireManagerSign: string;
  // ④ 밀폐공간
  confined: string[];
  confinedWatcher: string;  // 감시인
  confinedWatcherSign: string;
  // ⑤ 전기차단
  electrical: string[];
  electricalCutoffTime: string; // 차단시간
  electricalCutoffPerson: string; // 차단인
  electricalCutoffPersonSign: string;
  // ⑥ 고소작업
  elevated: string[];
  // ⑦ 굴착작업
  excavation: string[];
  excavationBuriedChecker: string; // 매설확인자
  excavationBuriedCheckerSign: string;
  // ⑧ 중장비취급
  heavy: string[];
  heavySignaler: string;   // 신호수/유도자
  heavySignalerSign: string;
  heavyEquipType: string;  // 장비종류
  // ⑨ 방사능
  radiation: string[];

  // ⑪ 에너지원 안전잠금장치
  energyMode: "none" | "general" | ""; // 해당없음 / ②항 체크시
  energyTarget: string;   // 차단대상
  energyLocation: string; // 차단위치
  energyPerson: string;   // 차단인
  energyDeferred: boolean; // 발급 후 작성예정

  // ⑫ JSA (Work Sheet)
  worksheetAuthor: string;   // A97 작성자/담당자
  worksheetAuthorSign: string;
  riskParticipants: string;  // F97 위험성평가 참여자
  riskParticipantsSign: string;
  jsa: JsaRow[];

  // 환경안전 교육실시 및 서약
  eduSigners: SignSlot[];        // 교육 참여자 서명 (성명만, 서명은 현장 수기)
  representativeSignName: string; // S150 대표자 이름
  representativeSign: string;     // S150 대표자(강사) 서명
  representativeSignDate: string; // X150 날짜

  // 개인정보 동의
  privacyConsent: "agree" | "disagree" | "";

  // 신청 (업체)
  applicantDept: string;  // T167 소속
  applicantName: string;  // X167 성명
  applicantDate: string;  // AB167 날짜
  applicantSign: string;  // X167 신청자 직접 서명 이미지

  // ⑰ 작업승인 (관리자 전용)
  admin: {
    issue: SignSlot;    // 발급 (생산/설비관리팀)
    review: SignSlot;   // 검토 (환경안전)
    approve: SignSlot;  // 승인 (공장장)
    complete: SignSlot; // 작업완료 확인
  };

  // 환경안전팀 확인 표시 (체크박스 셀ref 집합 → ○를 ●로)
  confirmed: string[];
}

export function emptyPermit(): PermitData {
  return {
    company: "", representative: "", supervisor: "", workerCount: "",
    emergencyContact: "", manager: "", workDate: "", startTime: "", endTime: "", workContent: "",
    workTypes: [], workTypeEtc: "", processes: [], processEtc: "", gear: [], gearEtc: "",
    general: [], supervisorSign: "", hot: [], hotFireWatcher: "", hotFireWatcherSign: "", hotFireManager: "", hotFireManagerSign: "",
    confined: [], confinedWatcher: "", confinedWatcherSign: "", electrical: [], electricalCutoffTime: "", electricalCutoffPerson: "", electricalCutoffPersonSign: "",
    elevated: [], excavation: [], excavationBuriedChecker: "", excavationBuriedCheckerSign: "",
    heavy: [], heavySignaler: "", heavySignalerSign: "", heavyEquipType: "", radiation: [],
    energyMode: "", energyTarget: "", energyLocation: "", energyPerson: "", energyDeferred: false,
    worksheetAuthor: "", worksheetAuthorSign: "", riskParticipants: "", riskParticipantsSign: "",
    jsa: [],
    eduSigners: [], representativeSignName: "", representativeSign: "", representativeSignDate: "",
    privacyConsent: "",
    applicantDept: "", applicantName: "", applicantDate: "", applicantSign: "",
    admin: {
      issue: { name: "", dept: "생산/설비관리팀", date: "" },
      review: { name: "", dept: "환경안전", date: "" },
      approve: { name: "", dept: "공장장", date: "" },
      complete: { name: "", dept: "생산/설비관리팀", date: "" },
    },
    confirmed: [],
  };
}

export function riskGrade(freq: number, sev: number): string {
  const s = freq * sev;
  if (s <= 2) return "E";
  if (s <= 6) return "D";
  if (s <= 9) return "C";
  if (s <= 12) return "B";
  return "A";
}
