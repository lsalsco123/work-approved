"use client";
import { useEffect } from "react";

// App Router 전역 에러 바운더리: 렌더링/데이터 로딩 중 예기치 못한 예외를 잡아
// 사용자에게 한국어 안내와 "다시 시도" 버튼을 제공한다(흰 화면 방지).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f8fafc" }}>
      <div style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 32 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 18, color: "#0a2240" }}>문제가 발생했습니다</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
          페이지를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => reset()} className="primary">다시 시도</button>
          <button onClick={() => { window.location.href = "/"; }}>처음으로</button>
        </div>
      </div>
    </div>
  );
}
