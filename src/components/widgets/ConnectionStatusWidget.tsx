"use client";

import { useState, useEffect } from "react";
import { Network, AlertCircle, CheckCircle, Clock } from "lucide-react";

interface ConnectionStatusWidgetProps {
  className?: string;
}

export default function ConnectionStatusWidget({ className = "" }: ConnectionStatusWidgetProps) {
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkConnection = async () => {
    try {
      setStatus("checking");
      setError(null);

      const { nxAPI } = await import("@/lib/nxapi");
      const isConnected = await nxAPI.testConnection();

      if (isConnected) {
        setStatus("connected");
        setError(null);
      } else {
        setStatus("disconnected");
        setError("Nx Witness server not reachable");
      }

      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setStatus("disconnected");
      setError(err instanceof Error ? err.message : "Connection check failed");
      setLastChecked(new Date().toLocaleTimeString());
    }
  };

  // Check connection on component mount and every 30 seconds
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case "connected":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "disconnected":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500 animate-spin" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "connected":
        return "API Connected";
      case "disconnected":
        return "API Offline";
      default:
        return "Checking...";
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return "bg-green-50 border-green-200";
      case "disconnected":
        return "bg-red-50 border-red-200";
      default:
        return "bg-yellow-50 border-yellow-200";
    }
  };

  return (
    <div className={`h-full flex flex-col p-2 sm:p-4 space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg shrink-0">
            <Network className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base block truncate">Nx Witness API</span>
          </div>
        </div>
        <button
          onClick={checkConnection}
          disabled={status === "checking"}
          className="px-2 py-1 text-[10px] sm:text-xs font-medium bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-600 transition-colors"
        >
          {status === "checking" ? "Checking..." : "Check Now"}
        </button>
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span
            className={`text-sm font-medium ${status === "connected" ? "text-green-700" : status === "disconnected" ? "text-red-700" : "text-yellow-700"
              }`}
          >
            {getStatusText()}
          </span>
        </div>

        {lastChecked && <div className="text-[10px] text-gray-500">Last checked: {lastChecked}</div>}

        <div className="text-[10px] text-gray-600 pt-2 border-t border-gray-100">
          <div className="truncate">Endpoint: https://localhost:7001/rest/v3</div>
          <div>Status: {status === "connected" ? "Live data active" : "No connection"}</div>
        </div>

        {error && <div className="p-2 bg-red-50 rounded text-[10px] text-red-600">{error}</div>}
      </div>
    </div>
  );
}
