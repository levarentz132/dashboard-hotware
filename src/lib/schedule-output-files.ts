/**
 * Resolve scheduled recording output paths and detect saved files on disk.
 */

import fs from "fs";
import path from "path";
import { readAppSettings } from "@/lib/server-settings";

export interface ScheduleOutputRec {
  cameraId: string;
  cameraName?: string;
  date?: string | Date;
  startTime: string;
  startMs?: number;
}

function safeCameraName(rec: ScheduleOutputRec): string {
  return (rec.cameraName || rec.cameraId?.substring(0, 8) || "Camera")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function cameraIdHash(rec: ScheduleOutputRec): string {
  return rec.cameraId.replace(/[{}]/g, "").slice(-4).toLowerCase();
}

function resolveStartMs(rec: ScheduleOutputRec): number {
  if (rec.startMs && rec.startMs > 0) return rec.startMs;
  if (!rec.date) return Date.now();
  const [sh, sm, ss] = rec.startTime.split(":").map(Number);
  const d = new Date(rec.date);
  d.setHours(sh || 0, sm || 0, ss || 0, 0);
  return d.getTime();
}

function datePartsFromMs(ms: number) {
  const recDate = new Date(ms);
  return {
    YYYY: recDate.getFullYear().toString(),
    MM: (recDate.getMonth() + 1).toString().padStart(2, "0"),
    DD: recDate.getDate().toString().padStart(2, "0"),
    HH: recDate.getHours().toString().padStart(2, "0"),
    mm: recDate.getMinutes().toString().padStart(2, "0"),
    dateFolder: "",
  };
}

function withDateFolder(parts: ReturnType<typeof datePartsFromMs>) {
  return {
    ...parts,
    dateFolder: `${parts.YYYY}-${parts.MM}-${parts.DD}`,
  };
}

/** Parse HHmm from output filenames like CameraName_143000_abcd.png */
function scheduledMinutesFromFilename(fileName: string): number | null {
  const match = fileName.match(/_(\d{2})(\d{2})00_/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isSameScheduledSlot(
  fileName: string,
  scheduledHour: number,
  scheduledMinute: number,
  toleranceMinutes = 2,
): boolean {
  const fileMinutes = scheduledMinutesFromFilename(fileName);
  if (fileMinutes === null) return false;
  const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
  return Math.abs(fileMinutes - scheduledMinutes) <= toleranceMinutes;
}

function getScreenshotsBaseDir(): string {
  let baseDir = path.join(process.cwd(), "data", "recorded_screenshots");
  try {
    const settings = readAppSettings();
    if (settings.storagePath) baseDir = String(settings.storagePath);
  } catch {
    /* use default */
  }
  return baseDir;
}

function getVideosBaseDir(): string {
  let baseDir = path.join(process.cwd(), "data", "recorded_videos");
  try {
    const settings = readAppSettings();
    if (settings.videoStoragePath) {
      baseDir = String(settings.videoStoragePath);
    } else if (settings.storagePath) {
      baseDir = String(settings.storagePath);
    }
  } catch {
    /* use default */
  }
  return baseDir;
}

const MIN_VALID_VIDEO_BYTES = 1024;
const MIN_VALID_SCREENSHOT_BYTES = 100;

function fileExistsWithSize(filePath: string, minBytes = 1): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size >= minBytes;
  } catch {
    return false;
  }
}

/** True when a saved output file exists and is large enough to be real media. */
export function isValidOutputFile(
  filePath: string,
  kind: "video" | "screenshot" = "video",
): boolean {
  const minBytes =
    kind === "screenshot" ? MIN_VALID_SCREENSHOT_BYTES : MIN_VALID_VIDEO_BYTES;
  return fileExistsWithSize(filePath, minBytes);
}

/** Candidate PNG paths for a scheduled screenshot (VMS offset + local schedule time). */
export function getScreenshotOutputCandidates(
  rec: ScheduleOutputRec,
  timeOffsetMs: number = 0,
): string[] {
  const name = safeCameraName(rec);
  const idHash = cameraIdHash(rec);
  const baseDir = getScreenshotsBaseDir();
  const startMs = resolveStartMs(rec);
  const offsets = new Set<number>([timeOffsetMs, 0, -timeOffsetMs]);

  const paths: string[] = [];

  for (const off of offsets) {
    const parts = withDateFolder(datePartsFromMs(startMs + off));
    const fileName = `${name}_${parts.HH}${parts.mm}00_${idHash}.png`;
    paths.push(path.join(baseDir, parts.dateFolder, fileName));
  }

  // Fallback: same calendar day, same camera, but only the scheduled time slot (±2 min)
  const [sh, sm] = rec.startTime.split(":").map(Number);
  const dayParts = withDateFolder(datePartsFromMs(startMs));
  const dayDir = path.join(baseDir, dayParts.dateFolder);
  try {
    if (fs.existsSync(dayDir)) {
      const prefix = `${name}_`;
      const suffix = `_${idHash}.png`;
      for (const file of fs.readdirSync(dayDir)) {
        if (
          file.startsWith(prefix) &&
          file.endsWith(suffix) &&
          isSameScheduledSlot(file, sh || 0, sm || 0)
        ) {
          paths.push(path.join(dayDir, file));
        }
      }
    }
  } catch {
    /* ignore */
  }

  return [...new Set(paths)];
}

/** Candidate MP4 paths for a scheduled video auto-save. */
export function getVideoOutputCandidates(
  rec: ScheduleOutputRec,
  timeOffsetMs: number = 0,
): string[] {
  const name = safeCameraName(rec);
  const idHash = cameraIdHash(rec);
  const baseDir = getVideosBaseDir();
  const startMs = resolveStartMs(rec);
  const offsets = new Set<number>([timeOffsetMs, 0, -timeOffsetMs]);

  const paths: string[] = [];

  for (const off of offsets) {
    const parts = withDateFolder(datePartsFromMs(startMs + off));
    const fileName = `${name}_${parts.HH}${parts.mm}00_${idHash}.mp4`;
    paths.push(path.join(baseDir, parts.dateFolder, fileName));
  }

  const [sh, sm] = rec.startTime.split(":").map(Number);
  const dayParts = withDateFolder(datePartsFromMs(startMs));
  const dayDir = path.join(baseDir, dayParts.dateFolder);
  try {
    if (fs.existsSync(dayDir)) {
      const prefix = `${name}_`;
      const suffix = `_${idHash}.mp4`;
      for (const file of fs.readdirSync(dayDir)) {
        if (
          file.startsWith(prefix) &&
          file.endsWith(suffix) &&
          isSameScheduledSlot(file, sh || 0, sm || 0)
        ) {
          paths.push(path.join(dayDir, file));
        }
      }
    }
  } catch {
    /* ignore */
  }

  return [...new Set(paths)];
}

export function doesScreenshotFileExist(
  rec: ScheduleOutputRec,
  timeOffsetMs: number = 0,
): boolean {
  return getScreenshotOutputCandidates(rec, timeOffsetMs).some((p) =>
    fileExistsWithSize(p, MIN_VALID_SCREENSHOT_BYTES),
  );
}

export function doesVideoFileExist(
  rec: ScheduleOutputRec,
  timeOffsetMs: number = 0,
): boolean {
  return getVideoOutputCandidates(rec, timeOffsetMs).some((p) =>
    fileExistsWithSize(p, MIN_VALID_VIDEO_BYTES),
  );
}

export function findScreenshotFile(
  rec: ScheduleOutputRec,
  timeOffsetMs: number = 0,
): string | null {
  for (const p of getScreenshotOutputCandidates(rec, timeOffsetMs)) {
    if (fileExistsWithSize(p)) return p;
  }
  return null;
}

export function findVideoFile(
  rec: ScheduleOutputRec,
  timeOffsetMs: number = 0,
): string | null {
  for (const p of getVideoOutputCandidates(rec, timeOffsetMs)) {
    if (fileExistsWithSize(p)) return p;
  }
  return null;
}
