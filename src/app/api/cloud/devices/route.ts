import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const systemId = searchParams.get("systemId");
  const systemName = searchParams.get("systemName");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  try {
    const cloudUrl = `https://${systemId}.relay.vmsproxy.com/rest/v3/devices`;

    // Forward cookies from the request
    const cookies = request.headers.get("cookie") || "";

    const response = await fetch(cloudUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      // Don't follow redirects, let us handle auth errors
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
          error: `Failed to fetch from ${systemName || systemId}`,
          status: response.status,
        },
        { status: response.status }
      );
    }

    const devices = await response.json();
    return NextResponse.json(devices);
  } catch (error) {
    console.error(`[Cloud Devices API] Error fetching from ${systemName || systemId}:`, error);
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
