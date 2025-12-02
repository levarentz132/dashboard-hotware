"use client";

import {
  Search,
  Filter,
  Grid,
  List,
  MapPin,
  Camera,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useCameras, useSystemInfo } from "@/hooks/useNxAPI";
import { Dialog, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import DialogCreateCamera from "./_components/dialog-create-camera";

export default function CameraInventory() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");

  // API hooks
  const { cameras, loading, error, refetch } = useCameras();
  const { connected, testConnection } = useSystemInfo();

  // Auto-retry connection when component mounts
  useEffect(() => {
    if (!connected && !loading) {
      testConnection();
    }
  }, []);

  // Use API data or fallback to mock data
  const displayCameras = cameras;

  const getStatusIcon = (status: string) => {
    return status === "online" ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-600" />
    );
  };

  const getStatusColor = (status: string) => {
    return status === "online"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-red-100 text-red-800 border-red-200";
  };

  const filteredCameras = displayCameras.filter(
    (camera) =>
      camera.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (camera.location || camera.ip || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const totalCameras = displayCameras.length;
  const onlineCameras = displayCameras.filter((c) => c.status.toLowerCase() === "online").length;
  const offlineCameras = totalCameras - onlineCameras;
  const recordingCameras = displayCameras.filter(
    (c) => c.status.toLowerCase() === "recording" || c.status.toLowerCase() === "online"
  ).length;

  // Show empty state when no cameras found and not loading
  if (!loading && displayCameras.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold text-gray-900">Camera Inventory</h1>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
              <span className="text-sm text-gray-600">{connected ? "Nx Witness Connected" : "API Disconnected"}</span>
              {error && <AlertCircle className="w-4 h-4 text-red-500" />}
            </div>
          </div>
          <button
            onClick={() => {
              refetch();
              testConnection();
            }}
            className="flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Empty State */}
        <div className="bg-white rounded-lg border p-12 text-center">
          <Camera className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Cameras Found</h3>
          <p className="text-gray-500 mb-6">
            {error
              ? "Unable to connect to Nx Witness server. Please check your server configuration and network connection."
              : "No cameras are configured in your Nx Witness system. Add cameras through the Nx Witness Desktop Client to get started."}
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mb-6">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}
          <button
            onClick={() => {
              refetch();
              testConnection();
            }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold text-gray-900">Camera Inventory</h1>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-sm text-gray-600">{connected ? "Nx Witness Connected" : "API Disconnected"}</span>
            {error && <AlertCircle className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Create Camera</Button>
            </DialogTrigger>
            <DialogCreateCamera refetch={refetch} />
          </Dialog>
          <button
            onClick={() => {
              refetch();
              testConnection();
            }}
            disabled={loading}
            className={`flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50 ${
              loading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <div className="flex items-center space-x-2 bg-white rounded-lg border p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded ${viewMode === "grid" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded ${viewMode === "list" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search cameras by name, location, or ID..."
            className="pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-gray-900">{totalCameras}</div>
          <div className="text-sm text-gray-600">Total Cameras</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-green-600">{onlineCameras}</div>
          <div className="text-sm text-gray-600">Online</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-red-600">{offlineCameras}</div>
          <div className="text-sm text-gray-600">Offline</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-blue-600">{recordingCameras}</div>
          <div className="text-sm text-gray-600">Recording</div>
        </div>
      </div>

      {/* Camera Grid/List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span className="text-gray-600">Loading cameras...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center p-8 text-red-600">
            <AlertCircle className="w-6 h-6 mr-2" />
            <span>Error loading cameras: {error}</span>
          </div>
        )}

        {!loading && !error && filteredCameras.length === 0 && (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <Camera className="w-6 h-6 mr-2" />
            <span>No cameras found</span>
          </div>
        )}

        {!loading &&
          filteredCameras.length > 0 &&
          (viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
              {filteredCameras.map((camera) => (
                <div key={camera.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Camera className="w-5 h-5 text-gray-600" />
                      <span className="font-medium text-gray-900">{camera.name}</span>
                    </div>
                    {getStatusIcon(camera.status)}
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <MapPin className="w-3 h-3" />
                      <span>{camera.location || camera.ip || "Unknown location"}</span>
                    </div>
                    <div>Type: {camera.type || camera.typeId || "Unknown"}</div>
                    <div>Model: {camera.model || "Unknown model"}</div>
                    <div>IP: {camera.ip}</div>
                    {camera.resolution && camera.fps && (
                      <div>
                        Resolution: {camera.resolution} @ {camera.fps}fps
                      </div>
                    )}
                    {camera.vendor && <div>Vendor: {camera.vendor}</div>}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(camera.status)}`}
                    >
                      {camera.status}
                    </span>
                    <button className="text-blue-600 hover:text-blue-800">
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Camera
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type/Model
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resolution
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCameras.map((camera) => (
                    <tr key={camera.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Camera className="w-5 h-5 text-gray-600 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{camera.name}</div>
                            <div className="text-sm text-gray-500">{camera.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{camera.location}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{camera.type}</div>
                        <div className="text-sm text-gray-500">{camera.model}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(camera.status)}
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                              camera.status
                            )}`}
                          >
                            {camera.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {camera.resolution} @ {camera.fps}fps
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-blue-600 hover:text-blue-800 mr-3">View</button>
                        <button className="text-gray-600 hover:text-gray-800">
                          <Settings className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </div>
  );
}
