import nxAPI from "@/lib/nxapi";
import { useEffect, useState } from "react";

// Hook for server information
export function useServers() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await nxAPI.getServers();
        console.log("Server data received:", data); // Debug log

        // The API returns servers directly as an array, not wrapped in an object
        if (Array.isArray(data) && data.length > 0) {
          setServers(data);
          setError(null);
        } else if (data && typeof data === "object" && data.servers) {
          // Fallback for wrapped response
          setServers(data.servers);
          setError(null);
        } else {
          setServers([]);
          setError("Server connected but no servers found. Check your Nx Witness configuration.");
        }
      } catch (err) {
        console.error("Error fetching servers:", err); // Debug log
        setError("Cannot connect to Nx Witness server. Check server status and configuration.");
        setServers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, []);

  return { servers, loading, error };
}
