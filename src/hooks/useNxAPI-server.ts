import { useServersQuery } from "@/hooks/use-nx-queries";

export function useServers(systemId?: string) {
  const { data: servers, loading, error, refetch } = useServersQuery(systemId);
  return { servers, loading, error, refetch };
}
