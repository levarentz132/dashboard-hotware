/** Pure helpers for device list/status shaping (safe for client + server). */

export interface DeviceSummaryItem {
  id: string;
  name: string;
  status: string;
  serverId?: string;
  typeId?: string;
}

export function buildDevicesSummary(devicesList: any[]): DeviceSummaryItem[] {
  return devicesList.map((d) => ({
    id: String(d.id),
    name: String(d.name || d.id || ""),
    status: String(d.status ?? "unknown"),
    serverId: d.serverId,
    typeId: d.typeId,
  }));
}

/** Normalize NX /devices/status payloads to id → status. */
export function normalizeDeviceStatusMap(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object") return {};

  if (Array.isArray(data)) {
    const map: Record<string, string> = {};
    for (const item of data as any[]) {
      if (item?.id) map[String(item.id)] = String(item.status ?? "unknown");
    }
    return map;
  }

  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "string") {
      map[key] = value;
    } else if (value && typeof value === "object" && "status" in value) {
      map[key] = String((value as { status?: string }).status ?? "unknown");
    }
  }
  return map;
}

/** Merge lightweight status map with summary (names from last full list). */
export function mergeStatusWithSummary(
  statusData: unknown,
  summary: DeviceSummaryItem[] | null,
): DeviceSummaryItem[] {
  const statusMap = normalizeDeviceStatusMap(statusData);
  const summaryById = new Map<string, DeviceSummaryItem>();
  if (summary) {
    for (const s of summary) {
      summaryById.set(s.id.replace(/[{}]/g, "").toLowerCase(), s);
      summaryById.set(s.id, s);
    }
  }

  const ids = new Set<string>([
    ...Object.keys(statusMap),
    ...(summary?.map((s) => s.id) ?? []),
  ]);

  const merged: DeviceSummaryItem[] = [];
  for (const rawId of ids) {
    const clean = rawId.replace(/[{}]/g, "").toLowerCase();
    const meta = summaryById.get(clean) ?? summaryById.get(rawId);
    merged.push({
      id: meta?.id ?? rawId,
      name: meta?.name ?? rawId,
      status: statusMap[rawId] ?? statusMap[clean] ?? meta?.status ?? "unknown",
      serverId: meta?.serverId,
      typeId: meta?.typeId,
    });
  }

  return merged;
}
