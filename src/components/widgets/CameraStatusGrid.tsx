"use client";

import { useCameras } from "@/hooks/useNxAPI-camera";
import { Camera, Wifi, WifiOff, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function CameraStatusGrid() {
  const { cameras, loading, error } = useCameras();
  // Debug: cameras loaded

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Camera Status</h3>
        </div>
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-500">Loading cameras...</div>
        </div>
      </div>
    );
  }

  if (error || !cameras || cameras.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Camera Status</h3>
          {error && <AlertCircle className="w-5 h-5 text-red-500" />}
        </div>
        <div className="flex items-center justify-center h-48 text-center">
          <div className="space-y-2">
            <Camera className="w-8 h-8 text-gray-400 mx-auto" />
            <div className="text-gray-600">{error || "No cameras found"}</div>
            <div className="text-sm text-gray-500">Check your Nx Witness server connection</div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate real stats from API data
  const onlineCameras = cameras.filter((c) => c.status?.toLowerCase() === "online").length;
  const offlineCameras = cameras.filter((c) => c.status?.toLowerCase() === "offline").length;
  const warningCameras = cameras.length - onlineCameras - offlineCameras;

  // Sort cameras: offline first, then warning, then online
  const sortedCameras = [...cameras].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      offline: 0,
      warning: 1,
      online: 2,
    };
    const statusA = a.status?.toLowerCase() || "unknown";
    const statusB = b.status?.toLowerCase() || "unknown";
    return (statusOrder[statusA] ?? 3) - (statusOrder[statusB] ?? 3);
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "online":
        return "bg-green-100 text-green-800 border-green-200";
      case "offline":
        return "bg-red-100 text-red-800 border-red-200";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "online":
        return <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />;
      case "offline":
        return <WifiOff className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />;
      case "warning":
        return <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-600" />;
      default:
        return <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />;
    }
  };

  const handleCameraClick = (cameraId: string) => {
    const streamUrl = `https://localhost:7001/media/${cameraId}.webm`;
    window.open(streamUrl, "_blank");
  };

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
      {/* Header - responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Camera Status</h3>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">Online ({onlineCameras})</span>
          </div>
          {offlineCameras > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-gray-600">Offline ({offlineCameras})</span>
            </div>
          )}
          {warningCameras > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="text-gray-600">Warning ({warningCameras})</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid - responsive: 1 col mobile, 2 col tablet, 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {sortedCameras.slice(0, 9).map((camera) => {
          const isOffline = camera.status?.toLowerCase() === "offline";
          return (
            <Link href="/monitoring-cctv" key={camera.id}>
              <div
                className={`border rounded-lg p-3 sm:p-4 hover:shadow-md transition-all cursor-pointer active:scale-[0.98] ${
                  isOffline ? "border-red-300 bg-red-50/50 hover:border-red-400" : "hover:border-blue-400"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2 sm:space-x-3 min-w-0 flex-1">
                    <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${isOffline ? "bg-red-100" : "bg-gray-50"}`}>
                      <Camera className={`w-4 h-4 sm:w-5 sm:h-5 ${isOffline ? "text-red-600" : "text-gray-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-gray-900 text-sm sm:text-base truncate">
                        {camera.name || `Camera ${camera.id}`}
                      </h4>
                      {isOffline && <p className="text-[10px] sm:text-xs text-red-600 mt-0.5">Requires attention</p>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1 sm:space-y-2 flex-shrink-0">
                    {getStatusIcon(camera.status)}
                    <span
                      className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border ${getStatusColor(
                        camera.status || "unknown"
                      )}`}
                    >
                      {camera.status || "unknown"}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
        {cameras.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-500">No cameras available</div>
        )}
      </div>

      <Link href="/monitoring-cctv">
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium">
            View all cameras →
          </button>
        </div>
      </Link>
    </div>
  );
}
