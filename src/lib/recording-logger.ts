import logger from "./logger";
import fs from "fs";
import path from "path";

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
