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
    timeOffsetMs?: number;
  };
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  disabled?: boolean;
}

