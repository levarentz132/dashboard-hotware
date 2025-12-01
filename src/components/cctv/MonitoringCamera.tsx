"use client";

import React, { useState } from "react";
import { Video, GripVertical, X, Monitor } from "lucide-react";
import { useCameras } from "@/hooks/useNxAPI";

// Mock hook - ganti dengan hook Anda yang sebenarnya

export default function CCTVDragDrop() {
  const { cameras, loading, error } = useCameras();
  const [activeStreams, setActiveStreams] = useState([]);
  const [draggedCamera, setDraggedCamera] = useState(null);

  const handleDragStart = (camera) => {
    setDraggedCamera(camera);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (draggedCamera) {
      const alreadyExists = activeStreams.some((stream) => stream.cameraId === draggedCamera.id);

      if (!alreadyExists) {
        setActiveStreams((prev) => [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            cameraId: draggedCamera.id,
            cameraName: draggedCamera.nama,
          },
        ]);
      }
      setDraggedCamera(null);
    }
  };

  const removeStream = (streamId) => {
    setActiveStreams((prev) => prev.filter((stream) => stream.id !== streamId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-xl">Loading cameras...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-red-500 text-xl">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar - Daftar CCTV */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Video className="w-6 h-6" />
            Daftar Kamera
          </h2>
          <p className="text-sm text-gray-400 mt-1">Drag kamera ke area grid</p>
        </div>

        <div className="p-4 space-y-2">
          {cameras.map((camera) => {
            const isActive = activeStreams.some((stream) => stream.cameraId === camera.id);

            return (
              <div
                key={camera.id}
                draggable={!isActive}
                onDragStart={() => handleDragStart(camera)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  isActive
                    ? "bg-gray-700 border-green-500 opacity-50 cursor-not-allowed"
                    : "bg-gray-700 border-gray-600 hover:border-blue-500 hover:bg-gray-600 cursor-move"
                }`}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="w-5 h-5 text-gray-400" />
                  <Monitor className="w-5 h-5 text-blue-400" />
                  <div className="flex-1">
                    <div className="text-white font-medium">{camera.name}</div>
                    <div className="text-xs text-gray-400">{camera.id}</div>
                  </div>
                  {isActive && <div className="text-xs text-green-400 font-medium">ACTIVE</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Area - Grid untuk Video */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white">CCTV Dashboard</h1>
          <p className="text-gray-400">{activeStreams.length} kamera aktif</p>
        </div>

        {activeStreams.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="h-[calc(100vh-200px)] border-4 border-dashed border-gray-700 rounded-xl flex items-center justify-center hover:border-blue-500 hover:bg-gray-800 transition-all"
          >
            <div className="text-center">
              <Video className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-xl text-gray-400 mb-2">Belum ada kamera aktif</p>
              <p className="text-sm text-gray-500">Drag kamera dari sidebar untuk mulai monitoring</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeStreams.map((stream) => (
              <div
                key={stream.id}
                className="relative bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-all"
              >
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent p-3 z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">{stream.cameraName}</div>
                      <div className="text-xs text-gray-400">{stream.cameraId}</div>
                    </div>
                    <button
                      onClick={() => removeStream(stream.id)}
                      className="p-1.5 rounded-lg bg-red-500 bg-opacity-20 hover:bg-red-500 text-red-400 hover:text-white transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Video Stream */}
                <div className="aspect-video bg-gray-900">
                  <video
                    key={stream.cameraId}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                    src={`https://localhost:7001/media/${stream.cameraId}.webm`}
                  />
                </div>

                {/* Live Indicator */}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-red-500 px-2 py-1 rounded text-xs font-bold text-white">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
              </div>
            ))}

            {/* Drop Zone untuk tambah kamera baru */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="aspect-video border-4 border-dashed border-gray-700 rounded-lg flex items-center justify-center hover:border-blue-500 hover:bg-gray-800 transition-all cursor-pointer"
            >
              <div className="text-center">
                <Video className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  Drop di sini untuk
                  <br />
                  tambah kamera
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
