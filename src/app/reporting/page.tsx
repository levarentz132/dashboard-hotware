"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRequireAuth } from "@/hooks/use-require-auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import NotificationSystem from "@/components/ui/NotificationSystem";

const ReportingManagement = dynamic(
  () => import("@/components/reporting/ReportingManagement"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Reporting Dashboard...
      </div>
    ),
    ssr: false,
  }
);

function ReportingContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dark flex h-screen bg-[#0A1329] text-slate-100">
      <Sidebar
        activeSection="reporting"
        onSectionChange={() => {}}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-auto">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto bg-[#0A1329] px-3 sm:px-6 py-4 md:py-6"
          style={{ scrollbarGutter: "stable" }}
        >
          <ReportingManagement />
        </main>
      </div>
      <NotificationSystem />
    </div>
  );
}

export default function ReportingPage() {
  useRequireAuth();

  return (
    <Suspense
      fallback={
        <div className="h-screen bg-[#0A1329] text-slate-400 flex items-center justify-center">
          Loading Reporting...
        </div>
      }
    >
      <ReportingContent />
    </Suspense>
  );
}
