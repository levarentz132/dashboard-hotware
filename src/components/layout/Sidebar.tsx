"use client";

import {
  Camera,
  Home,
  Activity,
  AlertTriangle,
  BarChart3,
  Users,
  Database,
  Server,
  X,
  Dog,
  LayoutDashboard,
  Settings,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof Camera;
  href?: string;
}

const navigationItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard-full-view" },
  { id: "cameras", label: "Camera Inventory", icon: Camera },
  // { id: "servers", label: "Server Options", icon: Server },
  { id: "health", label: "System Health", icon: Activity },
  { id: "alarms", label: "Alarm Console", icon: AlertTriangle },
  { id: "audits", label: "User Logs", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  // { id: "debug", label: "Connection Debug", icon: Settings },
  { id: "storage", label: "Storage", icon: Database },
  { id: "users", label: "User Management", icon: Users },
  { id: "subaccounts", label: "Role Management", icon: UserPlus },
  // { id: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ activeSection, onSectionChange, isOpen = false, onClose }: SidebarProps) {
  const router = useRouter();

  const handleNavClick = (item: NavItem) => {
    // If item has href, navigate to that page
    if (item.href) {
      router.push(item.href);
      if (onClose) {
        onClose();
      }
      return;
    }

    // Update URL with section param to enable browser history (back button support)
    router.push(`/?section=${item.id}`);

    // Otherwise, use section change
    onSectionChange(item.id);
    // Close sidebar on mobile after selection
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <div
        className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white shadow-lg
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">Hotware</h1>
            <p className="text-xs sm:text-sm text-gray-600">Camera Dashboard</p>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={onClose}
            className="lg:hidden p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 sm:mt-6 overflow-y-auto max-h-[calc(100vh-100px)]">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`w-full flex items-center px-4 sm:px-6 py-2.5 sm:py-3 text-left transition-colors text-sm sm:text-base ${activeSection === item.id
                    ? "bg-blue-50 text-blue-600 border-r-2 border-blue-600"
                    : "text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
