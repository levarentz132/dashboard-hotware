import { NextRequest, NextResponse } from "next/server";
import { getDynamicConfig, isSecureContext } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemId, username, password } = body;

    if (!systemId || !username || !password) {
      return NextResponse.json({ error: "System ID, username, and password are required" }, { status: 400 });
    }

    const dynamicConfig = getDynamicConfig(request);

    // 1. Check if this is a secure identity login (Identity Swap)
    const cloudUsername = dynamicConfig?.NEXT_PUBLIC_NX_CLOUD_USERNAME || process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME;
    const cloudHash = dynamicConfig?.NEXT_PUBLIC_NX_CLOUD_PASSWORD || process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD;
    const vmsUsername = dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME;

    // If username matches cloud identity, verify against cloud hash
    if (username === cloudUsername && cloudHash) {
      const bcrypt = await import("bcryptjs");
      const isMatch = await bcrypt.compare(password, cloudHash);

      if (isMatch) {
        console.log(`[Cloud Login] Identity verified for ${username}. Swapping to VMS context...`);
        // Swap identity to VMS local admin for the relay login step below
        const vmsLoginResponse = await performRelayLogin(systemId, vmsUsername, password);
        return vmsLoginResponse;
      }
    }

    // 2. Standard login to cloud relay system (fallback)
    return performRelayLogin(systemId, username, password);
  } catch (error) {
    console.error("[Cloud Login] Error:", error);
    return NextResponse.json(
      { error: "Login failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Internal helper to handle VMS Relay login and cookie management
 */
async function performRelayLogin(systemId: string, username: string, password: string): Promise<NextResponse> {
  const loginUrl = `https://${systemId}.relay.vmsproxy.com/rest/v3/login/sessions`;

  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      username,
      password,
      setCookie: true,
    }),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    console.error(`[Cloud Login] Failed for system ${systemId}:`, errorText);
    return NextResponse.json({ error: "Invalid credentials or login failed", details: errorText }, { status: loginResponse.status });
  }

  const loginData = await loginResponse.json();
  const setCookieHeaders = loginResponse.headers.getSetCookie?.() || [];

  const response = NextResponse.json({
    success: true,
    token: loginData.token,
    username: loginData.username,
    systemId,
  });

  setCookieHeaders.forEach((cookie) => {
    response.headers.append("Set-Cookie", cookie);
  });

  response.cookies.set(`nx-cloud-${systemId}`, loginData.token, {
    path: "/",
    maxAge: 60 * 60 * 24 * 3, // 3 days
    httpOnly: false,
    secure: isSecureContext(),
    sameSite: "lax",
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get("systemId");

    if (!systemId) {
      return NextResponse.json({ error: "System ID is required" }, { status: 400 });
    }

    // Clear the system-specific cookie
    const response = NextResponse.json({ success: true, systemId });
    response.cookies.delete(`nx-cloud-${systemId}`);

    return response;
  } catch (error) {
    console.error("[Cloud Logout] Error:", error);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
