"use client";

import { useState, useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import NotificationSystem from "@/components/ui/NotificationSystem";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Cloud, Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Privilege, isAdmin } from "@/lib/auth";

// Dynamically import tab panels
const ModernDashboard = dynamic(
  () => import("@/components/dashboard/Dashboard"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Dashboard...
      </div>
    ),
  },
);
const CameraInventory = dynamic(
  () => import("@/components/cameras/CameraInventory"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Camera Inventory...
      </div>
    ),
  },
);
const ServerOptions = dynamic(
  () => import("@/components/servers/ServerOptions"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Server Settings...
      </div>
    ),
  },
);
const SystemHealth = dynamic(
  () => import("@/components/monitoring/SystemHealth"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading System Health...
      </div>
    ),
  },
);
const AlarmConsole = dynamic(() => import("@/components/alarms/AlarmConsole"), {
  loading: () => (
    <div className="h-full flex items-center justify-center p-8 text-slate-400">
      Loading Alarm Console...
    </div>
  ),
});
const Analytics = dynamic(() => import("@/components/analytics/Analytics"), {
  loading: () => (
    <div className="h-full flex items-center justify-center p-8 text-slate-400">
      Loading Analytics...
    </div>
  ),
});
const ConnectionTest = dynamic(
  () => import("@/components/debug/ConnectionTest"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Connection Test...
      </div>
    ),
  },
);
const StorageManagement = dynamic(
  () => import("@/components/storage/StorageManagement"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Storage Management...
      </div>
    ),
  },
);
const Automation = dynamic(() => import("@/components/automation/Automation"), {
  loading: () => (
    <div className="h-full flex items-center justify-center p-8 text-slate-400">
      Loading Automation...
    </div>
  ),
});
const AuditLog = dynamic(() => import("@/components/audits/AuditLog"), {
  loading: () => (
    <div className="h-full flex items-center justify-center p-8 text-slate-400">
      Loading Audit Logs...
    </div>
  ),
});
const UserManagement = dynamic(
  () => import("@/components/users/UserManagement"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading User Management...
      </div>
    ),
  },
);
const SubAccountManagement = dynamic(
  () => import("@/components/rolemanagement/RoleManagement"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Role Management...
      </div>
    ),
  },
);
const CloudRecordings = dynamic(
  () => import("@/components/recordings/CloudRecordings"),
  { ssr: false },
);
const ReportingManagement = dynamic(
  () => import("@/components/reporting/ReportingManagement"),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center p-8 text-slate-400">
        Loading Reports & Analytics...
      </div>
    ),
  },
);

const SECTION_MODULE_MAP: Record<string, string> = {
  dashboard: "dashboard",
  cameras: "camera_inventory",
  health: "system_health",
  alarms: "alarm_console",
  audits: "user_logs",
  analytics: "analytics",
  reporting: "analytics",
  storage: "storage",
  users: "user_management",
  subaccounts: "user_management",
  automation: "automation",
  recordings: "recordings",
};

export function CloudPageContent() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");

  useEffect(() => {
    let section = "";
    if (pathname.includes("/camera-inventory") || pathname.includes("/cameras")) {
      section = "cameras";
    } else if (pathname.includes("/system-health") || pathname.includes("/health")) {
      section = "health";
    } else if (pathname.includes("/alarm-console") || pathname.includes("/alarms")) {
      section = "alarms";
    } else if (pathname.includes("/recordings")) {
      section = "recordings";
    } else if (pathname.includes("/user-logs") || pathname.includes("/audits")) {
      section = "audits";
    } else if (pathname.includes("/reporting") || pathname.includes("/reports")) {
      section = "reporting";
    } else if (pathname.includes("/storage")) {
      section = "storage";
    } else if (pathname.includes("/user-management") || pathname.includes("/users")) {
      section = "users";
    } else if (pathname.includes("/role-management") || pathname.includes("/subaccounts")) {
      section = "subaccounts";
    } else if (pathname.includes("/dashboard")) {
      section = searchParams?.get("section") || "dashboard";
    }

    if (!section) {
      setActiveSection("dashboard");
      return;
    }

    if (user) {
      if (isAdmin(user)) {
        setActiveSection(section);
        return;
      }

      const requiredModule = SECTION_MODULE_MAP[section];
      if (section === "debug" || section === "subaccounts") {
        setActiveSection("unauthorized");
        return;
      }

      if (requiredModule) {
        const privilege = user.privileges?.find((p: Privilege) => {
          if (p.module === requiredModule) return true;
          if (requiredModule === "system_health" && p.module === "health") return true;
          if (requiredModule === "user_management" && p.module === "users") return true;
          return false;
        });

        if (privilege?.can_view || section === "recordings" || section === "reporting") {
          setActiveSection(section);
        } else {
          setActiveSection("unauthorized");
        }
      } else {
        setActiveSection(section);
      }
    } else {
      setActiveSection(section);
    }
  }, [pathname, searchParams, user]);

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <ModernDashboard />;
      case "cameras":
        return <CameraInventory />;
      case "servers":
        return <ServerOptions />;
      case "health":
        return <SystemHealth />;
      case "alarms":
        return <AlarmConsole />;
      case "recordings":
        return <CloudRecordings />;
      case "audits":
        return <AuditLog />;
      case "analytics":
        return <Analytics />;
      case "reporting":
        return <ReportingManagement />;
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
          <div className="h-full flex flex-col items-center justify-center p-8 bg-[#0B1224] rounded-2xl shadow-sm border border-white/10">
            <div className="p-4 bg-red-500/10 rounded-full mb-4">
              <Lock className="w-12 h-12 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mb-2">
              Limited Access
            </h2>
            <p className="text-slate-400 text-center max-w-md mb-8">
              Sorry, you don't have permission to access this page. Please
              contact your system administrator to get access.
            </p>
            <button
              onClick={() => setActiveSection("dashboard")}
              className="bg-cyan-500 text-[#04101F] px-6 py-2.5 rounded-xl font-semibold hover:bg-cyan-400 transition-colors"
            >
              Back to Home
            </button>
          </div>
        );
      default:
        return <ModernDashboard />;
    }
  };

  return (
    <div className="dark flex h-screen bg-[#0A1329] text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-auto">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto bg-[#0A1329] px-3 sm:px-6 py-4 md:py-6"
          style={{ scrollbarGutter: "stable" }}
        >
          {renderContent()}
        </main>
      </div>
      <NotificationSystem />
    </div>
  );
}

export default function CloudCatchAllPage() {
  useRequireAuth();

  return (
    <Suspense fallback={<div className="h-screen bg-[#0A1329] text-slate-400 flex items-center justify-center">Loading Cloud Dashboard...</div>}>
      <CloudPageContent />
    </Suspense>
  );
}
