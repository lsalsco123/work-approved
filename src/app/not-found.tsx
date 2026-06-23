import Link from "next/link";

// App Router 404: 존재하지 않는 경로 접근 시 한국어 안내와 홈 이동 링크 제공.
export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f8fafc" }}>
      <div style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 32 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 18, color: "#0a2240" }}>페이지를 찾을 수 없습니다</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <Link href="/" style={{ display: "inline-block", padding: "10px 20px", background: "#003377", color: "#fff", textDecoration: "none", borderRadius: 6, fontSize: 14, fontWeight: 600 }}>
          처음으로
        </Link>
      </div>
    </div>
  );
}
