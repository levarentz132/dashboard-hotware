/**
 * Parse error from various error types.
 */
export function parseError(err: unknown, defaultMessage: string = "An error occurred"): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return defaultMessage;
}
