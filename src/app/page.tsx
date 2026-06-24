"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role === "admin") router.replace("/admin");
      else router.replace("/fill");
    }
  }, [user, loading, router]);

  return <div className="loading"><span className="spinner" />불러오는 중…</div>;
}
