"use client";
import { useEffect } from "react";

// 개발자 시그니처 — 브라우저 콘솔 이스터에그 (앱 로드 시 1회)
export default function SignatureLog() {
  useEffect(() => {
    try {
      console.log(
        "%c🛠️ build by 김승정 %c LS Alsco 작업허가서 전산 시스템 ",
        "background:#0a2240;color:#f59e0b;font-weight:bold;padding:5px 10px;border-radius:4px 0 0 4px;font-size:13px;",
        "background:#f59e0b;color:#0a2240;font-weight:bold;padding:5px 10px;border-radius:0 4px 4px 0;font-size:13px;",
      );
    } catch { /* noop */ }
  }, []);
  return null;
}
