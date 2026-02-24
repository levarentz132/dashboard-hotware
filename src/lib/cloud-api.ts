import { NextRequest, NextResponse } from "next/server";
import { getDynamicConfig } from "./config";

/**
 * Common interface for cloud API request options
 */
export interface CloudApiOptions {
  systemId: string;
  systemName?: string;
  endpoint: string;
  queryParams?: URLSearchParams;
}

/**
 * Standard error response structure
 */
export interface CloudApiError {
  error: string;
  systemId?: string;
  systemName?: string;
  requiresAuth?: boolean;
  status?: number;
}

/**
 * Build cloud relay URL with optional query parameters
 */
export function buildCloudUrl(systemId: string, endpoint: string, queryParams?: URLSearchParams): string {
  const baseUrl = `https://${systemId}.relay.vmsproxy.com${endpoint}`;
  return queryParams?.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;
}

/**
 * Build headers for cloud API request
 * Includes authorization token if available in cookies
 */
export function buildCloudHeaders(request: NextRequest, systemId: string): Record<string, string> {
  let systemToken = request.cookies.get(`nx-cloud-${systemId}`)?.value;

  // Fallback to Dynamic Config Token (from Electron headers or Env)
  if (!systemToken) {
    const dynamicConfig = getDynamicConfig(request);
    systemToken = dynamicConfig?.NX_CLOUD_TOKEN || process.env.NX_CLOUD_TOKEN;
  }

  const cookies = request.headers.get("cookie") || "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: cookies,
  };

  if (systemToken && systemToken !== 'undefined') {
    headers["Authorization"] = systemToken.toLowerCase().startsWith('bearer ')
      ? systemToken
      : `Bearer ${systemToken}`;
  }

  return headers;
}

/**
 * Create standard error response for auth failures
 */
export function createAuthErrorResponse(systemId: string, systemName?: string): NextResponse<CloudApiError> {
  return NextResponse.json(
    {
      error: "Authentication required",
      systemId,
      systemName: systemName || systemId,
      requiresAuth: true,
    },
    { status: 401 }
  );
}

/**
 * Create standard error response for fetch failures
 */
export function createFetchErrorResponse(
  message: string,
  systemId: string,
  systemName?: string,
  status: number = 500
): NextResponse<CloudApiError> {
  return NextResponse.json(
    {
      error: message,
      systemId,
      systemName: systemName || systemId,
      status,
    },
    { status }
  );
}

/**
 * Create standard error response for connection errors
 */
export function createConnectionErrorResponse(systemId: string, systemName?: string): NextResponse<CloudApiError> {
  return NextResponse.json(
    {
      error: `Connection error to ${systemName || systemId}`,
      systemId,
      systemName: systemName || systemId,
    },
    { status: 500 }
  );
}

/**
 * Validate required system ID parameter
 */
export function validateSystemId(request: NextRequest): { systemId: string | null; systemName: string | null } {
  const searchParams = request.nextUrl.searchParams;
  let systemId = searchParams.get("systemId");

  if (!systemId) {
    systemId = request.headers.get('x-electron-system-id');
  }

  return {
    systemId,
    systemName: searchParams.get("systemName"),
  };
}

/**
 * Generic cloud API fetch handler
 * Handles common patterns: auth, error handling, response parsing
 */
export async function fetchFromCloudApi<T>(
  request: NextRequest,
  options: CloudApiOptions
): Promise<NextResponse<T | CloudApiError>> {
  const { systemId, systemName, endpoint, queryParams } = options;

  try {
    const cloudUrl = buildCloudUrl(systemId, endpoint, queryParams);
    const headers = buildCloudHeaders(request, systemId);

    let response = await fetch(cloudUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    // Handle temporary redirects (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        response = await fetch(location, {
          method: "GET",
          headers,
        });
      }
    }

    // Handle 304 Not Modified
    if (response.status === 304) {
      return new NextResponse(null, {
        status: 304,
        headers,
      });
    }

    // Handle auth errors
    if (response.status === 401 || response.status === 403) {
      return createAuthErrorResponse(systemId, systemName);
    }

    // Handle other errors
    if (!response.ok) {
      return createFetchErrorResponse(
        `Failed to fetch from ${systemName || systemId}`,
        systemId,
        systemName,
        response.status
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[Cloud API] Error fetching ${endpoint} from ${systemName || systemId}:`, error);
    return createConnectionErrorResponse(systemId, systemName);
  }
}

/**
 * Generic cloud API POST handler
 */
export async function postToCloudApi<T>(
  request: NextRequest,
  options: CloudApiOptions & { body: unknown }
): Promise<NextResponse<T | CloudApiError>> {
  return requestCloudApi<T>(request, { ...options, method: "POST" });
}

/**
 * Generic cloud API PUT handler
 */
export async function putToCloudApi<T>(
  request: NextRequest,
  options: CloudApiOptions & { body: unknown }
): Promise<NextResponse<T | CloudApiError>> {
  return requestCloudApi<T>(request, { ...options, method: "PUT" });
}

/**
 * Generic cloud API PATCH handler
 */
export async function patchToCloudApi<T>(
  request: NextRequest,
  options: CloudApiOptions & { body: unknown }
): Promise<NextResponse<T | CloudApiError>> {
  return requestCloudApi<T>(request, { ...options, method: "PATCH" });
}

/**
 * Generic cloud API DELETE handler
 */
export async function deleteFromCloudApi<T>(
  request: NextRequest,
  options: CloudApiOptions
): Promise<NextResponse<T | CloudApiError>> {
  return requestCloudApi<T>(request, { ...options, method: "DELETE" });
}

/**
 * Internal generic request handler
 */
async function requestCloudApi<T>(
  request: NextRequest,
  options: CloudApiOptions & { method: string; body?: unknown }
): Promise<NextResponse<T | CloudApiError>> {
  const { systemId, systemName, endpoint, queryParams, method, body } = options;

  try {
    const cloudUrl = buildCloudUrl(systemId, endpoint, queryParams);
    const headers = buildCloudHeaders(request, systemId);

    let response = await fetch(cloudUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        response = await fetch(location, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      }
    }

    // Handle 304 Not Modified
    if (response.status === 304) {
      return new NextResponse(null, {
        status: 304,
        headers,
      });
    }

    if (response.status === 401 || response.status === 403) {
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!response.ok) {
      return createFetchErrorResponse(
        `Failed to ${method} to ${systemName || systemId}`,
        systemId,
        systemName,
        response.status
      );
    }

    // Some DELETE requests might not return JSON
    if (response.status === 204) {
      return NextResponse.json({ success: true } as unknown as T);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ success: true } as unknown as T);
  } catch (error) {
    console.error(`[Cloud API] Error ${method} ${endpoint} to ${systemName || systemId}:`, error);
    return createConnectionErrorResponse(systemId, systemName);
  }
}

