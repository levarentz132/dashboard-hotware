"use client";

import { useState, useEffect, useCallback } from "react";

export interface NxConfig {
    NEXT_PUBLIC_NX_SERVER_HOST?: string;
    NEXT_PUBLIC_NX_SERVER_PORT?: string;
    NEXT_PUBLIC_NX_SYSTEM_ID?: string;
    NEXT_PUBLIC_NX_USERNAME?: string;
    NEXT_PUBLIC_NX_PASSWORD?: string;
    NEXT_PUBLIC_NX_CLOUD_USERNAME?: string;
    has_vms_credentials?: boolean;
    has_cloud_token?: boolean;
}

export function useNxConfig() {
    const [config, setConfig] = useState<NxConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchConfig = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/config/nx");
            const data = await res.json();
            if (data.success && data.config) {
                setConfig(data.config);
                return data.config;
            } else {
                throw new Error(data.message || "Failed to parse configuration");
            }
        } catch (e: any) {
            console.error("[useNxConfig] Failed to fetch config:", e);
            setError(e.message || "Failed to load config");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const saveConfig = useCallback(async (updates: Partial<NxConfig>) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/config/nx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates)
            });
            const data = await res.json();
            if (data.success) {
                setConfig(prev => prev ? { ...prev, ...updates } : (updates as NxConfig));
                return true;
            } else {
                throw new Error(data.message || "Failed to save configuration");
            }
        } catch (e: any) {
            console.error("[useNxConfig] Failed to save config:", e);
            setError(e.message || "Failed to save config");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    return {
        config,
        isLoading,
        error,
        fetchConfig,
        saveConfig,
    };
}
