import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const systemId = searchParams.get("systemId");
  const serverId = searchParams.get("serverId");
  const systemName = searchParams.get("systemName");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  if (!serverId) {
    return NextResponse.json({ error: "Server ID is required" }, { status: 400 });
  }

  try {
    // Build query parameters for events
    const queryParams = new URLSearchParams();

    // Forward relevant query params
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = searchParams.get("_limit");
    const order = searchParams.get("_order");
    const with_ = searchParams.get("_with");

    if (from) queryParams.set("from", from);
    if (to) queryParams.set("to", to);
    if (limit) queryParams.set("_limit", limit);
    if (order) queryParams.set("_order", order);
    if (with_) queryParams.set("_with", with_);

    // Cloud events endpoint with serverId
    const cloudUrl = `https://${systemId}.relay.vmsproxy.com/rest/v3/servers/${serverId}/events?${queryParams.toString()}`;

    // Get the system-specific token from cookie
    const systemToken = request.cookies.get(`nx-cloud-${systemId}`)?.value;

    // Forward all cookies from the request
    const cookies = request.headers.get("cookie") || "";

    // Build headers with authorization if we have a token
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookies,
    };

    // Add bearer token if available
    if (systemToken) {
      headers["Authorization"] = `Bearer ${systemToken}`;
    }

    const response = await fetch(cloudUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    // If auth is required, return friendly error with system name
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          error: "Authentication required",
          systemId,
          systemName: systemName || systemId,
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch events from ${systemName || systemId}`,
          status: response.status,
        },
        { status: response.status }
      );
    }

    const events = await response.json();
    return NextResponse.json(events);
  } catch (error) {
    console.error(`[Cloud Events API] Error fetching from ${systemName || systemId}:`, error);
    return NextResponse.json(
      {
        error: `Connection error to ${systemName || systemId}`,
        systemId,
        systemName: systemName || systemId,
      },
      { status: 500 }
    );
  }
}
