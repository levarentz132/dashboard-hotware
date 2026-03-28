"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { CalendarIcon, Download, Loader2, Video, Cloud, LogIn, Camera, Clock, List, Search, Image as ImageIcon2, Eye, StopCircle, PlayCircle, RefreshCw, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
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
  type: "video" | "screenshot";
  screenshotTime?: string;
  status: "pending" | "recording" | "completed" | "failed";
  startedAt?: number;
}

interface RecentRecording {
  id: string;
  cameraName: string;
  systemName: string;
  startTimeMs: number;
  durationMs: number;
  systemId: string;
  deviceId: string;
}

export default function CloudRecordings() {
  // ---- Shared state ----
  const [systems, setSystems] = useState<CloudSystem[]>([]);
  const [devices, setDevices] = useState<(CloudDevice & { systemId: string; systemName: string })[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>("127.0.0.1");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
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

  // ---- Schedule tab state ----
  const [scheduleType, setScheduleType] = useState<"video" | "screenshot">("video");
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(new Date());
  const [scheduleStart, setScheduleStart] = useState<string>("");
  const [scheduleEnd, setScheduleEnd] = useState<string>("");
  const [scheduleScreenshotTime, setScheduleScreenshotTime] = useState<string>("");
  const [scheduledRecordings, setScheduledRecordings] = useState<ScheduledRecording[]>([]);
  const [scheduleError, setScheduleError] = useState<string>("");
  const [scheduleSuccess, setScheduleSuccess] = useState<string>("");
  const [scheduleCamera, setScheduleCamera] = useState<string>("");
  const [scheduleSystem, setScheduleSystem] = useState<string>("");
  const scheduleTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const originalSchedules = useRef<Map<string, any>>(new Map());

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

  function handleSelectDevice(value: string) {
    if (!value) { setSelectedDevice(""); return; }
    const device = devices.find((d: any) => normalizeId(d.id) === String(value)) as any;
    if (!device) { setSelectedDevice(value); return; }
    if (device.systemId) setSelectedSystem(device.systemId);
    setSearchError("");
    setSelectedDevice(value);
    
    // Auto-load recent recordings immediately after camera selection
    handleSearchRecentRecordings(value, date);
  }

  function handleScheduleSelectDevice(value: string) {
    if (!value) { setScheduleCamera(""); return; }
    const device = devices.find((d: any) => normalizeId(d.id) === String(value)) as any;
    if (!device) { setScheduleCamera(value); return; }
    if (device.systemId) setScheduleSystem(device.systemId);
    setScheduleCamera(value);
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

  const handlePreview = (startTimeMs: number, durationMs?: number, sysId?: string, devId?: string) => {
    const sys = sysId || selectedSystem;
    const dev = devId || getOriginalDeviceId(selectedDevice);
    // Open the video inline in a new browser tab (no download)
    const params = new URLSearchParams({
      systemId: sys || "127.0.0.1",
      deviceId: dev,
      startTime: String(startTimeMs),
      endTime: String(startTimeMs + (durationMs || 300000)),
      preview: "true",  // inline Content-Disposition – browser plays, not saves
    });
    window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
  };

  const handleDownload = (startTimeMs: number, durationMs: number, sysId?: string, devId?: string) => {
    const params = new URLSearchParams({
      systemId: sysId || selectedSystem || "127.0.0.1",
      deviceId: devId || getOriginalDeviceId(selectedDevice),
      startTime: String(startTimeMs),
      endTime: String(startTimeMs + durationMs),
      stream: "true",  // Always proxy through Next.js so VMS token is applied server-side
    });
    window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
  };

  // ---- Schedule Recording ----
  const handleScheduleRecording = () => {
    setScheduleError("");
    setScheduleSuccess("");
    if (!scheduleCamera) { setScheduleError("Please select a camera."); return; }
    if (!scheduleDate) { setScheduleError("Please select a date."); return; }

    if (scheduleType === "screenshot") {
      if (!scheduleScreenshotTime) { setScheduleError("Please enter the screenshot time."); return; }
      const device = devices.find(d => normalizeId(d.id) === scheduleCamera);
      const now = Date.now();
      const [sh, sm] = scheduleScreenshotTime.split(":").map(Number);
      const targetMs = new Date(scheduleDate).setHours(sh, sm, 0, 0);
      const delay = targetMs - now;

      const newEntry: ScheduledRecording = {
        id: `sched-${Date.now()}`,
        cameraId: scheduleCamera,
        cameraName: device?.name || "Camera",
        systemId: scheduleSystem,
        systemName: device?.systemName || "",
        date: scheduleDate,
        startTime: scheduleScreenshotTime,
        endTime: scheduleScreenshotTime,
        type: "screenshot",
        screenshotTime: scheduleScreenshotTime,
        status: delay > 0 ? "pending" : "completed",
      };

      if (delay > 0) {
        const timer = setTimeout(() => {
          handlePreview(targetMs, undefined, scheduleSystem, getOriginalDeviceId(scheduleCamera));
          setScheduledRecordings(prev => prev.map(r => r.id === newEntry.id ? { ...r, status: "completed" } : r));
        }, delay);
        scheduleTimers.current.set(newEntry.id, timer);
        setScheduledRecordings(prev => [...prev, newEntry]);
        setScheduleSuccess(`Screenshot scheduled for ${format(scheduleDate, "PPP")} at ${scheduleScreenshotTime}`);
      } else {
        // Past time – capture now
        handlePreview(targetMs, undefined, scheduleSystem, getOriginalDeviceId(scheduleCamera));
        setScheduledRecordings(prev => [...prev, { ...newEntry, status: "completed" }]);
        setScheduleSuccess("Screenshot captured immediately (time has passed).");
      }
      return;
    }

    // Video recording
    if (!scheduleStart || !scheduleEnd) { setScheduleError("Please enter start and end times."); return; }
    const [startH, startM] = scheduleStart.split(":").map(Number);
    const [endH, endM] = scheduleEnd.split(":").map(Number);
    const startMs = new Date(scheduleDate).setHours(startH, startM, 0, 0);
    const endMs = new Date(scheduleDate).setHours(endH, endM, 59, 999);
    const now = Date.now();

    if (endMs <= startMs) { setScheduleError("End time must be after start time."); return; }

    const device = devices.find(d => normalizeId(d.id) === scheduleCamera);
    const newEntry: ScheduledRecording = {
      id: `sched-${Date.now()}`,
      cameraId: scheduleCamera,
      cameraName: device?.name || "Camera",
      systemId: scheduleSystem,
      systemName: device?.systemName || "",
      date: scheduleDate,
      startTime: scheduleStart,
      endTime: scheduleEnd,
      type: "video",
      status: startMs > now ? "pending" : "recording",
    };

    const startDelay = Math.max(0, startMs - now);
    const endDelay = Math.max(0, endMs - now);
    const cameraDeviceId = getOriginalDeviceId(scheduleCamera);

    // Schedule START – enable recording on the VMS
    const startTimer = setTimeout(async () => {
      setScheduledRecordings(prev => prev.map(r => r.id === newEntry.id ? { ...r, status: "recording", startedAt: Date.now() } : r));
      try {
        // Save original schedule
        let originalSchedule: any = null;
        try {
          const cam = await nxAPI.getCameraById(cameraDeviceId);
          originalSchedule = cam?.schedule || null;
        } catch (e) { /* ignore – we'll just disable after */ }

        // Store separately so type system is clean
        originalSchedules.current.set(newEntry.id, originalSchedule);

        const dayOfWeek = new Date(scheduleDate).getDay(); // 0=Sun
        const startSec = startH * 3600 + startM * 60;
        const endSec = endH * 3600 + endM * 60 + 59;

        await nxAPI.updateDevice(cameraDeviceId, {
          schedule: {
            isEnabled: true,
            tasks: [{
              startTime: startSec,
              endTime: endSec,
              dayOfWeek,
              recordingType: "always",
              metadataTypes: "none",
              streamQuality: "high",
              fps: 15,
            }],
          }
        });
        console.log(`[CloudRecordings] ✅ Recording STARTED on VMS for ${device?.name} (${scheduleStart})`);
      } catch (err) {
        console.error("[CloudRecordings] Failed to enable VMS recording:", err);
        setScheduledRecordings(prev => prev.map(r => r.id === newEntry.id ? { ...r, status: "failed" } : r));
      }
    }, startDelay);

    // Schedule STOP – restore original schedule and disable recording
    const endTimer = setTimeout(async () => {
      setScheduledRecordings(prev => prev.map(r => r.id === newEntry.id ? { ...r, status: "completed" } : r));
      try {
        const originalSchedule = originalSchedules.current.get(newEntry.id);
        originalSchedules.current.delete(newEntry.id);

        if (originalSchedule) {
          await nxAPI.updateDevice(cameraDeviceId, { schedule: originalSchedule });
        } else {
          await nxAPI.updateDevice(cameraDeviceId, { schedule: { isEnabled: false, tasks: [] } });
        }
        console.log(`[CloudRecordings] ✅ Recording STOPPED on VMS for ${device?.name} (${scheduleEnd})`);
      } catch (err) {
        console.error("[CloudRecordings] Failed to stop VMS recording:", err);
      }

      // Push to Recent Recordings
      const recentEntry: RecentRecording = {
        id: `rec-${Date.now()}`,
        cameraName: device?.name || "Camera",
        systemName: device?.systemName || "",
        startTimeMs: startMs,
        durationMs: endMs - startMs,
        systemId: scheduleSystem,
        deviceId: cameraDeviceId,
      };
      setRecentRecordings(prev => [recentEntry, ...prev]);
    }, endDelay);

    scheduleTimers.current.set(newEntry.id + "-start", startTimer);
    scheduleTimers.current.set(newEntry.id + "-end", endTimer);
    setScheduledRecordings(prev => [...prev, newEntry]);
    setScheduleSuccess(`Recording scheduled: ${format(scheduleDate, "PPP")} ${scheduleStart} – ${scheduleEnd}`);
  };

  const cancelSchedule = async (id: string) => {
    const t1 = scheduleTimers.current.get(id + "-start");
    const t2 = scheduleTimers.current.get(id + "-end");
    if (t1) clearTimeout(t1);
    if (t2) clearTimeout(t2);

    // If currently recording, stop it immediately on the VMS
    const rec = scheduledRecordings.find(r => r.id === id);
    if (rec?.status === "recording") {
      try {
        const originalSchedule = originalSchedules.current.get(id);
        originalSchedules.current.delete(id);
        const cameraDeviceId = getOriginalDeviceId(rec.cameraId);
        if (originalSchedule) {
          await nxAPI.updateDevice(cameraDeviceId, { schedule: originalSchedule });
        } else {
          await nxAPI.updateDevice(cameraDeviceId, { schedule: { isEnabled: false, tasks: [] } });
        }
        console.log(`[CloudRecordings] Recording cancelled on VMS for ${rec.cameraName}`);
      } catch (err) {
        console.error("[CloudRecordings] Failed to stop recording on cancel:", err);
      }
    }

    scheduleTimers.current.delete(id + "-start");
    scheduleTimers.current.delete(id + "-end");
    setScheduledRecordings(prev => prev.filter(r => r.id !== id));
  };

  // ---- Recent Recordings ----
  const handleSearchRecentRecordings = async (overrideDevice?: string, overrideDate?: Date) => {
    const targetDevice = overrideDevice || selectedDevice;
    const targetDate = overrideDate || date;

    if (!targetDevice || !targetDate) { setRecentError("Please select a camera and date."); return; }
    const dev = devices.find(d => normalizeId(d.id) === targetDevice);
    if (!dev) { setRecentError("Camera not found."); return; }
    setRecentLoading(true);
    setRecentError("");
    setRecordings([]); // Clear specific search
    try {
      const startMs = new Date(targetDate).setHours(0, 0, 0, 0);
      const endMs = new Date(targetDate).setHours(23, 59, 59, 999);
      const data = await fetchRecordedTimePeriods(
        dev.systemId, getOriginalDeviceId(targetDevice), startMs, endMs, undefined
      );
      const periods = Array.isArray(data) ? data : data?.reply || [];
      const mapped: RecentRecording[] = periods.map((p: any, i: number) => ({
        id: `recent-${i}-${p.startTimeMs}`,
        cameraName: dev.name,
        systemName: dev.systemName,
        startTimeMs: p.startTimeMs || 0,
        durationMs: p.durationMs || 0,
        systemId: dev.systemId,
        deviceId: getOriginalDeviceId(targetDevice),
      }));
      setRecentRecordings(mapped);
      if (mapped.length === 0) setRecentError("No recordings found for this camera on the selected date.");
    } catch (err: any) {
      setRecentError(err.message || "Failed to fetch recent recordings.");
    } finally {
      setRecentLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
  };

  const filteredRecentRecordings = recentRecordings.filter(r =>
    !recentSearch || r.cameraName.toLowerCase().includes(recentSearch.toLowerCase()) ||
    r.systemName.toLowerCase().includes(recentSearch.toLowerCase()) ||
    new Date(r.startTimeMs).toLocaleString().toLowerCase().includes(recentSearch.toLowerCase())
  );

  // ---- Camera Select (shared) ----
  const CameraSelect = ({ value, onValueChange, label = "Camera" }: { value: string; onValueChange: (v: string) => void; label?: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {loadingDevices ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cameras...
        </div>
      ) : (
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a camera" />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {devices.map((device: any) => (
              <SelectItem key={`${device.systemId}-${device.id}`} value={normalizeId(device.id)}>
                <span className="font-medium">{device.name || device.id}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    recording: "bg-green-100 text-green-800 border-green-200 animate-pulse",
    completed: "bg-blue-100 text-blue-800 border-blue-200",
    failed: "bg-red-100 text-red-800 border-red-200",
  };

  // ======== RENDER ========
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Video className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-bold">Recordings</h1>
          <p className="text-muted-foreground">Manage, schedule and review camera recordings</p>
        </div>
      </div>

      {/* Global errors */}
      {globalError && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">{globalError}</div>
      )}

      {/* Cloud auth gate */}
      {requiresCloudAuth && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              NX Cloud Authentication Required
            </CardTitle>
            <CardDescription>Sign in to your NX Cloud account to access connected systems.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCloudLogin} className="gap-2">
              <LogIn className="h-4 w-4" /> Sign in to NX Cloud
            </Button>
          </CardContent>
        </Card>
      )}

      {!requiresCloudAuth && (
        <Tabs defaultValue="search" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" /> Recordings
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Schedule Recording
            </TabsTrigger>
          </TabsList>

          {/* =================== RECORDINGS TAB (merged) =================== */}
          <TabsContent value="search">
            <div className="grid gap-6 md:grid-cols-[320px_1fr]">

              {/* LEFT: Search Controls */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Search Recordings</CardTitle>
                  <CardDescription>Choose camera, date and time</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CameraSelect value={selectedDevice} onValueChange={handleSelectDevice} />

                  {/* Date */}
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); if (selectedDevice && d) handleSearchRecentRecordings(selectedDevice, d); }} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Time Range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                    </div>
                  </div>

                  {searchError && <p className="text-sm text-destructive">{searchError}</p>}

                  <Button onClick={handleSearchRecordings} disabled={searchLoading || recentLoading || !selectedDevice || !date} className="w-full">
                    {searchLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Searching...</>) : (<><Search className="mr-2 h-4 w-4" />Search Specific Range</>)}
                  </Button>
                </CardContent>
              </Card>

              {/* RIGHT: Results */}
              <Card className="min-h-[420px]">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>
                        {recordings.length > 0 && searchedRange
                          ? `${recordings.length} Segment${recordings.length !== 1 ? "s" : ""} Found`
                          : recentRecordings.length > 0
                          ? "Recent Recordings"
                          : "Results"}
                      </CardTitle>
                      <CardDescription>
                        {recordings.length > 0 && searchedRange
                          ? `${new Date(searchedRange.startMs).toLocaleString()} – ${new Date(searchedRange.endMs).toLocaleTimeString()}`
                          : recentRecordings.length > 0
                          ? `${filteredRecentRecordings.length} of ${recentRecordings.length} shown`
                          : "Search results will appear here"}
                      </CardDescription>
                    </div>
                    {/* Filter bar for recent recordings */}
                    {recentRecordings.length > 0 && recordings.length === 0 && (
                      <div className="relative w-52 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input className="pl-9" placeholder="Filter..." value={recentSearch} onChange={e => setRecentSearch(e.target.value)} />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Search results */}
                  {recordings.length > 0 && searchedRange && (
                    <div className="space-y-3">
                      {/* Download entire range shortcut */}
                      <div className="p-3 border rounded-md bg-primary/5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium text-sm">Full Selected Range</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(searchedRange.startMs).toLocaleString()} – {new Date(searchedRange.endMs).toLocaleTimeString()} · {formatDuration(searchedRange.endMs - searchedRange.startMs)}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => handleDownload(searchedRange.startMs, searchedRange.endMs - searchedRange.startMs)}>
                            <Download className="mr-2 h-4 w-4" /> Download
                          </Button>
                        </div>
                      </div>

                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Individual segments</div>
                      <div className="space-y-2">
                        {recordings.map((rec, idx) => {
                          const segStartMs = rec.startTimeMs || 0;
                          const segDurationMs = rec.durationMs || 0;
                          const segEndMs = segStartMs + segDurationMs;
                          return (
                            <div key={idx} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50">
                              <div>
                                <div className="font-medium text-sm">{new Date(segStartMs).toLocaleString()} – {new Date(segEndMs).toLocaleTimeString()}</div>
                                <div className="text-xs text-muted-foreground">{formatDuration(segDurationMs)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => handlePreview(segStartMs, segDurationMs)} className="gap-1.5">
                                  <Eye className="h-4 w-4" /> Preview
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleDownload(segStartMs, segDurationMs)}>
                                  <Download className="mr-1.5 h-4 w-4" /> Download
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recent recordings (shown when no active search) */}
                  {recordings.length === 0 && recentRecordings.length > 0 && (
                    <div className="space-y-2">
                      {filteredRecentRecordings.map(rec => (
                        <div key={rec.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50">
                          <div>
                            <div className="font-medium text-sm">{rec.cameraName}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(rec.startTimeMs).toLocaleString()} · {formatDuration(rec.durationMs)}
                            </div>
                            {rec.systemName && <div className="text-xs text-muted-foreground/70">{rec.systemName}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handlePreview(rec.startTimeMs, rec.durationMs, rec.systemId, rec.deviceId)} className="gap-1.5">
                              <Eye className="h-4 w-4" /> Preview
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDownload(rec.startTimeMs, rec.durationMs, rec.systemId, rec.deviceId)}>
                              <Download className="mr-1.5 h-4 w-4" /> Download
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {recordings.length === 0 && recentRecordings.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                      <Search className="h-10 w-10 opacity-20" />
                      <p className="text-sm">Select a camera and date, then click<br />Search Recordings to see results.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* =================== SCHEDULE TAB =================== */}
          <TabsContent value="schedule" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Schedule Form */}
              <Card>
                <CardHeader>
                  <CardTitle>New Scheduled Recording</CardTitle>
                  <CardDescription>Set a camera and time window to auto-record</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CameraSelect value={scheduleCamera} onValueChange={handleScheduleSelectDevice} />

                  {/* Recording type */}
                  <div className="space-y-2">
                    <Label>Recording Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleType("video")}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-sm font-medium transition-all",
                          scheduleType === "video" ? "border-primary bg-primary/5 text-primary" : "border-muted hover:border-primary/40"
                        )}
                      >
                        <Video className="h-5 w-5" />
                        Video Recording
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleType("screenshot")}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-sm font-medium transition-all",
                          scheduleType === "screenshot" ? "border-primary bg-primary/5 text-primary" : "border-muted hover:border-primary/40"
                        )}
                      >
                        <ImageIcon2 className="h-5 w-5" />
                        Screenshot
                      </button>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduleDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduleDate ? format(scheduleDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Times */}
                  {scheduleType === "video" ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Time</Label>
                        <Input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Time</Label>
                        <Input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Screenshot Time</Label>
                      <Input type="time" value={scheduleScreenshotTime} onChange={e => setScheduleScreenshotTime(e.target.value)} />
                    </div>
                  )}

                  {scheduleError && <p className="text-sm text-destructive">{scheduleError}</p>}
                  {scheduleSuccess && <p className="text-sm text-green-600">{scheduleSuccess}</p>}

                  <Button onClick={handleScheduleRecording} disabled={!scheduleCamera} className="w-full">
                    {scheduleType === "video" ? (
                      <><PlayCircle className="mr-2 h-4 w-4" />Schedule Recording</>
                    ) : (
                      <><Camera className="mr-2 h-4 w-4" />Schedule Screenshot</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Scheduled queue */}
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled Queue</CardTitle>
                  <CardDescription>Active and recent scheduled recordings</CardDescription>
                </CardHeader>
                <CardContent>
                  {scheduledRecordings.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      No scheduled recordings yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scheduledRecordings.map(r => (
                        <div key={r.id} className="p-3 border rounded-md space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-sm">{r.cameraName}</div>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium capitalize", statusColor[r.status])}>
                                {r.status}
                              </span>
                              {(r.status === "pending" || r.status === "recording") && (
                                <button onClick={() => cancelSchedule(r.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Cancel">
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(r.date, "MMM d, yyyy")} · {r.type === "screenshot" ? `Screenshot at ${r.screenshotTime}` : `${r.startTime} – ${r.endTime}`}
                          </div>
                          {r.type === "video" && r.status === "recording" && (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                              <StopCircle className="h-3 w-3 animate-pulse" /> Recording in progress...
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Preview Dialog removed – preview now opens in a new browser tab */}
    </div>
  );
}
