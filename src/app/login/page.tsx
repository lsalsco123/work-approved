"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const ERR_MAP: Record<string, string> = {
  "auth/user-not-found": "아이디를 찾을 수 없습니다.",
  "auth/invalid-credential": "아이디 또는 비밀번호가 올바르지 않습니다.",
  "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
  "auth/email-already-in-use": "이미 사용 중인 아이디입니다.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/invalid-email": "사용할 수 없는 아이디입니다.",
  "auth/too-many-requests": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
};

const SLIDES = [
  "/alsco-slider/desktop_1.jpg",
  "/alsco-slider/desktop_2.jpg",
  "/alsco-slider/desktop_3.jpg",
  "/alsco-slider/desktop_4.jpg",
];

export default function LoginPage() {
  const { login, register, user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "admin" ? "/admin" : "/fill");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && !company.trim()) {
      setError("업체명을 입력하세요."); return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, company.trim());
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      setError(ERR_MAP[code] ?? "오류가 발생했습니다. 다시 시도해 주세요.");
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
      {/* Background slider — only load current + adjacent slides */}
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
      {/* Dark overlay */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(10,34,64,.72) 0%, rgba(0,51,119,.55) 100%)", zIndex: 1 }} />

      {/* Login card */}
      <div style={{
        position: "relative", zIndex: 2,
        width: 380, padding: "36px 32px 28px",
        background: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.32)",
        borderRadius: 16,
        boxShadow: "0 8px 40px rgba(0,0,0,.35)",
        color: "#fff",
      }}>
        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/ls_alsco_logo.png" alt="LS Alsco" style={{ height: 36, marginBottom: 12 }} />
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#fff" }}>환경안전 작업허가서</h2>
          <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: 13 }}>LS Alsco 전산 발급 시스템</p>
        </div>

        {/* Tab toggle */}
        <div style={{ display: "flex", border: "1px solid rgba(255,255,255,.28)", borderRadius: 8, overflow: "hidden", marginBottom: 22 }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
              flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "background .15s",
              background: mode === m ? "rgba(0,51,119,.75)" : "transparent",
              color: mode === m ? "#fff" : "rgba(255,255,255,.65)",
            }}>
              {m === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 5 }}>업체명</label>
              <input style={inputStyle} type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                placeholder="(주)○○○○" required />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 5 }}>아이디</label>
            <input style={inputStyle} type="text" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="아이디 또는 이메일" required autoComplete="username" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 5 }}>비밀번호</label>
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "6자 이상" : ""} required
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
          {error && <p style={{ color: "#fca5a5", fontSize: 13, margin: "2px 0 10px", fontWeight: 500 }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{
            width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 700, marginTop: 4,
            background: submitting ? "rgba(0,51,119,.5)" : "#003377",
            color: "#fff", border: "none", borderRadius: 8,
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background .15s",
            boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          }}>
            {submitting ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,.45)", textAlign: "center" }}>
          관리자 계정은 Firebase 콘솔에서 role=admin 설정 필요
        </p>
      </div>

      {/* Slide dots */}
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
