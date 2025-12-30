"use client";

import { Camera, Wifi, WifiOff, AlertTriangle, Circle, Activity, Shield, AlertCircle } from "lucide-react";
import { useCameras } from "@/hooks/useNxAPI-camera";

export default function CameraStatusWidget() {
  const { cameras, loading, error } = useCameras();

  // Count cameras by status
  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "online"
  ).length;
  const offlineCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "offline"
  ).length;
  const recordingCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "recording"
  ).length;
  const unauthorizedCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "unauthorized"
  ).length;
  const notDefinedCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "notdefined"
  ).length;
  const incompatibleCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "incompatible"
  ).length;
  const mismatchedCertCameras = cameras.filter(
    (c) => c.status?.toLowerCase() === "mismatchedcertificate"
  ).length;

  const statusCards = [
    {
      label: "Total",
      count: totalCameras,
      color: "text-gray-900",
      borderColor: "border-l-gray-400",
      bgColor: "bg-white",
    },
    {
      label: "Online",
      count: onlineCameras,
      color: "text-green-600",
      borderColor: "border-l-green-500",
      bgColor: "bg-green-50/50",
    },
    {
      label: "Offline",
      count: offlineCameras,
      color: "text-red-600",
      borderColor: "border-l-red-500",
      bgColor: "bg-red-50/50",
    },
    {
      label: "Recording",
      count: recordingCameras,
      color: "text-blue-600",
      borderColor: "border-l-blue-500",
      bgColor: "bg-blue-50/50",
    },
    {
      label: "Unauthorized",
      count: unauthorizedCameras,
      color: "text-orange-600",
      borderColor: "border-l-orange-500",
      bgColor: "bg-orange-50/50",
    },
    {
      label: "NotDefined",
      count: notDefinedCameras,
      color: "text-gray-600",
      borderColor: "border-l-gray-400",
      bgColor: "bg-gray-50/50",
    },
    {
      label: "Incompatible",
      count: incompatibleCameras,
      color: "text-yellow-600",
      borderColor: "border-l-yellow-500",
      bgColor: "bg-yellow-50/50",
    },
    {
      label: "Mismatched Cert",
      count: mismatchedCertCameras,
      color: "text-gray-600",
      borderColor: "border-l-gray-400",
      bgColor: "bg-gray-50/50",
    },
  ];

  if (loading) {
    return (
      <div className="p-4 h-full flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <Camera className="w-8 h-8 text-gray-300" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-red-500">
          <AlertTriangle className="w-8 h-8" />
          <span className="text-sm">Failed to load</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 h-full">
      <div className="grid grid-cols-4 gap-3 h-full">
        {statusCards.map((card) => (
          <div
            key={card.label}
            className={`${card.bgColor} ${card.borderColor} border-l-4 border border-gray-100 rounded-lg p-3 flex flex-col justify-center`}
          >
            <div className={`text-2xl font-bold ${card.color}`}>
              {card.count}
            </div>
            <div className="text-xs text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
