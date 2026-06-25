"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

// 게스트(업체) 페이지 접근 게이트.
//  - 미로그인 → /login
//  - 관리자 → 그대로 통과(게이트 면제)
//  - 게스트: 이메일 미인증 → 인증 안내 / status=pending → 승인 대기 / blocked → 차단 / active → children
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, resendVerification, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }
  if (user.role === "admin") return <>{children}</>;

  const Shell = (inner: React.ReactNode) => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#f1f5f9" }}>
      <div className="panel" style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        {inner}
        <button className="mini" style={{ marginTop: 18 }} onClick={() => logout()}>로그아웃</button>
      </div>
    </div>
  );

  if (!user.emailVerified) {
    const resend = async () => {
      setBusy(true); setMsg("");
      try { await resendVerification(); setMsg("인증 메일을 다시 보냈습니다. 메일함을 확인하세요."); }
      catch { setMsg("잠시 후 다시 시도해 주세요."); }
      finally { setBusy(false); }
    };
    return Shell(
      <>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✉️</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>이메일 인증이 필요합니다</h2>
        <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          <b>{user.email}</b> 로 보낸 인증 메일의 링크를 클릭한 뒤<br />아래 <b>인증 완료</b>를 눌러주세요.
        </p>
        {msg && <p className="note note-warn" style={{ marginTop: 14, textAlign: "left" }}><span className="ico">✓</span>{msg}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="mini btn-accent" disabled={busy} onClick={async () => { setBusy(true); await refresh(); setBusy(false); }}>인증 완료 ↻</button>
          <button className="mini" disabled={busy} onClick={resend}>인증 메일 재발송</button>
        </div>
      </>
    );
  }

  if (user.status === "pending") {
    return Shell(
      <>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>관리자 승인 대기 중</h2>
        <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          가입과 이메일 인증이 완료되었습니다.<br />관리자가 <b>{user.company || "업체"}</b> 계정을 승인하면 이용할 수 있어요.
        </p>
        <button className="mini" style={{ marginTop: 14 }} onClick={async () => { setBusy(true); await refresh(); setBusy(false); }} disabled={busy}>상태 새로고침 ↻</button>
      </>
    );
  }

  if (user.status === "blocked") {
    return Shell(
      <>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚫</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>차단된 계정입니다</h2>
        <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          이 계정은 현재 사용이 제한되어 있습니다.<br />문의가 필요하면 담당자에게 연락해 주세요.
        </p>
      </>
    );
  }

  return <>{children}</>;
}
