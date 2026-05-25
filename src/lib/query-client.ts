import type { QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | null = null;

export function setBrowserQueryClient(client: QueryClient): void {
  browserQueryClient = client;
}

export function getBrowserQueryClient(): QueryClient | null {
  return browserQueryClient;
}
