import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const systemId = searchParams.get("systemId");
  const from = searchParams.get("from"); // Required: YYYY-MM-DDTHH:mm:ss.zzz format

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  if (!from) {
    return NextResponse.json({ error: "From date is required (format: YYYY-MM-DDTHH:mm:ss.zzz)" }, { status: 400 });
  }

  try {
    const cloudUrl = `https://${systemId}.relay.vmsproxy.com/api/auditLog?from=${encodeURIComponent(from)}`;

    // Get the system-specific token from cookie
    const systemToken = request.cookies.get(`nx-cloud-${systemId}`)?.value;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Add bearer token if available
    if (systemToken) {
      headers["Authorization"] = `Bearer ${systemToken}`;
    }

    const response = await fetch(cloudUrl, {
      method: "GET",
      headers,
    });

    // If auth is required
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          error: "Authentication required",
          systemId,
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch audit log`,
          status: response.status,
        },
        { status: response.status }
      );
    }

    const auditLog = await response.json();
    return NextResponse.json(auditLog);
  } catch (error) {
    console.error(`[Audit Log API] Error:`, error);
    return NextResponse.json({ error: "Connection error" }, { status: 500 });
  }
}
