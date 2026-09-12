import { NextRequest, NextResponse } from "next/server";
import { getCloudCredentials, postToCloudApi, fetchFromCloudApi } from "@/lib/cloud-api";
import { fetchWithDigestAuth } from "@/lib/digest-auth";
import { getVmsSessionToken } from "@/lib/vms-auth";
import { getNxSystemToken, createNxEvent } from "@/lib/nx-cloud-service";

/**
 * POST /api/nx/create-event
 * Create an event in NX Witness system.
 * Supports:
 * 1. Nx Cloud Relay (for Cloud UUID systems via system-scoped OAuth token or postToCloudApi)
 * 2. Modern REST v4 API event triggering via direct Bearer Token
 * 3. Fallback to legacy Digest Auth API
 */
export async function POST(request: NextRequest) {
  try {
    const { timestamp, caption, description, source, cameraId, metadata, systemId, systemName } = await request.json();
    const serverTimestamp = timestamp || Date.now().toString();

    if (!caption) {
      return NextResponse.json(
        { error: "caption is required" },
        { status: 400 }
      );
    }

    if (!systemId && !systemName) {
      return NextResponse.json(
        { error: "systemId or systemName is required" },
        { status: 400 }
      );
    }

    const cleanSysId = (systemId || "").trim().toLowerCase().replace(/[{}]/g, "");
    const isUuidSystem = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSysId);

    // =========================================================================
    // 1. Primary Flow for Cloud Systems: Route via Nx Cloud Relay
    // =========================================================================
    if (isUuidSystem) {
      // Extract refreshToken from session cookies
      let refreshToken: string | null = null;
      try {
        const cookieHeader = request.headers.get("cookie") || "";
        const match = cookieHeader.match(/(?:^|;\s*)nx_cloud_session=([^;]+)/);
        if (match) {
          const session = JSON.parse(decodeURIComponent(match[1]));
          refreshToken = session?.refreshToken || null;
        }
      } catch (_) {}

      if (!refreshToken) {
        const sessionCookie = request.cookies.get("nx_cloud_session")?.value;
        if (sessionCookie) {
          try {
            const session = JSON.parse(decodeURIComponent(sessionCookie));
            refreshToken = session?.refreshToken || null;
          } catch (_) {}
        }
      }

      if (refreshToken) {
        try {
          console.log(`[Create Event] Triggering event via Nx Cloud for system ${systemName || cleanSysId} (${cleanSysId}): ${caption}`);
          const systemAccessToken = await getNxSystemToken(refreshToken, cleanSysId);
          const cloudResult = await createNxEvent(cleanSysId, systemAccessToken, {
            caption,
            description,
            source: source || systemName,
            timestamp: serverTimestamp,
            metadata,
            cameraId,
          });

          if (cloudResult.success) {
            return NextResponse.json(cloudResult.data || { success: true }, { status: 200 });
          } else {
            console.warn(`[Create Event] Nx Cloud Relay event creation failed: ${cloudResult.error}, falling back...`);
          }
        } catch (cloudErr: any) {
          console.warn(`[Create Event] Error during Nx Cloud event creation: ${cloudErr.message}, falling back...`);
        }
      }

      // Try postToCloudApi as a second cloud path
      try {
        const restPayload: any = {
          caption,
          description: description || caption,
          source: source || systemName,
          timestamp: serverTimestamp,
        };
        if (metadata) restPayload.metadata = metadata;
        else if (cameraId) restPayload.metadata = { cameraRefs: [cameraId] };

        const cloudProxyRes = await postToCloudApi(request, {
          systemId: cleanSysId,
          systemName,
          endpoint: "/rest/v4/events/generic",
          body: restPayload,
        });

        if (cloudProxyRes.ok) {
          const data = await cloudProxyRes.json().catch(() => ({ success: true }));
          return NextResponse.json(data, { status: cloudProxyRes.status });
        }
      } catch (proxyErr: any) {
        console.warn(`[Create Event] postToCloudApi error: ${proxyErr.message}`);
      }
    }

    // =========================================================================
    // 2. Direct VMS Connection Flow (Local or Fallback)
    // =========================================================================
    const { username, password } = getCloudCredentials(request);

    if (!username || !password) {
      // If we don't have local credentials and it was a cloud system that failed, return 401/403
      if (isUuidSystem) {
        return NextResponse.json(
          { error: "Failed to post event to Nx Cloud system", details: "Cloud session expired or unreachable." },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Cloud / VMS credentials not found" },
        { status: 403 }
      );
    }

    const nxLocationIp = request.cookies.get("nx_location_ip")?.value || "127.0.0.1";
    const nxLocationPort = request.cookies.get("nx_location_port")?.value || "7001";

    let restSuccess = false;
    let restResult = null;
    let restStatus = 200;

    try {
      const token = await getVmsSessionToken(nxLocationIp, nxLocationPort, username, password);
      if (token) {
        const restUrl = `https://${nxLocationIp}:${nxLocationPort}/rest/v4/events/generic`;
        console.log(`[Create Event] Attempting direct REST v4 trigger for ${systemName || "local"}: ${caption}`);

        const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        const restPayload: any = {
          caption,
          description: description || caption,
          source: source || systemName,
          timestamp: serverTimestamp,
        };

        if (metadata) {
          restPayload.metadata = metadata;
        } else if (cameraId) {
          restPayload.metadata = { cameraRefs: [cameraId] };
        }

        const restResponse = await fetch(restUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(restPayload),
        }).finally(() => {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
        });

        if (restResponse.ok) {
          restSuccess = true;
          restStatus = restResponse.status;
          restResult = await restResponse.json().catch(() => ({ success: true }));
          console.log(`[Create Event] ✅ Direct REST v4 event created successfully: ${caption}`);
        } else {
          console.warn(`[Create Event] Direct REST v4 failed with status ${restResponse.status}, falling back to legacy API...`);
        }
      }
    } catch (restError: any) {
      console.warn(`[Create Event] Direct REST v4 request error: ${restError.message}, falling back to legacy API...`);
    }

    // 3. Fallback to legacy API using Digest Auth
    if (!restSuccess) {
      const queryParams = new URLSearchParams();
      queryParams.set("timestamp", serverTimestamp);
      queryParams.set("caption", caption);
      if (description) queryParams.set("description", description);
      if (source) queryParams.set("source", source);

      const localUrl = `https://${nxLocationIp}:${nxLocationPort}/api/createEvent?${queryParams.toString()}`;
      console.log(`[Create Event] Attempting legacy Digest Auth trigger: ${caption}`);

      const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

      const response = await fetchWithDigestAuth(localUrl, username, password, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }).finally(() => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
      });

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status === 401 ? 403 : response.status;
        console.error(`[Create Event] Legacy failed: ${response.status} - ${errorText}`);
        return NextResponse.json(
          { error: `Failed to create event: ${response.status}`, details: errorText },
          { status }
        );
      }

      const result = await response.json().catch(() => ({ success: true }));
      console.log(`[Create Event] ✅ Legacy event created successfully: ${caption}`);
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(restResult, { status: restStatus });
  } catch (error: any) {
    console.error("[Create Event] Error:", error);
    return NextResponse.json(
      { error: "Failed to create event", details: error.message },
      { status: 500 }
    );
  }
}
