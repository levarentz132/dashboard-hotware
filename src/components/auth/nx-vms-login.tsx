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

const LOCAL_NX_URL = "/nx/rest/v3/login/sessions";

interface NxSession {
    token: string;
    username?: string;
    expiresS?: number;
    serverId?: string;
}

interface CloudSystem {
    id: string;
    name: string;
    version: string;
    isOnline: boolean;
    ownerAccountEmail?: string;
    accessRole?: string;
}

interface CloudSession {
    accessToken: string;
    refreshToken: string;
    systems: CloudSystem[];
    email?: string;
    ownerSystemId?: string;
}

export function NxVmsLogin() {
    const { login: licenseLogin, isLoading: isLicenseLoading } = useAuth();
    const [session, setSession] = useState<NxSession | null>(null);
    const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
    const [activeTab, setActiveTab] = useState<"local" | "cloud">("local");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState({ username: "", password: "" });
    const [nxLocation, setNxLocation] = useState({ ip: "localhost", port: "7001" });

    const CLOUD_HOST = 'https://nxvms.com';
    const CLIENT_ID = 'api-tool';

    // Cloud Refresh Logic
    const refreshCloudSession = useCallback(async (refreshToken: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${CLOUD_HOST}/oauth/token/`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: CLIENT_ID
                })
            });

            if (response.ok) {
                const tokens = await response.json();
                const storedCloud = Cookies.get("nx_cloud_session");
                const existingData = storedCloud ? JSON.parse(storedCloud) : {};

                const newSession: CloudSession = {
                    ...existingData,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || refreshToken,
                    systems: []
                };

                setCloudSession(newSession);
                Cookies.set("nx_cloud_session", JSON.stringify({
                    accessToken: newSession.accessToken,
                    refreshToken: newSession.refreshToken,
                    email: newSession.email,
                    ownerSystemId: newSession.ownerSystemId
                }), { expires: 365, path: '/' });
                console.log("[NxCloud] Session refreshed successfully");
            } else {
                console.warn("[NxCloud] Refresh failed, session might be invalid");
                handleLogout("cloud");
            }
        } catch (e) {
            console.error("[NxCloud] Refresh error:", e);
        } finally {
            setIsLoading(false);
        }
    }, [CLOUD_HOST, CLIENT_ID]);

    // Check session on mount & fetch config
    useEffect(() => {
        const storedLocal = Cookies.get("local_nx_user");
        if (storedLocal) {
            try { setSession(JSON.parse(storedLocal)); } catch (e) { }
        }

        const storedCloud = Cookies.get("nx_cloud_session");
        if (storedCloud) {
            try {
                const parsed = JSON.parse(storedCloud);
                if (parsed.refreshToken && !cloudSession) {
                    refreshCloudSession(parsed.refreshToken);
                } else {
                    setCloudSession({ ...parsed, systems: [] });
                }
            } catch (e) { }
        }

        const fetchGlobalConfig = async () => {
            try {
                const res = await fetch("/api/config/nx");
                const data = await res.json();
                if (data.success && data.config) {
                    const { NEXT_PUBLIC_NX_SERVER_HOST, NEXT_PUBLIC_NX_SERVER_PORT, NEXT_PUBLIC_NX_SYSTEM_ID } = data.config;
                    
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
                }
            } catch (e) { }
        };

        fetchGlobalConfig();
        
        const savedIp = Cookies.get("nx_location_ip");
        const savedPort = Cookies.get("nx_location_port");
        if (savedIp) setNxLocation(prev => ({ ...prev, ip: savedIp }));
        if (savedPort) setNxLocation(prev => ({ ...prev, port: savedPort }));
    }, []);

    // Cloud OAuth logic
    const handleCloudLogin = useCallback(() => {
        const redirectUrl = new URL(window.location.origin + window.location.pathname);
        const authUrl = new URL(`${CLOUD_HOST}/authorize`);
        authUrl.searchParams.set('redirect_url', redirectUrl.toString());
        authUrl.searchParams.set('client_id', CLIENT_ID);
        window.location.href = authUrl.toString();
    }, [CLOUD_HOST, CLIENT_ID]);

    const exchangeCloudCode = useCallback(async (code: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const data = { code, grant_type: 'authorization_code', response_type: 'token' };
            const response = await fetch(`${CLOUD_HOST}/oauth/token/`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error_description || errData.error || "Failed to exchange code");
            }

            const tokens = await response.json();

            if (tokens.access_token) {
                const systemsResp = await fetch(`${CLOUD_HOST}/api/systems/`, {
                    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
                });

                let systemsList: CloudSystem[] = [];
                if (systemsResp.ok) {
                    const systems = await systemsResp.json();
                    systemsList = Array.isArray(systems) ? systems : (systems.items || []);
                }

                const ownerSystem = systemsList.find((s: any) =>
                    s.accessRole?.toLowerCase() === 'owner' || s.accessRole?.toLowerCase() === 'administrator'
                );
                const ownerSystemId = ownerSystem?.id || (systemsList.length > 0 ? systemsList[0].id : undefined);

                if (ownerSystemId) {
                    Cookies.set("nx_system_id", ownerSystemId, { expires: 365, path: '/' });
                }

                const cloudData: CloudSession = {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    systems: systemsList,
                    email: ownerSystem?.ownerAccountEmail || tokens.user_email,
                    ownerSystemId: ownerSystemId
                };

                setCloudSession(cloudData);
                Cookies.set("nx_cloud_session", JSON.stringify({
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    email: cloudData.email,
                    ownerSystemId: ownerSystemId
                }), { expires: 365, path: '/' });
            }
        } catch (err: any) {
            setError(err.message || "Cloud authentication failed");
        } finally {
            setIsLoading(false);
        }
    }, [CLOUD_HOST]);

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
        if (!credentials.username || !credentials.password) {
            setError("Username and password are required");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(LOCAL_NX_URL, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: credentials.username,
                    password: credentials.password,
                    setCookie: true,
                    durationS: 2419200,
                    setSession: true
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const user: NxSession = {
                    token: data.token || data.id,
                    username: data.username || credentials.username,
                    expiresS: data.durationS || 2419200
                };

                // Fetch server ID
                try {
                    const sResp = await fetch("/nx/rest/v3/servers", {
                        headers: { "x-runtime-guid": user.token }
                    });
                    if (sResp.ok) {
                        const sData = await sResp.json();
                        const servers = Array.isArray(sData) ? sData : (sData.items || []);
                        if (servers.length > 0 && servers[0].id) {
                            user.serverId = servers[0].id;
                            Cookies.set("nx_server_id", user.serverId as string, { expires: 365, path: '/' });
                        }
                    }
                } catch (e) { }

                setSession(user);
                Cookies.set("local_nx_user", JSON.stringify(user), { expires: 28, path: '/' });
                setCredentials({ username: "", password: "" });
            } else {
                const errorData = await response.json().catch(() => ({}));
                setError(errorData.errorString || "Authentication failed");
            }
        } catch (err: any) {
            setError(`Connection error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = (type: "local" | "cloud" | "all") => {
        if (type === "local" || type === "all") {
            setSession(null);
            Cookies.remove("local_nx_user", { path: '/' });
            Cookies.remove("nx_server_id", { path: '/' });
        }
        if (type === "cloud" || type === "all") {
            setCloudSession(null);
            Cookies.remove("nx_cloud_session", { path: '/' });
            Cookies.remove("nx_system_id", { path: '/' });
        }
    };

    // Final Dashboard Login (One-Click)
    const handleDashboardLogin = async () => {
        const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;
        
        // Priority 1: User saved credentials in cookies
        let username = Cookies.get("license_saved_user");
        let password = Cookies.get("license_saved_pass");

        // Priority 2: Environment / Config
        if (!username || !password) {
            username = extConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME;
            password = extConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD;
        }

        if (!username || !password) {
            setError("License credentials not found. Please set them in the 'License Config' dropdown (top left).");
            return;
        }

        // Determine session IDs
        let storedSystemId = Cookies.get("nx_system_id") || cloudSession?.ownerSystemId || "";
        let storedServerId = Cookies.get("nx_server_id") || session?.serverId || "";

        await licenseLogin({
            username,
            password,
            system_id: cloudSession ? storedSystemId : "",
            server_id: cloudSession ? "" : (storedServerId || storedSystemId)
        });
    };

    const isConnected = !!session || !!cloudSession;

    return (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-bottom-8">
            {/* Header */}
            <div className="p-8 bg-gradient-to-br from-slate-900 to-blue-900 text-white relative flex flex-col items-center gap-3">
                {/* <h2 className="text-xl font-black tracking-tight uppercase">Hotware Dashboard</h2> */}
            </div>

            {/* Content */}
            <div className="p-8 space-y-8">
                {error && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 animate-in fade-in slide-in-from-top-2">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span className="text-xs font-bold leading-tight">{error}</span>
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
