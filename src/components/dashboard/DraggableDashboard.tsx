"use client";

import { useState, useEffect, useCallback } from "react";
import GridLayout from "react-grid-layout";
import { GripVertical, X, Plus, Save, RotateCcw, Settings, LayoutGrid } from "lucide-react";
import "react-grid-layout/css/styles.css";

// shadcn/UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Widget imports
import CameraOverviewWidget from "@/components/widgets/CameraOverviewWidget";
import ConnectionStatusWidget from "@/components/widgets/ConnectionStatusWidget";
import SystemStatusWidget from "@/components/widgets/SystemStatusWidget";
import APIStatusWidget from "@/components/widgets/APIStatusWidget";
import StorageSummaryWidget from "@/components/widgets/StorageSummaryWidget";
import AlarmConsoleWidget from "@/components/widgets/AlarmConsoleWidget";
import AuditLogWidget from "@/components/widgets/AuditLogWidget";

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

const STORAGE_KEY = "dashboard-layout";
const COLS = 12;
const ROW_HEIGHT = 80;

// Default layout - empty, user can add widgets as needed
const defaultWidgets: DashboardWidget[] = [];

export default function DraggableDashboard({ userId }: DraggableDashboardProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Load layout from localStorage on mount
  useEffect(() => {
    const storageKey = userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setWidgets(parsed);
      } catch {
        setWidgets(defaultWidgets);
      }
    } else {
      setWidgets(defaultWidgets);
    }
  }, [userId]);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      const container = document.getElementById("dashboard-container");
      if (container) {
        setContainerWidth(container.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Save layout to localStorage
  const saveLayout = useCallback(() => {
    const storageKey = userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
    localStorage.setItem(storageKey, JSON.stringify(widgets));
  }, [widgets, userId]);

  // Handle layout change from drag/resize
  const onLayoutChange = (newLayout: LayoutItem[]) => {
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
      })
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
      <div className="min-h-screen bg-gray-50/50">
        {/* Toolbar */}
        <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between max-w-full">
            <div className="flex items-center gap-3">
              <LayoutGrid className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
              {isEditing && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                  Edit Mode
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isEditing && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => setShowAddWidget(true)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Add Widget
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Tambahkan widget baru ke dashboard</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={resetLayout} className="gap-2">
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Kembalikan ke layout default</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        onClick={() => {
                          saveLayout();
                          setIsEditing(false);
                        }}
                        className="gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <Save className="w-4 h-4" />
                        Save Layout
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Simpan perubahan layout</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isEditing ? "destructive" : "outline"}
                    onClick={() => setIsEditing(!isEditing)}
                    className="gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    {isEditing ? "Cancel" : "Customize"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isEditing ? "Batalkan perubahan" : "Kustomisasi dashboard"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Edit Mode Indicator */}
        {isEditing && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
            <p className="text-sm text-blue-700 text-center">
              <strong>Edit Mode:</strong> Drag widget untuk memindahkan • Drag sudut untuk resize • Klik × untuk hapus
            </p>
          </div>
        )}

        {/* Dashboard Grid */}
        <div id="dashboard-container" className="p-4">
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
            {widgets.map((widget) => {
              const WidgetComponent = widgetRegistry[widget.type]?.component;
              const widgetName = widgetRegistry[widget.type]?.name || "Widget";

              return (
                <div
                  key={widget.i}
                  className={`rounded-xl overflow-hidden transition-all duration-200 bg-white border ${
                    isEditing ? "ring-2 ring-blue-400 ring-offset-2 shadow-lg" : "shadow-sm"
                  }`}
                >
                  <div className="h-full relative group flex flex-col">
                    {/* Delete Button - Only visible in edit mode */}
                    {isEditing && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeWidget(widget.i);
                            }}
                            className="absolute top-2 right-2 z-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-red-100 hover:text-red-600 shadow-sm border"
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
                      {WidgetComponent ? (
                        <WidgetComponent />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">Widget not found</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </GridLayout>
        </div>

        {/* Add Widget Dialog */}
        <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Add Widget
              </DialogTitle>
              <DialogDescription>Pilih widget yang ingin ditambahkan ke dashboard Anda.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 pt-4 max-h-[400px] overflow-auto">
              {Object.entries(widgetRegistry).map(([key, widget]) => (
                <Card
                  key={key}
                  className="cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all duration-200 hover:shadow-md"
                  onClick={() => addWidget(key as WidgetType)}
                >
                  <CardContent className="flex flex-col items-center gap-2 p-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <LayoutGrid className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-900 text-center">{widget.name}</span>
                    <span className="text-xs text-gray-500 text-center">{widget.description}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
