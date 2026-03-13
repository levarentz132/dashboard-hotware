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
  fetchCloudSystems,
  fetchCloudDevices,
  fetchRecordedTimePeriods,
  CloudSystem,
  CloudDevice,
  CloudAuthError,
  BasicAuthCredentials,
} from "./recordings-service";

export default function CloudRecordings() {
  const [systems, setSystems] = useState<CloudSystem[]>([]);
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [date, setDate] = useState<Date>();
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("23:59");
  const [recordings, setRecordings] = useState<any[]>([]);
  const [searchedRange, setSearchedRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [error, setError] = useState<string>("");
  const [requiresCloudAuth, setRequiresCloudAuth] = useState(false);
  const [sourceUsername, setSourceUsername] = useState("");
  const [sourcePassword, setSourcePassword] = useState("");

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

  // Load systems on mount
  useEffect(() => {
    // First check if we have a cloud session - if not, show login immediately
    if (!hasCloudSession()) {
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
      if (data.length === 0) {
        setError("No systems found. You may not have any systems connected to your NX Cloud account.");
      }
    } catch (err: any) {
      if (err instanceof CloudAuthError || err.requiresAuth) {
        setRequiresCloudAuth(true);
        setError(""); // Clear any error when showing login prompt
      } else {
        setError(err.message || "Failed to load systems");
      }
    } finally {
      setLoadingSystems(false);
    }
  };

  const getSourceAuth = (): BasicAuthCredentials | undefined => {
    if (!sourceUsername.trim() || !sourcePassword) return undefined;
    return {
      username: sourceUsername.trim(),
      password: sourcePassword,
    };
  };

  const loadDevices = async (systemId: string) => {
    if (!systemId) return;

    if (!sourceUsername.trim() || !sourcePassword) {
      setError("Please enter source username and password.");
      return;
    }
    
    setLoadingDevices(true);
    setError("");
    setDevices([]);
    setSelectedDevice("");

    try {
      const data = await fetchCloudDevices(systemId, getSourceAuth());
      setDevices(data);
      if (data.length === 0) {
        setError("No cameras found in this system. The system may be offline or have no cameras.");
      }
    } catch (err: any) {
      if (err instanceof CloudAuthError || err?.requiresAuth) {
        setError("Authentication required for selected source. Please check source username and password.");
      } else {
        setError(err.message || "Failed to load devices. The system may be offline.");
      }
    } finally {
      setLoadingDevices(false);
    }
  };

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
        selectedDevice,
        startMs,
        endMs,
        getSourceAuth()
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

  const handleDownload = (startTimeMs: number, durationMs: number) => {
    const params = new URLSearchParams({
      systemId: selectedSystem,
      deviceId: selectedDevice,
      startTime: String(startTimeMs),
      endTime: String(startTimeMs + durationMs),
    });
    if (sourceUsername.trim()) {
      params.set("username", sourceUsername.trim());
      params.set("password", sourcePassword);
    }
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
            {/* System Select */}
            <div className="space-y-2">
              <Label>System</Label>
              <Select
                value={selectedSystem}
                onValueChange={(value) => {
                  setSelectedSystem(value);
                  setSelectedDevice("");
                  setDevices([]);
                  setRecordings([]);
                }}
                disabled={loadingSystems}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingSystems ? "Loading systems..." : "Select a system"} />
                </SelectTrigger>
                <SelectContent>
                  {systems.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.name || system.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingDevices && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading cameras...
                </div>
              )}
            </div>

            {selectedSystem && (
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
            )}

            {/* Device Select */}
            {devices.length > 0 && (
              <div className="space-y-2">
                <Label>Camera</Label>
                <Select
                  value={selectedDevice}
                  onValueChange={setSelectedDevice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name || device.id}
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
              disabled={loading || !selectedSystem || !selectedDevice || !date || !sourceUsername.trim() || !sourcePassword}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(segStartMs, segDurationMs)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Open Segment
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
