"use client";

import { useState, useEffect, useRef } from "react";
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
  Menu,
  ChevronLeft,
  LogOut,
  User,
  Loader2,
  Cpu
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Privilege, isAdmin } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  hideHeader?: boolean;
  className?: string;
  disableCollapse?: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof Camera;
  href?: string;
  module?: string; // Add module for permission check
}

const navigationItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", module: "dashboard" },
  { id: "cameras", label: "Camera Inventory", icon: Camera, module: "camera_inventory" },
  { id: "health", label: "System Health", icon: Activity, module: "system_health" },
  { id: "alarms", label: "Alarm Console", icon: AlertTriangle, module: "alarm_console" },
  { id: "audits", label: "User Logs", icon: Users, module: "user_logs" },
  { id: "analytics", label: "Analytics", icon: BarChart3, module: "analytics" },
  { id: "storage", label: "Storage", icon: Database, module: "storage" },
  // { id: "automation", label: "Automation", icon: Cpu, module: "automation" },
  { id: "users", label: "User Management", icon: Users, module: "user_management" },
  { id: "subaccounts", label: "Role Management", icon: UserPlus, module: "user_management" },
];

export default function Sidebar({ activeSection, onSectionChange, isOpen = false, onClose, hideHeader = false, className, disableCollapse = false }: SidebarProps) {
  const router = useRouter();
  const { user, logout, isLoading: isAuthLoading } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(disableCollapse ? false : true);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Sync collapsed state with prop
  useEffect(() => {
    if (disableCollapse) {
      setIsCollapsed(false);
    }
  }, [disableCollapse]);

  // Load and save sidebar collapsed state to localStorage
  useEffect(() => {
    if (disableCollapse) return;

    const isInitialLoad = !sessionStorage.getItem("app-session-started");
    const saved = localStorage.getItem("sidebar-collapsed");

    if (isInitialLoad) {
      // Force collapse on first load of the app session
      setIsCollapsed(true);
      localStorage.setItem("sidebar-collapsed", "true");
      sessionStorage.setItem("app-session-started", "true");
    } else if (saved !== null) {
      setIsCollapsed(saved === "true");
    }

    // Handle clicks outside to collapse
    const handleClickOutside = (event: MouseEvent) => {
      // Don't collapse if clicking a toggle button or something that should stay open
      // Also ignore clicks inside Radix UI portals (like the dropdown menu)
      const target = event.target as HTMLElement;
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(target as Node) &&
        !target.closest('[data-radix-popper-content-wrapper]')
      ) {
        setIsCollapsed(true);
        localStorage.setItem("sidebar-collapsed", "true");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [disableCollapse]);

  const toggleCollapse = (e?: React.MouseEvent) => {
    if (disableCollapse) return;
    if (e) e.stopPropagation();
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

  const handleSidebarClick = () => {
    if (disableCollapse) return;
    if (isCollapsed) {
      setIsCollapsed(false);
      localStorage.setItem("sidebar-collapsed", "false");
    }
  };

  // Filter navigation items based on user privileges
  const filteredItems = navigationItems.filter(item => {
    // Admins see everything
    if (isAdmin(user)) return true;

    // Explicitly hide sensitive management items from non-admins
    if (item.id === 'debug' || item.id === 'subaccounts') return false;

    // If item has a module requirement, check privileges
    if (item.module) {
      const privilege = user?.privileges?.find((p: Privilege) => {
        if (p.module === item.module) return true;
        // Support legacy module names
        if (item.module === "system_health" && p.module === "health") return true;
        if (item.module === "user_management" && p.module === "users") return true;
        return false;
      });
      return privilege?.can_view === true;
    }

    // Default to visible if no module specified (like home/general)
    return true;
  });

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

  const NavButton = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;

    return (
      <button
        onClick={() => handleNavClick(item)}
        className={cn(
          "flex items-center w-full transition-all duration-200 group no-drag h-12 text-left px-0",
          isActive
            ? "bg-blue-50 text-blue-600 border-r-2 border-blue-600"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        )}
      >
        <div className="w-20 flex justify-center items-center shrink-0 h-full">
          <Icon className={cn(
            "flex-shrink-0 transition-all w-5 h-5",
            isActive && !isCollapsed && "text-blue-600"
          )} />
        </div>

        <span className={cn(
          "truncate font-medium transition-all duration-300 ease-in-out pr-4",
          isCollapsed ? "w-0 opacity-0" : "flex-1 opacity-100"
        )}>
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        onClick={handleSidebarClick}
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out drag-region cursor-pointer",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isCollapsed ? "w-20" : "w-64 cursor-default",
          hideHeader ? "" : "shadow-xl lg:shadow-none",
          className
        )}
      >
        {/* Header */}
        {!hideHeader && (
          <div className={cn(
            "flex items-center border-b border-gray-100 h-16 shrink-0",
            isCollapsed ? "justify-center px-0" : "justify-between px-6"
          )}>
            {!isCollapsed && (
              <div className="no-drag whitespace-nowrap overflow-hidden min-w-0 flex-1 mr-2">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight truncate">Hotware</h1>
                <p className="text-xs text-gray-500 font-medium truncate">Camera Dashboard</p>
              </div>
            )}

            {/* Collapse Button (Desktop) */}
            {!disableCollapse && (
              <button
                onClick={toggleCollapse}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors no-drag"
              >
                {isCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
            )}

            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg no-drag"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 no-drag scrollbar-hide">
          <div className="space-y-4">
            {filteredItems.map((item) => (
              isCollapsed ? (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div><NavButton item={item} /></div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium ml-2">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <NavButton key={item.id} item={item} />
              )
            ))}
          </div>
        </nav>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50/50 no-drag shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-3 rounded-xl transition-colors hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 cursor-pointer group w-full h-[52px] justify-start px-2"
              )}>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shrink-0 shadow-sm text-white font-bold text-sm">
                  {user?.username?.[0]?.toUpperCase() || <User className="w-5 h-5" />}
                </div>

                {!isCollapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.username || "Guest User"}</p>
                    <p className="text-xs text-gray-500 truncate capitalize">{typeof user?.role === 'object' && user?.role !== null && 'name' in user.role ? user.role.name : user?.role || "User"}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()} side={isCollapsed ? "right" : "top"} align={isCollapsed ? "end" : "start"} className="w-56 z-[9999] bg-white" sideOffset={10}>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.username || "Guest User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">{typeof user?.role === 'object' && user?.role !== null && 'name' in user.role ? user.role.name : user?.role || "User"}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                disabled={isAuthLoading}
                className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                {isAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                {isAuthLoading ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}
