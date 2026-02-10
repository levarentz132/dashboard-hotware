"use client";

import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";
import { Lock } from "lucide-react";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { ReactGridLayout as GridLayout, type Layout as LayoutType } from "react-grid-layout/legacy";
import {
  GripVertical,
  X,
  Plus,
  Save,
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
} from "lucide-react";
import "react-grid-layout/css/styles.css";
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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, RefreshCw } from "lucide-react";
import { getCloudAuthHeader, getElectronHeaders } from "@/lib/config";

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

// Widget registry - tambahkan widget baru di sini
export const widgetRegistry = {
  cameraOverview: {
    id: "cameraOverview",
    name: "Camera Overview",
    description: "Overview lengkap semua kamera dengan summary, status, dan list",
    component: CameraOverviewWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 1, h: 2 },
  },
  connectionStatus: {
    id: "connectionStatus",
    name: "Connection Status",
    description: "Status koneksi ke server",
    component: ConnectionStatusWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  storage: {
    id: "storage",
    name: "Storage Widget",
    description: "Informasi penggunaan storage (total, used, free, online)",
    component: StorageSummaryWidget,
    defaultSize: { w: 3, h: 5 },
    minSize: { w: 1, h: 1 },
  },
  systemStatus: {
    id: "systemStatus",
    name: "System Status",
    description: "Status kesehatan sistem",
    component: SystemStatusWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
  },
  apiStatus: {
    id: "apiStatus",
    name: "API Status",
    description: "Status API dan endpoint",
    component: APIStatusWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 0, h: 0 },
  },
  alarmConsole: {
    id: "alarmConsole",
    name: "Alarm Console",
    description: "Daftar alarm dan event terbaru",
    component: AlarmConsoleWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
  },
  auditLog: {
    id: "auditLog",
    name: "Audit Log",
    description: "Log aktivitas user dari cloud system",
    component: AuditLogWidget,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
  },
  serverMap: {
    id: "serverMap",
    name: "Server Map",
    description: "Peta lokasi server dengan status online/offline",
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

interface DraggableDashboardProps {
  userId?: string; // untuk save layout per user
}

const COLS = 12;
const ROW_HEIGHT = 80;

// Default layout - empty, user can add widgets as needed
const defaultWidgets: DashboardWidget[] = [];

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
                <p>Hapus widget</p>
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
                <p className="text-xs font-medium">Akses Terbatas</p>
                <p className="text-[10px] opacity-70">Anda tidak memiliki izin untuk melihat modul ini</p>
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

export default function DraggableDashboard({ userId = "default" }: DraggableDashboardProps) {
  const router = useRouter();
  const { user } = useAuth();
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

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");
  const [loadingCloud, setLoadingCloud] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

        // Sort
        systems.sort((a: any, b: any) => {
          if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
          if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
          return a.isOnline && !b.isOnline ? -1 : 1;
        });

        setCloudSystems(systems);
        if (systems.length > 0 && !selectedSystemId) {
          const firstOnline = systems.find((s: any) => s.isOnline) || systems[0];
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

  // Load layout from database on mount
  useEffect(() => {
    const loadLayout = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/dashboard-layout?user_id=${encodeURIComponent(userId)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.layout?.layout_data) {
            setWidgets(data.layout.layout_data);
          } else {
            setWidgets(defaultWidgets);
          }
        } else {
          setWidgets(defaultWidgets);
        }
      } catch (error) {
        console.error("Error loading layout:", error);
        setWidgets(defaultWidgets);
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, [userId]);

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
        const response = await fetch("/api/dashboard-layout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            layout_name: "Default Layout",
            layout_data: dataToSave,
            set_active: true,
          }),
        });

        if (response.ok) {
          setSaveStatus("saved");
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
    [widgets, userId],
  );

  // Export layout as JSON file
  const exportLayout = useCallback(() => {
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      userId,
      widgets,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-layout-${userId}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [widgets, userId]);

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
            // Auto-save to DB after import
            saveLayout(validWidgets);
            alert(`Berhasil import ${validWidgets.length} widget dan disimpan ke database!`);
          } else {
            alert("File tidak berisi widget yang valid.");
          }
        } else {
          alert("Format file tidak valid. Pastikan file adalah export dari dashboard ini.");
        }
      } catch (error) {
        console.error("Error importing layout:", error);
        alert("Gagal membaca file. Pastikan file adalah JSON yang valid.");
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
    const widgetConfig = widgetRegistry[type];
    const newWidget: DashboardWidget = {
      i: `widget-${Date.now()}`,
      type,
      x: 0,
      y: Infinity, // akan otomatis diletakkan di bawah
      w: widgetConfig.defaultSize.w,
      h: widgetConfig.defaultSize.h,
    };
    setWidgets([...widgets, newWidget]);
    setShowAddWidget(false);
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
  const resetLayout = () => {
    setWidgets(defaultWidgets);
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
        {/* Toolbar */}
        <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-2 sm:px-4 py-2 sm:py-3 shadow-sm">
          <div className="flex items-center justify-between max-w-full gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9"
                    onClick={() => router.back()}
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Kembali</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/">
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9">
                      <Home className="w-4 h-4 sm:w-5 sm:h-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Kembali ke Home</p>
                </TooltipContent>
              </Tooltip>
              <div className="h-6 w-px bg-gray-200 hidden sm:block" />
              <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
              <h1 className="text-base sm:text-xl font-semibold text-gray-900 truncate">Dashboard</h1>

              <div className="flex items-center gap-2 ml-2">
                <Select value={selectedSystemId} onValueChange={setSelectedSystemId} disabled={loadingCloud}>
                  <SelectTrigger className="w-[150px] sm:w-[200px] bg-white text-gray-900 border-gray-200 h-9">
                    <SelectValue placeholder="Pilih system" />
                  </SelectTrigger>
                  <SelectContent>
                    {cloudSystems.map((sys) => (
                      <SelectItem key={sys.id} value={sys.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${sys.isOnline ? "bg-green-500" : "bg-red-500"}`} />
                          <span className="truncate">{sys.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loadingCloud && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
              </div>

              {isEditing && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-700 text-[10px] sm:text-xs hidden sm:inline-flex ml-2"
                >
                  Edit Mode
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {isEditing && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportLayout}
                        className="gap-1 sm:gap-2 px-2 sm:px-3"
                      >
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Export layout sebagai file JSON</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-1 sm:gap-2 px-2 sm:px-3"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Import</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Import layout dari file JSON</p>
                    </TooltipContent>
                  </Tooltip>

                  <div className="h-6 w-px bg-gray-200 hidden sm:block" />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => setShowAddWidget(true)} size="sm" className="gap-1 sm:gap-2 px-2 sm:px-3">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Widget</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Tambahkan widget baru ke dashboard</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={isSaving}
                        onClick={async () => {
                          await saveLayout();
                          setIsEditing(false);
                        }}
                        className="gap-1 sm:gap-2 px-2 sm:px-3 bg-green-600 hover:bg-green-700"
                      >
                        {saveStatus === "saving" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saveStatus === "saved" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Database className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">
                          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save to DB"}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Simpan layout ke database</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={() => setShowResetConfirm(true)}
                        size="sm"
                        className="gap-1 sm:gap-2 px-2 sm:px-3"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="hidden sm:inline">Reset</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Kembalikan ke layout default</p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="h-6 w-px bg-gray-200 hidden sm:block" />
                </>
              )}

              <div className="h-6 w-px bg-gray-200 hidden sm:block" />

              {canCustomize && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isEditing ? "destructive" : "outline"}
                      size="sm"
                      onClick={handleToggleEdit}
                      className="gap-1 sm:gap-2 px-2 sm:px-3 w-[110px] justify-center"
                    >
                      {isEditing ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                      <span className="hidden sm:inline">{isEditing ? "Cancel" : "Customize"}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isEditing ? "Batalkan perubahan" : "Kustomisasi dashboard"}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              <div className="h-6 w-px bg-gray-200 hidden sm:block" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="gap-1 sm:gap-2 px-2 sm:px-3"
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isFullscreen ? "Minimize" : "Fullscreen"}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isFullscreen ? "Keluar layar penuh" : "Layar penuh"}</p>
                </TooltipContent>
              </Tooltip>

              {/* Hidden file input for import */}
              <input ref={fileInputRef} type="file" accept=".json" onChange={importLayout} className="hidden" />
            </div>
          </div>
        </div>

        {/* Edit Mode Indicator */}
        {isEditing && (
          <div className="bg-blue-50 border-b border-blue-200 px-2 sm:px-4 py-1.5 sm:py-2">
            <p className="text-[10px] sm:text-sm text-blue-700 text-center">
              <strong className="hidden sm:inline">Edit Mode:</strong> Drag widget • Resize • Klik × hapus
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
          </div>
        )}

        {/* Add Widget Dialog */}
        <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
          <DialogContent className="max-w-[90vw] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                Add Widget
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Pilih widget yang ingin ditambahkan ke dashboard Anda.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2 sm:pt-4 max-h-[60vh] sm:max-h-[400px] overflow-auto">
              {Object.entries(widgetRegistry).map(([key, widget]) => (
                <Card
                  key={key}
                  className="cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all duration-200 hover:shadow-md"
                  onClick={() => addWidget(key as WidgetType)}
                >
                  <CardContent className="flex flex-col items-center gap-1.5 sm:gap-2 p-2 sm:p-4">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <LayoutGrid className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">{widget.name}</span>
                    <span className="text-[10px] sm:text-xs text-gray-500 text-center line-clamp-2">
                      {widget.description}
                    </span>
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
    </TooltipProvider>
  );
}
