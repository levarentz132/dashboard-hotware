"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { Server, MapPin, Maximize2, Minimize2, Layers, RefreshCw } from "lucide-react";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

// Interface untuk server data
export interface ServerMarkerData {
  id: string;
  name: string;
  isOnline: boolean;
  latitude: number;
  longitude: number;
  version?: string;
  ownerFullName?: string;
  accessRole?: string;
}

interface ServerMapProps {
  servers: ServerMarkerData[];
  className?: string;
  onServerClick?: (server: ServerMarkerData) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

// Custom marker icons untuk online/offline status
const createCustomIcon = (isOnline: boolean) => {
  return L.divIcon({
    className: "custom-server-marker",
    html: `
      <div class="server-marker-wrapper">
        ${isOnline ? '<div class="server-marker-pulse"></div>' : ""}
        <div class="server-marker-icon ${isOnline ? "online" : "offline"}">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
            <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
            <line x1="6" x2="6.01" y1="6" y2="6"/>
            <line x1="6" x2="6.01" y1="18" y2="18"/>
          </svg>
        </div>
        <div class="server-marker-pointer ${isOnline ? "online" : "offline"}"></div>
      </div>
    `,
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -46],
  });
};

// Map tile options
const MAP_TILES = {
  default: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};

export default function ServerMap({
  servers,
  className = "",
  onServerClick,
  onRefresh,
  isRefreshing = false,
}: ServerMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_TILES>("default");
  const [showStyleMenu, setShowStyleMenu] = useState(false);

  const mapId = useMemo(() => `map-${Math.random().toString(36).substr(2, 9)}`, []);

  // Filter hanya server yang punya koordinat valid
  const serversWithLocation = useMemo(
    () =>
      servers.filter((s) => {
        const lat = Number(s.latitude);
        const lng = Number(s.longitude);
        return lat && lng && !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
      }),
    [servers],
  );

  // Hitung center map berdasarkan semua server atau default ke Indonesia
  const mapCenter = useMemo<[number, number]>(() => {
    if (serversWithLocation.length === 0) {
      return [-6.2, 106.816666]; // Default: Jakarta
    }
    const avgLat = serversWithLocation.reduce((sum, s) => sum + Number(s.latitude), 0) / serversWithLocation.length;
    const avgLng = serversWithLocation.reduce((sum, s) => sum + Number(s.longitude), 0) / serversWithLocation.length;
    return [avgLat, avgLng];
  }, [serversWithLocation]);

  // Hitung zoom level berdasarkan jumlah dan spread server
  const zoomLevel = useMemo(() => {
    if (serversWithLocation.length === 0) return 5;
    if (serversWithLocation.length === 1) return 13;

    // Calculate bounds spread
    const lats = serversWithLocation.map((s) => Number(s.latitude));
    const lngs = serversWithLocation.map((s) => Number(s.longitude));
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const maxSpread = Math.max(latSpread, lngSpread);

    if (maxSpread > 10) return 4;
    if (maxSpread > 5) return 6;
    if (maxSpread > 2) return 8;
    if (maxSpread > 0.5) return 10;
    return 12;
  }, [serversWithLocation]);

  const onlineCount = serversWithLocation.filter((s) => s.isOnline).length;
  const offlineCount = serversWithLocation.length - onlineCount;
  const totalWithoutLocation = servers.length - serversWithLocation.length;

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? "fixed inset-4 z-50" : ""
        } ${className}`}
    >
      {/* Backdrop for expanded mode */}
      {isExpanded && <div className="fixed inset-0 bg-black/50 -z-10" onClick={() => setIsExpanded(false)} />}

      {/* Header */}
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Server Locations</h3>
              <p className="text-xs text-gray-500 hidden sm:block">Monitor server status by location</p>
            </div>
          </div>

          {/* Stats & Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Status badges */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-100 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-700">{onlineCount} Online</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-100 rounded-full">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs font-medium text-red-700">{offlineCount} Offline</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 border-l pl-2 sm:pl-4">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="p-2 hover:bg-white/80 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-600 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowStyleMenu(!showStyleMenu)}
                  className="p-2 hover:bg-white/80 rounded-lg transition-colors"
                  title="Map Style"
                >
                  <Layers className="w-4 h-4 text-gray-600" />
                </button>
                {showStyleMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                    {Object.keys(MAP_TILES).map((style) => (
                      <button
                        key={style}
                        onClick={() => {
                          setMapStyle(style as keyof typeof MAP_TILES);
                          setShowStyleMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 capitalize ${mapStyle === style ? "text-blue-600 font-medium" : "text-gray-700"
                          }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors"
                title={isExpanded ? "Minimize" : "Maximize"}
              >
                {isExpanded ? (
                  <Minimize2 className="w-4 h-4 text-gray-600" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-gray-600" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container - Responsive height */}
      <div
        className={`w-full relative ${isExpanded ? "flex-1 h-[calc(100%-120px)]" : "h-[300px] sm:h-[350px] lg:h-[400px]"}`}
      >
        {serversWithLocation.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-medium text-gray-700 mb-1">Belum ada server dengan lokasi</p>
              <p className="text-sm text-gray-500">Klik "Set Lokasi" pada kartu server untuk menambahkan</p>
            </div>
          </div>
        ) : (
          <MapContainer
            key={mapStyle}
            id={mapId}
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
                eventHandlers={{
                  click: () => onServerClick?.(server),
                }}
              >
                <Popup className="server-popup">
                  <div className="min-w-[220px] p-1">
                    {/* Popup Header */}
                    <div className="flex items-center gap-3 pb-3 mb-3 border-b">
                      <div className={`p-2 rounded-lg ${server.isOnline ? "bg-green-100" : "bg-red-100"}`}>
                        <Server className={`w-5 h-5 ${server.isOnline ? "text-green-600" : "text-red-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">{server.name}</h4>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${server.isOnline ? "text-green-600" : "text-red-500"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${server.isOnline ? "bg-green-500" : "bg-red-500"}`}
                          ></span>
                          {server.isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>

                    {/* Popup Details */}
                    <div className="space-y-2 text-sm">
                      {server.version && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Version</span>
                          <span className="font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">
                            {server.version}
                          </span>
                        </div>
                      )}
                      {server.accessRole && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Role</span>
                          <span className="font-medium text-gray-900 capitalize">{server.accessRole}</span>
                        </div>
                      )}
                      {server.ownerFullName && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Owner</span>
                          <span
                            className="font-medium text-gray-900 truncate max-w-[130px]"
                            title={server.ownerFullName}
                          >
                            {server.ownerFullName}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Coordinates */}
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" />
                        <span>
                          {Number(server.latitude).toFixed(6)}, {Number(server.longitude).toFixed(6)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}

      </div>

      {/* Footer Stats - Responsive */}
      <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t bg-gray-50/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <span className="font-medium">{serversWithLocation.length}</span>
            <span>server dengan lokasi</span>
          </div>
          {totalWithoutLocation > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              ⚠️ {totalWithoutLocation} server tanpa lokasi
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
