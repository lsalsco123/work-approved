"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { sendResetEmail } from "@/lib/accounts";

const ERR_MAP: Record<string, string> = {
  "auth/user-not-found": "계정을 찾을 수 없습니다.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
  "auth/invalid-email": "올바른 이메일 주소를 입력하세요.",
  "auth/too-many-requests": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
};

const SLIDES = [
  "/alsco-slider/desktop_1.jpg",
  "/alsco-slider/desktop_2.jpg",
  "/alsco-slider/desktop_3.jpg",
  "/alsco-slider/desktop_4.jpg",
];

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slide, setSlide] = useState(0);
  const [rememberId, setRememberId] = useState(false);

  // 저장된 아이디(이메일) 자동 입력 — 비밀번호는 저장하지 않음
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ptw_login_id");
      if (saved) { setId(saved); setRememberId(true); }
    } catch { /* localStorage 사용 불가 환경 무시 */ }
  }, []);

  const handleReset = async () => {
    setError(""); setInfo("");
    if (!id.includes("@")) { setError("재설정 메일을 받을 이메일 주소를 입력란에 먼저 입력하세요."); return; }
    try { await sendResetEmail(id); setInfo("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요."); }
    catch { setError("재설정 메일 발송에 실패했습니다. 이메일을 확인하세요."); }
  };

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "admin" ? "/admin" : user.role === "manager" ? "/manager" : "/my");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    // 아이디 저장 설정 반영 (체크 시 이메일 보관, 해제 시 삭제)
    try {
      if (rememberId) localStorage.setItem("ptw_login_id", id.trim());
      else localStorage.removeItem("ptw_login_id");
    } catch { /* 무시 */ }
    try {
      await login(id, password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      setError(ERR_MAP[code] ?? "아이디 또는 비밀번호를 확인하세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a2240", color: "rgba(255,255,255,.6)", fontSize: 14 }}>
      로딩 중…
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {SLIDES.map((src, i) => {
        const dist = Math.min(Math.abs(i - slide), SLIDES.length - Math.abs(i - slide));
        if (dist > 1) return null;
        return (
          <div key={src} style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${src})`,
            backgroundSize: "cover", backgroundPosition: "center",
            transition: "opacity 1s ease",
            opacity: i === slide ? 1 : 0,
            zIndex: 0,
          }} />
        );
      })}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(10,34,64,.72) 0%, rgba(0,51,119,.55) 100%)", zIndex: 1 }} />

      <div className="login-card" style={{
        position: "relative", zIndex: 2,
        width: 380, padding: "36px 32px 28px",
        background: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.32)",
        borderRadius: 16,
        boxShadow: "0 8px 40px rgba(0,0,0,.35)",
        color: "#fff",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/ls_alsco_logo.png" alt="LS Alsco" style={{ height: 36, marginBottom: 12 }} />
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#fff" }}>환경안전 작업허가서</h2>
          <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: 13 }}>LS Alsco 전산 발급 시스템</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 5 }}>이메일</label>
            <input style={inputStyle} type="text" value={id} onChange={(e) => setId(e.target.value)}
              placeholder="company@example.com" required autoComplete="username" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 5 }}>비밀번호</label>
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 14px" }}>
            <input id="rememberId" type="checkbox" checked={rememberId} onChange={(e) => setRememberId(e.target.checked)}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#003377" }} />
            <label htmlFor="rememberId" style={{ fontSize: 13, color: "rgba(255,255,255,.85)", cursor: "pointer", userSelect: "none" }}>아이디 저장</label>
          </div>
          {error && <p style={{ color: "#fca5a5", fontSize: 13, margin: "2px 0 10px", fontWeight: 500 }}>{error}</p>}
          {info && <p style={{ color: "#bbf7d0", fontSize: 13, margin: "2px 0 10px", fontWeight: 500 }}>{info}</p>}
          <button type="submit" disabled={submitting} style={{
            width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 700, marginTop: 4,
            background: submitting ? "rgba(0,51,119,.5)" : "#003377",
            color: "#fff", border: "none", borderRadius: 8,
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background .15s",
            boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          }}>
            {submitting ? "로그인 중…" : "로그인"}
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 13 }}>
            <Link href="/signup" style={{ color: "#fff", fontWeight: 600, textDecoration: "none" }}>회원가입</Link>
            <button type="button" onClick={handleReset} style={{ background: "none", border: "none", color: "rgba(255,255,255,.8)", fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
              비밀번호를 잊으셨나요?
            </button>
          </div>
        </form>
      </div>

      <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 2 }}>
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setSlide(i)} style={{
            width: i === slide ? 20 : 6, height: 6, borderRadius: 3, border: "none",
            background: i === slide ? "#fff" : "rgba(255,255,255,.35)",
            padding: 0, cursor: "pointer", transition: "all .3s",
          }} />
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px",
  background: "rgba(255,255,255,0.90)",
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: 7, fontSize: 13,
  fontFamily: "inherit", color: "#111b27",
  boxSizing: "border-box",
  outline: "none",
};
