import { NextRequest, NextResponse } from "next/server";

// Server-safe: read cloud credentials from request header or env fallback
function getServerCloudAuth(request: NextRequest): { username: string; password: string } {
  // Check for credentials passed from client via header
  const authHeader = request.headers.get("x-cloud-auth");
  if (authHeader) {
    try {
      const decoded = Buffer.from(authHeader, "base64").toString("utf-8");
      const [username, ...rest] = decoded.split(":");
      const password = rest.join(":");
      if (username && password) return { username, password };
    } catch {}
  }
  // Fallback to env vars
  return {
    username: process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME || "",
    password: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const { username, password } = getServerCloudAuth(request);
    if (!username || !password) {
      return NextResponse.json({ error: "Cloud credentials not configured", systems: [] }, { status: 200 });
    }

    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await fetch("https://meta.nxvms.com/cdb/systems", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Cloud API error: ${response.status}`, details: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API Cloud Systems] Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
