"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchCloudSystems, CloudSystem } from "./use-async-data";
import Cookies from "js-cookie";

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
    localFetcher: (options?: { skipCache?: boolean }) => Promise<SyncData<T> | null>,
    cloudItemFetcher: (system: CloudSystem, options?: { skipCache?: boolean }) => Promise<T[]>,
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

    const sync = useCallback(async (syncOptions?: { skipCache?: boolean }) => {
        const currentFetchId = ++fetchCount.current;
        const skipCache = !!syncOptions?.skipCache;

        try {
            setLoading(true);
            setError(null);

            // Check login states
            const localUserStr = Cookies.get("local_nx_user");
            const cloudSessionStr = Cookies.get("nx_cloud_session");

            const hasLocalLogin = !!localUserStr;
            const hasCloudLogin = !!cloudSessionStr;

            let localData: SyncData<T> | null = null;

            // 1. Prioritize Local if available
            if (hasLocalLogin) {
                try {
                    localData = await localFetcher({ skipCache });
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

                    // Process cloud systems sequentially to avoid race conditions
                    for (const system of systems) {
                        if (!isMounted.current || currentFetchId !== fetchCount.current) return;

                        const cloudId = normalizeId(system.id);
                        if (localId && cloudId === localId) continue;
                        const isOnline = system.stateOfHealth === "online" || (system as any).isOnline === true || system.stateOfHealth === undefined;
                        if (!isOnline) continue;

                        try {
                            const items = await cloudItemFetcher(system, { skipCache });

                            if (isMounted.current && currentFetchId === fetchCount.current) {
                                setDataBySystem((prev) => {
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
                    }
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

    // Listen for real-time status changes from GlobalDeviceMonitor
    useEffect(() => {
        const handleDeviceStatusChange = (event: Event) => {
            const customEvent = event as CustomEvent<{
                deviceId: string;
                systemId: string;
                status: string;
            }>;
            if (!customEvent?.detail) return;
            const { deviceId, systemId, status } = customEvent.detail;

            const normalizeId = (id: string) => id.toLowerCase().replace(/[{}]/g, "");
            const targetSystemId = normalizeId(systemId);
            const targetDeviceId = normalizeId(deviceId);

            setDataBySystem((prev) => {
                return prev.map((systemData) => {
                    if (normalizeId(systemData.systemId) !== targetSystemId) {
                        return systemData;
                    }
                    const updatedItems = systemData.items.map((item: any) => {
                        const itemId = normalizeId(item?.id || "");
                        if (itemId !== targetDeviceId) {
                            return item;
                        }
                        console.log(`[InventorySync] Live-updating camera ${item.name || item.id} status to ${status}`);
                        return { ...item, status };
                    });
                    return { ...systemData, items: updatedItems };
                });
            });
        };

        window.addEventListener("nx:device-status-changed", handleDeviceStatusChange);
        return () => {
            window.removeEventListener("nx:device-status-changed", handleDeviceStatusChange);
        };
    }, []);

    return {
        dataBySystem,
        loading,
        loadingCloud,
        error,
        refetch: sync,
    };
}
