import { NextRequest, NextResponse } from "next/server";
import { getCloudCredentials } from "@/lib/cloud-api";
import { fetchWithDigestAuth } from "@/lib/digest-auth";
import { getVmsSessionToken } from "@/lib/vms-auth";

/**
 * POST /api/nx/create-event
 * Create an event in NX Witness system.
 * Attempts modern REST v4 API event triggering first, falls back to legacy Digest Auth api.
 */
export async function POST(request: NextRequest) {
  try {
    const { timestamp, caption, description, source, cameraId, metadata, systemId, systemName } = await request.json();
    const serverTimestamp = Date.now().toString();

    if (!caption) {
      return NextResponse.json(
        { error: "caption is required" },
        { status: 400 }
      );
    }

    if (!systemId || !systemName) {
      return NextResponse.json(
        { error: "systemId and systemName are required" },
        { status: 400 }
      );
    }

    // Get cloud credentials
    const { username, password } = getCloudCredentials(request);

    if (!username || !password) {
      return NextResponse.json(
        { error: "Cloud credentials not found" },
        { status: 403 }
      );
    }

    const nxLocationIp = request.cookies.get("nx_location_ip")?.value || "127.0.0.1";
    const nxLocationPort = request.cookies.get("nx_location_port")?.value || "7001";
    
    // 1. Try modern REST v4 API using Bearer Token
    let restSuccess = false;
    let restResult = null;
    let restStatus = 200;
    
    try {
      const token = await getVmsSessionToken(nxLocationIp, nxLocationPort, username, password);
      if (token) {
        const restUrl = `https://${nxLocationIp}:${nxLocationPort}/rest/v4/events/generic`;
        console.log(`[Create Event] Attempting REST v4 trigger for ${systemName}: ${caption}`);
        
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
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(restPayload)
        }).finally(() => {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
        });
        
        if (restResponse.ok) {
          restSuccess = true;
          restStatus = restResponse.status;
          restResult = await restResponse.json().catch(() => ({}));
          console.log(`[Create Event] ✅ REST v4 event created successfully: ${caption}`);
        } else {
          console.warn(`[Create Event] REST v4 failed with status ${restResponse.status}, falling back to legacy API...`);
        }
      }
    } catch (restError: any) {
      console.warn(`[Create Event] REST v4 request error: ${restError.message}, falling back to legacy API...`);
    }

    // 2. Fallback to legacy API using Digest Auth
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

      const result = await response.json().catch(() => ({}));
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

