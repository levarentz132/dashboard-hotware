import { NextRequest, NextResponse } from "next/server";
import { getDynamicConfig, getCloudAuthHeader, API_CONFIG } from "./config";

/**
 * Common interface for cloud API request options
 */
export interface CloudApiOptions {
  systemId: string;
  systemName?: string;
  endpoint: string;
  queryParams?: URLSearchParams;
  /** If true, always use the cloud Bearer token instead of the local GUID session token.
   *  Use this for relay endpoints (e.g. /api/auditLog) that authenticate via cloud OAuth. */
  preferCloudAuth?: boolean;
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
  const id = (systemId || API_CONFIG.systemId)?.trim().toLowerCase();
  const cleanId = id?.replace(/[{}]/g, "");
  const localSysId = API_CONFIG.systemId?.trim().toLowerCase().replace(/[{}]/g, "");

  // 1. Handle global 'all' systems list
  if (cleanId === 'all') {
    const actualEndpoint = (endpoint === '/rest/v3/system/info' || endpoint === '/api/system/info')
      ? '/api/systems/'
      : endpoint;
    const baseUrl = `https://nxvms.com${actualEndpoint}`;
    return queryParams?.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;
  }

  // 2. Handle local addresses (IPs, localhost, or URLs with ports)
  const isAddress = cleanId === 'localhost' ||
    cleanId === '127.0.0.1' ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(cleanId) ||
    cleanId.includes(':');

  // Also check if this matches the configured local system and we have a local host
  const isConfiguredLocal = cleanId === localSysId && API_CONFIG.serverHost;

  if (isAddress || isConfiguredLocal) {
    // If it's the configured local system, use the serverHost and serverPort
    const host = isAddress ? cleanId : (API_CONFIG.serverPort ? `${API_CONFIG.serverHost}:${API_CONFIG.serverPort}` : API_CONFIG.serverHost);

    // Nx Witness usually uses 7001 for HTTPS. If port 7001 is specified, default to https.
    // Use http only for other explicit ports or if it's explicitly 127.0.0.1 without a port.
    const protocol = host.includes(':7001') ? 'https' : (host.startsWith('127.0.0.1') && !host.includes(':') ? 'http' : 'https');
    const finalHost = host.startsWith('http') ? host : `${protocol}://${host}`;

    const baseUrl = `${finalHost}${endpoint}`;
    return queryParams?.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;
  }

  // 3. Handle cloud relay addresses
  const baseUrl = `https://${cleanId}.relay.vmsproxy.com${endpoint}`;
  return queryParams?.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;
}

/**
 * Build headers for cloud API request
 * Includes authorization token if available in cookies
 */
export function buildCloudHeaders(request: NextRequest, systemId: string, preferCloudAuth?: boolean): Record<string, string> {
  const id = systemId?.trim().toLowerCase();
  const isGlobal = id === 'all';
  const cloudAuth = getCloudAuthHeader(request);
  let localToken: string | undefined;

  // 1. For system-specific calls, try to find a GUID session token
  if (!isGlobal && systemId) {
    // Try both with and without curly braces
    const cleanId = systemId.replace(/[{}]/g, "");
    const bracedId = `{${cleanId}}`;

    localToken = request.cookies.get(`nx-cloud-${cleanId}`)?.value ||
      request.cookies.get(`nx-cloud-${bracedId}`)?.value ||
      request.cookies.get(`nx-cloud-${systemId}`)?.value;

    // Fallback to global local session if system-specific is missing
    if (!localToken || localToken === 'undefined') {
      const localUserCookie = request.cookies.get("local_nx_user")?.value;
      if (localUserCookie) {
        try {
          const user = JSON.parse(decodeURIComponent(localUserCookie));
          if (user.token) {
            localToken = user.token;
            console.log(`[Cloud Auth] Found fallback token from local_nx_user cookie for ${systemId}`);
          }
        } catch (e) { }
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (!isGlobal && systemId) {
    const cleanId = systemId.replace(/[{}]/g, "");
    headers["x-nx-system-id"] = cleanId;
    headers["x-fms-system-id"] = cleanId;
  }

  // Check if systemId is a local address
  const isLocal = id === 'localhost' ||
    id === '127.0.0.1' ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(id) ||
    id.includes(':');

  // 2. Assign headers based on token type
  // Always prefer local token (x-runtime-guid) if available, per user request
  if (!isGlobal && localToken && localToken !== 'undefined') {
    // Relay/Local Call + GUID session -> Use x-runtime-guid
    const rawToken = localToken.toLowerCase().startsWith('bearer ')
      ? localToken.substring(7).trim()
      : localToken.trim();

    headers["x-runtime-guid"] = rawToken;
    console.log(`[Cloud Auth] Using LOCAL (GUID) token for ${systemId}`);

    // Some relays also want the cloud token for authorized routing, 
    // but the actual VMS request uses x-runtime-guid
    if (cloudAuth && !isLocal) {
      headers["Authorization"] = cloudAuth.toLowerCase().startsWith('bearer ')
        ? cloudAuth
        : `Bearer ${cloudAuth}`;
      console.log(`[Cloud Auth] Also providing CLOUD token for relay routing to ${systemId}`);
    }
  } else if (cloudAuth && cloudAuth !== 'undefined') {
    // Global call (must be Bearer) OR fallback for relay
    headers["Authorization"] = cloudAuth.toLowerCase().startsWith('bearer ')
      ? cloudAuth
      : `Bearer ${cloudAuth}`;

    console.log(`[Cloud Auth] Using CLOUD (Bearer) token fallback for ${systemId}`);
  } else {
    // 3. Last resort fallback to cookies
    const cookies = request.headers.get("cookie") || "";
    if (cookies) {
      headers.Cookie = cookies;
    }
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
  const { systemId, systemName, endpoint, queryParams, preferCloudAuth } = options;

  try {
    const cloudUrl = buildCloudUrl(systemId, endpoint, queryParams);
    const headers = buildCloudHeaders(request, systemId, preferCloudAuth);

    console.log(`[Cloud API] Fetching GET ${cloudUrl}`);

    let response = await fetch(cloudUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    // Handle temporary redirects (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        console.log(`[Cloud API] Redirecting to ${location}`);
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
      const errorText = await response.text();
      console.warn(`[Cloud API] Auth error (${response.status}) for ${cloudUrl}:`, errorText);
      return createAuthErrorResponse(systemId, systemName);
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Cloud API] Error (${response.status}) for ${cloudUrl}:`, errorText);
      return createFetchErrorResponse(
        `Failed to fetch from ${systemName || systemId}`,
        systemId,
        systemName,
        response.status
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        const data = await response.json();
        return NextResponse.json(data);
      } catch (e) {
        console.error(`[Cloud API] JSON Parse Error for ${cloudUrl}:`, e);
        const text = await response.clone().text();
        console.warn(`[Cloud API] Raw response body:`, text.substring(0, 500));
        return createFetchErrorResponse("Invalid JSON response from cloud", systemId, systemName, 502);
      }
    }

    const text = await response.text();
    console.warn(`[Cloud API] Non-JSON response from ${cloudUrl}:`, text.substring(0, 200));
    return NextResponse.json({ success: true, message: "Request successful (non-JSON)" } as unknown as T);
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
  const { systemId, systemName, endpoint, queryParams, method, body, preferCloudAuth } = options;

  try {
    const cloudUrl = buildCloudUrl(systemId, endpoint, queryParams);
    const headers = buildCloudHeaders(request, systemId, preferCloudAuth);

    console.log(`[Cloud API] Requesting ${method} ${cloudUrl}`);

    let response = await fetch(cloudUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        console.log(`[Cloud API] Redirecting to ${location}`);
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
      const errorText = await response.clone().text();
      console.warn(`[Cloud API] Auth error (${response.status}) for ${cloudUrl}:`, errorText);
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Cloud API] Error (${response.status}) for ${cloudUrl}:`, errorText);
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
      try {
        const data = await response.json();
        return NextResponse.json(data);
      } catch (e) {
        console.error(`[Cloud API] JSON Parse Error for ${cloudUrl}:`, e);
        const text = await response.clone().text();
        console.warn(`[Cloud API] Raw response body:`, text.substring(0, 500));
        return createFetchErrorResponse("Invalid JSON response from cloud", systemId, systemName, 502);
      }
    }

    const text = await response.text();
    console.warn(`[Cloud API] Non-JSON response from ${cloudUrl}:`, text.substring(0, 200));
    return NextResponse.json({ success: true, message: "Request successful (non-JSON)" } as unknown as T);
  } catch (error) {
    console.error(`[Cloud API] Error ${method} ${endpoint} to ${systemName || systemId}:`, error);
    return createConnectionErrorResponse(systemId, systemName);
  }
}
