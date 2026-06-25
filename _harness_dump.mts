// 오프라인 좌표 검증 하니스 — buildOverlays 출력을 JSON 으로 덤프 (tsx 실행)
import { buildOverlays, PAGE_W, PAGE_H } from "./src/lib/form";
import { sampleGeneral } from "./src/lib/samples";
import fs from "fs";

const sign = fs.readFileSync("/tmp/sign.txt", "utf8").trim();

const data = {
  ...sampleGeneral(),
  workTypes: ["general", "hot"],
  hot: ["소화기 비치 유무", "불티비산방지 조치유무"],
  hotFireWatcher: "김민수",
  hotFireManager: "박세현",
  jsa: [
    { step: "일반작업", hazard: "1. 현장 외 구역 무단출입으로 인한 충돌\n2. 작업특성 미인지로 인한 부상\n3. 전동공구 사용시 감전사고", frequency: 1, severity: 2, current: "1. 작업구획에 대한 사전교육\n2. 작업전 개인별 작업지시\n3. 전동공구 및 작업선 사전상태 확인", reduction: "" },
    { step: "화기작업", hazard: "불티 비산으로 인한 화재", frequency: 2, severity: 3, current: "불티방지포 설치", reduction: "소화기 비치, 화재감시자 배치" },
  ],
  eduSigners: [
    { name: "김민수", sign },
    { name: "박민주", sign },
    { name: "김철수", sign },
  ],
};

const overlays = buildOverlays(data as any);
fs.writeFileSync("/tmp/overlays.json", JSON.stringify({ overlays, PAGE_W, PAGE_H }));
console.log("overlays:", overlays.length, "PAGE_W", PAGE_W, "PAGE_H", PAGE_H);
