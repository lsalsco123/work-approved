import React from "react";

// 제작자 표기 — 대시보드(내 목록/결재함/관리자) 하단 공통 푸터
export default function BuiltBy() {
  return (
    <div
      className="no-print"
      style={{ textAlign: "center", padding: "16px 0 22px", color: "#94a3b8", fontSize: 12, letterSpacing: ".3px" }}
    >
      build by 김승정
    </div>
  );
}
