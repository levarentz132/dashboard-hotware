'use client'

import { Camera, Activity, AlertTriangle, Database, TrendingUp, Users, Wifi, WifiOff } from 'lucide-react'
import { useCameras, useAlarms, useSystemInfo, useRealTimeUpdates } from '@/hooks/useNxAPI'
import StatsCard from '@/components/ui/StatsCard'
import SystemStatusWidget from '@/components/widgets/SystemStatusWidget'
import CameraStatusGrid from '@/components/widgets/CameraStatusGrid'
import RecentAlarmsWidget from '@/components/widgets/RecentAlarmsWidget'
import StorageWidget from '@/components/widgets/StorageWidget'
import APIStatusWidget from '@/components/widgets/APIStatusWidget'
import ConnectionStatusWidget from '@/components/widgets/ConnectionStatusWidget'

export default function DashboardOverview() {
  // API hooks
  const { cameras, loading: camerasLoading } = useCameras()
  const { alarms, loading: alarmsLoading } = useAlarms()
  const { systemInfo, connected } = useSystemInfo()
  const { isConnected: realtimeConnected, lastUpdate } = useRealTimeUpdates()

  // Calculate real stats from API data
  const totalCameras = cameras.length
  const onlineCameras = cameras.filter(c => c.status.toLowerCase() === 'online').length
  const offlineCameras = totalCameras - onlineCameras
  const activeAlarms = alarms.filter(a => a.type !== 'resolved').length
  
  const stats = [
    {
      title: 'Total Cameras',
      value: camerasLoading ? '...' : totalCameras.toString(),
      change: totalCameras > 0 ? `+${Math.floor(totalCameras * 0.05)}` : '0',
      changeType: 'positive' as const,
      icon: Camera,
    },
    {
      title: 'Online Cameras',
      value: camerasLoading ? '...' : onlineCameras.toString(),
      change: onlineCameras > 0 ? `+${Math.floor(onlineCameras * 0.02)}` : '0',
      changeType: 'positive' as const,
      icon: Activity,
    },
    {
      title: 'Active Alarms',
      value: alarmsLoading ? '...' : activeAlarms.toString(),
      change: activeAlarms > 0 ? `-${Math.floor(activeAlarms * 0.5)}` : '0',
      changeType: activeAlarms > 0 ? 'negative' as const : 'positive' as const,
      icon: AlertTriangle,
    },
    {
      title: 'Storage Usage',
      value: '78.5%',
      change: '+2.3%',
      changeType: 'neutral' as const,
      icon: Database,
    },
    {
      title: 'Daily Events',
      value: '1,247',
      change: '+156',
      changeType: 'positive' as const,
      icon: TrendingUp,
    },
    {
      title: 'Active Users',
      value: '23',
      change: '+3',
      changeType: 'positive' as const,
      icon: Users,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <div className="flex items-center space-x-4 text-sm">
          {/* Nx Witness Connection */}
          <div className="flex items-center space-x-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
            <span className={connected ? 'text-green-600' : 'text-red-600'}>
              Nx Witness {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {/* Real-time Updates */}
          <div className="flex items-center space-x-2 text-gray-600">
            <div className={`w-2 h-2 rounded-full ${
              realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span>Real-time updates</span>
            {lastUpdate && (
              <span className="text-xs text-gray-500">
                (Last: {lastUpdate.toLocaleTimeString()})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </div>

      {/* Connection Status - Full Width */}
      <ConnectionStatusWidget className="mb-4" />

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1">
          <SystemStatusWidget />
        </div>
        <div className="xl:col-span-1">
          <APIStatusWidget />
        </div>
        <div className="xl:col-span-2">
          <CameraStatusGrid />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentAlarmsWidget />
        <StorageWidget />
      </div>
    </div>
  )
}