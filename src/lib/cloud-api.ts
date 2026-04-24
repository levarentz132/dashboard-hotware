import logger from "./logger";
import { NextRequest, NextResponse } from "next/server";
import { getDynamicConfig, getCloudAuthHeader, API_CONFIG } from "./config";

// Disable SSL certificate validation for local/VMS requests as they are usually self-signed
if (process.env.NODE_ENV === "development" || process.env.ALLOW_SELF_SIGNED === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

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

export function getBasicAuthHeaderFromRequest(request: NextRequest): string | null {
  const headerUsername = request.headers.get("x-basic-username") || undefined;
  const headerPassword = request.headers.get("x-basic-password") || undefined;

  if (headerUsername && headerPassword) {
    const fromHeaders = Buffer.from(`${headerUsername}:${headerPassword}`, "utf-8").toString("base64");
    return `Basic ${fromHeaders}`;
  }

  const existingAuthorization = request.headers.get("authorization");
  if (existingAuthorization && existingAuthorization.toLowerCase().startsWith("basic ")) {
    return existingAuthorization;
  }

  const dynamicConfig = getDynamicConfig(request);
  const username = dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME;
  const password = dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD;

  if (!username || !password) return null;

  const base64Credentials = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
  return `Basic ${base64Credentials}`;
}

export function getCloudCredentials(request: NextRequest) {
  const dynamicConfig = getDynamicConfig(request);
  return {
    username: dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME,
    password: dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD,
  };
}

export function buildCloudUrl(systemId: string, endpoint: string, queryParams?: URLSearchParams, request?: NextRequest, systemName?: string): string {
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

  // 2. Identify if this is a local system
  const isDirectAddress = cleanId === 'localhost' ||
    cleanId === '127.0.0.1' ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(cleanId) ||
    cleanId.includes(':');

  let isConfiguredLocal = !!(cleanId === localSysId && API_CONFIG.serverHost);

  // Check cookies or watchdog headers for local system match
  if (!isDirectAddress && !isConfiguredLocal && request) {
    const localId = request.cookies.get("nx_system_id")?.value ||
      request.cookies.get("nx_server_id")?.value;
    const headerIp = request.headers.get("x-nx-location-ip");
    
    if (localId && localId.toLowerCase().replace(/[{}]/g, "") === cleanId) {
      isConfiguredLocal = true;
    } else if (headerIp) {
      // If a watchdog location header is present, we treat it as a local-reachable system
      isConfiguredLocal = true;
    }
  }

  // 2b. Check System Name for "Local" markers if ID match failed
  if (!isConfiguredLocal && systemName?.toLowerCase().includes("local server")) {
    isConfiguredLocal = true;
  }

  if (isDirectAddress || isConfiguredLocal) {
    // Resolve host and port
    // If it's a loopback/direct address, we use it as base host, but STILL allow cookie/config overrides
    let host = (isDirectAddress && cleanId !== 'localhost' && cleanId !== '127.0.0.1') 
      ? cleanId 
      : (API_CONFIG.serverHost || 'localhost');
    
    if (host === 'localhost' && !isDirectAddress && cleanId !== 'localhost') {
      console.warn(`[Cloud API] Falling back to localhost for system ${cleanId}. This may fail if VMS is remote.`);
    }
    
    let port = API_CONFIG.serverPort || '7001';

    // If redirected via cookie or watchdog header (no cookies in server-to-server calls)
    if (request) {
      const cookieIp = request.cookies.get("nx_location_ip")?.value;
      const cookiePort = request.cookies.get("nx_location_port")?.value;
      
      const dynamicConfig = getDynamicConfig(request);
      const headerIp = request.headers.get("x-nx-location-ip") || dynamicConfig?.NEXT_PUBLIC_NX_SERVER_HOST;
      const headerPort = request.headers.get("x-nx-location-port") || dynamicConfig?.NEXT_PUBLIC_NX_SERVER_PORT;
      
      const effectiveIp = cookieIp || headerIp;
      const effectivePort = cookiePort || headerPort;
      if (effectiveIp) host = effectiveIp;
      if (effectivePort) port = effectivePort;
    }

    // If host already contains a port, don't override it
    if (host.includes(':')) {
      const parts = host.split(':');
      host = parts[0];
      port = parts[1] || port;
    }

    // Determine protocol: default https for everything EXCEPT local/direct addresses
    // which we'll try with http first if they're not on the standard HTTPS port
    let protocol = 'https';
    if (isDirectAddress) {
      if (port !== '7001') {
        protocol = 'http';
      } else {
        // Port 7001 is technically HTTPS by default in NX Witness.
        // If we use HTTP to an HTTPS port, we get ECONNRESET.
        protocol = 'https'; 
      }
    }

    const hostWithPort = `${host}:${port}`;
    const baseUrl = `${protocol}://${hostWithPort}${endpoint}`;

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

  // 1. Always check for a session token regardless of whether it's global or local system
  // (Standard practice: try system-specific first, then fall back to generic local user session)
  if (systemId) {
    const cleanId = systemId.replace(/[{}]/g, "");
    const bracedId = `{${cleanId}}`;

    localToken = request.cookies.get(`nx-cloud-${cleanId}`)?.value ||
      request.cookies.get(`nx-cloud-${bracedId}`)?.value ||
      request.cookies.get(`nx-cloud-${systemId}`)?.value;
  }

  // Fallback to global local session if system-specific is missing or for global 'all' calls
  if (!localToken || localToken === 'undefined') {
    const localUserCookie = request.cookies.get("local_nx_user")?.value;
    if (localUserCookie) {
      try {
        const user = JSON.parse(decodeURIComponent(localUserCookie));
        if (user.token) {
          localToken = user.token;
        }
      } catch (e) { }
    }
  }

  // Last-resort fallback: watchdog server-to-server calls pass auth via custom header
  // because no browser cookies are available in those requests.
  if (!localToken || localToken === 'undefined') {
    const watchdogAuth = request.headers.get("x-watchdog-auth");
    if (watchdogAuth) {
      localToken = watchdogAuth;
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
  if (isGlobal) {
    // For global calls (e.g. /api/systems list or systemId=all), ALWAYS prefer the Cloud token (nxvms.com OAuth)
    if (cloudAuth && cloudAuth !== 'undefined') {
      headers["Authorization"] = cloudAuth.toLowerCase().startsWith('bearer ')
        ? cloudAuth
        : `Bearer ${cloudAuth}`;
    } else if (localToken && localToken !== 'undefined') {
      const rawToken = localToken.toLowerCase().startsWith('bearer ')
        ? localToken.substring(7).trim()
        : localToken.trim();
      headers["Authorization"] = `Bearer ${rawToken}`;
    }
  } else if (localToken && localToken !== 'undefined' && localToken !== 'SERVER_MANAGED') {
    const rawToken = localToken.toLowerCase().startsWith('bearer ')
      ? localToken.substring(7).trim()
      : localToken.trim();

    headers["x-runtime-guid"] = rawToken;
    if (!headers["Authorization"] || isLocal) {
      headers["Authorization"] = `Bearer ${rawToken}`;
    }
  } else if (cloudAuth && cloudAuth !== 'undefined' && cloudAuth !== 'SERVER_MANAGED') {
    headers["Authorization"] = cloudAuth.toLowerCase().startsWith('bearer ')
      ? cloudAuth
      : `Bearer ${cloudAuth}`;
  } else {
    // 3. SERVER-SIDE FALLBACK (Shared Credentials)
    // If no client-side session token is found, fallback to the server's own credentials
    const basicAuth = getBasicAuthHeaderFromRequest(request);
    if (basicAuth) {
      headers["Authorization"] = basicAuth;
    } else {
      console.warn(`[Cloud Auth] No session or shared credentials found for ${systemId}`);
      const cookies = request.headers.get("cookie") || "";
      if (cookies) {
        headers.Cookie = cookies;
      }
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
    { status: 403 }
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

  // If systemId is a loopback/local placeholder, try to use the preconfigured host as the systemId
  if ((systemId === "127.0.0.1" || systemId === "localhost") && API_CONFIG.serverHost) {
    systemId = API_CONFIG.serverHost;
  }

  // Always clean brackets from systemId
  const cleanSystemId = systemId ? systemId.replace(/[{}]/g, "") : null;

  return {
    systemId: cleanSystemId,
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
    const cloudUrl = buildCloudUrl(systemId, endpoint, queryParams, request, systemName);
    const headers = buildCloudHeaders(request, systemId, preferCloudAuth);
    const basicAuthHeader = getBasicAuthHeaderFromRequest(request);

    // Allow per-source basic auth to drive requests when cloud/GUID tokens are unavailable.
    if (!headers["Authorization"] && !headers["x-runtime-guid"] && basicAuthHeader) {
      headers["Authorization"] = basicAuthHeader;
    }

    // Stop calling if there's no auth material for a cloud request
    const isGlobal = (systemId || '').trim().toLowerCase() === 'all';
    const isCloudBound = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
    const hasAuth = !!(headers["Authorization"] || headers["x-runtime-guid"] || basicAuthHeader);

    // For cloud-bound URLs, we need a real NX Cloud OAuth token — a local VMS session
    // token will always be rejected with 403. Skip the call entirely if we only have local creds.
    const cloudAuthToken = getCloudAuthHeader(request);
    if (isCloudBound && !cloudAuthToken) {
      logger.debug(`[Cloud API] Skipping cloud call to ${endpoint} — no NX Cloud token available (local NVR mode).`);
      return createAuthErrorResponse(systemId, systemName);
    }

    // Only block if it looks like a cloud-bound request (nxvms.com or vmsproxy.com)
    if (!hasAuth && isCloudBound) {
      return createAuthErrorResponse(systemId, systemName);
    }

    logger.debug(`[Cloud API] Fetching GET ${cloudUrl}`);

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

    // Check if this is an NX server endpoint (REST v3/v4 or legacy /api)
    const isNxEndpoint = endpoint.startsWith("/rest/v3") || endpoint.startsWith("/rest/v4") || endpoint.startsWith("/api/");
    // isCloudBound already declared above
    const isRelay = cloudUrl.includes(".relay.vmsproxy.com");
    
    // We retry for relay connections or local direct connections (non-cloud bound)
    const isLocalOrRelay = isRelay || !isCloudBound || (systemName?.toLowerCase().includes("local server"));

    // Retry once with Basic auth when session token is rejected
    if ((response.status === 401 || response.status === 403) && (isNxEndpoint || isLocalOrRelay)) {
      if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: basicAuthHeader,
        };
        // Remove potentially conflicting session headers
        delete retryHeaders["x-runtime-guid"];
        delete retryHeaders["x-nx-session"];
        delete retryHeaders["x-runtime-session-guid"];

        logger.debug(`[Cloud API] Session rejected. Retrying with Basic auth for ${systemName || systemId} (${endpoint})`);
        response = await fetch(cloudUrl, {
          method: "GET",
          headers: retryHeaders,
          redirect: "manual",
        });

        // If still 401/403 after retry, then return the auth error
        if (response.status === 401 || response.status === 403) {
          return createAuthErrorResponse(systemId, systemName);
        }
      } else {
        logger.debug(`[Cloud API] Auth failed for ${systemId} (no Basic credentials). Expected if not using NX Cloud.`);
        return createAuthErrorResponse(systemId, systemName);
      }
    } else if (response.status === 401 || response.status === 403) {
      return createAuthErrorResponse(systemId, systemName);
    }


    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      if ([502, 503, 504].includes(status)) {
        console.warn(`[Cloud API] System '${systemName || systemId}' is likely offline or unreachable via NX Cloud Relay (${status}). skipping detailed error.`);
      } else {
        console.warn(`[Cloud API] Error (${status}) for ${cloudUrl}:`, errorText);
      }

      return createFetchErrorResponse(
        `Failed to fetch from ${systemName || systemId}`,
        systemId,
        systemName,
        status
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
    const cloudUrl = buildCloudUrl(systemId, endpoint, queryParams, request, systemName);
    const headers = buildCloudHeaders(request, systemId, preferCloudAuth);
    const basicAuthHeader = getBasicAuthHeaderFromRequest(request);

    // Stop calling if there's no auth material for a cloud request
    const isCloudBound2 = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
    const hasAuth = !!(headers["Authorization"] || headers["x-runtime-guid"]);

    // For cloud-bound URLs, require a real NX Cloud OAuth token
    const cloudAuthToken2 = getCloudAuthHeader(request);
    if (isCloudBound2 && !cloudAuthToken2) {
      // logger.debug(`[Cloud API] Skipping cloud ${method} to ${endpoint} — no NX Cloud token available.`);
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!hasAuth && isCloudBound2) {
      return createAuthErrorResponse(systemId, systemName);
    }

    // logger.debug(`[Cloud API] Requesting ${method} ${cloudUrl}`);

    let response = await fetch(cloudUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location) {
        // logger.debug(`[Cloud API] Redirecting to ${location}`);
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

    // Check if this is an NX server endpoint (REST v3/v4 or legacy /api)
    const isNxEndpoint = endpoint.startsWith("/rest/v3") || endpoint.startsWith("/rest/v4") || endpoint.startsWith("/api/");
    const isCloudBound = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
    const isRelay = cloudUrl.includes(".relay.vmsproxy.com");
    const isLocalOrRelay = isRelay || !isCloudBound || (systemName?.toLowerCase().includes("local server"));

    // Retry once with Basic auth when session token is rejected
    if ((response.status === 401 || response.status === 403) && (isNxEndpoint || isLocalOrRelay)) {
      if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: basicAuthHeader,
        };
        // Remove potentially conflicting session headers
        delete retryHeaders["x-runtime-guid"];
        delete retryHeaders["x-nx-session"];
        delete retryHeaders["x-runtime-session-guid"];

        // logger.debug(`[Cloud API] Session rejected for ${method}. Retrying with Basic auth for ${systemName || systemId} (${endpoint})`);
        response = await fetch(cloudUrl, {
          method,
          headers: retryHeaders,
          body: body ? JSON.stringify(body) : undefined,
          redirect: "manual",
        });
        
        // If still 401/403 after retry, then return the auth error
        if (response.status === 401 || response.status === 403) {
          return createAuthErrorResponse(systemId, systemName);
        }
      } else {
        return createAuthErrorResponse(systemId, systemName);
      }
    } else if (response.status === 401 || response.status === 403) {
      const errorText = await response.clone().text();
      console.warn(`[Cloud API] Auth error (${response.status}) for ${cloudUrl}:`, errorText);
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      if ([502, 503, 504].includes(status)) {
        console.warn(`[Cloud API] System '${systemName || systemId}' is likely offline or unreachable via NX Cloud Relay (${status}). skipping detailed error.`);
      } else {
        console.warn(`[Cloud API] Error (${status}) for ${cloudUrl}:`, errorText);
      }

      return createFetchErrorResponse(
        `Failed to ${method} to ${systemName || systemId}`,
        systemId,
        systemName,
        status
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
        const text = await response.clone().text();
        console.warn(`[Cloud API] Raw response body:`, text.substring(0, 500));
        return createFetchErrorResponse("Invalid JSON response from cloud", systemId, systemName, 502);
      }
    }

    const text = await response.text();
    return NextResponse.json({ success: true, message: "Request successful (non-JSON)" } as unknown as T);
  } catch (error) {
    console.error(`[Cloud API] Error ${method} ${endpoint} to ${systemName || systemId}:`, error);
    return createConnectionErrorResponse(systemId, systemName);
  }
}
