"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import DraggableDashboard from "@/components/dashboard/DraggableDashboard";
import CameraInventory from "@/components/cameras/CameraInventory";
import ServerOptions from "@/components/servers/ServerOptions";
import SystemHealth from "@/components/monitoring/SystemHealth";
import AlarmConsole from "@/components/alarms/AlarmConsole";
import Analytics from "@/components/analytics/Analytics";
import NotificationSystem from "@/components/ui/NotificationSystem";
import ConnectionTest from "@/components/debug/ConnectionTest";
import StorageManagement from "@/components/storage/StorageManagement";
import AuditLog from "@/components/audits/AuditLog";
import UserManagement from "@/components/users/UserManagement";
import Link from "next/link";
import { ArrowRight, Camera, Eye, Shield } from "lucide-react";

function PageContent() {
  const [activeSection, setActiveSection] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const section = searchParams.get("section");
    if (section) {
      setActiveSection(section);
    }
  }, [searchParams]);

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <Link href="/dashboard-full-view" />;
      case "cameras":
        return <CameraInventory />;
      case "servers":
        return <ServerOptions />;
      case "health":
        return <SystemHealth />;
      case "alarms":
        return <AlarmConsole />;
      case "audits":
        return <AuditLog />;
      case "analytics":
        return <Analytics />;
      case "storage":
        return <StorageManagement />;
      case "debug":
        return <ConnectionTest />;
      case "users":
        return <UserManagement />;
      default:
        return (
          <div className="h-full bg-white flex items-center justify-center p-4 sm:p-6 md:p-8">
            <div className="max-w-5xl w-full text-center">
              {/* Welcome Text */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-800 mb-3 sm:mb-4">
                Selamat Datang
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-gray-600 mb-2 sm:mb-3">di Sistem Monitoring CCTV</p>
              <p className="text-sm sm:text-base md:text-lg text-gray-500 mb-8 sm:mb-10 md:mb-12 max-w-2xl mx-auto px-4">
                Pantau dan kelola keamanan dengan mudah melalui dashboard monitoring yang terintegrasi
              </p>

              {/* CTA Button */}
              <Link
                href="/dashboard-full-view"
                className="group bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-base sm:text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center gap-2 sm:gap-3"
              >
                Masuk ke Dashboard
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </Link>

              {/* Feature Icons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-12 sm:mt-14 md:mt-16 max-w-4xl mx-auto px-4">
                <div className="bg-gray-50 p-5 sm:p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
                  <Eye className="text-blue-600 mx-auto mb-3" size={28} />
                  <h3 className="text-gray-800 font-semibold mb-2 text-base sm:text-lg">Live Monitoring</h3>
                  <p className="text-gray-600 text-sm">Pantau real-time</p>
                </div>
                <div className="bg-gray-50 p-5 sm:p-6 rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-md transition-all">
                  <Shield className="text-green-600 mx-auto mb-3" size={28} />
                  <h3 className="text-gray-800 font-semibold mb-2 text-base sm:text-lg">Keamanan Terjamin</h3>
                  <p className="text-gray-600 text-sm">Sistem terenkripsi</p>
                </div>
                <div className="bg-gray-50 p-5 sm:p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all">
                  <Camera className="text-purple-600 mx-auto mb-3" size={28} />
                  <h3 className="text-gray-800 font-semibold mb-2 text-base sm:text-lg">Multi Kamera</h3>
                  <p className="text-gray-600 text-sm">Akses semua lokasi</p>
                </div>
              </div>
            </div>
          </div>
        );
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
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-3 sm:p-4 md:p-6">
          {renderContent()}
        </main>
      </div>
      <NotificationSystem />
    </div>
  );
}

export default function Home() {
  // Protect this page - redirect to login if not authenticated
  useRequireAuth();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PageContent />
    </Suspense>
  );
}
