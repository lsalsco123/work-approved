import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import SignatureLog from "@/components/SignatureLog";

export const metadata: Metadata = {
  title: "환경안전 작업허가서",
  description: "작업허가서 전산 발급 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SignatureLog />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
