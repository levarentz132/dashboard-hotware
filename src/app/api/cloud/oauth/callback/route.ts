import { NextRequest, NextResponse } from "next/server";
import { exchangeNxAuthorizationCode, getNxSystems } from "@/lib/nx-cloud-service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("[OAuth Callback] Received OAuth error:", error);
    return NextResponse.redirect(new URL(`/cloud/dashboard?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    const tokens = await exchangeNxAuthorizationCode(code);
    const systems = await getNxSystems(tokens.access_token);

    const firstSystemId = systems.length > 0 ? systems[0].id : "";

    const response = NextResponse.redirect(new URL("/cloud/dashboard", request.url));

    // Store tokens in cookies
    const cookiePayload = JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      email: tokens.user_email,
      ownerSystemId: firstSystemId,
    });

    response.cookies.set("nx_cloud_session", cookiePayload, {
      httpOnly: false, // Accessible to client hooks if needed
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60, // 1 year
      path: "/",
    });

    if (firstSystemId) {
      response.cookies.set("nx_system_id", firstSystemId, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (err: any) {
    console.error("[OAuth Callback Error]:", err);
    return NextResponse.redirect(
      new URL(`/cloud/dashboard?error=${encodeURIComponent(err.message || "OAuth exchange failed")}`, request.url)
    );
  }
}
