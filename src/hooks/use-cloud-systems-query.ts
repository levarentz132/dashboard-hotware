"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCloudSystems } from "@/lib/api/cloud-systems";
import { queryKeys } from "@/lib/query-keys";
import {
  CLOUD_SYSTEMS_REFETCH_MS,
  CLOUD_SYSTEMS_STALE_MS,
} from "@/lib/cache-constants";

/**
 * TanStack Query hook for cloud systems (shared cache + background refetch).
 */
export function useCloudSystemsQuery() {
  return useQuery({
    queryKey: queryKeys.cloudSystems.all,
    queryFn: () => fetchCloudSystems(),
    staleTime: CLOUD_SYSTEMS_STALE_MS,
    refetchInterval: CLOUD_SYSTEMS_REFETCH_MS,
  });
}
