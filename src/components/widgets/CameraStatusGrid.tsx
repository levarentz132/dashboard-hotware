"use client";

import { Camera, MapPin, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { useCameras } from "@/hooks/useNxAPI";

export default function CameraStatusGrid() {
  const { cameras, loading, error } = useCameras();
  console.log("Caameras Farrel:", cameras);

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Camera Status</h3>
        </div>
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-500">Loading cameras...</div>
        </div>
      </div>
    );
  }

  if (error || !cameras || cameras.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Camera Status</h3>
          {error && <AlertCircle className="w-5 h-5 text-red-500" title={error} />}
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

  const getStatusColor = (status: string) => {
    switch (status) {
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
    switch (status) {
      case "online":
        return <Wifi className="w-4 h-4 text-green-600" />;
      case "offline":
        return <WifiOff className="w-4 h-4 text-red-600" />;
      case "warning":
        return <Wifi className="w-4 h-4 text-yellow-600" />;
      default:
        return <Wifi className="w-4 h-4 text-gray-600" />;
    }
  };

  const handleCameraClick = (cameraId: string) => {
    const streamUrl = `https://localhost:7001/media/${cameraId}.webm`;
    window.open(streamUrl, "_blank");
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Camera Status</h3>
        <div className="flex items-center space-x-4 text-sm">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.slice(0, 6).map((camera) => (
          <div
            key={camera.id}
            onClick={() => handleCameraClick(camera.id)}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer hover:border-blue-400"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <Camera className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{camera.name || `Camera ${camera.id}`}</h4>
                  <div className="flex items-center space-x-1 text-sm text-gray-500 mt-1">
                    <MapPin className="w-3 h-3" />
                    <span>{camera.groupName || "Unknown location"}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {camera.id} • {camera.typeId || "Camera"}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-2">
                {getStatusIcon(camera.status)}
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                    camera.status || "unknown"
                  )}`}
                >
                  {camera.status || "unknown"}
                </span>
              </div>
            </div>
          </div>
        ))}
        {cameras.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-500">No cameras available</div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">View all cameras →</button>
      </div>
    </div>
  );
}
