'use client'

import { useState, useEffect, useCallback } from 'react'
import { nxAPI, NxCamera, NxEvent, NxSystemInfo } from '@/lib/nxapi'

// Custom hook for cameras
export function useCameras() {
  const [cameras, setCameras] = useState<NxCamera[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCameras = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const cameraData = await nxAPI.getCameras()
      setCameras(cameraData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cameras')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  return { cameras, loading, error, refetch: fetchCameras }
}

// Custom hook for events
export function useEvents(limit: number = 50) {
  const [events, setEvents] = useState<NxEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const eventData = await nxAPI.getEvents(limit)
      setEvents(eventData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchEvents()
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchEvents, 30000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  return { events, loading, error, refetch: fetchEvents }
}

// Custom hook for alarms
export function useAlarms() {
  const [alarms, setAlarms] = useState<NxEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlarms = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const alarmData = await nxAPI.getAlarms()
      setAlarms(alarmData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alarms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlarms()
    
    // Set up auto-refresh every 10 seconds for alarms
    const interval = setInterval(fetchAlarms, 10000)
    return () => clearInterval(interval)
  }, [fetchAlarms])

  return { alarms, loading, error, refetch: fetchAlarms }
}

// Custom hook for system info
export function useSystemInfo() {
  const [systemInfo, setSystemInfo] = useState<NxSystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const fetchSystemInfo = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const info = await nxAPI.getSystemInfo()
      setSystemInfo(info)
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system info')
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const testConnection = useCallback(async () => {
    try {
      const isConnected = await nxAPI.testConnection()
      setConnected(isConnected)
      if (isConnected) {
        await fetchSystemInfo()
      }
      return isConnected
    } catch (err) {
      setConnected(false)
      setError('Connection test failed')
      return false
    }
  }, [fetchSystemInfo])

  useEffect(() => {
    fetchSystemInfo()
  }, [fetchSystemInfo])

  return { 
    systemInfo, 
    loading, 
    error, 
    connected, 
    refetch: fetchSystemInfo, 
    testConnection 
  }
}

// Custom hook for real-time updates
export function useRealTimeUpdates() {
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    // This would connect to WebSocket for real-time updates
    // For now, we'll simulate with periodic updates
    const interval = setInterval(() => {
      setLastUpdate(new Date())
      setIsConnected(true)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return { isConnected, lastUpdate }
}