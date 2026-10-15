import { NextRequest, NextResponse } from "next/server";
import {
  buildCloudUrl,
  buildCloudHeaders,
  getBasicAuthHeaderFromRequest,
  stableFetch,
} from "@/lib/cloud-api";
import { getDynamicConfig, API_CONFIG } from "@/lib/config";
import { getVmsSessionToken, invalidateVmsSessionToken } from "@/lib/vms-auth";

/**
 * GET /api/cloud/recordings/thumbnail?systemId=...&deviceId=...&timestampMs=...
 * 
 * Fetches a single frame (PNG/JPEG) from the VMS at a specific timestamp.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSystemId = searchParams.get("systemId");
    const systemName = searchParams.get("systemName") || undefined;
    const deviceId = searchParams.get("deviceId")?.replace(/[{}]/g, "");
    const timestampMs = searchParams.get("timestampMs");

    if (!rawSystemId || !deviceId || !timestampMs) {
      return NextResponse.json(
        { error: "systemId, deviceId, and timestampMs are required" },
        { status: 400 }
      );
    }

    const systemId = rawSystemId.replace(/[{}]/g, "").trim();

    // Resolve dynamic config and credentials
    const dynamicConfig = getDynamicConfig(request);
    const serverHost =
      request.headers.get("x-nx-location-ip") ||
      request.cookies.get("nx_location_ip")?.value ||
      dynamicConfig?.NEXT_PUBLIC_NX_SERVER_HOST ||
      API_CONFIG.serverHost ||
      "localhost";
    const serverPort =
      request.headers.get("x-nx-location-port") ||
      request.cookies.get("nx_location_port")?.value ||
      dynamicConfig?.NEXT_PUBLIC_NX_SERVER_PORT ||
      API_CONFIG.serverPort ||
      "7001";

    const username =
      dynamicConfig?.NEXT_PUBLIC_NX_USERNAME ||
      API_CONFIG.username ||
      process.env.NEXT_PUBLIC_NX_USERNAME ||
      "";
    const password =
      dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD ||
      API_CONFIG.password ||
      process.env.NEXT_PUBLIC_NX_PASSWORD ||
      "";

    const params = new URLSearchParams();
    params.set("format", "png");
    params.set("timestampMs", timestampMs);
    params.set("pos", timestampMs);
    params.set("time", timestampMs);
    const endpoint = `/rest/v3/devices/${deviceId}/image`;

    const downloadUrl = buildCloudUrl(systemId, endpoint, params, request, systemName);
    const isRelay = downloadUrl.includes("vmsproxy.com") || downloadUrl.includes("nxvms.com");

    // Resolve host/port for VMS session token acquisition (must never target relay domain)
    let vmsHost = serverHost;
    let vmsPort = serverPort;
    try {
      const parsedUrl = new URL(downloadUrl);
      if (
        parsedUrl.hostname &&
        !parsedUrl.hostname.includes("vmsproxy.com") &&
        !parsedUrl.hostname.includes("nxvms.com")
      ) {
        vmsHost = parsedUrl.hostname;
        if (parsedUrl.port) vmsPort = parsedUrl.port;
      }
    } catch (_) {}

    const headers = buildCloudHeaders(request, systemId);
    headers["Accept"] = "image/png, image/jpeg, image/*;q=0.9, */*;q=0.8";
    delete headers["Content-Type"];

    // Proactively attach cached or fresh VMS session token only for local/direct VMS if username is available
    if (!isRelay && username && !headers["Authorization"]) {
      try {
        const sessionToken = await getVmsSessionToken(vmsHost, vmsPort, username, password);
        if (sessionToken) {
          headers["x-runtime-guid"] = sessionToken;
          headers["Authorization"] = `Bearer ${sessionToken}`;
          delete headers["Cookie"];
          delete headers["x-nx-session"];
          delete headers["x-runtime-session-guid"];
        }
      } catch (err: any) {
        console.warn("[thumbnail] Proactive VMS session token lookup failed:", err.message);
      }
    }

    let response: Response;
    try {
      response = await stableFetch(downloadUrl, { headers });
    } catch (fetchErr: any) {
      const isTimeout =
        fetchErr.name === "AbortError" ||
        fetchErr.message?.toLowerCase().includes("timeout") ||
        fetchErr.code === "ETIMEDOUT";
      console.warn(`[thumbnail] Network error reaching ${downloadUrl}:`, fetchErr.message || fetchErr);
      return NextResponse.json(
        {
          error: isTimeout
            ? "Gateway timeout: VMS server did not respond in time"
            : `Unable to connect to camera server: ${fetchErr.code || fetchErr.message || "Network error"}`,
        },
        { status: isTimeout ? 504 : 502 }
      );
    }

    // Handle authentication failure (401 / 403) by invalidating cache and fetching fresh session token
    if (response.status === 401 || response.status === 403) {
      console.log(`[thumbnail] Upstream rejected authentication (${response.status}). Refreshing VMS session token.`);

      let retrySuccess = false;
      if (!isRelay && username) {
        await invalidateVmsSessionToken(vmsHost, vmsPort, username);
        const freshToken = await getVmsSessionToken(vmsHost, vmsPort, username, password);

        if (freshToken) {
          const retryHeaders: Record<string, string> = {
            ...headers,
            "x-runtime-guid": freshToken,
            "Authorization": `Bearer ${freshToken}`,
          };
          delete retryHeaders["Content-Type"];
          delete retryHeaders["Cookie"];
          delete retryHeaders["x-nx-session"];
          delete retryHeaders["x-runtime-session-guid"];

          try {
            response = await stableFetch(downloadUrl, { headers: retryHeaders });
            retrySuccess = response.ok;
          } catch (retryErr: any) {
            console.warn("[thumbnail] Retry fetch failed:", retryErr.message || retryErr);
          }
        }
      }

      // Fallback to Basic auth if VMS session token retry did not succeed
      if (!retrySuccess && (response.status === 401 || response.status === 403)) {
        const basicAuthHeader =
          getBasicAuthHeaderFromRequest(request) ||
          (username && password
            ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
            : null);

        if (basicAuthHeader) {
          const retryHeaders: Record<string, string> = {
            ...headers,
            Authorization: basicAuthHeader,
          };
          delete retryHeaders["x-runtime-guid"];
          delete retryHeaders["Content-Type"];
          delete retryHeaders["Cookie"];
          delete retryHeaders["x-nx-session"];
          delete retryHeaders["x-runtime-session-guid"];

          try {
            response = await stableFetch(downloadUrl, { headers: retryHeaders });
          } catch (basicErr: any) {
            console.warn("[thumbnail] Basic auth retry fetch failed:", basicErr.message || basicErr);
          }
        }
      }
    }

    if (response.status === 204) {
      return NextResponse.json(
        { error: "No image content available for the requested timestamp" },
        { status: 404 }
      );
    }

    if (!response.ok) {
      const status = response.status === 401 ? 403 : response.status;
      return NextResponse.json(
        { error: `Image fetch failed: ${response.status}` },
        { status }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    // Ensure upstream actually returned an image, not HTML error or JSON text
    if (contentType && !contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Upstream returned non-image response" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) {
      return NextResponse.json(
        { error: "Image data too small or invalid" },
        { status: 502 }
      );
    }

    const previewHeader = buffer.subarray(0, 5).toString("utf-8").trim();
    if (previewHeader.startsWith("<") || previewHeader.startsWith("{")) {
      return NextResponse.json(
        { error: "Upstream returned error text instead of image data" },
        { status: 502 }
      );
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType && contentType.startsWith("image/") ? contentType : "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("[thumbnail] Exception:", error.message || error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
