/**
 * TanStack Query key factory — keeps cache keys consistent across the app.
 */

export const queryKeys = {
  cloudSystems: {
    all: ["cloud-systems"] as const,
  },
  nx: {
    events: (limit: number) => ["nx", "events", limit] as const,
    alarms: () => ["nx", "alarms"] as const,
    modules: () => ["nx", "modules"] as const,
    cameras: (systemId: string) => ["nx", "cameras", systemId] as const,
    deviceTypes: (systemId: string) => ["nx", "device-types", systemId] as const,
    devices: (systemId: string) => ["nx", "devices", systemId] as const,
    servers: (systemId: string) => ["nx", "servers", systemId] as const,
    systemInfo: (systemId: string) => ["nx", "system-info", systemId] as const,
  },
} as const;
