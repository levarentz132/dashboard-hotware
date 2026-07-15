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
    ArrowRight,
    Settings2,
    ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Cookies from "js-cookie";
import { useAuth } from "@/hooks/use-auth";

import { useNxVmsAuth } from "@/hooks/use-nx-vms-auth";
import { useNxConfig } from "@/hooks/use-nx-config";

export function NxVmsLogin() {
    const { login: licenseLogin, isLoading: isLicenseLoading, error: licenseError, clearError: clearLicenseError } = useAuth();
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
        setError
    } = useNxVmsAuth();

    const [activeTab, setActiveTab] = useState<"local" | "cloud">("local");
    const [showPassword, setShowPassword] = useState(false);
    const [credentials, setCredentials] = useState({ username: "", password: "" });
    const [nxLocation, setNxLocation] = useState({ ip: "localhost", port: "7001" });

    // Sync NX location settings from loaded server config
    useEffect(() => {
        if (!config) return;
        const { NEXT_PUBLIC_NX_SERVER_HOST, NEXT_PUBLIC_NX_SERVER_PORT, NEXT_PUBLIC_NX_SYSTEM_ID } = config;
        
        const currentIp = Cookies.get("nx_location_ip");
        if (!currentIp && NEXT_PUBLIC_NX_SERVER_HOST) {
            setNxLocation(prev => ({ ...prev, ip: NEXT_PUBLIC_NX_SERVER_HOST }));
        }
        const currentPort = Cookies.get("nx_location_port");
        if (!currentPort && NEXT_PUBLIC_NX_SERVER_PORT) {
            setNxLocation(prev => ({ ...prev, port: NEXT_PUBLIC_NX_SERVER_PORT }));
        }
        if (!Cookies.get("nx_system_id") && NEXT_PUBLIC_NX_SYSTEM_ID) {
            Cookies.set("nx_system_id", NEXT_PUBLIC_NX_SYSTEM_ID, { expires: 365, path: '/' });
        }
    }, [config]);

    // Local cookies sync
    useEffect(() => {
        const savedIp = Cookies.get("nx_location_ip");
        const savedPort = Cookies.get("nx_location_port");
        if (savedIp) setNxLocation(prev => ({ ...prev, ip: savedIp }));
        if (savedPort) setNxLocation(prev => ({ ...prev, port: savedPort }));
    }, []);

    // Handle OAuth redirection search parameters code exchange
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            exchangeCloudCode(code);
            const url = new URL(window.location.href);
            url.searchParams.delete('code');
            window.history.replaceState({}, '', url.toString());
        }
    }, [exchangeCloudCode]);

    const handleLocalLogin = async () => {
        clearLicenseError?.();
        const success = await loginLocal(credentials.username, credentials.password);
        if (success) {
            setCredentials({ username: "", password: "" });
        }
    };

    const handleDashboardLogin = async () => {
        clearLicenseError?.();
        // Priority 1: User saved credentials in cookies
        let username = Cookies.get("license_saved_user");
        let password = Cookies.get("license_saved_pass");

        // Priority 2: Fallback static / environment defaults
        if (!username || !password) {
            username = (config as any)?.NEXT_PUBLIC_LICENSE_USERNAME || process.env.NEXT_PUBLIC_LICENSE_USERNAME || "";
            password = (config as any)?.NEXT_PUBLIC_LICENSE_PASSWORD || process.env.NEXT_PUBLIC_LICENSE_PASSWORD || "";
        }

        if (!username || !password) {
            setError("License credentials not found. Please set them in the 'License Config' dropdown (top left).");
            return;
        }

        // Determine VMS session IDs
        let storedSystemId = Cookies.get("nx_system_id") || cloudSession?.ownerSystemId || "";
        let storedServerId = Cookies.get("nx_server_id") || session?.serverId || "";

        await licenseLogin({
            username,
            password,
            system_id: cloudSession ? storedSystemId : (storedSystemId || storedServerId),
            server_id: cloudSession ? "" : (storedServerId || storedSystemId)
        });
    };

    useEffect(() => {
        if (licenseError) {
            console.warn("[NxVmsLogin] Detected licenseError in hook:", licenseError);
        }
    }, [licenseError]);

    const isConnected = !!session || !!cloudSession;

    console.log("[NxVmsLogin] Render states:", { 
        vmsError: error, 
        licenseError: licenseError, 
        isConnected, 
        isLicenseLoading 
    });

    return (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-bottom-8">
            {/* Debug Info Banner */}
            <div className="p-2 bg-yellow-100 border-b border-yellow-200 text-[10px] font-mono text-yellow-800 text-center">
                VMS Error: {error || "none"} | License Error: {licenseError || "none"}
            </div>
            {/* Header */}
            <div className="p-8 bg-gradient-to-br from-slate-900 to-blue-900 text-white relative flex flex-col items-center gap-3">
                {/* <h2 className="text-xl font-black tracking-tight uppercase">Hotware Dashboard</h2> */}
            </div>

            {/* Content */}
            <div className="p-8 space-y-8">
                {(error || licenseError) && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 animate-in fade-in slide-in-from-top-2">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span className="text-xs font-bold leading-tight">{error || licenseError}</span>
                    </div>
                )}

                {/* Local Network Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-400 ml-1">
                        <Server className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Local Network</span>
                    </div>
                    
                    {session ? (
                        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-between animate-in fade-in zoom-in-95">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm border border-blue-200">
                                    <User className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black text-slate-800">{session.username}</span>
                                    <span className="text-[10px] font-bold text-green-600 uppercase">Connected</span>
                                </div>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => handleLogout("local")} className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl">
                                <LogOut className="w-4 h-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="relative">
                                <Input
                                    placeholder="Username"
                                    className="h-11 pl-10 bg-white border-slate-200 rounded-xl focus:border-blue-500 transition-all font-bold text-slate-700 text-sm"
                                    value={credentials.username}
                                    onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            document.getElementById("nx-local-password")?.focus();
                                        }
                                    }}
                                />
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                            <div className="relative">
                                <Input
                                    id="nx-local-password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Password"
                                    className="h-11 pl-10 pr-10 bg-white border-slate-200 rounded-xl focus:border-blue-500 transition-all font-bold text-slate-700 text-sm"
                                    value={credentials.password}
                                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                />
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <button 
                                    onClick={() => setShowPassword(!showPassword)} 
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-200/50"
                                >
                                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            <Button
                                onClick={handleLocalLogin}
                                disabled={isLoading}
                                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-500/10 transition-all text-xs"
                            >
                                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "CONNECT LOCAL"}
                            </Button>
                        </div>
                    )}
                </div>

                <div className="h-px bg-slate-100 relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-white px-3 text-[9px] font-black text-slate-300 uppercase tracking-widest">OR</span>
                    </div>
                </div>

                {/* Cloud Access Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-400 ml-1">
                        <Cloud className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cloud Access</span>
                    </div>

                    {cloudSession ? (
                        <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-between animate-in fade-in zoom-in-95">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-cyan-600 shadow-sm border border-cyan-200">
                                    <Cloud className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black text-slate-800 truncate max-w-[180px]">{cloudSession.email}</span>
                                    <span className="text-[10px] font-bold text-cyan-600 uppercase">Authenticated</span>
                                </div>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => handleLogout("cloud")} className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl">
                                <LogOut className="w-4 h-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            onClick={handleCloudLogin}
                            disabled={isLoading}
                            className="w-full h-16 bg-cyan-50/50 hover:bg-cyan-100/80 border-2 border-cyan-100/50 text-cyan-800 font-black rounded-2xl transition-all flex items-center justify-between px-6 group active:scale-95"
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-white shadow-sm border border-cyan-100 flex items-center justify-center text-cyan-600 group-hover:scale-110 transition-transform">
                                    <Cloud className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-black tracking-tight">Connect NX Cloud</p>
                                    <p className="text-[10px] font-bold text-cyan-600/60 uppercase tracking-widest">Access Systems Globally</p>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-cyan-400 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    )}
                </div>

                {/* Final Dashboard Button */}
                {isConnected && (
                    <div className="pt-2 space-y-6">
                        <div className="h-px bg-slate-100" />
                        <Button 
                            onClick={handleDashboardLogin}
                            disabled={isLicenseLoading}
                            className="w-full h-16 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-2xl shadow-2xl shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                        >
                            {isLicenseLoading ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <LogIn className="w-5 h-5 mr-3 group-hover:translate-x-1 transition-transform" />
                                    <span className="tracking-widest">ENTER DASHBOARD</span>
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>
            
            {/* Footer */}
            <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">© 2026 Hotware Technology</span>
            </div>
        </div>
    );
}
