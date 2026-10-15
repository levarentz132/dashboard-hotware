import fs from "fs";
import path from "path";

/**
 * Shared utility to resolve the absolute path to the FFmpeg executable.
 * Prioritizes bundled binaries in packaged Electron resources, standalone server folders,
 * and workspace paths, using fs.existsSync() validation.
 */
export function getFfmpegPath(): string {
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "ffmpeg.exe" : "ffmpeg";
  const searchedPaths: string[] = [];

  const addCandidate = (candidatePath: string | undefined | null): string | null => {
    if (!candidatePath) return null;
    const resolved = path.resolve(candidatePath);
    if (!searchedPaths.includes(resolved)) {
      searchedPaths.push(resolved);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    return null;
  };

  // 1. Explicit environment variable override
  if (process.env.FFMPEG_PATH) {
    const found = addCandidate(process.env.FFMPEG_PATH);
    if (found) return found;
  }

  // 2. Electron process.resourcesPath or env PROCESS_RESOURCES_PATH (highest priority for packaged Electron)
  // @ts-ignore
  const resourcesDir = process.env.PROCESS_RESOURCES_PATH || (typeof process !== "undefined" && (process as any).resourcesPath);
  if (resourcesDir) {
    const found1 = addCandidate(path.join(resourcesDir, "node-bin", binaryName));
    if (found1) return found1;

    const found2 = addCandidate(path.join(resourcesDir, "app.asar.unpacked", "node-bin", binaryName));
    if (found2) return found2;

    const found3 = addCandidate(path.join(resourcesDir, "app.asar.unpacked", ".next", "standalone", "node-bin", binaryName));
    if (found3) return found3;
  }

  // 3. Executable location fallback (Electron process.execPath)
  if (process.execPath) {
    const execDir = path.dirname(process.execPath);
    const foundExec1 = addCandidate(path.join(execDir, "resources", "node-bin", binaryName));
    if (foundExec1) return foundExec1;

    const foundExec2 = addCandidate(path.join(execDir, "resources", "app.asar.unpacked", "node-bin", binaryName));
    if (foundExec2) return foundExec2;

    const foundExec3 = addCandidate(path.join(execDir, "resources", "app.asar.unpacked", ".next", "standalone", "node-bin", binaryName));
    if (foundExec3) return foundExec3;

    const foundExec4 = addCandidate(path.join(execDir, "node-bin", binaryName));
    if (foundExec4) return foundExec4;
  }

  // 4. Traverse parent directories starting from process.cwd() and __dirname
  const baseDirs = [process.cwd(), __dirname];
  for (const baseDir of baseDirs) {
    let curr = path.resolve(baseDir);
    for (let i = 0; i < 8; i++) {
      const candidates = [
        path.join(curr, "node-bin", binaryName),
        path.join(curr, "resources", "node-bin", binaryName),
        path.join(curr, ".next", "standalone", "node-bin", binaryName),
        path.join(curr, "app.asar.unpacked", "node-bin", binaryName),
        path.join(curr, "app.asar.unpacked", ".next", "standalone", "node-bin", binaryName),
      ];
      for (const cand of candidates) {
        const found = addCandidate(cand);
        if (found) return found;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  }

  // 5. Fallback to system PATH executable "ffmpeg" for non-Electron deployments (dev and prod)
  // or Electron running in development mode.
  const isElectron = process.env.IS_ELECTRON === "true";
  const isPackagedElectron = isElectron && process.env.NODE_ENV === "production" && Boolean(resourcesDir);

  if (!isPackagedElectron) {
    return "ffmpeg";
  }

  // 6. In packaged Electron production, throw clear diagnostic error listing searched paths
  throw new Error(
    `[FFmpeg Error] Executable '${binaryName}' not found in packaged app resources or standalone directory.\n` +
    `Searched locations:\n${searchedPaths.map((p) => `  - ${p}`).join("\n")}`
  );
}
