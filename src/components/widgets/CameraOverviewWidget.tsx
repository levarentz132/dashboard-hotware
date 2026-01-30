"use client";

import { Camera, Wifi, WifiOff, Activity, AlertCircle, Circle } from "lucide-react";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusVariant, sortByStatus } from "@/lib/status-utils";
import Link from "next/link";

export default function CameraOverviewWidget({ systemId }: { systemId?: string }) {
  const { cameras, loading, error } = useCameras(systemId);

  // Count cameras by status
  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "online" || c.status?.toLowerCase() === "recording"
  ).length;
  const offlineCameras = cameras.filter((c) => c.status?.toLowerCase() === "offline").length;
  const recordingCameras = cameras.filter((c) => c.status?.toLowerCase() === "recording").length;
  const unauthorizedCameras = cameras.filter((c) => c.status?.toLowerCase() === "unauthorized").length;
  const notDefinedCameras = cameras.filter((c) => c.status?.toLowerCase() === "notdefined").length;
  const incompatibleCameras = cameras.filter((c) => c.status?.toLowerCase() === "incompatible").length;
  const otherCameras = totalCameras - onlineCameras - offlineCameras;

  const onlinePercentage = totalCameras > 0 ? (onlineCameras / totalCameras) * 100 : 0;

  // Sort cameras using shared utility
  const sortedCameras = sortByStatus(cameras);

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "online":
      case "recording":
        return <Wifi className="w-3 h-3" />;
      case "offline":
        return <WifiOff className="w-3 h-3" />;
      default:
        return <Circle className="w-3 h-3" />;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col p-2 sm:p-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-4">
          <Skeleton className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg" />
          <Skeleton className="h-4 sm:h-5 w-24 sm:w-32" />
        </div>
        <div className="space-y-2 sm:space-y-3 flex-1">
          <Skeleton className="h-12 sm:h-16 w-full" />
          <Skeleton className="h-3 sm:h-4 w-full" />
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <Skeleton className="h-12 sm:h-16 w-full" />
            <Skeleton className="h-12 sm:h-16 w-full" />
            <Skeleton className="h-12 sm:h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-10 h-10 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load cameras</p>
      </div>
    );
  }

  const statusCards = [
    { label: "Online", count: onlineCameras - recordingCameras, color: "bg-green-500" },
    { label: "Recording", count: recordingCameras, color: "bg-blue-500" },
    { label: "Offline", count: offlineCameras, color: "bg-red-500" },
    { label: "Unauthorized", count: unauthorizedCameras, color: "bg-orange-500" },
    { label: "Not Defined", count: notDefinedCameras, color: "bg-gray-400" },
    { label: "Incompatible", count: incompatibleCameras, color: "bg-yellow-500" },
  ].filter((card) => card.count > 0);

  return (
    <div className="h-full flex flex-col p-2 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg shrink-0">
            <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">Camera Overview</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{totalCameras} cameras</p>
          </div>
        </div>
        <Link href="/monitoring-cctv" className="shrink-0">
          <Badge variant="outline" className="cursor-pointer hover:bg-accent text-[10px] sm:text-xs">
            View All
          </Badge>
        </Link>
      </div>

      <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-3 mb-2 sm:mb-3 h-8 sm:h-9">
          <TabsTrigger value="summary" className="text-[10px] sm:text-xs px-1 sm:px-3">
            Summary
          </TabsTrigger>
          <TabsTrigger value="status" className="text-[10px] sm:text-xs px-1 sm:px-3">
            Status
          </TabsTrigger>
          <TabsTrigger value="list" className="text-[10px] sm:text-xs px-1 sm:px-3">
            List
          </TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="flex-1 mt-0 space-y-2 sm:space-y-4 overflow-auto">
          {/* Total count */}
          <div className="text-center py-1 sm:py-2">
            <div className="text-2xl sm:text-4xl font-bold text-foreground">{totalCameras}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">Total Kamera</div>
          </div>

          {/* Online percentage */}
          <div className="space-y-1 sm:space-y-2">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Online Rate</span>
              <span className="font-medium text-green-600">{onlinePercentage.toFixed(1)}%</span>
            </div>
            <Progress value={onlinePercentage} className="h-1.5 sm:h-2" />
          </div>

          {/* Quick status */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="text-center p-1.5 sm:p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-100 dark:border-green-900">
              <div className="flex items-center justify-center gap-1 mb-0.5 sm:mb-1">
                <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
              </div>
              <div className="text-base sm:text-xl font-bold text-green-700 dark:text-green-400">{onlineCameras}</div>
              <div className="text-[10px] sm:text-xs text-green-600">Online</div>
            </div>

            <div className="text-center p-1.5 sm:p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-100 dark:border-red-900">
              <div className="flex items-center justify-center gap-1 mb-0.5 sm:mb-1">
                <WifiOff className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
              </div>
              <div className="text-base sm:text-xl font-bold text-red-700 dark:text-red-400">{offlineCameras}</div>
              <div className="text-[10px] sm:text-xs text-red-600">Offline</div>
            </div>

            <div className="text-center p-1.5 sm:p-3 bg-muted rounded-lg border">
              <div className="flex items-center justify-center gap-1 mb-0.5 sm:mb-1">
                <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
              </div>
              <div className="text-base sm:text-xl font-bold text-foreground">{otherCameras}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Lainnya</div>
            </div>
          </div>
        </TabsContent>

        {/* Status Tab */}
        <TabsContent value="status" className="flex-1 mt-0 overflow-auto">
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            {statusCards.map((card) => (
              <div
                key={card.label}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${card.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm sm:text-lg font-bold text-foreground">{card.count}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{card.label}</div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* List Tab */}
        <TabsContent value="list" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full pr-1 sm:pr-2">
            <div className="space-y-1.5 sm:space-y-2">
              {sortedCameras.slice(0, 10).map((camera) => {
                const isOffline = camera.status?.toLowerCase() === "offline";
                return (
                  <Link href="/monitoring-cctv" key={camera.id}>
                    <div
                      className={`flex items-center justify-between p-1.5 sm:p-2 rounded-lg border transition-colors cursor-pointer ${isOffline ? "border-destructive/50 bg-destructive/5 hover:bg-destructive/10" : "hover:bg-accent"
                        }`}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                        <div
                          className={`p-1 sm:p-1.5 rounded-md shrink-0 ${isOffline ? "bg-destructive/10" : "bg-muted"}`}
                        >
                          <Camera
                            className={`w-3 h-3 sm:w-4 sm:h-4 ${isOffline ? "text-destructive" : "text-muted-foreground"
                              }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium truncate text-foreground">
                            {camera.name || `Camera ${camera.id}`}
                          </p>
                          {isOffline && <p className="text-[10px] sm:text-xs text-destructive">Requires attention</p>}
                        </div>
                      </div>
                      <Badge
                        variant={getStatusVariant(camera.status || "unknown")}
                        className="ml-1 sm:ml-2 shrink-0 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
                      >
                        <span className="hidden sm:inline-flex">{getStatusIcon(camera.status || "unknown")}</span>
                        <span className="sm:ml-1">{camera.status || "Unknown"}</span>
                      </Badge>
                    </div>
                  </Link>
                );
              })}
              {cameras.length > 10 && (
                <div className="text-center py-1.5 sm:py-2">
                  <Link href="/monitoring-cctv">
                    <span className="text-[10px] sm:text-xs text-primary hover:underline">
                      +{cameras.length - 10} more cameras
                    </span>
                  </Link>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
