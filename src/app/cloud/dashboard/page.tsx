"use client";

import { Suspense } from "react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { CloudPageContent } from "../[...slug]/page";

export default function CloudDashboardPage() {
  useRequireAuth();

  return (
    <Suspense fallback={<div className="h-screen bg-[#060B18] text-slate-400 flex items-center justify-center">Loading Cloud Dashboard...</div>}>
      <CloudPageContent />
    </Suspense>
  );
}
