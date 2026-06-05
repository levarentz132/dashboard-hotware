import logger from "./logger";
import fs from "fs";
import path from "path";
import {
  sortRecordingLogsNewestFirst,
  type RecordingLogEntry,
} from "./recording-log-utils";

export type { RecordingLogEntry };

const LOG_FILE = path.join(process.cwd(), "data", "main.log");

/**
 * Formats a date to: DD Mon YYYY HH:mm:ss
 * Example: 21 Apr 2026 11:59:55
 */
export function formatAuditDate(date: Date | string | number = new Date()): string {
  const dObj = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = dObj.getDate().toString().padStart(2, "0");
  const month = months[dObj.getMonth()];
  const year = dObj.getFullYear();
  const hours = dObj.getHours().toString().padStart(2, "0");
  const mins = dObj.getMinutes().toString().padStart(2, "0");
  const secs = dObj.getSeconds().toString().padStart(2, "0");
  
  return `${day} ${month} ${year} ${hours}:${mins}:${secs}`;
}

/**
 * Appends a detailed audit log entry to data/main.log
 */
export function logRecordingEvent(message: string) {
  try {
    const formattedTime = formatAuditDate(new Date());
    const logLine = `(${formattedTime}) ${message}\n`;
    
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(LOG_FILE, logLine);
    // Also log to console for visibility in main logs (but hidden in terminal)
    logger.debug(`[AuditLog] ${message}`);
  } catch (err) {
    console.error("Failed to write recording audit log:", err);
  }
}

const LOG_LINE_RE = /^\((\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2})\)\s+(.+)$/;
const ERROR_LOG_RE = /\bfailed\b|\berror\b|\bunable\b/i;

function isErrorLogMessage(message: string): boolean {
  return ERROR_LOG_RE.test(message);
}

function parseLogLines(raw: string): RecordingLogEntry[] {
  const entries: RecordingLogEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(LOG_LINE_RE);
    if (match) {
      entries.push({ timestamp: match[1], message: match[2] });
    }
  }
  return entries;
}

/**
 * Reads recent recording audit log entries (newest first).
 * Optionally filters to error-related lines and/or a camera name substring.
 */
export function readRecordingLogs(options?: {
  limit?: number;
  cameraName?: string;
  errorsOnly?: boolean;
  maxReadBytes?: number;
}): RecordingLogEntry[] {
  const {
    limit = 50,
    cameraName,
    errorsOnly = true,
    maxReadBytes = 256 * 1024,
  } = options ?? {};

  try {
    if (!fs.existsSync(LOG_FILE)) return [];

    const stat = fs.statSync(LOG_FILE);
    const readSize = Math.min(stat.size, maxReadBytes);
    const start = Math.max(0, stat.size - readSize);
    const fd = fs.openSync(LOG_FILE, "r");
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, start);
    fs.closeSync(fd);

    let entries = parseLogLines(buffer.toString("utf8"));
    if (errorsOnly) {
      entries = entries.filter((e) => isErrorLogMessage(e.message));
    }
    if (cameraName) {
      const needle = cameraName.toLowerCase();
      entries = entries.filter((e) => e.message.toLowerCase().includes(needle));
    }

    return sortRecordingLogsNewestFirst(entries).slice(0, limit);
  } catch (err) {
    console.error("Failed to read recording audit log:", err);
    return [];
  }
}
