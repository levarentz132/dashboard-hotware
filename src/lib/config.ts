// Nx Witness API Configuration
export const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api',
  wsURL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:7001/ws',
  username: process.env.NEXT_PUBLIC_NX_USERNAME || 'admin',
  password: process.env.NEXT_PUBLIC_NX_PASSWORD || 'Highlander123@@',
  serverHost: process.env.NEXT_PUBLIC_NX_SERVER_HOST || 'localhost',
  serverPort: process.env.NEXT_PUBLIC_NX_SERVER_PORT || '7001',
}

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  login: '/login',
  logout: '/logout',
  
  // Cameras
  cameras: '/cameras',
  cameraById: (id: string) => `/cameras/${id}`,
  cameraStatus: '/cameras/status',
  
  // Events and Alarms
  events: '/events',
  alarms: '/alarms',
  eventHistory: '/events/history',
  
  // System Health
  systemInfo: '/system/info',
  serverStatus: '/system/status',
  
  // Storage
  storageInfo: '/storage',
  
  // Analytics
  analytics: '/analytics',
  reports: '/reports',
}

export default API_CONFIG