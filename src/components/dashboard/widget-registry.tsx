"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { GripVertical, X, Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardWidget } from "@/components/dashboard/types";

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
} as const;

export type WidgetType = keyof typeof widgetRegistry;

interface MemoizedWidgetProps {
  widget: DashboardWidget;
  isEditing: boolean;
  removeWidget: (id: string) => void;
  systemId: string;
}

export const MemoizedWidget = memo(function MemoizedWidget({
  widget,
  isEditing,
  removeWidget,
  systemId,
}: MemoizedWidgetProps) {
  const WidgetComponent = widgetRegistry[widget.type]?.component;
  const widgetName = widgetRegistry[widget.type]?.name || "Widget";
  const { user } = useAuth();
  const isUserAdmin = isAdmin(user);

  const widgetModuleMap: Record<string, string> = {
    cameraOverview: "camera_inventory",
    storage: "storage",
    systemStatus: "system_health",
    health: "health",
    alarmConsole: "alarm_console",
    auditLog: "user_logs",
    analytics: "analytics",
    serverMap: "system_health",
  };

  const moduleName = widgetModuleMap[widget.type];
  const hasViewPermission =
    isUserAdmin ||
    !moduleName ||
    user?.privileges?.find(
      (p) => p.module === moduleName || (moduleName === "system_health" && p.module === "health"),
    )?.can_view === true;

  return (
    <div
      className={cn(
        "h-full rounded-xl overflow-hidden transition-all duration-200 bg-white border",
        isEditing ? "ring-2 ring-blue-400 ring-offset-2 shadow-lg" : "shadow-sm",
      )}
    >
      <div className="h-full relative group flex flex-col">
        {isEditing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onMouseDown={(e) => e.stopPropagation()}
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

        {isEditing && (
          <div className="drag-handle flex flex-row items-center justify-between px-3 py-2 bg-gray-50 border-b cursor-move shrink-0">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">{widgetName}</span>
            </div>
          </div>
        )}

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
});
