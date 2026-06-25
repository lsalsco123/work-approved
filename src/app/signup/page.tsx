"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpCompany } from "@/lib/accounts";

const ERR_MAP: Record<string, string> = {
  "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정하세요.",
  "auth/invalid-email": "올바른 이메일 주소를 입력하세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/too-many-requests": "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
};

export default function SignupPage() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw !== pw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    setSubmitting(true);
    try {
      await signUpCompany(email, company, pw);
      setDone(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      const localMsg = (err as { message?: string })?.message;
      setError(ERR_MAP[code] ?? (code ? "가입 중 오류가 발생했습니다." : (localMsg || "가입 중 오류가 발생했습니다.")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(135deg,#0a2240 0%,#003377 100%)" }}>
      <div className="panel" style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <img src="/ls_alsco_logo.png" alt="LS Alsco" style={{ height: 34, marginBottom: 10 }} />
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>업체 회원가입</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>작업허가서 발급 시스템</p>
        </div>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✉️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>가입 신청 완료</h3>
            <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
              <b>{email}</b> 로 인증 메일을 보냈습니다.<br />
              메일의 링크로 인증을 마치면 <b>관리자 승인</b> 후 이용할 수 있어요.
            </p>
            <button className="mini btn-accent" style={{ marginTop: 14, width: "100%" }} onClick={() => router.replace("/my")}>로그인 화면으로 이동</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>업체명</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예) 신우기전" required />
            </div>
            <div className="field">
              <label>이메일 (로그인 아이디)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="company@example.com" required autoComplete="username" />
            </div>
            <div className="field">
              <label>비밀번호 (6자 이상)</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="field">
              <label>비밀번호 확인</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" />
            </div>
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "4px 0 10px", fontWeight: 500 }}>{error}</p>}
            <button type="submit" className="btn-accent" disabled={submitting} style={{ width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 700, borderRadius: 8, marginTop: 4 }}>
              {submitting ? "가입 중…" : "가입 신청"}
            </button>
            <p style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#64748b" }}>
              이미 계정이 있으신가요? <Link href="/login" style={{ color: "#003377", fontWeight: 600 }}>로그인</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
