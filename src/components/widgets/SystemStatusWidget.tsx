"use client";

import { Server, Wifi, Database, Cpu, AlertCircle } from "lucide-react";
import { useSystemInfo } from "@/hooks/useNxAPI";

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
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">Loading system status...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">System Status</h3>
        {error && <AlertCircle className="w-5 h-5 text-red-500" />}
      </div>

      <div className="space-y-3 sm:space-y-4 flex-1">
        {systemStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getStatusColor(stat.status)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{stat.label}</div>
                  <div className="text-sm text-gray-500">{stat.value}</div>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${getStatusDot(stat.status)}`}></div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Last updated:</span>
          <span className="text-gray-900 font-medium">2 minutes ago</span>
        </div>
      </div>
    </div>
  );
}
