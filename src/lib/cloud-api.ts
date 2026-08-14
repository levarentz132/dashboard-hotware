import logger from "./logger";
import { NextRequest, NextResponse } from "next/server";
import { getDynamicConfig, getCloudAuthHeader, API_CONFIG } from "./config";
import { isCacheableNxEndpoint } from "@/lib/redis/nx-cache-policy";
import {
  afterCloudApiGetCached,
  afterCloudApiMutation,
  cloudApiGetCacheKey,
  getAuthFingerprint,
  readCloudApiCache,
  singleFlightNxRequest,
  type CloudApiCacheEntry,
} from "@/lib/redis/nx-api-cache";
import { readCloudSystemsList } from "@/lib/cloud-systems-store";
import { isCloudSystemsEndpoint } from "@/lib/redis/nx-cache-policy";
import { getVmsSessionToken, invalidateVmsSessionToken } from "@/lib/vms-auth";
import https from "https";
import http from "http";

// Stable HTTP client for local/NVR network requests to bypass Undici socket reset issues
function stableLocalRequest(urlStr: string, options: any): Promise<Response> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === "https:";
      const lib = isHttps ? https : http;
      
      const reqHeaders = { ...options.headers };
      delete reqHeaders['host'];
      delete reqHeaders['content-length'];
      delete reqHeaders['connection'];

      const reqOptions: https.RequestOptions = {
        method: options.method || "GET",
        headers: reqHeaders,
        rejectUnauthorized: false,
        agent: false, // Disable pooling to ensure clean connection closure
      };
      
      const req = lib.request(urlStr, reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const responseHeaders = new Headers();
          Object.entries(res.headers).forEach(([k, v]) => {
            if (Array.isArray(v)) {
              v.forEach(val => responseHeaders.append(k, val));
            } else if (v) {
              responseHeaders.set(k, v);
            }
          });
          
          resolve(new Response(body, {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: responseHeaders,
          }));
        });
      });
      
      req.on("error", (err) => {
        reject(err);
      });
      
      req.setTimeout(25000, () => {
        req.destroy(new Error("Timeout"));
      });
      
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Wrapper to intercept local requests and execute them stably
async function customFetch(url: string, options: any): Promise<Response> {
  const isLocal = url.includes("localhost") || 
                  url.includes("127.0.0.1") || 
                  /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/.test(url);
  if (isLocal) {
    try {
      return await stableLocalRequest(url, options);
    } catch (err) {
      console.warn(`[stableLocalRequest] Failed, falling back to standard fetch:`, err);
    }
  }
  return globalThis.fetch(url, options);
}

const fetch = customFetch;

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

  let isConfiguredLocal = !!(cleanId && cleanId === localSysId && API_CONFIG.serverHost) || (!cleanId && !!API_CONFIG.serverHost);

  // Check cookies or watchdog headers for local system match
  if (!isDirectAddress && !isConfiguredLocal && request && cleanId) {
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
    let host = (isDirectAddress && cleanId !== 'localhost' && cleanId !== '127.0.0.1' && cleanId) 
      ? cleanId 
      : (API_CONFIG.serverHost || 'localhost');
    
    if (host === 'localhost' && !isDirectAddress && cleanId !== 'localhost') {
      // console.warn(`[Cloud API] Falling back to localhost for system ${cleanId}. This may fail if VMS is remote.`);
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
  if (isLocal) {
    headers["Connection"] = "close";
  }

  // Priority 1: If cloudAuth is available, set Authorization header for cloud/relay routing
  if (cloudAuth && cloudAuth !== 'undefined' && cloudAuth !== 'SERVER_MANAGED') {
    headers["Authorization"] = cloudAuth.toLowerCase().startsWith('bearer ')
      ? cloudAuth
      : `Bearer ${cloudAuth}`;
  }

  // Priority 2: If localToken is available, set x-runtime-guid for VMS server auth (and fallback Authorization if local or no cloudAuth)
  if (localToken && localToken !== 'undefined' && localToken !== 'SERVER_MANAGED') {
    const rawToken = localToken.toLowerCase().startsWith('bearer ')
      ? localToken.substring(7).trim()
      : localToken.trim();

    headers["x-runtime-guid"] = rawToken;
    if (!headers["Authorization"] || isLocal) {
      headers["Authorization"] = `Bearer ${rawToken}`;
    }
  }

  // Priority 3: Fallback to basic auth or cookies if no authorization header present
  if (!headers["Authorization"]) {
    const basicAuth = getBasicAuthHeaderFromRequest(request);
    if (basicAuth) {
      headers["Authorization"] = basicAuth;
    } else {
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

  if (!systemId && request) {
    systemId = request.headers.get('x-electron-system-id');
  }

  if (!systemId && request) {
    systemId = request.cookies.get("nx_system_id")?.value ||
               request.cookies.get("nx_server_id")?.value || null;

    if (!systemId) {
      try {
        const cookieHeader = request.headers?.get('cookie') || '';
        const match = cookieHeader.match(/(?:^|;\s*)nx_cloud_session=([^;]+)/);
        if (match) {
          const session = JSON.parse(decodeURIComponent(match[1]));
          systemId = session?.ownerSystemId || session?.systemId || null;
        }
      } catch (_) {}
    }
  }

  if (!systemId && API_CONFIG.systemId) {
    systemId = API_CONFIG.systemId;
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

    // Allow per-source session token or basic auth to drive requests when cloud/GUID tokens are unavailable.
    if (!headers["Authorization"] && !headers["x-runtime-guid"]) {
      const isCloudBound = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
      if (!isCloudBound && request) {
        const { username, password } = getCloudCredentials(request);
        if (username) {
          try {
            const parsedUrl = new URL(cloudUrl);
            const host = parsedUrl.hostname;
            const port = parsedUrl.port || "7001";
            const token = await getVmsSessionToken(host, port, username, password);
            if (token) {
              headers["Authorization"] = `Bearer ${token}`;
              headers["x-runtime-guid"] = token;
            } else if (basicAuthHeader) {
              headers["Authorization"] = basicAuthHeader;
            }
          } catch (e) {
            if (basicAuthHeader) headers["Authorization"] = basicAuthHeader;
          }
        } else if (basicAuthHeader) {
          headers["Authorization"] = basicAuthHeader;
        }
      } else if (basicAuthHeader) {
        headers["Authorization"] = basicAuthHeader;
      }
    }

    // Stop calling if there's no auth material for a cloud request
    const isGlobal = (systemId || '').trim().toLowerCase() === 'all';
    const isCloudBound = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
    const hasAuth = !!(headers["Authorization"] || headers["x-runtime-guid"] || basicAuthHeader);

    // For cloud-bound URLs, we need a real NX Cloud OAuth token — a local VMS session
    // token will always be rejected with 403. Skip the call entirely if we only have local creds.
    const cloudAuthToken = getCloudAuthHeader(request);
    if (isCloudBound && !cloudAuthToken) {
      console.warn(`[Cloud API AUTH BLOCKED] Endpoint: ${endpoint} | SystemID: ${systemId} | Reason: Missing NX Cloud OAuth token in headers and cookies.`);
      return createAuthErrorResponse(systemId, systemName);
    }

    // Only block if it looks like a cloud-bound request (nxvms.com or vmsproxy.com)
    if (!hasAuth && isCloudBound) {
      console.warn(`[Cloud API AUTH BLOCKED] Endpoint: ${endpoint} | SystemID: ${systemId} | Reason: No Authorization header set.`);
      return createAuthErrorResponse(systemId, systemName);
    }

    const skipCache = request.headers.get("x-skip-nx-cache") === "1";
    const authFp = getAuthFingerprint(headers, basicAuthHeader);
    const cacheKey = cloudApiGetCacheKey(systemId, endpoint, queryParams, authFp);
    const flightKey = `get:${cacheKey}`;

    if (!skipCache && isCloudSystemsEndpoint(endpoint)) {
      const systems = await readCloudSystemsList(authFp);
      if (systems) {
        return NextResponse.json(systems as T, {
          headers: { "X-NX-Cache": "HIT", "X-NX-Cache-Source": "cloud-systems" },
        });
      }
    }

    if (!skipCache && isCacheableNxEndpoint(endpoint, "GET")) {
      const cached = await readCloudApiCache(cacheKey);
      if (cached) {
        return NextResponse.json(cached.data as T, {
          headers: { "X-NX-Cache": "HIT" },
        });
      }
    }

    const result = await singleFlightNxRequest(flightKey, async () => {
      const storedEntry: CloudApiCacheEntry | null =
        !skipCache && isCacheableNxEndpoint(endpoint, "GET")
          ? await readCloudApiCache(cacheKey)
          : null;

      const fetchHeaders = { ...headers };
      if (!skipCache && storedEntry?.etag) {
        fetchHeaders["If-None-Match"] = storedEntry.etag;
      }
      if (!skipCache && storedEntry?.lastModified) {
        fetchHeaders["If-Modified-Since"] = storedEntry.lastModified;
      }

      let response = await fetch(cloudUrl, {
        method: "GET",
        headers: fetchHeaders,
        redirect: "manual",
      });

      // Handle temporary redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (location) {
          response = await fetch(location, {
            method: "GET",
            headers: fetchHeaders,
          });
        }
      }

      // Handle 304 Not Modified — serve from Redis when possible
      if (response.status === 304) {
        const cached304 = storedEntry ?? (await readCloudApiCache(cacheKey));
        if (cached304 && !skipCache) {
          return NextResponse.json(cached304.data as T, {
            headers: { "X-NX-Cache": "HIT", "X-NX-Cache-Source": "304" },
          });
        }
        return new NextResponse(null, {
          status: 304,
          headers,
        });
      }

      // Handle 401/403 auth failures
      if (response.status === 401 || response.status === 403) {
        console.warn(`[Cloud API 403/401 REJECTED] Endpoint: ${endpoint} | SystemID: ${systemId} | URL: ${cloudUrl} | Status: ${response.status} | Authorization Header Present: ${!!headers["Authorization"]} | LocalToken Present: ${!!headers["x-runtime-guid"]}`);

        // Try automatic VMS session login for cloud relay endpoints
        const { username, password } = getCloudCredentials(request);
        if (username && password && systemId && systemId !== "all" && isCloudBound) {
          try {
            const loginUrl = `https://${systemId}.relay.vmsproxy.com/rest/v3/login/sessions`;
            const cloudAuth = getCloudAuthHeader(request);
            const loginHeaders: Record<string, string> = {
              "Content-Type": "application/json",
              Accept: "application/json",
            };
            if (cloudAuth) {
              loginHeaders["Authorization"] = cloudAuth;
            }

            console.log(`[Cloud Relay Auth] Attempting auto-login for system ${systemId} as user '${username}'...`);
            const loginRes = await fetch(loginUrl, {
              method: "POST",
              headers: loginHeaders,
              body: JSON.stringify({ username, password, setCookie: true }),
            });

            if (loginRes.ok) {
              const loginData = await loginRes.json();
              if (loginData?.token) {
                console.log(`[Cloud Relay Auth] Successfully authenticated to system ${systemId}`);
                const retryHeaders = { ...headers };
                retryHeaders["x-runtime-guid"] = loginData.token;

                response = await fetch(cloudUrl, {
                  method: "GET",
                  headers: retryHeaders,
                  redirect: "manual",
                });
              }
            } else {
              const loginErr = await loginRes.text();
              console.warn(`[Cloud Relay Auth] Login failed for system ${systemId}:`, loginErr);
            }
          } catch (e) {
            console.warn(`[Cloud Relay Auth Error] Exception during auto-login for system ${systemId}:`, e);
          }
        } else if (!isCloudBound && username) {
          // For local direct NVR connections, try refreshing the local session token
          try {
            const parsedUrl = new URL(cloudUrl);
            const host = parsedUrl.hostname;
            const port = parsedUrl.port || "7001";
            await invalidateVmsSessionToken(host, port, username);
            const freshToken = await getVmsSessionToken(host, port, username, password);
            if (freshToken) {
              const retryHeaders = { ...headers };
              retryHeaders["Authorization"] = `Bearer ${freshToken}`;
              retryHeaders["x-runtime-guid"] = freshToken;
              delete retryHeaders["x-nx-session"];
              delete retryHeaders["x-runtime-session-guid"];

              response = await fetch(cloudUrl, {
                method: "GET",
                headers: retryHeaders,
                redirect: "manual",
              });
            }
          } catch (e) {
            // Fall through to auth error response
          }
        }

        if (response.status === 401 || response.status === 403) {
          return createAuthErrorResponse(systemId || "", systemName || undefined);
        }
      }

      // Handle other errors
      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        if ([502, 503, 504].includes(status)) {
          // console.warn(`[Cloud API] System '${systemName || systemId}' is likely offline or unreachable via NX Cloud Relay (${status}). skipping detailed error.`);
        } else {
          // console.warn(`[Cloud API] Error (${status}) for ${cloudUrl}:`, errorText);
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
          const text = await response.text();
          const data = text && text.trim() ? JSON.parse(text) : {};
          if (!skipCache && isCacheableNxEndpoint(endpoint, "GET")) {
            await afterCloudApiGetCached(systemId, endpoint, cacheKey, data, response.status, {
              etag: response.headers.get("etag") ?? undefined,
              lastModified: response.headers.get("last-modified") ?? undefined,
              authFingerprint: authFp,
            });
          }
          return NextResponse.json(data, { headers: { "X-NX-Cache": "MISS" } });
        } catch (e) {
          console.error(`[Cloud API] JSON Parse Error for ${cloudUrl}:`, e);
          return createFetchErrorResponse("Invalid JSON response from cloud", systemId, systemName, 502);
        }
      }

      const text = await response.text();
      return NextResponse.json({ success: true, message: "Request successful (non-JSON)" } as unknown as T);
    });

    return result as NextResponse<T | CloudApiError>;
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

    // DEBUG: Log request details
    /*
    console.log(`[Cloud API DEBUG] ${method} Request:`, {
      systemId,
      systemName,
      endpoint,
      cloudUrl,
      hasBasicAuth: !!basicAuthHeader,
      hasAuthHeader: !!headers["Authorization"],
      hasRuntimeGuid: !!headers["x-runtime-guid"],
      authHeaderType: headers["Authorization"]?.substring(0, 20) + "...",
    });
    */

    // Stop calling if there's no auth material for a cloud request
    const isCloudBound2 = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
    const hasAuth = !!(headers["Authorization"] || headers["x-runtime-guid"]);

    // For cloud-bound URLs, require a real NX Cloud OAuth token
    const cloudAuthToken2 = getCloudAuthHeader(request);
    if (isCloudBound2 && !cloudAuthToken2) {
      // console.log(`[Cloud API DEBUG] Returning 403 - cloud-bound but no cloud token`);
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!hasAuth && isCloudBound2) {
      // console.log(`[Cloud API DEBUG] Returning 403 - no auth and cloud-bound`);
      return createAuthErrorResponse(systemId, systemName);
    }

    // Allow per-source session token or basic auth to drive requests when cloud/GUID tokens are unavailable.
    if (!headers["Authorization"] && !headers["x-runtime-guid"]) {
      const isCloudBound = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
      if (!isCloudBound && request) {
        const { username, password } = getCloudCredentials(request);
        if (username) {
          try {
            const parsedUrl = new URL(cloudUrl);
            const host = parsedUrl.hostname;
            const port = parsedUrl.port || "7001";
            const token = await getVmsSessionToken(host, port, username, password);
            if (token) {
              headers["Authorization"] = `Bearer ${token}`;
              headers["x-runtime-guid"] = token;
            } else if (basicAuthHeader) {
              headers["Authorization"] = basicAuthHeader;
            }
          } catch (e) {
            if (basicAuthHeader) headers["Authorization"] = basicAuthHeader;
          }
        } else if (basicAuthHeader) {
          headers["Authorization"] = basicAuthHeader;
        }
      } else if (basicAuthHeader) {
        headers["Authorization"] = basicAuthHeader;
      }
    }

    const authFp = getAuthFingerprint(headers, basicAuthHeader);
    const getCacheKey = cloudApiGetCacheKey(systemId, endpoint, queryParams, authFp);

    // console.log(`[Cloud API DEBUG] Auth checks passed, making ${method} request to ${cloudUrl}`);

    // logger.debug(`[Cloud API] Requesting ${method} ${cloudUrl}`);

    let response = await fetch(cloudUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    // console.log(`[Cloud API DEBUG] Initial response status: ${response.status}`);

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

    // Retry once when session token is rejected (401/403)
    if ((response.status === 401 || response.status === 403) && (isNxEndpoint || isLocalOrRelay)) {
      const isCloudBound = cloudUrl.includes("nxvms.com") || cloudUrl.includes("vmsproxy.com");
      if (!isCloudBound) {
        const { username, password } = getCloudCredentials(request);
        if (username) {
          try {
            const parsedUrl = new URL(cloudUrl);
            const host = parsedUrl.hostname;
            const port = parsedUrl.port || "7001";
            console.log(`[Cloud API] Auth failed (401/403). Invalidating cached token for ${username} at ${host}:${port} and retrying with fresh token...`);
            await invalidateVmsSessionToken(host, port, username);
            const freshToken = await getVmsSessionToken(host, port, username, password);
            if (freshToken) {
              const retryHeaders = { ...headers };
              retryHeaders["Authorization"] = `Bearer ${freshToken}`;
              retryHeaders["x-runtime-guid"] = freshToken;
              delete retryHeaders["x-nx-session"];
              delete retryHeaders["x-runtime-session-guid"];
              
              response = await fetch(cloudUrl, {
                method,
                headers: retryHeaders,
                body: body ? JSON.stringify(body) : undefined,
                redirect: "manual",
              });
            } else if (basicAuthHeader) {
              const retryHeaders: Record<string, string> = { ...headers, Authorization: basicAuthHeader };
              delete retryHeaders["x-runtime-guid"];
              delete retryHeaders["x-nx-session"];
              delete retryHeaders["x-runtime-session-guid"];
              response = await fetch(cloudUrl, {
                method,
                headers: retryHeaders,
                body: body ? JSON.stringify(body) : undefined,
                redirect: "manual",
              });
            }
          } catch (e) {
            // fallback if URL parsing or network fails
          }
        }
      } else if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: basicAuthHeader,
        };
        delete retryHeaders["x-runtime-guid"];
        delete retryHeaders["x-nx-session"];
        delete retryHeaders["x-runtime-session-guid"];

        response = await fetch(cloudUrl, {
          method,
          headers: retryHeaders,
          body: body ? JSON.stringify(body) : undefined,
          redirect: "manual",
        });
      }
      
      if (response.status === 401 || response.status === 403) {
        return createAuthErrorResponse(systemId, systemName);
      }
    } else if (response.status === 401 || response.status === 403) {
      const errorText = await response.text();
      console.warn(`[Cloud API] Auth error (${response.status}) for ${cloudUrl}:`, errorText);
      return createAuthErrorResponse(systemId, systemName);
    }

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      if ([502, 503, 504].includes(status)) {
        // console.warn(`[Cloud API] System '${systemName || systemId}' is likely offline or unreachable via NX Cloud Relay (${status}). skipping detailed error.`);
      } else {
        // console.warn(`[Cloud API] Error (${status}) for ${cloudUrl}:`, errorText);
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
      const responseCloneForError = response.clone();
      try {
        const data = await response.json();
        if (method !== "GET") {
          await afterCloudApiMutation(systemId, endpoint, method, getCacheKey, data);
        }
        return NextResponse.json(data);
      } catch (e) {
        let text = "";
        try {
          text = await responseCloneForError.text();
        } catch (_) {}
        console.warn(`[Cloud API] Raw response body:`, text.substring(0, 500));
        return createFetchErrorResponse("Invalid JSON response from cloud", systemId, systemName, 502);
      }
    }

    if (method !== "GET" && response.ok) {
      await afterCloudApiMutation(systemId, endpoint, method, getCacheKey);
    }

    const text = await response.text();
    return NextResponse.json({ success: true, message: "Request successful (non-JSON)" } as unknown as T);
  } catch (error) {
    console.error(`[Cloud API] Error ${method} ${endpoint} to ${systemName || systemId}:`, error);
    return createConnectionErrorResponse(systemId, systemName);
  }
}
