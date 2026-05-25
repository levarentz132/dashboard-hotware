"use client";

import { useMemo } from "react";
import { useCloudSystems } from "@/hooks/use-async-data";
import type { CloudSystem } from "@/types/cloud-system";

export type CloudSystemWithOnline = CloudSystem & { isOnline: boolean };

/**
 * Cloud systems with derived isOnline flag (replaces duplicated UI fetch logic).
 */
export function useCloudSystemsWithOnline() {
  const { data, loading, error, refetch } = useCloudSystems();

  const cloudSystems = useMemo<CloudSystemWithOnline[]>(
    () =>
      data.map((system) => ({
        ...system,
        isOnline: system.stateOfHealth === "online",
      })),
    [data],
  );

  return {
    cloudSystems,
    loadingCloud: loading,
    error,
    refetchCloudSystems: refetch,
  };
}
