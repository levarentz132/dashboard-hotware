import { API_CONFIG, API_ENDPOINTS } from "../config";
import { NxSystemInfo } from "./types";

export class NxWitnessAPIBase {
  protected baseURL: string;
  protected systemId: string | null = null;
  protected authToken: string | null = null;
  protected cache: Map<string, { data: any; timestamp: number }> = new Map();
  protected pendingRequests: Map<string, Promise<any>> = new Map();
  protected readonly CACHE_TTL = 10000; // 10 seconds cache

  constructor() {
    this.baseURL = API_CONFIG.baseURL;
    this.systemId = API_CONFIG.systemId ? API_CONFIG.systemId.replace(/[{}]/g, "") : null;
  }

  setSystemId(id: string | null) {
    this.systemId = id ? id.replace(/[{}]/g, "") : null;
    // Clear cache when switching systems
    this.cache.clear();
  }

  getSystemId(): string | null {
    return this.systemId;
  }

  // Authentication - Nx Witness REST API v3
  async login(username: string, password: string): Promise<boolean> {
    if (!this.systemId && this.baseURL.includes("/api/nx")) {
      console.warn("[nxAPI] Login skipped: systemId is required for cloud relay proxy.");
      return false;
    }

    try {
      const loginBody = {
        username: username,
        password: password,
        setCookie: true,
      };

      const response = await fetch(
        `${this.baseURL}${API_ENDPOINTS.login}${this.systemId ? `?systemId=${this.systemId}` : ""}`,
        {
          method: "POST",
          mode: "cors",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(loginBody),
        },
      );

      if (response.ok) {
        return true;
      } else {
        console.error("[nxAPI] Login failed:", response.status, response.statusText);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  // Get request headers without auth (Nx Witness uses cookies)
  protected getHeaders(): Record<string, string> {
    const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (extConfig) {
      headers['X-Electron-System-ID'] = extConfig.NEXT_PUBLIC_NX_SYSTEM_ID || '';
      headers['X-Electron-Username'] = extConfig.NEXT_PUBLIC_NX_USERNAME || '';
      headers['X-Electron-VMS-Password'] = extConfig.NEXT_PUBLIC_NX_PASSWORD || '';
      headers['X-Electron-VMS-Password-Encrypted'] = extConfig.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED || '';
      headers['X-Electron-Cloud-Username'] = extConfig.NEXT_PUBLIC_NX_CLOUD_USERNAME || '';
      headers['X-Electron-Cloud-Password'] = extConfig.NEXT_PUBLIC_NX_CLOUD_PASSWORD || '';
      headers['X-Electron-Cloud-Password-Encrypted'] = extConfig.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED || '';
      headers['X-Electron-Cloud-Token'] = extConfig.NX_CLOUD_TOKEN || '';
    }

    return headers;
  }

  // Check if Nx Witness API is available
  async testConnection(): Promise<boolean> {
    if (!this.systemId) {
      console.warn("[nxAPI] Cannot test connection without a systemId");
      return false;
    }

    try {
      const controller = new AbortController();
      // Increase timeout for Vercel/Production to handle redirects and cold starts
      setTimeout(() => controller.abort(new Error("API availability check timeout")), 15000);

      const url = new URL(`${window.location.origin}${this.baseURL}/system/info`);
      url.searchParams.set("systemId", this.systemId);

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
        headers: this.getHeaders(),
      });

      return response.status < 500 || response.status === 401 || response.status === 403;
    } catch (error) {
      console.error("[nxAPI] Server availability check failed:", error);
      return false;
    }
  }

  // Generic API request with deduplication and caching
  protected async apiRequest<T>(endpoint: string, options: RequestInit & { skipCache?: boolean } = {}): Promise<T> {
    const cacheKey = `${options.method || "GET"}:${endpoint}:${this.systemId}`;
    const { skipCache = false, ...fetchOptions } = options;

    // Invalidate cache on mutations (POST, PATCH, DELETE, PUT)
    const isWrite = options.method && options.method !== "GET";
    if (isWrite) {
      this.cache.clear();
    }

    // 1. Check Cache (only for GET requests)
    if (!skipCache && (options.method === "GET" || !options.method)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        if (Date.now() - cached.timestamp < this.CACHE_TTL) {
          return cached.data;
        } else {
          this.cache.delete(cacheKey); // Evict expired key from memory
        }
      }
    }

    // 2. Check for missing systemId (Cloud-only requirement)
    if (!this.systemId) {
      console.warn(`[nxAPI] Request to ${endpoint} blocked: System ID is required.`);
      return Promise.reject(new Error("SYSTEM_ID_REQUIRED"));
    }

    // 3. Check Pending Requests (Deduplication)
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      // Use /nx proxy for local server, /api/nx for cloud relay
      const isLocal = this.systemId === "local" || (typeof API_CONFIG !== 'undefined' && this.systemId === API_CONFIG.systemId);
      let targetBaseURL = isLocal ? "/nx" : this.baseURL;
      let origin = "";
      
      if (typeof window !== 'undefined') {
        origin = window.location.origin;
      } else {
        // Server-side: use environment variable or default to localhost
        origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      }

      // Build URL with systemId
      const url = new URL(`${origin}${targetBaseURL}${endpoint}`);
      if (this.systemId && !isLocal) {
        url.searchParams.set("systemId", this.systemId);
      }

      // Merge existing search params from endpoint if any
      if (endpoint.includes("?")) {
        const [path, query] = endpoint.split("?");
        const params = new URLSearchParams(query);
        params.forEach((value, key) => url.searchParams.set(key, value));
        url.pathname = `${this.baseURL}${path}`;
      }

      const configHeaders: any = {
        ...this.getHeaders(),
        ...fetchOptions.headers,
      };
      if (skipCache) {
        configHeaders["x-skip-nx-cache"] = "1";
      }

      const config: RequestInit = {
        credentials: "include",
        ...fetchOptions,
        headers: configHeaders,
      };

      // 4. Stop calling if it's a cloud request and we have no auth material
      // Only for web context as Electron might handle auth differently
      if (typeof window !== 'undefined' && !isLocal) {
        const hasElectronToken = (config.headers as any)['X-Electron-Cloud-Token'];
        const hasCookieSession = document.cookie.includes('nx_cloud_session') ||
          document.cookie.includes('nx-cloud-') ||
          document.cookie.includes('local_nx_user');

        if (!hasElectronToken && !hasCookieSession) {
          console.warn(`[nxAPI] Request to ${endpoint} blocked: No cloud login token or local session found.`);
          throw new Error("AUTH_REQUIRED");
        }
      }

      try {
        const response = await fetch(url.toString(), config);

        if (!response.ok) {
          const errorText = await response.text();
          // Use debug for 404s (expected when endpoint not available), error for others
          if (response.status === 404) {
            console.debug(`[apiRequest] ${endpoint}: 404 Not Found`);
          } else {
            console.error(`[apiRequest ERROR] ${endpoint}: ${response.status}`, errorText);
          }
          throw new Error(`HTTP_${response.status}: ${errorText}`);
        }

        if (response.status === 204 || response.headers.get("content-length") === "0") {
          return undefined as unknown as T;
        }

        const contentType = response.headers.get("content-type");
        let result: T;
        if (contentType && contentType.includes("application/json")) {
          const text = await response.text();
          result = !text || text.trim() === "" ? (undefined as unknown as T) : JSON.parse(text);
        } else {
          result = (await response.text()) as unknown as T;
        }

        // Save to cache for GET requests
        if (options.method === "GET" || !options.method) {
          this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        }

        return result;
      } catch (error) {
        // Don't re-log 404 errors as they've already been logged above
        const errorMsg = String(error);
        if (!errorMsg.includes('HTTP_404')) {
          console.error(`[apiRequest] ${endpoint}: Request failed:`, error);
        }
        throw error;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  // Get authentication status
  isAuthenticated(): boolean {
    return !!this.authToken;
  }

  // Get current auth token (for debugging)
  getAuthToken(): string | null {
    return this.authToken;
  }

  // Logout - Delete session token
  async logout(): Promise<boolean> {
    try {
      // Clear cache on logout
      this.cache.clear();

      // First, get current session info to find the token
      const sessionsResponse = await fetch(`${this.baseURL}/login/sessions`, {
        method: "GET",
        credentials: "include",
        headers: this.getHeaders(),
      });

      if (sessionsResponse.ok) {
        const sessions = await sessionsResponse.json();

        // Get the current session token (usually the first/only one)
        let token = null;
        if (Array.isArray(sessions) && sessions.length > 0) {
          token = sessions[0].token || sessions[0].id;
        } else if (sessions.token) {
          token = sessions.token;
        }

        if (token) {
          // Delete the session using the token
          const deleteResponse = await fetch(`${this.baseURL}/login/sessions/${token}`, {
            method: "DELETE",
            credentials: "include",
            headers: this.getHeaders(),
          });

          if (deleteResponse.ok || deleteResponse.status === 204) {
            this.authToken = null;
            return true;
          } else {
            console.error("[nxAPI] Failed to delete session:", deleteResponse.status);
          }
        }
      }

      // Fallback: Try to delete "current" session
      const fallbackResponse = await fetch(`${this.baseURL}/login/sessions/current`, {
        method: "DELETE",
        credentials: "include",
        headers: this.getHeaders(),
      });

      if (fallbackResponse.ok || fallbackResponse.status === 204) {
        this.authToken = null;
        // Clear auth cookie
        if (typeof document !== "undefined") {
          document.cookie = "nx-auth=; path=/; max-age=0";
        }
        return true;
      }

      // Clear local auth token anyway
      this.authToken = null;
      // Clear auth cookie
      if (typeof document !== "undefined") {
        document.cookie = "nx-auth=; path=/; max-age=0";
      }
      return true;
    } catch (error) {
      console.error("[nxAPI] Logout error:", error);
      // Clear local auth token anyway
      this.authToken = null;
      // Clear auth cookie
      if (typeof document !== "undefined") {
        document.cookie = "nx-auth=; path=/; max-age=0";
      }
      return false;
    }
  }

  // Test connection with automatic login
  async authenticate(): Promise<boolean> {
    try {
      // Try to get system info (which may work with session cookie)
      try {
        const info = await this.apiRequest<NxSystemInfo>("/system/info");
        if (info) {
          return true; // We have a valid session
        }
      } catch {
        // Session might be expired, try to login
      }

      // Try to authenticate with config credentials
      if (API_CONFIG.username && API_CONFIG.password) {
        return await this.login(API_CONFIG.username!, API_CONFIG.password!);
      }

      return false;
    } catch (error) {
      return false;
    }
  }
}
