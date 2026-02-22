import { NextRequest, NextResponse } from "next/server";
import { getCloudCredentials } from "@/lib/cloud-api";
import { fetchWithDigestAuth } from "@/lib/digest-auth";

/**
 * POST /api/nx/create-event
 * Create an event in NX Witness system with digest authentication
 */
export async function POST(request: NextRequest) {
  try {
    const { timestamp, caption, systemId, systemName } = await request.json();

    if (!timestamp || !caption) {
      return NextResponse.json(
        { error: "timestamp and caption are required" },
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
        { status: 401 }
      );
    }

    const localUrl = `https://127.0.0.1:7001/api/createEvent?timestamp=${encodeURIComponent(timestamp)}&caption=${encodeURIComponent(caption)}`;

    console.log(`[Create Event] Creating event for ${systemName}: ${caption}`);

    // Make request with digest authentication
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
      console.error(`[Create Event] Failed: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to create event: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json().catch(() => ({}));
    console.log(`[Create Event] ✅ Event created successfully: ${caption}`);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[Create Event] Error:", error);
    return NextResponse.json(
      { error: "Failed to create event", details: error.message },
      { status: 500 }
    );
  }
}
