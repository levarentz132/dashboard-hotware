"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { MapPin, Server, RefreshCw, AlertCircle, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import L from "leaflet";
import Link from "next/link";
import { useCloudSystems, type CloudSystem } from "@/hooks/use-async-data";

// Dynamic import untuk react-leaflet (client-side only)
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });

interface ServerLocationData {
  server_name: string;
  latitude: number | null;
  longitude: number | null;
}

interface ServerMarkerData {
  id: string;
  name: string;
  isOnline: boolean;
  latitude: number;
  longitude: number;
  version?: string;
  ownerFullName?: string;
  accessRole?: string;
}

// Custom marker icons
const createCustomIcon = (isOnline: boolean) => {
  return L.divIcon({
    className: "custom-server-marker",
    html: `
      <div class="server-marker-wrapper">
        ${isOnline ? '<div class="server-marker-pulse"></div>' : ""}
        <div class="server-marker-icon ${isOnline ? "online" : "offline"}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
            <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
            <line x1="6" x2="6.01" y1="6" y2="6"/>
            <line x1="6" x2="6.01" y1="18" y2="18"/>
          </svg>
        </div>
        <div class="server-marker-pointer ${isOnline ? "online" : "offline"}"></div>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
  });
};

// Map tiles
const MAP_TILES = {
  default: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};

export default function ServerMapWidget({ systemId }: { systemId?: string }) {
  const { data: cloudSystems, loading: cloudLoading, error: cloudError } = useCloudSystems();
  const [serverLocations, setServerLocations] = useState<Map<string, ServerLocationData>>(new Map());
  const [locationLoading, setLocationLoading] = useState(true);
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_TILES>("default");

  // Fetch server locations
  const fetchServerLocations = useCallback(async () => {
    try {
      setLocationLoading(true);
      const response = await fetch("/api/server-location");
      if (response.ok) {
        const data = await response.json();
        const locationsMap = new Map<string, ServerLocationData>();
        data.locations?.forEach((loc: ServerLocationData) => {
          locationsMap.set(loc.server_name, loc);
        });
        setServerLocations(locationsMap);
      }
    } catch (err) {
      console.error("Error fetching server locations:", err);
    } finally {
      setLocationLoading(false);
    }
  }, []);

  // Initial fetch for locations
  useEffect(() => {
    fetchServerLocations();
  }, [fetchServerLocations]);

  const loading = cloudLoading || locationLoading;
  const error = cloudError;

  // Prepare server data for map
  const serverMapData: ServerMarkerData[] = useMemo(() => {
    return cloudSystems.map((system) => {
      const location = serverLocations.get(system.name);
      return {
        id: system.id,
        name: system.name,
        isOnline: system.stateOfHealth === "online",
        latitude: Number(location?.latitude) || 0,
        longitude: Number(location?.longitude) || 0,
        version: system.version,
        ownerFullName: system.ownerFullName,
        accessRole: system.accessRole,
      };
    });
  }, [cloudSystems, serverLocations]);

  // Filter servers with valid location
  const serversWithLocation = useMemo(
    () =>
      serverMapData.filter((s) => {
        const lat = Number(s.latitude);
        const lng = Number(s.longitude);
        return lat && lng && !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
      }),
    [serverMapData],
  );

  // Calculate map center
  const mapCenter = useMemo<[number, number]>(() => {
    if (serversWithLocation.length === 0) {
      return [-6.2, 106.816666]; // Default: Jakarta
    }
    const avgLat = serversWithLocation.reduce((sum, s) => sum + Number(s.latitude), 0) / serversWithLocation.length;
    const avgLng = serversWithLocation.reduce((sum, s) => sum + Number(s.longitude), 0) / serversWithLocation.length;
    return [avgLat, avgLng];
  }, [serversWithLocation]);

  // Calculate zoom level
  const zoomLevel = useMemo(() => {
    if (serversWithLocation.length === 0) return 5;
    if (serversWithLocation.length === 1) return 12;

    const lats = serversWithLocation.map((s) => Number(s.latitude));
    const lngs = serversWithLocation.map((s) => Number(s.longitude));
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const maxSpread = Math.max(latSpread, lngSpread);

    if (maxSpread > 10) return 4;
    if (maxSpread > 5) return 6;
    if (maxSpread > 2) return 8;
    if (maxSpread > 0.5) return 10;
    return 11;
  }, [serversWithLocation]);

  const onlineCount = serversWithLocation.filter((s) => s.isOnline).length;
  const offlineCount = serversWithLocation.length - onlineCount;

  if (loading) {
    return (
      <div className="h-full flex flex-col p-3">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="flex-1 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-10 h-10 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Server Map</h3>
            <p className="text-[10px] text-muted-foreground">{serversWithLocation.length} servers mapped</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badges */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 rounded-full">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              <span className="text-[10px] font-medium text-green-700">{onlineCount}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-red-100 rounded-full">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
              <span className="text-[10px] font-medium text-red-700">{offlineCount}</span>
            </div>
          </div>
          {/* Style toggle */}
          <button
            onClick={() => setMapStyle((prev) => (prev === "default" ? "dark" : "default"))}
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            title="Toggle map style"
          >
            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        {serversWithLocation.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
            <div className="text-center p-4">
              <MapPin className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No servers with location</p>
              <p className="text-xs text-muted-foreground/70">Set server locations in System Health</p>
            </div>
          </div>
        ) : (
          <MapContainer
            key={mapStyle}
            center={mapCenter}
            zoom={zoomLevel}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            className="z-0"
          >
            <TileLayer attribution={MAP_TILES[mapStyle].attribution} url={MAP_TILES[mapStyle].url} />
            {serversWithLocation.map((server) => (
              <Marker
                key={server.id}
                position={[Number(server.latitude), Number(server.longitude)]}
                icon={createCustomIcon(server.isOnline)}
              >
                <Popup closeButton={false}>
                  <div className="min-w-[180px] p-1">
                    <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                      <div className={`p-1.5 rounded-md ${server.isOnline ? "bg-green-100" : "bg-red-100"}`}>
                        <Server className={`w-4 h-4 ${server.isOnline ? "text-green-600" : "text-red-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm text-gray-900 truncate">{server.name}</h4>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium ${server.isOnline ? "text-green-600" : "text-red-500"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${server.isOnline ? "bg-green-500" : "bg-red-500"}`}
                          ></span>
                          {server.isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs">
                      {server.version && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Version</span>
                          <span className="font-medium text-gray-700">{server.version}</span>
                        </div>
                      )}
                      {server.accessRole && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Role</span>
                          <span className="font-medium text-gray-700 capitalize">{server.accessRole}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t bg-muted/30 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {onlineCount} online, {offlineCount} offline
          </span>
          {serverMapData.length - serversWithLocation.length > 0 && (
            <span className="text-amber-600">{serverMapData.length - serversWithLocation.length} unmapped</span>
          )}
        </div>
      </div>
    </div>
  );
}
