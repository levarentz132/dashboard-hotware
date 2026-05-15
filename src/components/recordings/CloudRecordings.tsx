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
  CalendarDays, Pencil, AlertCircle, Settings, User, LayoutGrid, LayoutList, Archive, CheckCircle2
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { format, addDays, nextDay, Day } from "date-fns";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { useAuth } from "@/contexts/auth-context";
import { isAdmin, isVmsAdmin, hasCameraViewPermission, hasCameraEditPermission } from "@/lib/auth";
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
} from "./recordings-service";
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
  startedAt?: number;
  recurrence?: "none" | "weekday" | "monthday";
  recurrenceDay?: number;
  batchId?: string;
  scheduledBy?: string;
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
  // ---- Enrichment state for permissions and VMS identity ----
  const [vmsEnrichedUser, setVmsEnrichedUser] = useState<UserPublic | null>(null);

  // Caching and Race Condition Prevention
  const recordingsCache = useRef<Map<string, RecentRecording[]>>(new Map());
  const activeAbortController = useRef<AbortController | null>(null);
  const lastRequestTime = useRef<number>(0);

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
  const isEffectiveAdmin = React.useMemo(() => {
    if (!vmsEnrichedUser || vmsEnrichedUser.username === "Verifying...") return false;
    // Use strict VMS admin check for this specific button
    return isVmsAdmin(vmsEnrichedUser);
  }, [vmsEnrichedUser]);

  const visibleDevices = React.useMemo(() => {
    if (!effectiveUser) return [];
    if (isEffectiveAdmin) return devices;
    return devices.filter(d => hasCameraViewPermission(effectiveUser, d.id));
  }, [devices, effectiveUser, isEffectiveAdmin]);

  // ---- Permission-filtered view of schedules (always uses current localUser/enrichedUser) ----
  const visibleScheduledRecordings = React.useMemo(() => {
    if (!effectiveUser) return [];
    
    // Admin bypass: admins always see all schedules
    if (isEffectiveAdmin) {
        return scheduledRecordings;
    }
    
    return scheduledRecordings.filter(s => hasCameraViewPermission(effectiveUser, s.cameraId));
  }, [scheduledRecordings, effectiveUser, isEffectiveAdmin]);

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
    
    const idsToCancel = [...pendingCancelIds];
    setIsCancelConfirmOpen(false);
    setPendingCancelIds([]);

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
  const hasLoadedFromDisk = useRef(false);
  const lastActionTime = useRef(0);

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
          nxLocationPort,
          notificationUserKey: getNotificationUserKey()
        }),
      });
    } catch (e) { console.error("[Persistence] Save failed:", e); }
  };

  const loadFromPersistence = async () => {
    // RACE CONDITION PREVENTION:
    // If we recently performed an action (save/delete), skip polling for 5 seconds
    // to give the server time to finish writing the file and for the next poll to get fresh data.
    if (Date.now() - lastActionTime.current < 5000) return;

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
          const loadedScheds = data.schedules.map((s: any) => ({
            ...s,
            date: new Date(s.date)
          }));

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
              if (rec.status === "pending" || rec.status === "recording" || rec.status === "in progress") {
                reconcileTimer(rec);
              }
            });
          }
        }
        if (data.vmsUsername) {
          setVmsEnrichedUser(prev => prev ? ({
            ...prev,
            username: data.vmsUsername || prev.username
          } as UserPublic) : null);
        }
        // Mark as loaded so saveToPersistence knows it's safe to write
        hasLoadedFromDisk.current = true;
      }
    } catch (e) { console.error("[Persistence] Load failed:", e); }
  };

  const reconcileTimer = (rec: ScheduledRecording) => {
    // Clear existing timers for this record to avoid duplicates on re-load/poll
    if (scheduleTimers.current.has(rec.id + "-start")) {
      clearTimeout(scheduleTimers.current.get(rec.id + "-start"));
      scheduleTimers.current.delete(rec.id + "-start");
    }
    if (scheduleTimers.current.has(rec.id + "-end")) {
      clearTimeout(scheduleTimers.current.get(rec.id + "-end"));
      scheduleTimers.current.delete(rec.id + "-end");
    }

    const [sh, sm] = rec.startTime.split(":").map(Number);
    const now = Date.now();
    const startMs = new Date(rec.date).setHours(sh, sm, 0, 0);

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // --- CASE 1: SCREENSHOTS (Snapshots) ---
    if (rec.type === "screenshot") {
      const captureDelay = 3000;
      const targetMs = startMs + captureDelay;
      if (now >= targetMs) return;

      // Only set timer if it's within the next 24 hours to avoid 32-bit setTimeout overflow (24.8 days)
      if (targetMs - now < ONE_DAY_MS) {
        const timer = setTimeout(() => {
          console.log(`[CloudRecordings] Snapshot time reached for ${rec.cameraName}. Cleaning up UI.`);
          if (rec.recurrence === "none") {
            setScheduledRecordings(prev => {
              const next = prev.filter(r => r.id !== rec.id);
              saveToPersistence(next, originalSchedules.current);
              return next;
            });
          } else {
            loadFromPersistence();
          }
          setTimeout(() => handleSearchRecentRecordings(undefined, undefined, undefined, true), 3000);
        }, targetMs - now);
        
        scheduleTimers.current.set(rec.id + "-start", timer);
      }
      return;
    }

    // --- CASE 2: VIDEOS ---
    const [eh, em] = rec.endTime.split(":").map(Number);
    const endMs = new Date(rec.date).setHours(eh, em, 59, 999);

    if (now >= endMs) {
      if (rec.status === "recording") cancelSchedule(rec.id);
      return;
    }

    // Only set timer if it's within the next 24 hours to avoid 32-bit setTimeout overflow
    if (now < startMs && (startMs - now < ONE_DAY_MS)) {
      const timer = setTimeout(() => {
        setScheduledRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, status: "recording" } : r));
      }, startMs - now);
      scheduleTimers.current.set(rec.id + "-start", timer);
    }

    if (now < endMs && (rec.status === "recording" || now >= startMs) && (endMs - now < ONE_DAY_MS)) {
      const timer = setTimeout(async () => {
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

        // Note: Auto-save has been moved to the server-side watchdog for reliability.
        console.log(`[CloudRecordings] Recording ${rec.cameraName} finished. Server watchdog will handle auto-save.`);

        if (rec.recurrence === "none") {
          setScheduledRecordings(prev => {
            const next = prev.filter(r => r.id !== rec.id);
            saveToPersistence(next, originalSchedules.current);
            return next;
          });
        } else {
          // For recurring: the watchdog will handle the date skip, 
          // but we can trigger a reload to stay in sync.
          loadFromPersistence();
        }
        
        // Auto-refresh results after recording finishes
        // We use a larger delay for video to allow VMS to index and watchdog to auto-save
        setTimeout(() => handleSearchRecentRecordings(undefined, undefined, undefined, true), 7000);
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

  // Smart polling: Only poll status from the watchdog if there are active tasks.
  // This reduces background network traffic while ensuring the UI updates when a recording finishes.
  useEffect(() => {
    if (scheduledRecordings.length === 0) return;

    const pollId = setInterval(loadFromPersistence, 5000);
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
      setTimeout(() => handleSearchRecentRecordings(undefined, undefined, undefined, true), 3000); // Small delay to allow VMS to index
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

  const normalizeId = (v: any) => String(v || "").replace(/[{}]/g, "").toLowerCase();

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
    const list = devList || devices;
    const d = list.find((dev: any) => normalizeId(dev.id) === String(normalizedId));
    return d ? String(d.id) : String(normalizedId);
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

    if (value !== "all") {
      const [sysId, devId] = value.split(":");
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

  const handleScheduleRecording = () => {
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

    // Identify which cameras to schedule (always a single camera now)
    const camerasToSchedule = devices.filter(d => `${d.systemId}:${normalizeId(d.id)}` === scheduleCamera);

    if (camerasToSchedule.length === 0) {
      setScheduleError("No cameras found to schedule.");
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
          const [lastH, lastM] = (scheduleType === "screenshot" ? scheduleScreenshotTime : scheduleTimeRanges[scheduleTimeRanges.length - 1].end).split(":").map(Number);

          while (true) {
            const windowEnd = new Date(targetDate).setHours(lastH, lastM, 59, 999);
            if (targetDate.getDay() === dayIndex && windowEnd >= now.getTime()) break;
            targetDate.setDate(targetDate.getDate() + 1);
          }

          if (scheduleType === "screenshot") {
            scheduleTargets.push({ date: targetDate, start: scheduleScreenshotTime, end: scheduleScreenshotTime });
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
        const [lastH, lastM] = (scheduleType === "screenshot" ? scheduleScreenshotTime : scheduleTimeRanges[scheduleTimeRanges.length - 1].end).split(":").map(Number);
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
          scheduleTargets.push({ date: new Date(targetDate), start: scheduleScreenshotTime, end: scheduleScreenshotTime });
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
            scheduleTargets.push({ date: tDate, start: scheduleScreenshotTime, end: scheduleScreenshotTime });
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

        // ── NEW LOGIC: Skip if time has already started/passed for recurring tasks ──
        if (isRecurring && startMs < nowMs) {
          // Move to next occurrence
          if (scheduleDays.length > 0) {
            // Weekly
            finalTDate.setDate(finalTDate.getDate() + 7);
          } else {
            // Monthly
            const dayNum = Number(scheduleMonthDay);
            let y = finalTDate.getFullYear();
            let mIdx = finalTDate.getMonth();
            while (true) {
              mIdx++;
              const next = new Date(y, mIdx, dayNum);
              if (next.getDate() === dayNum) { finalTDate = next; break; }
            }
          }
          // Recalculate Ms
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
          scheduledBy: effectiveUser?.username || "System",
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
      setScheduledRecordings(prev => {
        // Remove old entries for this batch OR remove duplicates if adding individual tasks
        let filtered = prev;
        if (scheduleBatchId) {
          filtered = prev.filter(r => r.batchId !== scheduleBatchId);
        } else {
          // Individual task: remove existing matches for same camera/time/type
          const newIds = new Set(newScheduledEntries.map(n => n.id));
          const newKeys = new Set(newScheduledEntries.map(n => `${n.cameraId}-${n.startTime}-${n.type}-${new Date(n.date).toDateString()}`));
          filtered = prev.filter(r => !newIds.has(r.id) && !newKeys.has(`${r.cameraId}-${r.startTime}-${r.type}-${new Date(r.date).toDateString()}`));
        }
        const next = [...filtered, ...newScheduledEntries];
        saveToPersistence(next, originalSchedules.current);
        return next;
      });

      // Set up client-side end timers immediately for tasks that start now
      // This ensures the UI cleans up even if polling hasn't synced yet
      newScheduledEntries.forEach(entry => {
        reconcileTimer(entry);
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
  const handleSearchRecentRecordings = async (overrideDevice?: string, overrideDate?: Date, overrideSystem?: string, isAutoRefresh: boolean = false) => {
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

    // 1. Check cache (skip for auto-refresh to get fresh data)
    if (!isAutoRefresh) {
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
        controller.signal
      );
      
      // Check if this request is still the most recent one
      if (lastRequestTime.current !== requestTime) return;

      const allPeriods = Array.isArray(data) ? data : data?.reply || [];
      
      // Filter results: power users/admins see all, normal users only see cameras they can edit
      const periods = allPeriods.filter((p: any) => hasCameraViewPermission(effectiveUser, p.deviceId));

      if (isAutoRefresh && periods.length === 0 && recentRecordings.length > 0) return;

      const mapped: RecentRecording[] = periods.map((p: any, i: number) => {
        const duration = p.durationMs || 0;
        const isScreenshot = duration <= 5000 || p.isScreenshot;
        
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
      setRecentRecordings(mapped);
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
      <Tabs defaultValue="results" className="w-full space-y-6">
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
                      handleSearchRecentRecordings(selectedDevice, date); 
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

            <TabsContent value="scheduled" className="focus-visible:outline-none mt-0">
              <div className="col-span-full flex items-center justify-between mb-4 bg-muted/20 p-3 rounded-2xl border">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 px-2">
                  <Clock className="h-4 w-4" />
                  Active Tasks ({visibleScheduledRecordings.length})
                </h2>
                <div className="flex items-center gap-2">
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

              <div className="col-span-full mb-6">
                <div className="relative max-w-md">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search cameras..."
                    value={scheduledSearch}
                    onChange={(e) => setScheduledSearch(e.target.value)}
                    className="h-10 pr-11 text-sm rounded-2xl bg-white border-slate-200 shadow-sm focus:ring-primary/20 transition-all hover:border-slate-300"
                  />
                </div>
              </div>

              {visibleScheduledRecordings.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4 border-2 border-dashed rounded-3xl bg-muted/20">
                  <div className="bg-muted p-6 rounded-full shadow-inner">
                    <Clock className="h-10 w-10 opacity-40" />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-slate-700">No active schedules</p>
                    <p className="text-sm text-slate-500">You haven't created any recording schedules yet.</p>
                    <Button
                      onClick={() => setIsScheduleOpen(true)}
                      className="mt-4 px-8 h-11 rounded-2xl font-bold shadow-lg hover:shadow-primary/20 transition-all gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Create your first schedule
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="col-span-full border rounded-2xl bg-white overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader className="bg-white border-b border-slate-200">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-28 text-center text-black font-normal text-xs">Status</TableHead>
                        <TableHead className="w-28 text-center text-black font-normal text-xs">Type</TableHead>
                        <TableHead className="text-black font-normal text-xs">Camera</TableHead>
                        <TableHead className="text-black font-normal text-xs">Time</TableHead>
                        <TableHead className="text-black font-normal text-xs">Date</TableHead>
                        <TableHead className="text-black font-normal text-xs">Frequency</TableHead>
                        <TableHead className="text-black font-normal text-xs">Created By</TableHead>
                        <TableHead className="text-right text-black font-normal text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.values(visibleScheduledRecordings
                        .filter(r => !scheduledSearch || r.cameraName.toLowerCase().includes(scheduledSearch.toLowerCase()))
                        .reduce((acc: Record<string, ScheduledRecording[]>, r) => {
                          const key = r.batchId || `${r.cameraId}-${r.startTime}-${r.endTime}-${r.type}`;
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(r);
                          return acc;
                        }, {}))
                        .sort((a, b) => {
                          const dateA = Math.min(...a.map(r => new Date(r.date).getTime()));
                          const dateB = Math.min(...b.map(r => new Date(r.date).getTime()));
                          return dateA - dateB;
                        })
                        .map((group, gIdx) => {
                          const first = group[0];
                          const anyRecording = group.some((r: ScheduledRecording) => r.status === "recording" || r.status === "in progress" || r.status === "capturing");
                          const anyProcessing = group.some((r: ScheduledRecording) => r.status === "processing");
                          const anyFailed = group.some((r: ScheduledRecording) => r.status === "failed");
                          const allCompleted = group.every(r => r.status === "completed");
                          const isRecurring = group.some(r => r.recurrence && r.recurrence !== "none");
                          
                          const mainStatus = anyRecording ? "in progress" : 
                                           anyProcessing ? "processing" :
                                           anyFailed ? "failed" :
                                           allCompleted ? "completed" : "active";

                          const sortedDates = [...group].map(r => new Date(r.date)).sort((a, b) => a.getTime() - b.getTime());
                          const dateList = Array.from(new Set(sortedDates.map(d => format(d, "MMM d"))));
                          const displayDates = dateList.length > 3 ? `${dateList.slice(0, 3).join(", ")}...` : dateList.join(", ");

                          return (
                            <TableRow key={gIdx} className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                              <TableCell className="text-center">
                                <span className={cn(
                                  "text-[12px] px-2 py-0.5 rounded-full border",
                                  mainStatus === "in progress" ? "bg-red-50 text-red-600 border-red-100 animate-pulse" :
                                  mainStatus === "processing" ? "bg-amber-50 text-amber-600 border-amber-100 animate-pulse" :
                                  mainStatus === "completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                  mainStatus === "failed" ? "bg-rose-50 text-rose-600 border-rose-100" :
                                  "bg-sky-50 text-sky-600 border-sky-100"
                                )}>
                                  {mainStatus}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-[12px] text-black">
                                {first.type === "screenshot" ? "snapshot" : "video"}
                              </TableCell>
                              <TableCell className="text-black text-[12px]">{first.cameraName}</TableCell>
                              <TableCell className="text-black text-[12px]">
                                {first.type === "screenshot" ? first.screenshotTime : `${first.startTime} - ${first.endTime}`}
                              </TableCell>
                              <TableCell className="text-black text-[12px]">
                                {displayDates}
                              </TableCell>
                              <TableCell className="text-black text-[12px]">
                                {isRecurring ? (first.recurrence === 'weekday' ? 'weekly' : 'monthly') : 'once'}
                              </TableCell>
                              <TableCell className="text-black text-[12px]">
                                {first.scheduledBy || 'system'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {(() => {
                                    const isOwner = first.scheduledBy === effectiveUser?.username;
                                    const canModify = isEffectiveAdmin || isOwner;
                                    const hasCamEdit = hasCameraEditPermission(effectiveUser, first.cameraId);
                                    const modifyDisabled = !canModify || !hasCamEdit;

                                    return (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          disabled={modifyDisabled}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setScheduleCamera(`${first.systemId}:${first.cameraId}`);
                                            setScheduleSystem(first.systemId);
                                            setScheduleType(first.type);
                                            setScheduleBatchId(first.batchId || null);
                                            setScheduleDates(group.map(r => new Date(r.date)));
                                            if (first.type === "video") {
                                              setScheduleTimeRanges([{ start: first.startTime, end: first.endTime }]);
                                            } else {
                                              setScheduleScreenshotTime(first.startTime);
                                            }

                                            // Choose the correct frequency tab
                                            if (first.recurrence === "weekday") {
                                              setScheduleFrequencyTab("weekly");
                                              // scheduleDays are set by group mapping if implemented, 
                                              // but for now we extract from the group
                                              const days = group.filter(r => r.recurrence === "weekday").map(r => new Date(r.date).getDay());
                                              setScheduleDays([...new Set(days)]);
                                            } else if (first.recurrence === "monthday") {
                                              setScheduleFrequencyTab("monthly");
                                              setScheduleMonthDay(first.recurrenceDay || "");
                                            } else {
                                              setScheduleFrequencyTab("specific");
                                              setScheduleDates(group.map(r => new Date(r.date)));
                                            }

                                            setIsScheduleOpen(true);
                                          }}
                                          className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-100 text-black transition-all disabled:opacity-30"
                                          title={!canModify ? "Only admins or the creator can edit this schedule" : !hasCamEdit ? "No edit permission for this camera" : "Edit Schedule"}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          disabled={modifyDisabled}
                                          onClick={(e) => { e.stopPropagation(); requestCancel(group.map(r => r.id), true); }}
                                          className="h-8 w-8 rounded-md border border-slate-200 hover:bg-red-50 text-black hover:text-red-600 transition-all disabled:opacity-30"
                                          title={!canModify ? "Only admins or the creator can remove this schedule" : !hasCamEdit ? "No edit permission for this camera" : "Remove Schedule"}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
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


      {/* NEW SCHEDULE DIALOG */}
      <Dialog open={isScheduleOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {scheduleBatchId || scheduleCamera ? "Edit Recording Schedule" : "New Recording Schedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <SearchableCameraSelect
              value={scheduleCamera}
              onValueChange={handleScheduleSelectDevice}
              devices={visibleDevices}
              loadingDevices={loadingDevices}
              normalizeId={normalizeId}
              placeholder="Choose Camera"
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
                          disabled={{ after: new Date() }}
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
                <Label>{scheduleType === "screenshot" ? "Capture Time" : "Time Ranges"}</Label>
                {scheduleType === "video" && (
                  <Button variant="ghost" size="sm" onClick={addScheduleTimeRange} className="h-7 text-xs gap-1 text-primary hover:bg-primary/5">
                    <Plus className="h-3 w-3" /> Add Range
                  </Button>
                )}
              </div>

              {scheduleType === "screenshot" ? (
                <Input
                  type="time"
                  value={scheduleScreenshotTime}
                  onChange={e => setScheduleScreenshotTime(e.target.value)}
                  lang="en-GB"
                  step="60"
                  className="h-10"
                />
              ) : (
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
                      <span className="text-muted-foreground text-xs font-bold">TO</span>
                      <Input
                        type="time"
                        value={range.end}
                        onChange={e => updateScheduleTimeRange(idx, "end", e.target.value)}
                        lang="en-GB"
                        step="60"
                        className="h-9"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeScheduleTimeRange(idx)} disabled={scheduleTimeRanges.length === 1} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {scheduleError && <div className="text-xs text-destructive p-2 bg-destructive/10 rounded-md font-medium">{scheduleError}</div>}
            {scheduleSuccess && <div className="text-xs text-green-600 p-2 bg-green-600/10 rounded-md font-medium">{scheduleSuccess}</div>}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsScheduleOpen(false)} className="flex-1 font-bold">Cancel</Button>
              <Button
                onClick={handleScheduleRecording}
                className="flex-1 font-bold gap-2"
                disabled={!scheduleCamera || !hasCameraEditPermission(effectiveUser, scheduleCamera.includes(':') ? scheduleCamera.split(':')[1] : scheduleCamera)}
                title={!scheduleCamera ? "Select a camera" : !hasCameraEditPermission(effectiveUser, scheduleCamera.includes(':') ? scheduleCamera.split(':')[1] : scheduleCamera) ? "No permission for this camera" : "Save Schedule"}
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
          const isClearAll = pendingCancelIds.length === visibleScheduledRecordings.length && visibleScheduledRecordings.length > 1;

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
                      {isClearAll
                        ? "Clear complete queue?"
                        : "Remove schedule?"}
                    </>
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-600">
                  {isSkip
                    ? `Skip this recording day (${firstPendingRec?.date ? format(new Date(firstPendingRec.date), "MMM d") : "this date"}) and move to the next scheduled occurrence?`
                    : (isClearAll
                      ? "Are you sure you want to remove all items from your scheduled queue?"
                      : (pendingCancelIds.length > 1
                        ? `Are you sure you want to permanently delete this entire schedule (${pendingCancelIds.length} dates)?`
                        : "Are you sure you want to permanently remove this schedule?"))}

                  {visibleScheduledRecordings.some(r => pendingCancelIds.includes(r.id) && r.status === "recording") && (
                    <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive font-medium text-xs">
                      Warning: This includes active recordings that will be stopped immediately.
                    </div>
                  )}

                  {!isSkip && <div className="mt-2 text-xs opacity-60">This action cannot be undone.</div>}
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

