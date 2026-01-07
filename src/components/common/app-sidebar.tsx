"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Camera,
  LogOut,
  Wifi,
  WifiOff,
  Cloud,
  Server,
  ChevronDown,
  RefreshCw,
  LogIn,
  LayoutDashboard,
  Home,
} from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useRouter } from "next/navigation";
import LogoImage from "@/images/image.png";
import { useCameras } from "@/hooks/useNxAPI-camera";
import { CLOUD_CONFIG } from "@/lib/config";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { CloudLoginDialog } from "../alarms/CloudLoginDialog";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  isOnline?: boolean;
}

interface CloudDevice {
  id: string;
  name: string;
  status: string;
  typeId?: string;
  physicalId?: string;
  systemId?: string;
  systemName?: string;
}

export default function AppSidebar() {
  const { cameras: localCameras, error: localError, loading: localLoading } = useCameras();
  const { isMobile } = useSidebar();
  const router = useRouter();

  // Cloud state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>("local");
  const [cloudDevices, setCloudDevices] = useState<CloudDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState<Set<string>>(new Set());

  // Login dialog state
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginSystemId, setLoginSystemId] = useState("");
  const [loginSystemName, setLoginSystemName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<Set<string>>(new Set());
  const [loggingOut, setLoggingOut] = useState(false);

  // Logout function for cloud systems
  const handleCloudLogout = useCallback(async (systemId: string) => {
    setLoggingOut(true);
    try {
      const response = await fetch(`/api/cloud/login?systemId=${encodeURIComponent(systemId)}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from logged in set
        setIsLoggedIn((prev) => {
          const newSet = new Set(prev);
          newSet.delete(systemId);
          return newSet;
        });
        // Remove from auto-login attempted so it can retry if needed
        setAutoLoginAttempted((prev) => {
          const newSet = new Set(prev);
          newSet.delete(systemId);
          return newSet;
        });
        // Clear devices and show auth required
        setCloudDevices([]);
        setRequiresAuth(true);
        console.log(`[Cloud Logout] Successfully logged out from ${systemId}`);
      }
    } catch (err) {
      console.error("[Cloud Logout] Error:", err);
    } finally {
      setLoggingOut(false);
    }
  }, []);

  // Fetch cloud systems
  const fetchCloudSystems = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const response = await fetch("https://meta.nxvms.com/cdb/systems", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
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
        return a.name.localeCompare(b.name);
      });

      setCloudSystems(systems);
    } catch (err) {
      console.error("Error fetching cloud systems:", err);
      setCloudSystems([]);
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  // Auto-login function
  const attemptAutoLogin = useCallback(
    async (systemId: string, systemName: string): Promise<boolean> => {
      if (!CLOUD_CONFIG.autoLoginEnabled || !CLOUD_CONFIG.username || !CLOUD_CONFIG.password) {
        return false;
      }

      if (autoLoginAttempted.has(systemId)) {
        return false;
      }

      console.log(`[Cloud Auto-Login] Attempting login to ${systemName}...`);

      try {
        const response = await fetch("/api/cloud/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemId,
            username: CLOUD_CONFIG.username,
            password: CLOUD_CONFIG.password,
          }),
        });

        if (!response.ok) {
          setAutoLoginAttempted((prev) => new Set(prev).add(systemId));
          return false;
        }

        console.log(`[Cloud Auto-Login] Success for ${systemName}`);
        setAutoLoginAttempted((prev) => new Set(prev).add(systemId));
        setIsLoggedIn((prev) => new Set(prev).add(systemId));
        return true;
      } catch (err) {
        console.error(`[Cloud Auto-Login] Error:`, err);
        setAutoLoginAttempted((prev) => new Set(prev).add(systemId));
        return false;
      }
    },
    [autoLoginAttempted]
  );

  // Fetch cloud devices
  const fetchCloudDevices = useCallback(
    async (systemId: string, retryAfterLogin: boolean = false) => {
      const system = cloudSystems.find((s) => s.id === systemId);
      const systemName = system?.name || systemId;

      setLoadingDevices(true);
      setDeviceError(null);
      setRequiresAuth(false);

      try {
        const response = await fetch(
          `/api/cloud/devices?systemId=${encodeURIComponent(systemId)}&systemName=${encodeURIComponent(systemName)}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          if (errorData.requiresAuth) {
            // Try auto-login first
            if (!retryAfterLogin && CLOUD_CONFIG.autoLoginEnabled) {
              const loginSuccess = await attemptAutoLogin(systemId, systemName);
              if (loginSuccess) {
                setLoadingDevices(false);
                return fetchCloudDevices(systemId, true);
              }
            }

            setRequiresAuth(true);
            setLoginSystemId(systemId);
            setLoginSystemName(systemName);
            setShowLoginDialog(true);
            return;
          }

          throw new Error(errorData.error || "Failed to fetch devices");
        }

        const devices = await response.json();
        console.log("[Cloud Devices] Raw response:", devices);

        // Get all devices first, then we can filter later
        const allDevices = Array.isArray(devices) ? devices : [];

        // Map all devices - we'll show all for now and filter later if needed
        const cameraDevices: CloudDevice[] = allDevices.map((d: CloudDevice) => ({
          id: d.id,
          name: d.name || "Unknown Device",
          status: d.status || "Unknown",
          typeId: d.typeId,
          physicalId: d.physicalId,
          systemId,
          systemName,
        }));

        console.log("[Cloud Devices] Total devices:", cameraDevices.length, cameraDevices);
        setCloudDevices(cameraDevices);
        // Mark as logged in since we successfully fetched devices
        setIsLoggedIn((prev) => new Set(prev).add(systemId));
      } catch (err) {
        console.error("Error fetching cloud devices:", err);
        setDeviceError(err instanceof Error ? err.message : "Failed to fetch devices");
        setCloudDevices([]);
      } finally {
        setLoadingDevices(false);
      }
    },
    [cloudSystems, attemptAutoLogin]
  );

  // Fetch cloud systems on mount
  useEffect(() => {
    fetchCloudSystems();
  }, [fetchCloudSystems]);

  // Handle source change
  const handleSourceChange = (value: string) => {
    setSelectedSource(value);
    setDeviceError(null);
    setRequiresAuth(false);

    if (value !== "local") {
      fetchCloudDevices(value);
    } else {
      setCloudDevices([]);
    }
  };

  // Get current cameras based on source
  const currentCameras =
    selectedSource === "local"
      ? localCameras.map((c) => ({ ...c, systemId: "local", systemName: "Local Server" }))
      : cloudDevices;

  const isLoading = selectedSource === "local" ? localLoading : loadingDevices;
  const hasError = selectedSource === "local" ? localError : deviceError;

  // Get selected system name
  const selectedSystemName =
    selectedSource === "local"
      ? "Local Server"
      : cloudSystems.find((s) => s.id === selectedSource)?.name || selectedSource;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex p-1 items-center justify-center rounded-md">
                <Image src={LogoImage} alt="Hotware Logo" width={110} height={110} className="rounded-md" />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Navigation Menu */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Home">
                  <Link href="/">
                    <Home className="size-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Dashboard">
                  <Link href="/dashboard-full-view">
                    <LayoutDashboard className="size-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Camera Source</span>
            {loadingCloud && <RefreshCw className="h-3 w-3 animate-spin" />}
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <Select value={selectedSource} onValueChange={handleSourceChange} disabled={loadingCloud}>
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                {/* Local Server */}
                <SelectItem value="local">
                  <div className="flex items-center gap-2">
                    <Server className="h-3 w-3 text-green-500" />
                    <span>Local Server</span>
                  </div>
                </SelectItem>

                {/* Cloud Systems */}
                {cloudSystems.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                      Cloud Systems
                    </div>
                    {cloudSystems.map((system) => (
                      <SelectItem key={system.id} value={system.id}>
                        <div className="flex items-center gap-2">
                          <Cloud className={cn("h-3 w-3", system.isOnline ? "text-blue-500" : "text-gray-400")} />
                          <span className="truncate max-w-[120px]">{system.name}</span>
                          {!system.isOnline && <span className="text-[10px] text-gray-400">(offline)</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>

            {/* Logout button for cloud systems */}
            {selectedSource !== "local" && isLoggedIn.has(selectedSource) && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-7 mt-1 text-xs text-muted-foreground hover:text-red-500 gap-1"
                onClick={() => handleCloudLogout(selectedSource)}
                disabled={loggingOut}
              >
                {loggingOut ? <RefreshCw className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                Logout dari {selectedSystemName}
              </Button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="flex-1">
          <SidebarGroupLabel className="flex items-center justify-between">
            <span className="truncate">{selectedSystemName}</span>
            <span className="text-[10px] text-muted-foreground">{currentCameras.length}</span>
          </SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2">
            {/* Loading State */}
            {isLoading && (
              <div className="space-y-2 px-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {/* Auth Required State */}
            {!isLoading && requiresAuth && selectedSource !== "local" && (
              <div className="p-3 text-center">
                <Cloud className="h-8 w-8 mx-auto mb-2 text-blue-500 opacity-50" />
                <p className="text-xs text-muted-foreground mb-2">Login diperlukan</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1 text-xs"
                  onClick={() => setShowLoginDialog(true)}
                >
                  <LogIn className="h-3 w-3" />
                  Login
                </Button>
              </div>
            )}

            {/* Error State */}
            {hasError && !requiresAuth && (
              <div className="p-3 text-center text-xs text-red-500">
                {typeof hasError === "string" ? hasError : "Failed to load cameras"}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !hasError && !requiresAuth && currentCameras.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">No cameras available</div>
            )}

            {/* Camera List */}
            {!isLoading && !hasError && !requiresAuth && currentCameras.length > 0 && (
              <SidebarMenu>
                {currentCameras.map((camera) => (
                  <SidebarMenuItem key={`${camera.systemId}-${camera.id}`}>
                    <SidebarMenuButton
                      size="lg"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "camera",
                          JSON.stringify({
                            id: camera.id,
                            name: camera.name,
                            systemId: camera.systemId,
                            systemName: camera.systemName,
                            isCloud: selectedSource !== "local",
                          })
                        );
                        e.currentTarget.style.opacity = "0.5";
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.dataset.camera = JSON.stringify({
                          id: camera.id,
                          name: camera.name,
                          systemId: camera.systemId,
                          systemName: camera.systemName,
                          isCloud: selectedSource !== "local",
                        });
                        e.currentTarget.style.opacity = "0.5";
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-grab active:cursor-grabbing hover:bg-accent transition-all touch-none"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Camera className="size-4 flex-shrink-0" />
                        <span className="truncate">{camera.name}</span>
                      </div>
                      {camera.status?.toLowerCase() === "online" ? (
                        <div className="flex items-center gap-1 flex-shrink-0" title="Online">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <Wifi className="size-3 text-green-500" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 flex-shrink-0" title="Offline">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <WifiOff className="size-3 text-red-500" />
                        </div>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src="" alt="" />
                    <AvatarFallback className="rounded-lg">A</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight">
                    <h4 className="truncate font-medium">Admin</h4>
                  </div>
                  <ChevronDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src="" alt="" />
                      <AvatarFallback className="rounded-lg">A</AvatarFallback>
                    </Avatar>
                    <div className="leading-tight">
                      <h4 className="truncate font-medium">Admin</h4>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/")} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Home
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Cloud Login Dialog */}
      <CloudLoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        systemId={loginSystemId}
        systemName={loginSystemName}
        onLoginSuccess={() => {
          // Mark as logged in
          setIsLoggedIn((prev) => new Set(prev).add(loginSystemId));
          if (selectedSource !== "local") {
            fetchCloudDevices(selectedSource);
          }
        }}
      />
    </Sidebar>
  );
}
