"use client";

import { useState, useEffect } from "react";
import { Bell, Menu, Minus, Square, X, RefreshCw, Maximize, Minimize, AlertCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { 
  getPersistentNotifications, 
  markNotificationAsRead, 
  clearAllNotifications, 
  deleteNotification,
  addPersistentNotification,
  PersistentNotification
} from "@/lib/persistent-notifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface TopBarProps {
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { connected, loading: isSystemLoading } = useSystemInfo();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notifications, setNotifications] = useState<PersistentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // robust check for electron environment
  const isElectron = typeof window !== 'undefined' && (window as any).electron;

  const [lastConnected, setLastConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (lastConnected !== null && connected !== lastConnected) {
      if (!connected) {
        // System went offline
        addPersistentNotification({
          type: 'error',
          title: 'System Offline',
          message: 'Connection to the VMS system has been lost. Services may be limited.',
        });
      } else {
        // System came back online
        addPersistentNotification({
          type: 'success',
          title: 'System Online',
          message: 'Connection to the VMS system has been restored.',
        });
      }
    }
    setLastConnected(connected);
  }, [connected]);

  const fetchNotifications = async () => {
    const list = await getPersistentNotifications();
    setNotifications(list);
    setUnreadCount(list.filter(n => !n.read).length);
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    window.addEventListener('nx:notifications-updated', fetchNotifications);
    return () => {
      clearInterval(interval);
      window.removeEventListener('nx:notifications-updated', fetchNotifications);
    };
  }, []);

  const formatTime = (ts: number) => {
    try {
      return formatDistanceToNow(ts, { addSuffix: true });
    } catch (e) {
      return "Just now";
    }
  };

  const handlePreview = (n: PersistentNotification) => {
    if (!n.deviceId || !n.systemId) return;

    // Based on CloudRecordings handlePreview logic
    if (n.durationMs && n.durationMs <= 2000) {
      // Snapshot preview - would need setPreviewSnapshot in global state or just direct URL
      const url = `/api/cloud/recordings/thumbnail?systemId=${n.systemId}&deviceId=${n.deviceId.replace(/[{}]/g, "")}&timestampMs=${n.startTimeMs}`;
      window.open(url, "_blank");
    } else {
      const params = new URLSearchParams({
        systemId: n.systemId || "127.0.0.1",
        deviceId: n.deviceId,
        startTime: String(n.startTimeMs),
        endTime: String(n.endTimeMs || (n.startTimeMs ? n.startTimeMs + 300000 : 0)),
        preview: "true",
      });
      window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
    }
  };

  const handleDownload = (n: PersistentNotification) => {
    if (!n.deviceId || !n.systemId) return;
    const params = new URLSearchParams({
      systemId: n.systemId || "127.0.0.1",
      deviceId: n.deviceId,
      startTime: String(n.startTimeMs),
      endTime: String(n.endTimeMs || (n.startTimeMs ? n.startTimeMs + (n.durationMs || 1000) : 0)),
      stream: "true",
    });
    window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
  };

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    if (isElectron && (window as any).electron.window.toggleFullscreen) {
      (window as any).electron.window.toggleFullscreen();
      return;
    }

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

  // Sync isFullscreen state
  useEffect(() => {
    // Initial check
    if (isElectron && (window as any).electron.window.getFullscreen) {
      (window as any).electron.window.getFullscreen().then(setIsFullscreen);
    } else {
      setIsFullscreen(!!document.fullscreenElement);
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    let removeElectronListener: (() => void) | undefined;
    if (isElectron && (window as any).electron.window.onFullscreenChange) {
      removeElectronListener = (window as any).electron.window.onFullscreenChange((val: boolean) => {
        setIsFullscreen(val);
      });
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (removeElectronListener) removeElectronListener();
    };
  }, [isElectron]);

  return (
    <header className="bg-white shadow-sm border-b px-3 sm:px-6 h-16 flex items-center select-none drag-region shrink-0 relative">
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
                <>
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'}`}></div>
                  <span className="hidden lg:inline font-medium">
                    {isSystemLoading ? 'Checking...' : connected ? 'System Online' : 'System Offline'}
                  </span>
                </>
              )}
            </div>

            {/* Notifications PERSISTENT Dropdown */}
            <Popover onOpenChange={(open) => {
              if (open) fetchNotifications();
            }}>
              <PopoverTrigger asChild>
                <button className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg relative no-drag transition-colors group">
                  <Bell className={cn("w-5 h-5", unreadCount > 0 ? "text-primary" : "text-gray-500")} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-white px-1 shadow-sm">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0 shadow-2xl border-slate-200 overflow-hidden" align="end">
                <div className="flex flex-col max-h-[500px]">
                  <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                       Notifications
                       {unreadCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{unreadCount} New</Badge>}
                    </h3>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => clearAllNotifications()} className="h-7 text-[10px] uppercase font-bold text-slate-500 hover:text-destructive">
                        Clear All
                      </Button>
                    </div>
                  </div>
                  
                  <div className="overflow-y-auto flex-1 py-1 bg-white scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-3">
                        <div className="p-3 bg-slate-50 rounded-full">
                          <Bell className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">No notifications yet.</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div 
                          key={n.id} 
                          className={cn(
                            "px-4 py-3 border-b last:border-0 hover:bg-slate-50/80 transition-colors group relative",
                            !n.read ? "bg-blue-50/40 border-l-4 border-l-blue-500" : "border-l-4 border-l-transparent"
                          )}
                          onMouseEnter={() => !n.read && markNotificationAsRead(n.id)}
                        >
                          <div className="flex gap-3">
                            <div className={cn(
                              "mt-1 p-1.5 rounded-lg shrink-0",
                              n.type === 'error' ? "bg-red-100 text-red-600" :
                              n.type === 'warning' ? "bg-amber-100 text-amber-600" :
                              n.type === 'success' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {n.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
                               n.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                               n.type === 'success' ? <RefreshCw className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className={cn("text-[13px] font-bold leading-tight", !n.read ? "text-slate-900" : "text-slate-700")}>
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                  {formatTime(n.timestamp)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 leading-normal line-clamp-2">
                                {n.message}
                              </p>
                              
                              {/* Action Buttons for recording/snapshots */}
                              {(n.deviceId && n.systemId) && (
                                <div className="flex items-center gap-2 pt-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-[10px] gap-1.5 border-slate-200 hover:bg-primary/5 hover:text-primary transition-all"
                                    onClick={() => handlePreview(n)}
                                  >
                                    <RefreshCw className="w-3 h-3" /> Preview
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-[10px] gap-1.5 border-slate-200 hover:bg-primary/5 hover:text-primary transition-all"
                                    onClick={() => handleDownload(n)}
                                  >
                                    <RefreshCw className="w-3 h-3" /> Download
                                  </Button>
                                </div>
                              )}
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-destructive transition-all"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
                  <span className="hidden sm:inline">Minimize</span>
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
