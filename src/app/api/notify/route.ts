import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_TO = process.env.NOTIFY_EMAIL ?? "sehyun.park@alsco.co.kr";
const FROM = process.env.RESEND_FROM ?? "작업허가서 시스템 <factory_system@alsco.co.kr>";

export async function POST(req: NextRequest) {
  try {
    const { company, workContent, workDate, startTime, endTime, supervisor, permitId } =
      await req.json();

    const subject = `[작업허가서 제출] ${company || "업체명 미입력"} — ${workContent?.slice(0, 40) || "작업내용 없음"}`;

    const html = `
<div style="font-family:'맑은 고딕',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
  <div style="background:#0a2240;padding:20px 24px;border-bottom:3px solid #e07b00;">
    <h2 style="margin:0;color:#fff;font-size:17px;">환경안전 작업허가서 — 검토 요청</h2>
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
    ${permitId ? `
    <div style="margin-top:20px;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://work-approve.vercel.app"}/fill?id=${permitId}"
         style="display:inline-block;padding:10px 20px;background:#003377;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
        허가서 보기 / 승인하기 →
      </a>
    </div>` : ""}
  </div>
  <div style="padding:12px 24px;background:#f1f5f9;font-size:11px;color:#94a3b8;">
    이 메일은 LS Alsco 작업허가서 시스템에서 자동 발송되었습니다.
  </div>
</div>`;

    await resend.emails.send({ from: FROM, to: NOTIFY_TO, subject, html });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("notify error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
