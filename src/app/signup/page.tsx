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

const ALSCO_COMPANY = "LS알스코";

// 개인정보 수집·이용 동의 — 표준 4항목(수집항목/목적/보유기간/거부권·불이익)
const PRIVACY_NOTICE = `1. 수집 항목: 이메일 주소, 이름, 소속(업체명), 전화번호

2. 수집 목적: 작업허가서 시스템 계정 발급 및 본인 확인, 결재 처리·통지

3. 보유 기간: 회원 탈퇴 시 또는 계정 삭제 시까지

4. 동의 거부 권리 및 불이익 안내: 위 개인정보 수집·이용에 동의하지 않을 권리가 있으며, 동의하지 않을 경우 회원가입 및 서비스 이용이 불가합니다.`;

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 10, maxWidth: 420, width: "100%", maxHeight: "80vh", overflow: "auto", padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>개인정보 수집·이용 동의</h3>
        <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7, color: "#334155", margin: 0 }}>{PRIVACY_NOTICE}</p>
        <button className="mini" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>닫기 ✕</button>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [isAlsco, setIsAlsco] = useState(false);
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [hasViewedPrivacy, setHasViewedPrivacy] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw !== pw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (!name.trim()) { setError("이름을 입력하세요."); return; }
    if (!privacyAgreed) { setError("개인정보 수집·이용에 동의해야 가입할 수 있습니다."); return; }
    // 업체명(소속)과 이름은 별개로 저장 — 알스코 인원은 소속이 "LS알스코"로 고정되고 이름으로 구분된다
    const companyName = isAlsco ? ALSCO_COMPANY : company;
    setSubmitting(true);
    try {
      await signUpCompany(email, companyName, name, phone, pw, privacyAgreed);
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
          <img src="/ls_alsco_logo_color.png" alt="LS Alsco" style={{ height: 34, marginBottom: 10 }} />
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>회원가입</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>작업허가서 발급 시스템</p>
        </div>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✉️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>가입 신청 완료</h3>
            <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
              <b>{isAlsco ? ALSCO_COMPANY : company}</b> <b>{name}</b> ({email}) 으로<br />
              인증 메일을 보냈습니다.<br />
              메일의 링크로 인증을 마치면 <b>관리자 승인</b> 후 이용할 수 있어요.
            </p>
            <button className="mini btn-accent" style={{ marginTop: 14, width: "100%" }} onClick={() => router.replace("/my")}>확인</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>가입 유형</label>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: `1.5px solid ${!isAlsco ? "#003377" : "#cbd5e1"}`, borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, color: !isAlsco ? "#003377" : "#64748b", background: !isAlsco ? "#eef4ff" : "#fff" }}>
                  <input type="radio" name="kind" checked={!isAlsco} onChange={() => setIsAlsco(false)} style={{ accentColor: "#003377" }} />
                  업체
                </label>
                <label style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: `1.5px solid ${isAlsco ? "#003377" : "#cbd5e1"}`, borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, color: isAlsco ? "#003377" : "#64748b", background: isAlsco ? "#eef4ff" : "#fff" }}>
                  <input type="radio" name="kind" checked={isAlsco} onChange={() => setIsAlsco(true)} style={{ accentColor: "#003377" }} />
                  알스코 인원
                </label>
              </div>
            </div>
            {isAlsco ? (
              <div className="field">
                <label>소속</label>
                <input value={ALSCO_COMPANY} disabled style={{ background: "#f1f5f9", color: "#475569" }} />
              </div>
            ) : (
              <div className="field">
                <label>업체명</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예) 승정테크" required />
              </div>
            )}
            <div className="field">
              <label>이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 김승정" required />
            </div>
            <div className="field">
              <label>전화번호</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="예) 010-1234-5678" required />
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
            <div className="field">
              <label>개인정보 수집·이용 동의</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" className="mini" onClick={() => { setShowPrivacy(true); setHasViewedPrivacy(true); }}>
                  전문 보기
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: hasViewedPrivacy ? "#1e293b" : "#94a3b8", cursor: hasViewedPrivacy ? "pointer" : "not-allowed" }}>
                  <input
                    type="checkbox"
                    checked={privacyAgreed}
                    disabled={!hasViewedPrivacy}
                    onChange={(e) => setPrivacyAgreed(e.target.checked)}
                  />
                  위 내용을 확인하였으며 개인정보 수집·이용에 동의합니다.
                </label>
              </div>
              {!hasViewedPrivacy && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>"전문 보기"를 눌러 내용을 확인해야 동의할 수 있습니다.</p>}
            </div>
            {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "4px 0 10px", fontWeight: 500 }}>{error}</p>}
            <button type="submit" className="btn-accent" disabled={submitting || !privacyAgreed} style={{ width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 700, borderRadius: 8, marginTop: 4 }}>
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
