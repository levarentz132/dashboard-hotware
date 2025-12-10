"use client";

import { AlertTriangle, Bell, Filter, Search, MapPin, Camera, Clock, X, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAlarms, useEvents } from "@/hooks/useNxAPI";
import { useCameras } from "@/hooks/useNxAPI-camera";

export default function AlarmConsole() {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");

  // API hooks
  const { alarms: apiAlarms, loading: alarmsLoading, refetch: refetchAlarms } = useAlarms();
  const { events, loading: eventsLoading, refetch: refetchEvents } = useEvents();
  const { cameras } = useCameras();

  // Process API alarms and events into unified format
  const processedAlarms = [...apiAlarms, ...events].map((item) => {
    // Find camera info
    const camera = cameras.find((c) => c.id === item.cameraId);
    const metaLevel = (item as any).metadata?.level || "";

    // Prefer metadata.level from metrics alarms when available, otherwise infer from type
    const inferredSeverity = metaLevel
      ? metaLevel === "warning"
        ? "medium"
        : metaLevel === "error" || metaLevel === "critical"
        ? "critical"
        : "low"
      : item.type.toLowerCase().includes("offline")
      ? "critical"
      : item.type.toLowerCase().includes("motion")
      ? "high"
      : item.type.toLowerCase().includes("tamper")
      ? "medium"
      : "low";

    return {
      id: item.id,
      type: item.type,
      camera: camera?.name || `Camera ${item.cameraId}`,
      cameraId: item.cameraId,
      location: camera?.ip || "Unknown location",
      severity: inferredSeverity,
      timestamp: new Date(item.timestamp),
      status: item.type.toLowerCase().includes("offline") ? "active" : "acknowledged",
      description: item.description || (item as any).description || (item as any).metadata?.text || "",
      screenshot: null,
      assignedTo: null,
    };
  });

  // Use only processed alarms from server
  const allAlarms = processedAlarms;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-red-500";
      case "acknowledged":
        return "bg-yellow-500";
      case "resolved":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <Bell className="w-4 h-4 text-red-600" />;
      case "acknowledged":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "resolved":
        return <Check className="w-4 h-4 text-green-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 60) {
      return `${minutes} min ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return formatDate(date);
    }
  };

  const filteredAlarms = allAlarms.filter((alarm) => {
    const statusMatch = filterStatus === "all" || alarm.status === filterStatus;
    const severityMatch = filterSeverity === "all" || alarm.severity === filterSeverity;
    return statusMatch && severityMatch;
  });

  const activeAlarms = allAlarms.filter((alarm) => alarm.status === "active").length;
  const acknowledgedAlarms = allAlarms.filter((alarm) => alarm.status === "acknowledged").length;
  const resolvedAlarms = allAlarms.filter((alarm) => alarm.status === "resolved").length;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Alarm Console</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-xs sm:text-sm text-gray-600">Real-time</span>
          </div>
          <button
            onClick={() => {
              refetchAlarms();
              refetchEvents();
            }}
            disabled={alarmsLoading || eventsLoading}
            className={`flex items-center space-x-1 sm:space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50 ${
              alarmsLoading || eventsLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${alarmsLoading || eventsLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button className="flex items-center space-x-1 sm:space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Configure Alerts</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 md:p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
            <div className="min-w-0">
              <div className="text-xl md:text-2xl font-bold text-red-600">{activeAlarms}</div>
              <div className="text-xs md:text-sm text-gray-600 truncate">Active Alarms</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-yellow-500 rounded-full flex-shrink-0"></div>
            <div className="min-w-0">
              <div className="text-xl md:text-2xl font-bold text-yellow-600">{acknowledgedAlarms}</div>
              <div className="text-xs md:text-sm text-gray-600 truncate">Acknowledged</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
            <div className="min-w-0">
              <div className="text-xl md:text-2xl font-bold text-green-600">{resolvedAlarms}</div>
              <div className="text-xs md:text-sm text-gray-600 truncate">Resolved</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-gray-600 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xl md:text-2xl font-bold text-gray-900">{allAlarms.length}</div>
              <div className="text-xs md:text-sm text-gray-600 truncate">Total Today</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-3 md:p-4 rounded-lg border">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search alarms..."
                className="w-full sm:w-auto pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                className="flex-1 sm:flex-none border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>

              <select
                className="flex-1 sm:flex-none border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
              >
                <option value="all">All Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="flex items-center">
            <button className="flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm">
              <Filter className="w-4 h-4" />
              <span>More Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alarms List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b">
          <h3 className="text-base md:text-lg font-semibold text-gray-900">
            Recent Alarms ({filteredAlarms.length})
            {(alarmsLoading || eventsLoading) && <RefreshCw className="inline w-4 h-4 ml-2 animate-spin" />}
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredAlarms.map((alarm) => (
            <div key={alarm.id} className="p-4 md:p-6 hover:bg-gray-50 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Title Row */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {getStatusIcon(alarm.status)}
                    <span className="font-medium text-gray-900 text-sm md:text-base">{alarm.type}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(
                        alarm.severity
                      )}`}
                    >
                      {alarm.severity}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(alarm.status)}`}></div>
                      <span className="text-xs text-gray-500 capitalize">{alarm.status}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="text-sm text-gray-600 mb-3 line-clamp-2">{alarm.description}</div>

                  {/* Meta Info */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs md:text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Camera className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                      <span className="truncate max-w-[150px] md:max-w-none">{alarm.camera}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <MapPin className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                      <span className="truncate max-w-[100px] md:max-w-none">{alarm.location}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                      <span>
                        {formatTime(alarm.timestamp)} • {getTimeAgo(alarm.timestamp)}
                      </span>
                    </div>
                    {alarm.assignedTo && <div className="text-blue-600">Assigned: {alarm.assignedTo}</div>}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {alarm.status === "active" && (
                    <>
                      <button className="px-2 md:px-3 py-1 text-xs md:text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200">
                        Acknowledge
                      </button>
                      <button className="px-2 md:px-3 py-1 text-xs md:text-sm bg-green-100 text-green-800 rounded hover:bg-green-200">
                        Resolve
                      </button>
                    </>
                  )}
                  {alarm.status === "acknowledged" && (
                    <button className="px-2 md:px-3 py-1 text-xs md:text-sm bg-green-100 text-green-800 rounded hover:bg-green-200">
                      Resolve
                    </button>
                  )}
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredAlarms.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No alarms found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
