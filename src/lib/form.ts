import coordsData from "./coords.json";
import marksData from "./marks.json";
import { PermitData, riskGrade } from "./types";
import { managerDept } from "./managers";

type Box = { page: number; x: number; y: number; w: number; h: number };
type Mark = { page: number; sq: [number, number]; ci?: [number, number] };

const COORDS = (coordsData as any).coords as Record<string, Box>;
const MARKS = marksData as unknown as Record<string, Mark>;
export const PAGE_W = (coordsData as any).pageW as number;
export const PAGE_H = (coordsData as any).pageH as number;

export function cell(ref: string): Box {
  const b = COORDS[ref];
  if (!b) throw new Error("unknown cell " + ref);
  return b;
}
// union box across a range "A1:C3"
export function range(tl: string, br: string): Box {
  const a = cell(tl), b = cell(br);
  return { page: a.page, x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
}

// ---- overlay primitives ----
export interface TextItem {
  kind: "text";
  page: number;
  x: number; y: number; w: number; h: number;
  text: string;
  align: "left" | "center" | "right";
  valign: "top" | "middle";
  fontPt: number;
  cover?: boolean;     // white-out the cell first
  wrap?: boolean;
}
export interface MarkItem {
  kind: "mark";
  page: number;
  x: number; y: number; // center, normalized
  glyph: "square" | "circle";
  sizePt: number;
}
export interface OvalItem {
  kind: "oval";
  page: number;
  x: number; y: number; w: number; h: number;
}
export interface ImageItem {
  kind: "image";
  page: number;
  x: number; y: number; w: number; h: number;
  src: string;
}
export type Overlay = TextItem | MarkItem | OvalItem | ImageItem;

// 셀 안에 여백을 두고 이미지를 맞춰 넣는다 (서명 등)
function imgFit(b: Box, src: string): ImageItem {
  return { kind: "image", page: b.page, x: b.x + b.w * 0.04, y: b.y + b.h * 0.08, w: b.w * 0.92, h: b.h * 0.84, src };
}

const DEF_FONT = 7.5; // pt at print scale

function txt(ref: string, text: string, opts: Partial<TextItem> = {}): TextItem {
  const b = cell(ref);
  const cellHpt = b.h * PAGE_H;
  const want = opts.fontPt ?? DEF_FONT;
  const fontPt = opts.wrap ? want : Math.max(5, Math.min(want, cellHpt * 0.82));
  return {
    kind: "text", page: b.page, x: b.x, y: b.y, w: b.w, h: b.h,
    text, align: opts.align ?? "left", valign: opts.valign ?? "middle",
    fontPt, cover: opts.cover, wrap: opts.wrap,
    ...(opts.x !== undefined ? { x: opts.x } : {}),
    ...(opts.w !== undefined ? { w: opts.w } : {}),
  };
}

function boxText(b: Box, text: string, opts: Partial<TextItem> = {}): TextItem {
  return {
    kind: "text", page: b.page, x: b.x, y: b.y, w: b.w, h: b.h,
    text, align: opts.align ?? "left", valign: opts.valign ?? "top",
    fontPt: opts.fontPt ?? DEF_FONT, cover: opts.cover, wrap: opts.wrap ?? true,
  };
}

// 인쇄된 "소속 :" 뒤에 값만 기입
function deptVal(ref: string, value: string): TextItem {
  const b = cell(ref);
  return txt(ref, value, { x: b.x + b.w * 0.22, w: b.w * 0.76, align: "left", valign: "middle", fontPt: 6.5 });
}
// 인쇄된 "성명 :" 뒤, "(인)" 앞 빈칸에 이름 기입 (폭 0.18로 (인) 겹침 방지)
function nameVal(ref: string, name: string): TextItem {
  const b = cell(ref);
  return txt(ref, name, { x: b.x + b.w * 0.26, w: b.w * 0.18, align: "center", valign: "middle", fontPt: 6.5 });
}

function squareMark(ref: string): MarkItem | null {
  const m = MARKS[ref]; if (!m) return null;
  return { kind: "mark", page: m.page, x: m.sq[0], y: m.sq[1], glyph: "square", sizePt: 5 };
}
function circleMark(ref: string): MarkItem | null {
  const m = MARKS[ref]; if (!m || !m.ci) return null;
  return { kind: "mark", page: m.page, x: m.ci[0], y: m.ci[1], glyph: "circle", sizePt: 5 };
}

// ---- static option definitions (value -> {label, cell}) ----
export const WORK_TYPES = [
  { v: "general", label: "일반작업 (①②⑪⑫)", cell: "A17" },
  { v: "hot", label: "화기작업 (①②③⑩⑪⑫)", cell: "F17" },
  { v: "confined", label: "밀폐공간작업 (①②④⑩⑪⑫)", cell: "K17" },
  { v: "electrical", label: "전기차단(정전)작업 (①②⑤⑪⑫)", cell: "A19" },
  { v: "elevated", label: "고소작업 (①②⑥⑪⑫)", cell: "F19" },
  { v: "excavation", label: "굴착작업 (①②⑦⑪⑫)", cell: "K19" },
  { v: "heavy", label: "중장비취급작업 (①②⑧⑪⑫)", cell: "A21" },
  { v: "radiation", label: "방사능작업 (①②⑨⑪⑫)", cell: "F21" },
  { v: "etc", label: "기타", cell: "K21" },
];

export const GEAR = [
  { v: "안전모", cell: "A47" }, { v: "안전화", cell: "D47" }, { v: "귀마개", cell: "G47" },
  { v: "보호안경", cell: "J47" }, { v: "보안면", cell: "M47" },
  { v: "방진마스크", cell: "A49" }, { v: "방독마스크", cell: "D49" }, { v: "안전대(안전밸트)", cell: "G49" },
  { v: "방열보호구", cell: "J49" }, { v: "절연보호구", cell: "M49" },
  { v: "공기호흡기", cell: "A51" }, { v: "기타", cell: "D51" },
];

export const GENERAL = [
  { v: "작업구역 설정 및 통제", cell: "A57" }, { v: "작업장 위험요인 제거", cell: "F57" },
  { v: "유해·위험 기계·기구 위험성 확인", cell: "K57" },
  { v: "옥외작업시 기상상태 확인", cell: "A59" }, { v: "작업지휘자 배치 및 작업 현황판 설치", cell: "F59" },
  { v: "조명장비 설치", cell: "K59" },
  { v: "통신장비 확인", cell: "A61" }, { v: "2인 1조 작업", cell: "F61" },
];

export const HOT = [
  { v: "소화기 비치 유무", cell: "A65" }, { v: "불티비산방지 조치유무", cell: "F65" }, { v: "가스 농도 측정", cell: "K65" },
  { v: "밸브차단표지 부착 유무", cell: "A67" }, { v: "가연성(인화) 물질 제거", cell: "F67" }, { v: "공정 위험물질 방출", cell: "K67" },
  { v: "불활성 가스 치환", cell: "A69" }, { v: "용기 내부 세정 및 처리", cell: "F69" }, { v: "통풍 환기 상태 확인", cell: "K69" },
];

export const CONFINED = [
  { v: "가스 농도 측정", cell: "A73" }, { v: "환기 및 배기장치 설치", cell: "F73" }, { v: "호흡용 보호구 유무", cell: "K73" },
  { v: "압력방출", cell: "A75" }, { v: "해당작업자 외 출입금지 조치", cell: "F75" }, { v: "작업방법 교육", cell: "K75" },
];

export const ELECTRICAL = [
  { v: "주전원 차단 확인", cell: "A79" }, { v: "전기차단.잠금 표시 부착", cell: "F79" }, { v: "충전부 절연상태 및 방호상태 확인", cell: "K79" },
];

export const ELEVATED = [
  { v: "안전대(안전밸트) 착용", cell: "A83" }, { v: "작업발판 및 안전난간 설치", cell: "F83" }, { v: "추락방지용 방망 설치", cell: "K83" },
  { v: "고소작업대(작업차) 사용", cell: "A85" },
];

export const EXCAVATION = [
  { v: "지하매설물(기계배관) 확인", cell: "A89" }, { v: "지하매설물(소방배관) 확인", cell: "F89" }, { v: "지하매설물(가스배관)", cell: "K89" },
  { v: "지하매설물(전기동력선) 확인", cell: "A91" }, { v: "기타케이블 확인", cell: "F91" }, { v: "지반상태확인", cell: "K91" },
];

export const HEAVY = [
  { v: "자격 확인", cell: "Q3" }, { v: "작업계획서 확인", cell: "V3" }, { v: "노면상태 및 주변설비 확인", cell: "AA3" },
  { v: "장비 이동경로 확인", cell: "Q5" }, { v: "투입장비 안전점검 실시", cell: "V5" },
];

export const RADIATION = [
  { v: "방사능 취급자격 유무", cell: "Q9" }, { v: "방사능 위험표시 등", cell: "V9" },
];

// 공정 배치도 (도형 사각형 범위) — 빨간 동그라미 위치
export const PROCESSES: { name: string; tl: string; br: string }[] = [
  { name: "DRP공정", tl: "C25", br: "E27" },
  { name: "대형포장", tl: "E30", br: "F31" },
  { name: "그린플로우", tl: "D30", br: "I33" },
  { name: "수조탱크", tl: "J30", br: "J32" },
  { name: "2층사무동", tl: "C33", br: "C41" },
  { name: "정밀절단", tl: "D34", br: "E35" },
  { name: "대형압출", tl: "F34", br: "G35" },
  { name: "PA절단", tl: "D36", br: "E38" },
  { name: "PA코팅", tl: "E36", br: "F37" },
  { name: "컨펌", tl: "D39", br: "G40" },
  { name: "대형절단", tl: "G34", br: "H37" },
  { name: "대형주조", tl: "H34", br: "I37" },
  { name: "프로페르찌", tl: "H38", br: "I40" },
  { name: "용해로", tl: "I34", br: "J40" },
  { name: "용해로집진기", tl: "I41", br: "J42" },
  { name: "폐기물보관장", tl: "K25", br: "L30" },
  { name: "드로스보관장", tl: "K30", br: "L33" },
  { name: "옥외저장소", tl: "K34", br: "L36" },
  { name: "스크랩보관장소", tl: "K37", br: "L42" },
  { name: "기타", tl: "", br: "" },
];

// JSA 6개 행 그룹의 시작 행 (각 그룹 셀: 단계A, 위험요인B, 빈도E, 치명도F, 등급G, 현재H, 감소L)
const JSA_ROWS = [104, 117, 130, 143, 156, 169];

// 작업승인(관리자) 행
const ADMIN_ROWS = { issue: 172, review: 175, approve: 178, complete: 183 };

const KDOW = ["일", "월", "화", "수", "목", "금", "토"];
function dow(date: string): string {
  if (!date) return "";
  const d = new Date(date + "T00:00:00");
  return isNaN(d.getTime()) ? "" : KDOW[d.getDay()];
}
function ymd(date: string) {
  const [y, m, d] = (date || "").split("-");
  return { y: y || "", m: m || "", d: d || "" };
}
export function fmtWorkTime(date: string, s: string, e: string): string {
  if (!date) return "";
  const { y, m, d } = ymd(date);
  return `${y} . ${m} . ${d}  ( ${dow(date)} )   ${s} ~ ${e}`;
}
export function fmtKDate(date: string): string {
  if (!date) return "";
  const { y, m, d } = ymd(date);
  return `${y}  .  ${m} .  ${d}   (   ${dow(date)}   )`;
}

// ---- main builder ----
export function buildOverlays(data: PermitData): Overlay[] {
  const out: Overlay[] = [];
  const push = (o: Overlay | null) => { if (o) out.push(o); };

  // ① 기본정보
  if (data.company) push(txt("C3", data.company));
  if (data.representative) push(txt("C5", data.representative));
  if (data.supervisor) push(txt("C7", data.supervisor));
  if (data.workerCount) push(txt("J5", `${data.workerCount} 명( ${data.workerCount} 名)`, { cover: true }));
  if (data.emergencyContact) push(txt("J7", data.emergencyContact, { cover: true, x: cell("J7").x + cell("J7").w * 0.1, w: cell("J7").w * 0.88 }));
  if (data.workDate) push(txt("C9", fmtWorkTime(data.workDate, data.startTime, data.endTime)));
  if (data.workContent) push(txt("C11", data.workContent, { wrap: true, valign: "middle" }));

  // ⑦ 작업형태
  const selWT = (v: string) => data.workTypes.includes(v);
  WORK_TYPES.forEach((w) => { if (selWT(w.v)) push(squareMark(w.cell)); });
  if (selWT("etc") && data.workTypeEtc) push(txt("L21", data.workTypeEtc, { fontPt: 6.5 }));

  // 공정 빨간 동그라미
  data.processes.forEach((p) => {
    const def = PROCESSES.find((x) => x.name === p);
    if (def && def.tl && def.br) { const b = range(def.tl, def.br); out.push({ kind: "oval", ...b }); }
  });

  // ① 안전보호구
  GEAR.forEach((x) => { if (data.gear.includes(x.v)) push(squareMark(x.cell)); });
  if (data.gear.includes("기타") && data.gearEtc) push(txt("E51", data.gearEtc, { fontPt: 6.5 }));

  // 작업별 안전조치
  const grp = (defs: { v: string; cell: string }[], sel: string[]) =>
    defs.forEach((x) => { if (sel.includes(x.v)) push(squareMark(x.cell)); });
  grp(GENERAL, data.general);
  grp(HOT, data.hot);
  grp(CONFINED, data.confined);
  grp(ELECTRICAL, data.electrical);
  grp(ELEVATED, data.elevated);
  grp(EXCAVATION, data.excavation);
  grp(HEAVY, data.heavy);
  grp(RADIATION, data.radiation);

  // 보조 인원/텍스트
  if (data.hotFireWatcher) push(txt("F63", `화재감시자 : ${data.hotFireWatcher}`, { fontPt: 6.5 }));
  if (data.hotFireManager) push(txt("K63", `소방안전관리자 : ${data.hotFireManager}`, { fontPt: 6.5 }));
  if (data.confinedWatcher) push(txt("G71", `감시인 : ${data.confinedWatcher}`, { fontPt: 6.5 }));
  if (data.electricalCutoffTime) push(txt("E77", `차단시간 : ${data.electricalCutoffTime}`, { fontPt: 6.5 }));
  if (data.electricalCutoffPerson) push(txt("I77", `차단인 : ${data.electricalCutoffPerson}`, { fontPt: 6.5 }));
  if (data.excavationBuriedChecker) push(txt("G87", `매설확인자 : ${data.excavationBuriedChecker}`, { fontPt: 6.5 }));
  if (data.heavySignaler) push(txt("U1", `신호수/유도자 : ${data.heavySignaler}`, { fontPt: 6.5 }));
  if (data.heavyEquipType) push(txt("AA5", data.heavyEquipType, { fontPt: 6.5 }));

  // ⑪ 에너지원
  if (data.energyMode === "none") push(squareMark("Q31"));
  if (data.energyMode === "general") push(squareMark("U31"));
  if (data.energyMode === "general") {
    if (data.energyDeferred) {
      push(txt("Q33", "발급 후 작성예정", { x: cell("Q33").x, fontPt: 7 }));
    } else {
      if (data.energyTarget) push(txt("Q33", data.energyTarget, { fontPt: 6.5 }));
      if (data.energyLocation) push(txt("V33", data.energyLocation, { fontPt: 6.5 }));
      if (data.energyPerson) push(txt("AB33", data.energyPerson, { fontPt: 6.5 }));
    }
  }

  // ⑫ Work Sheet
  if (data.worksheetAuthor) push(txt("A97", `작성자/담당자 :     ${data.worksheetAuthor}     (인)`, { cover: true, fontPt: 7 }));
  if (data.riskParticipants) push(txt("F97", `위험성평가 참여자 : ${data.riskParticipants}`, { cover: true, fontPt: 7 }));

  data.jsa.slice(0, 6).forEach((r, i) => {
    const rw = JSA_ROWS[i];
    // 단계 숫자는 템플릿에 인쇄되어 있으므로 중복 추가하지 않음
    if (r.hazard) {
      const b = cell(`B${rw}`);
      const yo = b.h * 0.06;
      push(boxText({ ...b, y: b.y + yo, h: b.h - yo }, r.hazard, { fontPt: 5 }));
    }
    if (r.frequency !== "") push(boxText(cell(`E${rw}`), String(r.frequency), { align: "center", valign: "middle", fontPt: 5.5 }));
    if (r.severity !== "") push(boxText(cell(`F${rw}`), String(r.severity), { align: "center", valign: "middle", fontPt: 5.5 }));
    if (r.frequency !== "" && r.severity !== "")
      push(boxText(cell(`G${rw}`), riskGrade(Number(r.frequency), Number(r.severity)), { align: "center", valign: "middle", fontPt: 5.5 }));
    if (r.current) {
      const b = cell(`H${rw}`);
      const yo = b.h * 0.06;
      push(boxText({ ...b, y: b.y + yo, h: b.h - yo }, r.current, { fontPt: 5 }));
    }
    if (r.reduction) {
      const b = cell(`L${rw}`);
      const yo = b.h * 0.06;
      push(boxText({ ...b, y: b.y + yo, h: b.h - yo }, r.reduction, { fontPt: 5 }));
    }
  });

  // 교육 서약 - 참여자 성명 (Q138부터 3열 x 6행: Q/V/AA, rows 138,140,142,144,146,148)
  const EDU_COLS = ["Q", "V", "AA"];       // 성명 칸
  const EDU_SIGN_COLS = ["S", "X", "AC"];  // 서명 칸 (넓은 칸)
  const EDU_ROWS = [138, 140, 142, 144, 146, 148];
  data.eduSigners.slice(0, 18).forEach((s, i) => {
    const col = i % 3, rw = EDU_ROWS[Math.floor(i / 3)];
    if (s.name) push(txt(`${EDU_COLS[col]}${rw}`, s.name, { align: "center", fontPt: 6.5 }));
    if (s.sign) out.push(imgFit(cell(`${EDU_SIGN_COLS[col]}${rw}`), s.sign));
  });
  if (data.representativeSignName) push(nameVal("S150", data.representativeSignName));
  if (data.representativeSignDate) push(txt("X150", fmtKDate(data.representativeSignDate), { fontPt: 7 }));

  // 개인정보 동의
  if (data.privacyConsent === "agree") push(squareMark("Q161"));
  if (data.privacyConsent === "disagree") push(squareMark("Y161"));

  // 신청 (업체) — 인쇄된 "소속 :"/"성명 :" 뒤에 값만 기입
  if (data.applicantDept) push(deptVal("T167", data.applicantDept));
  if (data.applicantName) push(nameVal("X167", data.applicantName));
  if (data.applicantDate) {
    const abd = cell("AB167");
    push(txt("AB167", fmtKDate(data.applicantDate), { x: abd.x - abd.w * 0.18, w: abd.w * 1.18, fontPt: 7 }));
  }

  // ⑰ 작업승인 (관리자)
  (["issue", "review", "approve", "complete"] as const).forEach((k) => {
    const s = data.admin[k]; const rw = ADMIN_ROWS[k];
    let dept = s.dept ?? "", name = s.name ?? "";
    // 발급 = 사내 담당자(의뢰자)
    if (k === "issue" && data.manager) { dept = managerDept(data.manager) || dept; name = data.manager; }
    // 검토 = 소속 항상 "환경안전" (성명은 환경안전팀에서 선택)
    if (k === "review") { dept = "환경안전"; }
    // 승인 = 항상 공장장 이태훈
    if (k === "approve") { dept = "공장장"; name = "이태훈"; }
    if (dept) push(deptVal(`T${rw}`, dept));
    if (name) push(nameVal(`X${rw}`, name));
    if (s.date) push(txt(`AB${rw}`, fmtKDate(s.date), { fontPt: 7 }));
  });

  // 환경안전팀 확인 (○ -> ●)
  data.confirmed.forEach((ref) => push(circleMark(ref)));

  return out;
}

// 관리자 확인(○ -> ●) 대상: 업체가 체크했고 원형 마크가 존재하는 셀
export function confirmableItems(data: PermitData): { ref: string; label: string }[] {
  const out: { ref: string; label: string }[] = [];
  const add = (ref: string, label: string) => { if (MARKS[ref]?.ci) out.push({ ref, label }); };
  WORK_TYPES.forEach((w) => { if (data.workTypes.includes(w.v)) add(w.cell, `작업형태: ${w.label}`); });
  GEAR.forEach((x) => { if (data.gear.includes(x.v)) add(x.cell, `보호구: ${x.v}`); });
  GENERAL.forEach((x) => { if (data.general.includes(x.v)) add(x.cell, `일반: ${x.v}`); });
  HOT.forEach((x) => { if (data.hot.includes(x.v)) add(x.cell, `화기: ${x.v}`); });
  CONFINED.forEach((x) => { if (data.confined.includes(x.v)) add(x.cell, `밀폐: ${x.v}`); });
  ELECTRICAL.forEach((x) => { if (data.electrical.includes(x.v)) add(x.cell, `전기: ${x.v}`); });
  ELEVATED.forEach((x) => { if (data.elevated.includes(x.v)) add(x.cell, `고소: ${x.v}`); });
  EXCAVATION.forEach((x) => { if (data.excavation.includes(x.v)) add(x.cell, `굴착: ${x.v}`); });
  HEAVY.forEach((x) => { if (data.heavy.includes(x.v)) add(x.cell, `중장비: ${x.v}`); });
  RADIATION.forEach((x) => { if (data.radiation.includes(x.v)) add(x.cell, `방사능: ${x.v}`); });
  if (data.energyMode === "none") add("Q31", "에너지원: 해당없음");
  if (data.energyMode === "general") add("U31", "에너지원: 차단조치");
  return out;
}
