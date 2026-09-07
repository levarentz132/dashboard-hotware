"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import NotificationSystem from "@/components/ui/NotificationSystem";
import dynamic from "next/dynamic";

// Dynamically import heavy tab panels to enable route chunking and code splitting
const ModernDashboard = dynamic(() => import("@/components/dashboard/Dashboard"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Dashboard...</div>
});
const CameraInventory = dynamic(() => import("@/components/cameras/CameraInventory"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Camera Inventory...</div>
});
const ServerOptions = dynamic(() => import("@/components/servers/ServerOptions"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Server Settings...</div>
});
const SystemHealth = dynamic(() => import("@/components/monitoring/SystemHealth"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading System Health...</div>
});
const AlarmConsole = dynamic(() => import("@/components/alarms/AlarmConsole"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Alarm Console...</div>
});
const Analytics = dynamic(() => import("@/components/analytics/Analytics"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Analytics...</div>
});
const ConnectionTest = dynamic(() => import("@/components/debug/ConnectionTest"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Connection Test...</div>
});
const StorageManagement = dynamic(() => import("@/components/storage/StorageManagement"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Storage Management...</div>
});
const Automation = dynamic(() => import("@/components/automation/Automation"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Automation...</div>
});
const AuditLog = dynamic(() => import("@/components/audits/AuditLog"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Audit Logs...</div>
});
const UserManagement = dynamic(() => import("@/components/users/UserManagement"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading User Management...</div>
});
const SubAccountManagement = dynamic(() => import("@/components/rolemanagement/RoleManagement"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading Role Management...</div>
});
const VideoXwareDashboard = dynamic(() => import("@/components/dashboard/VideoXwareDashboard"), {
  loading: () => <div className="h-full flex items-center justify-center p-8 text-slate-400">Loading VideoXware...</div>
});
import Link from "next/link";
import { ArrowRight, Camera, Eye, Shield, Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Privilege, isAdmin } from "@/lib/auth";

const SECTION_MODULE_MAP: Record<string, string> = {
  dashboard: "dashboard",
  videoxware: "dashboard",
  cameras: "camera_inventory",
  health: "system_health",
  alarms: "alarm_console",
  audits: "user_logs",
  analytics: "analytics",
  storage: "storage",
  users: "user_management",
  subaccounts: "user_management",
  automation: "automation",
};

function PageContent() {
  const [activeSection, setActiveSection] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    const section = searchParams?.get("section") || "";

    if (!section) {
      setActiveSection("");
      return;
    }

    if (user) {
      // Admins have access to everything
      if (isAdmin(user)) {
        setActiveSection(section);
        return;
      }

      const requiredModule = SECTION_MODULE_MAP[section];

      // Explicitly block non-admins from sensitive management sections
      if (section === 'debug' || section === 'subaccounts') {
        setActiveSection("unauthorized");
        return;
      }

      if (requiredModule) {
        const privilege = user.privileges?.find((p: Privilege) => {
          if (p.module === requiredModule) return true;
          // Support legacy module names
          if (requiredModule === "system_health" && p.module === "health") return true;
          if (requiredModule === "user_management" && p.module === "users") return true;
          return false;
        });

        if (privilege?.can_view) {
          setActiveSection(section);
        } else {
          setActiveSection("unauthorized");
        }
      } else {
        // Handle custom sections not in map
        setActiveSection(section);
      }
    }
  }, [searchParams, user]);

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <Link href="/dashboard" />;
      case "videoxware":
        return <VideoXwareDashboard />;
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
      case "automation":
        return <Automation />;
      case "debug":
        return <ConnectionTest />;
      case "users":
        return <UserManagement />;
      case "subaccounts":
        return <SubAccountManagement />;
      case "unauthorized":
        return (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
            <div className="p-4 bg-red-50 rounded-full mb-4">
              <Lock className="w-12 h-12 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Limited Access</h2>
            <p className="text-slate-500 text-center max-w-md mb-8">
              Sorry, you don't have permission to access this page.
              Please contact your system administrator to get access.
            </p>
            <button
              onClick={() => setActiveSection("")}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-slate-800 transition-colors"
            >
              Back to Home
            </button>
          </div>
        );
      default:
        return (
          <div className="h-full bg-white flex items-center justify-center p-4 sm:p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="max-w-5xl w-full text-center">
              {/* Welcome Text */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-800 mb-3 sm:mb-4">
                Welcome Back!
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-gray-500 mb-8 sm:mb-10 md:mb-12 max-w-2xl mx-auto px-4">
                Monitor and manage security easily through an integrated monitoring dashboard
              </p>

              {/* CTA Button */}
              <Link
                href="/dashboard"
                className="group bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-base sm:text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center gap-2 sm:gap-3"
              >
                Enter Dashboard
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </Link>
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
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 px-3 sm:px-6 py-4 md:py-6"
          style={{ scrollbarGutter: "stable" }}
        >
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
