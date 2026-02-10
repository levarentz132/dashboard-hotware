// Connection Settings Dialog
// Allows users to configure NX Server & Cloud credentials before login

"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Server, Cloud, Save, CheckCircle2, RotateCcw, RefreshCw, Loader2 } from "lucide-react";
import {
  getConnectionSettings,
  saveConnectionSettings,
  clearConnectionSettings,
  type ConnectionSettings,
} from "@/lib/connection-settings";

interface ConnectionSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionSettingsDialog({ open, onOpenChange }: ConnectionSettingsDialogProps) {
  const [settings, setSettings] = useState<ConnectionSettings>({
    nxServer: { host: "", port: "", username: "", password: "" },
    nxCloud: { username: "", password: "", systemId: "" },
  });
  const [showServerPassword, setShowServerPassword] = useState(false);
  const [showCloudPassword, setShowCloudPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fetchingSystemId, setFetchingSystemId] = useState(false);
  const [cloudSystems, setCloudSystems] = useState<Array<{ id: string; name: string; stateOfHealth: string }>>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Load existing settings when dialog opens
  useEffect(() => {
    if (open) {
      const existing = getConnectionSettings();
      setSettings(existing);
      setSaved(false);
    }
  }, [open]);

  const handleSave = () => {
    saveConnectionSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    clearConnectionSettings();
    setSettings({
      nxServer: { host: "localhost", port: "7001", username: "", password: "" },
      nxCloud: { username: "", password: "", systemId: "" },
    });
    setSaved(false);
    setCloudSystems([]);
    setFetchError(null);
  };

  const updateServer = (field: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      nxServer: { ...prev.nxServer, [field]: value },
    }));
    setSaved(false);
  };

  const updateCloud = (field: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      nxCloud: { ...prev.nxCloud, [field]: value },
    }));
    setSaved(false);
  };

  // Fetch cloud systems to auto-fill system_id
  const fetchCloudSystems = async () => {
    const { username, password } = settings.nxCloud;
    if (!username || !password) {
      setFetchError("Masukkan username dan password NX Cloud terlebih dahulu");
      return;
    }
    setFetchingSystemId(true);
    setFetchError(null);
    setCloudSystems([]);
    try {
      const auth = btoa(`${username}:${password}`);
      const res = await fetch("https://meta.nxvms.com/cdb/systems", {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
      });
      if (!res.ok) {
        setFetchError(`Cloud API error: ${res.status}`);
        return;
      }
      const data = await res.json();
      const systems = data.systems || [];
      setCloudSystems(systems);
      if (systems.length === 0) {
        setFetchError("Tidak ada sistem ditemukan di akun NX Cloud ini");
      } else if (systems.length === 1) {
        // Auto-fill if only one system
        updateCloud("systemId", systems[0].id);
      }
    } catch (err: any) {
      setFetchError(`Gagal mengambil data: ${err.message}`);
    } finally {
      setFetchingSystemId(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Server className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
            Konfigurasi Koneksi
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Atur kredensial NX Witness Server dan NX Cloud sebelum login.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="server" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="server" className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              NX Server
            </TabsTrigger>
            <TabsTrigger value="cloud" className="flex items-center gap-1.5">
              <Cloud className="h-3.5 w-3.5" />
              NX Cloud
            </TabsTrigger>
          </TabsList>

          {/* NX Server Tab */}
          <TabsContent value="server" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="server-username" className="text-sm font-medium">
                Username
              </Label>
              <Input
                id="server-username"
                placeholder="admin"
                value={settings.nxServer.username}
                onChange={(e) => updateServer("username", e.target.value)}
                className="h-10"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="server-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="server-password"
                  type={showServerPassword ? "text" : "password"}
                  placeholder="Masukkan password server"
                  value={settings.nxServer.password}
                  onChange={(e) => updateServer("password", e.target.value)}
                  className="h-10 pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowServerPassword(!showServerPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showServerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </TabsContent>

          {/* NX Cloud Tab */}
          <TabsContent value="cloud" className="space-y-4 mt-4">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs text-blue-700">
                Kredensial NX Cloud digunakan untuk auto-login ke sistem cloud. Biarkan kosong jika tidak menggunakan NX
                Cloud.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cloud-username" className="text-sm font-medium">
                Email / Username
              </Label>
              <Input
                id="cloud-username"
                type="email"
                placeholder="user@example.com"
                value={settings.nxCloud.username}
                onChange={(e) => updateCloud("username", e.target.value)}
                className="h-10"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cloud-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="cloud-password"
                  type={showCloudPassword ? "text" : "password"}
                  placeholder="Masukkan password cloud"
                  value={settings.nxCloud.password}
                  onChange={(e) => updateCloud("password", e.target.value)}
                  className="h-10 pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowCloudPassword(!showCloudPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showCloudPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* System ID Field */}
            <div className="space-y-2">
              <Label htmlFor="cloud-system-id" className="text-sm font-medium">
                System ID
              </Label>
              <div className="flex gap-2">
                <Input
                  id="cloud-system-id"
                  placeholder="System ID dari NX Cloud"
                  value={settings.nxCloud.systemId}
                  onChange={(e) => updateCloud("systemId", e.target.value)}
                  className="h-10 flex-1 font-mono text-xs"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchCloudSystems}
                  disabled={fetchingSystemId}
                  className="h-10 px-3 shrink-0"
                  title="Ambil System ID dari NX Cloud"
                >
                  {fetchingSystemId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Klik tombol refresh untuk mengambil System ID dari NX Cloud, atau masukkan manual.
              </p>
            </div>

            {/* Cloud Systems List */}
            {cloudSystems.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Pilih Sistem</Label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {cloudSystems.map((sys) => (
                    <button
                      key={sys.id}
                      type="button"
                      onClick={() => updateCloud("systemId", sys.id)}
                      className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                        settings.nxCloud.systemId === sys.id
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-medium">{sys.name}</span>
                      <span
                        className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                          sys.stateOfHealth === "online" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {sys.stateOfHealth}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{sys.id}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fetch Error */}
            {fetchError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {fetchError}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Saved Indicator */}
        {saved && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Konfigurasi berhasil disimpan!
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-slate-500 hover:text-red-600"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="button" onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="mr-1.5 h-4 w-4" />
              Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
