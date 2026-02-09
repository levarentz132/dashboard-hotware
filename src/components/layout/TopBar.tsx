"use client";

import { useState } from "react";
import { Bell, User, Settings, Menu, LogOut, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TopBarProps {
  onMenuClick?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  user: "User",
};

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout, isLoading: isAuthLoading } = useAuth();
  const { connected, loading: isSystemLoading } = useSystemInfo();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="bg-white shadow-sm border-b px-3 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Right Side Actions */}
        <div className="flex items-center gap-1 sm:gap-3 ml-auto">
          {/* System Status - Hidden on mobile */}
          <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600 px-2 group cursor-help">
            {isSystemLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
            ) : (
              <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'}`}></div>
            )}
            <span className="hidden lg:inline font-medium">
              {isSystemLoading ? 'Checking...' : connected ? 'System Online' : 'System Offline'}
            </span>
          </div>

          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-[10px] sm:text-xs">
                  3
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                Tidak ada notifikasi baru.
              </div>
            </PopoverContent>
          </Popover>

          {/* Settings - Hidden on small mobile */}
          <button className="hidden xs:block p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
            <Settings className="w-5 h-5" />
          </button>

          {/* User Profile with Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-2 border-l border-gray-200 hover:bg-gray-50 rounded-lg p-1 transition-colors">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span className="hidden md:block text-sm font-medium text-gray-700">
                  {user?.username ?? "User"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user?.username ?? "User"}</span>
                  <span className="text-xs text-gray-500">
                    {isAdmin(user)
                      ? "Administrator"
                      : user?.role
                        ? typeof user.role === "string"
                          ? ROLE_LABELS[user.role.toLowerCase()] ?? user.role
                          : user.role.name
                        : "Role not set"}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
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
    </header>
  );
}
