import { getElectronHeaders } from "@/lib/config";

export interface CloudSystem {
  id: string;
  name: string;
  systemId?: string;
  stateOfHealth?: string;
}

export interface CloudDevice {
  id: string;
  name: string;
  typeId?: string;
}

export interface RecordingPeriod {
  startTimeMs: number;
  durationMs: number;
}

// Custom error class for auth-related errors
export class CloudAuthError extends Error {
  public requiresAuth: boolean;
  constructor(message: string) {
    super(message);
    this.name = 'CloudAuthError';
    this.requiresAuth = true;
  }
}

export async function fetchCloudSystems(): Promise<CloudSystem[]> {
  const response = await fetch("/api/cloud/cdb-systems", {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...getElectronHeaders(),
    },
  });

  if (!response.ok) {
    // Try to parse error response
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // Ignore JSON parse errors
    }

    // Check if this is an auth error
    if (response.status === 401 || response.status === 403 || errorData.requiresAuth) {
      console.error("[recordings-service] Cloud authentication required");
      throw new CloudAuthError(errorData.error || "Please log in to NX Cloud to access systems.");
    }

    throw new Error(errorData.error || `Failed to fetch systems: ${response.status}`);
  }

  const data = await response.json();
  // Handle both formats: direct array or { systems: [...] }
  const systems = Array.isArray(data) ? data : (data?.systems || data || []);
  return Array.isArray(systems) ? systems : [];
}

export async function fetchCloudDevices(
  systemId: string
): Promise<CloudDevice[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...getElectronHeaders(),
    };

    const response = await fetch(
      `/api/cloud/recordings/devices?systemId=${encodeURIComponent(systemId)}`,
      {
        method: "GET",
        credentials: "include",
        headers,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to fetch devices: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[recordings-service] fetchCloudDevices error:", error);
    throw error;
  }
}

export async function fetchRecordedTimePeriods(
  systemId: string,
  deviceId: string,
  startTime?: number,
  endTime?: number
): Promise<any> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...getElectronHeaders(),
    };

    const params = new URLSearchParams();
    params.set("systemId", systemId);
    params.set("deviceId", deviceId);
    if (startTime) params.set("startTime", String(startTime));
    if (endTime) params.set("endTime", String(endTime));

    const response = await fetch(`/api/cloud/recordings?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to fetch recordings: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[recordings-service] fetchRecordedTimePeriods error:", error);
    throw error;
  }
}

export async function getDownloadUrl(
  systemId: string,
  deviceId: string,
  startTime: number,
  endTime?: number
): Promise<{ downloadUrl: string; authHeader: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...getElectronHeaders(),
  };

  const params = new URLSearchParams();
  params.set("systemId", systemId);
  params.set("deviceId", deviceId);
  params.set("startTime", String(startTime));
  if (endTime) params.set("endTime", String(endTime));

  const response = await fetch(`/api/cloud/recordings/download?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get download URL: ${response.status}`);
  }

  return response.json();
}
