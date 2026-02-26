"use client";

import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";


import { useState, useEffect, useCallback, useRef, memo } from "react";
import { ReactGridLayout as GridLayout } from "react-grid-layout/legacy";
import {
  GripVertical,
  X,
  Plus,
  RotateCcw,
  Settings,
  LayoutGrid,
  Home,
  Download,
  Upload,
  Database,
  Loader2,
  Check,
  Maximize,
  Minimize,
  ArrowLeft,
  Lock,
  Minus,
  Square,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// shadcn/UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Sidebar from "@/components/layout/Sidebar";
import {
  loadDashboardLayout,
  saveDashboardLayout,
  deleteDashboardLayout,
  updateDashboardLayout
} from "./dashboard-service";

// Widget Loading Placeholder
const WidgetLoading = () => (
  <div className="h-full w-full p-4 flex flex-col gap-4">
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <Skeleton className="h-4 w-32" />
    </div>
    <div className="flex-1 space-y-2">
      <Skeleton className="h-full w-full rounded-xl" />
    </div>
  </div>
);

// Dynamic Widget imports
const CameraOverviewWidget = dynamic(() => import("@/components/widgets/CameraOverviewWidget"), {
  loading: () => <WidgetLoading />,
});
const ConnectionStatusWidget = dynamic(() => import("@/components/widgets/ConnectionStatusWidget"), {
  loading: () => <WidgetLoading />,
});
const SystemStatusWidget = dynamic(() => import("@/components/widgets/SystemStatusWidget"), {
  loading: () => <WidgetLoading />,
});
const APIStatusWidget = dynamic(() => import("@/components/widgets/APIStatusWidget"), {
  loading: () => <WidgetLoading />,
});
const StorageSummaryWidget = dynamic(() => import("@/components/widgets/StorageSummaryWidget"), {
  loading: () => <WidgetLoading />,
});
const AlarmConsoleWidget = dynamic(() => import("@/components/widgets/AlarmConsoleWidget"), {
  loading: () => <WidgetLoading />,
});
const AuditLogWidget = dynamic(() => import("@/components/widgets/AuditLogWidget"), {
  loading: () => <WidgetLoading />,
});
const ServerMapWidget = dynamic(() => import("@/components/widgets/ServerMapWidget"), {
  ssr: false,
  loading: () => <WidgetLoading />,
});

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  isOnline: boolean;
  accessRole: string;
}

import { getElectronHeaders } from "@/lib/config";

// Define LayoutItem type for react-grid-layout
interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  isDraggable?: boolean;
  isResizable?: boolean;
  static?: boolean;
}

export const widgetRegistry = {
  cameraOverview: {
    id: "cameraOverview",
    name: "Camera Overview",
    description: "Complete overview of all cameras with summary, status, and list",
    component: CameraOverviewWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 1, h: 2 },
  },
  connectionStatus: {
    id: "connectionStatus",
    name: "Connection Status",
    description: "Connection status to the server",
    component: ConnectionStatusWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  storage: {
    id: "storage",
    name: "Storage Widget",
    description: "Storage usage information (total, used, free, online)",
    component: StorageSummaryWidget,
    defaultSize: { w: 3, h: 5 },
    minSize: { w: 1, h: 1 },
  },
  systemStatus: {
    id: "systemStatus",
    name: "System Status",
    description: "System health status",
    component: SystemStatusWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  apiStatus: {
    id: "apiStatus",
    name: "API Status",
    description: "API and endpoint status",
    component: APIStatusWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 0, h: 0 },
  },
  alarmConsole: {
    id: "alarmConsole",
    name: "Alarm Console",
    description: "List of recent alarms and events",
    component: AlarmConsoleWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
  },
  auditLog: {
    id: "auditLog",
    name: "Audit Log",
    description: "User activity logs from cloud systems",
    component: AuditLogWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
  },
  serverMap: {
    id: "serverMap",
    name: "Server Map",
    description: "Server location map with online/offline status",
    component: ServerMapWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
  },
};

export type WidgetType = keyof typeof widgetRegistry;

interface DashboardWidget {
  i: string; // unique instance id
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ModernDashboardProps {
  userId?: string; // untuk save layout per user
}

const COLS = 12;
const ROW_HEIGHT = 80;

// Default layout - some basic widgets to get started
const defaultWidgets: DashboardWidget[] = [
  { i: "camera-1", type: "cameraOverview", x: 0, y: 0, w: 4, h: 5 },
  { i: "alarm-1", type: "alarmConsole", x: 4, y: 0, w: 4, h: 5 },
  { i: "audit-1", type: "auditLog", x: 8, y: 0, w: 4, h: 5 },
  { i: "storage-1", type: "storage", x: 0, y: 5, w: 3, h: 5 },
];

// Memoized Widget Component to prevent unnecessary re-renders
const MemoizedWidget = memo(
  ({
    widget,
    isEditing,
    removeWidget,
    systemId,
  }: {
    widget: DashboardWidget;
    isEditing: boolean;
    removeWidget: (id: string) => void;
    systemId: string;
  }) => {
    const WidgetComponent = widgetRegistry[widget.type]?.component;
    const widgetName = widgetRegistry[widget.type]?.name || "Widget";
    const { user } = useAuth();
    const isUserAdmin = isAdmin(user);

    // Map widget type to module name for permission check
    const widgetModuleMap: Record<string, string> = {
      cameraOverview: "camera_inventory",
      storage: "storage",
      systemStatus: "system_health",
      health: "health",
      alarmConsole: "alarm_console",
      auditLog: "user_logs",
      analytics: "analytics",
      serverMap: "system_health", // Or whatever module maps to server map
    };

    const moduleName = widgetModuleMap[widget.type];
    const hasViewPermission = isUserAdmin || !moduleName || user?.privileges?.find(p => p.module === moduleName || (moduleName === "system_health" && p.module === "health"))?.can_view === true;

    return (
      <div
        className={cn(
          "h-full rounded-xl overflow-hidden transition-all duration-200 bg-white border",
          isEditing ? "ring-2 ring-blue-400 ring-offset-2 shadow-lg" : "shadow-sm",
        )}
      >
        <div className="h-full relative group flex flex-col">
          {/* Delete Button - Only visible in edit mode */}
          {isEditing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    removeWidget(widget.i);
                  }}
                  className="absolute top-2 right-2 z-50 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-red-100 hover:text-red-600 shadow-sm border"
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete widget</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Widget Header - only show in edit mode */}
          {isEditing && (
            <div className="drag-handle flex flex-row items-center justify-between px-3 py-2 bg-gray-50 border-b cursor-move shrink-0">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">{widgetName}</span>
              </div>
            </div>
          )}

          {/* Widget Content */}
          <div className="flex-1 overflow-auto">
            {!hasViewPermission ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
                <Lock className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs font-medium">Limited Access</p>
                <p className="text-[10px] opacity-70">You do not have permission to view this module</p>
              </div>
            ) : WidgetComponent ? (
              <WidgetComponent systemId={systemId} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">Widget not found</div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

MemoizedWidget.displayName = "MemoizedWidget";

export default function ModernDashboard({ userId = "default" }: ModernDashboardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const effectiveUserId = userId !== "default" ? userId : (user?.id?.toString() || "default");
  const isUserAdmin = isAdmin(user);
  const canCustomize = isUserAdmin || user?.privileges?.find(p => p.module === "dashboard")?.can_edit === true;

  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [originalWidgets, setOriginalWidgets] = useState<DashboardWidget[]>([]);
  const [currentLayoutId, setCurrentLayoutId] = useState<number | undefined>(undefined);

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");
  const [loadingCloud, setLoadingCloud] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const isElectron = typeof window !== 'undefined' && (window as any).electron;

  // Detect device type based on screen width
  const [deviceType, setDeviceType] = useState<"desktop" | "mobile" | undefined>(undefined);
  useEffect(() => {
    const checkDevice = () => {
      setDeviceType(window.innerWidth < 768 ? "mobile" : "desktop");
    };
    checkDevice();
    // Only re-check on resize to handle orientation changes
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

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

  // Fetch systems
  const fetchSystems = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const response = await fetch("/api/cloud/systems", {
        headers: {
          Accept: "application/json",
          ...getElectronHeaders(),
        },
      });
      if (response.ok) {
        const data = await response.json();
        const systems = (data.systems || []).map((s: any) => ({
          ...s,
          isOnline: s.stateOfHealth === "online",
        }));

        // Filter to only owner's server as requested
        const ownerSystems = systems.filter((s: any) => s.accessRole === "owner");

        // If no owner system found, fallback to first online or first system
        const displaySystems = ownerSystems.length > 0 ? ownerSystems : systems;

        setCloudSystems(displaySystems);
        if (displaySystems.length > 0 && !selectedSystemId) {
          const firstOnline = displaySystems.find((s: any) => s.isOnline) || displaySystems[0];
          setSelectedSystemId(firstOnline.id);
        }
      }
    } catch (err) {
      console.error("Error fetching systems:", err);
    } finally {
      setLoadingCloud(false);
    }
  }, [selectedSystemId]);

  useEffect(() => {
    fetchSystems();
  }, [fetchSystems]);

  // Load layout from database on mount (wait for device type to be determined)
  useEffect(() => {
    if (!deviceType) return; // Wait until device type is detected on client

    const loadLayout = async () => {
      setIsLoading(true);
      try {
        const result = await loadDashboardLayout(effectiveUserId, deviceType);
        setWidgets(result.widgets || []);
        if (result.layout_id) {
          setCurrentLayoutId(result.layout_id);
        }
      } catch (error) {
        console.error("Error loading layout:", error);
        setWidgets([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, [effectiveUserId, deviceType]);

  // Handle container width for react-grid-layout
  useEffect(() => {
    if (isLoading) return;

    const container = document.getElementById("dashboard-container");
    if (!container) return;

    // Use ResizeObserver for more efficient and reactive width tracking
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(container);

    // Initial width set
    setContainerWidth(container.offsetWidth);

    return () => {
      observer.disconnect();
    };
  }, [isLoading]);

  // Save layout to database
  const saveLayout = useCallback(
    async (layoutToSave?: DashboardWidget[]) => {
      const dataToSave = layoutToSave || widgets;
      setIsSaving(true);
      setSaveStatus("saving");
      try {
        const result = await saveDashboardLayout(
          effectiveUserId,
          dataToSave,
          "Default Layout",
          currentLayoutId,
          deviceType
        );

        if (result.success) {
          setSaveStatus("saved");
          if (result.layout_id) {
            setCurrentLayoutId(result.layout_id);
          }
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      } catch (error) {
        console.error("Error saving layout:", error);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } finally {
        setIsSaving(false);
      }
    },
    [widgets, effectiveUserId, currentLayoutId, deviceType],
  );

  // Export layout as JSON file
  const exportLayout = useCallback(() => {
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      userId: effectiveUserId,
      widgets,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-layout-${effectiveUserId}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [widgets, effectiveUserId]);

  // Import layout from JSON file
  const importLayout = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        // Validate imported data
        if (importedData.widgets && Array.isArray(importedData.widgets)) {
          // Validate each widget has required properties
          const validWidgets = importedData.widgets.filter(
            (w: DashboardWidget) =>
              w.i &&
              w.type &&
              widgetRegistry[w.type] !== undefined &&
              typeof w.x === "number" &&
              typeof w.y === "number" &&
              typeof w.w === "number" &&
              typeof w.h === "number",
          );

          if (validWidgets.length > 0) {
            setWidgets(validWidgets);
            alert(`Imported ${validWidgets.length} widgets.`);
          } else {
            alert("File does not contain valid widgets.");
          }
        } else {
          alert("Invalid file format. Make sure the file is an export from this dashboard.");
        }
      } catch (error) {
        console.error("Error importing layout:", error);
        alert("Failed to read file. Make sure the file is a valid JSON.");
      }
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Handle layout change from drag/resize
  const onLayoutChange = (newLayout: readonly LayoutItem[]) => {
    setWidgets((prev) =>
      prev.map((widget) => {
        const layoutItem = newLayout.find((l) => l.i === widget.i);
        if (layoutItem) {
          return {
            ...widget,
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h,
          };
        }
        return widget;
      }),
    );
  };

  // Add new widget
  const addWidget = (type: WidgetType) => {
    if (isAddingWidget) return;
    setIsAddingWidget(true);

    try {
      const widgetConfig = widgetRegistry[type];
      const isMobile = deviceType === "mobile";
      const newWidget: DashboardWidget = {
        i: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type,
        x: 0,
        y: Infinity, // will be automatically placed at the bottom
        w: isMobile ? COLS : widgetConfig.defaultSize.w,
        h: widgetConfig.defaultSize.h,
      };

      setWidgets((prev) => [...prev, newWidget]);
      setShowAddWidget(false);
    } finally {
      // Add a small delay before allowing another add to prevent double-click issues
      setTimeout(() => setIsAddingWidget(false), 300);
    }
  };

  // Remove widget
  const removeWidget = (widgetId: string) => {
    setWidgets(widgets.filter((w) => w.i !== widgetId));
  };

  // Handle Cancel Edit
  const handleCancelEdit = () => {
    setWidgets(originalWidgets);
    setIsEditing(false);
    setShowCancelConfirm(false);
  };

  // Handle Customize/Cancel button click
  const handleToggleEdit = () => {
    if (isEditing) {
      // Check if any changes were made
      const hasChanges = JSON.stringify(widgets) !== JSON.stringify(originalWidgets);
      if (hasChanges) {
        setShowCancelConfirm(true);
      } else {
        setIsEditing(false);
      }
    } else {
      setOriginalWidgets([...widgets]);
      setIsEditing(true);
    }
  };

  // Reset to default layout
  const resetLayout = async () => {
    if (currentLayoutId) {
      await deleteDashboardLayout(currentLayoutId, deviceType);
      setCurrentLayoutId(undefined);
    }
    setWidgets([]);
    setShowResetConfirm(false);
  };

  // Convert widgets to react-grid-layout format
  const layout: LayoutItem[] = widgets.map((widget) => {
    const config = widgetRegistry[widget.type];
    return {
      i: widget.i,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: config?.minSize.w || 2,
      minH: config?.minSize.h || 2,
      isDraggable: isEditing,
      isResizable: isEditing,
    };
  });

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50/50 select-none">
        {!isEditing && (
          <style>{`
            .react-resizable-handle { 
              display: none !important; 
            }
          `}</style>
        )}
        {/* Toolbar */}
        <div className="sticky top-0 z-[110] bg-white border-b border-gray-200 px-3 sm:px-6 h-16 flex items-center shadow-sm shrink-0">
          <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
            {/* Left side - Menu button + Dashboard title (title hidden on mobile, matching normal TopBar) */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => setSidebarOverlayOpen(!sidebarOverlayOpen)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg shrink-0"
              >
                {sidebarOverlayOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Dashboard icon + title - hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="h-6 w-px bg-gray-200" />
                <LayoutGrid className="w-6 h-6 text-blue-600 shrink-0" />
                <h1 className="text-xl font-semibold text-gray-900 truncate">Dashboard</h1>
                {isEditing && (
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-700 text-xs ml-2"
                  >
                    Edit Mode
                  </Badge>
                )}
              </div>
            </div>

            {/* Right side - Actions (replaces notifications/system status area on mobile) */}
            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              {isEditing && (
                <>
                  {/* Desktop buttons with labels - hidden on mobile */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportLayout}
                    className="hidden sm:inline-flex gap-2 px-3"
                  >
                    <Upload className="w-4 h-4" />
                    Export
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="hidden sm:inline-flex gap-2 px-3"
                  >
                    <Download className="w-4 h-4" />
                    Import
                  </Button>

                  <div className="h-6 w-px bg-gray-200 hidden sm:block" />

                  <Button
                    onClick={() => setShowAddWidget(true)}
                    size="sm"
                    className="hidden sm:inline-flex gap-2 px-3"
                  >
                    <Plus className="w-4 h-4" />
                    Add Widget
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    disabled={isSaving}
                    onClick={async () => {
                      await saveLayout();
                      setIsEditing(false);
                    }}
                    className="hidden sm:inline-flex gap-2 px-3 bg-green-600 hover:bg-green-700"
                  >
                    {saveStatus === "saving" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : saveStatus === "saved" ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Database className="w-4 h-4" />
                    )}
                    {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setShowResetConfirm(true)}
                    size="sm"
                    className="hidden sm:inline-flex gap-2 px-3"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>

                  <div className="h-6 w-px bg-gray-200 hidden sm:block" />
                </>
              )}

              {canCustomize && (
                <>
                  {/* Mobile: icon button to enter/cancel edit mode */}
                  <Button
                    variant={isEditing ? "destructive" : "outline"}
                    size="icon"
                    onClick={handleToggleEdit}
                    className="h-8 w-8 sm:hidden"
                  >
                    {isEditing ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  </Button>
                  {/* Desktop: styled button with label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isEditing ? "destructive" : "outline"}
                        size="sm"
                        onClick={handleToggleEdit}
                        className="hidden sm:inline-flex gap-2 px-3"
                      >
                        {isEditing ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                        {isEditing ? "Cancel" : "Customize"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={24}>
                      <p>{isEditing ? "Discard changes" : "Customize dashboard layout"}</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}

              {/* Fullscreen - matches TopBar style */}
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
                className="gap-1 sm:gap-2 px-2 sm:px-3 ml-1 overflow-hidden"
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

              {/* Hidden file input for import */}
              <input ref={fileInputRef} type="file" accept=".json" onChange={importLayout} className="hidden" />
            </div>
          </div>
        </div>

        {/* Edit Mode Indicator - desktop only */}
        {isEditing && (
          <div className="hidden sm:block bg-blue-50 border-b border-blue-200 px-4 py-2">
            <p className="text-sm text-blue-700 text-center">
              <strong>Edit Mode:</strong> Drag widgets • Resize • Click × to delete
            </p>
          </div>
        )}



        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">Loading dashboard layout...</p>
            </div>
          </div>
        )}

        {/* Dashboard Grid */}
        {!isLoading && (
          <div id="dashboard-container" className="p-2 sm:p-4">
            <GridLayout
              className="layout"
              layout={layout}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              width={containerWidth - 32}
              onLayoutChange={onLayoutChange}
              isDraggable={isEditing}
              isResizable={isEditing}
              draggableHandle=".drag-handle"
              margin={[16, 16]}
              containerPadding={[0, 0]}
              useCSSTransforms={true}
            >
              {widgets.map((widget) => (
                <div key={widget.i}>
                  <MemoizedWidget
                    widget={widget}
                    isEditing={isEditing}
                    removeWidget={removeWidget}
                    systemId={selectedSystemId}
                  />
                </div>
              ))}
            </GridLayout>

            {/* Mobile Edit Mode Spacer - ensures last widgets can be scrolled above the bottom bar */}
            {isEditing && deviceType === "mobile" && (
              <div className="h-[30vh]" />
            )}
          </div>
        )}

        {/* Add Widget Dialog */}
        <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
          <DialogContent className="max-w-[92vw] sm:max-w-lg mx-auto rounded-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                Add Widget
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Choose a widget to add to your dashboard.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2 sm:pt-4 max-h-[65vh] sm:max-h-[400px] overflow-auto">
              {Object.entries(widgetRegistry).map(([key, widget]) => (
                <Card
                  key={key}
                  className="cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 active:bg-blue-100 transition-all duration-200 hover:shadow-md"
                  onClick={() => addWidget(key as WidgetType)}
                >
                  <CardContent className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 p-3 sm:p-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                    </div>
                    <div className="flex flex-col sm:items-center gap-0.5">
                      <span className="text-sm font-medium text-gray-900">{widget.name}</span>
                      <span className="text-xs text-gray-500 sm:text-center line-clamp-2">
                        {widget.description}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <RotateCcw className="w-5 h-5" />
              Reset Dashboard
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all widgets and return the dashboard to its default empty state. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetLayout} className="bg-red-600 hover:bg-red-700 text-white">
              Yes, Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Changes Confirmation Dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <RotateCcw className="w-5 h-5" />
              Discard Changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your layout. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelEdit} className="bg-orange-600 hover:bg-orange-700 text-white">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sidebar Overlay */}
      {sidebarOverlayOpen && (
        <div className="fixed inset-0 top-16 z-[100]">
          <div
            className="fixed inset-0 top-16"
            onClick={() => setSidebarOverlayOpen(false)}
          />
          <Sidebar
            activeSection="dashboard"
            onSectionChange={(section) => {
              setSidebarOverlayOpen(false);
              if (section !== 'dashboard') {
                // Force sidebar to be collapsed when moving from dashboard to normal pages
                localStorage.setItem("sidebar-collapsed", "true");
                router.push(`/?section=${section}`);
              }
            }}
            hideHeader={true}
            className="shadow-2xl h-full"
            disableCollapse={true}
            isOpen={true}
            onClose={() => setSidebarOverlayOpen(false)}
          />
          <style>{`
            .top-16 {
              animation: sidebarDropIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes sidebarDropIn {
              from {
                opacity: 0;
                transform: translateY(-20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
      )}
      {/* Mobile Bottom Edit Bar - slides up from bottom */}
      {isEditing && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] sm:hidden">
          <div className="bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.15)] px-3 pb-8 pt-2 animate-slideUp">
            <div className="flex items-center justify-around gap-1 max-w-md mx-auto">
              <button
                onClick={() => setShowAddWidget(true)}
                className="flex flex-col items-center gap-1 px-2 py-1 text-blue-600 rounded-lg active:bg-blue-100/50 min-w-0 flex-1 transition-colors"
              >
                <Plus className="w-6 h-6" />
                <span className="text-[10px] font-semibold">Add</span>
              </button>
              <button
                onClick={async () => {
                  await saveLayout();
                  setIsEditing(false);
                }}
                disabled={isSaving}
                className="flex flex-col items-center gap-1 px-2 py-1 text-green-600 rounded-lg active:bg-green-100/50 min-w-0 flex-1 transition-colors"
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : saveStatus === "saved" ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <Database className="w-6 h-6" />
                )}
                <span className="text-[10px] font-semibold">
                  {saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved!" : "Save"}
                </span>
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex flex-col items-center gap-1 px-2 py-1 text-gray-600 rounded-lg active:bg-gray-100/50 min-w-0 flex-1 transition-colors"
              >
                <RotateCcw className="w-6 h-6" />
                <span className="text-[10px] font-semibold">Reset</span>
              </button>
              <button
                onClick={exportLayout}
                className="flex flex-col items-center gap-1 px-2 py-1 text-gray-600 rounded-lg active:bg-gray-100/50 min-w-0 flex-1 transition-colors"
              >
                <Upload className="w-6 h-6" />
                <span className="text-[10px] font-semibold">Export</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1 px-2 py-1 text-gray-600 rounded-lg active:bg-gray-100/50 min-w-0 flex-1 transition-colors"
              >
                <Download className="w-6 h-6" />
                <span className="text-[10px] font-semibold">Import</span>
              </button>
              <button
                onClick={handleToggleEdit}
                className="flex flex-col items-center gap-1 px-2 py-1 text-red-600 rounded-lg active:bg-red-100/50 min-w-0 flex-1 transition-colors"
              >
                <X className="w-6 h-6" />
                <span className="text-[10px] font-semibold">Cancel</span>
              </button>
            </div>
          </div>
          <style>{`
            @keyframes slideUp {
              from {
                transform: translateY(100%);
              }
              to {
                transform: translateY(0);
              }
            }
            .animate-slideUp {
              animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
        </div>
      )}
    </TooltipProvider>
  );
}
