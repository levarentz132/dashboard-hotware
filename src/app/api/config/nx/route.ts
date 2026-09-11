import { NextResponse } from "next/server";
import { getDynamicConfig, getConfigFilePath, invalidateConfigCache } from "@/lib/config";
import fs from "fs";
import path from "path";

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
        NEXT_PUBLIC_NX_SYSTEM_ID: config?.NEXT_PUBLIC_NX_SYSTEM_ID || "",
        NEXT_PUBLIC_NX_USERNAME: config?.NEXT_PUBLIC_NX_USERNAME || "",
        NEXT_PUBLIC_NX_PASSWORD: config?.NEXT_PUBLIC_NX_PASSWORD ? "******" : "",
        NEXT_PUBLIC_LICENSE_USERNAME: config?.NEXT_PUBLIC_LICENSE_USERNAME || "",
        NEXT_PUBLIC_LICENSE_PASSWORD: config?.NEXT_PUBLIC_LICENSE_PASSWORD ? "******" : "",
        NEXT_PUBLIC_NX_CLOUD_USERNAME: config?.NEXT_PUBLIC_NX_CLOUD_USERNAME || "",
        has_vms_credentials: Boolean(config?.NEXT_PUBLIC_NX_PASSWORD || config?.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED),
        has_cloud_token: Boolean(config?.NX_CLOUD_TOKEN || (config?.NEXT_PUBLIC_NX_CLOUD_USERNAME && config?.NEXT_PUBLIC_NX_CLOUD_PASSWORD)),
      }
    };
    
    console.log("[API /config/nx] Returning:", {
      username: response.config.NEXT_PUBLIC_NX_USERNAME || "empty",
      password: response.config.NEXT_PUBLIC_NX_PASSWORD ? "***" : "empty",
      licenseUsername: response.config.NEXT_PUBLIC_LICENSE_USERNAME || "empty"
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[API /config/nx] Error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Failed to fetch config", error: error?.message || "Failed to fetch config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const configPath = getConfigFilePath(true);

    if (!configPath) {
      throw new Error("Could not determine config path");
    }

    // Ensure target directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing config if present
    let content = "";
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, "utf8");
    }

    // Map provided updates
    const updates: Record<string, string> = {};
    if (data.NEXT_PUBLIC_NX_SYSTEM_ID !== undefined) updates.NEXT_PUBLIC_NX_SYSTEM_ID = data.NEXT_PUBLIC_NX_SYSTEM_ID;
    if (data.NEXT_PUBLIC_NX_SERVER_HOST !== undefined) updates.NEXT_PUBLIC_NX_SERVER_HOST = data.NEXT_PUBLIC_NX_SERVER_HOST;
    if (data.NEXT_PUBLIC_NX_SERVER_PORT !== undefined) updates.NEXT_PUBLIC_NX_SERVER_PORT = data.NEXT_PUBLIC_NX_SERVER_PORT;
    if (data.NEXT_PUBLIC_NX_USERNAME !== undefined) updates.NEXT_PUBLIC_NX_USERNAME = data.NEXT_PUBLIC_NX_USERNAME;
    if (data.NEXT_PUBLIC_NX_PASSWORD !== undefined && data.NEXT_PUBLIC_NX_PASSWORD !== "******") {
      updates.NEXT_PUBLIC_NX_PASSWORD = data.NEXT_PUBLIC_NX_PASSWORD;
    }
    if (data.NEXT_PUBLIC_NX_CLOUD_USERNAME !== undefined) updates.NEXT_PUBLIC_NX_CLOUD_USERNAME = data.NEXT_PUBLIC_NX_CLOUD_USERNAME;
    if (data.NX_CLOUD_TOKEN !== undefined) updates.NX_CLOUD_TOKEN = data.NX_CLOUD_TOKEN;
    if (data.NEXT_PUBLIC_LICENSE_USERNAME !== undefined) updates.NEXT_PUBLIC_LICENSE_USERNAME = data.NEXT_PUBLIC_LICENSE_USERNAME;
    if (data.NEXT_PUBLIC_LICENSE_PASSWORD !== undefined && data.NEXT_PUBLIC_LICENSE_PASSWORD !== "******") {
      updates.NEXT_PUBLIC_LICENSE_PASSWORD = data.NEXT_PUBLIC_LICENSE_PASSWORD;
    }

    // Update existing lines while preserving structure/comments
    const lines = content.split(/\r?\n/);
    const updatedKeys = new Set<string>();

    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return line;

      const key = line.slice(0, eqIdx).trim();
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
      return line;
    });

    // Append any keys that weren't present in the file
    for (const [key, value] of Object.entries(updates)) {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${value}`);
      }
    }

    const newContent = newLines.join("\n");
    fs.writeFileSync(configPath, newContent, "utf8");

    // Also update process.env in memory
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }

    // Invalidate cached config in config.ts
    invalidateConfigCache();

    console.log(`[API /config/nx] Successfully updated config at: ${configPath}`);

    return NextResponse.json({ success: true, message: "Server configuration updated" });
  } catch (error: any) {
    console.error("[API /config/nx POST] Error:", error);
    return NextResponse.json({
      success: false,
      message: error?.message || "Failed to save configuration",
      error: error?.message || "Failed to save configuration"
    }, { status: 500 });
  }
}

