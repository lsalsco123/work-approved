import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_TO = process.env.NOTIFY_EMAIL ?? "sehyun.park@alsco.co.kr";
// alsco.co.kr 도메인이 Resend에서 인증되지 않은 경우 onboarding@resend.dev 사용
const FROM = process.env.RESEND_FROM ?? "작업허가서 시스템 <onboarding@resend.dev>";

const WORK_TYPE_LABELS: Record<string, string> = {
  general: "일반작업", hot: "화기작업", confined: "밀폐공간작업",
  electrical: "전기차단작업", elevated: "고소작업", excavation: "굴착작업",
  heavy: "중장비취급작업", radiation: "방사능작업", etc: "기타",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function frow(label: string, value: unknown): string {
  const v = String(value ?? "").trim();
  return `<tr>
    <td style="padding:6px 10px;width:130px;font-weight:600;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;white-space:nowrap;">${esc(label)}</td>
    <td style="padding:6px 10px;border:1px solid #e2e8f0;">${v ? esc(v) : '<span style="color:#94a3b8">-</span>'}</td>
  </tr>`;
}

function fsec(title: string, rows: string): string {
  if (!rows) return "";
  return `<div style="margin-bottom:20px;">
    <div style="font-size:13px;font-weight:700;color:#0a2240;padding:6px 10px;background:#f0f4f8;border-left:3px solid #e07b00;margin-bottom:8px;">${esc(title)}</div>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`;
}

function ftags(items: string[], labels?: Record<string, string>): string {
  if (!items?.length) return "";
  return items.map(v =>
    `<span style="display:inline-block;padding:2px 8px;background:#dbeafe;color:#1e3a5f;border-radius:4px;font-size:12px;margin:2px;">${esc(labels?.[v] ?? v)}</span>`
  ).join(" ");
}

function generateAttachmentHtml(d: Record<string, any>, permitId: string): string {
  let body = "";

  // 기본정보
  let basic = frow("업체명", d.company);
  basic += frow("대표자", d.representative);
  basic += frow("작업감독자", d.supervisor);
  basic += frow("작업인원", d.workerCount ? d.workerCount + " 명" : "");
  basic += frow("비상연락망", d.emergencyContact);
  basic += frow("작업일자", d.workDate);
  basic += frow("작업시간", d.startTime && d.endTime ? `${d.startTime} ~ ${d.endTime}` : "");
  basic += frow("작업내용", d.workContent);
  body += fsec("① 기본정보", basic);

  // 작업형태
  if (d.workTypes?.length) {
    let wt = frow("작업형태", ftags(d.workTypes, WORK_TYPE_LABELS));
    if (d.workTypes.includes("etc") && d.workTypeEtc) wt += frow("기타 내용", d.workTypeEtc);
    body += fsec("작업형태", wt);
  }

  // 공정
  if (d.processes?.length) {
    let proc = frow("선택 공정", ftags(d.processes));
    if (d.processes.includes("기타") && d.processEtc) proc += frow("기타 장소/공정", d.processEtc);
    body += fsec("작업장소 / 공정", proc);
  }

  // 보호구
  if (d.gear?.length) {
    let gear = frow("안전보호구", ftags(d.gear));
    if (d.gear.includes("기타") && d.gearEtc) gear += frow("기타 보호구", d.gearEtc);
    body += fsec("안전보호구", gear);
  }

  // 작업별 안전조치
  const safetyRows: string[] = [];
  const addItems = (label: string, items: string[]) => {
    if (items?.length) safetyRows.push(frow(label, ftags(items)));
  };
  addItems("일반작업", d.general);
  addItems("화기작업", d.hot);
  if (d.hotFireWatcher) safetyRows.push(frow("화재감시자", d.hotFireWatcher));
  if (d.hotFireManager) safetyRows.push(frow("소방안전관리자", d.hotFireManager));
  addItems("밀폐공간", d.confined);
  if (d.confinedWatcher) safetyRows.push(frow("밀폐공간 감시인", d.confinedWatcher));
  addItems("전기차단", d.electrical);
  if (d.electricalCutoffTime) safetyRows.push(frow("차단시간", d.electricalCutoffTime));
  if (d.electricalCutoffPerson) safetyRows.push(frow("차단인", d.electricalCutoffPerson));
  addItems("고소작업", d.elevated);
  addItems("굴착작업", d.excavation);
  if (d.excavationBuriedChecker) safetyRows.push(frow("매설확인자", d.excavationBuriedChecker));
  addItems("중장비", d.heavy);
  if (d.heavySignaler) safetyRows.push(frow("신호수/유도자", d.heavySignaler));
  if (d.heavyEquipType) safetyRows.push(frow("장비종류", d.heavyEquipType));
  addItems("방사능", d.radiation);
  if (safetyRows.length) body += fsec("작업별 안전조치", safetyRows.join(""));

  // 에너지원
  const energyLabel = d.energyMode === "none" ? "해당사항 없음" : d.energyMode === "general" ? "조치 필요" : "";
  if (energyLabel) {
    let energy = frow("에너지원 잠금장치", energyLabel);
    if (d.energyMode === "general") {
      if (d.energyDeferred) {
        energy += frow("차단 대상/위치/인", "발급 후 현장 기재 예정");
      } else {
        energy += frow("차단대상", d.energyTarget);
        energy += frow("차단위치", d.energyLocation);
        energy += frow("차단인", d.energyPerson);
      }
    }
    body += fsec("에너지원 안전잠금장치", energy);
  }

  // JSA
  if (d.jsa?.length) {
    const jsaHead = `<tr style="background:#f0f4f8;">
      <th style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">단계</th>
      <th style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">유해위험요인</th>
      <th style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">빈도</th>
      <th style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">치명도</th>
      <th style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">현재안전조치</th>
      <th style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">감소대책</th>
    </tr>`;
    const jsaBody = d.jsa.map((r: any) =>
      `<tr>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">${esc(r.step)}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">${esc(r.hazard)}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;text-align:center;">${r.frequency ?? ""}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;text-align:center;">${r.severity ?? ""}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">${esc(r.current)}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:12px;">${esc(r.reduction)}</td>
      </tr>`
    ).join("");
    body += `<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:#0a2240;padding:6px 10px;background:#f0f4f8;border-left:3px solid #e07b00;margin-bottom:8px;">JSA (위험성 평가)</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:6px;">작성자: ${esc(d.worksheetAuthor) || "-"} · 참여자: ${esc(d.riskParticipants) || "-"}</div>
      <table style="width:100%;border-collapse:collapse;">${jsaHead}${jsaBody}</table>
    </div>`;
  }

  // 신청정보
  let apply = frow("소속", d.applicantDept);
  apply += frow("성명", d.applicantName);
  apply += frow("신청일자", d.applicantDate);
  apply += frow("대표자(강사)", d.representativeSignName);
  apply += frow("교육일자", d.representativeSignDate);
  apply += frow("개인정보 동의", d.privacyConsent === "agree" ? "동의 함" : d.privacyConsent === "disagree" ? "동의하지 않음" : "");
  body += fsec("신청 정보", apply);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://work-approved.vercel.app";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>작업허가서 — ${esc(d.company)} ${esc(d.workDate)}</title>
<style>
* { box-sizing: border-box; }
body { font-family: '맑은 고딕','Malgun Gothic',Arial,sans-serif; font-size:13px; color:#1e293b; background:#f8fafc; margin:0; padding:20px; }
@media print { body { background:white; padding:0; } }
</style>
</head>
<body>
<div style="max-width:800px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
  <div style="background:#0a2240;padding:20px 24px;border-bottom:3px solid #e07b00;">
    <h1 style="margin:0 0 4px;color:#fff;font-size:18px;">환경안전 작업허가서</h1>
    <p style="margin:0;color:rgba(255,255,255,.65);font-size:12px;">LS Alsco 전산 발급 시스템 · 허가서 ID: ${esc(permitId)}</p>
  </div>
  <div style="padding:24px;">${body}</div>
  <div style="padding:12px 24px;background:#f1f5f9;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
    이 문서는 LS Alsco 작업허가서 시스템에서 자동 생성되었습니다. · <a href="${appUrl}/fill?id=${esc(permitId)}" style="color:#003377;">온라인에서 보기</a>
  </div>
</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company, workContent, workDate, startTime, endTime, supervisor, permitId, permitData } = body;

    const subject = `[작업허가서 제출] ${company || "업체명 미입력"} — ${workContent?.slice(0, 40) || "작업내용 없음"}`;

    const emailHtml = `
<div style="font-family:'맑은 고딕',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
  <div style="background:#0a2240;padding:20px 24px;border-bottom:3px solid #e07b00;">
    <h2 style="margin:0;color:#fff;font-size:17px;">환경안전 작업허가서 — 제출 알림</h2>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.65);font-size:12px;">LS Alsco 전산 발급 시스템</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#64748b;width:100px;">업체명</td><td style="padding:8px 0;font-weight:600;">${company || "-"}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">작업내용</td><td style="padding:8px 0;">${workContent || "-"}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">작업일자</td><td style="padding:8px 0;">${workDate || "-"}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">작업시간</td><td style="padding:8px 0;">${startTime || "-"} ~ ${endTime || "-"}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">작업감독자</td><td style="padding:8px 0;">${supervisor || "-"}</td></tr>
    </table>
    <p style="margin:16px 0 4px;font-size:13px;color:#64748b;">첨부 파일에서 전체 작업허가서 내용을 확인하실 수 있습니다.</p>
    ${permitId ? `
    <div style="margin-top:16px;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://work-approved.vercel.app"}/fill?id=${permitId}"
         style="display:inline-block;padding:10px 20px;background:#003377;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
        온라인에서 보기/출력 →
      </a>
    </div>` : ""}
  </div>
  <div style="padding:12px 24px;background:#f1f5f9;font-size:11px;color:#94a3b8;">
    이 메일은 LS Alsco 작업허가서 시스템에서 자동 발송되었습니다.
  </div>
</div>`;

    const attachmentHtml = permitData
      ? generateAttachmentHtml(permitData, permitId ?? "")
      : null;

    const filename = `작업허가서_${(company || "업체").replace(/[/\\?%*:|"<>]/g, "_")}_${workDate || "날짜없음"}.html`;

    await resend.emails.send({
      from: FROM,
      to: NOTIFY_TO,
      subject,
      html: emailHtml,
      ...(attachmentHtml ? {
        attachments: [{
          filename,
          content: Buffer.from(attachmentHtml, "utf-8"),
        }],
      } : {}),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("notify error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
