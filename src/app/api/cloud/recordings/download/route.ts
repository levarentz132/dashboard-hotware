import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";
import { calculateNextOccurrence } from "@/lib/schedule-utils";
import os from "os";

import { promisify } from "util";
import { spawn } from "child_process";
import { Readable } from "stream";
import { logRecordingEvent } from "@/lib/recording-logger";
import { startFFmpegWorker } from "@/lib/ffmpeg-worker";
import { enqueueJob } from "@/lib/ffmpeg-queue";
import {
  sanitizeDeviceId,
  sanitizeSystemId,
  sanitizeTimestamp,
  sanitizeCameraName,
  validateAndGetSavePath,
} from "@/lib/ffmpeg-sanitizer";
import { readAppSettings } from "@/lib/server-settings";
import { isValidOutputFile } from "@/lib/schedule-output-files";
import { getFfmpegPath } from "@/lib/ffmpeg-path";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// VMS uses self-signed certificates — disable strict TLS validation for server-side fetches
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Bootstrap the background queue worker loop when this route is loaded
startFFmpegWorker();

// ── FFmpeg Worker Isolation & Queueing (Manual Stream Throttling Only) ──────
declare global {
  var _ffmpegActiveCount: number | undefined;
  var _ffmpegQueue: Array<() => void> | undefined;
}

if (global._ffmpegActiveCount === undefined) global._ffmpegActiveCount = 0;
if (global._ffmpegQueue === undefined) global._ffmpegQueue = [];

const MAX_CONCURRENT_FFMPEG = 15; // concurrency for manual/preview streams

async function acquireFfmpegSlot(): Promise<void> {
  if ((global._ffmpegActiveCount || 0) < MAX_CONCURRENT_FFMPEG) {
    global._ffmpegActiveCount = (global._ffmpegActiveCount || 0) + 1;
    return;
  }
  return new Promise((resolve) => {
    global._ffmpegQueue?.push(resolve);
  });
}

function releaseFfmpegSlot(): void {
  global._ffmpegActiveCount = Math.max(0, (global._ffmpegActiveCount || 0) - 1);
  if (global._ffmpegQueue && global._ffmpegQueue.length > 0) {
    const next = global._ffmpegQueue.shift();
    if (next) {
      global._ffmpegActiveCount++;
      next();
    }
  }
}

interface VideoCodecDetection {
  detected: boolean;
  codec?: string;
  isH264: boolean;
  isHevc: boolean;
}

function parseVideoCodecFromStderr(stderr: string): VideoCodecDetection {
  // Typical FFmpeg stream detection lines in stderr:
  // "Stream #0:0[0x100]: Video: h264 (High) (avc1 / ...)"
  // "Stream #0:0: Video: hevc (Main) (hev1 / ...)"
  const match = stderr.match(/Stream\s+#\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?:\s+Video:\s+([a-zA-Z0-9_-]+)/i);
  if (!match) {
    return { detected: false, isH264: false, isHevc: false };
  }
  const codec = match[1].toLowerCase();
  const isH264 = codec === "h264" || codec === "avc" || codec === "avc1";
  const isHevc = codec === "hevc" || codec === "h265";
  return { detected: true, codec, isH264, isHevc };
}

async function updateTaskStatus(taskId: string, success: boolean, timeOffsetMs = 0): Promise<void> {
  try {
    const { readScheduledRecordings, writeScheduledRecordings } = await import(
      "@/lib/scheduled-recordings-store"
    );
    const data = await readScheduledRecordings();
    const taskIndex = data.schedules?.findIndex((s: any) => s.id === taskId);
    if (taskIndex === -1) return;

    const task = data.schedules[taskIndex] as any;
    const isNonRecurring =
      !task.recurrence || task.recurrence === "none" || task.recurrence === "once";

    if (isNonRecurring) {
      data.schedules.splice(taskIndex, 1);
      console.log(`[recordings/download] Task ${taskId} finished and REMOVED (non-recurring)`);
    } else {
      const startParts = String(task.startTime || "00:00").split(":").map(Number);
      const sh = startParts[0],
        sm = startParts[1],
        ss = startParts[2] || 0;
      const duration =
        task.endMs && task.startMs ? Number(task.endMs) - Number(task.startMs) : 0;
      const nextDate = calculateNextOccurrence(task as any, sh, sm, ss);

      task.status = "pending";
      task.record = false;
      task.date = nextDate.toISOString();
      task.startMs = nextDate.getTime() - timeOffsetMs;
      task.endMs = task.startMs + duration;

      console.log(
        `[recordings/download] Task ${taskId} is recurring (recurrence=${task.recurrence}). Rolled forward to ${task.date}`,
      );
    }

    await writeScheduledRecordings(data);
  } catch (err) {
    console.error(`[recordings/download] Failed to update task ${taskId} status:`, err);
  }
}

export async function GET(request: NextRequest) {
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const { searchParams } = new URL(request.url);
    
    // ── Input Sanitization (Strict Security Filter) ─────────────────────────
    const systemId = sanitizeSystemId(searchParams.get("systemId"));
    const systemName = searchParams.get("systemName") || undefined;
    const deviceId = sanitizeDeviceId(searchParams.get("deviceId"));
    const startTime = sanitizeTimestamp(searchParams.get("startTime"), "startTime");
    const endTimeParam = searchParams.get("endTime");
    const endTime = endTimeParam ? sanitizeTimestamp(endTimeParam, "endTime") : null;
    
    const stream = searchParams.get("stream");
    const preview = searchParams.get("preview"); // If 'true', serve inline for browser playback
    const autoSave = searchParams.get("autoSave") === "true"; 
    const taskId = searchParams.get("taskId") ? sanitizeSystemId(searchParams.get("taskId")) : null;
    const isSnapshotParam = searchParams.get("isSnapshot") === "true";

    if (autoSave) {
      console.log(`[recordings/download] INTERNAL AUTO-SAVE request: deviceId=${deviceId}, startTime=${startTime}, taskId=${taskId}`);
    } else {
      console.log(`[recordings/download] GET request received: deviceId=${deviceId}, startTime=${startTime}, endTime=${endTime}`);
    }

    // Standardize screenshot detection: if endTime is missing OR equal to startTime OR duration is 0 OR isSnapshot flag is set
    const isImage = isSnapshotParam || !endTime || endTime === startTime || (endTime - startTime) <= 1000;

    // Fetch VMS timezone offset to adjust local timestamps to VMS server time
    const timeOffsetMsQuery = searchParams.get("timeOffsetMs");
    let timeOffsetMs = timeOffsetMsQuery ? Number(timeOffsetMsQuery) : (global._vmsTimeOffsetMs || 0);
    if (timeOffsetMs === 0) {
      try {
        const timeUrl = buildCloudUrl(systemId, "/api/time", undefined, request);
        const timeHeaders = buildCloudHeaders(request, systemId);
        let timeRes = await fetch(timeUrl, { headers: timeHeaders });
        if (timeRes.status === 401 || timeRes.status === 403) {
          const basic = getBasicAuthHeaderFromRequest(request);
          if (basic) timeRes = await fetch(timeUrl, { headers: { ...timeHeaders, Authorization: basic } });
        }
        if (timeRes.ok) {
          const timeData = await timeRes.json();
          if (typeof timeData.offset === "number") {
            const clientOffsetMs = -new Date().getTimezoneOffset() * 60 * 1000;
            timeOffsetMs = timeData.offset - clientOffsetMs;
            global._vmsTimeOffsetMs = timeOffsetMs;
          }
        }
      } catch (e) {
        // fallback to 0
      }
    }

    // Build download URL params
    const params = new URLSearchParams();
    let endpoint = "";

    // Use modern REST v3 endpoints
    if (isImage) {
      params.set("pos", String(startTime));
      params.set("time", String(startTime));
      params.set("method", "fast");
      endpoint = `/rest/v3/devices/${deviceId}/image`; 
    } else {
      params.set("positionMs", String(startTime));
      if (endTime) {
        params.set("durationMs", String(endTime - startTime));
      }
      endpoint = `/rest/v3/devices/${deviceId}/media`;
    }

    // Pass token from query param if provided (watchdog)
    const urlToken = searchParams.get("token");
    if (urlToken) params.set("token", urlToken);

    // Force isImage to true if we are using the image endpoint
    const effectiveIsImage = isImage && endpoint.includes("/image");

    const username = searchParams.get("username");
    const password = searchParams.get("password");

    const downloadUrl = buildCloudUrl(systemId, endpoint, params, request, systemName);

    // Explicitly define generic headers type
    const headers: Record<string, string> = buildCloudHeaders(request, systemId);
    if (isImage) {
      headers["Accept"] = "image/png, image/jpeg, image/*;q=0.9, */*;q=0.8";
      delete headers["Content-Type"];
    }

    // ── AUTO-SAVE ONLY (Background Queue Delegation) ──────────────────────────
    // Called automatically when a scheduled recording finishes. Adds to local
    // queue and returns instantly to avoid HTTP socket blocking or timeouts.
    if (autoSave && !effectiveIsImage) {
      let recDate = new Date(startTime);
      if (timeOffsetMs !== 0) {
        recDate = new Date(recDate.getTime() + timeOffsetMs);
      }

      const YYYY = recDate.getFullYear().toString();
      const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
      const DD = recDate.getDate().toString().padStart(2, "0");
      const HH = recDate.getHours().toString().padStart(2, "0");
      const mmP = recDate.getMinutes().toString().padStart(2, "0");
      const dateFolder = `${YYYY}-${MM}-${DD}`;
      const safeCameraName = sanitizeCameraName(searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera");
      
      // Use configured Video Storage Path, fallback to Snapshot Path, then default
      let autoSaveBaseDir = path.join(process.cwd(), "data", "recorded_videos");
      try {
        const settings = readAppSettings();
        if (settings.videoStoragePath) {
          autoSaveBaseDir = String(settings.videoStoragePath);
        } else if (settings.storagePath) {
          autoSaveBaseDir = String(settings.storagePath);
        }
      } catch (e) { }

      const finalFileName = `${safeCameraName}_${HH}${mmP}00_${deviceId.slice(-4).toLowerCase()}.mp4`;
      
      // Security: Validate target save path against path traversal!
      const savePath = validateAndGetSavePath(autoSaveBaseDir, dateFolder, finalFileName);
      
      // DEDUPLICATION: Check if file already exists AND has valid content
      if (isValidOutputFile(savePath, "video")) {
        console.log(`[recordings/download] AUTO-SAVE: Valid file already exists, skipping: ${savePath}`);
        if (taskId) {
          await updateTaskStatus(taskId, true, timeOffsetMs);
        }
        return NextResponse.json({ success: true, path: savePath, file: finalFileName, skipped: true });
      }
      
      if (fs.existsSync(savePath)) {
        console.log(`[recordings/download] AUTO-SAVE: Found 0-byte or corrupted file, overwriting: ${savePath}`);
        try { fs.unlinkSync(savePath); } catch (e) {}
      }

      // Build the fresh set of headers for the VMS request
      const vmsHeaders: Record<string, string> = {
        "x-runtime-guid": urlToken || ""
      };
      if (urlToken && !urlToken.startsWith("vms-")) {
        vmsHeaders["Authorization"] = `Bearer ${urlToken}`;
      }

      // Enqueue job to offload CPU and network from Next.js server thread
      const payload = {
        systemId,
        deviceId,
        cameraName: safeCameraName,
        startTime,
        endTime: endTime || startTime,
        savePath,
        downloadUrl,
        vmsHeaders,
        taskId: taskId || undefined,
        notificationUserKey: searchParams.get("notificationUserKey") || "admin",
        timeOffsetMs,
      };

      await enqueueJob(payload);

      // Return instant success response to watchdog to prevent connection timeouts!
      return NextResponse.json({
        success: true,
        message: "Scheduled auto-save task added to the background job queue.",
        file: finalFileName,
        enqueued: true
      });
    }

    // If stream=true OR preview=true, proxy the actual video content with auth
    if (stream === "true" || preview === "true") {
      const isPreview = preview === "true";

      // Forward Range header from browser — REQUIRED for inline video playback
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        headers["Range"] = rangeHeader;
      }

      const controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 85000);

      let videoResponse = await fetch(downloadUrl, {
        headers: headers,
        signal: controller.signal,
      });

      if (videoResponse.status === 401 || videoResponse.status === 403) {
        const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
        if (basicAuthHeader) {
          const retryHeaders: Record<string, string> = {
            ...headers,
            Authorization: basicAuthHeader,
          };
          delete retryHeaders["x-runtime-guid"];

          videoResponse = await fetch(downloadUrl, {
            headers: retryHeaders,
            signal: controller.signal,
          });
        }
      }

      if (requestTimeout) {
        clearTimeout(requestTimeout);
        requestTimeout = null;
      }

      if (!videoResponse.ok) {
        let errorText = "";
        try { errorText = await videoResponse.text(); } catch (e) { errorText = "Could not read error body"; }
        return NextResponse.json(
          { error: `Video fetch failed: ${videoResponse.status}`, details: errorText },
          { status: videoResponse.status }
        );
      }

      const recDate = new Date(startTime);
      const YYYY = recDate.getFullYear();
      const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
      const DD = recDate.getDate().toString().padStart(2, "0");
      const HH = recDate.getHours().toString().padStart(2, "0");
      const mm = recDate.getMinutes().toString().padStart(2, "0");
      const ss = "00"; // Round down to :00 per user request
      const timestamp = `${HH}${mm}${ss}`;
      const dateStr = `${YYYY}${MM}${DD}`;
      const safeCameraName = sanitizeCameraName(searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera");

      const filename = effectiveIsImage
        ? `${safeCameraName}_${dateStr}_${timestamp}.png`
        : `${safeCameraName}_${dateStr}_${timestamp}.mp4`;

      // If it's a screenshot, save a local copy using strict paths
      if (effectiveIsImage) {
        try {
          let recDate = new Date(startTime);
          if (timeOffsetMs !== 0) {
            recDate = new Date(recDate.getTime() + timeOffsetMs);
          }

          const YYYY = recDate.getFullYear().toString();
          const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
          const DD = recDate.getDate().toString().padStart(2, "0");
          const HH = recDate.getHours().toString().padStart(2, "0");
          const mm = recDate.getMinutes().toString().padStart(2, "0");
          const SS = "00"; // Round down to :00 per user request
          const dateFolder = `${YYYY}-${MM}-${DD}`;
          
          let snapshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
          try {
            const settings = readAppSettings();
            if (settings.storagePath) snapshotsBaseDir = String(settings.storagePath);
          } catch (e) { }

          const baseFileName = `${safeCameraName}_${HH}${mm}${SS}`;
          const screenshotsDir = path.join(snapshotsBaseDir, dateFolder);
          
          if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
          }

          let finalFileName = `${baseFileName}.png`;
          let localPath = validateAndGetSavePath(snapshotsBaseDir, dateFolder, finalFileName);
          let counter = 1;
          while (fs.existsSync(localPath)) {
            finalFileName = `${baseFileName}_${counter}.png`;
            localPath = validateAndGetSavePath(snapshotsBaseDir, dateFolder, finalFileName);
            counter++;
          }

          const buffer = await videoResponse.clone().arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(buffer));
        } catch (saveErr) {
          console.error("[recordings/download] Failed to save local screenshot copy:", saveErr);
        }
      }

      // Preview: inline so browser plays/shows it. Download: attachment to save file.
      const disposition = isPreview
        ? `inline; filename="${filename}"`
        : `attachment; filename="${filename}"`;

      const responseContentType = videoResponse.headers.get("Content-Type");
      const finalContentType = effectiveIsImage
        ? (responseContentType && responseContentType.includes("image") ? responseContentType : "image/jpeg")
        : (responseContentType || "video/mp4");

      // We skip this for previews to ensure instant playback without server-side processing.
      if (!effectiveIsImage && !isPreview && videoResponse.body) {
        const tempId = Math.random().toString(36).substring(7);
        const tempInputPath = path.join(os.tmpdir(), `raw_recording_${tempId}.bin`);
        const tempOutputPath = path.join(os.tmpdir(), `fixed_recording_${tempId}.mp4`);

        const safeUnlink = (p: string, retries = 3) => {
          if (!p) return;
          const attempt = (remaining: number) => {
            try {
              if (fs.existsSync(p)) {
                fs.unlinkSync(p);
              }
            } catch (err: any) {
              if (remaining > 0 && (err.code === "EBUSY" || err.code === "EPERM")) {
                setTimeout(() => attempt(remaining - 1), 120);
              }
            }
          };
          attempt(retries);
        };

        let isAborted = Boolean(request.signal?.aborted);
        if (isAborted) {
          return new NextResponse("Request aborted", { status: 499 });
        }

        let activeProcess: ReturnType<typeof spawn> | null = null;
        let activeWriteStream: fs.WriteStream | null = null;
        let activeInputStream: Readable | null = null;

        const onAbort = () => {
          isAborted = true;
          // 1. Abort upstream network/file streams safely
          if (activeInputStream) {
            try { activeInputStream.destroy(); } catch (_) {}
          }
          if (activeWriteStream) {
            try { activeWriteStream.destroy(); } catch (_) {}
          }
          // 2. Terminate active FFmpeg process if running
          if (activeProcess && activeProcess.exitCode === null) {
            try { activeProcess.kill("SIGKILL"); } catch (_) {}
          }
        };

        if (request.signal) {
          request.signal.addEventListener("abort", onAbort, { once: true });
        }

        const UPSTREAM_DOWNLOAD_TIMEOUT_MS = 120000; // 2-minute safety limit for upstream stream download
        let upstreamTimedOut = false;
        let slotAcquired = false;
        let slotReleased = false;

        const releaseSlotOnce = () => {
          if (slotAcquired && !slotReleased) {
            slotReleased = true;
            releaseFfmpegSlot();
          }
        };

        try {
          // 1. Download upstream stream to tempInputPath on disk
          const writeStream = fs.createWriteStream(tempInputPath);
          activeWriteStream = writeStream;
          const inputStream = Readable.fromWeb(videoResponse.body as any);
          activeInputStream = inputStream;

          await new Promise<void>((resolve, reject) => {
            let streamSettled = false;
            let downloadTimer: NodeJS.Timeout | null = null;

            const cleanupListeners = () => {
              if (downloadTimer) {
                clearTimeout(downloadTimer);
                downloadTimer = null;
              }
              writeStream.removeListener("finish", onFinish);
              writeStream.removeListener("error", onError);
              writeStream.removeListener("close", onClose);
              inputStream.removeListener("error", onError);
            };

            const finishStream = (err?: Error) => {
              if (streamSettled) return;
              streamSettled = true;
              cleanupListeners();
              if (err) reject(err);
              else resolve();
            };

            const onFinish = () => finishStream();
            const onError = (err: any) => finishStream(err);
            const onClose = () => {
              if (isAborted || request.signal?.aborted) {
                finishStream(new Error("Request aborted during upstream download"));
              }
            };

            downloadTimer = setTimeout(() => {
              upstreamTimedOut = true;
              const tErr = new Error(`Upstream video stream download timed out after ${UPSTREAM_DOWNLOAD_TIMEOUT_MS}ms`);
              try { inputStream.destroy(tErr); } catch (_) {}
              try { writeStream.destroy(tErr); } catch (_) {}
              finishStream(tErr);
            }, UPSTREAM_DOWNLOAD_TIMEOUT_MS);

            writeStream.on("finish", onFinish);
            writeStream.on("error", onError);
            writeStream.on("close", onClose);
            inputStream.on("error", onError);
            inputStream.pipe(writeStream);
          });
          activeInputStream = null;
          activeWriteStream = null;

          if (isAborted || request.signal?.aborted) {
            safeUnlink(tempInputPath);
            safeUnlink(tempOutputPath);
            if (request.signal) {
              request.signal.removeEventListener("abort", onAbort);
            }
            return new NextResponse("Request aborted", { status: 499 });
          }

          if (upstreamTimedOut) {
            safeUnlink(tempInputPath);
            safeUnlink(tempOutputPath);
            if (request.signal) {
              request.signal.removeEventListener("abort", onAbort);
            }
            return NextResponse.json(
              { error: "Gateway Timeout: upstream recording stream took too long to download" },
              { status: 504 }
            );
          }

          const ffmpegPath = getFfmpegPath();

          // Helper to execute FFmpeg with robust timeout, stderr draining, and process synchronization
          const runFfmpeg = (
            args: string[],
            timeoutMs: number,
            onProcSpawn?: (proc: ReturnType<typeof spawn>) => void
          ): Promise<{
            code: number | null;
            error?: Error;
            stderr: string;
            timedOut: boolean;
          }> => {
            return new Promise((resolve) => {
              let timer: ReturnType<typeof setTimeout> | null = null;
              let timedOut = false;
              let settled = false;
              let stderrTail = "";
              const MAX_STDERR_LOG = 50 * 1024; // Keep last 50 KB

              const proc = spawn(ffmpegPath, args, { windowsHide: true });
              if (onProcSpawn) onProcSpawn(proc);

              proc.stdin?.on("error", () => {});

              // Continuously consume proc.stderr to prevent OS pipe buffer saturation and deadlock
              proc.stderr?.on("data", (chunk: Buffer | string) => {
                const str = chunk.toString();
                stderrTail += str;
                if (stderrTail.length > MAX_STDERR_LOG) {
                  stderrTail = stderrTail.slice(-MAX_STDERR_LOG);
                }
              });

              const finish = (result: {
                code: number | null;
                error?: Error;
                stderr: string;
                timedOut: boolean;
              }) => {
                if (settled) return;
                settled = true;
                if (timer) {
                  clearTimeout(timer);
                  timer = null;
                }
                resolve(result);
              };

              timer = setTimeout(() => {
                if (proc.exitCode === null) {
                  timedOut = true;
                  try {
                    proc.kill("SIGKILL");
                  } catch (_) {}
                  // DO NOT call finish() here. Wait for the 'close' event so the OS terminates
                  // the process and releases file locks on tempOutputPath before any next step runs.
                }
              }, timeoutMs);

              proc.on("close", (code) => {
                if (timedOut) {
                  finish({
                    code: -1,
                    error: new Error(`FFmpeg timed out after ${timeoutMs}ms`),
                    stderr: stderrTail,
                    timedOut: true,
                  });
                } else {
                  finish({
                    code,
                    stderr: stderrTail,
                    timedOut: false,
                  });
                }
              });

              proc.on("error", (err) => {
                finish({
                  code: -1,
                  error: err,
                  stderr: stderrTail,
                  timedOut: false,
                });
              });
            });
          };

          await acquireFfmpegSlot();
          slotAcquired = true;

          let remuxSuccess = false;
          try {
            if (isAborted || request.signal?.aborted) {
              return new NextResponse("Request aborted", { status: 499 });
            }

            // Phase 1: Fast Remux (Stream Copy Video + Transcode Audio to AAC for universal MP4 compatibility)
            // Timeout: 60 seconds (remuxing is pure IO and typically completes in <3 seconds)
            const remuxArgs = [
              "-fflags", "+genpts+igndts",
              "-avoid_negative_ts", "make_zero",
              "-i", tempInputPath,
              "-map", "0:v:0",
              "-c:v", "copy",
              "-map", "0:a?",
              "-c:a", "aac",
              "-b:a", "128k",
              "-movflags", "+faststart",
              "-max_muxing_queue_size", "1024",
              "-f", "mp4",
              "-y",
              tempOutputPath,
            ];

            const remuxResult = await runFfmpeg(remuxArgs, 60000, (p) => { activeProcess = p; });
            activeProcess = null;

            if (isAborted || request.signal?.aborted) {
              return new NextResponse("Request aborted", { status: 499 });
            }

            // Analyze diagnostic logs from FFmpeg stderr for codec compatibility
            const codecInfo = parseVideoCodecFromStderr(remuxResult.stderr);

            if (remuxResult.code === 0 && fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 1024) {
              if (codecInfo.isH264) {
                // Source is confirmed H.264 video; fast remux is 100% compatible with browsers
                remuxSuccess = true;
              } else if (codecInfo.isHevc) {
                console.warn(
                  `[recordings/download] Source video is HEVC/H.265 (codec=${codecInfo.codec}). Stream copy MP4 is incompatible with browsers. Triggering fallback libx264 re-encoding...`
                );
                safeUnlink(tempOutputPath);
              } else if (codecInfo.detected) {
                console.warn(
                  `[recordings/download] Source video codec (${codecInfo.codec}) is non-standard for web MP4. Triggering fallback libx264 re-encoding...`
                );
                safeUnlink(tempOutputPath);
              } else {
                // Codec could not be identified with certainty from diagnostic logs
                // Safe documented fallback decision: re-encode to guarantee universal browser playback
                console.warn(
                  `[recordings/download] Video codec could not be verified from diagnostic output. Falling back to safe libx264 re-encoding for guaranteed playback.`
                );
                safeUnlink(tempOutputPath);
              }
            } else {
              console.warn(
                `[recordings/download] Fast stream copy failed (exitCode=${remuxResult.code}, timedOut=${remuxResult.timedOut}). Triggering fallback re-encoding...`
              );
              safeUnlink(tempOutputPath);
            }

            // Phase 2: Fallback re-encoding (libx264 + aac) if remux failed or codec was incompatible
            if (!remuxSuccess && !isAborted && !request.signal?.aborted) {
              const fallbackArgs = [
                "-fflags", "+genpts",
                "-i", tempInputPath,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                "-f", "mp4",
                "-y",
                tempOutputPath,
              ];

              const fallbackResult = await runFfmpeg(fallbackArgs, 300000, (p) => { activeProcess = p; }); // 5-minute safety timeout
              activeProcess = null;

              if (isAborted || request.signal?.aborted) {
                return new NextResponse("Request aborted", { status: 499 });
              }

              if (fallbackResult.code !== 0 || !fs.existsSync(tempOutputPath) || fs.statSync(tempOutputPath).size === 0) {
                safeUnlink(tempInputPath);
                safeUnlink(tempOutputPath);
                return NextResponse.json(
                  { error: "FFmpeg process failed during conversion", code: fallbackResult.code, details: fallbackResult.error?.message },
                  { status: 500 }
                );
              }
            }
          } finally {
            releaseSlotOnce();
            // Input file is no longer needed once output is produced
            safeUnlink(tempInputPath);
            if (request.signal) {
              request.signal.removeEventListener("abort", onAbort);
            }
          }

          if (isAborted || request.signal?.aborted) {
            safeUnlink(tempOutputPath);
            return new NextResponse("Request aborted", { status: 499 });
          }

          // Stream output file to response; unlink tempOutputPath only after client stream closes
          const fileStream = fs.createReadStream(tempOutputPath);
          fileStream.on("close", () => {
            safeUnlink(tempOutputPath);
          });
          fileStream.on("error", () => {
            safeUnlink(tempOutputPath);
          });

          return new NextResponse(Readable.toWeb(fileStream) as any, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Disposition": disposition,
              "Cache-Control": "no-cache",
            },
          });
        } catch (streamErr: any) {
          releaseSlotOnce();
          safeUnlink(tempInputPath);
          safeUnlink(tempOutputPath);
          if (request.signal) {
            request.signal.removeEventListener("abort", onAbort);
          }

          if (isAborted || request.signal?.aborted) {
            return new NextResponse("Request aborted", { status: 499 });
          }

          if (upstreamTimedOut) {
            return NextResponse.json(
              { error: "Gateway Timeout: upstream recording stream took too long to download" },
              { status: 504 }
            );
          }

          return NextResponse.json(
            { error: "Video processing error", details: streamErr?.message || String(streamErr) },
            { status: 500 }
          );
        }
      }

      // Fragmented MP4 preview (fMP4)
      if (!effectiveIsImage && isPreview && videoResponse.body) {
        const ffmpegPath = getFfmpegPath();
        const ffmpegPreview = spawn(ffmpegPath, [
          "-fflags", "+genpts",          "-i", "pipe:0",

          "-start_at_zero",
          "-avoid_negative_ts", "make_zero",

          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "23",
          "-profile:v", "main",
          "-level", "4.2",
          "-pix_fmt", "yuv420p",

          "-c:a", "aac",
          "-b:a", "128k",

          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-f", "mp4",
          "pipe:1",
        ]);

        ffmpegPreview.stdin.on("error", (e) => {});
        ffmpegPreview.stderr.on("data", (chunk) => {});

        const previewInput = Readable.fromWeb(videoResponse.body as any);
        previewInput.pipe(ffmpegPreview.stdin);

        return new NextResponse(Readable.toWeb(ffmpegPreview.stdout) as any, {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": disposition,
            "Accept-Ranges": "none",
            "Cache-Control": "no-cache, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      // Build response headers — pass through Range-related headers from upstream
      const upstreamStatus = videoResponse.status;
      const contentRangeHeader = videoResponse.headers.get("Content-Range");
      const contentLengthHeader = videoResponse.headers.get("Content-Length");

      const responseHeaders: Record<string, string> = {
        "Content-Type": finalContentType,
        "Content-Disposition": disposition,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      };
      if (contentLengthHeader) responseHeaders["Content-Length"] = contentLengthHeader;
      if (contentRangeHeader) responseHeaders["Content-Range"] = contentRangeHeader;


      const responseStatus = (upstreamStatus === 206 || (rangeHeader && upstreamStatus === 200)) ? 206 : 200;

      return new NextResponse(videoResponse.body, {
        status: responseStatus,
        headers: responseHeaders,
      });
    }

    let redirectUrl = downloadUrl;
    if (username && password) {
      try {
        const urlObj = new URL(downloadUrl);
        urlObj.username = username;
        urlObj.password = password;
        redirectUrl = urlObj.toString();
      } catch {}
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      return NextResponse.json(
        { error: "Download request timed out", details: "Upstream server did not respond in time" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Failed to generate download URL", details: (error as any)?.message },
      { status: 500 }
    );
  } finally {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
    }
  }
}

export async function HEAD(request: NextRequest) {
  return GET(request);
}
