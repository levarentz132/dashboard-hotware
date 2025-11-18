'use client'

import { BarChart3, TrendingUp, PieChart, Activity, Calendar, Download } from 'lucide-react'

import { useCameras, useEvents } from '@/hooks/useNxAPI'

export default function Analytics() {
  const { cameras, loading: camerasLoading } = useCameras()
  const { events, loading: eventsLoading } = useEvents()

  // Calculate real analytics from API data
  const totalEvents = events?.length || 0
  const onlineCameras = cameras?.filter(c => c.status?.toLowerCase() === 'online').length || 0
  const totalCameras = cameras?.length || 0
  const uptime = totalCameras > 0 ? ((onlineCameras / totalCameras) * 100).toFixed(1) : '0'

  const analyticsCards = [
    {
      title: 'Event Analytics',
      description: 'Recent events and activity',
      icon: Activity,
      metrics: [
        { label: 'Events', value: eventsLoading ? '...' : totalEvents.toString() },
        { label: 'Active Cameras', value: camerasLoading ? '...' : onlineCameras.toString() },
        { label: 'Total Devices', value: camerasLoading ? '...' : totalCameras.toString() }
      ]
    },
    {
      title: 'Camera Performance',
      description: 'System uptime and availability',
      icon: BarChart3,
      metrics: [
        { label: 'System Uptime', value: camerasLoading ? '...' : `${uptime}%` },
        { label: 'Online Cameras', value: camerasLoading ? '...' : onlineCameras.toString() },
        { label: 'Connection Status', value: totalCameras > 0 ? 'Active' : 'No Data' }
      ]
    },
    {
      title: 'System Overview',
      description: 'Real-time system information',
      icon: PieChart,
      metrics: [
        { label: 'Daily Growth', value: '2.3 GB' },
        { label: 'Compression', value: '4:1' },
        { label: 'Days Remaining', value: '45' }
      ]
    },
    {
      title: 'Business Intelligence',
      description: 'Operational insights and KPIs',
      icon: TrendingUp,
      metrics: [
        { label: 'Peak Activity', value: 'Monday 9AM' },
        { label: 'Quiet Hours', value: '11PM-5AM' },
        { label: 'Weekly Growth', value: '+12%' }
      ]
    }
  ]

  const reports = [
    {
      name: 'Weekly Security Report',
      description: 'Comprehensive security events summary',
      lastGenerated: '2 hours ago',
      type: 'PDF'
    },
    {
      name: 'Camera Health Report',
      description: 'System performance and uptime analysis',
      lastGenerated: '1 day ago',
      type: 'Excel'
    },
    {
      name: 'Storage Utilization Report',
      description: 'Storage consumption and forecasting',
      lastGenerated: '3 hours ago',
      type: 'PDF'
    },
    {
      name: 'Event Analytics Dashboard',
      description: 'Interactive analytics and visualizations',
      lastGenerated: 'Real-time',
      type: 'Web'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Analytics & Business Intelligence</h1>
        <div className="flex items-center space-x-4">
          <button className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
            <Calendar className="w-4 h-4" />
            <span>Date Range</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="w-4 h-4" />
            <span>Export Data</span>
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {analyticsCards.map((card, index) => {
          const Icon = card.icon
          return (
            <div key={index} className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                  <p className="text-sm text-gray-600">{card.description}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {card.metrics.map((metric, metricIndex) => (
                  <div key={metricIndex} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{metric.label}</span>
                    <span className="text-sm font-medium text-gray-900">{metric.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events Timeline Chart */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Timeline (24h)</h3>
          <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Event timeline chart will be displayed here</p>
              <p className="text-sm">Integration with charting library required</p>
            </div>
          </div>
        </div>

        {/* Camera Status Distribution */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Camera Status Distribution</h3>
          <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Status distribution chart will be displayed here</p>
              <p className="text-sm">Integration with charting library required</p>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
        <div className="h-80 bg-gray-50 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Performance trends visualization will be displayed here</p>
            <p className="text-sm">Charts showing CPU, memory, network, and storage trends</p>
          </div>
        </div>
      </div>

      {/* Heatmaps and Advanced Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Motion Heatmap */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Motion Detection Heatmap</h3>
          <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Motion heatmap visualization</p>
              <p className="text-sm">Shows activity patterns across locations</p>
            </div>
          </div>
        </div>

        {/* IoT Sensor Data */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">IoT Sensor Integration</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Temperature Sensors</span>
              <span className="text-sm text-green-600">22.5°C avg</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Humidity Sensors</span>
              <span className="text-sm text-blue-600">45% avg</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Occupancy Counters</span>
              <span className="text-sm text-purple-600">127 people</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Air Quality Index</span>
              <span className="text-sm text-yellow-600">Good (42 AQI)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reports Section */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Generated Reports</h3>
          <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            View all reports →
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((report, index) => (
            <div key={index} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium text-gray-900">{report.name}</h4>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {report.type}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{report.description}</p>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Last: {report.lastGenerated}</span>
                <button className="text-blue-600 hover:text-blue-800 text-sm">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}