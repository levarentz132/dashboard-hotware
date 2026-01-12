import nxAPI from "@/lib/nxapi";
import { useAsyncData } from "./use-async-data";

// Hook for server information
export function useServers() {
  const {
    data: servers,
    loading,
    error,
  } = useAsyncData<any[]>(
    async () => {
      const data = await nxAPI.getServers();

      // The API returns servers directly as an array, not wrapped in an object
      if (Array.isArray(data) && data.length > 0) {
        return data;
      } else if (data && typeof data === "object" && data.servers) {
        // Fallback for wrapped response
        return data.servers;
      }

      throw new Error("Server connected but no servers found. Check your Nx Witness configuration.");
    },
    [],
    { fetchOnMount: true }
  );

  return { servers, loading, error };
}
