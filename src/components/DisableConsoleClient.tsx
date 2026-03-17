"use client";
import { useEffect } from "react";

export default function DisableConsoleClient() {
  useEffect(() => {
    try {
      const methods = ["log", "info", "warn", "error", "debug", "trace", "table"] as const;
      methods.forEach((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (console as any)[m] = () => {};
      });
    } catch (e) {
      // ignore
    }
  }, []);

  return null;
}
