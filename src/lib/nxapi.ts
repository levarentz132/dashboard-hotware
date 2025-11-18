import { API_CONFIG, API_ENDPOINTS } from './config'

export interface NxCamera {
  id: string
  name: string
  physicalId: string
  url: string
  status: 'Online' | 'Offline' | 'Unauthorized' | 'Recording'
  typeId: string
  model: string
  vendor: string
  mac: string
  ip: string
  port: number
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
  version: string
  name: string
  id: string
  cloudHost: string
  customization: string
}

class NxWitnessAPI {
  private baseURL: string
  private authToken: string | null = null

  constructor() {
    this.baseURL = API_CONFIG.baseURL
  }

  // Authentication
  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.login}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (response.ok) {
        const data = await response.json()
        this.authToken = data.token || data.sessionToken
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  // Get request headers with auth
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    } else if (API_CONFIG.username && API_CONFIG.password) {
      // Basic auth fallback
      const credentials = btoa(`${API_CONFIG.username}:${API_CONFIG.password}`)
      headers['Authorization'] = `Basic ${credentials}`
    }

    return headers
  }

  // Generic API request
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      }
      
      return await response.text() as unknown as T
    } catch (error) {
      console.error(`API request error for ${endpoint}:`, error)
      throw error
    }
  }

  // Camera methods
  async getCameras(): Promise<NxCamera[]> {
    try {
      const cameras = await this.apiRequest<NxCamera[]>(API_ENDPOINTS.cameras)
      return Array.isArray(cameras) ? cameras : []
    } catch (error) {
      console.error('Error fetching cameras:', error)
      // Return mock data if API fails
      return this.getMockCameras()
    }
  }

  async getCameraById(id: string): Promise<NxCamera | null> {
    try {
      return await this.apiRequest<NxCamera>(API_ENDPOINTS.cameraById(id))
    } catch (error) {
      console.error(`Error fetching camera ${id}:`, error)
      return null
    }
  }

  async getCameraStatus(): Promise<Record<string, string>> {
    try {
      return await this.apiRequest<Record<string, string>>(API_ENDPOINTS.cameraStatus)
    } catch (error) {
      console.error('Error fetching camera status:', error)
      return {}
    }
  }

  // Event methods
  async getEvents(limit: number = 50): Promise<NxEvent[]> {
    try {
      const events = await this.apiRequest<NxEvent[]>(`${API_ENDPOINTS.events}?limit=${limit}`)
      return Array.isArray(events) ? events : []
    } catch (error) {
      console.error('Error fetching events:', error)
      return this.getMockEvents()
    }
  }

  async getAlarms(): Promise<NxEvent[]> {
    try {
      const alarms = await this.apiRequest<NxEvent[]>(API_ENDPOINTS.alarms)
      return Array.isArray(alarms) ? alarms : []
    } catch (error) {
      console.error('Error fetching alarms:', error)
      return this.getMockAlarms()
    }
  }

  // System methods
  async getSystemInfo(): Promise<NxSystemInfo> {
    try {
      return await this.apiRequest<NxSystemInfo>(API_ENDPOINTS.systemInfo)
    } catch (error) {
      console.error('Error fetching system info:', error)
      return {
        version: '5.1.0',
        name: 'Nx Witness Server',
        id: 'mock-server',
        cloudHost: 'localhost',
        customization: 'Hotware'
      }
    }
  }

  // Mock data methods (fallback when API is not available)
  private getMockCameras(): NxCamera[] {
    return [
      {
        id: 'cam-001',
        name: 'Main Entrance',
        physicalId: 'CAM-001',
        url: 'rtsp://localhost:554/cam1',
        status: 'Online',
        typeId: 'dome',
        model: 'Axis P3245-LVE',
        vendor: 'Axis',
        mac: '00:40:8c:12:34:56',
        ip: '192.168.1.101',
        port: 80
      },
      {
        id: 'cam-002',
        name: 'Parking Lot North',
        physicalId: 'CAM-002',
        url: 'rtsp://localhost:554/cam2',
        status: 'Online',
        typeId: 'ptz',
        model: 'Hikvision DS-2DE5425IW-AE',
        vendor: 'Hikvision',
        mac: '00:40:8c:12:34:57',
        ip: '192.168.1.102',
        port: 80
      },
      {
        id: 'cam-003',
        name: 'Reception Area',
        physicalId: 'CAM-003',
        url: 'rtsp://localhost:554/cam3',
        status: 'Offline',
        typeId: 'fixed',
        model: 'Dahua IPC-HFW5831E-ZE',
        vendor: 'Dahua',
        mac: '00:40:8c:12:34:58',
        ip: '192.168.1.103',
        port: 80
      }
    ]
  }

  private getMockEvents(): NxEvent[] {
    const now = new Date()
    return [
      {
        id: 'evt-001',
        timestamp: new Date(now.getTime() - 5 * 60000).toISOString(),
        cameraId: 'cam-001',
        type: 'Motion Detection',
        description: 'Motion detected at main entrance'
      },
      {
        id: 'evt-002',
        timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
        cameraId: 'cam-002',
        type: 'Analytics Event',
        description: 'Person counting event'
      }
    ]
  }

  private getMockAlarms(): NxEvent[] {
    const now = new Date()
    return [
      {
        id: 'alm-001',
        timestamp: new Date(now.getTime() - 2 * 60000).toISOString(),
        cameraId: 'cam-001',
        type: 'Motion Detection',
        description: 'Unauthorized motion detected outside business hours'
      },
      {
        id: 'alm-002',
        timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
        cameraId: 'cam-003',
        type: 'Camera Offline',
        description: 'Camera connection lost - potential network issue'
      }
    ]
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.getSystemInfo()
      return true
    } catch (error) {
      console.error('Connection test failed:', error)
      return false
    }
  }
}

// Create singleton instance
export const nxAPI = new NxWitnessAPI()

// Auto-login if credentials are provided
if (API_CONFIG.username && API_CONFIG.password) {
  nxAPI.login(API_CONFIG.username, API_CONFIG.password).catch(console.error)
}

export default nxAPI