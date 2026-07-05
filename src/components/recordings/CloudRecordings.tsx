"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AuthContextValue,
  AuthState,
  UserPublic,
  LoginCredentials,
  AuthResponse,
} from "@/lib/auth/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon, Download, Loader2, Video, Cloud, LogIn, Camera, Clock, List, Search,
  Image as ImageIcon2, Eye, StopCircle, PlayCircle, RefreshCw, X, Plus, Trash2,
  CalendarDays, Pencil, AlertCircle, Settings, User, LayoutGrid, LayoutList, Archive, CheckCircle2, ChevronDown, ChevronRight
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { format, addDays, nextDay, Day } from "date-fns";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { useAuth } from "@/contexts/auth-context";
import { calculateNextOccurrence } from "@/lib/schedule-utils";
import { parseRecordingLogTimestamp } from "@/lib/recording-log-utils";
import type { ScheduledErrorLogEntry } from "@/lib/scheduled-error-logs-store";
import { isAdmin, isVmsAdmin, hasCameraViewPermission, hasCameraEditPermission, canManageSchedule, canViewSchedule } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Image as ImageIcon } from "lucide-react";
import {
  fetchCloudSystems,
  fetchCloudDevices,
  fetchRecordedTimePeriods,
  bulkDownloadRecordings,
  CloudSystem,
  CloudDevice,
  CloudAuthError,
  BasicAuthCredentials,
} from "@/services/recordings-service";
import nxAPI from "@/lib/nxapi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { showNotification } from "@/lib/notifications";
import { addPersistentNotification, getNotificationUserKey } from "@/lib/persistent-notifications";
import { ScheduleExportDialog } from "./ScheduleExportDialog";

const NoOverlayAlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-[70] grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg text-slate-900 border-slate-200",
        className
      )}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
))
NoOverlayAlertDialogContent.displayName = "NoOverlayAlertDialogContent";

// ---- Types ----
interface ScheduledRecording {
  id: string;
  cameraId: string;
  cameraName: string;
  systemId: string;
  systemName: string;
  date: Date;
  startTime: string;
  endTime: string;
  startMs: number;
  endMs: number;
  type: "video" | "screenshot";
  screenshotTime?: string;
  status: "pending" | "recording" | "completed" | "failed" | "in progress" | "capturing" | "processing";
  record?: boolean;
  startedAt?: number;
  recurrence?: "none" | "weekday" | "monthday";
  recurrenceDay?: number;
  batchId?: string;
  scheduledBy?: string;
  inactive?: boolean;
  isExplicitlyActive?: boolean;
}

interface RecentRecording {
  id: string;
  cameraName: string;
  systemName: string;
  startTimeMs: number;
  durationMs: number;
  systemId: string;
  deviceId: string;
  isScreenshot?: boolean;
  isLocal?: boolean;
  fileName?: string;
  dateFolder?: string;
  cameraFolderName?: string;
}

interface ScheduleTimeRange {
  start: string;
  end: string;
}

const ACTIVE_SCHEDULE_STATUSES = new Set([
  "recording",
  "in progress",
  "capturing",
  "processing",
]);

const SCREENSHOT_CATCHUP_MS = 2 * 60 * 1000;
const SCREENSHOT_STALE_MS = 5 * 60 * 1000;
const VIDEO_END_GRACE_MS = 2 * 60 * 1000;
const PROCESSING_GRACE_MS = 35 * 60 * 1000;

function getScheduleTimeBounds(
  rec: Pick<ScheduledRecording, "date" | "startTime" | "endTime" | "type">,
) {
  const [sh, sm] = rec.startTime.split(":").map(Number);
  const startMs = new Date(rec.date).setHours(sh, sm, 0, 0);
  if (rec.type === "screenshot") {
    return { startMs, endMs: startMs + SCREENSHOT_CATCHUP_MS };
  }
  const [eh, em] = rec.endTime.split(":").map(Number);
  const endMs = new Date(rec.date).setHours(eh, em, 59, 999);
  return { startMs, endMs };
}

function isScheduleRunningNow(rec: ScheduledRecording, isInactive = false): boolean {
  if (isInactive || rec.inactive) return false;
  if (!ACTIVE_SCHEDULE_STATUSES.has(rec.status)) return false;

  const now = Date.now();
  const { startMs, endMs } = getScheduleTimeBounds(rec);

  if (rec.status === "processing") {
    return now >= startMs && now < endMs + PROCESSING_GRACE_MS;
  }
  if (rec.type === "screenshot") {
    return now >= startMs && now < startMs + SCREENSHOT_STALE_MS;
  }
  return now >= startMs && now <= endMs + VIDEO_END_GRACE_MS;
}

function getRunningNowLabel(rec: ScheduledRecording): string {
  if (rec.status === "processing") return "Saving…";
  if (rec.status === "capturing") return "Capturing…";
  if (rec.status === "recording" || rec.type === "video") return "Recording now";
  return "Running now";
}

function reconcileStaleActiveSchedules(schedules: ScheduledRecording[]): {
  schedules: ScheduledRecording[];
  changed: boolean;
} {
  const now = Date.now();
  let changed = false;
  const result: ScheduledRecording[] = [];

  for (const rec of schedules) {
    const { startMs, endMs } = getScheduleTimeBounds(rec);
    let next = rec;

    if (rec.type === "screenshot") {
      if (
        (rec.status === "in progress" || rec.status === "capturing") &&
        now > startMs + SCREENSHOT_STALE_MS
      ) {
        next = { ...rec, status: "failed" };
        changed = true;
      }
    } else {
      if (
        (rec.status === "in progress" ||
          (rec.status === "recording" && !rec.record)) &&
        now > endMs + VIDEO_END_GRACE_MS
      ) {
        next = { ...rec, status: "failed" };
        changed = true;
      } else if (rec.status === "processing" && now > endMs + PROCESSING_GRACE_MS) {
        const isRecurring = rec.recurrence && rec.recurrence !== "none";
        if (!isRecurring) {
          changed = true;
          continue;
        }
        next = { ...rec, status: "failed" };
        changed = true;
      } else if (rec.status === "recording" && rec.record && now > endMs + VIDEO_END_GRACE_MS) {
        next = { ...rec, status: "processing" };
        changed = true;
      }
    }

    result.push(next);
  }

  return { schedules: result, changed };
}

const SearchableCameraSelect = ({
  value,
  onValueChange,
  devices,
  loadingDevices,
  normalizeId,
  placeholder = "Select Camera",
  showAllOption = false,
  canEdit
}: {
  value: string;
  onValueChange: (v: string) => void;
  devices: any[];
  loadingDevices: boolean;
  normalizeId: (id: any) => string;
  placeholder?: string;
  showAllOption?: boolean;
  canEdit?: (deviceId: string) => boolean;
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredDevices = devices
    .filter(d => (d.name || d.id || "").toLowerCase().includes(searchTerm.toLowerCase()))
    // canEdit is still used for disabling if needed, but we filter out only truly restricted ones
    .filter(d => canEdit ? canEdit(d.id) : true)
    .sort((a, b) => {
      const statusA = (a.status || "Offline").toLowerCase();
      const statusB = (b.status || "Offline").toLowerCase();
      const isOnlineA = statusA === "online" || statusA === "recording" || statusA === "connected";
      const isOnlineB = statusB === "online" || statusB === "recording" || statusB === "connected";

      if (isOnlineA && !isOnlineB) return -1;
      if (!isOnlineA && isOnlineB) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  return (
    <div className="w-full">
      {loadingDevices ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Retrieving...
        </div>
      ) : (
        <Select value={value} onValueChange={(val) => {
          onValueChange(val);
          setSearchTerm(""); // Reset search on select
        }}>
          <SelectTrigger className="bg-white/50 border-slate-200/60 rounded-xl hover:bg-white transition-all shadow-sm">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className="max-h-[400px] rounded-2xl border-slate-100 shadow-2xl p-0 overflow-hidden">
            <div className="flex items-center px-3 pb-2 pt-2 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b mb-1">
              <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50 text-slate-500" />
              <input
                className="flex h-8 w-full rounded-md bg-transparent py-2 text-xs outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                placeholder="Search cameras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-1 text-slate-400 hover:text-slate-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchTerm("");
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
              {showAllOption && (
                <SelectItem value="all" className="rounded-lg focus:bg-blue-50 focus:text-blue-700 font-bold text-primary">
                  All Cameras
                </SelectItem>
              )}

              {filteredDevices.length > 0 ? (
                filteredDevices.map((device: any) => {
                  const status = (device.status || "Offline").toLowerCase();
                  const isOnline = status === "online" || status === "recording" || status === "connected";
                  const isOffline = !isOnline;
                  const isDisabled = canEdit ? !canEdit(device.id) : false;

                  return (
                    <SelectItem
                      key={`${device.systemId}-${device.id}`}
                      value={`${device.systemId}:${normalizeId(device.id)}`}
                      disabled={isOffline || isDisabled}
                      className={cn(
                        "rounded-lg transition-colors py-2.5",
                        (isOffline || isDisabled) ? "opacity-40 grayscale-[0.5] cursor-not-allowed bg-slate-50/50" : "focus:bg-blue-50 focus:text-blue-700 cursor-pointer"
                      )}
                    >
                      <div className="flex items-center justify-between w-full gap-3 pr-2">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[13px] truncate text-slate-700">{device.name || device.id}</span>
                          {device.systemName && (
                            <span className="text-[10px] text-slate-400 font-medium truncate">{device.systemName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Read Only badge removed as they are now filtered out */}
                          <div className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-slate-300"}`} />
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            isOnline ? "text-green-600" : "text-slate-400"
                          )}>
                            {device.status || "OFFLINE"}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })
              ) : (
                <div className="py-8 px-4 text-center">
                  <Camera className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No matching cameras</p>
                </div>
              )}
            </div>
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

const SearchableCameraMultiSelect = ({
  value,
  onValueChange,
  devices,
  loadingDevices,
  normalizeId,
  placeholder = "Select Cameras",
  canEdit
}: {
  value: string;
  onValueChange: (v: string) => void;
  devices: any[];
  loadingDevices: boolean;
  normalizeId: (id: any) => string;
  placeholder?: string;
  canEdit?: (deviceId: string) => boolean;
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedVals = value ? value.split(",") : [];

  const filteredDevices = devices
    .filter(d => (d.name || d.id || "").toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const statusA = (a.status || "Offline").toLowerCase();
      const statusB = (b.status || "Offline").toLowerCase();
      const isOnlineA = statusA === "online" || statusA === "recording" || statusA === "connected";
      const isOnlineB = statusB === "online" || statusB === "recording" || statusB === "connected";

      if (isOnlineA && !isOnlineB) return -1;
      if (!isOnlineA && isOnlineB) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  const selectedDevices = devices.filter(d => {
    const key = `${d.systemId}:${normalizeId(d.id)}`;
    return selectedVals.includes(key);
  });

  const getTriggerLabel = () => {
    if (selectedDevices.length === 0) return placeholder;
    if (selectedDevices.length <= 2) {
      return selectedDevices.map(d => d.name || d.id).join(", ");
    }
    return `${selectedDevices.length} Cameras Selected`;
  };

  const toggleDevice = (deviceKey: string) => {
    let nextVals: string[];
    if (selectedVals.includes(deviceKey)) {
      nextVals = selectedVals.filter(v => v !== deviceKey);
    } else {
      nextVals = [...selectedVals, deviceKey];
    }
    onValueChange(nextVals.join(","));
  };

  return (
    <div className="w-full space-y-2">
      <Label>Cameras</Label>
      {loadingDevices ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Retrieving...
        </div>
      ) : (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={isOpen}
              className="w-full h-10 justify-between bg-white/50 border-slate-200/60 rounded-xl hover:bg-white transition-all shadow-sm text-slate-700 font-medium px-3"
            >
              <div className="flex items-center gap-2 truncate text-slate-700">
                <Camera className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate text-xs font-bold text-slate-700">{getTriggerLabel()}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0 text-slate-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 rounded-2xl border-slate-100 shadow-2xl overflow-hidden" align="start" style={{ width: "var(--radix-popover-trigger-width)" }}>
            <div className="flex items-center px-3 pb-2 pt-2 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b mb-1">
              <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50 text-slate-500" />
              <input
                className="flex h-8 w-full bg-transparent py-2 text-xs outline-none placeholder:text-slate-400 font-medium"
                placeholder="Search cameras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-1 text-slate-400 hover:text-slate-600"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar space-y-0.5">
              {filteredDevices.length > 0 ? (
                filteredDevices.map((device: any) => {
                  const status = (device.status || "Offline").toLowerCase();
                  const isOnline = status === "online" || status === "recording" || status === "connected";
                  const isOffline = !isOnline;
                  const isDisabled = canEdit ? !canEdit(device.id) : false;
                  const key = `${device.systemId}:${normalizeId(device.id)}`;
                  const isSelected = selectedVals.includes(key);

                  return (
                    <div
                      key={key}
                      onClick={() => {
                        if (!isOffline && !isDisabled) {
                          toggleDevice(key);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-4 rounded-lg px-2.5 py-2 transition-colors",
                        (isOffline || isDisabled)
                          ? "opacity-40 grayscale-[0.5] cursor-not-allowed bg-slate-50/50"
                          : "hover:bg-blue-50/50 cursor-pointer"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isOffline || isDisabled}
                        onCheckedChange={() => toggleDevice(key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center justify-between flex-1 gap-3 min-w-0 pr-1">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[13px] truncate text-slate-700">{device.name || device.id}</span>
                          {device.systemName && (
                            <span className="text-[10px] text-slate-400 font-medium truncate">{device.systemName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-slate-300"}`} />
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            isOnline ? "text-green-600" : "text-slate-400"
                          )}>
                            {device.status || "OFFLINE"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 px-4 text-center">
                  <Camera className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No matching cameras</p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default function CloudRecordings() {
  // ---- Shared state ----
  const [systems, setSystems] = useState<CloudSystem[]>([]);
  const { user: localUser } = useAuth();
  const isUserAdmin = isAdmin(localUser);
  const [devices, setDevices] = useState<(CloudDevice & { systemId: string; systemName: string })[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>(() => {
    const envId = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_NX_SYSTEM_ID : '';
    const cookieId = Cookies.get("nx_system_id");
    return (cookieId || envId || "127.0.0.1").replace(/[{}]/g, "");
  });
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [localSystemName, setLocalSystemName] = useState<string>("");
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [devicesReady, setDevicesReady] = useState(false);
  const [requiresCloudAuth, setRequiresCloudAuth] = useState(false);
  const [globalError, setGlobalError] = useState<string>("");
  const [resultsViewMode, setResultsViewMode] = useState<'grid' | 'list'>('grid');
  const [scheduledViewMode, setScheduledViewMode] = useState<'cards' | 'table'>('table');
  const [mainTab, setMainTab] = useState("results");

  // ---- Search tab state ----
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("23:59");
  const [recordings, setRecordings] = useState<any[]>([]);
  const [searchedRange, setSearchedRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>("");

  // ---- Preview state ----
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<any>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewSnapshot, setPreviewSnapshot] = useState<{ url: string; title: string } | null>(null);

  // ---- Schedule state ----
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<"video" | "screenshot">("video");
  const [scheduleDates, setScheduleDates] = useState<Date[]>([]);
  const [scheduleTimeRanges, setScheduleTimeRanges] = useState<ScheduleTimeRange[]>([{ start: "09:00", end: "10:00" }]);
  const [scheduleDays, setScheduleDays] = useState<number[]>([]); // 0=Sun, 1=Mon...
  const [scheduleMonthDay, setScheduleMonthDay] = useState<number | "">("");
  const [scheduleScreenshotTime, setScheduleScreenshotTime] = useState<string>("12:00");
  const [scheduledRecordings, setScheduledRecordings] = useState<ScheduledRecording[]>([]);
  const [scheduleError, setScheduleError] = useState<string>("");
  const [scheduleSuccess, setScheduleSuccess] = useState<string>("");
  const [scheduleCamera, setScheduleCamera] = useState<string>("");
  const [scheduleSystem, setScheduleSystem] = useState<string>("");
  const [scheduleBatchId, setScheduleBatchId] = useState<string | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [pendingCancelIds, setPendingCancelIds] = useState<string[]>([]);
  const [pendingCancelForceDelete, setPendingCancelForceDelete] = useState(false);
  const [scheduledSearch, setScheduledSearch] = useState("");
  const [scheduleFrequencyTab, setScheduleFrequencyTab] = useState("weekly");
  const [selectedScheduledCameraId, setSelectedScheduledCameraId] = useState<string>("");
  const [selectedScheduledCameraRecentResults, setSelectedScheduledCameraRecentResults] = useState<RecentRecording[]>([]);
  const [loadingSelectedScheduledCameraResults, setLoadingSelectedScheduledCameraResults] = useState(false);
  const [showAllUpcomingRuns, setShowAllUpcomingRuns] = useState(false);
  const [errorsSearch, setErrorsSearch] = useState("");
  const [isLoadingErrorLogs, setIsLoadingErrorLogs] = useState(false);
  const [errorLogCameras, setErrorLogCameras] = useState<
    Array<{ cameraId: string; cameraName: string; systemId: string; count: number }>
  >([]);
  const [errorLogEntries, setErrorLogEntries] = useState<ScheduledErrorLogEntry[]>([]);
  const errorLogSyncDoneRef = useRef<Set<string>>(new Set());
  const errorLogLoadGenRef = useRef(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedScheduleKeys, setExpandedScheduleKeys] = useState<Set<string>>(new Set());
  // ---- Enrichment state for permissions and VMS identity ----
  const [vmsEnrichedUser, setVmsEnrichedUser] = useState<UserPublic | null>(null);
  const [serverScheduleAdmin, setServerScheduleAdmin] = useState(false);

  // Caching and Race Condition Prevention
  const recordingsCache = useRef<Map<string, RecentRecording[]>>(new Map());
  const activeAbortController = useRef<AbortController | null>(null);
  const lastRequestTime = useRef<number>(0);

  const selectedDeviceRef = useRef(selectedDevice);
  const dateRef = useRef(date);

  const normalizeId = (v: unknown) => String(v || "").replace(/[{}]/g, "").toLowerCase();

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  // Sync enriched user with localUser and fetch rights if needed
  useEffect(() => {
    if (!localUser) {
      setVmsEnrichedUser(null);
      return;
    }

    // Initialize with localUser data. 
    // Immediate admin fallback for 'admin' account to avoid flashing restricted UI.
    const initialRole = (localUser.username?.toLowerCase() === 'admin' || isAdmin(localUser)) ? "admin" : "operator";
    setVmsEnrichedUser({ ...localUser, username: localUser.username || "Verifying...", role: initialRole });

    // If we're in Electron/NX context, try to fetch the latest resource rights and username from the VMS
    // Fetch VMS permissions and identity using the dedicated endpoint
    const fetchUserRights = async () => {
      try {
        // Fetch both session info (identity) and permissions in parallel
        const [sessionInfo, vmsPerms] = await Promise.all([
          nxAPI.getCurrentSession(),
          nxAPI.getUserPermissions()
        ]);

        if (sessionInfo || vmsPerms) {
          const vmsUsername = sessionInfo?.username;
          if (vmsUsername) {
            console.log(`[CloudRecordings] Resolved VMS identity: ${vmsUsername}`);
          }

          const perms = vmsPerms?.permissions?.toLowerCase() || "";
          const isPowerOrAdmin = perms.includes("administrator") || perms.includes("poweruser");

          setVmsEnrichedUser(prev => prev ? ({
            ...prev,
            username: vmsUsername || prev.username, // Prioritize VMS username for task attribution
            vmsPermissions: vmsPerms?.permissions || "none",
            vmsResourceAccessRights: vmsPerms?.resourceAccessRights || {},
            role: isPowerOrAdmin ? "admin" : "operator"
          } as UserPublic) : null);
        } else {
          console.warn("[CloudRecordings] VMS identity/permission fetch returned no data.");
        }
      } catch (err) {
        console.warn("[CloudRecordings] Failed to fetch VMS identity/permissions:", err);
      }
    };

    fetchUserRights();
  }, [localUser]);

  const effectiveUser = vmsEnrichedUser || localUser;

  const resolveScheduleOwnerUsername = useCallback((): string | null => {
    const u = effectiveUser?.username?.trim();
    if (!u || u === "Verifying..." || u === "System") return null;
    return u;
  }, [effectiveUser?.username]);

  const isEffectiveAdmin = React.useMemo(() => {
    if (serverScheduleAdmin) return true;
    if (!vmsEnrichedUser || vmsEnrichedUser.username === "Verifying...") return false;
    return isVmsAdmin(vmsEnrichedUser);
  }, [vmsEnrichedUser, serverScheduleAdmin]);

  // VMS /rest/v3/devices already returns only cameras this user can access
  const accessibleDeviceIds = React.useMemo(
    () => new Set(devices.map((d) => normalizeId(d.id))),
    [devices],
  );

  const visibleDevices = React.useMemo(() => {
    if (!effectiveUser) return [];
    if (isEffectiveAdmin) return devices;
    return devices.filter((d) => hasCameraViewPermission(effectiveUser, d.id, accessibleDeviceIds));
  }, [devices, effectiveUser, isEffectiveAdmin, accessibleDeviceIds]);

  // Match server visibility: all schedules on cameras this user can view (any creator).
  const visibleScheduledRecordings = React.useMemo(() => {
    if (!effectiveUser) return [];
    if (isEffectiveAdmin) return scheduledRecordings;
    return scheduledRecordings.filter((rec) =>
      canViewSchedule(effectiveUser, rec, accessibleDeviceIds),
    );
  }, [scheduledRecordings, effectiveUser, isEffectiveAdmin, accessibleDeviceIds]);

  const visibleScheduledRecordingsRef = useRef(visibleScheduledRecordings);
  visibleScheduledRecordingsRef.current = visibleScheduledRecordings;


  const formatDayRanges = useCallback((days: number[], dayNames: string[]) => {
    if (days.length === 7) return "Daily";
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return "Mon-Fri";

    const sorted = [...days].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (currentGroup.length === 0) {
        currentGroup.push(sorted[i]);
      } else if (sorted[i] === currentGroup[currentGroup.length - 1] + 1) {
        currentGroup.push(sorted[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [sorted[i]];
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    const formattedGroups = groups.map(g => {
      if (g.length === 1) return dayNames[g[0]];
      if (g.length === 2) return `${dayNames[g[0]]}, ${dayNames[g[1]]}`;
      return `${dayNames[g[0]]}–${dayNames[g[g.length - 1]]}`;
    });

    return `Weekly on ${formattedGroups.join(", ")}`;
  }, []);

  const getRecurrenceText = useCallback((group: any) => {
    if (group.recurrence === "none") {
      const dates = Array.from(new Set(group.records.map((r: any) => format(new Date(r.date), "MMM d"))));
      return `One-time: ${dates.join(", ")}`;
    }
    if (group.recurrence === "monthday") {
      return `Monthly on Day ${group.recurrenceDay || group.monthDay}`;
    }
    if (group.recurrence === "weekday") {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = Array.from(new Set(group.records.map((r: any) => new Date(r.date).getDay()))).sort() as number[];
      return formatDayRanges(days, dayNames);
    }
    return "One-time";
  }, [formatDayRanges]);

  const getConflictingGroupKeys = useCallback((thisGroup: any, allGroups: any[]) => {
    if (thisGroup.type !== "video") return [];
    const conflicts = new Set<string>();

    for (const otherGroup of allGroups) {
      if (otherGroup.key === thisGroup.key || otherGroup.type !== "video") continue;

      for (const r1 of thisGroup.records) {
        for (const r2 of otherGroup.records) {
          let sameDay = false;
          const d1 = new Date(r1.date);
          const d2 = new Date(r2.date);

          if (r1.recurrence === "none" && r2.recurrence === "none") {
            sameDay = d1.toDateString() === d2.toDateString();
          } else if (r1.recurrence === "weekday" && r2.recurrence === "weekday") {
            sameDay = d1.getDay() === d2.getDay();
          } else if (r1.recurrence === "monthday" && r2.recurrence === "monthday") {
            sameDay = Number(r1.recurrenceDay || d1.getDate()) === Number(r2.recurrenceDay || d2.getDate());
          } else {
            // Mixed recurrence types:
            // 1. One-time (none) vs Weekday
            if ((r1.recurrence === "none" && r2.recurrence === "weekday") || 
                (r1.recurrence === "weekday" && r2.recurrence === "none")) {
              sameDay = d1.getDay() === d2.getDay();
            }
            // 2. One-time (none) vs Monthday
            else if ((r1.recurrence === "none" && r2.recurrence === "monthday") || 
                     (r1.recurrence === "monthday" && r2.recurrence === "none")) {
              sameDay = d1.getDate() === d2.getDate();
            }
            // 3. Weekday vs Monthday
            else if ((r1.recurrence === "weekday" && r2.recurrence === "monthday") || 
                     (r1.recurrence === "monthday" && r2.recurrence === "weekday")) {
              sameDay = true;
            }
          }

          if (sameDay) {
            const [sh1, sm1] = r1.startTime.split(":").map(Number);
            const [eh1, em1] = r1.endTime.split(":").map(Number);
            const [sh2, sm2] = r2.startTime.split(":").map(Number);
            const [eh2, em2] = r2.endTime.split(":").map(Number);

            const start1 = sh1 * 60 + sm1;
            const end1 = eh1 * 60 + em1;
            const start2 = sh2 * 60 + sm2;
            const end2 = eh2 * 60 + em2;

            if (start1 < end2 && start2 < end1) {
              conflicts.add(otherGroup.key);
            }
          }
        }
      }
    }
    return Array.from(conflicts);
  }, []);

  const isScheduleInactive = useCallback((rec: ScheduledRecording, allSchedules: ScheduledRecording[]) => {
    if (rec.inactive) return true;
    if (rec.type !== "video") return false;

    const thisGroupKey = rec.recurrence === "weekday"
      ? `${rec.type}-weekday-${rec.startTime}-${rec.endTime || ''}`
      : (rec.recurrence === "none"
         ? (rec.batchId || `${rec.type}-none-${rec.date}-${rec.startTime}-${rec.endTime || ''}`)
         : `${rec.type}-${rec.recurrence}-${rec.recurrenceDay || ''}-${rec.startTime}-${rec.endTime || ''}`);

    const isExplicitlyActive = allSchedules.some(r => {
      const otherGroupKey = r.recurrence === "weekday"
        ? `${r.type}-weekday-${r.startTime}-${r.endTime || ''}`
        : (r.recurrence === "none"
           ? (r.batchId || `${r.type}-none-${r.date}-${r.startTime}-${r.endTime || ''}`)
           : `${r.type}-${r.recurrence}-${r.recurrenceDay || ''}-${r.startTime}-${r.endTime || ''}`);
      return otherGroupKey === thisGroupKey && r.isExplicitlyActive === true;
    });

    if (isExplicitlyActive) return false;

    const hasConflict = allSchedules.some(r => {
      if (r.id === rec.id || r.cameraId !== rec.cameraId || r.type !== "video") return false;

      const otherGroupKey = r.recurrence === "weekday"
        ? `${r.type}-weekday-${r.startTime}-${r.endTime || ''}`
        : (r.recurrence === "none"
           ? (r.batchId || `${r.type}-none-${r.date}-${r.startTime}-${r.endTime || ''}`)
           : `${r.type}-${r.recurrence}-${r.recurrenceDay || ''}-${r.startTime}-${r.endTime || ''}`);

      if (otherGroupKey === thisGroupKey) return false;

      let sameDay = false;
      const d1 = new Date(rec.date);
      const d2 = new Date(r.date);

      if (rec.recurrence === "none" && r.recurrence === "none") {
        sameDay = d1.toDateString() === d2.toDateString();
      } else if (rec.recurrence === "weekday" && r.recurrence === "weekday") {
        sameDay = d1.getDay() === d2.getDay();
      } else if (rec.recurrence === "monthday" && r.recurrence === "monthday") {
        sameDay = Number(rec.recurrenceDay || d1.getDate()) === Number(r.recurrenceDay || d2.getDate());
      } else {
        if ((rec.recurrence === "none" && r.recurrence === "weekday") || 
            (rec.recurrence === "weekday" && r.recurrence === "none")) {
          sameDay = d1.getDay() === d2.getDay();
        } else if ((rec.recurrence === "none" && r.recurrence === "monthday") || 
                 (rec.recurrence === "monthday" && r.recurrence === "none")) {
          sameDay = d1.getDate() === d2.getDate();
        } else if ((rec.recurrence === "weekday" && r.recurrence === "monthday") || 
                 (rec.recurrence === "monthday" && r.recurrence === "weekday")) {
          sameDay = true;
        }
      }

      if (sameDay) {
        const [sh1, sm1] = rec.startTime.split(":").map(Number);
        const [eh1, em1] = rec.endTime.split(":").map(Number);
        const [sh2, sm2] = r.startTime.split(":").map(Number);
        const [eh2, em2] = r.endTime.split(":").map(Number);

        const start1 = sh1 * 60 + sm1;
        const end1 = eh1 * 60 + em1;
        const start2 = sh2 * 60 + sm2;
        const end2 = eh2 * 60 + em2;

        if (start1 < end2 && start2 < end1) {
          return true;
        }
      }
      return false;
    });

    return hasConflict;
  }, []);

  const formatNextRunDate = useCallback((runDate: Date) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const formatTime = (d: Date) =>
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    if (runDate.toDateString() === today.toDateString()) {
      return `Today ${formatTime(runDate)}`;
    }
    if (runDate.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow ${formatTime(runDate)}`;
    }
    return `${runDate.toLocaleDateString([], { month: "short", day: "numeric" })} ${formatTime(runDate)}`;
  }, []);

  const getCameraRunningSchedule = useCallback(
    (schedules: ScheduledRecording[]) => {
      for (const rec of schedules) {
        if (isScheduleRunningNow(rec, isScheduleInactive(rec, schedules))) {
          return rec;
        }
      }
      return null;
    },
    [isScheduleInactive],
  );

  const getNextRunTime = useCallback(
    (schedules: ScheduledRecording[]) => {
      let minNextRun: Date | null = null;
      const now = new Date();

      schedules.forEach((rec) => {
        if (isScheduleInactive(rec, schedules)) return;
        try {
          const [sh, sm] = rec.startTime.split(":").map(Number);
          const nextOcc = calculateNextOccurrence(rec, sh, sm, 0);
          if (nextOcc && nextOcc > now) {
            if (!minNextRun || nextOcc < minNextRun) {
              minNextRun = nextOcc;
            }
          }
        } catch (e) {
          console.warn("Error calculating next run time:", e);
        }
      });

      if (!minNextRun) return "No upcoming runs";
      return formatNextRunDate(minNextRun);
    },
    [formatNextRunDate, isScheduleInactive],
  );

  const getCameraMinNextRun = useCallback((schedules: ScheduledRecording[]) => {
    let minNextRun: Date | null = null;
    const now = new Date();

    schedules.forEach(rec => {
      if (isScheduleInactive(rec, schedules)) return;

      try {
        const [sh, sm] = rec.startTime.split(":").map(Number);
        const nextOcc = calculateNextOccurrence(rec, sh, sm, 0);
        if (nextOcc && nextOcc > now) {
          if (!minNextRun || nextOcc < minNextRun) {
            minNextRun = nextOcc;
          }
        }
      } catch (e) {
        console.warn(e);
      }
    });

    return minNextRun;
  }, [isScheduleInactive]);

  const schedulesByCamera = React.useMemo(() => {
    const map: Record<string, { cameraId: string; cameraName: string; systemId: string; schedules: ScheduledRecording[] }> = {};
    
    // Initialize with all devices to ensure all cameras show up on the schedule list
    devices.forEach(dev => {
      const key = normalizeId(dev.id);
      map[key] = {
        cameraId: key,
        cameraName: dev.name,
        systemId: dev.systemId,
        schedules: []
      };
    });

    visibleScheduledRecordings.forEach(rec => {
      const key = normalizeId(rec.cameraId);
      if (!map[key]) {
        map[key] = {
          cameraId: key,
          cameraName: rec.cameraName,
          systemId: rec.systemId,
          schedules: []
        };
      }
      map[key].schedules.push(rec);
    });

    const list = Object.values(map);

    // Sort by:
    // 1. Having active schedules first, sorted by next run time ascending.
    // 2. Then cameras with no active schedules, sorted alphabetically by name.
    return list.sort((a, b) => {
      const hasSchedA = a.schedules.length > 0;
      const hasSchedB = b.schedules.length > 0;
      
      if (hasSchedA && !hasSchedB) return -1;
      if (!hasSchedA && hasSchedB) return 1;

      if (hasSchedA && hasSchedB) {
        const nextA = getCameraMinNextRun(a.schedules);
        const nextB = getCameraMinNextRun(b.schedules);

        if (!nextA && !nextB) return (a.cameraName || "").localeCompare(b.cameraName || "");
        if (!nextA) return 1;
        if (!nextB) return -1;
        return (nextA as Date).getTime() - (nextB as Date).getTime();
      }

      return (a.cameraName || "").localeCompare(b.cameraName || "");
    });
  }, [devices, visibleScheduledRecordings, getCameraMinNextRun]);

  // Set default selection when schedules load or change
  useEffect(() => {
    if (schedulesByCamera.length > 0 && !selectedScheduledCameraId) {
      setSelectedScheduledCameraId(normalizeId(schedulesByCamera[0].cameraId));
    }
  }, [schedulesByCamera, selectedScheduledCameraId]);

  const getGroupNextRun = useCallback((records: ScheduledRecording[]) => {
    let minNextRun: Date | null = null;
    const now = new Date();
    records.forEach(rec => {
      try {
        const [sh, sm] = rec.startTime.split(":").map(Number);
        const nextOcc = calculateNextOccurrence(rec, sh, sm, 0);
        if (nextOcc && nextOcc > now) {
          if (!minNextRun || nextOcc < minNextRun) {
            minNextRun = nextOcc;
          }
        }
      } catch (e) {
        console.warn(e);
      }
    });
    return minNextRun;
  }, []);

  type UpcomingRunItem = {
    id: string;
    date: Date;
    startTime: string;
    type: string;
    isRunningNow: boolean;
    label?: string;
  };

  const upcomingRunsForSelectedCamera = React.useMemo((): UpcomingRunItem[] => {
    if (!selectedScheduledCameraId) return [];
    const cameraData = schedulesByCamera.find(c => c.cameraId === selectedScheduledCameraId);
    if (!cameraData) return [];

    const now = new Date();
    const items: UpcomingRunItem[] = [];

    cameraData.schedules.forEach(rec => {
      const isGroupInactive = isScheduleInactive(rec, cameraData.schedules);
      if (isGroupInactive) return;

      if (isScheduleRunningNow(rec, isGroupInactive)) {
        const [sh, sm] = rec.startTime.split(":").map(Number);
        const occDate = new Date(rec.date);
        occDate.setHours(sh, sm, 0, 0);
        items.push({
          id: `running-${rec.id}`,
          date: occDate,
          startTime: rec.startTime,
          type: rec.type,
          isRunningNow: true,
          label: getRunningNowLabel(rec),
        });
        return;
      }

      try {
        const [sh, sm] = rec.startTime.split(":").map(Number);
        const nextOcc = calculateNextOccurrence(rec, sh, sm, 0);
        if (nextOcc && nextOcc > now) {
          items.push({
            id: `future-${rec.id}-${nextOcc.getTime()}`,
            date: nextOcc,
            startTime: rec.startTime,
            type: rec.type,
            isRunningNow: false,
          });
        }
      } catch (e) {
        console.warn(e);
      }
    });

    return items.sort((a, b) => {
      if (a.isRunningNow !== b.isRunningNow) return a.isRunningNow ? -1 : 1;
      return a.date.getTime() - b.date.getTime();
    });
  }, [selectedScheduledCameraId, schedulesByCamera, isScheduleInactive]);

  const formatUpcomingTime = (d: Date) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (d.toDateString() === today.toDateString()) {
      return `Today ${timeStr}`;
    } else if (d.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow ${timeStr}`;
    } else {
      const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        return `${format(d, "EEE")} ${timeStr}`;
      }
      return `${format(d, "EEE MMM d")} ${timeStr}`;
    }
  };

  const UPCOMING_RUNS_PREVIEW = 4;

  const errorLogsForSelectedCamera = React.useMemo(() => {
    if (!selectedScheduledCameraId) return [];
    const key = normalizeId(selectedScheduledCameraId);
    return errorLogEntries.filter((entry) => normalizeId(entry.cameraId) === key);
  }, [selectedScheduledCameraId, errorLogEntries]);

  const totalErrorLogCount = React.useMemo(
    () => errorLogEntries.length || errorLogCameras.reduce((sum, cam) => sum + cam.count, 0),
    [errorLogEntries.length, errorLogCameras],
  );

  const filteredErrorLogEntries = React.useMemo(() => {
    const q = errorsSearch.trim().toLowerCase();
    const entries = !q
      ? errorLogEntries
      : errorLogEntries.filter(
          (entry) =>
            entry.cameraName.toLowerCase().includes(q) ||
            entry.message.toLowerCase().includes(q),
        );
    return [...entries].sort((a, b) => {
      const aMs = parseRecordingLogTimestamp(a.timestamp) || a.createdAtMs || 0;
      const bMs = parseRecordingLogTimestamp(b.timestamp) || b.createdAtMs || 0;
      return bMs - aMs;
    });
  }, [errorLogEntries, errorsSearch]);

  const renderUpcomingRunRow = (run: UpcomingRunItem, compact: boolean) => (
    <div
      key={run.id}
      className={cn(
        "flex items-center justify-between rounded-xl border transition-colors",
        compact ? "p-2.5 text-xs" : "p-3 text-sm",
        run.isRunningNow
          ? "border-green-200 bg-green-50/60 hover:bg-green-50/80"
          : "border-slate-100 bg-slate-50/50 hover:bg-slate-50",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "font-semibold shrink-0",
            run.isRunningNow ? "text-green-700 animate-pulse" : "text-slate-700",
          )}
        >
          {run.isRunningNow && run.label ? run.label : formatUpcomingTime(run.date)}
        </span>
        <span className="text-slate-500 font-medium truncate">
          {run.type === "screenshot" ? "(Snapshot)" : "(Video)"}
        </span>
      </div>
    </div>
  );

  const refreshErrorLogs = useCallback(async (options?: { silent?: boolean }) => {
    const requestGen = ++errorLogLoadGenRef.current;
    if (!options?.silent) setIsLoadingErrorLogs(true);

    try {
      let res = await fetch("/api/cloud/recordings/scheduled/error-logs?all=true");
      let existingEntries: Array<{
        id: string;
        cameraId: string;
        cameraName: string;
        message: string;
      }> = res.ok ? (await res.json()).entries || [] : [];

      const failedSchedules = visibleScheduledRecordingsRef.current.filter(
        (s) => s.status === "failed",
      );
      for (const s of failedSchedules) {
        const key = normalizeId(s.cameraId);
        const failMsg = `Scheduled ${s.type === "screenshot" ? "snapshot" : "video"} at ${s.startTime} failed`;
        const alreadyLogged = existingEntries.some(
          (e) => normalizeId(e.cameraId) === key && e.message === failMsg,
        );
        if (alreadyLogged) continue;
        await fetch("/api/cloud/recordings/scheduled/error-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cameraId: key,
            cameraName: s.cameraName,
            systemId: s.systemId,
            message: failMsg,
          }),
        });
      }

      const camerasRes = await fetch("/api/cloud/recordings/scheduled/error-logs");
      let cameras: Array<{ cameraId: string; cameraName: string; systemId: string; count: number }> = [];
      if (camerasRes.ok) {
        const camerasData = await camerasRes.json();
        cameras = (camerasData.cameras || []).map(
          (cam: { cameraId: string; cameraName: string; systemId: string; count: number }) => ({
            ...cam,
            cameraId: normalizeId(cam.cameraId),
          }),
        );
        if (requestGen === errorLogLoadGenRef.current) {
          setErrorLogCameras(cameras);
        }
      }

      const camerasToSync = new Map<string, string>();
      for (const cam of cameras) {
        camerasToSync.set(normalizeId(cam.cameraId), cam.cameraName);
      }
      for (const s of failedSchedules) {
        const key = normalizeId(s.cameraId);
        if (!camerasToSync.has(key)) {
          camerasToSync.set(key, s.cameraName);
        }
      }

      for (const [key, cameraName] of camerasToSync) {
        if (errorLogSyncDoneRef.current.has(key)) continue;
        await fetch(
          `/api/cloud/recordings/scheduled/error-logs?${new URLSearchParams({
            cameraId: key,
            cameraName,
            syncAudit: "true",
          })}`,
        );
        errorLogSyncDoneRef.current.add(key);
      }

      res = await fetch("/api/cloud/recordings/scheduled/error-logs?all=true");
      if (requestGen !== errorLogLoadGenRef.current) return;

      const data = res.ok ? await res.json() : { entries: [] };
      const finalEntries = data.entries || [];
      setErrorLogEntries((prev) => {
        const prevKey = prev.map((e) => `${e.id}:${e.timestamp}:${e.message}`).join("|");
        const nextKey = finalEntries
          .map((e: { id: string; timestamp: string; message: string }) =>
            `${e.id}:${e.timestamp}:${e.message}`,
          )
          .join("|");
        return prevKey === nextKey ? prev : finalEntries;
      });
    } catch (e) {
      console.warn("[CloudRecordings] Failed to load error logs:", e);
    } finally {
      if (!options?.silent && errorLogLoadGenRef.current === requestGen) {
        setIsLoadingErrorLogs(false);
      }
    }
  }, []);

  const dismissErrorLogEntry = useCallback(
    async (entryId: string) => {
      setErrorLogEntries((prev) => prev.filter((e) => e.id !== entryId));
      try {
        const res = await fetch(
          `/api/cloud/recordings/scheduled/error-logs?entryId=${encodeURIComponent(entryId)}`,
          { method: "DELETE" },
        );
        const data = res.ok ? await res.json() : { success: false };
        if (!data.success) {
          await refreshErrorLogs({ silent: true });
          return;
        }
        await refreshErrorLogs({ silent: true });
      } catch {
        await refreshErrorLogs({ silent: true });
      }
    },
    [refreshErrorLogs],
  );

  const dismissAllErrorLogs = useCallback(async () => {
    setErrorLogEntries([]);
    setErrorLogCameras([]);
    try {
      const res = await fetch("/api/cloud/recordings/scheduled/error-logs?all=true", {
        method: "DELETE",
      });
      if (!res.ok) {
        await refreshErrorLogs({ silent: true });
        return;
      }
      errorLogSyncDoneRef.current.clear();
      await refreshErrorLogs({ silent: true });
    } catch {
      await refreshErrorLogs({ silent: true });
    }
  }, [refreshErrorLogs]);

  useEffect(() => {
    void refreshErrorLogs();
    const intervalId = setInterval(() => void refreshErrorLogs({ silent: true }), 15000);
    return () => clearInterval(intervalId);
  }, [refreshErrorLogs]);

  const selectedCameraName = React.useMemo(() => {
    if (!selectedScheduledCameraId) return undefined;
    const key = normalizeId(selectedScheduledCameraId);
    const cam = schedulesByCamera.find((c) => c.cameraId === key);
    return cam?.cameraName;
  }, [selectedScheduledCameraId, schedulesByCamera]);

  const groupedSchedulesForSelectedCamera = React.useMemo(() => {
    if (!selectedScheduledCameraId) return [];
    const cameraData = schedulesByCamera.find(c => c.cameraId === selectedScheduledCameraId);
    if (!cameraData) return [];

    const groups: Record<string, {
      key: string;
      type: "video" | "screenshot";
      recurrence: "none" | "weekday" | "monthday";
      recurrenceDay?: number;
      batchId?: string;
      scheduledBy?: string;
      records: ScheduledRecording[];
    }> = {};

    cameraData.schedules.forEach(rec => {
      const key = rec.recurrence === "weekday"
        ? `${rec.type}-weekday-${rec.startTime}-${rec.endTime || ''}`
        : (rec.recurrence === "none"
           ? (rec.batchId || `${rec.type}-none-${rec.date}-${rec.startTime}-${rec.endTime || ''}`)
           : `${rec.type}-${rec.recurrence}-${rec.recurrenceDay || ''}-${rec.startTime}-${rec.endTime || ''}`);

      if (!groups[key]) {
        groups[key] = {
          key,
          type: rec.type,
          recurrence: rec.recurrence || "none",
          recurrenceDay: rec.recurrenceDay,
          batchId: rec.batchId,
          scheduledBy: rec.scheduledBy,
          records: []
        };
      }
      groups[key].records.push(rec);
    });

    return Object.values(groups);
  }, [selectedScheduledCameraId, schedulesByCamera]);

  // ---- Settings state ----
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [storagePath, setStoragePath] = useState("");
  const [videoStoragePath, setVideoStoragePath] = useState("");

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetScheduleForm();
    }
    setIsScheduleOpen(open);
  };

  const resetScheduleForm = () => {
    setScheduleCamera("");
    setScheduleSystem("");
    setScheduleDates([]);
    setScheduleDays([]);
    setScheduleMonthDay("");
    setScheduleTimeRanges([{ start: "09:00", end: "10:00" }]);
    setScheduleScreenshotTime("12:00");
    setScheduleType("video");
    setScheduleFrequencyTab("weekly");
    setScheduleError("");
    setScheduleSuccess("");
    setScheduleBatchId(null);
  };

  const requestCancel = (ids: string | string[], forceDelete: boolean = false) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (idArray.length === 0) return;
    setPendingCancelIds(idArray);
    setPendingCancelForceDelete(forceDelete);
    setIsCancelConfirmOpen(true);
  };

  const confirmCancelAction = async () => {
    // Record action time to prevent polling race condition
    lastActionTime.current = Date.now();

    const idsToCancel = pendingCancelIds.filter((id) => {
      const rec = scheduledRecordings.find((r) => r.id === id);
      return rec && canManageSchedule(effectiveUser, rec);
    });

    setIsCancelConfirmOpen(false);
    setPendingCancelIds([]);

    if (idsToCancel.length === 0) {
      setPendingCancelForceDelete(false);
      return;
    }

    // To avoid multiple rapid state updates and saves, we process VMS stops first 
    // and then perform a single state update at the end.
    for (const id of idsToCancel) {
      const rec = scheduledRecordings.find(r => r.id === id);
      if (rec && rec.status === "recording") {
        try {
          const cameraDeviceId = getOriginalDeviceId(rec.cameraId);
          await nxAPI.updateDevice(cameraDeviceId, {
            schedule: { isEnabled: false }
          });
          console.log(`[CloudRecordings] Recording stopped on VMS for ${rec.cameraName}`);
        } catch (err) {
          console.error("[CloudRecordings] Failed to stop recording on VMS:", err);
        }
      }
    }

    // Now update state ONCE for the entire batch
    setScheduledRecordings(prev => {
      const toRemove = new Set(idsToCancel);
      const next = prev.filter(r => !toRemove.has(r.id));
      saveToPersistence(next, originalSchedules.current);
      return next;
    });

    setPendingCancelForceDelete(false);
  };

  const scheduleTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const originalSchedules = useRef<Map<string, any>>(new Map());
  const scheduledRecordingsRef = useRef(scheduledRecordings);
  scheduledRecordingsRef.current = scheduledRecordings;
  const hasLoadedFromDisk = useRef(false);
  const lastActionTime = useRef(0);
  const executingScreenshotIds = useRef<Set<string>>(new Set());
  const refreshScheduleAndResultsRef = useRef<() => void>(() => { });
  const runScheduledScreenshotCaptureRef = useRef<
    (rec: ScheduledRecording) => Promise<void>
  >(async () => { });

  // ---- Persistence Logic ----
  const saveToPersistence = async (scheds: ScheduledRecording[], originals: any) => {
    try {
      // Capture the VMS location to store it in the data file for the watchdog
      const nxLocationIp = Cookies.get("nx_location_ip") || (typeof window !== 'undefined' ? (window as any).electronConfig?.NEXT_PUBLIC_NX_SERVER_HOST : undefined);
      const nxLocationPort = Cookies.get("nx_location_port") || (typeof window !== 'undefined' ? (window as any).electronConfig?.NEXT_PUBLIC_NX_SERVER_PORT : undefined);

      await fetch("/api/cloud/recordings/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: scheds,
          originalSchedules: Object.fromEntries(originals),
          nxLocationIp,
          nxLocationPort
        }),
      });
    } catch (e) { console.error("[Persistence] Save failed:", e); }
  };

  const loadFromPersistence = async (force: boolean = false) => {
    // RACE CONDITION PREVENTION:
    // If we recently performed an action (save/delete), skip polling for 5 seconds
    // to give the server time to finish writing the file and for the next poll to get fresh data.
    if (!force && (Date.now() - lastActionTime.current < 5000)) return;

    try {
      const res = await fetch("/api/cloud/recordings/scheduled");
      if (res.ok) {
        const data = await res.json();
        if (data.originalSchedules) {
          Object.entries(data.originalSchedules).forEach(([id, sched]) => {
            originalSchedules.current.set(id, sched);
          });
        }
        if (data.schedules) {
          const rawLoadedScheds = data.schedules.map((s: any) => ({
            ...s,
            date: new Date(s.date)
          }));

          const staleReconcile = reconcileStaleActiveSchedules(rawLoadedScheds);
          const reconciledScheds = staleReconcile.schedules;
          if (staleReconcile.changed) {
            console.log("[Persistence] Reconciled stale in-progress schedules");
            void saveToPersistence(reconciledScheds, originalSchedules.current);
          }

          // Automatically clean up non-recurring schedules whose date/time has passed
          const loadedScheds = reconciledScheds.filter((rec: ScheduledRecording) => {
            const isRecurring = rec.recurrence && rec.recurrence !== "none";
            if (isRecurring) return true;

            if (rec.status === "failed") return true;
            if (rec.status === "pending") return true;

            // Keep it if it is currently active or in progress, unless it's very old
            if (rec.status === "recording" || rec.status === "processing" || rec.status === "in progress" || rec.status === "capturing") {
              return true;
            }

            try {
              const [sh, sm] = rec.startTime.split(":").map(Number);
              const targetDate = new Date(rec.date);
              if (rec.type === "screenshot") {
                const startMs = targetDate.setHours(sh, sm, 59, 999);
                return Date.now() < startMs;
              } else {
                const [eh, em] = rec.endTime.split(":").map(Number);
                const endMs = targetDate.setHours(eh, em, 59, 999);
                return Date.now() < endMs;
              }
            } catch (e) {
              return false; // delete malformed
            }
          });

          if (loadedScheds.length !== reconciledScheds.length) {
            console.log("[Persistence] Filtered expired one-time schedules from view:", reconciledScheds.length - loadedScheds.length);
          }

          // Detect transitions from active (recording/processing) to completed/inactive states
          let hasNewCompleted = false;
          scheduledRecordings.forEach((existing: any) => {
            const wasActive = existing.status === "recording" || existing.status === "processing" || existing.status === "in progress" || existing.status === "capturing";
            if (wasActive) {
              const updated = loadedScheds.find((s: any) => s.id === existing.id);
              if (!updated) {
                // Task is gone -> completed and deleted
                hasNewCompleted = true;
              } else if (updated.status === "pending" || updated.status === "completed" || updated.status === "failed") {
                // Task status changed to inactive/pending -> completed
                hasNewCompleted = true;
              }
            }
          });

          // BREAK INFINITE LOOP: Only update state if data actually changed
          // Include 'record' flag in comparison so UI updates when watchdog processes tasks
          const currentFingerprint = scheduledRecordings.map(s => `${s.id}:${s.status}:${(s as any).record || false}`).sort().join(",");
          const loadedFingerprint = loadedScheds.map((s: any) => `${s.id}:${s.status}:${s.record || false}`).sort().join(",");

          if (currentFingerprint !== loadedFingerprint) {
            // Store full list in state — permission filtering is done at render time
            // via visibleScheduledRecordings useMemo (avoids stale closure issues)
            setScheduledRecordings(loadedScheds);
            // Re-reconcile timers
            // Re-reconcile timers for active tasks
            loadedScheds.forEach((rec: ScheduledRecording) => {
              if (
                rec.status === "pending" ||
                rec.status === "recording" ||
                rec.status === "in progress" ||
                rec.status === "capturing" ||
                rec.status === "processing"
              ) {
                reconcileTimer(rec, loadedScheds);
              }
            });

            if (hasNewCompleted) {
              console.log("[Persistence] Scheduled task completed! Auto-refreshing recent recordings...");
              setTimeout(() => {
                handleSearchRecentRecordings(selectedDeviceRef.current, dateRef.current, undefined, false, true);
              }, 2000); // 2 second delay to allow files to finish writing and index
            }
          }
        }
        if (typeof data.isAdmin === "boolean") {
          setServerScheduleAdmin(data.isAdmin);
        }
        if (data.vmsUsername || data.resourceAccessRights) {
          setVmsEnrichedUser(prev => prev ? ({
            ...prev,
            username: data.vmsUsername || prev.username,
            vmsResourceAccessRights: {
              ...(prev.vmsResourceAccessRights || {}),
              ...(data.resourceAccessRights || {}),
            },
          } as UserPublic) : null);
        }
        // Mark as loaded so saveToPersistence knows it's safe to write
        hasLoadedFromDisk.current = true;
      }
    } catch (e) { console.error("[Persistence] Load failed:", e); }
  };

  const markScheduleRecordingFailed = useCallback(
    async (rec: ScheduledRecording, reason: string) => {
      const camKey = normalizeId(rec.cameraId);
      lastActionTime.current = Date.now();
      setScheduledRecordings((prev) => {
        const current = prev.find((r) => r.id === rec.id);
        if (!current || current.status === "failed") return prev;
        const next = prev.map((r) =>
          r.id === rec.id ? { ...r, status: "failed" as const, record: false } : r,
        );
        void saveToPersistence(next, originalSchedules.current);
        return next;
      });
      const message = `Scheduled ${rec.type === "screenshot" ? "snapshot" : "video"} for ${rec.cameraName} failed: ${reason}`;
      try {
        await fetch("/api/cloud/recordings/scheduled/error-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cameraId: camKey,
            cameraName: rec.cameraName,
            systemId: rec.systemId,
            message,
          }),
        });
      } catch {
        /* best-effort */
      }
      setMainTab("errors");
      await refreshErrorLogs({ silent: true });
      addPersistentNotification({
        type: "error",
        title: "Recording Failed",
        message,
        systemId: rec.systemId,
        deviceId: camKey,
      });
    },
    [refreshErrorLogs],
  );

  const reconcileTimer = (rec: ScheduledRecording, allSchedules: ScheduledRecording[] = []) => {
    // Clear existing timers for this record to avoid duplicates on re-load/poll
    if (scheduleTimers.current.has(rec.id + "-start")) {
      clearTimeout(scheduleTimers.current.get(rec.id + "-start"));
      scheduleTimers.current.delete(rec.id + "-start");
    }
    if (scheduleTimers.current.has(rec.id + "-end")) {
      clearTimeout(scheduleTimers.current.get(rec.id + "-end"));
      scheduleTimers.current.delete(rec.id + "-end");
    }

    if (isScheduleInactive(rec, allSchedules)) {
      return;
    }

    const [sh, sm] = rec.startTime.split(":").map(Number);
    const now = Date.now();
    const startMs = new Date(rec.date).setHours(sh, sm, 0, 0);

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // --- CASE 1: SCREENSHOTS (Snapshots) ---
    if (rec.type === "screenshot") {
      const captureDelay = 3000;
      const targetMs = startMs + captureDelay;
      const SCREENSHOT_CATCHUP_MS = 2 * 60 * 1000;
      const canCapture =
        rec.status === "pending" ||
        rec.status === "in progress" ||
        rec.status === "capturing";

      // Already at/ past capture time (e.g. "schedule now") — fire immediately if still eligible
      if (now >= targetMs) {
        if (canCapture && now < startMs + SCREENSHOT_CATCHUP_MS) {
          void runScheduledScreenshotCaptureRef.current(rec);
        }
        return;
      }

      // Only set timer if it's within the next 24 hours to avoid 32-bit setTimeout overflow (24.8 days)
      if (targetMs - now < ONE_DAY_MS) {
        const timer = setTimeout(() => {
          console.log(
            `[CloudRecordings] Snapshot time reached for ${rec.cameraName}. Running capture + refresh.`,
          );
          void runScheduledScreenshotCaptureRef.current(rec);
        }, targetMs - now);

        scheduleTimers.current.set(rec.id + "-start", timer);
      }
      return;
    }

    // --- CASE 2: VIDEOS ---
    const [eh, em] = rec.endTime.split(":").map(Number);
    const endMs = new Date(rec.date).setHours(eh, em, 59, 999);

    if (now >= endMs) {
      if (rec.status === "recording" && rec.record) {
        lastActionTime.current = Date.now();
        setScheduledRecordings((prev) => {
          const next = prev.map((r) =>
            r.id === rec.id ? { ...r, status: "processing" as const } : r,
          );
          saveToPersistence(next, originalSchedules.current);
          return next;
        });
      } else if (
        rec.status === "in progress" ||
        (rec.status === "recording" && !rec.record)
      ) {
        void markScheduleRecordingFailed(rec, "never started on VMS");
      }
      return;
    }

    // Only set timer if it's within the next 24 hours to avoid 32-bit setTimeout overflow
    if (now < startMs && (startMs - now < ONE_DAY_MS)) {
      const timer = setTimeout(() => {
        setScheduledRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, status: "recording" } : r));
      }, startMs - now);
      scheduleTimers.current.set(rec.id + "-start", timer);
    }

    if (
      now < endMs &&
      rec.status === "recording" &&
      (endMs - now < ONE_DAY_MS)
    ) {
      const timer = setTimeout(async () => {
        const latest = scheduledRecordingsRef.current.find((r) => r.id === rec.id);
        if (!latest?.record) {
          void markScheduleRecordingFailed(latest ?? rec, "never started on VMS");
          return;
        }

        // IMPROVEMENT: Immediately patch the device to stop recording when the timer expires
        // This ensures the recording stops at the exact same time the notification is shown.
        const cameraDeviceId = getOriginalDeviceId(rec.cameraId);
        try {
          const prevSystemId = nxAPI.getSystemId();
          nxAPI.setSystemId(rec.systemId);
          await nxAPI.updateDevice(cameraDeviceId, {
            schedule: { isEnabled: false }
          });
          if (prevSystemId) nxAPI.setSystemId(prevSystemId);
          console.log(`[CloudRecordings] Recording stopped via UI timer for ${rec.cameraName}`);
        } catch (err) {
          console.error("[CloudRecordings] Failed to stop recording via UI timer:", err);
        }

        addPersistentNotification({
          type: 'success',
          title: 'Recording Done',
          message: `Recording for ${rec.cameraName} is finished. Auto-saving...`,
          systemId: rec.systemId,
          deviceId: rec.cameraId,
          startTimeMs: rec.startMs,
          endTimeMs: rec.endMs,
          durationMs: rec.endMs - rec.startMs
        });

        // Keep the task on disk as "processing" so the server watchdog can trigger FFmpeg auto-save.
        // Keep the task on disk as "processing" so the server watchdog can trigger FFmpeg auto-save.
        console.log(`[CloudRecordings] Recording ${rec.cameraName} finished. Marking as processing for server auto-save.`);
        lastActionTime.current = Date.now();
        setScheduledRecordings(prev => {
          const next = prev.map(r =>
            r.id === rec.id ? { ...r, status: "processing" as const } : r
          );
          saveToPersistence(next, originalSchedules.current);
          return next;
        });

        if (rec.recurrence !== "none") {
          // For recurring: the watchdog will also advance the next occurrence
          lastActionTime.current = 0;
          loadFromPersistence(true);
        }

        // Auto-refresh after recording finishes (allow auto-save to complete first)
        setTimeout(() => refreshScheduleAndResultsRef.current(), 7000);
      }, endMs - now);

      scheduleTimers.current.set(rec.id + "-end", timer);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/cloud/recordings/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.storagePath) setStoragePath(data.storagePath);
        if (data.videoStoragePath) setVideoStoragePath(data.videoStoragePath);
      }
    } catch { }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch("/api/cloud/recordings/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, videoStoragePath }),
      });
      if (res.ok) {
        setIsSettingsOpen(false);
        addPersistentNotification({ type: 'success', title: 'Settings Saved', message: 'Storage paths updated successfully.' });
      }
    } catch (err: any) {
      addPersistentNotification({ type: 'error', title: 'Error', message: 'Failed to save settings.' });
    }
  };

  useEffect(() => {
    loadFromPersistence();
    fetchSettings();
  }, []);

  const fetchRecentResultsForScheduledCamera = useCallback(async (cameraId: string) => {
    if (!cameraId) return;
    setLoadingSelectedScheduledCameraResults(true);
    try {
      const now = new Date();
      const targetSystem = selectedSystem || "127.0.0.1";
      const startMs = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0);
      const endMs = now.getTime();

      const data = await fetchRecordedTimePeriods(
        targetSystem,
        getOriginalDeviceId(cameraId),
        startMs,
        endMs,
        isEffectiveAdmin
      );

      const allPeriods = Array.isArray(data) ? data : data?.reply || [];
      const periods = allPeriods.filter((p: any) => hasCameraViewPermission(effectiveUser, p.deviceId));

      const mapped: RecentRecording[] = periods.map((p: any, i: number) => {
        const duration = p.durationMs || 0;
        const isScreenshot = p.isLocal ? p.isScreenshot : (duration <= 5000 || p.isScreenshot);
        let dev = devices.find(d => normalizeId(d.id) === normalizeId(p.deviceId) && d.systemId === targetSystem);
        return {
          id: `recent-sched-${i}-${p.startTimeMs}-${p.deviceId || ""}`,
          cameraName: dev?.name || p.cameraName || p.deviceId || "Unknown",
          systemName: dev?.systemName || targetSystem,
          startTimeMs: p.startTimeMs || 0,
          durationMs: duration,
          systemId: targetSystem,
          deviceId: p.deviceId || "",
          isScreenshot,
          isLocal: p.isLocal,
          fileName: p.fileName,
          dateFolder: p.dateFolder,
          cameraFolderName: p.cameraFolderName
        };
      });

      mapped.sort((a, b) => b.startTimeMs - a.startTimeMs);
      setSelectedScheduledCameraRecentResults(mapped);
    } catch (e) {
      console.warn("[CloudRecordings] Failed to fetch scheduled camera results:", e);
    } finally {
      setLoadingSelectedScheduledCameraResults(false);
    }
  }, [selectedSystem, devices, isEffectiveAdmin, effectiveUser]);

  useEffect(() => {
    if (selectedScheduledCameraId) {
      fetchRecentResultsForScheduledCamera(selectedScheduledCameraId);
    } else {
      setSelectedScheduledCameraRecentResults([]);
    }
  }, [selectedScheduledCameraId, fetchRecentResultsForScheduledCamera]);

  // Clear messages when schedule dialog opens
  useEffect(() => {
    if (isScheduleOpen) {
      setScheduleError("");
      setScheduleSuccess("");
    }
  }, [isScheduleOpen]);

  // Smart polling: Only poll status from the watchdog if there are active tasks.
  // This reduces background network traffic while ensuring the UI updates when a recording finishes.
  useEffect(() => {
    if (scheduledRecordings.length === 0) return;

    const pollId = setInterval(loadFromPersistence, 1000);
    return () => clearInterval(pollId);
  }, [scheduledRecordings.length > 0]);

  // Removed auto-save useEffect to prevent race conditions with server watchdog.
  // We now save explicitly on user actions (add/delete/cancel).

  // Auto-refresh logic: trigger when a task finishes or is removed
  const prevScheduledCount = useRef(scheduledRecordings.length);
  useEffect(() => {
    if (scheduledRecordings.length < prevScheduledCount.current) {
      // A task finished or was removed. Refresh the list to show new recording/snapshot.
      // We also force a re-load of the persistence to ensure state is in sync with server watchdog.
      loadFromPersistence();
      setTimeout(() => handleSearchRecentRecordings(undefined, undefined, undefined, true, true), 2000); // 2 second delay, bypassing Redis cache
    }
    prevScheduledCount.current = scheduledRecordings.length;
  }, [scheduledRecordings.length]);

  // Periodic results refresh removed. Results are fetched on action or manual refresh.

  // ---- Recent Recordings tab state ----
  const [recentRecordings, setRecentRecordings] = useState<RecentRecording[]>([]);
  const [recentSearch, setRecentSearch] = useState<string>("");
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState("");
  const [selectedItems, setSelectedItems] = useState<RecentRecording[]>([]);
  const [recentDate, setRecentDate] = useState<Date | undefined>(new Date());
  const [recentCamera, setRecentCamera] = useState<string>("");

  // ---- Cloud OAuth ----
  const CLOUD_HOST = "https://nxvms.com";
  const CLIENT_ID = "api-tool";

  const hasCloudSession = useCallback(() => {
    const session = Cookies.get("nx_cloud_session");
    if (!session) return false;
    try {
      const parsed = JSON.parse(session);
      return !!(parsed?.accessToken);
    } catch { return false; }
  }, []);

  const handleCloudLogin = useCallback(() => {
    const redirectUrl = new URL(window.location.href);
    redirectUrl.search = "";
    const authUrl = new URL(`${CLOUD_HOST}/authorize`);
    authUrl.searchParams.set("redirect_url", redirectUrl.toString());
    authUrl.searchParams.set("client_id", CLIENT_ID);
    window.location.href = authUrl.toString();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      const exchangeToken = async () => {
        try {
          const response = await fetch(`${CLOUD_HOST}/oauth/token/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, grant_type: "authorization_code", response_type: "token" }),
          });
          if (response.ok) {
            const tokens = await response.json();
            if (tokens.access_token) {
              Cookies.set("nx_cloud_session", JSON.stringify({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, email: tokens.user_email }), { expires: 365, path: "/" });
              setRequiresCloudAuth(false);
              const url = new URL(window.location.href);
              url.searchParams.delete("code");
              window.history.replaceState({}, "", url.toString());
              loadSystems();
            }
          }
        } catch (err) { console.error("[CloudRecordings] Token exchange error:", err); }
      };
      exchangeToken();
    }
  }, []);

  // Initial load – fetch system name first, THEN load cameras
  useEffect(() => {
    (async () => {
      const localSystemId = String(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "127.0.0.1").replace(/[{}]/g, "");
      nxAPI.setSystemId(localSystemId); // CRITICAL: Ensure nxAPI has the system ID for local requests
      try {
        const info = await nxAPI.getSystemInfo();
        if (info?.name) setLocalSystemName(info.name);
      } catch (e) {
        console.warn("[CloudRecordings] Could not fetch system info:", e);
      }
      setSelectedSystem(localSystemId);
      loadSystems();
    })();
  }, []);

  const loadSystems = async () => {
    setLoadingSystems(true);
    setGlobalError("");
    setRequiresCloudAuth(false);
    try {
      const data = await fetchCloudSystems();
      setSystems(data);
      loadAllCameras(data);
    } catch (err: any) {
      if (err instanceof CloudAuthError || err.requiresAuth) {
        const localUserCookie = Cookies.get("local_nx_user");
        if (!localUserCookie) {
          setRequiresCloudAuth(true);
          setLoadingSystems(false);
          return;
        } else {
          loadAllCameras([]);
        }
      } else {
        loadAllCameras([]);
      }
    } finally {
      setLoadingSystems(false);
    }
  };

  const loadAllCameras = async (cloudSystems: CloudSystem[]) => {
    setLoadingDevices(true);
    setDevices([]);
    setDevicesReady(false);

    // 1. LOCAL FIRST – immediate
    try {
      const localCams = await nxAPI.getCameras();
      const localSystemId = String(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "127.0.0.1").replace(/[{}]/g, "");
      const mappedLocal = localCams.map(cam => ({
        id: cam.id, name: cam.name, typeId: cam.typeId, status: cam.status,
        systemId: localSystemId, systemName: "", // Hiding local system name text as requested
      }));
      // Filter local cameras - removed to allow reactive visibility based on enriched user perms
      // const allowedLocal = mappedLocal.filter(d => hasCameraViewPermission(effectiveUser, d.id));
      setDevices(mappedLocal);
      setDevicesReady(true);
      // Removed auto-selection of first camera to allow user to explicitly "Choose Camera" first. 
    } catch (e) {
      console.warn("[CloudRecordings] Local camera fetch failed:", e);
    }

    // 2. CLOUD – incremental with timeout
    cloudSystems.forEach(async (system) => {
      try {
        const localSystemId = String(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "").replace(/[{}]/g, "").toLowerCase();
        if (system.id.replace(/[{}]/g, "").toLowerCase() === localSystemId) return;
        const data = await Promise.race([
          fetchCloudDevices(system.id),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000)),
        ]) as any[];
        if (Array.isArray(data)) {
          const cloudMapped = data.map((cam: any) => ({
            id: cam.id, name: cam.name, typeId: cam.typeId, status: cam.status,
            systemId: system.id, systemName: system.name,
          }));
          // Filter cloud cameras - removed to allow reactive visibility based on enriched user perms
          // const allowedCloud = cloudMapped.filter(d => hasCameraViewPermission(effectiveUser, d.id));
          setDevices(prev => {
            const existingIds = new Set(prev.map(d => normalizeId(d.id)));
            const newOnes = cloudMapped.filter(d => !existingIds.has(normalizeId(d.id)));
            return [...prev, ...newOnes];
          });
        }
      } catch (e) {
        console.warn(`[CloudRecordings] Failed to fetch cameras from ${system.name}:`, e);
      }
    });

    setLoadingDevices(false);
  };

  const getOriginalDeviceId = (normalizedId: string, devList?: any[]) => {
    const cleanNormalized = normalizedId.includes(":") ? normalizedId.split(":")[1] : normalizedId;
    const list = devList || devices;
    const d = list.find((dev: any) => normalizeId(dev.id) === String(cleanNormalized));
    return d ? String(d.id) : String(cleanNormalized);
  };

  useEffect(() => {
    if (devicesReady && selectedDevice === "all" && date) {
      handleSearchRecentRecordings("all", date);
    }
  }, [devicesReady]);

  function handleSelectDevice(value: string) {
    if (!value) { setSelectedDevice(""); return; }
    setSelectedDevice(value);

    if (value === "all") {
      setSearchError("");
      handleSearchRecentRecordings(value, date);
      return;
    }

    const [sysId, devId] = value.split(":");
    if (sysId) setSelectedSystem(sysId);
    setSearchError("");

    // Auto-load recent recordings immediately after camera selection
    handleSearchRecentRecordings(devId, date, sysId);
  }

  function handleScheduleSelectDevice(value: string) {
    if (!value) { setScheduleCamera(""); return; }
    setScheduleCamera(value);

    const firstCamera = value.split(",")[0];
    if (firstCamera && firstCamera !== "all") {
      const [sysId] = firstCamera.split(":");
      if (sysId) setScheduleSystem(sysId);
    }
  }

  // ---- Search Recordings ----
  const handleSearchRecordings = async () => {
    if (!selectedSystem || !selectedDevice || !date) {
      setSearchError("Please select a camera and date.");
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    setRecordings([]);
    setRecentRecordings([]); // Clear recent list
    try {
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const startMs = new Date(date).setHours(startHour, startMin, 0, 0);
      const endMs = new Date(date).setHours(endHour, endMin, 59, 999);
      setSearchedRange({ startMs, endMs });
      const data = await fetchRecordedTimePeriods(
        selectedSystem, getOriginalDeviceId(selectedDevice), startMs, endMs, isEffectiveAdmin
      );
      const allPeriods = Array.isArray(data) ? data : data?.reply || [];
      // Filter results: power users/admins see all, normal users only see cameras they can edit
      const periods = allPeriods.filter((p: any) => hasCameraViewPermission(effectiveUser, p.deviceId));

      setRecordings(periods);
      if (periods.length === 0) setSearchError("No recordings found for the selected time range.");
    } catch (err: any) {
      setSearchError(err.message || "Failed to search recordings");
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePreview = (time: number, duration: number, sysId: string, devId: string, isLegacy?: boolean, fileName?: string, dateFolder?: string, cameraFolderName?: string) => {
    const isVideo = fileName?.toLowerCase().endsWith(".mp4");

    if ((duration <= 5000 || isLegacy) && !isVideo) {
      let url = "";
      if (isLegacy && fileName && dateFolder) {
        url = `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(fileName)}&systemId=${sysId}&deviceId=${devId}&startTimeMs=${time}`;
        if (cameraFolderName) url += `&camera=${encodeURIComponent(cameraFolderName)}`;
      } else {
        url = `/api/cloud/recordings/thumbnail?systemId=${sysId}&deviceId=${devId.replace(/[{}]/g, "")}&timestampMs=${time}`;
      }

      const cam = devices.find(d => normalizeId(d.id) === devId);
      setPreviewSnapshot({ url, title: cam?.name || "Snapshot" });
      return;
    }

    // If it's a local video (legacy), open it in a new tab via screenshot/serve
    if (isLegacy && isVideo && fileName && dateFolder) {
      let url = `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(fileName)}`;
      if (cameraFolderName) url += `&camera=${encodeURIComponent(cameraFolderName)}`;
      window.open(url, "_blank");
      return;
    }

    const sys = sysId || selectedSystem;
    const dev = devId || getOriginalDeviceId(selectedDevice);
    // Open the video inline in a new browser tab (no download)
    const params = new URLSearchParams({
      systemId: sys || "127.0.0.1",
      deviceId: dev,
      startTime: String(time),
      endTime: String(duration !== undefined ? time + duration : time + 300000),
      preview: "true",  // inline Content-Disposition – browser plays, not saves
    });
    window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
  };

  const handleDownload = (startTimeMs: number, durationMs: number, sysId?: string, devId?: string, isLocal?: boolean, fileName?: string, dateFolder?: string, cameraName?: string, cameraFolderName?: string, isScreenshot?: boolean) => {
    // If a local file is found (video or screenshot), download it directly as a copy
    if (isLocal && fileName && dateFolder) {
      let url = `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(fileName)}&systemId=${sysId}&deviceId=${devId}&startTimeMs=${startTimeMs}&download=true`;
      if (cameraFolderName) url += `&camera=${encodeURIComponent(cameraFolderName)}`;

      const link = document.createElement('a');
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Otherwise, fetch from VMS and convert (via the download API)
    const params = new URLSearchParams({
      systemId: sysId || selectedSystem || "127.0.0.1",
      deviceId: devId || getOriginalDeviceId(selectedDevice),
      startTime: String(startTimeMs),
      endTime: String(startTimeMs + (durationMs || 0)),
      stream: "true",  // Always proxy through Next.js so VMS token is applied server-side
    });
    // Pass isSnapshot flag to force image download
    if (isScreenshot || durationMs === 0) params.set("isSnapshot", "true");
    // Pass camera name so the server can use it when auto-saving the video
    if (cameraName) params.set("cameraName", cameraName);

    const downloadUrl = `/api/cloud/recordings/download?${params.toString()}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ---- Schedule Recording ----
  const addScheduleTimeRange = () => setScheduleTimeRanges([...scheduleTimeRanges, { start: "", end: "" }]);
  const removeScheduleTimeRange = (index: number) => setScheduleTimeRanges(scheduleTimeRanges.filter((_, i) => i !== index));
  const updateScheduleTimeRange = (index: number, key: "start" | "end", val: string) => {
    const next = [...scheduleTimeRanges];
    next[index][key] = val;
    setScheduleTimeRanges(next);
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleScheduleRecording = async () => {
    console.log("[CloudRecordings] handleScheduleRecording triggered", { scheduleCamera, scheduleType, scheduleDays, scheduleMonthDay, scheduleDates });
    setScheduleError("");
    setScheduleSuccess("");
    if (!scheduleCamera) {
      console.warn("[CloudRecordings] No camera selected");
      setScheduleError("Please select a camera.");
      return;
    }

    // GUARD: Never allow "all" cameras for scheduling
    if (scheduleCamera === "all") {
      setScheduleError("Please select a specific camera. Scheduling all cameras at once is not supported.");
      return;
    }

    const batchId = scheduleBatchId || `batch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const selectedCameraIds = scheduleCamera.split(",");
    const camerasToSchedule = devices.filter(d => selectedCameraIds.includes(`${d.systemId}:${normalizeId(d.id)}`));

    if (camerasToSchedule.length === 0) {
      setScheduleError("No cameras found to schedule.");
      return;
    }

    const scheduleOwner = resolveScheduleOwnerUsername();
    if (!scheduleOwner && !isEffectiveAdmin) {
      setScheduleError("Your VMS user identity is still loading. Please wait a moment and try again.");
      return;
    }

    if (scheduleType === "screenshot" && !storagePath) {
      addPersistentNotification({ type: 'warning', title: 'Storage Required', message: 'Please configure a storage path in Settings before adding a snapshot task.' });
      setIsScheduleOpen(false);
      setIsSettingsOpen(true);
      return;
    }

    let totalTasksScheduled = 0;
    const newScheduledEntries: ScheduledRecording[] = [];

    camerasToSchedule.forEach(device => {
      const cameraDeviceId = getOriginalDeviceId(device.id, devices);
      const systemId = device.systemId;

      // List of targets (dates and ranges) for this specific camera
      const scheduleTargets: { date: Date; start: string; end: string }[] = [];

      if (scheduleDays.length > 0) {
        // Recurring days
        const now = new Date();
        const currentDay = now.getDay();

        scheduleDays.forEach(dayIndex => {
          let targetDate = new Date(now);
          const lastTime = scheduleType === "screenshot" ? scheduleTimeRanges[scheduleTimeRanges.length - 1].start : scheduleTimeRanges[scheduleTimeRanges.length - 1].end;
          const [lastH, lastM] = lastTime.split(":").map(Number);

          while (true) {
            const windowEnd = new Date(targetDate).setHours(lastH, lastM, 59, 999);
            if (targetDate.getDay() === dayIndex && windowEnd >= now.getTime()) break;
            targetDate.setDate(targetDate.getDate() + 1);
          }

          if (scheduleType === "screenshot") {
            scheduleTimeRanges.forEach(range => {
              if (range.start) {
                scheduleTargets.push({ date: targetDate, start: range.start, end: range.start });
              }
            });
          } else {
            scheduleTimeRanges.forEach(range => {
              if (range.start && range.end) {
                scheduleTargets.push({ date: targetDate, start: range.start, end: range.end });
              }
            });
          }
        });
      } else if (scheduleMonthDay !== "" && scheduleMonthDay > 0 && scheduleMonthDay <= 31) {
        // Monthly recurrence
        const now = new Date();
        const targetDayNum = Number(scheduleMonthDay);
        let year = now.getFullYear();
        let monthIdx = now.getMonth();
        let targetDate = new Date(year, monthIdx, targetDayNum);
        const lastTime = scheduleType === "screenshot" ? scheduleTimeRanges[scheduleTimeRanges.length - 1].start : scheduleTimeRanges[scheduleTimeRanges.length - 1].end;
        const [lastH, lastM] = lastTime.split(":").map(Number);
        const windowEnd = new Date(targetDate).setHours(lastH, lastM, 59, 999);

        // If today is the target day AND the window hasn't passed, use today.
        // Otherwise find the next occurrence in the future.
        if (targetDate.getDate() !== targetDayNum || windowEnd < now.getTime()) {
          while (true) {
            monthIdx++;
            targetDate = new Date(year, monthIdx, targetDayNum);
            if (targetDate.getDate() === targetDayNum) break;
          }
        }

        if (scheduleType === "screenshot") {
          scheduleTimeRanges.forEach(range => {
            if (range.start) {
              scheduleTargets.push({ date: new Date(targetDate), start: range.start, end: range.start });
            }
          });
        } else {
          scheduleTimeRanges.forEach(range => {
            scheduleTargets.push({ date: new Date(targetDate), start: range.start, end: range.end });
          });
        }
      } else {
        // Multiple specific dates
        if (scheduleDates.length === 0) return;
        scheduleDates.forEach(tDate => {
          if (scheduleType === "screenshot") {
            scheduleTimeRanges.forEach(range => {
              if (range.start) {
                scheduleTargets.push({ date: tDate, start: range.start, end: range.start });
              }
            });
          } else {
            scheduleTimeRanges.forEach(range => {
              scheduleTargets.push({ date: tDate, start: range.start, end: range.end });
            });
          }
        });
      }

      if (scheduleTargets.length === 0) {
        console.warn("[CloudRecordings] No valid schedule targets generated");
        return;
      }

      scheduleTargets.forEach(target => {
        const { date: tDate, start: tStart, end: tEnd } = target;
        let finalTDate = new Date(tDate);
        let [startH, startM] = tStart.split(":").map(Number);
        let [endH, endM_val] = tEnd.split(":").map(Number);

        let startMs = new Date(finalTDate).setHours(startH, startM, 0, 0);
        let endMs = scheduleType === "screenshot" ? startMs : new Date(finalTDate).setHours(endH, endM_val, 59, 999);
        const nowMs = Date.now();

        const isRecurring = scheduleDays.length > 0 || (scheduleMonthDay !== "" && scheduleMonthDay > 0);

        // Recurring: only roll forward when the full window has already passed
        if (isRecurring && endMs < nowMs) {
          if (scheduleDays.length > 0) {
            finalTDate.setDate(finalTDate.getDate() + 7);
          } else {
            const dayNum = Number(scheduleMonthDay);
            let y = finalTDate.getFullYear();
            let mIdx = finalTDate.getMonth();
            while (true) {
              mIdx++;
              const next = new Date(y, mIdx, dayNum);
              if (next.getDate() === dayNum) { finalTDate = next; break; }
            }
          }
          startMs = new Date(finalTDate).setHours(startH, startM, 0, 0);
          endMs = scheduleType === "screenshot" ? startMs : new Date(finalTDate).setHours(endH, endM_val, 59, 999);
        }

        // ── NEW LOGIC: Notify if time has passed for one-time tasks ──
        if (!isRecurring && endMs < nowMs) {
          addPersistentNotification({
            type: 'warning',
            title: 'Invalid Schedule',
            message: `Recording for ${device.name} cannot be set because the time range has already passed.`
          });
          return;
        }

        if (endMs < startMs) return;

        const entryId = `sched-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const [sh, sm] = tStart.split(":").map(Number);


        // ── CASE: FUTURE TASKS (Delegated to Watchdog) ──────────────────────
        const entryStatus = startMs > nowMs ? "pending" : (scheduleType === "screenshot" ? "in progress" : "recording");
        const newEntry: ScheduledRecording = {
          id: entryId,
          cameraId: normalizeId(cameraDeviceId),
          cameraName: device?.name || "Sensor",
          systemId: systemId,
          systemName: device?.systemName || "",
          date: finalTDate,
          startTime: tStart, // Always use the original intended time string

          endTime: tEnd,
          startMs: startMs,
          endMs: endMs,
          type: scheduleType,
          status: entryStatus,
          recurrence: scheduleDays.length > 0 ? "weekday" : (scheduleMonthDay !== "" ? "monthday" : "none"),
          recurrenceDay: scheduleDays.length > 0 ? undefined : (scheduleMonthDay !== "" ? Number(scheduleMonthDay) : undefined),
          scheduledBy: scheduleOwner || effectiveUser?.username || "System",
          batchId,
        };
        if (scheduleType === "screenshot") {
          newEntry.screenshotTime = tStart;
        }

        newScheduledEntries.push(newEntry);
        totalTasksScheduled++;
      });
    });

    if (totalTasksScheduled > 0) {
      lastActionTime.current = Date.now();
      
      const nextSchedules = (() => {
        let filtered = scheduledRecordings;
        if (scheduleBatchId) {
          filtered = scheduledRecordings.filter(r => r.batchId !== scheduleBatchId);
        } else {
          // Remove existing matches for same camera/time/type
          const newIds = new Set(newScheduledEntries.map(n => n.id));
          const newKeys = new Set(newScheduledEntries.map(n => `${n.cameraId}-${n.startTime}-${n.type}-${new Date(n.date).toDateString()}`));
          filtered = scheduledRecordings.filter(r => !newIds.has(r.id) && !newKeys.has(`${r.cameraId}-${r.startTime}-${r.type}-${new Date(r.date).toDateString()}`));
        }
        return [...filtered, ...newScheduledEntries];
      })();

      setScheduledRecordings(nextSchedules);
      await saveToPersistence(nextSchedules, originalSchedules.current);

      const firstCamKey = normalizeId(newScheduledEntries[0]?.cameraId);
      if (firstCamKey) {
        setSelectedScheduledCameraId(firstCamKey);
      }

      // Set up client-side end timers immediately for tasks that start now
      newScheduledEntries.forEach(entry => {
        reconcileTimer(entry, nextSchedules);
      });

      setScheduleSuccess(`Successfully ${scheduleBatchId ? "updated" : "scheduled"} ${totalTasksScheduled} task(s).`);
      setTimeout(() => setIsScheduleOpen(false), 1500);
    } else {
      setScheduleError("No valid times or date selections provided.");
    }
  };

  const cancelSchedule = async (id: string, isBatch: boolean = false) => {
    const t1 = scheduleTimers.current.get(id + "-start");
    const t2 = scheduleTimers.current.get(id + "-end");
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);

    const rec = scheduledRecordings.find(r => r.id === id);
    if (!rec) return;

    // FOR RECURRING: If NOT a force-delete (i.e. individual date skip), SKIP to next occurrence
    if (!isBatch && rec.recurrence && rec.recurrence !== "none") {
      console.log(`[CloudRecordings] Skipping task ${id} for ${rec.cameraName} to next occurrence`);
      const targetDay = rec.recurrenceDay;
      const nextDate = new Date(rec.date);

      let year = nextDate.getFullYear();
      let monthIdx = nextDate.getMonth() + 1;

      if (rec.recurrence === "weekday") {
        nextDate.setDate(nextDate.getDate() + 7);
      } else {
        // Monthday logic
        let next = new Date(year, monthIdx, targetDay || 1);
        while (targetDay && next.getDate() !== targetDay) {
          monthIdx++;
          next = new Date(year, monthIdx, targetDay);
        }
        nextDate.setTime(next.getTime());
      }

      // Recalculate startMs and endMs for the next occurrence
      const [sh, sm] = rec.startTime.split(":").map(Number);
      const [eh, em] = (rec.endTime || rec.startTime).split(":").map(Number);
      const nextStartMs = new Date(nextDate).setHours(sh, sm, 0, 0);
      const nextEndMs = rec.type === "screenshot" ? nextStartMs : new Date(nextDate).setHours(eh, em, 59, 999);

      setScheduledRecordings(prev => {
        const next = prev.map(r => r.id === id ? {
          ...r,
          date: nextDate,
          status: "pending" as any,
          startMs: nextStartMs,
          endMs: nextEndMs
        } : r);
        saveToPersistence(next, originalSchedules.current);
        return next;
      });
      addPersistentNotification({ type: 'info', title: 'Skipped', message: `Skipped to ${format(nextDate, "MMM d, yyyy")}` });
      return;
    }

    // If currently recording, stop it immediately on the VMS
    if (rec.status === "recording") {
      try {
        const originalSchedule = originalSchedules.current.get(id);
        originalSchedules.current.delete(id);
        const cameraDeviceId = getOriginalDeviceId(rec.cameraId);
        if (originalSchedule) {
          await nxAPI.updateDevice(cameraDeviceId, { schedule: originalSchedule });
        } else {
          // Use the specific patch requested to immediately stop and disable schedule
          await nxAPI.updateDevice(cameraDeviceId, {
            schedule: { isEnabled: false }
          });
        }
        console.log(`[CloudRecordings] Recording cancelled/stopped for ${rec.cameraName}`);
      } catch (err) {
        console.error("[CloudRecordings] Failed to stop recording on cancel:", err);
      }
    }

    scheduleTimers.current.delete(id + "-start");
    scheduleTimers.current.delete(id + "-end");
    setScheduledRecordings(prev => {
      const next = prev.filter(r => r.id !== id);
      saveToPersistence(next, originalSchedules.current);
      return next;
    });
  };

  // ---- Recent Recordings ----
  const handleSearchRecentRecordings = async (overrideDevice?: string, overrideDate?: Date, overrideSystem?: string, isAutoRefresh: boolean = false, isForcedRefresh: boolean = false) => {
    const targetDevice = overrideDevice || selectedDevice;
    const targetDate = overrideDate || date;
    let targetSystem = overrideSystem || selectedSystem;

    // Resolve system placeholder to actual system if possible
    if (targetSystem === "127.0.0.1" || !targetSystem) {
      const cookieId = Cookies.get("nx_system_id")?.replace(/[{}]/g, "");
      const envId = process.env.NEXT_PUBLIC_NX_SYSTEM_ID?.replace(/[{}]/g, "");
      targetSystem = cookieId || envId || targetSystem || "127.0.0.1";
    }

    // Don't auto-trigger if nothing is selected yet
    if (isAutoRefresh && !targetDevice) return;
    if (!targetDevice || !targetDate) {
      if (!isAutoRefresh) setRecentError("Please select a camera and date.");
      return;
    }

    const dateStr = format(targetDate, "yyyy-MM-dd");
    const cacheKey = `${targetSystem}:${targetDevice}:${dateStr}`;

    // 1. Check cache (skip for auto-refresh or forced refresh to get fresh data)
    if (!isAutoRefresh && !isForcedRefresh) {
      const cached = recordingsCache.current.get(cacheKey);
      if (cached) {
        // console.debug(`[CloudRecordings] Using cache for ${cacheKey}`);
        setRecentRecordings(cached);
        setRecentError("");
        return;
      }
    }

    // 2. Race condition prevention: Cancel previous request
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }
    const controller = new AbortController();
    activeAbortController.current = controller;
    const requestTime = Date.now();
    lastRequestTime.current = requestTime;

    setRecentLoading(true);
    if (!isAutoRefresh) {
      setRecentError("");
      setRecordings([]);
    }

    try {
      const startMs = new Date(targetDate).setHours(0, 0, 0, 0);
      const endMs = new Date(targetDate).setHours(23, 59, 59, 999);
      const isAllCamerasSearch = targetDevice === "all";

      // OPTIMIZED: Fetch all or specific device in one call
      const data = await fetchRecordedTimePeriods(
        targetSystem,
        isAllCamerasSearch ? "all" : getOriginalDeviceId(targetDevice),
        startMs,
        endMs,
        isEffectiveAdmin,
        undefined,
        controller.signal,
        isForcedRefresh
      );

      // Check if this request is still the most recent one
      if (lastRequestTime.current !== requestTime) return;

      const allPeriods = Array.isArray(data) ? data : data?.reply || [];

      // Filter results: power users/admins see all, normal users only see cameras they can edit
      const periods = allPeriods.filter((p: any) => hasCameraViewPermission(effectiveUser, p.deviceId));

      if (isAutoRefresh && periods.length === 0 && recentRecordings.length > 0) return;

      const mapped: RecentRecording[] = periods.map((p: any, i: number) => {
        const duration = p.durationMs || 0;
        const isScreenshot = p.isLocal ? p.isScreenshot : (duration <= 5000 || p.isScreenshot);

        // Find the device info from our local list if it's an "all" search
        let dev = devices.find(d => normalizeId(d.id) === normalizeId(p.deviceId) && d.systemId === targetSystem);
        if (!dev && !isAllCamerasSearch) {
          dev = devices.find(d => normalizeId(d.id) === targetDevice && d.systemId === targetSystem);
        }

        return {
          id: `recent-${i}-${p.startTimeMs}-${p.deviceId || ""}`,
          cameraName: dev?.name || p.cameraName || p.deviceId || "Unknown",
          systemName: dev?.systemName || targetSystem,
          startTimeMs: p.startTimeMs || 0,
          durationMs: duration,
          systemId: targetSystem,
          deviceId: p.deviceId || targetDevice,
          isScreenshot,
          isLocal: p.isLocal,
          fileName: p.fileName,
          dateFolder: p.dateFolder,
          cameraFolderName: p.cameraFolderName !== undefined ? p.cameraFolderName : (dev?.name || p.cameraName),
        };
      });

      // Sort by time
      mapped.sort((a, b) => b.startTimeMs - a.startTimeMs);

      // Update state and cache
      if (isAutoRefresh) {
        setRecentRecordings(prev => {
          const merged = [...prev];
          mapped.forEach(newItem => {
            const existingIdx = merged.findIndex(i =>
              i.deviceId === newItem.deviceId &&
              Math.abs(i.startTimeMs - newItem.startTimeMs) < 120000
            );
            if (existingIdx >= 0) {
              if (newItem.isLocal || !merged[existingIdx].isLocal) {
                merged[existingIdx] = newItem;
              }
            } else {
              merged.push(newItem);
            }
          });
          merged.sort((a, b) => b.startTimeMs - a.startTimeMs);
          return merged;
        });
      } else {
        setRecentRecordings(mapped);
      }
      if (!isAutoRefresh) {
        recordingsCache.current.set(cacheKey, mapped);
        // Limit cache size
        if (recordingsCache.current.size > 50) {
          const firstKey = recordingsCache.current.keys().next().value;
          if (firstKey) recordingsCache.current.delete(firstKey);
        }
      }

      if (mapped.length === 0 && !isAutoRefresh) {
        setRecentError(targetDevice === "all" ? "No recordings found for any camera on this date." : "No recordings found for this camera on the selected date.");
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (lastRequestTime.current === requestTime && !isAutoRefresh) {
        setRecentError(err.message || "Failed to fetch recordings.");
      }
    } finally {
      if (lastRequestTime.current === requestTime) {
        setRecentLoading(false);
      }
    }
  };

  refreshScheduleAndResultsRef.current = () => {
    lastActionTime.current = 0;
    loadFromPersistence(true);
    handleSearchRecentRecordings(
      selectedDeviceRef.current,
      dateRef.current,
      undefined,
      false,
      true,
    );
  };

  const completeScreenshotCaptureSuccess = async (rec: ScheduledRecording) => {
    const isRecurring = rec.recurrence && rec.recurrence !== "none";
    if (!isRecurring) {
      setScheduledRecordings((prev) => {
        const next = prev.filter((r) => r.id !== rec.id);
        saveToPersistence(next, originalSchedules.current);
        return next;
      });
    } else {
      lastActionTime.current = 0;
      await loadFromPersistence(true);
    }

    addPersistentNotification({
      type: "success",
      title: "Snapshot Captured",
      message: `Snapshot saved for ${rec.cameraName}`,
      systemId: rec.systemId,
      deviceId: rec.cameraId,
    });
  };

  runScheduledScreenshotCaptureRef.current = async (rec: ScheduledRecording) => {
    if (executingScreenshotIds.current.has(rec.id)) return;
    executingScreenshotIds.current.add(rec.id);

    const [sh, sm] = rec.startTime.split(":").map(Number);
    const startMs = rec.startMs ?? new Date(rec.date).setHours(sh, sm, 0, 0);

    console.log(`[CloudRecordings] Triggering snapshot pulse for ${rec.cameraName}`);
    lastActionTime.current = Date.now();
    setScheduledRecordings((prev) => {
      const next = prev.map((r) =>
        r.id === rec.id ? { ...r, status: "capturing" as const } : r,
      );
      saveToPersistence(next, originalSchedules.current);
      return next;
    });

    try {
      const res = await fetch("/api/cloud/recordings/screenshot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId: rec.systemId,
          deviceId: rec.cameraId,
          cameraName: rec.cameraName,
          timestampMs: startMs,
          scheduledStartTime: rec.startTime,
          notificationUserKey: rec.scheduledBy || getNotificationUserKey() || "admin",
        }),
      });

      if (!res.ok) {
        throw new Error(`Screenshot API returned ${res.status}`);
      }

      await completeScreenshotCaptureSuccess(rec);
    } catch (err) {
      console.error("[CloudRecordings] Screenshot capture failed:", err);

      let outputExists = false;
      try {
        const verifyRes = await fetch("/api/cloud/recordings/scheduled/verify-output", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rec: {
              type: "screenshot",
              cameraId: rec.cameraId,
              cameraName: rec.cameraName,
              date: rec.date,
              startTime: rec.startTime,
              startMs,
            },
          }),
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          outputExists = !!verifyData.exists;
        }
      } catch {
        /* verify is best-effort */
      }

      if (outputExists) {
        console.log(
          `[CloudRecordings] Screenshot API failed for ${rec.cameraName} but output file exists; completing.`,
        );
        await completeScreenshotCaptureSuccess(rec);
      } else {
        setScheduledRecordings((prev) => {
          const next = prev.map((r) =>
            r.id === rec.id ? { ...r, status: "failed" as const } : r,
          );
          saveToPersistence(next, originalSchedules.current);
          return next;
        });
        addPersistentNotification({
          type: "error",
          title: "Snapshot Failed",
          message: `Could not capture snapshot for ${rec.cameraName}`,
          systemId: rec.systemId,
          deviceId: rec.cameraId,
        });
      }
    } finally {
      executingScreenshotIds.current.delete(rec.id);
      refreshScheduleAndResultsRef.current();
    }
  };

  const toggleSelectItem = (item: RecentRecording) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        return prev.filter(i => i.id !== item.id);
      }
      return [...prev, item];
    });
  };

  const toggleSelectAll = () => {
    const currentIds = new Set(filteredRecentRecordings.map(r => r.id));
    const allSelected = filteredRecentRecordings.every(r => selectedItems.some(s => s.id === r.id));

    if (allSelected) {
      // Unselect only those in current view
      setSelectedItems(prev => prev.filter(s => !currentIds.has(s.id)));
    } else {
      // Select all in current view (plus existing selections)
      setSelectedItems(prev => {
        const next = [...prev];
        filteredRecentRecordings.forEach(r => {
          if (!next.some(s => s.id === r.id)) next.push(r);
        });
        return next;
      });
    }
  };

  const handleBulkDownload = async () => {
    if (selectedItems.length === 0) return;
    try {
      setRecentLoading(true);
      const blob = await bulkDownloadRecordings(selectedSystem, selectedItems);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recordings_bulk_${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addPersistentNotification({
        type: 'success',
        title: 'Download Started',
        message: `Zipping and downloading ${selectedItems.length} items.`
      });

      // Optional: clear selection after download? Maybe not, keep for user convenience
    } catch (err: any) {
      console.error("[CloudRecordings] Bulk download failed:", err);
      addPersistentNotification({
        type: 'error',
        title: 'Download Failed',
        message: err.message || 'Failed to generate ZIP file.'
      });
    } finally {
      setRecentLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms <= 5000) return "Snapshot";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const filteredRecentRecordings = recentRecordings.filter(r =>
    !recentSearch || r.cameraName.toLowerCase().includes(recentSearch.toLowerCase()) ||
    r.systemName.toLowerCase().includes(recentSearch.toLowerCase()) ||
    new Date(r.startTimeMs).toLocaleString().toLowerCase().includes(recentSearch.toLowerCase())
  );



  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    recording: "bg-green-100 text-green-800 border-green-200 animate-pulse",
    "in progress": "bg-indigo-100 text-indigo-800 border-indigo-200 animate-pulse",
    capturing: "bg-indigo-100 text-indigo-800 border-indigo-200 animate-pulse",
    completing: "bg-green-100 text-green-800 border-green-200 animate-pulse",
    completed: "bg-blue-100 text-blue-800 border-blue-200",
    failed: "bg-red-100 text-red-800 border-red-200",
    active: "bg-sky-100 text-sky-800 border-sky-200 font-bold",
  };

  // ======== RENDER ========
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full space-y-6">
        {/* Header with Integrated Search/Filter and Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center">


            <TabsList className="bg-background/50 p-1 rounded-xl border shadow-inner">
              <TabsTrigger value="results" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <List className="h-4 w-4 mr-2" />
                Results
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Clock className="h-4 w-4 mr-2" />
                Scheduled
              </TabsTrigger>
              <TabsTrigger value="errors" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <AlertCircle className="h-4 w-4 mr-2" />
                Errors
                {totalErrorLogCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {totalErrorLogCount > 99 ? "99+" : totalErrorLogCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Global Action Bar */}
          <div className="flex items-center gap-2">
            {isEffectiveAdmin && (
              <Button
                variant="outline"
                onClick={() => setIsSettingsOpen(true)}
                className="h-9 gap-2 shadow-sm border-slate-200 hover:bg-slate-50"
                title="Snapshot Settings"
              >
                <Settings className="h-4 w-4 text-slate-500" />
                Settings
              </Button>
            )}
            <Button onClick={() => {
              if (scheduleType === "screenshot" && !storagePath) {
                addPersistentNotification({ type: 'warning', title: 'Action Required', message: 'Please set a snapshot storage path in Settings.' });
              } else if (scheduleType === "video" && !videoStoragePath) {
                addPersistentNotification({ type: 'warning', title: 'Action Required', message: 'Please set a video storage path in Settings.' });
              }
              resetScheduleForm();
              setIsScheduleOpen(true);
            }} className="h-9 gap-2 shadow-sm font-bold">
              <Plus className="h-4 w-4" /> New Schedule
            </Button>
          </div>
        </div>

        {!requiresCloudAuth ? (
          <>
            <TabsContent value="results" className="space-y-4 focus-visible:outline-none mt-0">
              <Card className="min-h-[600px] border-none shadow-none bg-transparent">
                <div className="flex flex-wrap items-center gap-3 mb-6 pb-6 border-b">
                  <div className="w-64">
                    <SearchableCameraSelect
                      value={selectedDevice}
                      onValueChange={setSelectedDevice}
                      devices={visibleDevices}
                      loadingDevices={loadingDevices}
                      normalizeId={normalizeId}
                      showAllOption={true}
                      placeholder="All Cameras"
                      canEdit={(id) => hasCameraEditPermission(effectiveUser, id)}
                    />
                  </div>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("justify-start font-normal h-10 px-4 rounded-xl border-slate-200/60 bg-white/50", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {date ? format(date, "MMMM d, yyyy") : "Select Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => {
                          if (d) {
                            setDate(d);
                            if (selectedDevice) handleSearchRecentRecordings(selectedDevice, d);
                          }
                        }}
                        disabled={{ after: new Date() }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      loadFromPersistence();
                      handleSearchRecentRecordings(selectedDevice, date, undefined, false, true);
                    }}
                    className="h-10 px-3 rounded-xl border-slate-200/60 bg-white/50 hover:bg-slate-100 transition-colors"
                    title="Refresh recordings"
                  >
                    <RefreshCw className={cn("h-4 w-4 text-primary", recentLoading && "animate-spin")} />
                  </Button>

                  {selectedItems.length > 0 && (
                    <div className="flex items-center gap-2 ml-auto animate-in fade-in slide-in-from-right-4">
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                        {selectedItems.length} selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedItems([])}
                        className="h-10 text-xs text-slate-500 hover:text-slate-700"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleBulkDownload}
                        disabled={recentLoading}
                        className="h-10 px-4 rounded-xl font-bold bg-primary shadow-lg hover:shadow-primary/20 transition-all gap-2"
                      >
                        <Archive className="h-4 w-4" />
                        Download ZIP
                      </Button>
                    </div>
                  )}

                  {recentLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse ml-auto bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" /> Synchronizing...
                    </div>
                  )}
                </div>
                <CardContent className="px-0 pt-0 relative min-h-[400px]">
                  {/* Persistent loading overlay to prevent jumpiness */}
                  {recentLoading && (
                    <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-4 transition-all duration-300">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm font-medium text-slate-600">Updating recordings...</p>
                    </div>
                  )}

                  {filteredRecentRecordings.length > 0 ? (
                    <div className={cn("border rounded-2xl bg-white overflow-hidden shadow-sm transition-opacity duration-300", recentLoading && "opacity-40")}>
                      <Table>
                        <TableHeader className="bg-white border-b border-slate-200">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-12 text-center">
                              <Checkbox
                                checked={filteredRecentRecordings.length > 0 && filteredRecentRecordings.every(r => selectedItems.some(s => s.id === r.id))}
                                onCheckedChange={toggleSelectAll}
                                aria-label="Select all"
                                className="translate-y-[2px]"
                              />
                            </TableHead>
                            <TableHead className="w-28 text-center text-black font-normal text-xs uppercase tracking-wider">Type</TableHead>
                            <TableHead className="text-black font-normal text-xs uppercase tracking-wider">Camera</TableHead>
                            <TableHead className="text-black font-normal text-xs uppercase tracking-wider">Time</TableHead>
                            <TableHead className="text-black font-normal text-xs uppercase tracking-wider">Date</TableHead>
                            <TableHead className="text-black font-normal text-xs uppercase tracking-wider">Duration</TableHead>
                            <TableHead className="text-right text-black font-normal text-xs uppercase tracking-wider">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRecentRecordings.map(rec => {
                            const startTime = new Date(rec.startTimeMs);
                            const endTime = new Date(rec.startTimeMs + (rec.durationMs || 0));
                            const timeStr = rec.isScreenshot
                              ? format(startTime, "HH:mm")
                              : `${format(startTime, "HH:mm")} - ${format(endTime, "HH:mm")}`;

                            return (
                              <TableRow key={rec.id} className={cn(
                                "hover:bg-slate-50/50 transition-colors border-b border-slate-100",
                                selectedItems.some(s => s.id === rec.id) && "bg-primary/5 hover:bg-primary/10"
                              )}>
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={selectedItems.some(s => s.id === rec.id)}
                                    onCheckedChange={() => toggleSelectItem(rec)}
                                    aria-label={`Select ${rec.cameraName}`}
                                    className="translate-y-[2px]"
                                  />
                                </TableCell>
                                <TableCell className="text-center text-black text-[12px]">
                                  {rec.isScreenshot ? "snapshot" : "video"}
                                </TableCell>
                                <TableCell className="text-black text-[12px]">{rec.cameraName}</TableCell>
                                <TableCell className="text-black text-[12px]">
                                  {timeStr}
                                </TableCell>
                                <TableCell className="text-black text-[12px]">
                                  {format(startTime, "MMM d")}
                                </TableCell>
                                <TableCell className="text-black text-[12px]">
                                  {!rec.isScreenshot ? formatDuration(rec.durationMs) : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {rec.isScreenshot && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          handlePreview(rec.startTimeMs, rec.durationMs, rec.systemId, rec.deviceId, rec.isLocal, rec.fileName, rec.dateFolder, rec.cameraFolderName);
                                        }}
                                        className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-100 text-black transition-all"
                                        title="View Image"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDownload(rec.startTimeMs, rec.durationMs, rec.systemId, rec.deviceId, rec.isLocal, rec.fileName, rec.dateFolder, rec.cameraName, rec.cameraFolderName, rec.isScreenshot)}
                                      className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-100 text-black transition-all"
                                      title={rec.isScreenshot ? "Save Image" : "Download"}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    !recentLoading && (
                      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4 border-2 border-dashed rounded-3xl bg-muted/20 animate-in fade-in zoom-in-95 duration-500">
                        <div className="bg-muted p-6 rounded-full shadow-inner">
                          <Search className="h-10 w-10 opacity-40" />
                        </div>
                        <div>
                          <p className="font-bold text-lg text-slate-700">No recordings found</p>
                          <p className="text-sm text-slate-500">Try selecting a different camera or date above.</p>
                        </div>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduled" className="focus-visible:outline-none mt-0 space-y-6">
              {/* Statistics Header */}
              <div className="col-span-full flex items-center justify-between bg-muted/20 p-3 rounded-2xl border">
                <div className="flex flex-wrap items-center gap-4 px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span>Scheduled Cameras: <span className="text-slate-900 font-extrabold">{schedulesByCamera.length}</span></span>
                  </div>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <div>
                    Total Schedules: <span className="text-slate-900 font-extrabold">{visibleScheduledRecordings.length}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {visibleScheduledRecordings.length > 0 && (
                    <ScheduleExportDialog
                      schedules={visibleScheduledRecordings}
                      systemName={localSystemName || "All Systems"}
                    />
                  )}
                  {isEffectiveAdmin && visibleScheduledRecordings.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => requestCancel(visibleScheduledRecordings.map(r => r.id), true)}
                      className="h-8 text-[10px] uppercase font-black tracking-widest text-destructive hover:bg-destructive/10 rounded-lg"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Cancel All
                    </Button>
                  )}
                </div>
              </div>

              {/* Master-Detail Split Layout */}
              <div className="grid grid-cols-12 gap-6 min-h-[600px]" style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: '24px' }}>
                {/* Left Side: Cameras List (5 columns) */}
                <div className="col-span-5 bg-white border rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ gridColumn: 'span 1' }}>
                  <div className="p-4 border-b space-y-3">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Cameras</h3>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search cameras..."
                        value={scheduledSearch}
                        onChange={(e) => setScheduledSearch(e.target.value)}
                        className="h-10 pr-10 text-sm rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[500px] divide-y divide-slate-100">
                    {schedulesByCamera
                      .filter(cam => !scheduledSearch || (cam.cameraName || "").toLowerCase().includes(scheduledSearch.toLowerCase()))
                      .map(cam => {
                        const isSelected = selectedScheduledCameraId === cam.cameraId;
                        const runningSchedule = getCameraRunningSchedule(cam.schedules);
                        const nextRun = getNextRunTime(cam.schedules);
                        return (
                          <button
                            key={cam.cameraId}
                            onClick={() => {
                              setSelectedScheduledCameraId(cam.cameraId);
                              setExpandedGroups(new Set());
                            }}
                            className={cn(
                              "w-full text-left p-4 flex items-center justify-between transition-colors hover:bg-slate-50/50",
                              isSelected && "bg-blue-50/70 hover:bg-blue-50/70"
                            )}
                          >
                            <div className="space-y-1 min-w-0 pr-3">
                              <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                                <Camera className="h-4 w-4 text-slate-500 shrink-0" />
                                {cam.cameraName}
                              </div>
                              <div className="text-xs text-slate-500 font-medium flex items-center gap-1 flex-wrap">
                                {runningSchedule ? (
                                  <>
                                    <span className="text-slate-600 font-semibold">{cam.schedules.length} schedule(s)</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-green-600 font-semibold animate-pulse">
                                      {getRunningNowLabel(runningSchedule)}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-slate-600 font-semibold">{cam.schedules.length} schedule(s)</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-400">Next:</span>
                                    <span className={cn(
                                      nextRun !== "No upcoming runs" ? "text-blue-600 font-semibold" : "text-slate-400"
                                    )}>
                                      {nextRun}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                          </button>
                        );
                      })}

                    {schedulesByCamera.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                        <Camera className="h-8 w-8 opacity-40 mb-2" />
                        <p className="font-bold text-sm">No cameras available</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Schedules Details (7 columns) */}
                <div className="col-span-7 bg-white border rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ gridColumn: 'span 1' }}>
                  {selectedScheduledCameraId && schedulesByCamera.some(c => c.cameraId === selectedScheduledCameraId) ? (
                    (() => {
                      const selectedCam = schedulesByCamera.find(c => c.cameraId === selectedScheduledCameraId)!;
                      return (
                        <div className="p-6 flex flex-col min-h-[520px] max-h-[min(720px,70vh)]">
                          {/* Header */}
                          <div className="flex items-start justify-between border-b pb-4 shrink-0">
                            <div className="space-y-1">
                              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Camera className="h-5 w-5 text-blue-600" />
                                {selectedCam.cameraName}
                              </h3>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const firstSched = selectedCam.schedules[0];
                                  setScheduleCamera(`${firstSched?.systemId || selectedSystem}:${selectedCam.cameraId}`);
                                  setScheduleSystem(firstSched?.systemId || selectedSystem);
                                  setIsScheduleOpen(true);
                                }}
                                className="h-9 px-3 text-xs text-blue-600 hover:bg-blue-50/50 hover:text-blue-700 font-semibold border-slate-200 flex items-center gap-1.5"
                              >
                                <Plus className="h-4 w-4 mr-1.5" />
                                Add Schedule
                              </Button>
                              {isEffectiveAdmin && selectedCam.schedules.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => requestCancel(selectedCam.schedules.map(s => s.id), true)}
                                  className="h-9 px-3 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive font-semibold border-slate-200"
                                >
                                  <Trash2 className="h-4 w-4 mr-1.5" />
                                  Delete All
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Groups List */}
                          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-4 pr-2 custom-scrollbar">
                            {groupedSchedulesForSelectedCamera.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 bg-slate-50/30 rounded-2xl border border-dashed border-slate-200/80">
                                <div className="bg-slate-100/80 p-4 rounded-full mb-3">
                                  <CalendarIcon className="h-6 w-6 text-slate-400" />
                                </div>
                                <p className="font-bold text-slate-700 text-sm">No Active Schedules</p>
                                <p className="text-xs text-slate-400 max-w-xs mt-1 px-4">
                                  There are no recording or snapshot schedules configured for this camera. Click "Add Schedule" above to create one.
                                </p>
                              </div>
                            ) : (
                              groupedSchedulesForSelectedCamera.map((group) => {
                              const recurrenceText = getRecurrenceText(group);
                              const first = group.records[0];
                              const uniqueTimes = Array.from(
                                new Set(
                                  group.records.map(r =>
                                    r.type === "screenshot" ? r.startTime : `${r.startTime} → ${r.endTime}`
                                  )
                                )
                              );

                              const isCollapsed = !expandedScheduleKeys.has(group.key);
                              const conflictingKeys = getConflictingGroupKeys(group, groupedSchedulesForSelectedCamera);
                              const isOverlapping = conflictingKeys.length > 0;
                              const isExplicitlyActive = group.records.some(r => r.isExplicitlyActive === true);
                              const isExplicitlyInactive = group.records.some(r => r.inactive === true);
                              
                              const isGroupInactive = isExplicitlyInactive || (isOverlapping && !isExplicitlyActive);

                              const groupNextRun = getGroupNextRun(group.records);
                              const groupRunningSchedule = group.records.find((rec) =>
                                isScheduleRunningNow(rec, isGroupInactive),
                              );
                              const uniqueCreators = Array.from(new Set(group.records.map(r => r.scheduledBy).filter(Boolean)));
                              const canModify = isEffectiveAdmin || group.records.every((rec) => canManageSchedule(effectiveUser, rec));

                              const formatNextRunStr = (d: Date | null) => {
                                if (isExplicitlyInactive) {
                                  return "Inactive";
                                }
                                if (isGroupInactive) {
                                  return "Inactive (Overlaps another recording)";
                                }
                                if (!d) return "No upcoming runs";
                                return format(d, "EEE MMM d, HH:mm");
                              };

                              const handleActivateGroup = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (!canModify) return;
                                setScheduledRecordings(prev => {
                                  const updated = prev.map(rec => {
                                    const recGroupKey = rec.recurrence === "weekday"
                                      ? `${rec.type}-weekday-${rec.startTime}-${rec.endTime || ''}`
                                      : (rec.recurrence === "none"
                                         ? (rec.batchId || `${rec.type}-none-${rec.date}-${rec.startTime}-${rec.endTime || ''}`)
                                         : `${rec.type}-${rec.recurrence}-${rec.recurrenceDay || ''}-${rec.startTime}-${rec.endTime || ''}`);
                                    
                                    if (recGroupKey === group.key) {
                                      return { ...rec, inactive: false, isExplicitlyActive: true };
                                    }
                                    if (conflictingKeys.includes(recGroupKey)) {
                                      return { ...rec, inactive: true, isExplicitlyActive: false };
                                    }
                                    return rec;
                                  });
                                  saveToPersistence(updated, originalSchedules.current);
                                  return updated;
                                });
                                addPersistentNotification({
                                  type: 'success',
                                  title: 'Schedule Activated',
                                  message: `${group.type === "screenshot" ? "Snapshot" : "Video"} schedule has been activated, and conflicting schedules deactivated.`
                                });
                              };

                              const handleDeactivateGroup = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (!canModify) return;
                                setScheduledRecordings(prev => {
                                  const updated = prev.map(rec => {
                                    const recGroupKey = rec.recurrence === "weekday"
                                      ? `${rec.type}-weekday-${rec.startTime}-${rec.endTime || ''}`
                                      : (rec.recurrence === "none"
                                         ? (rec.batchId || `${rec.type}-none-${rec.date}-${rec.startTime}-${rec.endTime || ''}`)
                                         : `${rec.type}-${rec.recurrence}-${rec.recurrenceDay || ''}-${rec.startTime}-${rec.endTime || ''}`);
                                    
                                    if (recGroupKey === group.key) {
                                      return { ...rec, inactive: true, isExplicitlyActive: false };
                                    }
                                    return rec;
                                  });
                                  saveToPersistence(updated, originalSchedules.current);
                                  return updated;
                                });
                                addPersistentNotification({
                                  type: 'info',
                                  title: 'Schedule Disabled',
                                  message: `${group.type === "screenshot" ? "Snapshot" : "Video"} schedule has been disabled.`
                                });
                              };

                              return (
                                <div key={group.key} className={cn(
                                  "p-4 rounded-xl border transition-all space-y-0.5",
                                  isGroupInactive 
                                    ? "bg-slate-100/50 border-slate-200/80 opacity-65 text-slate-500 hover:bg-slate-100" 
                                    : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                                )}>
                                  <div
                                    onClick={() => {
                                      setExpandedScheduleKeys(prev => {
                                        const next = new Set(prev);
                                        if (next.has(group.key)) next.delete(group.key);
                                        else next.add(group.key);
                                        return next;
                                      });
                                    }}
                                    className="flex items-center justify-between cursor-pointer select-none py-1"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        <span className={cn(
                                          "text-sm font-semibold",
                                          isGroupInactive ? "text-slate-400 font-medium line-through decoration-slate-300" : "text-slate-700"
                                        )}>
                                          {group.type === "screenshot" ? "(Snapshot)" : "(Video)"}
                                        </span>
                                        <span className={cn(
                                          "text-sm font-semibold truncate",
                                          isGroupInactive ? "text-slate-400 font-medium line-through decoration-slate-300" : "text-slate-700"
                                        )}>
                                          {recurrenceText}
                                        </span>
                                        <span className="text-xs text-slate-400 font-medium">•</span>
                                        <span className="text-xs font-bold text-slate-600">
                                          {group.type === "screenshot" 
                                            ? `${uniqueTimes.length} time(s)` 
                                            : uniqueTimes.join(", ")}
                                        </span>
                                      </div>
                                    </div>

                                    {(() => {
                                      let badgeText = "Active";
                                      let badgeStyle = "bg-green-50 text-green-700 border border-green-200/50";
                                      let Icon = CheckCircle2;

                                      if (isOverlapping && !isExplicitlyActive) {
                                        badgeText = "Overlaps • Requires Attention";
                                        badgeStyle = "bg-red-50 text-red-500 border border-red-200/50";
                                        Icon = AlertCircle;
                                      } else if (isExplicitlyInactive) {
                                        badgeText = "Disabled";
                                        badgeStyle = "bg-slate-100 text-slate-600 border border-slate-200";
                                        Icon = AlertCircle;
                                      }

                                      return (
                                        <span className={cn(
                                          "text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ml-2 shrink-0",
                                          badgeStyle
                                        )}>
                                          <Icon className="h-3 w-3 shrink-0" />
                                          {badgeText}
                                        </span>
                                      );
                                    })()}
                                  </div>

                                  {!isCollapsed && (
                                    <>
                                      <div className="flex flex-wrap items-center gap-2 pt-3 mt-2 border-t border-slate-100">
                                        {!isGroupInactive ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!canModify}
                                            onClick={handleDeactivateGroup}
                                            className="h-8 px-3 text-xs gap-1.5 font-bold border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-700"
                                          >
                                            <AlertCircle className="h-3.5 w-3.5 text-slate-400" /> Disable
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!canModify}
                                            onClick={handleActivateGroup}
                                            className="h-8 px-3 text-xs gap-1.5 font-bold border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                          >
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Enable
                                          </Button>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!canModify}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setScheduleCamera(`${first.systemId}:${first.cameraId}`);
                                            setScheduleSystem(first.systemId);
                                            setScheduleType(first.type);
                                            setScheduleBatchId(first.batchId || null);
                                            setScheduleDates(group.records.map(r => new Date(r.date)));
                                            const parsedRanges = group.records.map(r => ({
                                              start: r.startTime,
                                              end: r.type === "screenshot" ? r.startTime : r.endTime
                                            }));
                                            const uniquePairs = Array.from(new Set(parsedRanges.map(r => `${r.start}-${r.end}`)))
                                              .map(p => {
                                                const [start, end] = p.split("-");
                                                return { start, end };
                                              });
                                            setScheduleTimeRanges(uniquePairs);

                                            if (first.recurrence === "weekday") {
                                              setScheduleFrequencyTab("weekly");
                                              const days = group.records.filter(r => r.recurrence === "weekday").map(r => new Date(r.date).getDay());
                                              setScheduleDays([...new Set(days)]);
                                            } else if (first.recurrence === "monthday") {
                                              setScheduleFrequencyTab("monthly");
                                              setScheduleMonthDay(first.recurrenceDay || "");
                                            } else {
                                              setScheduleFrequencyTab("specific");
                                              setScheduleDates(group.records.map(r => new Date(r.date)));
                                            }

                                            setIsScheduleOpen(true);
                                          }}
                                          className="h-8 px-3 text-xs gap-1.5 font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
                                        >
                                          <Pencil className="h-3 w-3" /> Edit
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!canModify}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            requestCancel(group.records.map(r => r.id), true);
                                          }}
                                          className="h-8 px-3 text-xs gap-1.5 font-bold border-slate-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                        >
                                          <Trash2 className="h-3 w-3" /> Delete
                                        </Button>
                                      </div>

                                      <div className="pl-6 pt-3 space-y-3">
                                      {group.type === "screenshot" && (
                                        <div className="space-y-1.5">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Scheduled Times</span>
                                          <div className="flex flex-wrap gap-2">
                                            {uniqueTimes.map((time, idx) => (
                                              <div key={idx} className="bg-white border border-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm">
                                                <Clock className="h-3 w-3 text-slate-400" />
                                                {time}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex flex-col gap-1 text-xs text-slate-500 font-medium">
                                        <div>
                                          {groupRunningSchedule ? (
                                            <>
                                              <span className="font-semibold text-green-700">Status:</span>{" "}
                                              <span className="text-green-600 font-semibold animate-pulse">
                                                {getRunningNowLabel(groupRunningSchedule)}
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              <span className="font-semibold text-slate-700">Next Run:</span>{" "}
                                              {formatNextRunStr(groupNextRun)}
                                            </>
                                          )}
                                        </div>
                                        <div>
                                          <span className="font-semibold text-slate-700">Created by:</span> {uniqueCreators.join(", ") || "System"}
                                        </div>
                                      </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })
                          )}

                          {/* Recent Results (Last 3 Days) */}
                          {selectedScheduledCameraRecentResults.length > 0 && (
                            <div className="pt-6 border-t border-slate-100 mt-6 space-y-4">
                              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Video className="h-3.5 w-3.5 text-slate-400" /> Recent Results (Last 3 Days)
                              </h4>
                              <div className="space-y-2">
                                {selectedScheduledCameraRecentResults.map((result) => (
                                  <div
                                    key={result.id}
                                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/30 text-xs font-semibold"
                                  >
                                    <div className="flex flex-col gap-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-700">
                                          {format(new Date(result.startTimeMs), "EEE MMM d, HH:mm")}
                                        </span>
                                        <span className="text-slate-400 font-medium">
                                          ({formatDuration(result.durationMs)})
                                        </span>
                                      </div>
                                      {result.isLocal && result.fileName && (
                                        <span className="text-[10px] text-slate-400 truncate max-w-[280px]">
                                          File: {result.fileName}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handlePreview(result.startTimeMs, result.durationMs, result.systemId, result.deviceId, result.isLocal, result.fileName, result.dateFolder, result.cameraFolderName)}
                                        className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-100 text-black transition-all"
                                        title="Preview"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDownload(result.startTimeMs, result.durationMs, result.systemId, result.deviceId, result.isLocal, result.fileName, result.dateFolder, result.cameraName, result.cameraFolderName, result.isScreenshot)}
                                        className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-100 text-black transition-all"
                                        title="Download"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recent Errors */}
                          {errorLogsForSelectedCamera.length > 0 && (
                            <div className="pt-6 border-t border-slate-100 mt-6 space-y-4">
                              <h4 className="text-xs font-black uppercase tracking-wider text-red-500 flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 text-red-500" /> Failed Runs / Errors
                              </h4>
                              <div className="space-y-2">
                                {errorLogsForSelectedCamera.slice(0, 5).map((log) => (
                                  <div
                                    key={log.id}
                                    className="p-3 rounded-xl border border-red-100 bg-red-50/20 text-xs font-semibold text-slate-700 flex flex-col gap-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-red-600 font-bold uppercase tracking-wider">
                                        Failed
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {log.timestamp || (log.createdAtMs ? new Date(log.createdAtMs).toLocaleString() : "")}
                                      </span>
                                    </div>
                                    <p className="text-slate-600 font-medium leading-relaxed">
                                      {log.message}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          </div>

                          {/* Upcoming runs */}
                          {upcomingRunsForSelectedCamera.length > 0 && (
                            <div className="border-t pt-4 shrink-0">
                              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                                <CalendarIcon className="h-3.5 w-3.5 text-slate-400" /> Upcoming Runs
                              </h4>
                              <div className="space-y-2">
                                {upcomingRunsForSelectedCamera
                                  .slice(0, UPCOMING_RUNS_PREVIEW)
                                  .map((run) => renderUpcomingRunRow(run, true))}
                              </div>
                              {upcomingRunsForSelectedCamera.length > UPCOMING_RUNS_PREVIEW && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-7 px-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                                  onClick={() => setShowAllUpcomingRuns(true)}
                                >
                                  View more ({upcomingRunsForSelectedCamera.length - UPCOMING_RUNS_PREVIEW} more)
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-slate-50/50">
                      <div className="bg-slate-100 p-6 rounded-full shadow-inner mb-4">
                        <Camera className="h-10 w-10 text-slate-400" />
                      </div>
                      <p className="font-bold text-slate-700 text-lg">Select a Camera</p>
                      <p className="text-sm text-slate-500 max-w-xs">
                        Choose a camera from the list on the left to view, edit, or manage its recording and snapshot schedules.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="errors" className="focus-visible:outline-none mt-0 space-y-6">
              <div className="col-span-full flex items-center justify-between bg-muted/20 p-3 rounded-2xl border">
                <div className="flex flex-wrap items-center gap-4 px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <span>
                      Total errors:{" "}
                      <span className="text-slate-900 font-extrabold">{totalErrorLogCount}</span>
                    </span>
                  </div>
                  {errorLogCameras.length > 0 && (
                    <>
                      <span className="text-slate-300 hidden sm:inline">•</span>
                      <div>
                        Cameras affected:{" "}
                        <span className="text-slate-900 font-extrabold">{errorLogCameras.length}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {errorLogEntries.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[10px] uppercase font-black tracking-widest text-red-600 hover:bg-red-50 rounded-lg"
                      onClick={() => void dismissAllErrorLogs()}
                    >
                      Close all
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshErrorLogs()}
                    className="h-8 text-[10px] uppercase font-black tracking-widest text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-2", isLoadingErrorLogs && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="bg-white border rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[600px]">
                <div className="p-4 border-b">
                  <div className="relative max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by camera or message..."
                      value={errorsSearch}
                      onChange={(e) => setErrorsSearch(e.target.value)}
                      className="h-10 pr-10 text-sm rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[550px] custom-scrollbar">
                  {isLoadingErrorLogs && errorLogEntries.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-24">
                      <Loader2 className="h-5 w-5 animate-spin" /> Loading error logs…
                    </div>
                  ) : filteredErrorLogEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 opacity-40 mb-3 text-green-500" />
                      <p className="font-bold text-slate-700">
                        {errorsSearch ? "No matching errors" : "No error logs"}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        {errorsSearch
                          ? "Try a different search term."
                          : "All clear — nothing to review."}
                      </p>
                    </div>
                  ) : (
                    filteredErrorLogEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="relative p-3 pr-10 rounded-xl border border-red-200 bg-red-50/60 text-sm"
                      >
                        <button
                          type="button"
                          aria-label="Dismiss error"
                          className="absolute top-2.5 right-2.5 p-1 rounded-md text-red-400 hover:text-red-700 hover:bg-red-100"
                          onClick={() => void dismissErrorLogEntry(entry.id)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="flex items-center gap-2 mb-1">
                          <Camera className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-700 truncate">{entry.cameraName}</span>
                        </div>
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1">
                          {entry.timestamp}
                        </p>
                        <p className="text-slate-800 leading-snug">{entry.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          </>
        ) : (
          <Card className="border-primary/50 bg-primary/5 rounded-3xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 font-black text-xl text-primary uppercase tracking-tight">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Cloud className="h-6 w-6" />
                </div>
                Cloud Access Required
              </CardTitle>
              <CardDescription className="text-slate-600 font-medium ml-12">You need to be authenticated with NX Cloud to manage remote recordings.</CardDescription>
            </CardHeader>
            <CardContent className="ml-12 pb-8">
              <Button onClick={handleCloudLogin} className="gap-2 font-black px-8 py-6 rounded-2xl shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30">
                <LogIn className="h-5 w-5" /> Sign in to NX Cloud
              </Button>
            </CardContent>
          </Card>
        )}
      </Tabs>


      {/* Upcoming runs — view all */}
      <Dialog open={showAllUpcomingRuns} onOpenChange={setShowAllUpcomingRuns}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-slate-500" /> Upcoming Runs
            </DialogTitle>
            {selectedCameraName && (
              <DialogDescription>{selectedCameraName}</DialogDescription>
            )}
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1 -mr-1">
            {upcomingRunsForSelectedCamera.map((run) => renderUpcomingRunRow(run, false))}
            {upcomingRunsForSelectedCamera.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No upcoming runs.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* NEW SCHEDULE DIALOG */}
      <Dialog open={isScheduleOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {scheduleBatchId ? "Edit Recording Schedule" : "New Recording Schedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <SearchableCameraMultiSelect
              value={scheduleCamera}
              onValueChange={handleScheduleSelectDevice}
              devices={visibleDevices}
              loadingDevices={loadingDevices}
              normalizeId={normalizeId}
              placeholder="Choose Cameras"
              canEdit={(id) => hasCameraEditPermission(effectiveUser, id)}
            />

            <div className="space-y-2">
              <Label>Task Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={scheduleType === "video" ? "default" : "outline"} onClick={() => setScheduleType("video")} className="h-10 gap-2">
                  <Video className="h-4 w-4" /> Video
                </Button>
                <Button variant={scheduleType === "screenshot" ? "default" : "outline"} onClick={() => setScheduleType("screenshot")} className="h-10 gap-2">
                  <ImageIcon2 className="h-4 w-4" /> Snapshot
                </Button>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <Label className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Recurrence / Frequency</Label>

              <Tabs value={scheduleFrequencyTab} onValueChange={setScheduleFrequencyTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="weekly" className="text-[10px] font-bold uppercase tracking-tighter">Weekly</TabsTrigger>
                  <TabsTrigger value="specific" className="text-[10px] font-bold uppercase tracking-tighter">Specific Dates</TabsTrigger>
                  <TabsTrigger value="monthly" className="text-[10px] font-bold uppercase tracking-tighter">Day of Month</TabsTrigger>
                </TabsList>

                <TabsContent value="weekly" className="pt-3">
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-black text-muted-foreground tracking-widest pl-1">Select Weekdays</span>
                    <div className="grid grid-cols-7 gap-1.5 p-2.5 border rounded-lg bg-muted/20">
                      {dayNames.map((name, i) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            toggleScheduleDay(i);
                            setScheduleMonthDay("");
                            setScheduleDates([]);
                          }}
                          className={cn(
                            "w-full h-10 rounded-md text-[10px] font-black transition-all border flex items-center justify-center",
                            scheduleDays.includes(i)
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background hover:border-primary/50 text-muted-foreground"
                          )}
                        >
                          {name.substring(0, 1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="specific" className="pt-3">
                  <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-lg border">
                    <span className="text-xs font-bold text-muted-foreground shrink-0 uppercase tracking-tighter">on</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-1 h-10 justify-between bg-white text-sm font-medium shadow-sm">
                          {scheduleDates.length > 0 ? `${scheduleDates.length} date(s) selected` : "Pick specific date(s)"}
                          <CalendarIcon className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="multiple"
                          selected={scheduleDates}
                          onSelect={(d) => {
                            setScheduleDates(d || []);
                            setScheduleDays([]);
                            setScheduleMonthDay("");
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </TabsContent>

                <TabsContent value="monthly" className="pt-3">
                  <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-lg border">
                    <span className="text-xs font-bold text-muted-foreground shrink-0 uppercase tracking-tighter">every</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-1 h-10 justify-between bg-white text-sm font-medium shadow-sm">
                          {scheduleMonthDay !== "" ? `Day ${scheduleMonthDay}` : "Select day"}
                          <CalendarDays className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <div className="space-y-3">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Select Day of Month</span>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => {
                                  setScheduleMonthDay(day);
                                  setScheduleDays([]);
                                  setScheduleDates([]);
                                }}
                                className={cn(
                                  "aspect-square rounded-md text-[10px] font-medium transition-all border flex items-center justify-center",
                                  scheduleMonthDay === day
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background hover:border-primary/50 text-foreground"
                                )}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          {scheduleMonthDay !== "" && scheduleMonthDay > 28 && (
                            <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-100 text-[9px] text-amber-700 flex items-start gap-1.5 animate-in fade-in slide-in-from-top-1">
                              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                              <span>Day {scheduleMonthDay} does not exist in all months. This schedule will skip months that lack this date {scheduleMonthDay === 31 ? "(e.g. Feb, Apr, Jun, Sep, Nov)" : scheduleMonthDay === 30 ? "(e.g. Feb)" : "(e.g. Feb in common years)"}.</span>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>{scheduleType === "screenshot" ? "Capture Times" : "Time Ranges"}</Label>
                <Button variant="ghost" size="sm" onClick={addScheduleTimeRange} className="h-7 text-xs gap-1 text-primary hover:bg-primary/5">
                  <Plus className="h-3 w-3" /> {scheduleType === "screenshot" ? "Add Time" : "Add Range"}
                </Button>
              </div>

              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                {scheduleTimeRanges.map((range, idx) => (
                  <div key={idx} className="flex items-center gap-2 group animate-in fade-in slide-in-from-top-1">
                    <Input
                      type="time"
                      value={range.start}
                      onChange={e => updateScheduleTimeRange(idx, "start", e.target.value)}
                      lang="en-GB"
                      step="60"
                      className="h-9"
                    />
                    {scheduleType === "video" && (
                      <>
                        <span className="text-muted-foreground text-xs font-bold">TO</span>
                        <Input
                          type="time"
                          value={range.end}
                          onChange={e => updateScheduleTimeRange(idx, "end", e.target.value)}
                          lang="en-GB"
                          step="60"
                          className="h-9"
                        />
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => removeScheduleTimeRange(idx)} disabled={scheduleTimeRanges.length === 1} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {scheduleError && <div className="text-xs text-destructive p-2 bg-destructive/10 rounded-md font-medium">{scheduleError}</div>}
            {scheduleSuccess && <div className="text-xs text-green-600 p-2 bg-green-600/10 rounded-md font-medium">{scheduleSuccess}</div>}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsScheduleOpen(false)} className="flex-1 font-bold">Cancel</Button>
              <Button
                onClick={handleScheduleRecording}
                className="flex-1 font-bold gap-2"
                disabled={!scheduleCamera || !(() => {
                  const cameras = scheduleCamera.split(",");
                  return cameras.every(camStr => {
                    const parts = camStr.split(":");
                    const cameraId = parts[1] || parts[0];
                    return hasCameraEditPermission(effectiveUser, cameraId);
                  });
                })()}
                title={!scheduleCamera ? "Select a camera" : !(() => {
                  const cameras = scheduleCamera.split(",");
                  return cameras.every(camStr => {
                    const parts = camStr.split(":");
                    const cameraId = parts[1] || parts[0];
                    return hasCameraEditPermission(effectiveUser, cameraId);
                  });
                })() ? "No permission for some of the selected cameras" : "Save Schedule"}
              >
                <PlayCircle className="h-4 w-4" /> Save Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
        {(() => {
          const firstPendingRec = pendingCancelIds.length === 1 ? visibleScheduledRecordings.find(r => r.id === pendingCancelIds[0]) : null;
          // Only show "skip" UI when: individual date cancel (not force-delete) + recurring schedule
          const isSkip = !pendingCancelForceDelete && !!(firstPendingRec?.recurrence && firstPendingRec.recurrence !== "none");

          const sampleRec = visibleScheduledRecordings.find(r => pendingCancelIds.includes(r.id));
          const allForSameCamera = sampleRec ? pendingCancelIds.every(id => {
            const r = visibleScheduledRecordings.find(x => x.id === id);
            return r && r.cameraId === sampleRec.cameraId;
          }) : false;

          const cameraSchedules = sampleRec ? visibleScheduledRecordings.filter(r => r.cameraId === sampleRec.cameraId) : [];
          const isCameraClearAll = allForSameCamera && pendingCancelIds.length === cameraSchedules.length && cameraSchedules.length > 1;
          const isGlobalClearAll = !allForSameCamera && pendingCancelIds.length === visibleScheduledRecordings.length && visibleScheduledRecordings.length > 1;

          return (
            <NoOverlayAlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-slate-900 flex items-center gap-2">
                  {isSkip ? (
                    <>
                      <Trash2 className="h-5 w-5 text-sky-500" />
                      Skip to next occurrence?
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-5 w-5 text-destructive" />
                      {isGlobalClearAll
                        ? "Clear All Cameras Queue?"
                        : isCameraClearAll
                          ? "Clear Camera Queue?"
                          : "Remove Schedule?"}
                    </>
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-600">
                  {isSkip ? (
                    `Skip this recording day (${firstPendingRec?.date ? format(new Date(firstPendingRec.date), "MMM d") : "this date"}) and move to the next scheduled occurrence?`
                  ) : isGlobalClearAll ? (
                    <>
                      Are you sure you want to remove all items from the scheduled queue for{" "}
                      <strong className="font-bold uppercase">ALL CAMERAS</strong>?
                    </>
                  ) : isCameraClearAll ? (
                    <>
                      Are you sure you want to remove all scheduled items for{" "}
                      <strong>Camera {(sampleRec?.cameraName || "this camera").toUpperCase()}</strong>?
                    </>
                  ) : (
                    <>
                      Are you sure you want to permanently remove this schedule for{" "}
                      <strong>Camera {(sampleRec?.cameraName || "this camera").toUpperCase()}</strong>?
                    </>
                  )}

                  {visibleScheduledRecordings.some(
                    (r) => pendingCancelIds.includes(r.id) && r.status === "recording"
                  ) && (
                      <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive font-medium text-xs">
                        Warning: This includes active recordings that will be stopped immediately.
                      </div>
                    )}

                  {!isSkip && (
                    <div className="mt-2 text-xs opacity-60">
                      This action cannot be undone.
                    </div>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-transparent border-slate-200 text-slate-500 hover:bg-slate-50">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmCancelAction} className={cn(
                  "text-white hover:opacity-90",
                  isSkip ? "bg-sky-500" : "bg-destructive"
                )}>
                  {isSkip ? "Skip" : "Confirm Removal"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </NoOverlayAlertDialogContent>
          );
        })()}
      </AlertDialog>
      <Dialog open={!!previewSnapshot} onOpenChange={(open) => !open && setPreviewSnapshot(null)}>
        <DialogContent
          className="max-w-[70vw] p-0 border-none overflow-hidden flex flex-col items-center shadow-2xl !gap-0"
          style={{ backgroundColor: '#000000', opacity: 1 }}
          closeButtonClassName="bg-white text-black opacity-100 hover:bg-white/90 border-none rounded-sm translate-y-[-4px]"
        >
          <div className="w-full bg-black p-4 flex justify-between items-center" style={{ backgroundColor: '#000000' }}>
            <h1 className="text-white font-bold text-sm tracking-tight">PREVIEW</h1>
          </div>
          <div className="w-full flex justify-center bg-black" style={{ backgroundColor: '#000000' }}>
            {previewSnapshot && (
              <img
                src={previewSnapshot.url}
                alt="Snapshot Preview"
                className="max-h-[85vh] h-auto w-auto shadow-2xl block"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* SETTINGS DIALOG */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" /> General Settings
            </DialogTitle>
            <DialogDescription>
              Configure where recordings and snapshots are archived on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Camera className="h-3 w-3" /> Snapshot Storage Path
              </Label>
              <Input
                placeholder="E.g. D:\Snapshots"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
              <p className="text-[9px] text-muted-foreground italic">
                Absolute path for .png captures.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Video className="h-3 w-3" /> Video Storage Path
              </Label>
              <Input
                placeholder="E.g. D:\Recordings"
                value={videoStoragePath}
                onChange={(e) => setVideoStoragePath(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
              <p className="text-[9px] text-muted-foreground italic">
                Absolute path for .mp4 video files.
              </p>
            </div>

            {(!storagePath || !videoStoragePath) && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-3">
                <div className="mt-0.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /></div>
                <p className="text-[10px] text-amber-700 leading-tight">
                  <span className="font-bold">Notice:</span> Empty paths will use the default "data" directory.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 mt-4 border-t">
            <Button variant="ghost" onClick={() => setIsSettingsOpen(false)} className="h-9">Cancel</Button>
            <Button onClick={handleSaveSettings} className="h-9 px-6 bg-slate-900 border-slate-900">Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

