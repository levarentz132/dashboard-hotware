'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, X, Wifi, WifiOff } from 'lucide-react'
import { NOTIFICATION_EVENT_NAME } from '@/lib/notifications'

interface ToastNotification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: number
}

export default function NotificationSystem() {
  const [notifications, setNotifications] = useState<ToastNotification[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown')

  const addNotification = (notification: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const newNotification: ToastNotification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    }

    setNotifications(prev => [...prev, newNotification])

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(newNotification.id)
    }, 5000)
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  // Listen for global notifications
  useEffect(() => {
    const handleNotification = (event: any) => {
      if (event.detail) {
        addNotification(event.detail)
      }
    }

    window.addEventListener(NOTIFICATION_EVENT_NAME, handleNotification)
    return () => window.removeEventListener(NOTIFICATION_EVENT_NAME, handleNotification)
  }, [])

  // Check connection status periodically
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { nxAPI } = await import('@/lib/nxapi')
        const sid = nxAPI.getSystemId()
        if (!sid) {
          setConnectionStatus('unknown')
          return
        }

        const isConnected = await nxAPI.testConnection()
        const newStatus = isConnected ? 'connected' : 'disconnected'

        // Only update if status actually changed
        if (connectionStatus !== newStatus) {
          setConnectionStatus(newStatus)

          // Show notification on status change (but not on initial load)
          if (connectionStatus !== 'unknown') {
            addNotification({
              type: isConnected ? 'success' : 'warning',
              title: isConnected ? 'API Connected' : 'API Disconnected',
              message: isConnected
                ? 'Successfully connected to Nx Witness API with authentication'
                : 'Lost connection to Nx Witness API - check server status'
            })
          }
        }
      } catch (error) {
        if (connectionStatus !== 'disconnected') {
          setConnectionStatus('disconnected')
          addNotification({
            type: 'error',
            title: 'Connection Error',
            message: 'Unable to reach Nx Witness server'
          })
        }
      }
    }

    // Initial check
    checkConnection()

    // Check more frequently if disconnected
    const interval = setInterval(
      checkConnection,
      connectionStatus === 'disconnected' ? 15000 : 45000 // 15s if disconnected, 45s if connected
    )
    return () => clearInterval(interval)
  }, [connectionStatus])

  const getNotificationIcon = (type: ToastNotification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />
      default:
        return <AlertCircle className="w-5 h-5 text-blue-600" />
    }
  }

  const getNotificationStyle = (type: ToastNotification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800'
    }
  }

  return (
    <>
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`max-w-sm w-full rounded-lg border p-4 shadow-lg transition-all duration-300 pointer-events-auto ${getNotificationStyle(notification.type)}`}
          >
            <div className="flex items-start space-x-3">
              {getNotificationIcon(notification.type)}
              <div className="flex-1">
                <h4 className="font-medium">{notification.title}</h4>
                <p className="text-sm opacity-90">{notification.message}</p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}