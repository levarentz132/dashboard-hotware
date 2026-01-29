"use client";

import { useRealTimeUpdates } from "@/hooks/useNxAPI";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { Wifi, WifiOff, Server, Clock, RefreshCw } from "lucide-react";

export default function APIStatusWidget() {
  const { systemInfo, connected, loading, testConnection } = useSystemInfo();
  const { isConnected: realtimeConnected, lastUpdate } = useRealTimeUpdates();

  const handleTestConnection = async () => {
    await testConnection();
  };

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg shrink-0">
            <Wifi className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base block truncate">API Status</span>
          </div>
        </div>
        <button onClick={handleTestConnection} disabled={loading} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-3 flex-1">
        {/* Nx Witness Connection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {connected ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-red-600" />}
            <span className="text-xs text-gray-700">Nx Witness API</span>
          </div>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* System Info */}
        {systemInfo && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-gray-700">Server</span>
            </div>
            <span className="text-[10px] text-gray-600 truncate max-w-[100px]">
              {systemInfo.name} v{systemInfo.version}
            </span>
          </div>
        )}

        {/* Real-time Updates */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${realtimeConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
            ></div>
            <span className="text-xs text-gray-700">Real-time</span>
          </div>
          <span className="text-[10px] text-gray-600">{realtimeConnected ? "Active" : "Inactive"}</span>
        </div>

        {/* Last Update */}
        {lastUpdate && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="flex items-center space-x-2">
              <Clock className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-700">Last Update</span>
            </div>
            <span className="text-[10px] text-gray-600">{lastUpdate.toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
