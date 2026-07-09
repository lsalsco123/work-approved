import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_TO = process.env.NOTIFY_EMAIL ?? "seungjung.kim@alsco.co.kr";
// alsco.co.kr 도메인이 Resend에서 인증되지 않은 경우 onboarding@resend.dev 사용
const FROM = process.env.RESEND_FROM ?? "작업허가서 시스템 <onboarding@resend.dev>";

// 사내 담당자(의뢰자) 이메일 — 서버 전용. 클라이언트 번들로 전송되지 않는다.
const MANAGER_EMAILS: Record<string, string> = {
  "이도현": "dohyun.lee@alsco.co.kr",
  "이재준": "jaejun.lee@alsco.co.kr",
  "김승정": "seungjung.kim@alsco.co.kr",
  "신동호": "dongho.shin@alsco.co.kr",
  "노대균": "daegyun.roh@alsco.co.kr",
  "박경호": "kyungho.park@alsco.co.kr",
  "노영준": "yeongjune.noh@alsco.co.kr",
  "김지훈": "jihoon.kim2@alsco.co.kr",
  "배상식": "sangsik.bae@alsco.co.kr",
  "박병후": "byounghoo.park@alsco.co.kr",
  "박세현": "sehyun.park@alsco.co.kr",
  "이승준": "seungjun.lee@alsco.co.kr",
  "이승훈": "seunghun.lee@alsco.co.kr",
  "정창재": "changjae.jeong@alsco.co.kr",
  "황성재": "sungjae.hwang@alsco.co.kr",
  "박승준": "seungjun.park@alsco.co.kr",
  "조성운": "seongun.cho@alsco.co.kr",
  "박대규": "daekyu.park@alsco.co.kr",
  "김욱진": "wookjin.kim@alsco.co.kr",
  "곽복영": "bokyoung.kwak@alsco.co.kr",
  "임종문": "jongmun.yim@alsco.co.kr",
  "김율구": "yulgu.kim@alsco.co.kr",
};
const PARK_SEHYUN_EMAIL = MANAGER_EMAILS["박세현"];

const WORK_TYPE_LABELS: Record<string, string> = {
  general: "일반작업", hot: "화기작업", confined: "밀폐공간작업",
  electrical: "전기차단작업", elevated: "고소작업", excavation: "굴착작업",
  heavy: "중장비취급작업", radiation: "방사능작업", etc: "기타",
};

// Firebase ID 토큰 검증: Identity Toolkit REST 로 프로젝트 소속/유효성 확인
// (firebase-admin·서비스계정 키 없이 NEXT_PUBLIC_FB_API_KEY 만으로 검증)
// 반환: 유효하면 호출자 uid(localId)+email, 무효/예외면 null
async function verifyIdToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_FB_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const u = Array.isArray(j.users) && j.users.length > 0 ? j.users[0] : null;
    const uid = typeof u?.localId === "string" ? u.localId : null;
    if (!uid) return null;
    return { uid, email: typeof u?.email === "string" ? u.email : "" };
  } catch {
    return null;
  }
}

// 이번 결재/처리를 수행한 당사자에게는 "당신이 방금 처리한 건" 알림을 보내지 않는다 — 본인은 이미 알고 있으므로.
function excludeActor(recipients: string[], actorEmail: string): string[] {
  const a = actorEmail.trim().toLowerCase();
  if (!a) return recipients;
  return recipients.filter((r) => r.trim().toLowerCase() !== a);
}

const PROJECT_ID = process.env.NEXT_PUBLIC_FB_PROJECT_ID;

// 소유권/권한 검증: 서비스계정 없이 호출자의 idToken 으로 Firestore REST 를 직접 호출한다.
// Firestore 보안 rules 가 호출자 권한을 자연히 강제하므로(읽기 거부=권한없음),
// 200 응답 여부 + createdBy/role 필드만으로 "소유자 또는 admin" 인지 판정할 수 있다.
// 반환: 발송 허용 시 true, 그 외(비소유·비admin·문서없음·네트워크예외) false.
async function isOwnerOrAdmin(idToken: string, uid: string, permitId: string): Promise<boolean> {
  if (!PROJECT_ID) return false;
  // 이 프로젝트 Firestore 는 named DB "default" (기본 "(default)" 아님)
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/default/documents`;
  try {
    // 해당 permit 을 호출자 토큰으로 조회 → rules 가 권한을 강제.
    // 읽기에 성공(200)하면 소유자(업체)·시스템관리자·결재라인 관리자 중 하나이므로 발송 허용.
    const permitRes = await fetch(`${base}/permits/${encodeURIComponent(permitId)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (permitRes.ok) return true;
    // 읽기 실패 시에도 admin 이면 허용 (방어적)
    const userRes = await fetch(`${base}/users/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (userRes.ok) {
      const userDoc = await userRes.json();
      if (userDoc?.fields?.role?.stringValue === "admin") return true;
    }
    return false;
  } catch {
    return false;
  }
}

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
  basic += frow("담당자(의뢰자)", d.manager);
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
    // 인증: 로그인한 Firebase 사용자만 호출 가능 (익명 메일 발송 남용 차단)
    const authz = req.headers.get("authorization") ?? "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    const caller = idToken ? await verifyIdToken(idToken) : null;
    if (!caller) {
      // 토큰 없음/무효 → 401 (기존 동작 유지)
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const { uid, email: actorEmail } = caller;

    const body = await req.json();
    const { company, workContent, workDate, startTime, endTime, supervisor, permitId, permitData } = body;

    // 소유권 검증을 위해 permitId 필수 (없으면 검증 불가 → 발송 거부)
    if (!permitId || typeof permitId !== "string") {
      return NextResponse.json({ ok: false, error: "permitId required" }, { status: 400 });
    }

    // 인가: 호출자가 해당 permit 의 소유자이거나 admin 일 때만 발송 허용
    if (!(await isOwnerOrAdmin(idToken, uid, permitId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 결재 단계별 알림(kind) — 수신자/제목/안내문 분기
    const kind: string = body.kind || "submit";
    const reason: string = body.reason || "";
    const managerName: string = (permitData?.manager as string) || "";
    const managerEmail = managerName ? MANAGER_EMAILS[managerName] : undefined;
    const FACTORY_EMAIL = process.env.FACTORY_EMAIL ?? NOTIFY_TO; // 공장장(이태훈) 메일 — 미설정 시 NOTIFY_EMAIL
    const co = company || "업체";
    const wc = (workContent || "").slice(0, 40) || "작업내용 없음";
    const both = Array.from(new Set([NOTIFY_TO, ...(managerEmail ? [managerEmail] : [])]));

    let recipients: string[];
    let subject: string;
    let headline: string;
    let intro: string;
    if (kind === "to_safety") {
      recipients = [PARK_SEHYUN_EMAIL];
      subject = `[결재요청·환경안전] ${co} — ${wc}`;
      headline = "환경안전 결재 요청";
      intro = "담당자 1차 결재가 완료되었습니다. 환경안전 결재를 진행해 주세요.";
    } else if (kind === "to_factory") {
      recipients = [FACTORY_EMAIL];
      subject = `[결재요청·공장장] ${co} — ${wc}`;
      headline = "공장장 최종 결재 요청";
      intro = "환경안전 결재가 완료되었습니다. 공장장 최종 결재를 진행해 주세요.";
    } else if (kind === "final") {
      if (!managerEmail) {
        console.error(JSON.stringify({
          level: "error",
          message: "Final approval notification manager email not found",
          route: "/api/notify",
          permitId,
          managerName,
        }));
        return NextResponse.json({ ok: false, error: "manager_email_not_found" }, { status: 422 });
      }
      recipients = Array.from(new Set([PARK_SEHYUN_EMAIL, managerEmail]));
      subject = `[최종 결재 완료] ${co} — ${wc}`;
      headline = "최종 결재 완료";
      intro = `${co}의 「${workContent || "작업"}」 건의 최종 결재가 완료되었습니다. 출력하여 업체에 전달해 주세요.`;
    } else if (kind === "reject") {
      // 반려 사유는 작성 당사자(업체)에게 직접 전달 + 담당자에게도 통지.
      let ownerEmail = "";
      try {
        const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/default/documents`;
        const pr = await fetch(`${base}/permits/${encodeURIComponent(permitId)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (pr.ok) {
          const pj = await pr.json();
          ownerEmail = pj?.fields?.createdByEmail?.stringValue || "";
        }
      } catch { /* 업체 이메일 조회 실패 시 담당자에게만 발송 */ }
      recipients = Array.from(new Set([ownerEmail, managerEmail || NOTIFY_TO].filter(Boolean)));
      subject = `[반려] ${co} — ${wc}`;
      headline = "결재 반려 — 보완 후 재제출 필요";
      intro = `제출하신 작업허가서가 반려되었습니다.${reason ? ` 사유: ${reason}` : ""} 내용을 보완하여 다시 제출해 주세요.`;
    } else { // submit
      recipients = both;
      subject = `[작업허가서 제출] ${co} — ${wc}`;
      headline = "작업허가서 제출 — 담당자 결재 필요";
      intro = "새 작업허가서가 제출되었습니다. 담당자 1차 결재를 진행해 주세요.";
    }

    // 방금 이 처리를 수행한 당사자는 수신자 목록에서 제외 (본인이 한 일이므로 재통지 불필요)
    recipients = excludeActor(recipients, actorEmail);
    if (recipients.length === 0) {
      console.log(JSON.stringify({
        level: "info",
        message: "Notification skipped — only recipient was the acting user",
        route: "/api/notify", permitId, kind,
      }));
      return NextResponse.json({ ok: true, skipped: "actor_only_recipient" });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://work-approved.vercel.app";
    const FONT = "'Malgun Gothic','맑은 고딕',Arial,sans-serif";

    // 데스크톱 아웃룩(Word 엔진) 호환: div/max-width/radius/rgba 대신 table+bgcolor+attr 기반.
    const infoRows: [string, string, boolean][] = [
      ["업체명", company || "", true],
      ["작업내용", workContent || "", false],
      ["작업일자", workDate || "", false],
      ["작업시간", (startTime || endTime) ? `${startTime || "-"} ~ ${endTime || "-"}` : "", false],
      ["작업감독자", supervisor || "", false],
      ["담당자(의뢰자)", managerName || "", true],
    ];
    const rowsHtml = infoRows.map(([label, val, bold]) => `
      <tr>
        <td width="96" style="padding:7px 10px 7px 0;font-family:${FONT};font-size:14px;color:#64748b;vertical-align:top;white-space:nowrap;">${esc(label)}</td>
        <td style="padding:7px 0;font-family:${FONT};font-size:14px;color:#1e293b;${bold ? "font-weight:bold;" : ""}">${esc(val) || "-"}</td>
      </tr>`).join("");

    const buttonHtml = permitId ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
        <tr>
          <td align="center" bgcolor="#003377" style="background:#003377;border-radius:6px;">
            <a href="${appUrl}/fill?id=${esc(permitId)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
              ${kind === "final" ? "출력/확인하기 &rarr;" : "결재/확인하기 &rarr;"}
            </a>
          </td>
        </tr>
      </table>` : "";

    const emailHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:20px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;">
        <tr>
          <td bgcolor="#0a2240" style="background-color:#0a2240;border-bottom:3px solid #e07b00;padding:20px 24px;">
            <div style="font-family:${FONT};font-size:17px;font-weight:bold;color:#ffffff;">환경안전 작업허가서 &mdash; ${esc(headline)}</div>
            <div style="font-family:${FONT};font-size:12px;color:#9fb3c8;padding-top:4px;">LS Alsco 전산 발급 시스템</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 14px;font-family:${FONT};font-size:14px;color:#1e293b;font-weight:bold;">${esc(intro)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table>
            ${buttonHtml}
          </td>
        </tr>
        <tr>
          <td bgcolor="#f1f5f9" style="background-color:#f1f5f9;padding:12px 24px;font-family:${FONT};font-size:11px;color:#94a3b8;">
            이 메일은 LS Alsco 작업허가서 시스템에서 자동 발송되었습니다.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    const { data: sent, error: sendError } = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject,
      html: emailHtml,
    });

    if (sendError) {
      console.error(JSON.stringify({
        level: "error",
        message: "Resend email delivery request failed",
        route: "/api/notify",
        permitId,
        kind,
        recipientCount: recipients.length,
        error: sendError.message,
      }));
      return NextResponse.json({ ok: false, error: "email_send_failed" }, { status: 502 });
    }

    console.log(JSON.stringify({
      level: "info",
      message: "Permit notification accepted by Resend",
      route: "/api/notify",
      permitId,
      kind,
      recipientCount: recipients.length,
      emailId: sent?.id,
    }));

    return NextResponse.json({ ok: true, id: sent?.id });
  } catch (e) {
    console.error("notify error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
