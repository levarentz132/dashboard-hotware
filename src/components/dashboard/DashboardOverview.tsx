"use client";

import { Camera, Activity, AlertTriangle, Database, TrendingUp, Users, Wifi, WifiOff } from "lucide-react";
import { useCameras, useAlarms, useSystemInfo, useRealTimeUpdates } from "@/hooks/useNxAPI";
import StatsCard from "@/components/ui/StatsCard";
import SystemStatusWidget from "@/components/widgets/SystemStatusWidget";
import CameraStatusGrid from "@/components/widgets/CameraStatusGrid";
import RecentAlarmsWidget from "@/components/widgets/RecentAlarmsWidget";
import StorageWidget from "@/components/widgets/StorageWidget";
import APIStatusWidget from "@/components/widgets/APIStatusWidget";
import ConnectionStatusWidget from "@/components/widgets/ConnectionStatusWidget";

export default function DashboardOverview() {
  // API hooks
  const { cameras, loading: camerasLoading } = useCameras();
  const { alarms, loading: alarmsLoading } = useAlarms();
  const { systemInfo, connected } = useSystemInfo();
  const { isConnected: realtimeConnected, lastUpdate } = useRealTimeUpdates();

  // Calculate real stats from API data
  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter((c) => c.status.toLowerCase() === "online").length;
  const offlineCameras = totalCameras - onlineCameras;
  const activeAlarms = alarms.filter((a) => a.type !== "resolved").length;

  // Only show stats for data we actually have from the API
  const stats = [
    {
      title: "Total Cameras",
      value: camerasLoading ? "..." : totalCameras.toString(),
      change: totalCameras > 0 ? `${totalCameras} devices` : "No devices",
      changeType: totalCameras > 0 ? ("positive" as const) : ("neutral" as const),
      icon: Camera,
    },
    {
      title: "Online Cameras",
      value: camerasLoading ? "..." : onlineCameras.toString(),
      change: `${offlineCameras} offline`,
      changeType: offlineCameras === 0 ? ("positive" as const) : ("warning" as const),
      icon: Activity,
    },
    {
      title: "Active Alarms",
      value: alarmsLoading ? "..." : activeAlarms.toString(),
      change: activeAlarms === 0 ? "All clear" : "Needs attention",
      changeType: activeAlarms === 0 ? ("positive" as const) : ("negative" as const),
      icon: AlertTriangle,
    },
    {
      title: "System Status",
      value: connected ? "Online" : "Offline",
      change: connected ? "Connected" : "Check connection",
      changeType: connected ? ("positive" as const) : ("negative" as const),
      icon: Database,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - responsive stacking */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
          {/* Nx Witness Connection */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {connected ? (
              <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
            )}
            <span className={connected ? "text-green-600" : "text-red-600"}>
              <span className="hidden xs:inline">Nx Witness </span>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Real-time Updates */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 text-gray-600">
            <div
              className={`w-2 h-2 rounded-full ${realtimeConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
            ></div>
            <span className="hidden sm:inline">Real-time updates</span>
            <span className="sm:hidden">Live</span>
            {lastUpdate && (
              <span className="text-[10px] sm:text-xs text-gray-500 hidden md:inline">
                (Last: {lastUpdate.toLocaleTimeString()})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid - responsive: 2 cols on mobile, 4 on lg */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </div>

      {/* Connection Status - Full Width */}
      <ConnectionStatusWidget className="mb-2 sm:mb-4" />

      {/* Top Row: System Status & API Status side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <SystemStatusWidget />
        <APIStatusWidget />
      </div>

      {/* Camera Status - Full Width */}
      <CameraStatusGrid />

      {/* Bottom Row: Alarms & Storage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <RecentAlarmsWidget />
        <StorageWidget />
      </div>
    </div>
  );
}
