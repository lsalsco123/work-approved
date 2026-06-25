// 오프라인 좌표 검증 하니스 — 최대치/승인완료 샘플로 오버플로우 점검
import { buildOverlays, PAGE_W, PAGE_H } from "./src/lib/form";
import { sampleGeneral } from "./src/lib/samples";
import fs from "fs";

const sign = fs.readFileSync("/tmp/sign.txt", "utf8").trim();
const signers = Array.from({ length: 18 }, (_, i) => ({ name: `홍길동${i + 1}`, sign }));

const base = sampleGeneral();
const data = {
  ...base,
  company: "○○종합건설산업개발주식회사",
  representative: "김대표이사",
  supervisor: "박작업감독",
  manager: "김승정",
  workerCount: "18",
  workContent: "압출 2호기 다이스 교체 및 주변 배관 보수용접, 전기 차단 후 정비, 고소 작업대 설치까지 일괄 진행",
  workTypes: ["general", "hot", "confined", "electrical", "elevated", "excavation", "heavy", "radiation"],
  hot: ["소화기 비치 유무", "불티비산방지 조치유무"],
  hotFireWatcher: "김화재감시",
  confined: ["산소농도 측정"], confinedWatcher: "이감시인",
  electrical: ["전원 차단 확인"], electricalCutoffTime: "08:00", electricalCutoffPerson: "정차단인",
  excavation: ["지하매설물 확인"], excavationBuriedChecker: "최매설확인",
  heavy: ["신호수 배치"], heavySignaler: "강신호수", heavyEquipType: "25톤 크레인",
  jsa: Array.from({ length: 6 }, (_, i) => ({
    step: ["일반작업", "화기작업", "밀폐공간작업", "전기차단작업", "고소작업", "굴착작업"][i],
    hazard: "1. 현장 외 구역 무단출입으로 인한 충돌 위험\n2. 작업특성 미인지로 인한 부상\n3. 전동공구 사용시 감전사고 발생 가능",
    frequency: 3, severity: 4,
    current: "1. 작업구획에 대한 사전교육 실시\n2. 작업전 개인별 작업지시\n3. 전동공구 및 작업선 사전상태 확인",
    reduction: "1. 안전관리자 상시 배치 및 순회점검\n2. 위험구역 통제선 설치",
  })),
  eduSigners: signers,
  representativeSignName: "김대표이사",
  representativeSignDate: "2026-06-25",
  admin: {
    issue: { name: "", dept: "생산/설비관리팀", date: "" },
    review: { name: "박세현", dept: "환경안전", date: "2026-06-25" },
    approve: { name: "이태훈", dept: "공장장", date: "2026-06-25" },
    complete: { name: "", dept: "생산/설비관리팀", date: "" },
  },
};

const overlays = buildOverlays(data as any);
fs.writeFileSync("/tmp/overlays.json", JSON.stringify({ overlays, PAGE_W, PAGE_H }));
console.log("overlays:", overlays.length);
