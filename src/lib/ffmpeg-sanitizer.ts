import path from "path";

/**
 * Validates and sanitizes a VMS Device ID (Camera ID).
 * Device IDs are typically hex-based GUIDs, possibly wrapped in curly braces.
 * Example: {a6e2e50c-7bdf-c5e3-82b5-e6a6b8c9d2f3}
 */
export function sanitizeDeviceId(id: string | null | undefined): string {
  if (!id) throw new Error("Device ID is required");
  // Keep only alphanumeric characters, hyphens, and curly braces
  const clean = id.replace(/[^a-fA-F0-9-{}]/g, "").trim();
  if (clean.length === 0 || clean.length > 50) {
    throw new Error("Invalid Device ID format or length");
  }
  return clean;
}

/**
 * Validates and sanitizes a VMS System ID.
 * System IDs are usually alphanumeric strings or UUIDs.
 */
export function sanitizeSystemId(id: string | null | undefined): string {
  if (!id) throw new Error("System ID is required");
  // Keep only alphanumeric characters, hyphens, underscores, dots, and colons
  const clean = id.replace(/[^a-zA-Z0-9-_.:]/g, "").trim();
  if (clean.length === 0 || clean.length > 100) {
    throw new Error("Invalid System ID format or length");
  }
  return clean;
}

/**
 * Parses and sanitizes a timestamp parameter (integer/ms).
 */
export function sanitizeTimestamp(ts: string | number | null | undefined, paramName = "Timestamp"): number {
  if (ts === null || ts === undefined || ts === "") {
    throw new Error(`${paramName} is required`);
  }
  const parsed = typeof ts === "number" ? Math.floor(ts) : parseInt(String(ts).trim(), 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric format for ${paramName}`);
  }
  return parsed;
}

/**
 * Sanitizes camera names to be completely safe for filenames and CLI arguments.
 * Replaces any character that is not alphanumeric, space, dot, hyphen, or underscore.
 * Normalizes multiple spaces/underscores.
 */
export function sanitizeCameraName(name: string | null | undefined): string {
  if (!name) return "Camera";
  
  // Replace illegal characters for both CLI args and files with an underscore
  // Allows letters, digits, spaces, dots, hyphens, and underscores
  let clean = name.replace(/[^\w\s.-]/g, "_").trim();
  
  // Normalize consecutive spaces or underscores to keep filenames beautiful
  clean = clean.replace(/\s+/g, " ").replace(/_+/g, "_");
  
  if (clean.length === 0) {
    return "Camera";
  }
  
  // Limit length to avoid filesystem issues
  return clean.substring(0, 100);
}

/**
 * Validates file path and prevents path traversal attacks.
 * Verifies that the resolved path is strictly within the target base directory.
 */
export function validateAndGetSavePath(
  baseDir: string,
  dateFolder: string,
  fileName: string
): string {
  if (!baseDir || !dateFolder || !fileName) {
    throw new Error("Base directory, date folder, and file name are required");
  }

  // Sanitize the date folder (e.g. YYYY-MM-DD)
  const cleanDateFolder = dateFolder.replace(/[^0-9-]/g, "");
  if (cleanDateFolder.length === 0) {
    throw new Error("Invalid date folder format");
  }

  // Sanitize file name (basename only, no subpaths allowed)
  const cleanFileName = path.basename(fileName).replace(/[<>:"/\\|?*]/g, "_");
  if (cleanFileName.length === 0) {
    throw new Error("Invalid file name");
  }

  // Resolve absolute paths
  const absoluteBaseDir = path.resolve(baseDir);
  const targetPath = path.resolve(absoluteBaseDir, cleanDateFolder, cleanFileName);

  // Check path traversal: The target path MUST start with the absolute base directory
  if (!targetPath.startsWith(absoluteBaseDir + path.sep) && targetPath !== absoluteBaseDir) {
    throw new Error("Path traversal detected: Target path is outside base directory");
  }

  return targetPath;
}
