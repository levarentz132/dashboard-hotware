import { NextResponse } from "next/server";
import { getDynamicConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = getDynamicConfig();
    
    return NextResponse.json({
      success: true,
      config: {
        NEXT_PUBLIC_NX_SYSTEM_ID: config?.NEXT_PUBLIC_NX_SYSTEM_ID || "",
        NEXT_PUBLIC_NX_SERVER_HOST: config?.NEXT_PUBLIC_NX_SERVER_HOST || "localhost",
        NEXT_PUBLIC_NX_SERVER_PORT: config?.NEXT_PUBLIC_NX_SERVER_PORT || "7001",
        NEXT_PUBLIC_NX_CLOUD_USERNAME: config?.NEXT_PUBLIC_NX_CLOUD_USERNAME || "",
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch config" }, { status: 500 });
  }
}
