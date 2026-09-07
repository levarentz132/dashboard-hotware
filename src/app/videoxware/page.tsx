"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRequireAuth } from "@/hooks/use-require-auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

const VideoXwareDashboard = dynamic(
  () => import("@/components/dashboard/VideoXwareDashboard"),
  { ssr: false }
);

function VideoXwareContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        activeSection="videoxware"
        onSectionChange={() => {}}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-auto">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-6 flex flex-col">
          <VideoXwareDashboard />
        </main>
      </div>
    </div>
  );
}

export default function VideoXwarePage() {
  useRequireAuth();

  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-slate-400">Loading VideoXware...</div>}>
      <VideoXwareContent />
    </Suspense>
  );
}
