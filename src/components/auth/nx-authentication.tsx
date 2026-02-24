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
    Cloud
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOCAL_NX_URL = "/nx/rest/v4/login/sessions";

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

export function NxAuthentication() {
    const [session, setSession] = useState<NxSession | null>(null);
    const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [pendingLogout, setPendingLogout] = useState<"local" | "cloud" | "all" | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState({ username: "", password: "" });

    const CLOUD_HOST = 'https://nxvms.com';
    const CLIENT_ID = 'api-tool';

    // Check session
    const checkSession = useCallback(async () => {
        setIsLoading(true);

        await new Promise(resolve => setTimeout(resolve, 600));

        const stored = localStorage.getItem("local_nx_user");
        if (stored) {
            try {
                const user = JSON.parse(stored);
                setSession(user);
            } catch (e) {
                console.error("Failed to parse stored local nx user", e);
                setSession(null);
                localStorage.removeItem("local_nx_user");
            }
        } else {
            setSession(null);
        }

        setIsLoading(false);
    }, []);

    // Check session on mount
    useEffect(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem("local_nx_user") : null;
        if (stored) {
            try {
                setSession(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to hydrate local session", e);
            }
        }

        checkSession();
    }, [checkSession]);

    // Cloud OAuth
    const handleCloudLogin = useCallback(() => {
        const redirectUrl = new URL(window.location.origin + window.location.pathname);
        const authUrl = new URL(`${CLOUD_HOST}/authorize`);
        authUrl.searchParams.set('redirect_url', redirectUrl.toString());
        authUrl.searchParams.set('client_id', CLIENT_ID);
        window.location.href = authUrl.toString();
    }, [CLOUD_HOST, CLIENT_ID]);

    const exchangeCloudCode = useCallback(async (code: string) => {
        setIsLoading(true);
        try {
            const data = {
                code,
                grant_type: 'authorization_code',
                response_type: 'token'
            };
            const response = await fetch(`${CLOUD_HOST}/oauth/token/`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const tokens = await response.json();

            if (tokens.access_token) {
                const systemsResp = await fetch(`${CLOUD_HOST}/api/systems/`, {
                    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
                });
                const systems = await systemsResp.json();
                const systemsList = Array.isArray(systems) ? systems : [];

                // Find owner system
                const ownerSystem = systemsList.find((s: any) => s.accessRole === 'owner' || s.accessRole === 'Owner');
                const ownerSystemId = ownerSystem?.id;

                if (ownerSystemId) {
                    localStorage.setItem("nx_system_id", ownerSystemId);
                }

                const firstSystem = ownerSystem || systemsList[0];

                const cloudData: CloudSession = {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    systems: systemsList,
                    email: firstSystem?.ownerAccountEmail,
                    ownerSystemId: ownerSystemId
                };

                setCloudSession(cloudData);
                localStorage.setItem("nx_cloud_session", JSON.stringify(cloudData));
            }
        } catch (err) {
        } finally {
            setIsLoading(false);
        }
    }, [CLOUD_HOST]);

    // Cloud OAuth callback
    useEffect(() => {
        const storedCloud = localStorage.getItem("nx_cloud_session");
        if (storedCloud) {
            try { setCloudSession(JSON.parse(storedCloud)); } catch (e) { }
        }

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            exchangeCloudCode(code);
            const url = new URL(window.location.href);
            url.searchParams.delete('code');
            window.history.replaceState({}, '', url.toString());
        }
    }, [exchangeCloudCode]);

    const handleLogin = async () => {
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
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: credentials.username,
                    password: credentials.password,
                    setCookie: true,
                    durationS: 2419200,
                    setSession: true
                }),
            });

            const responseText = await response.text();

            if (response.ok) {
                let data: any;
                try {
                    data = JSON.parse(responseText);
                } catch (e) {
                    throw new Error("Invalid session data received from proxy");
                }


                const user: NxSession = {
                    token: data.token || data.id,
                    username: data.username || credentials.username,
                    expiresS: data.durationS || 2419200
                };

                // Fetch server id from /rest/v4/servers
                try {
                    const serversResp = await fetch("/nx/rest/v4/servers", {
                        method: "GET",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "x-runtime-guid": user.token
                        }
                    });

                    const serversRaw = await serversResp.text();

                    if (serversResp.ok) {
                        let servers: any;
                        try {
                            servers = JSON.parse(serversRaw);
                        } catch (e) {
                            throw new Error("Invalid server list received from proxy");
                        }


                        const serversList = Array.isArray(servers) ? servers : (servers.items || []);
                        if (serversList.length > 0) {
                            const serverId = serversList[0].id;
                            user.serverId = serverId;
                            localStorage.setItem("nx_server_id", serverId);
                        } else {
                        }
                    }
                } catch (e) {
                }

                setSession(user);
                localStorage.setItem("local_nx_user", JSON.stringify(user));
                setIsModalOpen(false);
                setCredentials({ username: "", password: "" });
            } else {
                const errorData = await response.json().catch(() => ({}));
                setError(errorData.errorString || "Authentication failed");
            }
        } catch (err: any) {
            setError(`Could not connect to local NX server: ${err.message || 'Unknown Error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLocalLogout = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSession(null);
        localStorage.removeItem("local_nx_user");
        localStorage.removeItem("nx_server_id");
        setPendingLogout(null);
    };

    const handleCloudLogout = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCloudSession(null);
        localStorage.removeItem("nx_cloud_session");
        localStorage.removeItem("nx_system_id");
        setPendingLogout(null);
    };

    // Logout all
    const handleLogout = () => {
        setSession(null);
        setCloudSession(null);
        localStorage.removeItem("local_nx_user");
        localStorage.removeItem("nx_cloud_session");
        localStorage.removeItem("nx_system_id");
        localStorage.removeItem("nx_server_id");
        setPendingLogout(null);
    };

    return (
        <div className="fixed top-6 left-6 z-50 select-none">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        className="h-16 w-80 px-5 bg-white/80 backdrop-blur-xl border-slate-200/60 hover:bg-white hover:border-blue-400/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all group rounded-2xl border-2"
                    >
                        <div className="flex items-center gap-3 w-full">
                            <div className={`p-2 rounded-xl transition-all duration-300 ${(session || cloudSession) ? "bg-green-50 text-green-600 shadow-sm" : "bg-slate-50 text-slate-400"}`}>
                                <Server className={`w-4 h-4 ${(session || cloudSession) ? "animate-pulse" : ""}`} />
                            </div>
                            <div className="flex flex-col items-start gap-0.5 flex-1 overflow-hidden">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                    {(session || cloudSession) ? "Connected" : "Disconnected"}
                                </span>
                                <span className="text-sm font-bold text-slate-700 leading-tight truncate w-full text-left">
                                    {session ? (session.username || "NX Authentication") : cloudSession ? "Cloud Connected" : "NX Authentication"}
                                </span>
                            </div>
                            <div className="relative flex h-2.5 w-2.5 ml-2 mr-1">
                                <div className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${(session || cloudSession) ? "bg-green-400" : "bg-red-400"}`}></div>
                                <div className={`relative inline-flex rounded-full h-2.5 w-2.5 ${(session || cloudSession) ? "bg-green-500" : "bg-red-500"}`}></div>
                            </div>
                        </div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80 p-2.5 rounded-3xl border-slate-100 shadow-[0_20px_50px_rgba(8,_112,_184,_0.15)] animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-1 space-y-3">
                        {/* LOCAL SECTION */}
                        <div className="px-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Local Network</span>
                            <div className={`mt-2 px-4 py-3 rounded-2xl flex items-center gap-4 border transition-all duration-300 group relative ${session
                                ? "bg-blue-50/50 border-blue-100/50"
                                : "bg-slate-50 border-slate-100"
                                }`}>
                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${session ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"}`}>
                                    <Server className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className={`text-[13px] font-bold block truncate ${session ? "text-slate-800" : "text-slate-400"}`}>
                                        {session ? (session.username || "Local Admin") : "Not Connected"}
                                    </span>
                                </div>
                                {session ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPendingLogout("local");
                                        }}
                                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 border border-red-600 shadow-md text-white hover:bg-red-700 hover:text-white hover:border-red-700 absolute right-3"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </Button>
                                ) : (
                                    <Button size="sm" onClick={() => setIsModalOpen(true)} className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg shadow-md shadow-blue-500/20">
                                        LOGIN
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* CLOUD SECTION */}
                        <div className="px-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">NX Cloud</span>
                            <div className={`mt-2 px-4 py-3 rounded-2xl flex items-center gap-4 border transition-all duration-300 group relative ${cloudSession
                                ? "bg-cyan-50/50 border-cyan-100/50"
                                : "bg-slate-50 border-slate-100"
                                }`}>
                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${cloudSession ? "bg-cyan-100 text-cyan-600" : "bg-slate-100 text-slate-400"}`}>
                                    <Cloud className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className={`text-[13px] font-bold block truncate ${cloudSession ? "text-slate-800" : "text-slate-400"}`}>
                                        {cloudSession ? (cloudSession.email || "Connected") : "Not Connected"}
                                    </span>
                                </div>
                                {cloudSession ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPendingLogout("cloud");
                                        }}
                                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 border border-red-600 shadow-md text-white hover:bg-red-700 hover:text-white hover:border-red-700 absolute right-3"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </Button>
                                ) : (
                                    <Button size="sm" onClick={handleCloudLogin} className="h-7 px-3 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold rounded-lg shadow-md">
                                        AUTH
                                    </Button>
                                )}
                            </div>
                        </div>

                        {(session || cloudSession) && (
                            <>
                                <DropdownMenuSeparator className="bg-slate-50 mx-2 my-1" />
                                <DropdownMenuItem
                                    onClick={() => setPendingLogout("all")}
                                    className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer bg-red-600 hover:bg-red-700 focus:bg-red-700 text-white hover:text-white focus:text-white font-bold transition-all shadow-lg shadow-red-500/20"
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span>Sign out of all sessions</span>
                                </DropdownMenuItem>
                            </>
                        )}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[440px] rounded-[2.5rem] border-none p-0 overflow-hidden shadow-2xl bg-white">
                    <div className="relative p-10 bg-gradient-to-br from-slate-900 to-blue-900 text-white overflow-hidden">
                        {/* Background pattern */}
                        <div className="absolute top-0 right-0 p-10 opacity-10">
                            <Server className="w-32 h-32 rotate-12" />
                        </div>
                        <DialogHeader className="relative z-10 space-y-4">
                            <DialogTitle className="text-3xl font-black flex items-center gap-4">
                                <div className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
                                    <Lock className="w-7 h-7" />
                                </div>
                                Local Login
                            </DialogTitle>
                            <DialogDescription className="text-blue-100/70 text-lg font-medium leading-relaxed">
                                Connect to the local server at <code className="text-white bg-white/10 px-2 py-0.5 rounded-md">127.0.0.1</code>
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="p-10 space-y-8">
                        <div className="space-y-6">
                            {error && (
                                <div className="flex items-start gap-4 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 animate-in fade-in slide-in-from-top-2">
                                    <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                                    <span className="text-sm font-bold leading-tight">{error}</span>
                                </div>
                            )}

                            <div className="space-y-5">
                                <div className="space-y-2.5">
                                    <Label htmlFor="nx-username" className="text-slate-500 font-bold ml-1 text-xs uppercase tracking-widest">Username</Label>
                                    <div className="relative group">
                                        <Input
                                            id="nx-username"
                                            placeholder="admin"
                                            className="h-14 pl-12 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-slate-700"
                                            value={credentials.username}
                                            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    document.getElementById("nx-password")?.focus();
                                                }
                                            }}
                                        />
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    <Label htmlFor="nx-password" className="text-slate-500 font-bold ml-1 text-xs uppercase tracking-widest">Password</Label>
                                    <div className="relative group">
                                        <Input
                                            id="nx-password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            className="h-14 pl-12 pr-12 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-slate-700"
                                            value={credentials.password}
                                            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                                        />
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="flex flex-col sm:flex-row gap-4">
                            <Button
                                variant="secondary"
                                onClick={() => setIsModalOpen(false)}
                                className="h-14 px-8 font-bold text-slate-500 bg-slate-200 rounded-2xl hover:bg-slate-300 hover:text-slate-700 order-2 sm:order-1 transition-all border-none"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleLogin}
                                disabled={isLoading}
                                className="h-14 px-10 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50 order-1 sm:order-2 flex-1"
                            >
                                {isLoading ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="w-5 h-5 mr-2" />
                                        <span>Login</span>
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!pendingLogout} onOpenChange={() => setPendingLogout(null)}>
                <DialogContent className="max-w-[340px] rounded-[2rem] border-none p-8 shadow-2xl bg-white">
                    <div className="text-center space-y-6">
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-slate-800">
                                {pendingLogout === "all" ? "Sign out all?" : "Logout account?"}
                            </h3>
                            <p className="text-sm font-bold text-slate-500 leading-relaxed">
                                {pendingLogout === "all"
                                    ? "This will disconnect you from both Local and NX Cloud."
                                    : `Are you sure you want to disconnect your ${pendingLogout === "local" ? "Local" : "Cloud"} account?`}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={() => setPendingLogout(null)}
                                className="flex-1 h-12 font-bold text-slate-500 bg-slate-200 rounded-2xl hover:bg-slate-300 hover:text-slate-700 transition-all border-none"
                            >
                                No
                            </Button>
                            <Button
                                onClick={() => {
                                    if (pendingLogout === "local") handleLocalLogout();
                                    else if (pendingLogout === "cloud") handleCloudLogout();
                                    else if (pendingLogout === "all") handleLogout();
                                }}
                                className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-all active:scale-95"
                            >
                                Yes, Logout
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
