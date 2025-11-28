interface IMedia {
  id: string;
  format: "webm" | "mpegts" | "mpjpeg" | "mp4" | "mkv";
  resolution: string;
  NxCamera?: NxCamera;
}

export type { IMedia };
