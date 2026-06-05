import { logRecordingEvent } from "@/lib/recording-logger";
import { appendScheduledErrorLog } from "@/lib/scheduled-error-logs-store";

/** Writes to audit log and the user-visible scheduled error log store. */
export async function logScheduledRecordingError(input: {
  cameraId: string;
  cameraName: string;
  systemId?: string;
  message: string;
}): Promise<void> {
  logRecordingEvent(input.message);
  await appendScheduledErrorLog(input);
}
