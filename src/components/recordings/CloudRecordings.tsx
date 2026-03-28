"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, Loader2, Video, Cloud, LogIn } from "lucide-react";
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
import { Image as ImageIcon, Eye } from "lucide-react";
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
import { API_CONFIG } from "@/lib/config";

export default function CloudRecordings() {
  const [systems, setSystems] = useState<CloudSystem[]>([]);
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>("127.0.0.1");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [localSystemName, setLocalSystemName] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("23:59");
  const [recordings, setRecordings] = useState<any[]>([]);
  const [searchedRange, setSearchedRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [error, setError] = useState<string>("");
  const [orgCameraIds, setOrgCameraIds] = useState<string[] | null>(null);
  const [devicesReady, setDevicesReady] = useState(false);
  const [requiresCloudAuth, setRequiresCloudAuth] = useState(false);
  const [sourceUsername, setSourceUsername] = useState("");
  const [sourcePassword, setSourcePassword] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<any>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  // Cloud OAuth configuration
  const CLOUD_HOST = 'https://nxvms.com';
  const CLIENT_ID = 'api-tool';

  // Check for cloud session cookie
  const hasCloudSession = useCallback(() => {
    const session = Cookies.get("nx_cloud_session");
    if (!session) return false;
    try {
      const parsed = JSON.parse(session);
      return !!(parsed?.accessToken);
    } catch {
      return false;
    }
  }, []);

  // Handle NX Cloud OAuth login
  const handleCloudLogin = useCallback(() => {
    const redirectUrl = new URL(window.location.href);
    redirectUrl.search = ''; // Clear any existing query params
    const authUrl = new URL(`${CLOUD_HOST}/authorize`);
    authUrl.searchParams.set('redirect_url', redirectUrl.toString());
    authUrl.searchParams.set('client_id', CLIENT_ID);
    window.location.href = authUrl.toString();
  }, []);

  // Handle OAuth callback and exchange code for token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code) {
      // Exchange code for token
      const exchangeToken = async () => {
        try {
          const response = await fetch(`${CLOUD_HOST}/oauth/token/`, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              grant_type: 'authorization_code',
              response_type: 'token'
            })
          });

          if (response.ok) {
            const tokens = await response.json();
            if (tokens.access_token) {
              // Store token in cookie
              const sessionData = {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                email: tokens.user_email
              };
              Cookies.set("nx_cloud_session", JSON.stringify(sessionData), { expires: 365, path: '/' });
              setRequiresCloudAuth(false);
              
              // Clear URL params and reload systems
              const url = new URL(window.location.href);
              url.searchParams.delete('code');
              window.history.replaceState({}, '', url.toString());
              
              loadSystems();
            }
          }
        } catch (err) {
          console.error("[CloudRecordings] Token exchange error:", err);
          setError("Failed to complete cloud login. Please try again.");
        }
      };

      exchangeToken();
    }
  }, []);

  // Load local system info and systems
  useEffect(() => {
    (async () => {
      try {
        const info = await nxAPI.getSystemInfo();
        if (info?.name) setLocalSystemName(info.name);
      } catch (e) {}
    })();

    // Fetch /api/auth/me to get org_camera_ids (if provided)
    (async () => {
      try {
        const resp = await fetch("/api/auth/me", { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          const allowed = data?.user?.org_camera_ids ?? data?.user?.orgCameraIds ?? null;
          // Normalize IDs: strip surrounding braces and lowercase
          const normalizeId = (v: any) => String(v || "").replace(/[{}]/g, "").toLowerCase();
          if (Array.isArray(allowed)) {
            setOrgCameraIds(allowed.map((id: any) => normalizeId(id)));
          } else {
            // Fallback: check sessionStorage (AuthProvider may have stored it) or cookie
            try {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                const stored = window.sessionStorage.getItem('org_camera_ids');
                if (stored) {
                  const parsed = JSON.parse(stored);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    setOrgCameraIds(parsed.map((id: any) => normalizeId(id)));
                    return;
                  }
                }
              }
            } catch (e) {
              // ignore
            }

            try {
              const cookieVal = Cookies.get('org_camera_ids');
              if (cookieVal) {
                const parsed = JSON.parse(cookieVal);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setOrgCameraIds(parsed.map((id: any) => normalizeId(id)));
                  return;
                }
              }
            } catch (e) {
              // ignore
            }

            setOrgCameraIds(null);
          }
        } else {
          setOrgCameraIds(null);
        }
      } catch (e) {
        console.warn('[CloudRecordings] Unable to fetch /api/auth/me', e);
        setOrgCameraIds(null);
      }
    })();

    // Prefer local system ID if configured, otherwise fallback to localhost
    const localSystemId = String(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "127.0.0.1").replace(/[{}]/g, "");
    setSelectedSystem(localSystemId);
    
    if (!hasCloudSession() && !localSystemId) {
      setRequiresCloudAuth(true);
      setLoadingSystems(false);
      return;
    }
    loadSystems();
  }, [hasCloudSession]);

  const loadSystems = async () => {
    setLoadingSystems(true);
    setError("");
    setRequiresCloudAuth(false);
    
    try {
      const data = await fetchCloudSystems();
      setSystems(data);
      
      // After loading systems, immediately load cameras from ALL of them
      loadAllCameras(data);
    } catch (err: any) {
      if (err instanceof CloudAuthError || err.requiresAuth) {
        // Only show cloud auth error if we don't have a local session fallback
        const localUserCookie = Cookies.get("local_nx_user");
        if (!localUserCookie) {
          setRequiresCloudAuth(true);
          setLoadingSystems(false); 
          return;
        } else {
          // We have a local user, so we can probably proceed with loading local cameras at least
          loadAllCameras([]);
        }
      } else {
        console.warn("[CloudRecordings] loadSystems failed:", err);
        // Try to load whatever we can (e.g. local)
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
    
    // 1. Fetch Local Cameras FIRST (High speed)
    try {
      const localCams = await nxAPI.getCameras();
      const localSystemId = String(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "127.0.0.1").replace(/[{}]/g, "");
      
      const mappedLocal = localCams.map(cam => ({
        id: cam.id,
        name: cam.name,
        typeId: cam.typeId,
        systemId: localSystemId,
        systemName: localSystemName
      }));

      // Immediately show local cameras to make the UI interactive
      setDevices(mappedLocal);
      setDevicesReady(true);
      
      if (mappedLocal.length > 0) {
        setSelectedDevice(normalizeId(mappedLocal[0].id));
        setSelectedSystem(localSystemId);
      }
    } catch (e) {
      console.warn("[CloudRecordings] Local camera fetch failed:", e);
    }

    // 2. Fetch Cloud Systems in Parallel with incremental updates
    // We don't wait for these to be done before showing local cameras
    cloudSystems.forEach(async (system) => {
      try {
        const localSystemId = String(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "").replace(/[{}]/g, "").toLowerCase();
        if (system.id.replace(/[{}]/g, "").toLowerCase() === localSystemId) return;

        // Add a small 10s timeout per system to prevent long blocks
        const data = await Promise.race([
          fetchCloudDevices(system.id),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
        ]) as any[];

        if (Array.isArray(data)) {
          const cloudMapped = data.map((cam: any) => ({
            id: cam.id,
            name: cam.name,
            typeId: cam.typeId,
            systemId: system.id,
            systemName: system.name
          }));
          
          setDevices(prev => {
            // Check for duplicates
            const existingIds = new Set(prev.map(d => normalizeId(d.id)));
            const newOnes = cloudMapped.filter(d => !existingIds.has(normalizeId(d.id)));
            return [...prev, ...newOnes];
          });
        }
      } catch (e) {
        console.warn(`[CloudRecordings] Failed to fetch cameras for ${system.name}:`, e);
      }
    });

    setLoadingDevices(false);
  };

  const getOriginalDeviceId = (normalizedId: string) => {
    const d = devices.find((dev: any) => normalizeId(dev.id) === String(normalizedId));
    return d ? String(d.id) : String(normalizedId);
  };

  const getSourceAuth = (): BasicAuthCredentials | undefined => {
    if (!sourceUsername.trim() || !sourcePassword) return undefined;
    return {
      username: sourceUsername.trim(),
      password: sourcePassword,
    };
  };

  const normalizeId = (v: any) => String(v || "").replace(/[{}]/g, "").toLowerCase();

  const getEffectiveOrgCameraIds = () => {
    // Prefer cookie (server-set) first, then in-memory state, then sessionStorage
    try {
      const cookieVal = Cookies.get('org_camera_ids');
      if (cookieVal) {
        console.log('[CloudRecordings] raw org_camera_ids cookie:', cookieVal);
        let parsed: any = null;
        try {
          parsed = JSON.parse(cookieVal);
        } catch (e1) {
          try {
            // Some server code URL-encodes the JSON; try decode
            parsed = JSON.parse(decodeURIComponent(cookieVal));
          } catch (e2) {
            // If it's a plain non-JSON string (CSV), try to split
            if (typeof cookieVal === 'string') {
              parsed = cookieVal.split(/\s*,\s*/).map((s) => s.replace(/^"|"$/g, ''));
            }
          }
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((id: any) => normalizeId(id));
          console.log('[CloudRecordings] parsed org_camera_ids cookie ->', normalized);
          return normalized;
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      if (Array.isArray(orgCameraIds) && orgCameraIds.length > 0) return orgCameraIds;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const stored = window.sessionStorage.getItem('org_camera_ids');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((id: any) => normalizeId(id));
        }
      }
    } catch (e) {
      // ignore
    }

    return null;
  };

  // Initialize orgCameraIds from cookie early so UI can render disabled items immediately
  useEffect(() => {
    try {
      const cookieVal = Cookies.get('org_camera_ids');
      if (cookieVal) {
        const parsed = JSON.parse(cookieVal);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrgCameraIds(parsed.map((id: any) => normalizeId(id)));
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);
  function handleSelectDevice(value: string) {
    if (!value) {
      setSelectedDevice("");
      return;
    }

    // value will be the normalized id
    const device = devices.find((d: any) => normalizeId(d.id) === String(value)) as any;
    if (!device) {
      setSelectedDevice(value);
      return;
    }

    // Automatically update the systemId when a camera is selected
    if (device.systemId) {
      console.log(`[CloudRecordings] Switching to system ${device.systemName} for camera ${device.name}`);
      setSelectedSystem(device.systemId);
    }

    setError("");
    setSelectedDevice(value);
  }

  // Remove the old loadDevices in favor of loadAllCameras


  const handleSearchRecordings = async () => {
    if (!selectedSystem || !selectedDevice || !date) {
      setError("Please select a system, device, and date.");
      return;
    }

    setLoading(true);
    setError("");
    setRecordings([]);

    try {
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);

      const startMs = new Date(date).setHours(startHour, startMin, 0, 0);
      const endMs = new Date(date).setHours(endHour, endMin, 59, 999);

      // Store the searched range for download options
      setSearchedRange({ startMs, endMs });

      const data = await fetchRecordedTimePeriods(
        selectedSystem,
        getOriginalDeviceId(selectedDevice),
        startMs,
        endMs,
        undefined // No manual basic auth anymore
      );

      // Parse response - could be array or object with reply
      const periods = Array.isArray(data) ? data : data?.reply || [];
      setRecordings(periods);

      if (periods.length === 0) {
        setError("No recordings found for the selected time range.");
      }
    } catch (err: any) {
      if (err instanceof CloudAuthError || err?.requiresAuth) {
        setError("Authentication required for selected source. Please check source username and password.");
      } else {
        setError(err.message || "Failed to search recordings");
      }
    } finally {
      setLoading(false);
    }
  };
  const handlePreview = (startTimeMs: number) => {
    if (!selectedSystem || !selectedDevice) return;
    
    const imagePath = `/api/cloud/recordings/thumbnail?systemId=${encodeURIComponent(selectedSystem || "127.0.0.1")}&deviceId=${encodeURIComponent(getOriginalDeviceId(selectedDevice))}&timeMs=${startTimeMs}`;
    
    setPreviewSelection({
      startTime: startTimeMs,
      deviceName: devices.find(d => normalizeId(d.id) === selectedDevice)?.name || "Camera",
    });
    setPreviewImages([imagePath]); // Put in array for single image support
    setPreviewOpen(true);
  };

  const handleDownload = (startTimeMs: number, durationMs: number) => {
    const params = new URLSearchParams({
      systemId: selectedSystem || "127.0.0.1",
      deviceId: getOriginalDeviceId(selectedDevice),
      startTime: String(startTimeMs),
      endTime: String(startTimeMs + durationMs),
    });
    window.open(`/api/cloud/recordings/download?${params.toString()}`, "_blank");
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds % 60}s`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Video className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-bold">Cloud Recordings</h1>
          <p className="text-muted-foreground">
            Search and export video recordings from NX Cloud systems
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Cloud Login Required Card */}
      {requiresCloudAuth && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              NX Cloud Authentication Required
            </CardTitle>
            <CardDescription>
              Sign in to your NX Cloud account to access your connected systems and recordings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCloudLogin} className="gap-2">
              <LogIn className="h-4 w-4" />
              Sign in to NX Cloud
            </Button>
          </CardContent>
        </Card>
      )}

      {!requiresCloudAuth && (
      <div className="grid gap-6 md:grid-cols-2">
        {/* System & Device Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Source</CardTitle>
            <CardDescription>Choose a system and camera</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* System Select - Context display only */}
            <div className="space-y-2">
              <Label>System</Label>
              <Select
                value={selectedSystem}
                disabled={true} 
              >
                <SelectTrigger className="bg-muted cursor-not-allowed">
                  <SelectValue placeholder={loadingSystems ? "Loading systems..." : "Select a system"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={selectedSystem}>
                    {localSystemName && (normalizeId(selectedSystem) === normalizeId(process.env.NEXT_PUBLIC_NX_SYSTEM_ID || "127.0.0.1")) 
                      ? localSystemName
                      : (systems.find(s => normalizeId(s.id) === normalizeId(selectedSystem))?.name || selectedSystem)}
                  </SelectItem>
                </SelectContent>
              </Select>
              {loadingDevices && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading all available cameras...
                </div>
              )}
            </div>

            {/* {selectedSystem && (
              <>
                <div className="space-y-2">
                  <Label>Source Username</Label>
                  <Input
                    value={sourceUsername}
                    onChange={(e) => setSourceUsername(e.target.value)}
                    placeholder="Enter VMS username for this source"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source Password</Label>
                  <Input
                    type="password"
                    value={sourcePassword}
                    onChange={(e) => setSourcePassword(e.target.value)}
                    placeholder="Enter VMS password for this source"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => loadDevices(selectedSystem)}
                  disabled={loadingDevices || !sourceUsername.trim() || !sourcePassword}
                  className="w-full"
                >
                  {loadingDevices ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting source...
                    </>
                  ) : (
                    "Connect Source and Load Cameras"
                  )}
                </Button>
              </>
            )} */}

            {/* Device Select - Unified Style */}
            {devices.length > 0 && (
              <div className="space-y-2">
                <Label>Camera</Label>
                <Select
                  value={selectedDevice}
                  onValueChange={handleSelectDevice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a camera" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {devices.map((device: any) => (
                      <SelectItem key={`${device.systemId}-${device.id}`} value={normalizeId(device.id)}>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium">{device.name || device.id}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Time Range</CardTitle>
            <CardDescription>Choose date and time for recordings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleSearchRecordings}
              disabled={loading || !selectedSystem || !selectedDevice || !date}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                "Search Recordings"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Results */}
      {!requiresCloudAuth && recordings.length > 0 && searchedRange && (
        <Card>
          <CardHeader>
            <CardTitle>Recording Segments</CardTitle>
            <CardDescription>
              Found {recordings.length} recording segment(s) overlapping with your search: {new Date(searchedRange.startMs).toLocaleString()} - {new Date(searchedRange.endMs).toLocaleTimeString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Download selected time range button */}
              <div className="p-3 border rounded-md bg-primary/5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Download Selected Time Range</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(searchedRange.startMs).toLocaleString()} - {new Date(searchedRange.endMs).toLocaleTimeString()}
                      {" ("}{formatDuration(searchedRange.endMs - searchedRange.startMs)}{")"}    
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDownload(searchedRange.startMs, searchedRange.endMs - searchedRange.startMs)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Open Recording
                  </Button>
                </div>
              </div>

              {/* Individual segments */}
              <div className="text-sm font-medium text-muted-foreground">Or download full segments:</div>
              {recordings.map((rec, idx) => {
                // Server normalizes timestamps to milliseconds as numbers
                const segStartMs = rec.startTimeMs || 0;
                const segDurationMs = rec.durationMs || 0;
                const segEndMs = segStartMs + segDurationMs;
                
                // Log for debugging
                console.log(`[Recording ${idx}]`, { segStartMs, segDurationMs, raw: rec });

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50"
                  >
                    <div>
                      <div className="font-medium">
                        {new Date(segStartMs).toLocaleString()} - {new Date(segEndMs).toLocaleTimeString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Full segment: {formatDuration(segDurationMs)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreview(segStartMs)}
                        className="gap-2 border-primary/20 hover:bg-primary/5"
                      >
                        <Eye className="h-4 w-4" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(segStartMs, segDurationMs)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Open Segment
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-blue-500" />
              Recording Preview
            </DialogTitle>
            <DialogDescription>
              Preview from {previewSelection?.deviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-4 bg-black/5 rounded-lg border border-dashed">
            {previewImages[0] && (
              <div className="max-w-xl w-full space-y-2">
                <div className="aspect-video bg-muted rounded-md overflow-hidden border shadow-lg relative group">
                  <img 
                    src={previewImages[0]} 
                    alt="Recording Preview" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgwIiBoZWlnaHQ9IjI3MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMmUyZTMwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZpbGw9IiM2NjYiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPmZyYW1lIG5vbi1hdmFpbGFibGU8L3RleHQ+PC9zdmc+';
                    }}
                  />
                  <a 
                    href={previewImages[0]} 
                    download={`snapshot-${previewSelection?.deviceName}-${previewSelection?.startTime}.jpg`}
                    target="_blank"
                    className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download Image"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2 gap-2">
            <Button onClick={() => setPreviewOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
