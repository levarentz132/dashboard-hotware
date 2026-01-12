import { NextRequest, NextResponse } from "next/server";

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
  const systemToken = request.cookies.get(`nx-cloud-${systemId}`)?.value;
  const cookies = request.headers.get("cookie") || "";

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: cookies,
  };

  if (systemToken) {
    headers["Authorization"] = `Bearer ${systemToken}`;
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
  return {
    systemId: searchParams.get("systemId"),
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

    const response = await fetch(cloudUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });

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
  const { systemId, systemName, endpoint, body } = options;

  try {
    const cloudUrl = buildCloudUrl(systemId, endpoint);
    const headers = buildCloudHeaders(request, systemId);

    const response = await fetch(cloudUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 401 || response.status === 403) {
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!response.ok) {
      return createFetchErrorResponse(
        `Failed to post to ${systemName || systemId}`,
        systemId,
        systemName,
        response.status
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[Cloud API] Error posting ${endpoint} to ${systemName || systemId}:`, error);
    return createConnectionErrorResponse(systemId, systemName);
  }
}
