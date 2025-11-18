import { API_CONFIG, API_ENDPOINTS } from './config'

export interface NxCamera {
  id: string
  name: string
  physicalId: string
  url?: string
  status: 'Online' | 'Offline' | 'Unauthorized' | 'Recording' | 'online' | 'offline'
  typeId: string
  model?: string
  vendor?: string
  mac?: string
  ip?: string
  port?: number
  // Additional properties that may come from Nx Witness
  location?: string
  type?: string
  resolution?: string
  fps?: number
  lastSeen?: string
  recordingStatus?: string
}

export interface NxEvent {
  id: string
  timestamp: string
  cameraId: string
  type: string
  description: string
  metadata?: Record<string, any>
}

export interface NxSystemInfo {
  name: string
  customization: string
  version: string
  protoVersion: number
  restApiVersions: {
    min: string
    max: string
  }
  cloudHost: string
  localId: string
  cloudId?: string
  cloudOwnerId?: string
  organizationId?: string
  servers: string[]
  edgeServerCount: number
  devices: string[]
  ldapSyncId?: string
  synchronizedTimeMs?: number
}

class NxWitnessAPI {
  private baseURL: string
  private authToken: string | null = null

  constructor() {
    this.baseURL = API_CONFIG.baseURL
  }

  // Authentication - Nx Witness REST API v3
  async login(username: string, password: string): Promise<boolean> {
    try {
      // Check if server is available first
      const isAvailable = await this.isApiAvailable()
      if (!isAvailable) {
        return false
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout for login
      
      // Nx Witness REST API v3 login format
      const loginBody = {
        username: username,
        password: password,
        setCookie: true
      }
      
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.login}`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(loginBody),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        // Nx Witness sets session cookie automatically
        // No need to handle tokens manually
        console.log('[nxAPI] Login successful - session cookie set')
        return true
      } else {
        console.error('[nxAPI] Login failed:', response.status, response.statusText)
      }
      
      return false
      
    } catch (error) {
      return false
    }
  }

  // Get request headers without auth (Nx Witness uses cookies)
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  // Check if Nx Witness API is available
  private async isApiAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      // Test system info endpoint through proxy
      const response = await fetch(`${this.baseURL}/system/info`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: this.getHeaders()
      })
      
      // Accept any non-server-error response (including 401 Unauthorized which is expected)
      if (response.status < 500 || response.status === 401 || response.status === 403) {
        console.log('[nxAPI] Server is available, status:', response.status)
        return true
      }
      
      console.warn('[nxAPI] Server returned error status:', response.status)
      return false
      
    } catch (error) {
      console.error('[nxAPI] Server availability check failed:', error)
      return false
    }
  }

  // Generic API request
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    const config: RequestInit = {
      credentials: 'include', // Always include cookies
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    }

    console.log(`[apiRequest] ${endpoint}: ${config.method || 'GET'} ${url}`)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch(url, {
        ...config,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      console.log(`[apiRequest] ${endpoint}: ${response.status} ${response.statusText}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[apiRequest] ${endpoint}: Error:`, errorText)
        throw new Error(`HTTP_${response.status}: ${errorText}`)
      }

      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const jsonData = await response.json()
        return jsonData
      }
      
      const textData = await response.text()
      return textData as unknown as T
    } catch (error) {
      console.error(`[apiRequest] ${endpoint}: Request failed:`, error)
      throw error
    }
  }

  // Camera methods
  async getCameras(): Promise<NxCamera[]> {
    const cameras = await this.apiRequest<NxCamera[]>(API_ENDPOINTS.devices)
    if (cameras === null || !Array.isArray(cameras)) {
      return [] // Return empty array when server unavailable
    }
    return cameras
  }

  async getCameraById(id: string): Promise<NxCamera | null> {
    const camera = await this.apiRequest<NxCamera>(API_ENDPOINTS.deviceById(id))
    return camera === null ? null : camera
  }

  async getCameraStatus(): Promise<Record<string, string>> {
    const status = await this.apiRequest<Record<string, string>>(API_ENDPOINTS.deviceStatus)
    return status === null ? {} : status
  }

  // Event methods
  async getEvents(limit: number = 50): Promise<NxEvent[]> {
    const events = await this.apiRequest<NxEvent[]>(`${API_ENDPOINTS.events}?limit=${limit}`)
    if (events === null || !Array.isArray(events)) {
      return [] // Return empty array when server unavailable
    }
    return events
  }

  async getAlarms(limit: number = 20): Promise<NxEvent[]> {
    const alarms = await this.apiRequest<NxEvent[]>(`${API_ENDPOINTS.events}?type=alarm&limit=${limit}`)
    if (alarms === null || !Array.isArray(alarms)) {
      return [] // Return empty array when server unavailable
    }
    return alarms
  }

  // System methods
  async getSystemInfo(): Promise<NxSystemInfo | null> {
    try {
      // Use the correct REST v3 system info endpoint
      const info = await this.apiRequest<NxSystemInfo>('/system/info')
      return info
    } catch (error) {
      return null // Return null when API is unavailable
    }
  }



  // Server methods (REST v3)
  async getServers(): Promise<any> {
    try {
      console.log('[getServers] Starting server request...')
      const servers = await this.apiRequest<any>('/servers')
      console.log('[getServers] Raw servers API response:', servers) // Debug log
      console.log('[getServers] Response type:', typeof servers, 'isArray:', Array.isArray(servers))
      
      // Return the servers directly as they come from the API (should be an array)
      if (Array.isArray(servers)) {
        console.log('[getServers] Returning array with', servers.length, 'servers')
        return servers
      } else if (servers && typeof servers === 'object' && servers.servers) {
        // Handle wrapped response if API format changes
        console.log('[getServers] Found wrapped servers, returning', servers.servers.length, 'servers')
        return servers.servers
      } else {
        console.warn('[getServers] Unexpected servers response format:', servers)
        console.log('[getServers] Available keys:', servers ? Object.keys(servers) : 'null/undefined')
        return []
      }
    } catch (error) {
      console.error('[getServers] Error in getServers:', error)
      throw error // Let the hook handle the error
    }
  }

  async getServerInfo(serverId: string): Promise<any> {
    const endpoint = API_ENDPOINTS.serverInfo.replace('{id}', serverId)
    const info = await this.apiRequest<any>(endpoint)
    return info === null ? null : info
  }

  // Get server status for API status widget
  async getServerStatus(): Promise<{connected: boolean, serverCount: number, lastUpdate: string}> {
    try {
      const servers = await this.getServers()
      return {
        connected: Array.isArray(servers) && servers.length > 0,
        serverCount: Array.isArray(servers) ? servers.length : 0,
        lastUpdate: new Date().toLocaleTimeString()
      }
    } catch (error) {
      return {
        connected: false,
        serverCount: 0,
        lastUpdate: new Date().toLocaleTimeString()
      }
    }
  }

  async getModuleInformation(): Promise<any> {
    const modules = await this.apiRequest<any>(API_ENDPOINTS.moduleInformation)
    if (modules === null) {
      return { modules: [], success: false } // Return empty when server unavailable
    }
  }

  // Storage information (may not be available in all Nx Witness versions)
  async getStorageInfo(): Promise<any> {
    try {
      const storage = await this.apiRequest<any>(API_ENDPOINTS.storageInfo)
      return storage === null ? null : storage
    } catch (error) {
      console.log('[getStorageInfo] Storage endpoint not available:', error)
      return null // Storage info not available in this Nx Witness version
    }
  }

  // Get authentication status
  isAuthenticated(): boolean {
    return !!this.authToken
  }

  // Get current auth token (for debugging)
  getAuthToken(): string | null {
    return this.authToken
  }

  // Test connection with automatic login
  async testConnection(): Promise<boolean> {
    try {
      // Try to get system info (which may work with session cookie)
      try {
        const info = await this.getSystemInfo()
        if (info) {
          return true // We have a valid session
        }
      } catch (error) {
        // Session might be expired, try to login
      }
      
      // Check if server is available
      const isAvailable = await this.isApiAvailable()
      if (!isAvailable) {
        return false
      }
      
      // Try to authenticate
      if (API_CONFIG.username && API_CONFIG.password) {
        const loginSuccess = await this.login(API_CONFIG.username, API_CONFIG.password)
        return loginSuccess
      }
      
      return isAvailable
    } catch (error) {
      return false
    }
  }
}

// Create singleton instance
export const nxAPI = new NxWitnessAPI()

// Auto-login if credentials are provided
if (typeof window !== 'undefined' && API_CONFIG.username && API_CONFIG.password) {
  console.log('[nxAPI] Auto-login credentials detected:', {
    username: API_CONFIG.username,
    hasPassword: !!API_CONFIG.password,
    baseURL: API_CONFIG.baseURL
  })
  
  // Delay auto-login to allow component initialization
  setTimeout(async () => {
    console.log('[nxAPI] Starting auto-login...')
    try {
      const success = await nxAPI.login(API_CONFIG.username, API_CONFIG.password)
      console.log('[nxAPI] Auto-login result:', success)
    } catch (error) {
      console.error('[nxAPI] Auto-login failed:', error)
    }
  }, 1500)
}

export default nxAPI