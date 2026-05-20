import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export interface FFmpegJob {
  id: string;
  type: "auto-save";
  status: "pending" | "processing" | "completed" | "failed";
  payload: {
    systemId: string;
    deviceId: string;
    cameraName: string;
    startTime: number;
    endTime: number;
    savePath: string;
    downloadUrl: string;
    vmsHeaders: Record<string, string>;
    taskId?: string;
    notificationUserKey?: string;
  };
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

const QUEUE_FILE = path.join(process.cwd(), "data", "ffmpeg_queue.json");

// Sequential promise chain to prevent concurrent file writes (race conditions)
let writeChain = Promise.resolve();

/**
 * Ensures directories exist.
 */
function ensureDataDir(): void {
  const dir = path.dirname(QUEUE_FILE);
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Loads the queue from disk. Strips BOM and handles empty/missing files gracefully.
 */
export async function loadQueue(): Promise<FFmpegJob[]> {
  ensureDataDir();
  if (!fsSync.existsSync(QUEUE_FILE)) {
    return [];
  }
  try {
    const raw = await fs.readFile(QUEUE_FILE, "utf-8");
    const sanitized = raw.replace(/^\uFEFF/, "").trim();
    if (!sanitized) return [];
    const data = JSON.parse(sanitized);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[FFmpegQueue] Failed to load queue file, returning empty array:", err);
    return [];
  }
}

/**
 * Persists the queue to disk safely using a sequential write chain.
 */
export async function saveQueue(jobs: FFmpegJob[]): Promise<void> {
  ensureDataDir();
  return new Promise((resolve, reject) => {
    writeChain = writeChain
      .then(async () => {
        try {
          const content = JSON.stringify(jobs, null, 2);
          await fs.writeFile(QUEUE_FILE, content, "utf-8");
          resolve();
        } catch (err) {
          console.error("[FFmpegQueue] Failed to write queue file:", err);
          reject(err);
        }
      })
      .catch((err) => {
        console.error("[FFmpegQueue] Write chain error:", err);
        resolve(); // Continue the chain even if one write fails
      });
  });
}

/**
 * Enqueues a new background FFmpeg conversion job.
 */
export async function enqueueJob(
  payload: FFmpegJob["payload"],
  maxAttempts = 3
): Promise<FFmpegJob> {
  const jobs = await loadQueue();
  
  // Deduplicate: if an identical job is already pending or processing, don't add it again
  const exists = jobs.some(
    (j) =>
      j.payload.deviceId === payload.deviceId &&
      j.payload.startTime === payload.startTime &&
      j.payload.endTime === payload.endTime &&
      (j.status === "pending" || j.status === "processing")
  );
  
  if (exists) {
    console.log(`[FFmpegQueue] Job already exists for device=${payload.deviceId} start=${payload.startTime}, skipping enqueue.`);
    const existingJob = jobs.find(
      (j) =>
        j.payload.deviceId === payload.deviceId &&
        j.payload.startTime === payload.startTime &&
        j.payload.endTime === payload.endTime
    );
    return existingJob!;
  }

  const newJob: FFmpegJob = {
    id: `job_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`,
    type: "auto-save",
    status: "pending",
    payload,
    attempts: 0,
    maxAttempts,
    createdAt: Date.now(),
  };

  jobs.push(newJob);
  await saveQueue(jobs);
  console.log(`[FFmpegQueue] Enqueued auto-save job ${newJob.id} for camera=${payload.cameraName}`);
  return newJob;
}

/**
 * Fetches the next pending jobs up to a limit.
 */
export async function getNextPendingJobs(limit = 1): Promise<FFmpegJob[]> {
  const jobs = await loadQueue();
  return jobs
    .filter((j) => j.status === "pending" && j.attempts < j.maxAttempts)
    .slice(0, limit);
}

/**
 * Updates a job's status and properties.
 */
export async function updateJobStatus(
  id: string,
  status: FFmpegJob["status"],
  updates: Partial<Omit<FFmpegJob, "id" | "status">> = {}
): Promise<void> {
  const jobs = await loadQueue();
  const index = jobs.findIndex((j) => j.id === id);
  if (index === -1) {
    console.warn(`[FFmpegQueue] Job ${id} not found for status update to ${status}`);
    return;
  }

  const job = jobs[index];
  job.status = status;
  
  if (status === "processing" && !job.startedAt) {
    job.startedAt = Date.now();
  }
  if ((status === "completed" || status === "failed") && !job.completedAt) {
    job.completedAt = Date.now();
  }
  
  Object.assign(job, updates);
  await saveQueue(jobs);
}

/**
 * Fetches a single job by ID.
 */
export async function getJob(id: string): Promise<FFmpegJob | null> {
  const jobs = await loadQueue();
  return jobs.find((j) => j.id === id) || null;
}

/**
 * Cleans up stale jobs (e.g. processing for more than 1 hour, or older completed/failed jobs).
 */
export async function cleanupStaleJobs(): Promise<void> {
  const jobs = await loadQueue();
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  const activeJobs: FFmpegJob[] = [];
  let changed = false;

  for (const job of jobs) {
    const isStaleProcessing = job.status === "processing" && job.startedAt && now - job.startedAt > oneHour;
    const isOldCompletedOrFailed = (job.status === "completed" || job.status === "failed") && job.completedAt && now - job.completedAt > oneDay;

    if (isStaleProcessing) {
      console.log(`[FFmpegQueue] Cleaning up stale processing job ${job.id} (marking as failed)`);
      job.status = "failed";
      job.error = "Stale process timeout (exceeded 1 hour)";
      job.completedAt = now;
      activeJobs.push(job);
      changed = true;
    } else if (isOldCompletedOrFailed) {
      // Exclude older finished jobs from the active queue array to keep the file size minimal
      console.log(`[FFmpegQueue] Pruning old job ${job.id} from queue file`);
      changed = true;
    } else {
      activeJobs.push(job);
    }
  }

  if (changed) {
    await saveQueue(activeJobs);
  }
}
