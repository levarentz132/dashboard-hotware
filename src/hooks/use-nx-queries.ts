"use client";

import { useQuery } from "@tanstack/react-query";
import nxAPI, { type NxEvent, type NxCamera } from "@/lib/nxapi";
import { queryKeys } from "@/lib/query-keys";
import { parseError } from "@/hooks/parse-error";
import type { ICamera, IDeviceType } from "@/types/Device";
import {
  NX_ALARMS_STALE_MS,
  NX_DEVICES_STALE_MS,
  NX_DEVICE_TYPES_STALE_MS,
  NX_EVENTS_STALE_MS,
  NX_MODULES_STALE_MS,
  NX_SERVERS_STALE_MS,
} from "@/lib/cache-constants";

const EVENTS_REFETCH_MS = NX_EVENTS_STALE_MS;
const ALARMS_REFETCH_MS = NX_ALARMS_STALE_MS;

function useNxSystemQuery<T>(
  systemId: string | undefined,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  empty: T,
  staleTime = NX_DEVICES_STALE_MS,
) {
  const query = useQuery({
    queryKey,
    queryFn,
    enabled: !!systemId,
    staleTime,
  });

  return {
    data: query.data ?? empty,
    loading: query.isLoading,
    error: query.error ? parseError(query.error) : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useEventsQuery(limit: number = 50) {
  const query = useQuery({
    queryKey: queryKeys.nx.events(limit),
    queryFn: () => nxAPI.getEvents(limit),
    refetchInterval: EVENTS_REFETCH_MS,
    staleTime: EVENTS_REFETCH_MS,
  });

  return {
    events: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? parseError(query.error) : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useAlarmsQuery() {
  const query = useQuery({
    queryKey: queryKeys.nx.alarms(),
    queryFn: () => nxAPI.getAlarms(),
    refetchInterval: ALARMS_REFETCH_MS,
    staleTime: ALARMS_REFETCH_MS,
  });

  return {
    alarms: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? parseError(query.error) : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useModulesQuery() {
  const query = useQuery({
    queryKey: queryKeys.nx.modules(),
    queryFn: async () => {
      const data = await nxAPI.getModuleInformation();
      if (data?.modules?.length) {
        return data.modules;
      }
      throw new Error(
        "Server connected but no modules found. Check your Nx Witness system status.",
      );
    },
    staleTime: NX_MODULES_STALE_MS,
  });

  return {
    modules: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? parseError(query.error) : null,
  };
}

export function useCamerasQuery(systemId?: string) {
  return useNxSystemQuery<NxCamera[]>(
    systemId,
    queryKeys.nx.cameras(systemId ?? ""),
    async () => {
      nxAPI.setSystemId(systemId!);
      return nxAPI.getCameras();
    },
    [],
  );
}

export function useDeviceTypeQuery(systemId?: string) {
  return useNxSystemQuery<IDeviceType[]>(
    systemId,
    queryKeys.nx.deviceTypes(systemId ?? ""),
    async () => {
      nxAPI.setSystemId(systemId!);
      return nxAPI.getDeviceTypes();
    },
    [],
    NX_DEVICE_TYPES_STALE_MS,
  );
}

export function useDevicesQuery(systemId?: string) {
  return useNxSystemQuery<ICamera[]>(
    systemId,
    queryKeys.nx.devices(systemId ?? ""),
    async () => {
      nxAPI.setSystemId(systemId!);
      return nxAPI.getDevices();
    },
    [],
  );
}

export function useServersQuery(systemId?: string) {
  return useNxSystemQuery<Record<string, unknown>[]>(
    systemId,
    queryKeys.nx.servers(systemId ?? ""),
    async () => {
      nxAPI.setSystemId(systemId!);
      const data = await nxAPI.getServers();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      if (data && typeof data === "object" && "servers" in data) {
        return (data as { servers: unknown[] }).servers;
      }
      return [];
    },
    [],
    NX_SERVERS_STALE_MS,
  );
}

export type { NxEvent };
