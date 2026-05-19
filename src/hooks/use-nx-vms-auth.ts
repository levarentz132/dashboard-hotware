"use client";

import { useState, useEffect, useCallback } from "react";
import Cookies from "js-cookie";

const LOCAL_NX_URL = "/nx/rest/v3/login/sessions";
const CLOUD_HOST = 'https://nxvms.com';
const CLIENT_ID = 'api-tool';

export interface NxSession {
    token: string;
    username?: string;
    expiresS?: number;
    serverId?: string;
}

export interface CloudSystem {
    id: string;
    name: string;
    version: string;
    isOnline: boolean;
    ownerAccountEmail?: string;
    accessRole?: string;
}

export interface CloudSession {
    accessToken: string;
    refreshToken: string;
    systems: CloudSystem[];
    email?: string;
    ownerSystemId?: string;
}

export function useNxVmsAuth() {
    const [session, setSession] = useState<NxSession | null>(null);
    const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refresh Cloud Access Token using Refresh Token
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
                return newSession;
            } else {
                console.warn("[NxCloud] Refresh failed, session might be invalid");
                logout("cloud");
                return null;
            }
        } catch (e: any) {
            console.error("[NxCloud] Refresh error:", e);
            setError(e.message || "Failed to refresh cloud session");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Local VMS Login
    const loginLocal = useCallback(async (username: string, password: string): Promise<boolean> => {
        if (!username || !password) {
            setError("Username and password are required");
            return false;
        }

        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(LOCAL_NX_URL, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password,
                    setCookie: true,
                    setSession: true
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const user: NxSession = {
                    token: data.token || data.id,
                    username: data.username || username,
                    expiresS: data.durationS || 8640000   
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
                            Cookies.set("nx_server_id", servers[0].id, { expires: 365, path: '/' });
                        }
                    }
                } catch (e) {
                    console.warn("[useNxVmsAuth] Failed to discover Server ID", e);
                }

                setSession(user);
                Cookies.set("local_nx_user", JSON.stringify(user), { expires: 28, path: '/' });
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                setError(errorData.errorString || "Authentication failed");
                return false;
            }
        } catch (err: any) {
            setError(`Connection error: ${err.message}`);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Cloud Redirect OAuth
    const loginCloud = useCallback(() => {
        const redirectUrl = new URL(window.location.origin + window.location.pathname);
        const authUrl = new URL(`${CLOUD_HOST}/authorize`);
        authUrl.searchParams.set('redirect_url', redirectUrl.toString());
        authUrl.searchParams.set('client_id', CLIENT_ID);
        window.location.href = authUrl.toString();
    }, []);

    // Exchange OAuth Code for Tokens
    const exchangeCloudCode = useCallback(async (code: string): Promise<void> => {
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

                const email = ownerSystem?.ownerAccountEmail || tokens.user_email;

                const cloudData: CloudSession = {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    systems: systemsList,
                    email: email,
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
            console.error("[useNxVmsAuth] Cloud OAuth exchange error:", err);
            setError(err.message || "Cloud authentication failed");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Logout
    const logout = useCallback((type: "local" | "cloud" | "all") => {
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
    }, []);

    const clearError = useCallback(() => setError(null), []);

    // Hydrate & Sync initial cookies on mount
    useEffect(() => {
        const storedLocal = Cookies.get("local_nx_user");
        if (storedLocal) {
            try {
                setSession(JSON.parse(storedLocal));
            } catch (e) {
                console.error("[useNxVmsAuth] Failed to hydrate local VMS session", e);
            }
        }

        const storedCloud = Cookies.get("nx_cloud_session");
        if (storedCloud) {
            try {
                const parsed = JSON.parse(storedCloud);
                if (parsed.refreshToken) {
                    refreshCloudSession(parsed.refreshToken);
                } else {
                    setCloudSession({ ...parsed, systems: [] });
                }
            } catch (e) {
                console.error("[useNxVmsAuth] Failed to hydrate cloud VMS session", e);
            }
        }
    }, [refreshCloudSession]);

    return {
        session,
        cloudSession,
        isLoading,
        error,
        setSession,
        setCloudSession,
        loginLocal,
        loginCloud,
        exchangeCloudCode,
        refreshCloudSession,
        logout,
        clearError,
        setError
    };
}
