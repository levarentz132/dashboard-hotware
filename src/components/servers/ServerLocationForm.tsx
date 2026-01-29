"use client";

import { useState, useEffect } from "react";
import { MapPin, Save, X, ExternalLink, Loader2, Navigation } from "lucide-react";
import globalDynamic from "next/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MapSelector = globalDynamic(() => import("./MapSelector"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center">Loading Map...</div>
});

interface ServerLocationFormProps {
  serverName: string;
  onClose: () => void;
  onSave?: () => void;
}

interface LocationData {
  latitude: number | null;
  longitude: number | null;
}

export default function ServerLocationForm({ serverName, onClose, onSave }: ServerLocationFormProps) {
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch existing location on mount
  useEffect(() => {
    const fetchLocation = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/server-location?server_name=${encodeURIComponent(serverName)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.location) {
            setLatitude(data.location.latitude?.toString() || "");
            setLongitude(data.location.longitude?.toString() || "");
          }
        }
      } catch (err) {
        console.error("Error fetching location:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLocation();
  }, [serverName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      // Validate inputs
      const lat = latitude ? parseFloat(latitude) : null;
      const lng = longitude ? parseFloat(longitude) : null;

      if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
        setError("Latitude harus antara -90 dan 90");
        setSaving(false);
        return;
      }

      if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
        setError("Longitude harus antara -180 dan 180");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/server-location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          server_name: serverName,
          latitude: lat,
          longitude: lng,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save location");
      }

      setSuccess("Lokasi berhasil disimpan!");
      onSave?.();

      // Close after success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan lokasi");
    } finally {
      setSaving(false);
    }
  };

  const hasValidLocation = latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude));

  const openInMaps = () => {
    if (hasValidLocation) {
      const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
      window.open(url, "_blank");
    }
  };

  const getCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude.toFixed(6));
          setLongitude(position.coords.longitude.toFixed(6));
          setError(null);
        },
        (err) => {
          setError(`Gagal mendapatkan lokasi: ${err.message}`);
        }
      );
    } else {
      setError("Geolocation tidak didukung oleh browser Anda");
    }
  };

  const handleMapChange = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
  };

  return (
    <Dialog open={!!serverName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
          {/* Left Side: Form */}
          <div className="w-full md:w-1/3 p-6 flex flex-col border-r">
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                Lokasi Server
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 flex-1">
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Server Name</Label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-700 font-medium border mt-1">
                  {serverName}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="latitude">Latitude</Label>
                      <Input
                        id="latitude"
                        type="text"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        placeholder="-6.200000"
                        className="text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="longitude">Longitude</Label>
                      <Input
                        id="longitude"
                        type="text"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        placeholder="106.816666"
                        className="text-sm font-mono"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 bg-blue-50/50 border-blue-200 text-blue-700 hover:bg-blue-50"
                    onClick={getCurrentLocation}
                  >
                    <Navigation className="w-4 h-4" />
                    Gunakan Lokasi Saat Ini
                  </Button>

                  {/* Preview/External Link */}
                  {hasValidLocation && (
                    <div className="bg-gray-50 border rounded-lg p-3 flex items-center justify-between">
                      <span className="text-xs font-mono text-gray-500">
                        {parseFloat(latitude).toFixed(4)}, {parseFloat(longitude).toFixed(4)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={openInMaps}
                        className="h-7 px-2 text-blue-600"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Maps
                      </Button>
                    </div>
                  )}

                  {/* Errors/Success */}
                  {error && (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <p className="text-xs text-red-600">{error}</p>
                    </div>
                  )}
                  {success && (
                    <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">{success}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4 border-t mt-4">
                    <Button
                      type="button"
                      onClick={onClose}
                      variant="outline"
                      className="flex-1"
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Simpan
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Right Side: Map */}
          <div className="flex-1 min-h-[400px] md:min-h-0 bg-gray-100 relative">
            <MapSelector
              lat={latitude ? parseFloat(latitude) : -6.200000}
              lng={longitude ? parseFloat(longitude) : 106.816666}
              onChange={handleMapChange}
            />
            {/* Overlay instruction */}
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm border rounded px-3 py-1.5 shadow-sm">
              <p className="text-[10px] text-gray-600 font-medium">Klik peta untuk memilih lokasi</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
