import { NextRequest, NextResponse } from "next/server";
import https from "https";

// Disable SSL verification for localhost development
if (typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const NX_HOST = process.env.NEXT_PUBLIC_NX_SERVER_HOST;
const NX_PORT = process.env.NEXT_PUBLIC_NX_SERVER_PORT;
const NX_BASE_URL = `https://${NX_HOST}:${NX_PORT}`;

// Create custom agent that ignores SSL errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function fetchWithSSLBypass(url: string, options: RequestInit = {}) {
  // For Node.js fetch with SSL bypass
  return fetch(url, {
    ...options,
    // @ts-expect-error - agent is not in the types but works in Node.js
    agent: httpsAgent,
  });
}

interface StorageItem {
  id: string;
  serverId?: string;
  parentId?: string;
  name?: string;
  url?: string;
  storageType?: string;
  spaceLimitB?: number;
  isUsedForWriting?: boolean;
  isBackup?: boolean;
  isOnline?: boolean;
  totalSpace?: number;
  freeSpace?: number;
  reservedSpace?: number;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    // Get auth from cookies or use default credentials
    const cookies = request.headers.get("cookie") || "";
    const username = process.env.NEXT_PUBLIC_NX_USERNAME;
    const password = process.env.NEXT_PUBLIC_NX_PASSWORD;

    const authHeaders: Record<string, string> = password
      ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` }
      : {};

    // Try different endpoints for storages
    const storageEndpoints = ["/rest/v3/servers/*/storages", "/rest/v2/ec2/getStorages", "/ec2/getStorages"];

    let storages: StorageItem[] = [];
    let lastError: Error | null = null;

    for (const endpoint of storageEndpoints) {
      const targetUrl = `${NX_BASE_URL}${endpoint}`;
      console.log("[Local Storage API] Trying endpoint:", targetUrl);

      try {
        const response = await fetchWithSSLBypass(targetUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Cookie: cookies,
            ...authHeaders,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(
            "[Local Storage API] Success from endpoint:",
            endpoint,
            "Items:",
            Array.isArray(data) ? data.length : "not array"
          );

          if (Array.isArray(data) && data.length > 0) {
            storages = data;
            console.log("[Local Storage API] First storage item:", JSON.stringify(data[0], null, 2));
            break;
          }
        } else {
          console.log("[Local Storage API] Endpoint failed:", endpoint, response.status);
        }
      } catch (endpointError) {
        console.log("[Local Storage API] Endpoint error:", endpoint, endpointError);
        lastError = endpointError instanceof Error ? endpointError : new Error(String(endpointError));
      }
    }

    // If no storages found, return error
    if (storages.length === 0) {
      return NextResponse.json(
        {
          error: "Failed to fetch storages from local server",
          details: lastError?.message || "All endpoints failed or returned empty",
          hint: `Make sure the NX Witness server is running on ${NX_HOST}:${NX_PORT}`,
        },
        { status: 500 }
      );
    }

    // Now try to get storage status info for space details
    const statusEndpoints = [
      "/rest/v3/servers/*/storages/*/status",
      "/rest/v2/ec2/getStatusList?filter=StorageStatus",
      "/ec2/getStatusList?filter=StorageStatus",
    ];

    for (const endpoint of statusEndpoints) {
      const targetUrl = `${NX_BASE_URL}${endpoint}`;
      console.log("[Local Storage API] Trying status endpoint:", targetUrl);

      try {
        const response = await fetchWithSSLBypass(targetUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Cookie: cookies,
            ...authHeaders,
          },
        });

        if (response.ok) {
          const statusData = await response.json();
          console.log(
            "[Local Storage API] Status data received:",
            JSON.stringify(statusData, null, 2).substring(0, 500)
          );

          // Merge status data with storages
          if (Array.isArray(statusData)) {
            storages = storages.map((storage) => {
              const status = statusData.find(
                (s: Record<string, unknown>) => s.storageId === storage.id || s.id === storage.id
              );
              if (status) {
                return {
                  ...storage,
                  totalSpace: status.totalSpace || status.totalSpaceB || storage.totalSpace,
                  freeSpace: status.freeSpace || status.freeSpaceB || storage.freeSpace,
                  isOnline: status.isOnline ?? storage.isOnline,
                };
              }
              return storage;
            });
          }
          break;
        }
      } catch (statusError) {
        console.log("[Local Storage API] Status endpoint error:", endpoint, statusError);
      }
    }

    return NextResponse.json(storages);
  } catch (error) {
    console.error("[Local Storage API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to connect to local NX server",
        details: error instanceof Error ? error.message : "Unknown error",
        hint: `Make sure the NX Witness server is running on ${NX_HOST}:${NX_PORT}`,
      },
      { status: 500 }
    );
  }
}
