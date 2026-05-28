/** Shared rules for which NX API GET responses may be stored in Redis. */

export function normalizeNxEndpoint(endpoint: string): string {
  const path = endpoint.toLowerCase().split("?")[0].replace(/\/$/, "") || "/";
  return path;
}

export function isCacheableNxEndpoint(endpoint: string, method: string): boolean {
  if (method !== "GET") return false;

  const lower = normalizeNxEndpoint(endpoint);

  if (
    lower.includes("media") ||
    lower.includes("video") ||
    lower.includes("hls") ||
    lower.includes("stream")
  ) {
    return false;
  }

  const cacheablePatterns = [
    "/devices",
    "/servers",
    "/system/info",
    "/moduleinformation",
    "/users",
    "/usergroups",
    "/api/getevents",
    "/system/metrics/alarms",
    "/api/systems",
    "/storages",
  ];

  return cacheablePatterns.some((pattern) => lower.includes(pattern));
}

/** Full device list (not single-device or status-only paths). */
export function isDevicesListEndpoint(endpoint: string): boolean {
  const p = normalizeNxEndpoint(endpoint);
  return p === "/devices" || p === "/rest/v3/devices";
}

export function isDevicesStatusEndpoint(endpoint: string): boolean {
  const p = normalizeNxEndpoint(endpoint);
  return p.endsWith("/devices/status") || p.includes("/devices/status");
}

/** Mutations that change device inventory or metadata. */
export function isDeviceMutationEndpoint(endpoint: string, method: string): boolean {
  if (method === "GET") return false;
  const p = normalizeNxEndpoint(endpoint);
  return p.includes("/devices");
}

export function isCloudSystemsEndpoint(endpoint: string): boolean {
  const p = normalizeNxEndpoint(endpoint);
  return p.includes("/api/systems");
}
