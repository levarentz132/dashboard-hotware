import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable } from "stream";
import { loadQueue, updateJobStatus, getNextPendingJobs, FFmpegJob, cleanupStaleJobs } from "./ffmpeg-queue";
import { calculateNextOccurrence } from "./schedule-utils";
import { logRecordingEvent } from "./recording-logger";
import logger from "./logger";

declare global {
  var _ffmpegWorkerInterval: NodeJS.Timeout | undefined;
  var _ffmpegWorkerActive: boolean | undefined;
}

/**
 * Get the path to ffmpeg executable.
 * In packaged Electron apps, use the bundled ffmpeg.exe from resources.
 * In development, use system PATH.
 */
function getFfmpegPath(): string {
  if (process.env.ELECTRON_RUN_AS_NODE || process.env.IS_ELECTRON) {
    try {
      // @ts-ignore
      const resourcesPath = process.resourcesPath || path.join(process.cwd(), "..");
      const bundledFfmpeg = path.join(resourcesPath, "node-bin", "ffmpeg.exe");
      if (fs.existsSync(bundledFfmpeg)) {
        return bundledFfmpeg;
      }
    } catch (e) {
      logger.error("[FFmpegWorker] Error locating bundled FFmpeg:", e);
    }
  }
  return "ffmpeg";
}

/**
 * Reads the settings.json file to fetch the maximum concurrent auto-save limit.
 * Defaults to 2 (safe concurrency), but can be configured to 1 for Windows Server.
 */
function getConcurrencyLimit(): number {
  try {
    const settingsFile = path.join(process.cwd(), "data", "settings.json");
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
      if (typeof settings.ffmpegConcurrency === "number" && settings.ffmpegConcurrency > 0) {
        return settings.ffmpegConcurrency;
      }
      // Fallback: If running in restricted environment, allow server to default to 1
      if (settings.videoStoragePath && process.platform === "win32" && osIsServer()) {
        return 1;
      }
    }
  } catch (e) {}
  return 2; // Clean default
}

/**
 * Detects if the current OS is a Windows Server.
 */
function osIsServer(): boolean {
  try {
    const os = require("os");
    const release = os.release().toLowerCase();
    const type = os.type().toLowerCase();
    // Windows Server releases usually contain specific keywords or we can default checking
    return type.includes("windows") && release.includes("server");
  } catch (e) {
    return false;
  }
}

/**
 * Updates the VMS scheduled task entry status once a download attempt is done.
 */
async function updateTaskStatus(taskId: string, success: boolean): Promise<void> {
  try {
    const { readScheduledRecordings, writeScheduledRecordings } = await import(
      "@/lib/scheduled-recordings-store"
    );
    const data = await readScheduledRecordings();
    const taskIndex = data.schedules?.findIndex((s: any) => s.id === taskId);
    if (taskIndex === -1) return;

    const task = data.schedules[taskIndex] as Record<string, unknown>;
    const isNonRecurring =
      !task.recurrence || task.recurrence === "none" || task.recurrence === "once";

    if (isNonRecurring) {
      if (success) {
        data.schedules.splice(taskIndex, 1);
        logger.info(`[FFmpegWorker] Non-recurring Task ${taskId} finished and REMOVED`);
      } else {
        task.status = "failed";
        logger.info(`[FFmpegWorker] Non-recurring Task ${taskId} marked as FAILED`);
      }
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
      task.startMs = nextDate.getTime();
      task.endMs = nextDate.getTime() + duration;

      logger.info(
        `[FFmpegWorker] Task ${taskId} is recurring. Rolled forward to ${task.date} and marked as pending`,
      );
    }

    await writeScheduledRecordings(data);
  } catch (err) {
    logger.error(`[FFmpegWorker] Failed to update task ${taskId} status:`, err);
  }
}

/**
 * Triggers a success/failure HTTP notification to the client interface.
 */
async function sendNotification(
  notificationUserKey: string,
  type: "success" | "error",
  title: string,
  message: string,
  payload: any
): Promise<void> {
  try {
    const port = process.env.PORT || global._nxAppPort || "3030";
    await fetch(`http://127.0.0.1:${port}/api/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: notificationUserKey || "admin",
        type,
        title,
        message,
        systemId: payload.systemId,
        deviceId: payload.deviceId,
        startTimeMs: payload.startTime,
        durationMs: payload.endTime - payload.startTime,
      }),
    });
  } catch (err) {
    // Silent catch, client notification port may not be active yet
  }
}

/**
 * Processes a single FFmpeg job.
 */
async function processJob(job: FFmpegJob): Promise<void> {
  const { id, payload, attempts } = job;
  const nextAttempt = attempts + 1;
  
  logger.info(`[FFmpegWorker] Starting job ${id} (Attempt ${nextAttempt}/${job.maxAttempts}) for camera=${payload.cameraName}`);
  
  await updateJobStatus(id, "processing", { attempts: nextAttempt });

  let videoResponse: Response;
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 120000); // 2-minute request timeout

  try {
    // Pulse Filtering: Skip saving if duration is under 10 seconds (likely just a momentary snapshot pulse)
    const durationMs = payload.endTime - payload.startTime;
    if (durationMs > 0 && durationMs < 10000) {
      logger.info(`[FFmpegWorker] Job ${id} skipped: Clip is a pulse (${Math.round(durationMs / 1000)}s)`);
      clearTimeout(fetchTimeout);
      
      await updateJobStatus(id, "completed");
      if (payload.taskId) {
        await updateTaskStatus(payload.taskId, true);
      }
      return;
    }

    // Build fresh headers for the VMS request
    const vmsHeaders: Record<string, string> = {
      "Accept": "application/json",
      ...payload.vmsHeaders
    };

    logger.info(`[FFmpegWorker] Fetching video stream from VMS: ${payload.downloadUrl.split("?")[0]}`);
    videoResponse = await fetch(payload.downloadUrl, { headers: vmsHeaders, signal: controller.signal });
    clearTimeout(fetchTimeout);

    if (!videoResponse.ok || !videoResponse.body) {
      const errText = await videoResponse.text().catch(() => "");
      throw new Error(`VMS fetch failed with HTTP ${videoResponse.status}: ${errText}`);
    }
  } catch (err: any) {
    clearTimeout(fetchTimeout);
    logger.error(`[FFmpegWorker] Fetch error for job ${id}:`, err.message || err);
    await handleJobFailure(job, err.message || "Fetch stream failed");
    return;
  }

  // Ensure target folder exists
  try {
    const targetDir = path.dirname(payload.savePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (err) {}

  // Spawn FFmpeg to convert and write file
  const ffmpegPath = getFfmpegPath();
  const ffmpegProcess = spawn(ffmpegPath, [
    "-fflags", "+genpts+igndts",
    "-avoid_negative_ts", "make_zero",
    "-i", "pipe:0",
    "-map", "0:v",
    "-c:v", "copy",
    "-map", "0:a?",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-max_muxing_queue_size", "1024",
    "-f", "mp4",
    "-y",
    payload.savePath,
  ], { windowsHide: true });

  ffmpegProcess.stdin.on("error", (e) => {
    logger.error(`[FFmpegWorker] Job ${id} FFmpeg stdin error:`, e.message);
  });

  ffmpegProcess.stderr.on("data", (data) => {
    const msg = data.toString();
    if (msg.includes("error") || msg.includes("Error")) {
      logger.error(`[FFmpegWorker] Job ${id} FFmpeg stderr:`, msg.trim());
    }
  });

  // Pipe raw HTTP response stream to FFmpeg stdin
  const inputStream = Readable.fromWeb(videoResponse.body as any);
  inputStream.pipe(ffmpegProcess.stdin);

  // Safety timeout: Terminate FFmpeg if it runs for over 5 minutes (prevents hung processes)
  const ffmpegSafetyTimeout = setTimeout(() => {
    if (ffmpegProcess.exitCode === null) {
      logger.warn(`[FFmpegWorker] Job ${id} FFmpeg process timed out, terminating: ${payload.savePath}`);
      ffmpegProcess.kill("SIGKILL");
    }
  }, 300000);

  return new Promise<void>((resolve) => {
    ffmpegProcess.on("close", async (code) => {
      clearTimeout(ffmpegSafetyTimeout);
      
      if (code !== 0) {
        logger.error(`[FFmpegWorker] Job ${id} FFmpeg exited with non-zero code ${code}`);
        await handleJobFailure(job, `FFmpeg process failed (exit code ${code})`);
      } else {
        logger.info(`[FFmpegWorker] Job ${id} completed successfully! Path: ${payload.savePath}`);
        await updateJobStatus(id, "completed");
        
        if (payload.taskId) {
          await updateTaskStatus(payload.taskId, true);
        }
        
        logRecordingEvent(`Auto-saved video: ${payload.cameraName}`);
        
        // Notify client
        if (payload.notificationUserKey) {
          sendNotification(
            payload.notificationUserKey,
            "success",
            "Video Auto-Saved",
            `Scheduled recording for ${payload.cameraName} is complete and stored locally.`,
            payload
          );
        }
      }
      resolve();
    });

    ffmpegProcess.on("error", async (err) => {
      clearTimeout(ffmpegSafetyTimeout);
      logger.error(`[FFmpegWorker] Job ${id} spawn error:`, err.message);
      await handleJobFailure(job, `FFmpeg spawn error: ${err.message}`);
      resolve();
    });
  });
}

/**
 * Handles job failure states and registers retries or final fail status.
 */
async function handleJobFailure(job: FFmpegJob, errorMessage: string): Promise<void> {
  const { id, attempts, maxAttempts, payload } = job;
  
  if (attempts < maxAttempts) {
    logger.warn(`[FFmpegWorker] Job ${id} failed but will be retried (Attempt ${attempts}/${maxAttempts}). Error: ${errorMessage}`);
    // Put back to pending so the worker processes it again on the next polling tick
    await updateJobStatus(id, "pending", { error: errorMessage });
  } else {
    logger.error(`[FFmpegWorker] Job ${id} failed definitively after ${attempts} attempts. Error: ${errorMessage}`);
    await updateJobStatus(id, "failed", { error: errorMessage });
    
    if (payload.taskId) {
      await updateTaskStatus(payload.taskId, false);
    }
    
    logRecordingEvent(`Failed auto-saving video for ${payload.cameraName}: ${errorMessage}`);
    
    if (payload.notificationUserKey) {
      sendNotification(
        payload.notificationUserKey,
        "error",
        "Video Auto-Save Failed",
        `Scheduled recording for ${payload.cameraName} failed: ${errorMessage}`,
        payload
      );
    }
  }
}

/**
 * Main polling iteration loop.
 */
async function workerLoop(): Promise<void> {
  if (global._ffmpegWorkerActive) return;
  global._ffmpegWorkerActive = true;

  try {
    // 1. Clean up old/stale jobs periodically
    await cleanupStaleJobs();

    // 2. Fetch all jobs to calculate active slot occupancy
    const queue = await loadQueue();
    const processingJobs = queue.filter((j) => j.status === "processing");
    const activeCount = processingJobs.length;
    
    const limit = getConcurrencyLimit();
    
    if (activeCount >= limit) {
      // Concurrency limit is fully saturated, skip this poll tick
      return;
    }

    const availableSlots = limit - activeCount;
    const pendingJobs = await getNextPendingJobs(availableSlots);

    if (pendingJobs.length > 0) {
      logger.info(`[FFmpegWorker] Poller: ${activeCount}/${limit} slots active. Processing ${pendingJobs.length} new jobs.`);
      // Run the next batch of jobs in parallel, matching the slot limit
      await Promise.all(pendingJobs.map((job) => processJob(job)));
    }
  } catch (err: any) {
    logger.error("[FFmpegWorker] Loop exception:", err.message || err);
  } finally {
    global._ffmpegWorkerActive = false;
  }
}

/**
 * Initializes and starts the background worker process loop.
 */
export function startFFmpegWorker(): void {
  // Prevent duplicate intervals on hot reloading
  if (global._ffmpegWorkerInterval) {
    return;
  }

  logger.info("[FFmpegWorker] Initializing persistent background job worker...");
  
  // Clean up any stale active flags left from crash/restart
  global._ffmpegWorkerActive = false;

  // Run the loop check every 5 seconds
  global._ffmpegWorkerInterval = setInterval(() => {
    workerLoop();
  }, 5000);

  // Trigger once immediately
  workerLoop();
}

/**
 * Stops the worker (useful for testing or shutdown).
 */
export function stopFFmpegWorker(): void {
  if (global._ffmpegWorkerInterval) {
    clearInterval(global._ffmpegWorkerInterval);
    global._ffmpegWorkerInterval = undefined;
    logger.info("[FFmpegWorker] Job worker stopped.");
  }
}
