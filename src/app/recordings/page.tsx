"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRequireAuth } from "@/hooks/use-require-auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

const CloudRecordings = dynamic(
  () => import("@/components/recordings/CloudRecordings"),
  { ssr: false }
);

function RecordingsContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        activeSection="recordings"
        onSectionChange={() => {}}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-auto">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50"
          style={{ scrollbarGutter: "stable" }}
        >
          <CloudRecordings />
        </main>
      </div>
    </div>
  );
}

export default function RecordingsPage() {
  useRequireAuth();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RecordingsContent />
    </Suspense>
  );
}
