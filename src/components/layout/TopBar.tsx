"use client";

import { useState, useEffect } from "react";
import { Bell, Menu, Minus, Square, X, RefreshCw, Maximize, Minimize } from "lucide-react";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { connected, loading: isSystemLoading } = useSystemInfo();
  const [isFullscreen, setIsFullscreen] = useState(false);
  // robust check for electron environment
  const isElectron = typeof window !== 'undefined' && (window as any).electron;

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Sync isFullscreen state with document events (for Esc key)
  useEffect(() => {
    setIsFullscreen(!!document.fullscreenElement);
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <header className="bg-white shadow-sm border-b px-3 sm:px-6 h-16 flex items-center select-none drag-region shrink-0">
      <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
        {/* Mobile Menu Button - No drag on button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg no-drag"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto no-drag">
          <TooltipProvider delayDuration={0}>
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
                  No new notifications.
                </div>
              </PopoverContent>
            </Popover>

            {/* Fullscreen Toggle Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="gap-1 sm:gap-2 px-2 sm:px-3 no-drag ml-1 overflow-hidden"
            >
              {isFullscreen ? (
                <>
                  <Minimize className="w-4 h-4" />
                  <span className="hidden sm:inline">Exit Full</span>
                </>
              ) : (
                <>
                  <Maximize className="w-4 h-4" />
                  <span className="hidden sm:inline">Full Screen</span>
                </>
              )}
            </Button>
          </TooltipProvider>
        </div>
      </div>
    </header>
  );
}
