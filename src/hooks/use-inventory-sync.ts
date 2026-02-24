"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchCloudSystems, CloudSystem } from "./use-async-data";

export interface SyncData<T> {
    systemId: string;
    systemName: string;
    items: T[];
    stateOfHealth: string;
}

interface UseInventorySyncOptions<T> {
    idField?: keyof T;
    localSystemName?: string;
    onUpdate?: (data: SyncData<T>[]) => void;
}

/**
 * Hook to implement the "Local First, then Cloud" sync strategy.
 * 
 * Strategy:
 * 1. Load data from local NX server immediately if logged in.
 * 2. Asynchronously fetch all cloud systems if logged in to cloud.
 * 3. Fetch items from each cloud system and append to state as they arrive.
 * 4. Handle login scenarios (local-only, cloud-only, both).
 */
export function useInventorySync<T>(
    localFetcher: () => Promise<SyncData<T> | null>,
    cloudItemFetcher: (system: CloudSystem) => Promise<T[]>,
    options: UseInventorySyncOptions<T> = {}
) {
    const { localSystemName = "Local Server" } = options;

    const [dataBySystem, setDataBySystem] = useState<SyncData<T>[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingCloud, setLoadingCloud] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isMounted = useRef(true);
    const fetchCount = useRef(0);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const sync = useCallback(async () => {
        const currentFetchId = ++fetchCount.current;

        try {
            setLoading(true);
            setError(null);

            // Check login states
            const localUserStr = localStorage.getItem("local_nx_user");
            const cloudSessionStr = localStorage.getItem("nx_cloud_session");

            const hasLocalLogin = !!localUserStr;
            const hasCloudLogin = !!cloudSessionStr;

            let localData: SyncData<T> | null = null;

            // 1. Prioritize Local if available
            if (hasLocalLogin) {
                try {
                    localData = await localFetcher();
                    if (localData && isMounted.current && currentFetchId === fetchCount.current) {
                        console.log("[InventorySync] Local data loaded:", localData.systemName, localData.items.length, "cameras");
                        setDataBySystem([localData]);
                        if (options.onUpdate) options.onUpdate([localData]);
                        // If we have local data, we can stop "initial" loading
                        setLoading(false);
                    } else {
                        console.log("[InventorySync] No local data or fetch outdated");
                    }
                } catch (e) {
                    console.error("[InventorySync] Local fetch failed:", e);
                }
            }

            // 2. Then Check Cloud if available
            if (hasCloudLogin) {
                setLoadingCloud(true);
                try {
                    const systems = await fetchCloudSystems();

                    if (!isMounted.current || currentFetchId !== fetchCount.current) return;

                    const normalizeId = (id: string) => id.toLowerCase().replace(/[{}]/g, "");
                    const localId = localData ? normalizeId(localData.systemId) : null;

                    // Process cloud systems
                    systems.forEach(async (system) => {
                        const cloudId = normalizeId(system.id);

                        // Skip if this system is the local one we already loaded
                        if (localId && cloudId === localId) return;
                        if (system.stateOfHealth !== "online") return;

                        try {
                            const items = await cloudItemFetcher(system);

                            if (isMounted.current && currentFetchId === fetchCount.current && items.length >= 0) {
                                setDataBySystem((prev) => {
                                    // Check for duplicates with normalized IDs
                                    if (prev.find((s) => normalizeId(s.systemId) === cloudId)) return prev;

                                    const newData = [
                                        ...prev,
                                        {
                                            systemId: system.id,
                                            systemName: system.name,
                                            items,
                                            stateOfHealth: system.stateOfHealth,
                                        },
                                    ];
                                    if (options.onUpdate) options.onUpdate(newData);
                                    return newData;
                                });
                            }
                        } catch (e) {
                            console.error(`[InventorySync] Cloud fetch failed for ${system.name}:`, e);
                        }
                    });
                } catch (e) {
                    console.error("[InventorySync] Cloud systems fetch failed:", e);
                    if (!hasLocalLogin) setError("Failed to fetch cloud systems");
                } finally {
                    if (isMounted.current && currentFetchId === fetchCount.current) {
                        setLoadingCloud(false);
                        setLoading(false);
                    }
                }
            } else {
                // No cloud login
                setLoading(false);
            }
        } catch (err) {
            console.error("[InventorySync] Sync error:", err);
            if (isMounted.current && currentFetchId === fetchCount.current) {
                setError(err instanceof Error ? err.message : "Sync failed");
                setLoading(false);
            }
        }
    }, [localFetcher, cloudItemFetcher, options]);

    useEffect(() => {
        sync();
    }, []); // Run once on mount

    return {
        dataBySystem,
        loading,
        loadingCloud,
        error,
        refetch: sync,
    };
}
