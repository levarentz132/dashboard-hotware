"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CalendarIcon, Download, Loader2, Video, Cloud, LogIn, Camera, Clock, List, Search, Image as ImageIcon2, Eye, StopCircle, PlayCircle, RefreshCw, X, Plus, Trash2, CalendarDays, Pencil, AlertCircle, Settings } from "lucide-react";
import { format, addDays, nextDay, Day } from "date-fns";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
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
  status: "pending" | "recording" | "completed" | "failed" | "in progress";
  startedAt?: number;
  recurrence?: "none" | "weekday" | "monthday";
  recurrenceDay?: number;
  batchId?: string;
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
}

interface ScheduleTimeRange {
  start: string;
  end: string;
}

// Moved outside to prevent re-creation on every render which causes dropdowns to close
const CameraSelect = ({ 
  value, 
  onValueChange, 
  devices, 
  loadingDevices, 
  normalizeId 
}: { 
  value: string; 
  onValueChange: (v: string) => void;
  devices: any[];
  loadingDevices: boolean;
  normalizeId: (id: any) => string;
}) => (
  <div className="w-full">
    {loadingDevices ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Retrieving...
      </div>
    ) : (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          <SelectItem value="all">
            <span className="font-bold text-primary">All Cameras</span>
          </SelectItem>
          {devices.map((device: any) => (
            <SelectItem key={`${device.systemId}-${device.id}`} value={`${device.systemId}:${normalizeId(device.id)}`}>
              <span className="font-medium">{device.name || device.id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  </div>
);

const ScheduleCameraSelect = ({ 
  value, 
  onValueChange, 
  devices, 
  loadingDevices, 
  normalizeId 
}: { 
  value: string; 
  onValueChange: (v: string) => void;
  devices: any[];
  loadingDevices: boolean;
  normalizeId: (id: any) => string;
}) => (
  <div className="w-full">
    {loadingDevices ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Retrieving...
      </div>
    ) : (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose Camera" />
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          {devices.map((device: any) => (
            <SelectItem key={`sched-${device.systemId}-${device.id}`} value={`${device.systemId}:${normalizeId(device.id)}`}>
              <span className="font-medium">{device.name || device.id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  </div>
);

export default function CloudRecordings() {
  // ---- Shared state ----
  const [systems, setSystems] = useState<CloudSystem[]>([]);
  const [devices, setDevices] = useState<(CloudDevice & { systemId: string; systemName: string })[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>("127.0.0.1");
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [localSystemName, setLocalSystemName] = useState<string>("");
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [devicesReady, setDevicesReady] = useState(false);
  const [requiresCloudAuth, setRequiresCloudAuth] = useState(false);
  const [globalError, setGlobalError] = useState<string>("");

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
  
  // ---- Settings state ----
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [storagePath, setStoragePath] = useState("");

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
    for (const id of pendingCancelIds) {
      await cancelSchedule(id, pendingCancelForceDelete);
    }
    setIsCancelConfirmOpen(false);
    setPendingCancelIds([]);
    setPendingCancelForceDelete(false);
  };

  const scheduleTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const originalSchedules = useRef<Map<string, any>>(new Map());

  // ---- Persistence Logic ----
  const saveToPersistence = async (scheds: ScheduledRecording[], originals: any) => {
    try {
      const nxLocationIp = Cookies.get("nx_location_ip") || undefined;
      const nxLocationPort = Cookies.get("nx_location_port") || undefined;
      
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
          })).filter((s: any) => s.status !== "completed" && s.status !== "failed");
          setScheduledRecordings(loadedScheds);
          // Re-reconcile timers for anything pending/recording
          loadedScheds.forEach((rec: ScheduledRecording) => {
            if (rec.status === "pending" || rec.status === "recording") {
              reconcileTimer(rec);
            }
          });
        }
      }
    } catch (e) { console.error("[Persistence] Load failed:", e); }
  };

  const reconcileTimer = (rec: ScheduledRecording) => {
    // ONLY handle video tasks on client-side. 
    // Screenshot tasks are exclusively handled by the server-side watchdog.
    if (rec.type === "screenshot") return;

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
    const [eh, em] = rec.endTime.split(":").map(Number);
    const now = Date.now();
    const startMs = new Date(rec.date).setHours(sh, sm, 0, 0);
    const endMs = new Date(rec.date).setHours(eh, em, 59, 999);

    if (now >= endMs) {
      if (rec.status === "recording") cancelSchedule(rec.id); 
      return;
    }

    if (now < startMs) {
      const timer = setTimeout(() => {
        setScheduledRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, status: "recording" } : r));
      }, startMs - now);
      scheduleTimers.current.set(rec.id + "-start", timer);
    }

    if (now < endMs && (rec.status === "recording" || now >= startMs)) {
      const timer = setTimeout(async () => {
        // IMPROVEMENT: Immediately patch the device to stop recording when the timer expires
        // This ensures the recording stops at the exact same time the notification is shown.
        try {
          const cameraDeviceId = getOriginalDeviceId(rec.cameraId);
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
          message: `Recording for ${rec.cameraName} is finished and available for playback.`,
          systemId: rec.systemId,
          deviceId: rec.cameraId,
          startTimeMs: rec.startMs,
          endTimeMs: rec.endMs,
          durationMs: rec.endMs - rec.startMs
        });
        
        if (rec.recurrence === "none") {
          setScheduledRecordings(prev => prev.filter(r => r.id !== rec.id));
        } else {
          // For recurring: the watchdog will handle the date skip, 
          // but we can trigger a reload to stay in sync.
          loadFromPersistence();
        }
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
      }
    } catch { }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch("/api/cloud/recordings/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath }),
      });
      if (res.ok) {
        setIsSettingsOpen(false);
        addPersistentNotification({ type: 'success', title: 'Settings Saved', message: 'Storage path updated successfully.' });
      }
    } catch (err: any) {
      addPersistentNotification({ type: 'error', title: 'Error', message: 'Failed to save settings.' });
    }
  };

  useEffect(() => {
    loadFromPersistence();
    fetchSettings();
    // Poll every 10 seconds to get updates from the watchdog (like captured screenshots)
    const pollId = setInterval(loadFromPersistence, 10000);
    return () => clearInterval(pollId);
  }, []);

  useEffect(() => {
    saveToPersistence(scheduledRecordings, originalSchedules.current);
  }, [scheduledRecordings]);

  // Auto-refresh logic: trigger when a task finishes or is removed
  const prevScheduledCount = useRef(scheduledRecordings.length);
  useEffect(() => {
    if (scheduledRecordings.length < prevScheduledCount.current) {
       // A task finished or was removed. Refresh the list to show new recording/snapshot.
       setTimeout(() => handleSearchRecentRecordings(), 1500); // Small delay to allow VMS to index
    }
    prevScheduledCount.current = scheduledRecordings.length;
  }, [scheduledRecordings.length]);

  // ---- Recent Recordings tab state ----
  const [recentRecordings, setRecentRecordings] = useState<RecentRecording[]>([]);
  const [recentSearch, setRecentSearch] = useState<string>("");
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentDate, setRecentDate] = useState<Date | undefined>(new Date());
  const [recentError, setRecentError] = useState<string>("");
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
        id: cam.id, name: cam.name, typeId: cam.typeId,
        systemId: localSystemId, systemName: "", // Hiding local system name text as requested
      }));
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
            id: cam.id, name: cam.name, typeId: cam.typeId,
            systemId: system.id, systemName: system.name,
          }));
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
        selectedSystem, getOriginalDeviceId(selectedDevice), startMs, endMs, undefined
      );
      const periods = Array.isArray(data) ? data : data?.reply || [];
      setRecordings(periods);
      if (periods.length === 0) setSearchError("No recordings found for the selected time range.");
    } catch (err: any) {
      setSearchError(err.message || "Failed to search recordings");
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePreview = (time: number, duration: number, sysId: string, devId: string, isLegacy?: boolean, fileName?: string, dateFolder?: string) => {
    if (duration <= 5000 || isLegacy) {
      let url = "";
      if (isLegacy && fileName && dateFolder) {
        url = `/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(fileName)}`;
      } else {
        url = `/api/cloud/recordings/thumbnail?systemId=${sysId}&deviceId=${devId.replace(/[{}]/g, "")}&timestampMs=${time}`;
      }
      
      const cam = devices.find(d => normalizeId(d.id) === devId);
      setPreviewSnapshot({ url, title: cam?.name || "Snapshot" });
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

  const handleDownload = (startTimeMs: number, durationMs: number, sysId?: string, devId?: string, isLegacy?: boolean, fileName?: string, dateFolder?: string) => {
    if (isLegacy && fileName && dateFolder) {
      window.open(`/api/cloud/recordings/screenshot/serve?date=${dateFolder}&file=${encodeURIComponent(fileName)}&download=true`, "_blank");
      return;
    }

    const params = new URLSearchParams({
      systemId: sysId || selectedSystem || "127.0.0.1",
      deviceId: devId || getOriginalDeviceId(selectedDevice),
      startTime: String(startTimeMs),
      endTime: String(startTimeMs + (durationMs || 1000)),
      stream: "true",  // Always proxy through Next.js so VMS token is applied server-side
    });
    window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
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
    setScheduleError("");
    setScheduleSuccess("");
    if (!scheduleCamera) { setScheduleError("Please select a camera."); return; }

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
          // If today matches the selected day, we included today as a target
          // This allows users to set a time like '11:00' when it's '12:00' and have it fire immediately.
          if (dayIndex === currentDay) {
            scheduleTimeRanges.forEach(range => {
              scheduleTargets.push({ date: new Date(now), start: range.start, end: range.end });
            });
          }

          // Also always schedule the *next* week's occurrence
          let targetDate = nextDay(now, dayIndex as Day);
          scheduleTimeRanges.forEach(range => {
            scheduleTargets.push({ date: targetDate, start: range.start, end: range.end });
          });
        });
      } else if (scheduleMonthDay !== "" && scheduleMonthDay > 0 && scheduleMonthDay <= 31) {
        // Monthly recurrence
        const now = new Date();
        const targetDayNum = Number(scheduleMonthDay);
        let year = now.getFullYear();
        let monthIdx = now.getMonth();
        let targetDate = new Date(year, monthIdx, targetDayNum);
        
        // If today is the target day, include it
        if (targetDate.getDate() === targetDayNum && targetDate.getMonth() === now.getMonth()) {
           scheduleTimeRanges.forEach(range => {
            scheduleTargets.push({ date: new Date(targetDate), start: range.start, end: range.end });
          });
        }

        // Also schedule the next occurrence if today is passed or already added
        if (targetDate < now || targetDate.getDate() !== targetDayNum) {
          while (true) {
            monthIdx++;
            targetDate = new Date(year, monthIdx, targetDayNum);
            if (targetDate.getDate() === targetDayNum) break;
          }
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

      if (scheduleTargets.length === 0) return;

      scheduleTargets.forEach(target => {
        const { date: tDate, start: tStart, end: tEnd } = target;
        const [sh, sm] = tStart.split(":").map(Number);
        const [eh, em] = tEnd.split(":").map(Number);

        const startMs = new Date(tDate).setHours(sh, sm, 0, 0);
        const endMs = scheduleType === "screenshot" ? startMs : new Date(tDate).setHours(eh, em, 59, 999);
        const nowMs = Date.now();
        
        // Skip if already finished
        if (endMs < nowMs && scheduleType !== "screenshot") return;
        if (endMs < startMs) return;

        // ── ADJUSTMENT: If start is in the past, set to NOW ──────────────────
        let effectiveStartMs = startMs;
        let effectiveStartTime = tStart;
        if (startMs < nowMs) {
          effectiveStartMs = nowMs;
          const dNow = new Date();
          effectiveStartTime = `${String(dNow.getHours()).padStart(2, '0')}:${String(dNow.getMinutes()).padStart(2, '0')}:${String(dNow.getSeconds()).padStart(2, '0')}`;
        }

        const entryId = `sched-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        // ── CASE: IMMEDIATE SNAPSHOT (Special Fast Path) ────────────────────
        if (scheduleType === "screenshot" && (effectiveStartMs <= nowMs + 10000)) {
          const immediateEntryId = `snap-${Date.now()}`;
          const snapshotEntry: ScheduledRecording = {
            id: immediateEntryId,
            cameraId: normalizeId(cameraDeviceId),
            cameraName: device?.name || "Sensor",
            systemId: systemId,
            systemName: device?.systemName || "",
            date: tDate,
            startTime: effectiveStartTime, 
            endTime: tEnd,
            startMs: effectiveStartMs,
            endMs: endMs,
            type: "screenshot",
            status: "in progress",
            batchId,
          };
          setScheduledRecordings(prev => [snapshotEntry, ...prev]);
          totalTasksScheduled++;

          (async () => {
            try {
              await fetch("/api/cloud/recordings/screenshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  systemId: systemId,
                  deviceId: cameraDeviceId,
                  cameraName: device?.name || "Camera",
                  timestampMs: Date.now(),
                  scheduledStartTime: effectiveStartTime, // Pass the adjusted time
                })
              });
              setScheduledRecordings(prev => prev.filter(r => r.id !== immediateEntryId));
              addPersistentNotification({ 
                type: 'success', 
                title: 'Snapshot Captured', 
                message: `Snapshot for ${device?.name || "Camera"} is complete and stored in local archive.`,
                systemId: systemId,
                deviceId: cameraDeviceId,
                startTimeMs: Date.now(),
                durationMs: 0 // Indicates snapshot
              });
              setTimeout(() => handleSearchRecentRecordings(), 1500);
            } catch (err: any) {
              setScheduledRecordings(prev => prev.filter(r => r.id !== immediateEntryId));
              addPersistentNotification({ type: 'error', title: 'Snapshot Failed', message: err.message });
            }
          })();
          return;
        }

        // ── CASE: FUTURE TASKS (Delegated to Watchdog) ──────────────────────
        const entryStatus = effectiveStartMs > nowMs ? "pending" : (scheduleType === "screenshot" ? "in progress" : "recording");
        const newEntry: ScheduledRecording = {
          id: entryId,
          cameraId: normalizeId(cameraDeviceId),
          cameraName: device?.name || "Sensor",
          systemId: systemId,
          systemName: device?.systemName || "",
          date: tDate,
          startTime: effectiveStartTime, // Use adjusted time if in the past
          endTime: tEnd,
          startMs: effectiveStartMs,
          endMs: endMs,
          type: scheduleType,
          status: entryStatus,
          recurrence: scheduleDays.length > 0 ? "weekday" : (scheduleMonthDay !== "" ? "monthday" : "none"),
          recurrenceDay: scheduleDays.length > 0 ? undefined : (scheduleMonthDay !== "" ? Number(scheduleMonthDay) : undefined),
          batchId,
        };
        if (scheduleType === "screenshot") {
          newEntry.screenshotTime = effectiveStartTime;
        }

        newScheduledEntries.push(newEntry);
        totalTasksScheduled++;
      });
    });

    if (totalTasksScheduled > 0) {
      setScheduledRecordings(prev => [...prev, ...newScheduledEntries]);
      setScheduleSuccess(`Successfully scheduled ${totalTasksScheduled} task(s).`);
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
      
      setScheduledRecordings(prev => prev.map(r => r.id === id ? { ...r, date: nextDate, status: "pending" } : r));
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
    setScheduledRecordings(prev => prev.filter(r => r.id !== id));
  };

  // ---- Recent Recordings ----
  const handleSearchRecentRecordings = async (overrideDevice?: string, overrideDate?: Date, overrideSystem?: string) => {
    const targetDevice = overrideDevice || selectedDevice;
    const targetDate = overrideDate || date;
    const targetSystem = overrideSystem || selectedSystem;

    if (!targetDevice || !targetDate) { setRecentError("Please select a camera and date."); return; }

    if (targetDevice === "all") {
      setRecentLoading(true);
      setRecentError("");
      setRecordings([]);
      try {
        const startMs = new Date(targetDate).setHours(0, 0, 0, 0);
        const endMs = new Date(targetDate).setHours(23, 59, 59, 999);
        
        const allResults = await Promise.all(devices.map(async (device) => {
          try {
            const data = await fetchRecordedTimePeriods(
              device.systemId, getOriginalDeviceId(device.id, devices), startMs, endMs, undefined
            );
            const periods = Array.isArray(data) ? data : data?.reply || [];
            return periods.map((p: any) => ({ ...p, dev: device }));
          } catch (e) { return []; }
        }));
        
        const flatResults = allResults.flat();
        
        // Deduplicate: If multiple cameras (due to same name) returned the same legacy snapshot file,
        // we should only show it once in the "All Cameras" view.
        const seenFiles = new Set<string>();
        const deduplicated = flatResults.filter(p => {
          if (p.isScreenshot && p.fileName) {
            const key = `${p.dateFolder || ""}/${p.fileName}`;
            if (seenFiles.has(key)) return false;
            seenFiles.add(key);
          }
          return true;
        });

        const mapped: RecentRecording[] = deduplicated.map((p: any, i: number) => {
          const duration = p.durationMs || 0;
          const isScreenshot = duration <= 5000 || p.isScreenshot;
          return {
            id: `recent-${i}-${p.startTimeMs}`,
            cameraName: p.dev.name,
            systemName: p.dev.systemName,
            startTimeMs: p.startTimeMs || 0,
            durationMs: duration,
            systemId: p.dev.systemId,
            deviceId: getOriginalDeviceId(p.dev.id, devices),
            isScreenshot,
            isLocal: p.isLocal,
            fileName: p.fileName,
            dateFolder: p.dateFolder,
          };
        });
        mapped.sort((a, b) => b.startTimeMs - a.startTimeMs);
        setRecentRecordings(mapped);
        if (mapped.length === 0) setRecentError("No recordings found for any camera on this date.");
      } catch (err: any) {
        setRecentError(err.message || "Failed to fetch all recordings.");
      } finally {
        setRecentLoading(false);
      }
      return;
    }

    setRecentLoading(true);
    setRecentError("");
    setRecordings([]); // Clear specific search
    try {
      const startMs = new Date(targetDate).setHours(0, 0, 0, 0);
      const endMs = new Date(targetDate).setHours(23, 59, 59, 999);
      
      const data = await fetchRecordedTimePeriods(
        targetSystem, getOriginalDeviceId(targetDevice), startMs, endMs, undefined
      );
      const periods = Array.isArray(data) ? data : data?.reply || [];
      
      // Get camera name for display metadata
      const dev = devices.find(d => normalizeId(d.id) === targetDevice && d.systemId === targetSystem);
      
      const mapped: RecentRecording[] = periods.map((p: any, i: number) => {
        const duration = p.durationMs || 0;
        const isScreenshot = duration <= 5000 || p.isScreenshot;
        return {
          id: `recent-${i}-${p.startTimeMs}`,
          cameraName: dev?.name || targetDevice,
          systemName: dev?.systemName || targetSystem,
          startTimeMs: p.startTimeMs || 0,
          durationMs: duration,
          systemId: targetSystem,
          deviceId: getOriginalDeviceId(targetDevice),
          isScreenshot,
          isLocal: p.isLocal,
          fileName: p.fileName,
          dateFolder: p.dateFolder,
        };
      });
      setRecentRecordings(mapped);
      if (mapped.length === 0) setRecentError("No recordings found for this camera on the selected date.");
    } catch (err: any) {
      setRecentError(err.message || "Failed to fetch recent recordings.");
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
    completed: "bg-blue-100 text-blue-800 border-blue-200",
    failed: "bg-red-100 text-red-800 border-red-200",
    active: "bg-sky-100 text-sky-800 border-sky-200 font-bold",
  };

  // ======== RENDER ========
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Integrated Search/Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold leading-none">Recordings</h1>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setIsSettingsOpen(true)} 
            className="h-9 gap-2 shadow-sm border-slate-200 hover:bg-slate-50"
            title="Snapshot Settings"
          >
            <Settings className="h-4 w-4 text-slate-500" />
            Settings
          </Button>
          <Button onClick={() => { 
            if (scheduleType === "screenshot" && !storagePath) {
              addPersistentNotification({ type: 'warning', title: 'Action Required', message: 'Please set a storage path in Settings before scheduling snapshots.' });
            }
            resetScheduleForm(); 
            setIsScheduleOpen(true); 
          }} className="h-9 gap-2 shadow-sm">
            <Plus className="h-4 w-4" /> New Schedule
          </Button>
        </div>
      </div>

      {!requiresCloudAuth ? (
        <div className="grid gap-6 grid-cols-3">
          {/* LEFT: Recording Results (Major) */}
          <div className="space-y-4 col-span-2">
            <Card className="min-h-[600px] border-none shadow-none bg-transparent">
              <div className="flex items-center gap-3 mb-6 pb-6 border-b">
                <div className="w-48">
                  <CameraSelect 
                    value={selectedDevice} 
                    onValueChange={handleSelectDevice}
                    devices={devices}
                    loadingDevices={loadingDevices}
                    normalizeId={normalizeId}
                  />
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("justify-start font-normal h-9", !date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "MMM d, yyyy") : "Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); if (selectedDevice && d) handleSearchRecentRecordings(selectedDevice, d); }} initialFocus />
                  </PopoverContent>
                </Popover>

                {recentLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse ml-auto">
                    <Loader2 className="h-3 w-3 animate-spin" /> Synchronizing...
                  </div>
                )}
              </div>
              <CardContent className="px-0 pt-0">
                {recentLoading ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Fetching recorded segments...</p>
                  </div>
                ) : filteredRecentRecordings.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {filteredRecentRecordings.map(rec => (
                      <div key={rec.id} className="group flex items-center justify-between p-3 border rounded-xl hover:bg-muted/40 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={cn("p-2 rounded-lg", rec.isScreenshot ? "bg-blue-500/10" : "bg-primary/10")}>
                            {rec.isScreenshot ? <Camera className="h-5 w-5 text-blue-500" /> : <Video className="h-5 w-5 text-primary" />}
                          </div>
                          <div>
                            <div className="font-semibold text-sm flex items-center gap-2">
                              {rec.cameraName}

                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span className="font-medium text-foreground/80">
                                {new Date(rec.startTimeMs).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                              </span>
                              {!rec.isScreenshot && rec.durationMs > 5000 && (
                                <>
                                  <span className="opacity-40">|</span>
                                  <span>{formatDuration(rec.durationMs)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handlePreview(rec.startTimeMs, rec.durationMs, rec.systemId, rec.deviceId, rec.isLocal, rec.fileName, rec.dateFolder)} 
                            className="h-8 gap-1.5 hover:bg-primary/10 hover:text-primary"
                          >
                            <Eye className="h-3.5 w-3.5" /> {rec.isScreenshot ? "View Image" : "Preview"}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDownload(rec.startTimeMs, rec.durationMs, rec.systemId, rec.deviceId, rec.isScreenshot || rec.isLocal, rec.fileName, rec.dateFolder)} 
                            className="h-8 gap-1.5 hover:bg-primary/10 hover:text-primary"
                          >
                            <Download className="h-3.5 w-3.5" /> {rec.isScreenshot ? "Save Image" : "Download"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4 border-2 border-dashed rounded-2xl">
                    <div className="bg-muted p-4 rounded-full">
                      <Search className="h-8 w-8 opacity-40" />
                    </div>
                    <div>
                      <p className="font-medium">No recordings found</p>
                      <p className="text-sm">Try selecting a different camera or date above.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Scheduled Queue */}
          <div className="space-y-4 col-span-1">
            <Card className="h-fit sticky top-6">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    Scheduled Queue
                  </CardTitle>
                  {scheduledRecordings.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => requestCancel(scheduledRecordings.map(r => r.id), true)}
                      className="h-7 text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      Clear All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4 px-3">
                {scheduledRecordings.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center italic">
                    No active schedules
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.values(scheduledRecordings.reduce((acc: Record<string, ScheduledRecording[]>, r) => {
                      // Group by batchId if available, otherwise by fallback key
                      const key = r.batchId || `${r.cameraId}-${r.startTime}-${r.endTime}-${r.type}`;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(r);
                      return acc;
                    }, {})).map((group, gIdx) => {
                      const first = group[0];
                      const sortedDates = [...group].map(r => new Date(r.date)).sort((a, b) => a.getTime() - b.getTime());
                      const isRecurring = group.some(r => r.recurrence && r.recurrence !== "none");
                      const anyRecording = group.some((r: ScheduledRecording) => r.status === "recording" || r.status === "in progress");
                      const allCompleted = group.every(r => r.status === "completed" || r.status === "failed");
                      const mainStatus = anyRecording 
                        ? (group.some(r => r.status === "recording") ? "recording" : "in progress") 
                        : (isRecurring ? "active" : (allCompleted ? "completed" : "pending"));
                      const dateList = sortedDates.map(d => format(d, "MMM d"));
                      const displayDates = dateList.length > 2 ? `${dateList.slice(0, 2).join(", ")}...` : dateList.join(", ");

                      const handleEdit = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setScheduleCamera(first.cameraId);
                        setScheduleSystem(first.systemId);
                        setScheduleType(first.type);
                        setScheduleBatchId(first.batchId || null);
                        setScheduleDates(group.map(r => new Date(r.date)));
                        if (first.type === "video") {
                          setScheduleTimeRanges([{ start: first.startTime, end: first.endTime }]);
                        } else {
                          setScheduleScreenshotTime(first.startTime);
                        }
                        setIsScheduleOpen(true);
                      };

                      return (
                        <Collapsible key={gIdx} className="group overflow-hidden rounded-2xl border bg-white border-slate-200 transition-all hover:border-primary/50 hover:shadow-xl shadow-sm">
                          <CollapsibleTrigger asChild>
                            <div className="relative cursor-pointer p-5 select-none">
                              {/* Glowing side indicator */}
                              <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all group-hover:w-1.5", 
                                mainStatus === "recording" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" : 
                                mainStatus === "in progress" ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]" :
                                mainStatus === "active" ? "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]" :
                                mainStatus === "pending" ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "bg-slate-300")} />

                              <div className="flex items-start justify-between gap-4 pl-3">
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className="text-sm font-bold uppercase tracking-tight truncate text-slate-800 group-hover:text-primary transition-colors">{first.cameraName}</h4>
                                    <div className="px-2 py-0.5 rounded text-[9px] uppercase tracking-widest border bg-slate-900 text-white border-slate-900">
                                      {first.type}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5 opacity-60" /> {displayDates}</span>
                                    <span className="opacity-20 px-1">|</span>
                                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 opacity-60" /> {first.type === "screenshot" ? first.screenshotTime : `${first.startTime} - ${first.endTime}`}</span>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-3 shrink-0">
                                  <div className="flex items-center gap-2">
                                    <div className={cn("text-[8px] px-1.5 py-0.5 rounded-full border uppercase tracking-widest bg-slate-100 text-slate-600 border-slate-200", statusColor[mainStatus])}>
                                      {mainStatus}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-slate-100 text-slate-400 hover:text-primary" onClick={handleEdit}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/10 text-slate-400 hover:text-destructive" onClick={(e) => { e.stopPropagation(); requestCancel(group.map(r => r.id), true); }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              { (mainStatus === "recording" || mainStatus === "in progress") && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/10">
                                  <div className={cn("h-full w-full animate-pulse", mainStatus === "recording" ? "bg-green-500" : "bg-indigo-500")} />
                                </div>
                              )}
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="bg-slate-50/80 border-t border-slate-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300">
                             <div className="p-4 space-y-2">
                               {sortedDates.map((d, dIdx) => (
                                 <div key={dIdx} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-primary/30 transition-all group/item">
                                   <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 border border-slate-200 shadow-inner font-bold">#{dIdx + 1}</div>
                                      <div className="flex flex-col">
                                        <span className="text-xs font-semibold text-slate-800">{format(d, "EEEE")}</span>
                                        <span className="text-[10px] text-slate-500 font-medium">{format(d, "MMMM d, yyyy")}</span>
                                      </div>
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <div className={cn("text-[8px] px-1.5 py-0.5 rounded-md border uppercase tracking-widest font-bold", statusColor[group[dIdx].status])}>
                                        {group[dIdx].status}
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className={cn(
                                          "h-6 w-6 rounded-md transition-all",
                                          isRecurring 
                                            ? "text-sky-500/60 hover:text-sky-600 hover:bg-sky-50" 
                                            : "text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                                        )} 
                                        onClick={() => requestCancel([group[dIdx].id], false)}
                                        title={isRecurring ? "Skip this occurrence" : "Remove this recording"}
                                      >
                                        <X className={isRecurring ? "h-3 w-3" : "h-3.5 w-3.5"} />
                                      </Button>
                                   </div>
                                 </div>
                               ))}
                             </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-bold">
              <Cloud className="h-5 w-5" /> Cloud Access Required
            </CardTitle>
            <CardDescription>You need to be authenticated with NX Cloud to manage remote recordings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCloudLogin} className="gap-2 font-bold px-8">
              <LogIn className="h-4 w-4" /> Sign in to NX Cloud
            </Button>
          </CardContent>
        </Card>
      )}

      {/* NEW SCHEDULE DIALOG */}
      <Dialog open={isScheduleOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                New Recording Schedule
            </DialogTitle>
            <DialogDescription>Setup recurring or one-time capture tasks.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <ScheduleCameraSelect 
              value={scheduleCamera} 
              onValueChange={handleScheduleSelectDevice} 
              devices={devices}
              loadingDevices={loadingDevices}
              normalizeId={normalizeId}
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
              
              <Tabs defaultValue="weekly" className="w-full">
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
                <Label>{scheduleType === "screenshot" ? "Capture Time" : "Time Ranges"}</Label>
                {scheduleType === "video" && (
                  <Button variant="ghost" size="sm" onClick={addScheduleTimeRange} className="h-7 text-xs gap-1 text-primary hover:bg-primary/5">
                    <Plus className="h-3 w-3" /> Add Range
                  </Button>
                )}
              </div>

              {scheduleType === "screenshot" ? (
                <Input type="time" value={scheduleScreenshotTime} onChange={e => setScheduleScreenshotTime(e.target.value)} className="h-10" />
              ) : (
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                  {scheduleTimeRanges.map((range, idx) => (
                    <div key={idx} className="flex items-center gap-2 group animate-in fade-in slide-in-from-top-1">
                      <Input type="time" value={range.start} onChange={e => updateScheduleTimeRange(idx, "start", e.target.value)} className="h-9" />
                      <span className="text-muted-foreground text-xs font-bold">TO</span>
                      <Input type="time" value={range.end} onChange={e => updateScheduleTimeRange(idx, "end", e.target.value)} className="h-9" />
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
              <Button onClick={handleScheduleRecording} className="flex-1 font-bold gap-2">
                <PlayCircle className="h-4 w-4" /> Save Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
        {(() => {
          const firstPendingRec = pendingCancelIds.length === 1 ? scheduledRecordings.find(r => r.id === pendingCancelIds[0]) : null;
          // Only show "skip" UI when: individual date cancel (not force-delete) + recurring schedule
          const isSkip = !pendingCancelForceDelete && !!(firstPendingRec?.recurrence && firstPendingRec.recurrence !== "none");
          const isClearAll = pendingCancelIds.length === scheduledRecordings.length && scheduledRecordings.length > 1;
          
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
                  
                  {scheduledRecordings.some(r => pendingCancelIds.includes(r.id) && r.status === "recording") && (
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
              <Settings className="h-4 w-4 text-primary" /> Screenshot Settings
            </DialogTitle>
            <DialogDescription>
              Configure where snapshots are archived locally on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Local Storage Path</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="E.g. D:\RecordedSnapshots or /mnt/data/vms_snaps" 
                  value={storagePath}
                  onChange={(e) => setStoragePath(e.target.value)}
                  className="flex-1 bg-slate-50 border-slate-200"
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                Enter an absolute path on the server. If empty, snapshots will use the internal "data" directory.
              </p>
            </div>

            {!storagePath && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-3">
                <div className="mt-0.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /></div>
                <p className="text-[10px] text-amber-700 leading-tight">
                  <span className="font-bold">Recommendation:</span> Choose a folder outside the application directory to preserve images during updates.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 mt-4 border-t">
            <Button variant="ghost" onClick={() => setIsSettingsOpen(false)} className="h-9">Cancel</Button>
            <Button onClick={handleSaveSettings} className="h-9 px-6 bg-slate-900 border-slate-900">Save Path</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

