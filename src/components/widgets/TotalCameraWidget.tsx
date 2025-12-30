"use client";

import { Camera, Wifi, WifiOff, Activity, AlertCircle } from "lucide-react";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function TotalCameraWidget() {
  const { cameras, loading, error } = useCameras();

  // Count cameras by status
  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "online" || c.status?.toLowerCase() === "recording"
  ).length;
  const offlineCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "offline"
  ).length;
  const otherCameras = totalCameras - onlineCameras - offlineCameras;

  const onlinePercentage = totalCameras > 0 ? (onlineCameras / totalCameras) * 100 : 0;

  if (loading) {
    return (
      <div className="p-6 h-full flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <Camera className="w-8 h-8 text-gray-300" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-red-500">
          <AlertCircle className="w-8 h-8" />
          <span className="text-sm">Failed to load</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Camera className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Total Camera</h3>
        </div>
      </div>

      <div className="space-y-4">
        {/* Total count */}
        <div className="text-center">
          <div className="text-4xl font-bold text-gray-900">{totalCameras}</div>
          <div className="text-sm text-gray-500">Total Kamera</div>
        </div>

        {/* Online percentage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Online Rate</span>
            <span className="font-medium text-green-600">{onlinePercentage.toFixed(1)}%</span>
          </div>
          <Progress value={onlinePercentage} className="h-2" />
        </div>

        {/* Status breakdown */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Wifi className="w-3 h-3 text-green-600" />
            </div>
            <div className="text-lg font-semibold text-green-700">{onlineCameras}</div>
            <div className="text-xs text-green-600">Online</div>
          </div>
          
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <WifiOff className="w-3 h-3 text-red-600" />
            </div>
            <div className="text-lg font-semibold text-red-700">{offlineCameras}</div>
            <div className="text-xs text-red-600">Offline</div>
          </div>
          
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-gray-600" />
            </div>
            <div className="text-lg font-semibold text-gray-700">{otherCameras}</div>
            <div className="text-xs text-gray-600">Lainnya</div>
          </div>
        </div>
      </div>
    </div>
  );
}
