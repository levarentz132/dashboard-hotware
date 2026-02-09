import { NextRequest, NextResponse } from "next/server";
import { getDynamicConfig } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemId, username, password } = body;

    if (!systemId || !username || !password) {
      return NextResponse.json({ error: "System ID, username, and password are required" }, { status: 400 });
    }

    const dynamicConfig = getDynamicConfig(request);

    // 1. Check if this is the hashed admin account
    const isAdminUser = username === (dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME);
    const adminHash = dynamicConfig?.NX_ADMIN_HASH || process.env.NX_ADMIN_HASH;
    const cloudToken = dynamicConfig?.NX_CLOUD_TOKEN || process.env.NX_CLOUD_TOKEN;

    if (isAdminUser && adminHash && cloudToken) {
      const bcrypt = await import("bcryptjs");
      const isMatch = await bcrypt.compare(password, adminHash);

      if (isMatch) {
        console.log(`[Cloud Login] Admin verified via secure hash for system ${systemId}`);
        const response = NextResponse.json({
          success: true,
          token: cloudToken,
          username: username,
          systemId,
        });

        response.cookies.set(`nx-cloud-${systemId}`, cloudToken, {
          path: "/",
          maxAge: 60 * 60 * 24 * 30, // 30 days for token
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
        });

        return response;
      }
    }

    // 2. Standard login to cloud relay system (fallback)
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
      return NextResponse.json(
        { error: "Invalid credentials or login failed", details: errorText },
        { status: loginResponse.status }
      );
    }

    const loginData = await loginResponse.json();

    // Extract cookies from the login response
    const setCookieHeaders = loginResponse.headers.getSetCookie?.() || [];

    // Create response with login data
    const response = NextResponse.json({
      success: true,
      token: loginData.token,
      username: loginData.username,
      systemId,
    });

    // Forward any cookies from the cloud system
    setCookieHeaders.forEach((cookie) => {
      response.headers.append("Set-Cookie", cookie);
    });

    // Also store the token in a system-specific cookie
    response.cookies.set(`nx-cloud-${systemId}`, loginData.token, {
      path: "/",
      maxAge: 60 * 60 * 24 * 3, // 3 days
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("[Cloud Login] Error:", error);
    return NextResponse.json(
      { error: "Login failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
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
