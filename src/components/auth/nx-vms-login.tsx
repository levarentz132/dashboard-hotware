"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Server,
  LogOut,
  User,
  Lock,
  RefreshCw,
  XCircle,
  LogIn,
  Eye,
  EyeOff,
  Cloud,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Cookies from "js-cookie";
import { useAuth } from "@/hooks/use-auth";

import { useNxVmsAuth } from "@/hooks/use-nx-vms-auth";
import { useNxConfig } from "@/hooks/use-nx-config";

export function NxVmsLogin() {
  const {
    login: licenseLogin,
    isLoading: isLicenseLoading,
    error: licenseError,
    clearError: clearLicenseError,
  } = useAuth();
  const { config } = useNxConfig();
  const {
    session,
    cloudSession,
    isLoading,
    error,
    loginLocal,
    loginCloud: handleCloudLogin,
    exchangeCloudCode,
    logout: handleLogout,
    setError,
  } = useNxVmsAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [nxLocation, setNxLocation] = useState({
    ip: "localhost",
    port: "7001",
  });

  // Sync NX location settings from loaded server config
  useEffect(() => {
    if (!config) return;
    const {
      NEXT_PUBLIC_NX_SERVER_HOST,
      NEXT_PUBLIC_NX_SERVER_PORT,
      NEXT_PUBLIC_NX_SYSTEM_ID,
    } = config;

    const currentIp = Cookies.get("nx_location_ip");
    if (!currentIp && NEXT_PUBLIC_NX_SERVER_HOST) {
      setNxLocation((prev) => ({ ...prev, ip: NEXT_PUBLIC_NX_SERVER_HOST }));
    }
    const currentPort = Cookies.get("nx_location_port");
    if (!currentPort && NEXT_PUBLIC_NX_SERVER_PORT) {
      setNxLocation((prev) => ({ ...prev, port: NEXT_PUBLIC_NX_SERVER_PORT }));
    }
    if (!Cookies.get("nx_system_id") && NEXT_PUBLIC_NX_SYSTEM_ID) {
      Cookies.set("nx_system_id", NEXT_PUBLIC_NX_SYSTEM_ID, {
        expires: 365,
        path: "/",
      });
    }
  }, [config]);

  // Local cookies sync
  useEffect(() => {
    const savedIp = Cookies.get("nx_location_ip");
    const savedPort = Cookies.get("nx_location_port");
    if (savedIp) setNxLocation((prev) => ({ ...prev, ip: savedIp }));
    if (savedPort) setNxLocation((prev) => ({ ...prev, port: savedPort }));
  }, []);

  // Handle OAuth redirection search parameters code exchange
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      exchangeCloudCode(code);
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
    }
  }, [exchangeCloudCode]);

  const handleLocalLogin = async () => {
    clearLicenseError?.();
    const success = await loginLocal(
      credentials.username,
      credentials.password,
    );
    if (success) {
      setCredentials({ username: "", password: "" });
    }
  };

  const [activeVariant, setActiveVariant] = useState<"local" | "cloud" | null>(null);

  const handleDashboardLogin = async (variant: "local" | "cloud") => {
    clearLicenseError?.();
    setActiveVariant(variant);
    let username = Cookies.get("license_saved_user");
    let password = Cookies.get("license_saved_pass");

    if (!username || !password) {
      username =
        (config as any)?.NEXT_PUBLIC_LICENSE_USERNAME ||
        process.env.NEXT_PUBLIC_LICENSE_USERNAME ||
        "";
      password =
        (config as any)?.NEXT_PUBLIC_LICENSE_PASSWORD ||
        process.env.NEXT_PUBLIC_LICENSE_PASSWORD ||
        "";
    }

    if (!username || !password) {
      setError(
        "License credentials not found. Please set them in the 'License Config' dropdown (top left).",
      );
      setActiveVariant(null);
      return;
    }

    let storedServerId =
      variant === "local"
        ? Cookies.get("nx_server_id") || session?.serverId || ""
        : "";
    let storedSystemId =
      variant === "cloud"
        ? Cookies.get("nx_system_id") || cloudSession?.ownerSystemId || ""
        : storedServerId
          ? ""
          : Cookies.get("nx_system_id") || (session as any)?.systemId || "";

    if (!storedSystemId && variant === "cloud") {
      console.warn(
        "[NxVmsLogin] No System ID found for cloud login.",
      );
    }

    // Set dashboard_variant explicitly based on which button was clicked
    Cookies.set("dashboard_variant", variant, {
      expires: 1,
      path: "/",
    });

    try {
      await licenseLogin({
        username,
        password,
        system_id: storedSystemId,
        server_id: storedServerId,
      });
    } finally {
      setActiveVariant(null);
    }
  };

  useEffect(() => {
    if (licenseError) {
      console.warn("[NxVmsLogin] Detected licenseError in hook:", licenseError);
    }
  }, [licenseError]);

  return (
    <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-bottom-8">
      {/* Header - merah */}
      <div className="p-8 bg-gradient-to-br from-red-950 via-red-900 to-red-800 text-white relative flex flex-col items-center gap-2">
        <div className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black tracking-tight uppercase mt-1">
          Sign in to Hotware Dashboard
        </h2>
        <p className="text-red-100/70 text-xs font-bold text-center max-w-sm">
          Connect to your local network server, or authenticate through NX Cloud
        </p>
      </div>

      {/* Banner status */}
      <div className="p-2 bg-yellow-100 border-b border-yellow-200 text-[10px] font-mono text-yellow-800 text-center">
        VMS Error: {error || "none"} | License Error: {licenseError || "none"}
      </div>

      {(error || licenseError) && (
        <div className="px-8 pt-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 animate-in fade-in slide-in-from-top-2">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span className="text-xs font-bold leading-tight">
              {error || licenseError}
            </span>
          </div>
        </div>
      )}

      {/* Side-by-side content */}
      <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10 relative items-stretch">
        {/* LEFT: Local Network */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Server className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Local Network
            </span>
          </div>

          {session ? (
            <div className="flex-1 p-5 rounded-2xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center text-center gap-3 min-h-[21rem] animate-in fade-in zoom-in-95">
              <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm border border-blue-200">
                <User className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-slate-800">
                  {session.username}
                </span>
                <span className="text-[10px] font-bold text-green-600 uppercase">
                  Connected
                </span>
              </div>

              <div className="w-full space-y-2 mt-2">
                <Button
                  onClick={() => handleDashboardLogin("local")}
                  disabled={isLicenseLoading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md shadow-blue-500/20 transition-all text-xs flex items-center justify-center gap-2 group"
                >
                  {isLicenseLoading && activeVariant === "local" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>ENTER LOCAL DASHBOARD</span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleLogout("local")}
                  className="w-full text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-3 p-6 rounded-2xl bg-slate-50 border border-slate-100 min-h-[21rem] flex flex-col justify-center">
              <div className="relative">
                <Input
                  placeholder="Username"
                  className="h-12 pl-11 bg-white border-slate-200 rounded-xl focus:border-blue-500 transition-all font-bold text-slate-700 text-sm w-full"
                  value={credentials.username}
                  onChange={(e) =>
                    setCredentials({ ...credentials, username: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      document.getElementById("nx-local-password")?.focus();
                    }
                  }}
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <div className="relative">
                <Input
                  id="nx-local-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  className="h-12 pl-11 pr-11 bg-white border-slate-200 rounded-xl focus:border-blue-500 transition-all font-bold text-slate-700 text-sm w-full"
                  value={credentials.password}
                  onChange={(e) =>
                    setCredentials({ ...credentials, password: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleLocalLogin()}
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center w-6 h-6"
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 px-1">
                Server: {nxLocation.ip}:{nxLocation.port}
              </p>
              <Button
                onClick={handleLocalLogin}
                disabled={isLoading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-500/10 transition-all text-xs"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  "CONNECT LOCAL"
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden md:flex absolute left-1/2 top-8 bottom-0 -translate-x-1/2 items-center justify-center pointer-events-none">
          <div className="h-full w-px bg-slate-100" />
          <span className="absolute bg-white text-[9px] font-black text-slate-300 uppercase tracking-widest px-2 py-1 rounded-full border border-slate-100">
            OR
          </span>
        </div>
        <div className="md:hidden h-px bg-slate-100 relative -my-1">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bg-white px-3 text-[9px] font-black text-slate-300 uppercase tracking-widest">
              OR
            </span>
          </div>
        </div>

        {/* RIGHT: Cloud Access */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Cloud className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              NX Cloud
            </span>
          </div>

          {cloudSession ? (
            <div className="flex-1 p-5 rounded-2xl bg-cyan-50 border border-cyan-100 flex flex-col items-center justify-center text-center gap-3 min-h-[21rem] animate-in fade-in zoom-in-95">
              <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-cyan-600 shadow-sm border border-cyan-200">
                <Cloud className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-slate-800 truncate max-w-[220px]">
                  {cloudSession.email}
                </span>
                <span className="text-[10px] font-bold text-cyan-600 uppercase">
                  Authenticated
                </span>
              </div>

              <div className="w-full space-y-2 mt-2">
                <Button
                  onClick={() => handleDashboardLogin("cloud")}
                  disabled={isLicenseLoading}
                  className="w-full h-11 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-black rounded-xl shadow-md shadow-cyan-500/20 transition-all text-xs flex items-center justify-center gap-2 group"
                >
                  {isLicenseLoading && activeVariant === "cloud" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>ENTER CLOUD DASHBOARD</span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleLogout("cloud")}
                  className="w-full text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 p-6 rounded-2xl bg-slate-50 border border-slate-100 min-h-[21rem] flex flex-col items-center justify-center text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Cloud className="w-7 h-7 text-white" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-black text-slate-800">
                  Sign in with NX Cloud
                </p>
                <p className="text-[11px] font-bold text-slate-400 leading-relaxed max-w-[15rem]">
                  You'll be redirected to the official NX Cloud page to
                  authenticate securely.
                </p>
              </div>
              <Button
                onClick={handleCloudLogin}
                disabled={isLoading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-500/10 transition-all text-xs flex items-center justify-center gap-2 group mt-1"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    CONNECT CLOUD
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>


      {/* Footer */}
      <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          © 2026 Hotware Technology
        </span>
      </div>
    </div>
  );
}
