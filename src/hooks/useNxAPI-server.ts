import nxAPI from "@/lib/nxapi";
import { useAsyncData } from "./use-async-data";

// Hook for server information
export function useServers(systemId?: string) {
  const {
    data: servers,
    loading,
    error,
    refetch,
  } = useAsyncData<any[]>(
    async () => {
      if (!systemId) return [];
      nxAPI.setSystemId(systemId);
      const data = await nxAPI.getServers();

      // The API returns servers directly as an array, not wrapped in an object
      if (Array.isArray(data) && data.length > 0) {
        return data;
      } else if (data && typeof data === "object" && data.servers) {
        // Fallback for wrapped response
        return data.servers;
      }

      return [];
    },
    [],
    { fetchOnMount: !!systemId, deps: [systemId] }
  );

  return { servers, loading, error, refetch };
}
