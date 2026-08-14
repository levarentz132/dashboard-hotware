"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyDashboardCloud() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/cloud/dashboard");
  }, [router]);

  return (
    <div className="h-screen bg-[#060B18] flex items-center justify-center text-slate-400 text-sm">
      Redirecting to Cloud Dashboard...
    </div>
  );
}
