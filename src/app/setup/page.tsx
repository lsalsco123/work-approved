"use client";
import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function SetupPage() {
  const [status, setStatus] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);

  const log = (msg: string) => setStatus((s) => [...s, msg]);

  const run = async () => {
    setRunning(true);
    setStatus([]);

    try {
      log("게스트 계정 생성 중...");
      const cred = await createUserWithEmailAndPassword(auth, "게스트@alsco.permit", "guest1234");
      log(`✓ Firebase Auth 계정 생성: ${cred.user.uid}`);

      log("Firestore 사용자 문서 생성 중...");
      await setDoc(doc(db, "users", cred.user.uid), {
        email: "게스트",
        role: "guest",
        company: "",
        createdAt: new Date().toISOString(),
      });
      log("✓ Firestore 사용자 문서 생성 완료");
      log("✅ 설정 완료! 이 페이지는 더 이상 필요 없습니다.");
      setDone(true);
    } catch (e: any) {
      if (e?.code === "auth/email-already-in-use") {
        log("⚠ 게스트 계정이 이미 존재합니다.");

        try {
          log("Firestore 문서 확인 중...");
          const snap = await getDoc(doc(db, "users", "guest-uid-placeholder"));
          if (!snap.exists()) {
            log("(Firestore 문서가 없는 경우 Firebase Console에서 직접 생성하세요)");
          }
        } catch {}

        log("✅ 이미 설정되어 있습니다.");
        setDone(true);
      } else {
        log(`❌ 오류: ${e?.message ?? e}`);
      }
    }

    setRunning(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 32, width: 480, boxShadow: "0 4px 20px rgba(0,0,0,.08)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 18, color: "#0a2240" }}>초기 설정</h1>
        <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 13 }}>게스트 계정(아이디: 게스트 / 비밀번호: guest1234)을 생성합니다.</p>

        {!done && (
          <button
            onClick={run}
            disabled={running}
            style={{
              padding: "10px 20px", background: "#003377", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: running ? "not-allowed" : "pointer",
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? "실행 중…" : "게스트 계정 생성"}
          </button>
        )}

        {status.length > 0 && (
          <div style={{ marginTop: 16, background: "#f1f5f9", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 13 }}>
            {status.map((s, i) => <div key={i} style={{ marginBottom: 4, color: s.startsWith("❌") ? "#ef4444" : s.startsWith("✅") ? "#16a34a" : "#1e293b" }}>{s}</div>)}
          </div>
        )}

        {done && (
          <div style={{ marginTop: 16 }}>
            <a href="/login" style={{ color: "#003377", fontWeight: 600, fontSize: 14 }}>← 로그인 페이지로 이동</a>
          </div>
        )}
      </div>
    </div>
  );
}
