import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";
import os from "os";

import { promisify } from "util";
import { spawn } from "child_process";
import { Readable } from "stream";
import { logRecordingEvent } from "@/lib/recording-logger";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// VMS uses self-signed certificates — disable strict TLS validation for server-side fetches
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── FFmpeg Worker Isolation & Queueing ──────────────────────────────────────
// FFmpeg is CPU intensive. To prevent the server from crashing or becoming 
// unresponsive when many recordings finish at once, we limit concurrent workers.
declare global {
  var _ffmpegActiveCount: number | undefined;
  var _ffmpegQueue: Array<() => void> | undefined;
}

if (global._ffmpegActiveCount === undefined) global._ffmpegActiveCount = 0;
if (global._ffmpegQueue === undefined) global._ffmpegQueue = [];

const MAX_CONCURRENT_FFMPEG = 15; // Increased to handle 700+ cameras; safe because '-c:v copy' is low-CPU

/**
 * Acquire a slot for FFmpeg processing. Returns a promise that resolves
 * when a slot becomes available.
 */
async function acquireFfmpegSlot(): Promise<void> {
  if ((global._ffmpegActiveCount || 0) < MAX_CONCURRENT_FFMPEG) {
    global._ffmpegActiveCount = (global._ffmpegActiveCount || 0) + 1;
    return;
  }
  return new Promise((resolve) => {
    global._ffmpegQueue?.push(resolve);
  });
}

/**
 * Release an FFmpeg slot and signal the next waiting process.
 */
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

/**
 * Get the path to ffmpeg executable.
 * In packaged Electron apps, use the bundled ffmpeg.exe from resources.
 * In development, use system PATH.
 */
function getFfmpegPath(): string {
  // Check if running in packaged Electron app
  if (process.env.ELECTRON_RUN_AS_NODE || process.env.IS_ELECTRON) {
    try {
      // Try to find bundled ffmpeg in resources
      // @ts-ignore - resourcesPath is added by Electron at runtime
      const resourcesPath = process.resourcesPath || path.join(process.cwd(), "..");
      const bundledFfmpeg = path.join(resourcesPath, "node-bin", "ffmpeg.exe");
      
      if (fs.existsSync(bundledFfmpeg)) {
        // console.log(`[recordings/download] Using bundled FFmpeg: ${bundledFfmpeg}`);
        return bundledFfmpeg;
      } else {
        // console.warn(`[recordings/download] Bundled FFmpeg not found at: ${bundledFfmpeg}`);
      }
    } catch (e) {
      // console.error("[recordings/download] Error locating bundled FFmpeg:", e);
    }
  }
  
  // Fall back to system PATH
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
        
        if (success && isNonRecurring) {
          data.schedules.splice(taskIndex, 1);
          console.log(`[recordings/download] Task ${taskId} completed and REMOVED (non-recurring)`);
        } else {
          // If non-recurring failed, set status to failed.
          // For recurring, keep the "pending" status set by the watchdog (do not overwrite it).
          if (isNonRecurring) {
            task.status = success ? "completed" : "failed";
            console.log(`[recordings/download] Task ${taskId} status updated to: ${task.status}`);
          } else {
            console.log(`[recordings/download] Task ${taskId} is recurring (recurrence=${task.recurrence}). Keeping status: ${task.status}`);
          }
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      }
    }
  } catch (err) {
    console.error(`[recordings/download] Failed to update task ${taskId} status:`, err);
  }
}

export async function GET(request: NextRequest) {
  // Handle HEAD requests (browser pre-flight for video range support)
  const isHead = request.method === "HEAD";
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceId = searchParams.get("deviceId")?.replace(/[{}]/g, "");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const stream = searchParams.get("stream");
    const preview = searchParams.get("preview"); // If 'true', serve inline for browser playback
    const autoSave = searchParams.get("autoSave") === "true"; 
    const taskId = searchParams.get("taskId");
    const isSnapshotParam = searchParams.get("isSnapshot") === "true";

    if (autoSave) {
      console.log(`[recordings/download] INTERNAL AUTO-SAVE request: deviceId=${deviceId}, startTime=${startTime}, taskId=${taskId}`);
    } else {
      console.log(`[recordings/download] GET request received: deviceId=${deviceId}, startTime=${startTime}, endTime=${endTime}`);
    }

    if (!systemId || !deviceId || !startTime) {
      return NextResponse.json(
        { error: "systemId, deviceId, and startTime are required" },
        { status: 400 }
      );
    }

    // console.log(`[recordings/download] Params: systemId=${systemId}, deviceId=${deviceId}, startTime=${startTime}, endTime=${endTime}, stream=${stream}`);

    // Standardize screenshot detection: if endTime is missing OR equal to startTime OR duration is 0 OR isSnapshot flag is set
    const isImage = isSnapshotParam || !endTime || parseInt(endTime) === parseInt(startTime as string) || (parseInt(endTime) - parseInt(startTime as string)) <= 1000;

    // Build download URL params
    const params = new URLSearchParams();
    let endpoint = "";

    // Use modern REST v3 endpoints
    if (isImage) {
      params.set("pos", startTime as string);
      params.set("time", startTime as string);
      params.set("method", "fast");
      endpoint = `/rest/v3/devices/${deviceId}/image`; 
    } else {
      params.set("positionMs", startTime as string);
      if (endTime) {
        params.set("endPositionMs", endTime as string);
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

    const downloadUrl = buildCloudUrl(systemId, endpoint, params, request, systemName || undefined);
    // console.log(`[recordings/download] Generated URL: ${downloadUrl}`);

    // Explicitly define generic headers type
    const headers: Record<string, string> = buildCloudHeaders(request, systemId);
    if (isImage) {
      headers["Accept"] = "image/png, image/jpeg, image/*;q=0.9, */*;q=0.8";
      delete headers["Content-Type"];
    }

    // ── AUTO-SAVE ONLY (no streaming) ───────────────────────────────────────
    // Called automatically when a scheduled recording finishes. Encodes and saves
    // the clip to the storage folder, returns JSON. No body is streamed to the client.
    if (autoSave && !effectiveIsImage) {
      const recDate = new Date(parseInt(startTime as string, 10));
      const YYYY = recDate.getFullYear().toString();
      const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
      const DD = recDate.getDate().toString().padStart(2, "0");
      const HH = recDate.getHours().toString().padStart(2, "0");
      const mmP = recDate.getMinutes().toString().padStart(2, "0");
      const dateFolder = `${YYYY}-${MM}-${DD}`;
      const safeCameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
        .replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();
      
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

      const finalFileName = `${safeCameraName}_${HH}${mmP}00.mp4`;
      const saveDir = path.join(autoSaveBaseDir, dateFolder);
      
      console.log(`[recordings/download] AUTO-SAVE target: ${saveDir}${path.sep}${finalFileName}`);
      
      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
      const savePath = path.join(saveDir, finalFileName);

      // DEDUPLICATION: Check if file already exists AND has content before fetching from VMS
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

      console.log(`[recordings/download] AUTO-SAVE triggered for ${deviceId} startTime=${startTime}, duration=${Math.round((parseInt(endTime || startTime) - parseInt(startTime))/1000)}s`);

      let videoResponse: Response;
      try {
        const controller = new AbortController();
        const autoSaveTimeout = setTimeout(() => controller.abort(), 120000); // 2-min timeout for long clips
        
        // Pulse Filtering: Skip auto-save if duration is under 10 seconds
        const durationMs = (endTime && startTime) ? parseInt(endTime) - parseInt(startTime) : 0;
        if (durationMs > 0 && durationMs < 10000) {
          console.log(`[recordings/download] AUTO-SAVE skipped: Clip is a pulse (${Math.round(durationMs/1000)}s)`);
          clearTimeout(autoSaveTimeout);
          if (taskId) {
            await updateTaskStatus(taskId, true);
          }
          return NextResponse.json({ success: true, skipped: true, reason: "pulse_filter" });
        }

        // Build a fresh set of headers for the VMS request to avoid conflicts
        const vmsHeaders: Record<string, string> = {
          "Accept": "application/json",
          "x-runtime-guid": urlToken || ""
        };
        // Only add Bearer if it's not a local VMS token
        if (urlToken && !urlToken.startsWith("vms-")) {
          vmsHeaders["Authorization"] = `Bearer ${urlToken}`;
        }

        console.log(`[recordings/download] AUTO-SAVE: Fetching from VMS: ${downloadUrl.split('?')[0]}`);
        videoResponse = await fetch(downloadUrl, { headers: vmsHeaders, signal: controller.signal });
        clearTimeout(autoSaveTimeout);

        if (!videoResponse.ok || !videoResponse.body) {
          const errText = await videoResponse.text().catch(() => "");
          console.error(`[recordings/download] AUTO-SAVE: VMS fetch failed (${videoResponse.status}):`, errText);
          if (taskId) {
            await updateTaskStatus(taskId, false);
          }
          return NextResponse.json({ error: "Auto-save fetch failed", status: videoResponse.status, details: errText }, { status: 500 });
        }
        console.log(`[recordings/download] AUTO-SAVE: VMS fetch successful (${videoResponse.status}), starting FFmpeg...`);
      } catch (fetchErr: any) {
        console.error("[recordings/download] AUTO-SAVE: VMS fetch error:", fetchErr.message || fetchErr);
        if (taskId) {
          await updateTaskStatus(taskId, false);
        }
        return NextResponse.json({ error: "Auto-save fetch error", details: fetchErr.message }, { status: 500 });
      }

      console.log(`[recordings/download] AUTO-SAVE queueing for slot: ${deviceId}`);
      await acquireFfmpegSlot();
      console.log(`[recordings/download] AUTO-SAVE encoding started (slot acquired): ${savePath}`);

      const ffmpegPath = getFfmpegPath();
      const ffmpegAutoSave = spawn(ffmpegPath, [
        "-fflags", "+genpts+igndts",
        "-avoid_negative_ts", "make_zero",
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
        "-y",
        savePath,
      ], { windowsHide: true });

      ffmpegAutoSave.stdin.on("error", (e) => {
        console.error("[recordings/download] AUTO-SAVE FFmpeg stdin error:", e.message);
      });

      ffmpegAutoSave.stderr.on("data", (data) => {
        // Log FFmpeg progress/errors for debugging
        const msg = data.toString();
        if (msg.includes("error") || msg.includes("Error")) {
          console.error("[recordings/download] FFmpeg stderr:", msg.trim());
        }
      });

      // Pipe video stream to FFmpeg
      const autoSaveStream = Readable.fromWeb(videoResponse.body as any);
      autoSaveStream.pipe(ffmpegAutoSave.stdin);

      // Safety timeout: Kill FFmpeg if it takes more than 3 minutes
      const ffmpegSafetyTimeout = setTimeout(() => {
        if (ffmpegAutoSave.exitCode === null) {
          console.warn(`[recordings/download] AUTO-SAVE: FFmpeg process timed out, killing it: ${savePath}`);
          ffmpegAutoSave.kill("SIGKILL");
        }
      }, 180000);

      // Wait for FFmpeg to finish
      return await new Promise<NextResponse>((resolve) => {
        const taskId = searchParams.get("taskId");

        ffmpegAutoSave.on("close", async (code) => {
          clearTimeout(ffmpegSafetyTimeout);
          releaseFfmpegSlot(); // Release slot immediately when process closes
          
          if (taskId) {
            await updateTaskStatus(taskId, code === 0);
          }

          if (code !== 0) {
            console.error(`[recordings/download] AUTO-SAVE FFmpeg failed with code ${code}`);
            resolve(NextResponse.json({ error: "FFmpeg failed during auto-save", code }, { status: 500 }));
          } else {
            console.log(`[recordings/download] AUTO-SAVE complete: ${finalFileName}`);
            logRecordingEvent(`Auto-saved video: ${safeCameraName}`);

            // ── Send Notification ───────────────────────────────────────────────────
            const notificationUserKey = searchParams.get("notificationUserKey") || "admin";
            const port = detectCurrentPort(global._nxAppPort || "3030");
            fetch(`http://127.0.0.1:${port}/api/notifications`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: notificationUserKey,
                type: "success",
                title: "Video Auto-Saved",
                message: `Scheduled recording for ${safeCameraName} is complete and stored locally.`,
                systemId: systemId,
                deviceId: deviceId,
                startTimeMs: parseInt(startTime as string, 10),
                durationMs: parseInt(endTime || startTime) - parseInt(startTime)
              })
            }).catch(err => {});

            resolve(NextResponse.json({ success: true, path: savePath, file: finalFileName }));
          }
        });

        ffmpegAutoSave.on("error", (err) => {
          releaseFfmpegSlot(); // Release slot on error too
          console.error("[recordings/download] AUTO-SAVE FFmpeg spawn error:", err.message);
          resolve(NextResponse.json({ error: "FFmpeg not found or failed to start", details: err.message }, { status: 500 }));
        });
      });
    }

    // If stream=true OR preview=true, proxy the actual video content with auth
    if (stream === "true" || preview === "true") {

      const isPreview = preview === "true";
      // console.log(`[recordings/download] ${isPreview ? "Previewing" : "Streaming"} media with auth headers`);

      // Forward Range header from browser — REQUIRED for inline video playback
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        headers["Range"] = rangeHeader;
        // console.log(`[recordings/download] Forwarding Range header: ${rangeHeader}`);
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

          // console.warn("[recordings/download] Retrying media fetch with Basic auth");
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

      const recDate = new Date(parseInt(startTime as string, 10));
      const YYYY = recDate.getFullYear();
      const MM = (recDate.getMonth() + 1).toString().padStart(2, "0");
      const DD = recDate.getDate().toString().padStart(2, "0");
      const HH = recDate.getHours().toString().padStart(2, "0");
      const mm = recDate.getMinutes().toString().padStart(2, "0");
      const ss = "00"; // Round down to :00 per user request
      const timestamp = `${HH}${mm}${ss}`;
      const dateStr = `${YYYY}${MM}${DD}`;
      const safeCameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
        .replace(/[<>:"/\\|?*]/g, "_").trim();

      const filename = effectiveIsImage
        ? `${safeCameraName}_${dateStr}_${timestamp}.png`
        : `${safeCameraName}_${dateStr}_${timestamp}.mp4`;

      // If it's a screenshot, save a local copy to the data folder using date-based structure
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
          
          // Respect custom storage path for snapshots
          let snapshotsBaseDir = path.join(process.cwd(), "data", "recorded_screenshots");
          try {
            const settingsFile = path.join(process.cwd(), "data", "settings.json");
            if (fs.existsSync(settingsFile)) {
              const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
              if (settings.storagePath) snapshotsBaseDir = settings.storagePath;
            }
          } catch (e) { }

          const cameraName = (searchParams.get("cameraName") || deviceId?.substring(0, 8) || "Camera")
            .replace(/[<>:"/\\|?*]/g, "_").trim();
          const baseFileName = `${cameraName}_${HH}${mm}${SS}`;

          const screenshotsDir = path.join(snapshotsBaseDir, dateFolder);
          if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
          }

          // Collision detection
          let finalFileName = `${baseFileName}.png`;
          let localPath = path.join(screenshotsDir, finalFileName);
          let counter = 1;
          while (fs.existsSync(localPath)) {
            finalFileName = `${baseFileName}_${counter}.png`;
            localPath = path.join(screenshotsDir, finalFileName);
            counter++;
          }

          const buffer = await videoResponse.clone().arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(buffer));
          // console.log(`[recordings/download] Saved screenshot to: ${localPath}`);
        } catch (saveErr) {
          // console.error("[recordings/download] Failed to save local screenshot copy:", saveErr);
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

      // FFmpeg REMUXING: For video downloads, use FFmpeg to fix the container metadata.
      // EXCEPTION: Don't auto-save very short clips (likely snapshot pulses)
      const durationMs = parseInt(endTime as string, 10) - parseInt(startTime as string, 10);
      const isPulse = durationMs > 0 && durationMs < 10000; // Under 10 seconds

      // We skip this for previews to ensure instant playback without server-side processing.
      if (!effectiveIsImage && !isPreview && videoResponse.body) {
        // console.log(`[recordings/download] Remuxing video via FFmpeg to fix metadata (download)`);

        // Use a temporary file for the output to support -movflags +faststart, 
        // which requires a seekable output (not a pipe).
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

        // Wait for FFmpeg to finish processing the file
        return await new Promise<NextResponse>((resolve) => {
          ffmpeg.on('close', (code) => {
            releaseFfmpegSlot(); // Release slot
            // console.log(`[recordings/download] FFmpeg finished with code ${code}`);

            if (code !== 0) {
              // console.error(`[recordings/download] FFmpeg failed with code ${code}`);
              resolve(NextResponse.json({ error: "FFmpeg process failed during conversion", code }, { status: 500 }));
              return;
            }

            // (The autoSave check here was redundant as auto-saves are handled in a separate block at the start)

            // Stream the fixed file back to the client
            const fileStream = fs.createReadStream(tempPath);

            // Clean up the temp file after it's been sent
            fileStream.on('close', () => {
              fs.unlink(tempPath, (err) => {
                // if (err) console.error("[recordings/download] Temp file cleanup error:", err);
              });
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
            releaseFfmpegSlot(); // Release slot on error
            // console.error("[recordings/download] FFmpeg spawn error:", err);
            // This usually means FFmpeg is not found in the path
            resolve(NextResponse.json({
              error: "FFmpeg process error - verify FFmpeg is installed and in system PATH",
              details: err.message
            }, { status: 500 }));
          });
        });
      }

      // FFmpeg PREVIEW: Stream a fragmented MP4 (fMP4) directly to pipe so Electron/Chromium
      // can start playing immediately from byte 0 without buffering the entire file.
      // Fragmented MP4 uses empty_moov+frag_keyframe which doesn't need +faststart (no seekable output needed).
      // We also re-encode to H.264/AAC to guarantee Electron codec compatibility.
      if (!effectiveIsImage && isPreview && videoResponse.body) {
        // console.log(`[recordings/download] Transcoding preview to fragmented MP4 via FFmpeg (pipe)`);

        const ffmpegPath = getFfmpegPath();
        const ffmpegPreview = spawn(ffmpegPath, [
          "-fflags", "+genpts",          "-i", "pipe:0",

          "-start_at_zero",
          "-avoid_negative_ts", "make_zero",

          "-c:v", "libx264",
          "-preset", "ultrafast",     // Fastest encode – minimise time-to-first-frame
          "-crf", "23",
          "-profile:v", "main",
          "-level", "4.2",
          "-pix_fmt", "yuv420p",

          "-c:a", "aac",
          "-b:a", "128k",

          // Fragmented MP4: moov atom is sent at the very start so playback begins immediately
          "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-f", "mp4",
          "pipe:1",                   // Output to stdout (pipe)
        ]);

        ffmpegPreview.stdin.on("error", (e) => {
          // console.error("[recordings/download] FFmpeg preview stdin error:", e);
        });
        ffmpegPreview.stderr.on("data", (chunk) => {
          // Only log first stderr chunk to avoid log spam
          // console.log("[recordings/download] FFmpeg preview:", chunk.toString().substring(0, 200));
        });

        const previewInput = Readable.fromWeb(videoResponse.body as any);
        previewInput.pipe(ffmpegPreview.stdin);

        return new NextResponse(Readable.toWeb(ffmpegPreview.stdout) as any, {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": disposition,
            "Accept-Ranges": "none",   // fMP4 pipe streams are not seekable
            "Cache-Control": "no-cache, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }


      // Build response headers — pass through Range-related headers from upstream
      const upstreamStatus = videoResponse.status; // May be 206 if upstream honoured range
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

      // ── MANUAL DOWNLOAD REMUXING ───────────────────────────────────────────
      // For manual downloads (stream=true, preview=false), we remux the raw VMS 
      // stream into a stable MP4 with fixed timestamps and +faststart.
      if (!isPreview && !effectiveIsImage && videoResponse.body) {
        // console.log(`[recordings/download] Remuxing manual download to stable MP4 via FFmpeg`);
        
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

        ffmpegProcess.stdin.on("error", (e) => {
          // console.error("[recordings/download] FFmpeg manual download stdin error:", e);
        });
        
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

      // Use 206 if upstream returned 206 or if client sent a Range header
      const responseStatus = (upstreamStatus === 206 || (rangeHeader && upstreamStatus === 200)) ? 206 : 200;

      return new NextResponse(videoResponse.body, {
        status: responseStatus,
        headers: responseHeaders,
      });
    }

    // Embed Basic-auth credentials in the URL so the browser authenticates on redirect
    let redirectUrl = downloadUrl;
    if (username && password) {
      try {
        const urlObj = new URL(downloadUrl);
        urlObj.username = username;
        urlObj.password = password;
        redirectUrl = urlObj.toString();
      } catch {
        // fall back to bare URL
      }
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      // console.error("[recordings/download] Upstream timeout");
      return NextResponse.json(
        { error: "Download request timed out", details: "Upstream server did not respond in time" },
        { status: 504 }
      );
    }

    // console.error("[recordings/download] Exception:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  } finally {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
    }
  }
}

// Next.js App Router requires an explicit HEAD export for browsers to negotiate
// Range support before attempting inline video playback.
export async function HEAD(request: NextRequest) {
  return GET(request);
}
function detectCurrentPort(fallback: string): string {
  const pIndex = process.argv.indexOf("-p");
  if (pIndex !== -1 && process.argv[pIndex + 1]) return process.argv[pIndex + 1];
  if (global._nxAppPort) return global._nxAppPort;
  return process.env.PORT || fallback || "3030";
}
