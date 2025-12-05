"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import CameraInventory from "@/components/cameras/CameraInventory";
import ServerOptions from "@/components/servers/ServerOptions";
import SystemHealth from "@/components/monitoring/SystemHealth";
import AlarmConsole from "@/components/alarms/AlarmConsole";
import Analytics from "@/components/analytics/Analytics";
import NotificationSystem from "@/components/ui/NotificationSystem";
import ConnectionTest from "@/components/debug/ConnectionTest";
import StorageManagement from "@/components/storage/StorageManagement";

export default function Home() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <DashboardOverview />;
      case "cameras":
        return <CameraInventory />;
      case "servers":
        return <ServerOptions />;
      case "health":
        return <SystemHealth />;
      case "alarms":
        return <AlarmConsole />;
      case "analytics":
        return <Analytics />;
      case "storage":
        return <StorageManagement />;
      case "debug":
        return <ConnectionTest />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-auto">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-3 sm:p-4 md:p-6">{renderContent()}</main>
      </div>
      <NotificationSystem />
    </div>
  );
}
