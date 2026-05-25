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

function getFfmpegPath(): string {
  if (process.env.ELECTRON_RUN_AS_NODE || process.env.IS_ELECTRON) {
    try {
      // @ts-ignore
      const resourcesPath = process.resourcesPath || path.join(process.cwd(), "..");
      const bundledFfmpeg = path.join(resourcesPath, "node-bin", "ffmpeg.exe");
      
      if (fs.existsSync(bundledFfmpeg)) {
        return bundledFfmpeg;
      }
    } catch (e) {}
  }
  return "ffmpeg";
}

async function updateTaskStatus(taskId: string, success: boolean): Promise<void> {
  try {
    const DATA_FILE = path.join(process.cwd(), "data", "scheduled_recordings.json");
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8").replace(/^\uFEFF/, "");
      const data = JSON.parse(content);
      const taskIndex = data.schedules?.findIndex((s: any) => s.id === taskId);
      if (taskIndex !== -1) {
        const task = data.schedules[taskIndex];
        const isNonRecurring = !task.recurrence || task.recurrence === "none" || task.recurrence === "once";
        
        if (isNonRecurring) {
          data.schedules.splice(taskIndex, 1);
          console.log(`[recordings/download] Task ${taskId} finished and REMOVED (non-recurring)`);
        } else {
          // Recurring task: roll it forward immediately to the next occurrence
          const startParts = (task.startTime || "00:00").split(":").map(Number);
          const sh = startParts[0], sm = startParts[1], ss = startParts[2] || 0;
          const duration = (task.endMs && task.startMs) ? (task.endMs - task.startMs) : 0;
          const nextDate = calculateNextOccurrence(task, sh, sm, ss);
          
          task.status = "pending";
          task.record = false;
          task.date = nextDate.toISOString();
          task.startMs = nextDate.getTime();
          task.endMs = nextDate.getTime() + duration;
          
          console.log(`[recordings/download] Task ${taskId} is recurring (recurrence=${task.recurrence}). Rolled forward to ${task.date} and marked as pending`);
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      }
    }
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
        params.set("endPositionMs", String(endTime));
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
      const recDate = new Date(startTime);
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
        const settingsFile = path.join(process.cwd(), "data", "settings.json");
        if (fs.existsSync(settingsFile)) {
          const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
          if (settings.videoStoragePath) {
            autoSaveBaseDir = settings.videoStoragePath;
          } else if (settings.storagePath) {
            autoSaveBaseDir = settings.storagePath;
          }
        }
      } catch (e) { }

      const finalFileName = `${safeCameraName}_${HH}${mmP}00_${deviceId.slice(-4).toLowerCase()}.mp4`;
      
      // Security: Validate target save path against path traversal!
      const savePath = validateAndGetSavePath(autoSaveBaseDir, dateFolder, finalFileName);
      
      // DEDUPLICATION: Check if file already exists AND has content
      if (fs.existsSync(savePath) && fs.statSync(savePath).size > 0) {
        console.log(`[recordings/download] AUTO-SAVE: Valid file already exists, skipping: ${savePath}`);
        if (taskId) {
          await updateTaskStatus(taskId, true);
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
          const now = new Date();
          const YYYY = now.getFullYear().toString();
          const MM = (now.getMonth() + 1).toString().padStart(2, "0");
          const DD = now.getDate().toString().padStart(2, "0");
          const HH = now.getHours().toString().padStart(2, "0");
          const mm = now.getMinutes().toString().padStart(2, "0");
          const SS = "00"; // Round down to :00 per user request
          const dateFolder = `${YYYY}${MM}${DD}`;
          
          let snapshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
          try {
            const settingsFile = path.join(process.cwd(), "data", "settings.json");
            if (fs.existsSync(settingsFile)) {
              const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
              if (settings.storagePath) snapshotsBaseDir = settings.storagePath;
            }
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
        const tempPath = path.join(os.tmpdir(), `fixed_recording_${tempId}.mp4`);

        const ffmpegPath = getFfmpegPath();
        const ffmpeg = spawn(ffmpegPath, [
          "-fflags", "+genpts",
          "-i", "pipe:0",

          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          "-f", "mp4",
          "-y",
          tempPath
        ], { windowsHide: true });

        // Avoid process crash on early stdin close
        ffmpeg.stdin.on("error", (e) => {
          console.error("[recordings/download] FFmpeg stdin error:", e);
        });

        const inputStream = Readable.fromWeb(videoResponse.body as any);
        
        await acquireFfmpegSlot(); // Acquire slot for manual remuxing
        inputStream.pipe(ffmpeg.stdin);

        return await new Promise<NextResponse>((resolve) => {
          ffmpeg.on('close', (code) => {
            releaseFfmpegSlot();

            if (code !== 0) {
              resolve(NextResponse.json({ error: "FFmpeg process failed during conversion", code }, { status: 500 }));
              return;
            }

            const fileStream = fs.createReadStream(tempPath);

            fileStream.on('close', () => {
              fs.unlink(tempPath, (err) => {});
            });

            resolve(new NextResponse(Readable.toWeb(fileStream) as any, {
              status: 200,
              headers: {
                "Content-Type": "video/mp4",
                "Content-Disposition": disposition,
                "Cache-Control": "no-cache",
              },
            }));
          });

          ffmpeg.on('error', (err) => {
            releaseFfmpegSlot();
            resolve(NextResponse.json({
              error: "FFmpeg process error - verify FFmpeg is installed and in system PATH",
              details: err.message
            }, { status: 500 }));
          });
        });
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

      // Manual download remuxing
      if (!isPreview && !effectiveIsImage && videoResponse.body) {
        await acquireFfmpegSlot();
        const ffmpegPath = getFfmpegPath();
        const ffmpegProcess = spawn(ffmpegPath, [
          "-fflags", "+genpts+igndts",
          "-avoid_negative_ts", "make_zero",
          "-analyze_duration", "10000000",
          "-probesize", "10000000",
          "-i", "pipe:0",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          "-max_muxing_queue_size", "1024",
          "-f", "mp4",
          "pipe:1"
        ], { windowsHide: true });

        ffmpegProcess.stdin.on("error", (e) => {});
        
        ffmpegProcess.on("close", () => {
          releaseFfmpegSlot();
        });

        const downloadInput = Readable.fromWeb(videoResponse.body as any);
        downloadInput.pipe(ffmpegProcess.stdin);

        return new NextResponse(Readable.toWeb(ffmpegProcess.stdout) as any, {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": disposition,
            "Accept-Ranges": "none",
            "Cache-Control": "no-cache, no-store",
          },
        });
      }

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
