import { NextResponse } from "next/server";
import { getDynamicConfig } from "@/lib/config";

export async function GET(request: Request) {
  try {
    const config = getDynamicConfig(request);
    
    console.log("[API /config/nx] Config retrieved:", {
      username: config?.NEXT_PUBLIC_NX_USERNAME || "empty",
      password: config?.NEXT_PUBLIC_NX_PASSWORD ? "***" : "empty",
      host: config?.NEXT_PUBLIC_NX_SERVER_HOST || "empty"
    });
    
    // Check cookies for local overrides
    const cookieHeader = request.headers.get("cookie") || "";
    const getC = (name: string) => {
        const match = cookieHeader.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    };

    const cookieIp = getC("nx_location_ip");
    const nxLocationIp = cookieIp || (config?.NEXT_PUBLIC_NX_SERVER_HOST || "localhost");
    
    const cookiePort = getC("nx_location_port");
    const nxLocationPort = cookiePort || (config?.NEXT_PUBLIC_NX_SERVER_PORT || "7001");

    const response = {
      success: true,
      config: {
        NEXT_PUBLIC_NX_SERVER_HOST: nxLocationIp,
        NEXT_PUBLIC_NX_SERVER_PORT: nxLocationPort,
        NEXT_PUBLIC_NX_USERNAME: config?.NEXT_PUBLIC_NX_USERNAME || "",
        NEXT_PUBLIC_NX_PASSWORD: config?.NEXT_PUBLIC_NX_PASSWORD || ""
      }
    };
    
    console.log("[API /config/nx] Returning:", {
      username: response.config.NEXT_PUBLIC_NX_USERNAME || "empty",
      password: response.config.NEXT_PUBLIC_NX_PASSWORD ? "***" : "empty"
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API /config/nx] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const fs = require('fs');
    const path = require('path');
    
    let configPath = process.env.EXT_CONFIG_PATH;
    if (!configPath) {
        const home = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
        configPath = path.join(home, 'hotware-dashboard', '.env.local');
    }

    if (!configPath) throw new Error("Could not determine config path");

    // Read existing config
    let content = "";
    if (fs.existsSync(configPath)) {
        content = fs.readFileSync(configPath, 'utf8');
    }

    const config: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const [k, ...v] = line.trim().split('=');
        if (k && v.length > 0) config[k.trim()] = v.join('=').trim();
    });

    // Merge new data
    if (data.NEXT_PUBLIC_NX_SYSTEM_ID) config.NEXT_PUBLIC_NX_SYSTEM_ID = data.NEXT_PUBLIC_NX_SYSTEM_ID;
    if (data.NEXT_PUBLIC_NX_SERVER_HOST) config.NEXT_PUBLIC_NX_SERVER_HOST = data.NEXT_PUBLIC_NX_SERVER_HOST;
    if (data.NEXT_PUBLIC_NX_SERVER_PORT) config.NEXT_PUBLIC_NX_SERVER_PORT = data.NEXT_PUBLIC_NX_SERVER_PORT;
    if (data.NEXT_PUBLIC_NX_USERNAME) config.NEXT_PUBLIC_NX_USERNAME = data.NEXT_PUBLIC_NX_USERNAME;
    if (data.NEXT_PUBLIC_NX_PASSWORD) config.NEXT_PUBLIC_NX_PASSWORD = data.NEXT_PUBLIC_NX_PASSWORD;
    if (data.NEXT_PUBLIC_NX_CLOUD_USERNAME) config.NEXT_PUBLIC_NX_CLOUD_USERNAME = data.NEXT_PUBLIC_NX_CLOUD_USERNAME;
    if (data.NX_CLOUD_TOKEN) config.NX_CLOUD_TOKEN = data.NX_CLOUD_TOKEN;

    const newContent = Object.entries(config)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    fs.writeFileSync(configPath, newContent);

    return NextResponse.json({ success: true, message: "Server configuration updated" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
