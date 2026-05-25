/**
 * Shared fetch defaults for dashboard API calls.
 */

import { getElectronHeaders } from "@/lib/config";

export interface ApiFetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

/**
 * Fetch with credentials and Electron proxy headers applied by default.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { headers: extraHeaders, ...rest } = options;

  return fetch(input, {
    credentials: "include",
    ...rest,
    headers: {
      ...getElectronHeaders(),
      ...extraHeaders,
    },
  });
}
