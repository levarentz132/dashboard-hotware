"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  AlertCircle,
  Bell,
  Camera,
  Server,
  HardDrive,
  Shield,
  Activity,
  Clock,
  Filter,
  ChevronDown,
  ChevronRight,
  Info,
  AlertTriangle,
  XCircle,
  Search,
  X,
  Wifi,
  WifiOff,
  Calendar,
  Zap,
  MoreHorizontal,
  Network,
  Cpu,
  Cloud,
  LogIn,
  LogOut,
} from "lucide-react";
import { useServers } from "@/hooks/useNxAPI-server";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";
import { CloudLoginDialog } from "./CloudLoginDialog";

// ============================================
// INTERFACE DEFINITIONS
// ============================================

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
  isOnline?: boolean;
}

interface CloudServer {
  id: string;
  name: string;
  url: string;
  status: string;
}

interface ServerOption {
  id: string;
  name: string;
  type: "local" | "cloud";
  status?: string;
  accessRole?: string;
}

interface EventLog {
  actionType: string;
  actionParams: {
    actionId: string;
    needConfirmation: boolean;
    actionResourceId: string;
    url: string;
    emailAddress: string;
    fps: number;
    streamQuality: string;
    recordAfter: number;
    relayOutputId: string;
    sayText: string;
    tags: string;
    text: string;
    durationMs: number;
    additionalResources: string[];
    allUsers: boolean;
    forced: boolean;
    presetId: string;
    useSource: boolean;
    recordBeforeMs: number;
    playToClient: boolean;
    contentType: string;
    authType: string;
    httpMethod: string;
  };
  eventParams: {
    eventType: string;
    eventTimestampUsec: string;
    eventResourceId: string;
    resourceName: string;
    sourceServerId: string;
    reasonCode: string;
    inputPortId: string;
    caption: string;
    description: string;
    metadata: {
      cameraRefs: string[];
      instigators: string[];
      allUsers: boolean;
      level: string;
    };
    omitDbLogging: boolean;
    analyticsEngineId: string;
    objectTrackId: string;
    key: string;
    attributes: { name: string; value: string }[];
    progress: number;
  };
  businessRuleId: string;
  aggregationCount: number;
  flags: number;
  compareString: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatTimestamp = (timestampUsec: string): string => {
  if (!timestampUsec) return "N/A";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return timestampUsec;
  const date = new Date(ms);
  return date.toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatRelativeTime = (timestampUsec: string): string => {
  if (!timestampUsec) return "";
  const ms = parseInt(timestampUsec) / 1000;
  if (isNaN(ms)) return "";

  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} hari lalu`;
  return formatTimestamp(timestampUsec);
};

const getEventTypeLabel = (eventType: string): string => {
  const labels: Record<string, string> = {
    undefinedEvent: "Undefined Event",
    cameraMotionEvent: "Motion Detected",
    cameraInputEvent: "Camera Input",
    cameraDisconnectEvent: "Camera Offline",
    storageFailureEvent: "Storage Failure",
    networkIssueEvent: "Network Issue",
    cameraIpConflictEvent: "IP Conflict",
    serverFailureEvent: "Server Failure",
    serverConflictEvent: "Server Conflict",
    serverStartEvent: "Server Started",
    licenseIssueEvent: "License Issue",
    backupFinishedEvent: "Backup Complete",
    softwareTriggerEvent: "Software Trigger",
    analyticsSdkEvent: "Analytics Event",
    pluginDiagnosticEvent: "Plugin Diagnostic",
    poeOverBudgetEvent: "PoE Over Budget",
    fanErrorEvent: "Fan Error",
    analyticsSdkObjectDetected: "Object Detected",
    serverCertificateError: "Certificate Error",
    ldapSyncIssueEvent: "LDAP Sync Issue",
    saasIssueEvent: "Cloud Issue",
    systemHealthEvent: "System Health",
    maxSystemHealthEvent: "Critical Health",
    anyCameraEvent: "Camera Event",
    anyServerEvent: "Server Event",
    anyEvent: "System Event",
    userDefinedEvent: "Custom Event",
  };
  return labels[eventType] || eventType;
};

const getActionTypeLabel = (actionType: string): string => {
  const labels: Record<string, string> = {
    undefinedAction: "Undefined",
    cameraOutputAction: "Camera Output",
    bookmarkAction: "Bookmark Created",
    cameraRecordingAction: "Recording Started",
    panicRecordingAction: "Panic Recording",
    sendMailAction: "Email Sent",
    diagnosticsAction: "Diagnostics",
    showPopupAction: "Popup Shown",
    playSoundAction: "Sound Playing",
    playSoundOnceAction: "Sound Played",
    sayTextAction: "Text Announced",
    executePtzPresetAction: "PTZ Preset",
    showTextOverlayAction: "Text Overlay",
    showOnAlarmLayoutAction: "Alarm Layout",
    execHttpRequestAction: "HTTP Request",
    acknowledgeAction: "Acknowledged",
    fullscreenCameraAction: "Fullscreen",
    exitFullscreenAction: "Exit Fullscreen",
    openLayoutAction: "Layout Opened",
    buzzerAction: "Buzzer",
    pushNotificationAction: "Push Sent",
  };
  return labels[actionType] || actionType;
};

const getEventIcon = (eventType: string) => {
  const iconClass = "h-4 w-4";
  if (eventType.includes("Motion") || eventType.includes("motion")) return <Zap className={iconClass} />;
  if (eventType.includes("camera") || eventType.includes("Camera")) return <Camera className={iconClass} />;
  if (eventType.includes("Disconnect") || eventType.includes("disconnect")) return <WifiOff className={iconClass} />;
  if (eventType.includes("server") || eventType.includes("Server")) return <Server className={iconClass} />;
  if (eventType.includes("storage") || eventType.includes("Storage")) return <HardDrive className={iconClass} />;
  if (eventType.includes("network") || eventType.includes("Network")) return <Network className={iconClass} />;
  if (eventType.includes("license") || eventType.includes("License")) return <Shield className={iconClass} />;
  if (eventType.includes("health") || eventType.includes("Health")) return <Activity className={iconClass} />;
  if (eventType.includes("Conflict") || eventType.includes("conflict")) return <AlertTriangle className={iconClass} />;
  if (eventType.includes("Start") || eventType.includes("start")) return <Wifi className={iconClass} />;
  return <Bell className={iconClass} />;
};

const getLevelConfig = (level: string) => {
  switch (level?.toLowerCase()) {
    case "error":
      return {
        variant: "destructive" as const,
        bgClass: "bg-red-50 dark:bg-red-950/20",
        borderClass: "border-red-200 dark:border-red-800",
        textClass: "text-red-700 dark:text-red-400",
        icon: <XCircle className="h-5 w-5 text-red-500" />,
        label: "Error",
      };
    case "warning":
      return {
        variant: "outline" as const,
        bgClass: "bg-amber-50 dark:bg-amber-950/20",
        borderClass: "border-amber-200 dark:border-amber-800",
        textClass: "text-amber-700 dark:text-amber-400",
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        label: "Warning",
      };
    case "info":
    default:
      return {
        variant: "secondary" as const,
        bgClass: "bg-blue-50 dark:bg-blue-950/20",
        borderClass: "border-blue-200 dark:border-blue-800",
        textClass: "text-blue-700 dark:text-blue-400",
        icon: <Info className="h-5 w-5 text-blue-500" />,
        label: "Info",
      };
  }
};

// ============================================
// STATS CARD COMPONENT
// ============================================

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant: "default" | "error" | "warning" | "info";
  onClick?: () => void;
  active?: boolean;
}

function StatsCard({ title, value, icon, variant, onClick, active }: StatsCardProps) {
  const variantStyles = {
    default: "bg-white hover:bg-gray-50 border-gray-200",
    error: "bg-red-50 hover:bg-red-100 border-red-200 text-red-700",
    warning: "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700",
    info: "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start p-3 sm:p-4 rounded-xl border transition-all duration-200 w-full text-left",
        variantStyles[variant],
        active && "ring-2 ring-offset-2",
        active && variant === "error" && "ring-red-500",
        active && variant === "warning" && "ring-amber-500",
        active && variant === "info" && "ring-blue-500",
        active && variant === "default" && "ring-gray-500",
      )}
    >
      <div className="flex items-center justify-between w-full mb-1 sm:mb-2">
        <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider opacity-70">{title}</span>
        <span className="hidden sm:block">{icon}</span>
      </div>
      <span className="text-xl sm:text-2xl md:text-3xl font-bold">{value}</span>
    </button>
  );
}

// ============================================
// EVENT CARD COMPONENT
// ============================================

interface EventCardProps {
  event: EventLog;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  getResourceName: (id: string | undefined) => { name: string; type: "camera" | "server" } | null;
}

function EventCard({ event, isExpanded, onToggle, getResourceName }: EventCardProps) {
  const eventType = event.eventParams?.eventType || "unknown";
  const level = event.eventParams?.metadata?.level || "info";
  const timestamp = event.eventParams?.eventTimestampUsec;
  const caption = event.eventParams?.caption;
  const description = event.eventParams?.description;
  const resourceName = event.eventParams?.resourceName;
  const actionType = event.actionType;

  const levelConfig = getLevelConfig(level);
  const resource = getResourceName(event.eventParams?.eventResourceId);
  const sourceServer = getResourceName(event.eventParams?.sourceServerId);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          "border rounded-xl overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md",
          levelConfig.borderClass,
          isExpanded && levelConfig.bgClass,
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 sm:p-4 text-left hover:bg-gray-50/50 transition-colors">
            <div className="flex items-start gap-2 sm:gap-3">
              {/* Level Icon */}
              <div className="shrink-0 mt-0.5">{levelConfig.icon}</div>

              {/* Main Content */}
              <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                {/* Top Row: Badges */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2">
                    {getEventIcon(eventType)}
                    <span className="hidden xs:inline sm:hidden md:inline">{getEventTypeLabel(eventType)}</span>
                    <span className="xs:hidden sm:inline md:hidden">{getEventTypeLabel(eventType).split(" ")[0]}</span>
                  </Badge>

                  <Badge
                    variant={levelConfig.variant}
                    className={cn(
                      "text-[10px] sm:text-xs px-1.5 sm:px-2",
                      level === "warning" && "bg-amber-100 text-amber-700 border-amber-300",
                    )}
                  >
                    {levelConfig.label}
                  </Badge>

                  {actionType && actionType !== "undefinedAction" && (
                    <Badge variant="secondary" className="text-[10px] sm:text-xs hidden lg:flex px-1.5 sm:px-2">
                      {getActionTypeLabel(actionType)}
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <div className="font-medium text-gray-900 text-sm sm:text-base line-clamp-1">
                  {caption || resourceName || "No description available"}
                </div>

                {/* Preview Description */}
                {description && !isExpanded && (
                  <p className="text-xs sm:text-sm text-gray-500 line-clamp-1">{description}</p>
                )}

                {/* Resource & Time Row */}
                <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-[10px] sm:text-xs text-gray-500">
                  {resource && (
                    <span className="flex items-center gap-1">
                      {resource.type === "camera" ? <Camera className="h-3 w-3" /> : <Server className="h-3 w-3" />}
                      <span className="truncate max-w-[100px] sm:max-w-[150px]">{resource.name}</span>
                    </span>
                  )}

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(timestamp)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatTimestamp(timestamp)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Expand Icon */}
              <div className="shrink-0 self-center">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 sm:space-y-4", levelConfig.bgClass)}>
            <Separator />

            {/* Description Section */}
            {description && (
              <div className="space-y-2">
                <h4 className="text-xs sm:text-sm font-medium text-gray-700">Description</h4>
                {eventType === "serverConflictEvent" ? (
                  <div className="bg-white rounded-lg border p-2.5 sm:p-3 space-y-2">
                    {(() => {
                      const parts = description.split(/\s+/);
                      const ip = parts[0];
                      const macOrUuid = parts.length > 2 ? parts.slice(2).join(" ") : parts[1];
                      return (
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="text-xs sm:text-sm text-gray-600">Conflict Server:</span>
                            </div>
                            <code className="px-2 py-0.5 bg-gray-100 rounded text-xs sm:text-sm font-mono">{ip}</code>
                          </div>
                          {macOrUuid && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                              <div className="flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-gray-400 shrink-0" />
                                <span className="text-xs sm:text-sm text-gray-600">
                                  {macOrUuid.includes("urn_uuid") ? "UUID:" : "MAC:"}
                                </span>
                              </div>
                              <code className="px-2 py-0.5 bg-gray-100 rounded text-xs sm:text-sm font-mono break-all">
                                {macOrUuid}
                              </code>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-gray-600 bg-white rounded-lg border p-2.5 sm:p-3">
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {/* Resource */}
              {resource && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">
                    {resource.type === "camera" ? "Camera" : "Server"}
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    {resource.type === "camera" ? (
                      <Camera className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : (
                      <Server className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                    <span className="font-medium truncate">{resource.name}</span>
                  </div>
                </div>
              )}

              {/* Source Server */}
              {sourceServer && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Source Server</div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Server className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="font-medium truncate">{sourceServer.name}</span>
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Timestamp</div>
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">{formatTimestamp(timestamp)}</span>
                </div>
              </div>

              {/* Aggregation Count */}
              {event.aggregationCount > 1 && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Occurrences</div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <MoreHorizontal className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="font-medium">{event.aggregationCount} events</span>
                  </div>
                </div>
              )}

              {/* Reason Code */}
              {event.eventParams?.reasonCode && event.eventParams.reasonCode !== "none" && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Reason Code</div>
                  <Badge variant="outline" className="text-xs">
                    {event.eventParams.reasonCode}
                  </Badge>
                </div>
              )}

              {/* Input Port */}
              {event.eventParams?.inputPortId && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Input Port</div>
                  <code className="text-xs sm:text-sm font-mono">{event.eventParams.inputPortId}</code>
                </div>
              )}

              {/* Action URL */}
              {event.actionParams?.url && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3 sm:col-span-2">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Action URL</div>
                  <code className="text-xs sm:text-sm font-mono break-all text-blue-600">{event.actionParams.url}</code>
                </div>
              )}

              {/* Email */}
              {event.actionParams?.emailAddress && (
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Email</div>
                  <span className="text-xs sm:text-sm">{event.actionParams.emailAddress}</span>
                </div>
              )}
            </div>

            {/* Attributes */}
            {event.eventParams?.attributes && event.eventParams.attributes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs sm:text-sm font-medium text-gray-700">Attributes</h4>
                <div className="bg-white rounded-lg border p-2.5 sm:p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {event.eventParams.attributes.map((attr, i) => (
                      <div key={i} className="text-xs sm:text-sm">
                        <span className="text-gray-500">{attr.name}:</span>{" "}
                        <span className="font-medium">{attr.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Related Cameras */}
            {event.eventParams?.metadata?.cameraRefs && event.eventParams.metadata.cameraRefs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs sm:text-sm font-medium text-gray-700">Related Cameras</h4>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {event.eventParams.metadata.cameraRefs.map((ref, i) => {
                    const camera = getResourceName(ref);
                    return (
                      <Badge key={i} variant="secondary" className="gap-1 text-xs">
                        <Camera className="h-3 w-3" />
                        {camera ? camera.name : ref}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============================================
// LOADING SKELETON
// ============================================

function EventSkeleton() {
  return (
    <div className="border rounded-xl p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2 sm:gap-3">
        <Skeleton className="h-5 w-5 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 sm:w-24" />
            <Skeleton className="h-5 w-14 sm:w-16" />
          </div>
          <Skeleton className="h-4 w-full sm:w-3/4" />
          <Skeleton className="h-3 w-2/3 sm:w-1/2" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AlarmConsole() {
  const { servers, loading: loadingServers } = useServers();
  const { cameras } = useCameras();
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [selectedServerType, setSelectedServerType] = useState<"local" | "cloud">("local");
  const [selectedCloudSystemId, setSelectedCloudSystemId] = useState<string>("");
  const [selectedCloudServerId, setSelectedCloudServerId] = useState<string>("");
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  // Cloud servers state (servers within a cloud system)
  const [cloudServers, setCloudServers] = useState<CloudServer[]>([]);
  const [loadingCloudServers, setLoadingCloudServers] = useState(false);

  // Cloud login dialog state
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginSystemId, setLoginSystemId] = useState("");
  const [loginSystemName, setLoginSystemName] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState<Set<string>>(new Set());
  const [loggingOut, setLoggingOut] = useState(false);

  // Filter state
  const [filterEventType, setFilterEventType] = useState<string>("all");
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterActionType, setFilterActionType] = useState<string>("all");
  const [filterResource, setFilterResource] = useState<string>("all");
  const [filterSourceServer, setFilterSourceServer] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);

  // Pagination state
  const [displayCount, setDisplayCount] = useState(20); // Show 20 events initially
  const LOAD_MORE_COUNT = 20; // Load 20 more each time

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: getCloudAuthHeader(),
        },
      });

      if (!response.ok) {
        setCloudSystems([]);
        return;
      }

      const data = await response.json();
      const systems: CloudSystem[] = (data.systems || []).map((s: CloudSystem) => ({
        ...s,
        isOnline: s.stateOfHealth === "online",
      }));

      // Sort: owner first, then online systems
      systems.sort((a, b) => {
        if (a.accessRole === "owner" && b.accessRole !== "owner") return -1;
        if (a.accessRole !== "owner" && b.accessRole === "owner") return 1;
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return 0;
      });

      setCloudSystems(systems);
    } catch (err) {
      console.error("Error fetching cloud systems:", err);
      setCloudSystems([]);
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  // Auto-login function for cloud systems
  const attemptAutoLogin = useCallback(
    async (systemId: string, systemName: string): Promise<boolean> => {
      // Check if auto-login is enabled and credentials are configured
      if (!CLOUD_CONFIG.autoLoginEnabled || !CLOUD_CONFIG.username || !CLOUD_CONFIG.password) {
        console.log("[Cloud Auto-Login] Disabled or credentials not configured");
        return false;
      }

      // Check if we already attempted auto-login for this system
      if (autoLoginAttempted.has(systemId)) {
        console.log(`[Cloud Auto-Login] Already attempted for ${systemName}`);
        return false;
      }

      console.log(`[Cloud Auto-Login] Attempting login to ${systemName}...`);

      try {
        const response = await fetch("/api/cloud/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemId,
            username: CLOUD_CONFIG.username,
            password: CLOUD_CONFIG.password,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`[Cloud Auto-Login] Failed for ${systemName}:`, data.error);
          // Mark as attempted to avoid retry loops
          setAutoLoginAttempted((prev) => new Set(prev).add(systemId));
          return false;
        }

        console.log(`[Cloud Auto-Login] Success for ${systemName}`);
        // Mark as attempted (successfully)
        setAutoLoginAttempted((prev) => new Set(prev).add(systemId));
        setIsLoggedIn((prev) => new Set(prev).add(systemId));
        return true;
      } catch (err) {
        console.error(`[Cloud Auto-Login] Error for ${systemName}:`, err);
        setAutoLoginAttempted((prev) => new Set(prev).add(systemId));
        return false;
      }
    },
    [autoLoginAttempted],
  );

  // Fetch cloud systems on mount
  useEffect(() => {
    fetchCloudSystems();
  }, [fetchCloudSystems]);

  // Combined server options (local + cloud)
  const serverOptions: ServerOption[] = useMemo(() => {
    const options: ServerOption[] = [];

    // Add local servers
    servers.forEach((server) => {
      options.push({
        id: server.id,
        name: server.name || server.id,
        type: "local",
      });
    });

    // Add cloud systems
    cloudSystems.forEach((system) => {
      options.push({
        id: system.id,
        name: system.name,
        type: "cloud",
        status: system.stateOfHealth,
        accessRole: system.accessRole,
      });
    });

    return options;
  }, [servers, cloudSystems]);

  // Resource lookup map
  const resourceNameMap = useMemo(() => {
    const map = new Map<string, { name: string; type: "camera" | "server" }>();
    cameras.forEach((camera) => {
      if (camera.id) {
        map.set(camera.id, { name: camera.name || "Unknown Camera", type: "camera" });
      }
    });
    servers.forEach((server) => {
      if (server.id) {
        map.set(server.id, { name: server.name || "Unknown Server", type: "server" });
      }
    });
    return map;
  }, [cameras, servers]);

  const getResourceName = useCallback(
    (resourceId: string | undefined) => {
      if (!resourceId) return null;
      return resourceNameMap.get(resourceId) || null;
    },
    [resourceNameMap],
  );

  // Set default server
  useEffect(() => {
    if (serverOptions.length > 0 && !selectedServerId) {
      // Prefer local server first
      const localServer = serverOptions.find((s) => s.type === "local");
      if (localServer) {
        setSelectedServerId(`local:${localServer.id}`);
        setSelectedServerType("local");
      } else if (serverOptions[0]) {
        setSelectedServerId(`${serverOptions[0].type}:${serverOptions[0].id}`);
        setSelectedServerType(serverOptions[0].type);
      }
    }
  }, [serverOptions, selectedServerId]);

  // Fetch cloud servers when a cloud system is selected
  const fetchCloudServers = useCallback(
    async (systemId: string, retryAfterLogin: boolean = false) => {
      setLoadingCloudServers(true);
      setCloudServers([]);
      setSelectedCloudServerId("");
      setRequiresAuth(false);
      setError(null);

      const system = cloudSystems.find((s) => s.id === systemId);
      const systemName = system?.name || systemId;

      try {
        const response = await fetch(`/api/cloud/servers?systemId=${encodeURIComponent(systemId)}`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.requiresAuth) {
            // Try auto-login first (only if not already retrying after login)
            if (!retryAfterLogin && CLOUD_CONFIG.autoLoginEnabled) {
              console.log(`[Cloud] Auth required for ${systemName}, attempting auto-login...`);
              const loginSuccess = await attemptAutoLogin(systemId, systemName);
              if (loginSuccess) {
                // Retry fetching servers after successful login
                setLoadingCloudServers(false);
                return fetchCloudServers(systemId, true);
              }
            }

            // Auto-login failed or not available, show login dialog
            setRequiresAuth(true);
            setLoginSystemId(systemId);
            setLoginSystemName(systemName);
            setShowLoginDialog(true);
            return;
          }
          throw new Error(`Failed to fetch servers: ${response.status}`);
        }

        const data = await response.json();
        const serverList: CloudServer[] = Array.isArray(data) ? data : [];
        setCloudServers(serverList);

        // Auto-select first server if available
        if (serverList.length > 0) {
          setSelectedCloudServerId(serverList[0].id);
        }
      } catch (err) {
        console.error("Error fetching cloud servers:", err);
        setCloudServers([]);
      } finally {
        setLoadingCloudServers(false);
      }
    },
    [cloudSystems, attemptAutoLogin],
  );

  // Handle server selection change
  const handleServerChange = (value: string) => {
    // Value format: "local:serverId" or "cloud:systemId"
    const [type, ...idParts] = value.split(":");
    const id = idParts.join(":");

    setSelectedServerId(value);
    setSelectedServerType(type as "local" | "cloud");
    setEvents([]); // Clear events when switching servers
    setError(null);

    if (type === "cloud") {
      setSelectedCloudSystemId(id);
      fetchCloudServers(id);
    } else {
      setSelectedCloudSystemId("");
      setCloudServers([]);
      setSelectedCloudServerId("");
    }
  };

  // Handle cloud server selection
  const handleCloudServerChange = (serverId: string) => {
    setSelectedCloudServerId(serverId);
    setEvents([]); // Clear events when switching servers
  };

  // Extract actual ID from selectedServerId (format: "type:id")
  const getActualServerId = useCallback(() => {
    if (!selectedServerId) return "";
    const [, ...idParts] = selectedServerId.split(":");
    return idParts.join(":");
  }, [selectedServerId]);

  // Get current cloud system name
  const getCurrentCloudSystemName = useCallback(() => {
    const system = cloudSystems.find((s) => s.id === selectedCloudSystemId);
    return system?.name || selectedCloudSystemId;
  }, [cloudSystems, selectedCloudSystemId]);

  // Logout function for cloud systems
  const handleCloudLogout = useCallback(async () => {
    if (!selectedCloudSystemId) return;

    setLoggingOut(true);
    try {
      const response = await fetch(`/api/cloud/login?systemId=${encodeURIComponent(selectedCloudSystemId)}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from logged in set
        setIsLoggedIn((prev) => {
          const newSet = new Set(prev);
          newSet.delete(selectedCloudSystemId);
          return newSet;
        });
        // Remove from auto-login attempted so it can retry if needed
        setAutoLoginAttempted((prev) => {
          const newSet = new Set(prev);
          newSet.delete(selectedCloudSystemId);
          return newSet;
        });
        // Clear servers and events
        setCloudServers([]);
        setSelectedCloudServerId("");
        setEvents([]);
        setRequiresAuth(true);
        console.log(`[Cloud Logout] Successfully logged out from ${getCurrentCloudSystemName()}`);
      }
    } catch (err) {
      console.error("[Cloud Logout] Error:", err);
    } finally {
      setLoggingOut(false);
    }
  }, [selectedCloudSystemId, getCurrentCloudSystemName]);

  // Open login dialog for current cloud system
  const openLoginDialog = useCallback(() => {
    setLoginSystemId(selectedCloudSystemId);
    setLoginSystemName(getCurrentCloudSystemName());
    setShowLoginDialog(true);
  }, [selectedCloudSystemId, getCurrentCloudSystemName]);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    if (!selectedServerId) return;

    // For cloud, we need both systemId and serverId
    if (selectedServerType === "cloud") {
      if (!selectedCloudSystemId || !selectedCloudServerId) return;
    }

    const actualId = getActualServerId();
    if (!actualId && selectedServerType === "local") return;

    setLoading(true);
    setError(null);
    setRequiresAuth(false);

    try {
      let response;

      if (selectedServerType === "cloud") {
        // For cloud systems, use systemId and serverId
        const params = new URLSearchParams({
          systemId: selectedCloudSystemId,
          serverId: selectedCloudServerId,
        });
        response = await fetch(`/api/cloud/events?${params.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });
      } else {
        // For local servers
        response = await fetch(`/api/nx/servers/${actualId}/events`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.requiresAuth) {
          setRequiresAuth(true);
          throw new Error(`Perlu login untuk mengakses cloud system ini.`);
        }
        throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const sortedEvents = Array.isArray(data)
        ? data.sort((a: EventLog, b: EventLog) => {
            const timeA = parseInt(a.eventParams?.eventTimestampUsec || "0");
            const timeB = parseInt(b.eventParams?.eventTimestampUsec || "0");
            return timeB - timeA;
          })
        : [];

      setRequiresAuth(false);
      setEvents(sortedEvents);
    } catch (err) {
      console.error("Error fetching events:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }, [selectedServerId, selectedServerType, selectedCloudSystemId, selectedCloudServerId, getActualServerId]);

  // Fetch on server change
  useEffect(() => {
    if (selectedServerType === "local" && selectedServerId) {
      fetchEvents();
    } else if (selectedServerType === "cloud" && selectedCloudSystemId && selectedCloudServerId) {
      fetchEvents();
    }
  }, [selectedServerId, selectedServerType, selectedCloudSystemId, selectedCloudServerId, fetchEvents]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !selectedServerId) return;
    if (selectedServerType === "cloud" && (!selectedCloudSystemId || !selectedCloudServerId)) return;

    const interval = setInterval(fetchEvents, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [
    autoRefresh,
    refreshInterval,
    selectedServerId,
    selectedServerType,
    selectedCloudSystemId,
    selectedCloudServerId,
    fetchEvents,
  ]);

  // Toggle expansion
  const toggleEventExpansion = (index: number) => {
    setExpandedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesEventType = filterEventType === "all" || event.eventParams?.eventType === filterEventType;
      const matchesLevel = filterLevel === "all" || event.eventParams?.metadata?.level === filterLevel;
      const matchesActionType = filterActionType === "all" || event.actionType === filterActionType;
      const matchesResource = filterResource === "all" || event.eventParams?.eventResourceId === filterResource;
      const matchesSourceServer =
        filterSourceServer === "all" || event.eventParams?.sourceServerId === filterSourceServer;

      // Date range filter
      let matchesDateRange = true;
      if (filterDateFrom || filterDateTo) {
        const eventTime = parseInt(event.eventParams?.eventTimestampUsec || "0") / 1000;
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom).getTime();
          if (eventTime < fromDate) matchesDateRange = false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo).getTime() + 86400000; // End of day
          if (eventTime > toDate) matchesDateRange = false;
        }
      }

      const matchesSearch =
        searchQuery === "" ||
        event.eventParams?.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.eventParams?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.eventParams?.resourceName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getEventTypeLabel(event.eventParams?.eventType || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      return (
        matchesEventType &&
        matchesLevel &&
        matchesActionType &&
        matchesResource &&
        matchesSourceServer &&
        matchesDateRange &&
        matchesSearch
      );
    });
  }, [
    events,
    filterEventType,
    filterLevel,
    filterActionType,
    filterResource,
    filterSourceServer,
    filterDateFrom,
    filterDateTo,
    searchQuery,
  ]);

  // Unique event types
  const uniqueEventTypes = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.eventParams?.eventType).filter(Boolean))).sort();
  }, [events]);

  // Unique action types
  const uniqueActionTypes = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.actionType).filter(Boolean))).sort();
  }, [events]);

  // Unique resources from events
  const uniqueResources = useMemo(() => {
    const resourceSet = new Map<string, { id: string; name: string; type: "camera" | "server" }>();
    events.forEach((event) => {
      const resourceId = event.eventParams?.eventResourceId;
      if (resourceId) {
        const resource = getResourceName(resourceId);
        if (resource) {
          resourceSet.set(resourceId, { id: resourceId, ...resource });
        } else {
          resourceSet.set(resourceId, { id: resourceId, name: resourceId.substring(0, 8) + "...", type: "camera" });
        }
      }
    });
    return Array.from(resourceSet.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [events, getResourceName]);

  // Unique source servers from events
  const uniqueSourceServers = useMemo(() => {
    const serverSet = new Map<string, { id: string; name: string }>();
    events.forEach((event) => {
      const serverId = event.eventParams?.sourceServerId;
      if (serverId) {
        const server = getResourceName(serverId);
        if (server) {
          serverSet.set(serverId, { id: serverId, name: server.name });
        } else {
          serverSet.set(serverId, { id: serverId, name: serverId.substring(0, 8) + "..." });
        }
      }
    });
    return Array.from(serverSet.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [events, getResourceName]);

  // Stats
  const stats = useMemo(
    () => ({
      total: events.length,
      errors: events.filter((e) => e.eventParams?.metadata?.level === "error").length,
      warnings: events.filter((e) => e.eventParams?.metadata?.level === "warning").length,
      info: events.filter((e) => e.eventParams?.metadata?.level === "info" || !e.eventParams?.metadata?.level).length,
    }),
    [events],
  );

  // Clear all filters
  const clearFilters = () => {
    setFilterEventType("all");
    setFilterLevel("all");
    setFilterActionType("all");
    setFilterResource("all");
    setFilterSourceServer("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchQuery("");
  };

  const hasActiveFilters =
    filterEventType !== "all" ||
    filterLevel !== "all" ||
    filterActionType !== "all" ||
    filterResource !== "all" ||
    filterSourceServer !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "" ||
    searchQuery !== "";

  const activeFilterCount = [
    filterEventType !== "all",
    filterLevel !== "all",
    filterActionType !== "all",
    filterResource !== "all",
    filterSourceServer !== "all",
    filterDateFrom !== "" || filterDateTo !== "",
    searchQuery !== "",
  ].filter(Boolean).length;

  // Displayed events (paginated)
  const displayedEvents = useMemo(() => {
    return filteredEvents.slice(0, displayCount);
  }, [filteredEvents, displayCount]);

  const hasMoreEvents = displayCount < filteredEvents.length;
  const remainingCount = filteredEvents.length - displayCount;

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayCount(20);
  }, [
    filterEventType,
    filterLevel,
    filterActionType,
    filterResource,
    filterSourceServer,
    filterDateFrom,
    filterDateTo,
    searchQuery,
  ]);

  // Reset pagination when server changes
  useEffect(() => {
    setDisplayCount(20);
  }, [selectedServerId, selectedCloudServerId]);

  // Load more function
  const loadMore = useCallback(() => {
    setDisplayCount((prev) => Math.min(prev + LOAD_MORE_COUNT, filteredEvents.length));
  }, [filteredEvents.length]);

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Alarm Console</h1>
          <p className="text-sm text-gray-500 mt-1 hidden sm:block">
            Monitor dan analisis event sistem secara real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Server Selector */}
          <Select value={selectedServerId} onValueChange={handleServerChange} disabled={loadingServers || loadingCloud}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <Server className="h-4 w-4 mr-2 text-gray-400 shrink-0" />
              <SelectValue placeholder="Pilih server..." />
            </SelectTrigger>
            <SelectContent>
              {/* Local Servers */}
              {servers.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">Local Servers</div>
                  {servers.map((server) => (
                    <SelectItem key={`local-${server.id}`} value={`local:${server.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span>{server.name || server.id}</span>
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}

              {/* Cloud Systems */}
              {cloudSystems.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-blue-50 mt-1">
                    <Cloud className="h-3 w-3 inline mr-1" />
                    Cloud Systems
                  </div>
                  {cloudSystems.map((system) => (
                    <SelectItem key={`cloud-${system.id}`} value={`cloud:${system.id}`}>
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", system.isOnline ? "bg-blue-500" : "bg-gray-400")} />
                        <span>{system.name}</span>
                        {!system.isOnline && <span className="text-xs text-gray-400">(offline)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}

              {servers.length === 0 && cloudSystems.length === 0 && (
                <div className="px-2 py-4 text-sm text-gray-500 text-center">
                  {loadingServers || loadingCloud ? "Memuat server..." : "Tidak ada server tersedia"}
                </div>
              )}
            </SelectContent>
          </Select>

          {/* Cloud Server Selector - shown when cloud system is selected */}
          {selectedServerType === "cloud" && selectedCloudSystemId && (
            <Select
              value={selectedCloudServerId}
              onValueChange={handleCloudServerChange}
              disabled={loadingCloudServers || cloudServers.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <Server className="h-4 w-4 mr-2 text-blue-400 shrink-0" />
                <SelectValue placeholder={loadingCloudServers ? "Memuat server..." : "Pilih server..."} />
              </SelectTrigger>
              <SelectContent>
                {cloudServers.length > 0 ? (
                  cloudServers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full",
                            server.status === "Online" ? "bg-green-500" : "bg-gray-400",
                          )}
                        />
                        <span>{server.name || server.id}</span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-4 text-sm text-gray-500 text-center">
                    {loadingCloudServers ? "Memuat server..." : "Tidak ada server dalam sistem ini"}
                  </div>
                )}
              </SelectContent>
            </Select>
          )}

          {/* Cloud Logout Button */}
          {selectedServerType === "cloud" && selectedCloudSystemId && isLoggedIn.has(selectedCloudSystemId) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-red-500 gap-1"
              onClick={handleCloudLogout}
              disabled={loggingOut}
            >
              {loggingOut ? <RefreshCw className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
              <span className="hidden sm:inline">Logout</span>
            </Button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {/* Auto Refresh Toggle */}
            {/* <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={autoRefresh ? "default" : "outline"}
                    size="icon"
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className="shrink-0"
                  >
                    <RefreshCw className={cn("h-4 w-4", autoRefresh && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{autoRefresh ? `Auto-refresh aktif (${refreshInterval}s)` : "Aktifkan auto-refresh"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider> */}

            {/* Manual Refresh */}
            <Button
              onClick={fetchEvents}
              disabled={
                loading ||
                !selectedServerId ||
                (selectedServerType === "cloud" && (!selectedCloudSystemId || !selectedCloudServerId))
              }
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatsCard
          title="Total"
          value={stats.total}
          icon={<Bell className="h-5 w-5 opacity-50" />}
          variant="default"
          onClick={() => setFilterLevel("all")}
          active={filterLevel === "all"}
        />
        <StatsCard
          title="Error"
          value={stats.errors}
          icon={<XCircle className="h-5 w-5" />}
          variant="error"
          onClick={() => setFilterLevel(filterLevel === "error" ? "all" : "error")}
          active={filterLevel === "error"}
        />
        <StatsCard
          title="Warning"
          value={stats.warnings}
          icon={<AlertTriangle className="h-5 w-5" />}
          variant="warning"
          onClick={() => setFilterLevel(filterLevel === "warning" ? "all" : "warning")}
          active={filterLevel === "warning"}
        />
        <StatsCard
          title="Info"
          value={stats.info}
          icon={<Info className="h-5 w-5" />}
          variant="info"
          onClick={() => setFilterLevel(filterLevel === "info" ? "all" : "info")}
          active={filterLevel === "info"}
        />
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Cari event..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2 flex-1 sm:flex-none"
              >
                <Filter className="h-4 w-4" />
                <span>Filter</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters} className="shrink-0">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <>
              <Separator />

              {/* Active Filters Summary */}
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                  {filterEventType !== "all" && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Event: {getEventTypeLabel(filterEventType)}
                      <button
                        onClick={() => setFilterEventType("all")}
                        className="ml-1 hover:bg-gray-300 rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filterLevel !== "all" && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Level: {filterLevel}
                      <button onClick={() => setFilterLevel("all")} className="ml-1 hover:bg-gray-300 rounded p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filterActionType !== "all" && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Action: {getActionTypeLabel(filterActionType)}
                      <button
                        onClick={() => setFilterActionType("all")}
                        className="ml-1 hover:bg-gray-300 rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filterResource !== "all" && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Resource: {uniqueResources.find((r) => r.id === filterResource)?.name || filterResource}
                      <button onClick={() => setFilterResource("all")} className="ml-1 hover:bg-gray-300 rounded p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filterSourceServer !== "all" && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Server: {uniqueSourceServers.find((s) => s.id === filterSourceServer)?.name || filterSourceServer}
                      <button
                        onClick={() => setFilterSourceServer("all")}
                        className="ml-1 hover:bg-gray-300 rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {(filterDateFrom || filterDateTo) && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Tanggal: {filterDateFrom || "..."} - {filterDateTo || "..."}
                      <button
                        onClick={() => {
                          setFilterDateFrom("");
                          setFilterDateTo("");
                        }}
                        className="ml-1 hover:bg-gray-300 rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {/* Event Type Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Tipe Event</label>
                  <Select value={filterEventType} onValueChange={setFilterEventType}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Semua Event" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Event</SelectItem>
                      {uniqueEventTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            {getEventIcon(type)}
                            {getEventTypeLabel(type)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Level Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Level</label>
                  <Select value={filterLevel} onValueChange={setFilterLevel}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Semua Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Level</SelectItem>
                      <SelectItem value="error">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          Error
                        </span>
                      </SelectItem>
                      <SelectItem value="warning">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          Warning
                        </span>
                      </SelectItem>
                      <SelectItem value="info">
                        <span className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-blue-500" />
                          Info
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Type Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Tipe Action</label>
                  <Select value={filterActionType} onValueChange={setFilterActionType}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Semua Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Action</SelectItem>
                      {uniqueActionTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getActionTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Resource Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Resource</label>
                  <Select value={filterResource} onValueChange={setFilterResource}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Semua Resource" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Resource</SelectItem>
                      {uniqueResources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          <span className="flex items-center gap-2">
                            {resource.type === "camera" ? (
                              <Camera className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Server className="h-4 w-4 text-green-500" />
                            )}
                            <span className="truncate max-w-[150px]">{resource.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Source Server Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Source Server</label>
                  <Select value={filterSourceServer} onValueChange={setFilterSourceServer}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Semua Server" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Server</SelectItem>
                      {uniqueSourceServers.map((server) => (
                        <SelectItem key={server.id} value={server.id}>
                          <span className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-green-500" />
                            <span className="truncate max-w-[150px]">{server.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date From Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Dari Tanggal</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="pl-10 text-sm"
                    />
                  </div>
                </div>

                {/* Date To Filter */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Sampai Tanggal</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="pl-10 text-sm"
                      min={filterDateFrom}
                    />
                  </div>
                </div>

                {/* Auto Refresh Interval */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Auto Refresh</label>
                  <Select
                    value={autoRefresh ? refreshInterval.toString() : "off"}
                    onValueChange={(val) => {
                      if (val === "off") {
                        setAutoRefresh(false);
                      } else {
                        setAutoRefresh(true);
                        setRefreshInterval(parseInt(val));
                      }
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="10">Setiap 10 detik</SelectItem>
                      <SelectItem value="30">Setiap 30 detik</SelectItem>
                      <SelectItem value="60">Setiap 1 menit</SelectItem>
                      <SelectItem value="300">Setiap 5 menit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quick Date Filters */}
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs text-gray-500 self-center mr-1">Rentang cepat:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const today = new Date().toISOString().split("T")[0];
                    setFilterDateFrom(today);
                    setFilterDateTo(today);
                  }}
                >
                  Hari ini
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    setFilterDateFrom(yesterday.toISOString().split("T")[0]);
                    setFilterDateTo(yesterday.toISOString().split("T")[0]);
                  }}
                >
                  Kemarin
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const today = new Date();
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    setFilterDateFrom(weekAgo.toISOString().split("T")[0]);
                    setFilterDateTo(today.toISOString().split("T")[0]);
                  }}
                >
                  7 hari terakhir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const today = new Date();
                    const monthAgo = new Date(today);
                    monthAgo.setDate(monthAgo.getDate() - 30);
                    setFilterDateFrom(monthAgo.toISOString().split("T")[0]);
                    setFilterDateTo(today.toISOString().split("T")[0]);
                  }}
                >
                  30 hari terakhir
                </Button>
                {(filterDateFrom || filterDateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-500 hover:text-red-600"
                    onClick={() => {
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }}
                  >
                    Reset tanggal
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Results Info */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
        <span>
          Menampilkan {displayedEvents.length} dari {filteredEvents.length} events
          {filteredEvents.length !== events.length && ` (${events.length} total)`}
          {hasActiveFilters && " (filtered)"}
        </span>
        {autoRefresh && (
          <span className="flex items-center gap-1 text-green-600">
            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span className="hidden sm:inline">Live update aktif</span>
          </span>
        )}
      </div>

      {/* Events List */}
      <div className="space-y-2 sm:space-y-3">
        {/* Loading State */}
        {(loading || loadingCloudServers) && events.length === 0 && (
          <>
            <EventSkeleton />
            <EventSkeleton />
            <EventSkeleton />
          </>
        )}

        {/* Auth Required State - for cloud systems */}
        {!loading && !loadingCloudServers && requiresAuth && selectedServerType === "cloud" && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="flex flex-col items-center justify-center p-6 sm:p-8 text-center">
              <Cloud className="h-10 w-10 sm:h-12 sm:w-12 mb-4 text-blue-500" />
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Login Diperlukan</h3>
              <p className="text-sm text-gray-600 mb-4 max-w-md">
                Cloud system <strong>{getCurrentCloudSystemName()}</strong> memerlukan autentikasi. Silakan login untuk
                melihat event logs.
              </p>
              <Button onClick={openLoginDialog} className="gap-2">
                <LogIn className="h-4 w-4" />
                Login ke Cloud System
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Error State - General */}
        {error && !loading && !requiresAuth && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center justify-center p-6 sm:p-8 text-red-600">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 mr-2 shrink-0" />
              <span className="text-sm sm:text-base">{error}</span>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !loadingCloudServers && !error && !requiresAuth && filteredEvents.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-8 sm:p-12 text-gray-500">
              <Bell className="h-10 w-10 sm:h-12 sm:w-12 mb-4 opacity-30" />
              <h3 className="text-base sm:text-lg font-medium mb-1">Tidak ada event ditemukan</h3>
              <p className="text-xs sm:text-sm text-center max-w-md">
                {hasActiveFilters
                  ? "Coba ubah filter atau kata kunci pencarian"
                  : "Event akan muncul saat sistem mendeteksi aktivitas"}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} className="mt-4">
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Events */}
        {!loading &&
          !error &&
          displayedEvents.length > 0 &&
          displayedEvents.map((event, index) => (
            <EventCard
              key={index}
              event={event}
              index={index}
              isExpanded={expandedEvents.has(index)}
              onToggle={() => toggleEventExpansion(index)}
              getResourceName={getResourceName}
            />
          ))}

        {/* Load More Button */}
        {!loading && !error && hasMoreEvents && (
          <div className="flex flex-col items-center gap-2 pt-4">
            <Button variant="outline" onClick={loadMore} className="w-full sm:w-auto gap-2">
              <ChevronDown className="h-4 w-4" />
              Muat {Math.min(LOAD_MORE_COUNT, remainingCount)} event lagi
            </Button>
            <span className="text-xs text-gray-400">{remainingCount} event tersisa</span>
          </div>
        )}

        {/* Show All Button - when many events remaining */}
        {!loading && !error && hasMoreEvents && remainingCount > LOAD_MORE_COUNT && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisplayCount(filteredEvents.length)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Atau tampilkan semua {filteredEvents.length} events
            </Button>
          </div>
        )}
      </div>

      {/* Cloud Login Dialog */}
      <CloudLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        systemId={loginSystemId}
        systemName={loginSystemName}
        onLoginSuccess={() => {
          // Mark as logged in
          setIsLoggedIn((prev) => new Set(prev).add(loginSystemId));
          // Refresh cloud servers and events after successful login
          if (selectedCloudSystemId) {
            fetchCloudServers(selectedCloudSystemId);
          }
        }}
      />
    </div>
  );
}
