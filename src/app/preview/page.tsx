"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import FormRenderer from "@/components/FormRenderer";
import { sampleSinwoo } from "@/lib/samples";
import { useAuth } from "@/lib/auth";

export default function PreviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const data = sampleSinwoo();

  // 내부 양식 미리보기는 관리자 전용 (로그아웃/게스트 접근 차단)
  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user || user.role !== "admin") {
    return <div className="loading"><span className="spinner" />불러오는 중…</div>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div className="no-print" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>미리보기 (검증: 신우기전 샘플)</h2>
        <button onClick={() => window.print()} style={{ padding: "6px 14px", cursor: "pointer" }}>인쇄 / PDF</button>
      </div>
      <FormRenderer data={data} />
    </div>
  );
}
