import { emptyPermit, PermitData } from "./types";
import { TemplateInput } from "./templates";

// 일반작업 예시 (작성 화면 "예시 채우기" 로컬 폴백 + 기본 템플릿의 베이스)
// ※ 실명/실연락처는 더미값. 관리자가 예시 양식 관리에서 자유롭게 수정 가능.
export function sampleGeneral(): PermitData {
  return {
    ...emptyPermit(),
    company: "○○업체",
    representative: "홍길동",
    supervisor: "홍길동",
    workerCount: "2",
    emergencyContact: "",
    workContent: "설비 점검·정비 작업",
    workTypes: ["general"],
    gear: ["안전모", "안전화"],
    general: [
      "작업구역 설정 및 통제",
      "작업장 위험요인 제거",
      "작업지휘자 배치 및 작업 현황판 설치",
      "2인 1조 작업",
    ],
    energyMode: "none",
    worksheetAuthor: "홍길동",
    riskParticipants: "홍길동, 김민수, 김철수, 김박수",
    jsa: [
      {
        step: "일반작업",
        hazard: "1. 현장 외 구역 무단출입으로 인한 충돌\n2. 작업특성 미인지로 인한 부상\n3. 전동공구 사용시 감전사고",
        frequency: 1, severity: 2,
        current: "1. 작업구획에 대한 사전교육\n2. 작업전 개인별 작업지시\n3. 전동공구 및 작업선 사전상태 확인",
        reduction: "",
      },
    ],
    representativeSignName: "홍길동",
    privacyConsent: "agree",
    applicantDept: "○○업체",
    applicantName: "홍길동",
  };
}

// 기존 호출부 호환용 별칭 (점진 제거 예정)
export const sampleSinwoo = sampleGeneral;

// 베이스: 공통 안전조치 + 개인정보 동의가 채워진 빈 폼
function base(): PermitData {
  return {
    ...emptyPermit(),
    gear: ["안전모", "안전화"],
    general: ["작업구역 설정 및 통제", "작업장 위험요인 제거"],
    energyMode: "none",
    privacyConsent: "agree",
  };
}

// 관리자 화면 "기본 예시 생성" 시 시드되는 작업형태별 기본 템플릿
export const DEFAULT_TEMPLATES: TemplateInput[] = [
  {
    name: "일반작업 (점검·정비)",
    workType: "general",
    order: 10,
    data: sampleGeneral(),
  },
  {
    name: "화기작업 (용접·절단)",
    workType: "hot",
    order: 20,
    data: {
      ...base(),
      workContent: "용접·절단 등 화기작업",
      workTypes: ["general", "hot"],
      gear: ["안전모", "안전화", "보안면", "방진마스크"],
      hot: ["소화기 비치 유무", "불티비산방지 조치유무", "가스 농도 측정", "가연성(인화) 물질 제거"],
      jsa: [{
        step: "화기작업",
        hazard: "1. 불티 비산에 의한 화재\n2. 용접 흄·가스 흡입\n3. 고온부 접촉 화상",
        frequency: 2, severity: 3,
        current: "1. 소화기·불티방지포 비치\n2. 가연물 제거 및 환기\n3. 보호구 착용",
        reduction: "화재감시자 배치, 작업 후 잔불 확인",
      }],
    },
  },
  {
    name: "고소작업 (2m 이상)",
    workType: "elevated",
    order: 30,
    data: {
      ...base(),
      workContent: "고소(높은 곳) 작업",
      workTypes: ["general", "elevated"],
      gear: ["안전모", "안전화", "안전대(안전밸트)"],
      elevated: ["안전대(안전밸트) 착용", "작업발판 및 안전난간 설치"],
      jsa: [{
        step: "고소작업",
        hazard: "1. 추락\n2. 공구·자재 낙하\n3. 작업발판 전도",
        frequency: 2, severity: 4,
        current: "1. 안전대 체결\n2. 안전난간·방망 설치\n3. 발판 고정상태 확인",
        reduction: "하부 출입통제, 공구 낙하방지끈 사용",
      }],
    },
  },
  {
    name: "밀폐공간작업",
    workType: "confined",
    order: 40,
    data: {
      ...base(),
      workContent: "밀폐공간 내부 작업",
      workTypes: ["general", "confined"],
      gear: ["안전모", "안전화", "공기호흡기"],
      confined: ["가스 농도 측정", "환기 및 배기장치 설치", "호흡용 보호구 유무", "해당작업자 외 출입금지 조치"],
      jsa: [{
        step: "밀폐공간작업",
        hazard: "1. 산소결핍 질식\n2. 유해가스 중독\n3. 비상시 구조 지연",
        frequency: 2, severity: 4,
        current: "1. 작업 전·중 가스농도 측정\n2. 강제환기 실시\n3. 감시인 배치",
        reduction: "구조장비 비치, 출입대장 작성",
      }],
    },
  },
  {
    name: "전기차단(정전)작업",
    workType: "electrical",
    order: 50,
    data: {
      ...base(),
      workContent: "전기 차단(정전) 후 작업",
      workTypes: ["general", "electrical"],
      gear: ["안전모", "안전화", "절연보호구"],
      electrical: ["주전원 차단 확인", "전기차단.잠금 표시 부착", "충전부 절연상태 및 방호상태 확인"],
      jsa: [{
        step: "전기차단작업",
        hazard: "1. 감전\n2. 아크 화상\n3. 오결선·오조작",
        frequency: 2, severity: 4,
        current: "1. 차단·잠금(LOTO)\n2. 검전기로 무전압 확인\n3. 절연보호구 착용",
        reduction: "차단표지 부착, 담당자 외 조작금지",
      }],
    },
  },
  {
    name: "중장비취급작업",
    workType: "heavy",
    order: 60,
    data: {
      ...base(),
      workContent: "지게차·크레인 등 중장비 작업",
      workTypes: ["general", "heavy"],
      heavy: ["자격 확인", "작업계획서 확인", "노면상태 및 주변설비 확인", "장비 이동경로 확인"],
      jsa: [{
        step: "중장비취급작업",
        hazard: "1. 협착·충돌\n2. 장비 전도\n3. 인양물 낙하",
        frequency: 2, severity: 4,
        current: "1. 신호수 배치\n2. 작업반경 출입통제\n3. 노면·자격 확인",
        reduction: "유도자 신호 준수, 정격하중 준수",
      }],
    },
  },
  {
    name: "굴착작업",
    workType: "excavation",
    order: 70,
    data: {
      ...base(),
      workContent: "굴착·터파기 작업",
      workTypes: ["general", "excavation"],
      excavation: ["지하매설물(기계배관) 확인", "지하매설물(전기동력선) 확인", "지반상태확인"],
      jsa: [{
        step: "굴착작업",
        hazard: "1. 토사 붕괴·매몰\n2. 지하매설물 파손\n3. 장비 협착",
        frequency: 2, severity: 4,
        current: "1. 흙막이·구배 확보\n2. 매설물 사전확인\n3. 작업반경 통제",
        reduction: "굴착면 점검, 우천 시 작업중지",
      }],
    },
  },
];
