import fs from "fs";
import path from "path";

export interface AppSettings {
  storagePath?: string;
  videoStoragePath?: string;
  nxServerHost?: string;
  nxServerPort?: string;
  ffmpegConcurrency?: number;
  [key: string]: unknown;
}

function getSettingsBaseDir(): string {
  const extConfigPath = process.env.EXT_CONFIG_PATH;
  if (extConfigPath) {
    return path.dirname(extConfigPath);
  }
  return path.join(process.cwd(), "data");
}

export function getSettingsFilePath(): string {
  return path.join(getSettingsBaseDir(), "settings.json");
}

export function readAppSettings(): AppSettings {
  const settingsFile = getSettingsFilePath();
  try {
    if (!fs.existsSync(settingsFile)) return {};
    const raw = fs.readFileSync(settingsFile, "utf-8").replace(/^\uFEFF/, "");
    if (!raw.trim()) return {};
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

export function writeAppSettings(settings: AppSettings): void {
  const settingsFile = getSettingsFilePath();
  const dir = path.dirname(settingsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf-8");
}

