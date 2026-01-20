"use client";

import { useState, useEffect, DragEvent, useRef } from "react";
import { X } from "lucide-react";
import { LicenseGuard } from "@/components/auth/LicenseGuard";

// Types
interface Camera {
  id: string;
  name: string;
  systemId?: string; // For cloud cameras
}

interface ActiveCamera extends Camera {
  position: number;
}

// Drop Zone Component (grid slot)
function DropZone({
  position,
  camera,
  onDrop,
  onRemove,
}: {
  position: number;
  camera: ActiveCamera | null;
  onDrop: (position: number, camera: Camera) => void;
  onRemove: () => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset error dan loading state saat camera berubah
  useEffect(() => {
    if (camera) {
      setError(false);
      setLoading(true);
    }
  }, [camera?.id]);

  // Build stream URL - use cloud relay if systemId exists, otherwise local
  const getStreamUrl = () => {
    if (!camera) return "";

    // Cloud camera - use relay proxy
    if (camera.systemId) {
      return `https://${camera.systemId}.relay.vmsproxy.com/media/${camera.id}.mp4`;
    }

    // Local camera - use localhost
    const API_BASE_URL = "https://localhost:7001";
    return `${API_BASE_URL}/media/${camera.id}.mp4`;
  };

  const streamUrl = getStreamUrl();

  // Mouse drag handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const cameraData = e.dataTransfer.getData("camera");
    if (cameraData) {
      const camera = JSON.parse(cameraData) as Camera;
      onDrop(position, camera);
    }
  };

  // Touch handlers for mobile
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    if (element?.closest(`[data-position="${position}"]`)) {
      setIsDragOver(true);
    } else {
      setIsDragOver(false);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    const dropElement = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropZone = dropElement?.closest("[data-position]") as HTMLElement;

    if (dropZone) {
      const dropPosition = parseInt(dropZone.dataset.position || "0");

      // Get camera data from any dragged element
      const draggedElement = document.querySelector("[data-camera]") as HTMLElement;
      if (draggedElement?.dataset.camera) {
        const camera = JSON.parse(draggedElement.dataset.camera) as Camera;
        onDrop(dropPosition, camera);
        delete draggedElement.dataset.camera;
        draggedElement.style.opacity = "1";
      }
    }

    setIsDragOver(false);
  };

  return (
    <div
      data-position={position}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative aspect-video border-2 border-dashed rounded-lg transition-all ${
        isDragOver ? "border-blue-500 bg-blue-50 scale-[1.02]" : "border-gray-300 bg-gray-50"
      }`}
    >
      {camera ? (
        <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
          {/* Video Stream - key prop memaksa re-render saat camera berubah */}
          <video
            ref={videoRef}
            key={`${camera.id}-${camera.name}`}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            src={streamUrl}
            onLoadedData={() => setLoading(false)}
            onError={(e) => {
              console.error("Stream error for", camera.name, ":", streamUrl);
              setError(true);
              setLoading(false);
            }}
            preload="none"
          />

          {/* Loading State */}
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center text-white">
                <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm">Loading stream...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center text-white px-4">
                <svg
                  className="w-16 h-16 mx-auto mb-3 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <p className="font-medium mb-1">Stream Unavailable</p>
                <p className="text-xs text-gray-400">Camera: {camera.name}</p>
                <p className="text-xs text-gray-500 mt-2 break-all">{streamUrl}</p>
              </div>
            </div>
          )}

          {/* Camera Info Overlay */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-3">
            <div className="flex items-center justify-between">
              <div className="text-white">
                <div className="font-medium text-sm">{camera.name}</div>
                <div className="text-xs opacity-75">{camera.id}</div>
              </div>
              <button onClick={onRemove} className="p-1.5 bg-red-500/80 hover:bg-red-600 rounded transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Live Indicator */}
          {!error && !loading && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 bg-red-600 rounded text-white text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
              LIVE
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <svg className="w-16 h-16 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm font-medium">Drop camera here</p>
        </div>
      )}
    </div>
  );
}

// Main Component
export default function MonitoringPage() {
  const [activeCameras, setActiveCameras] = useState<ActiveCamera[]>([]);
  const [gridLayout, setGridLayout] = useState<2 | 4 | 6 | 9>(4);

  const handleDrop = (position: number, camera: Camera) => {
    setActiveCameras((prev) => {
      // Remove camera from old position if exists
      const filtered = prev.filter((c) => c.id !== camera.id);
      // Add to new position
      return [...filtered, { ...camera, position }];
    });
  };

  const handleRemoveCamera = (cameraId: string) => {
    setActiveCameras((prev) => prev.filter((c) => c.id !== cameraId));
  };

  const getCameraAtPosition = (position: number): ActiveCamera | null => {
    return activeCameras.find((c) => c.position === position) || null;
  };

  const gridCols = {
    2: "grid-cols-2",
    4: "grid-cols-2",
    6: "grid-cols-3",
    9: "grid-cols-3",
  };

  return (
    <LicenseGuard>
      <div className="w-full h-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">CCTV Monitoring</h1>

          {/* Grid Layout Selector */}
          <div className="flex gap-2">
            {[2, 4, 6, 9].map((num) => (
              <button
                key={num}
                onClick={() => setGridLayout(num as typeof gridLayout)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  gridLayout === num
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {num === 2 ? "2×1" : num === 4 ? "2×2" : num === 6 ? "3×2" : "3×3"}
              </button>
            ))}
          </div>
        </div>

        {/* Video Grid - FULL WIDTH */}
        <div className={`grid ${gridCols[gridLayout]} gap-4`}>
          {Array.from({ length: gridLayout }).map((_, index) => (
            <DropZone
              key={index}
              position={index}
              camera={getCameraAtPosition(index)}
              onDrop={handleDrop}
              onRemove={() => {
                const camera = getCameraAtPosition(index);
                if (camera) handleRemoveCamera(camera.id);
              }}
            />
          ))}
        </div>
      </div>
    </LicenseGuard>
  );
}
