"use client";
import FormRenderer from "@/components/FormRenderer";
import { sampleSinwoo } from "@/lib/samples";

export default function PreviewPage() {
  const data = sampleSinwoo();
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
