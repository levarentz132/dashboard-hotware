import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const systemId = searchParams.get("systemId");
  const systemName = searchParams.get("systemName");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  try {
    const cloudUrl = `https://${systemId}.relay.vmsproxy.com/rest/v3/servers`;

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
          error: `Failed to fetch servers from ${systemName || systemId}`,
          status: response.status,
        },
        { status: response.status }
      );
    }

    const servers = await response.json();
    return NextResponse.json(servers);
  } catch (error) {
    console.error(`[Cloud Servers API] Error fetching from ${systemName || systemId}:`, error);
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
