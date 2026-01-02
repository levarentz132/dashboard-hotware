"use client";

import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { Server, Wifi, Database, Cpu, AlertCircle } from "lucide-react";

export default function SystemStatusWidget() {
  const { systemInfo, connected, loading, error } = useSystemInfo();

  const getSystemStats = () => {
    if (!connected || !systemInfo) {
      return [
        { label: "Server Status", value: "Offline", status: "critical", icon: Server },
        { label: "Network", value: "Disconnected", status: "critical", icon: Wifi },
        { label: "Database", value: "Unavailable", status: "critical", icon: Database },
        { label: "System", value: "Unknown", status: "critical", icon: Cpu },
      ];
    }

    return [
      { label: "Server Status", value: "Online", status: "healthy", icon: Server },
      { label: "Network", value: "Connected", status: "healthy", icon: Wifi },
      { label: "Database", value: "Active", status: "healthy", icon: Database },
      { label: "System", value: systemInfo.name || "Running", status: "healthy", icon: Cpu },
    ];
  };

  const systemStats = getSystemStats();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-50";
      case "warning":
        return "text-yellow-600 bg-yellow-50";
      case "critical":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "warning":
        return "bg-yellow-500";
      case "critical":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col p-3">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">System Status</h3>
        <div className="flex items-center justify-center flex-1">
          <div className="text-gray-500 text-sm">Loading system status...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">System Status</h3>
        {error && <AlertCircle className="w-4 h-4 text-red-500" />}
      </div>

      <div className="space-y-2.5 flex-1">
        {systemStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`p-1.5 rounded-lg ${getStatusColor(stat.status)}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-900">{stat.label}</div>
                  <div className="text-[10px] text-gray-500">{stat.value}</div>
                </div>
              </div>
              <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(stat.status)}`}></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
