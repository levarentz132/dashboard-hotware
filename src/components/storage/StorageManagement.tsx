'use client'

import { Database, HardDrive, TrendingUp, AlertCircle, Server, Trash2, Settings, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { nxAPI } from '@/lib/nxapi'

interface StorageDevice {
  id: string
  name: string
  path: string
  totalSpace: string
  usedSpace: string
  freeSpace: string
  usagePercentage: number
  status: 'healthy' | 'warning' | 'critical'
  type: 'local' | 'network' | 'cloud'
}

export default function StorageManagement() {
  const [loading, setLoading] = useState(true)
  const [storageDevices, setStorageDevices] = useState<StorageDevice[]>([])
  const [totalStorage, setTotalStorage] = useState({
    total: '50 TB',
    used: '39.2 TB',
    free: '10.8 TB',
    usagePercentage: 78.5
  })

  useEffect(() => {
    const fetchStorageData = async () => {
      try {
        setLoading(true)
        
        // Try to fetch from API
        const storage = await nxAPI.getStorageInfo()
        
        // Use dummy data for now
        setStorageDevices([
          {
            id: 'storage-1',
            name: 'Primary Storage',
            path: 'C:\\NxWitness\\MediaData',
            totalSpace: '30 TB',
            usedSpace: '24.5 TB',
            freeSpace: '5.5 TB',
            usagePercentage: 81.7,
            status: 'warning',
            type: 'local'
          },
          {
            id: 'storage-2',
            name: 'Secondary Storage',
            path: 'D:\\Archive',
            totalSpace: '20 TB',
            usedSpace: '14.7 TB',
            freeSpace: '5.3 TB',
            usagePercentage: 73.5,
            status: 'healthy',
            type: 'local'
          },
          {
            id: 'storage-3',
            name: 'Network Storage',
            path: '\\\\NAS01\\Recordings',
            totalSpace: '10 TB',
            usedSpace: '8.2 TB',
            freeSpace: '1.8 TB',
            usagePercentage: 82.0,
            status: 'warning',
            type: 'network'
          }
        ])
      } catch (error) {
        console.error('Failed to fetch storage data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStorageData()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'local':
        return <HardDrive className="w-5 h-5" />
      case 'network':
        return <Server className="w-5 h-5" />
      case 'cloud':
        return <Database className="w-5 h-5" />
      default:
        return <HardDrive className="w-5 h-5" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Storage Management</h1>
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-500">Loading storage information...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Storage Management</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
          <Settings className="w-4 h-4" />
          <span>Configure Storage</span>
        </button>
      </div>

      {/* Overall Storage Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Capacity</span>
            <Database className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalStorage.total}</div>
          <div className="text-xs text-gray-500 mt-1">Across all devices</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Used Space</span>
            <HardDrive className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalStorage.used}</div>
          <div className="text-xs text-gray-500 mt-1">{totalStorage.usagePercentage}% utilized</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Free Space</span>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalStorage.free}</div>
          <div className="text-xs text-gray-500 mt-1">Available for recordings</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Storage Devices</span>
            <Server className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{storageDevices.length}</div>
          <div className="text-xs text-gray-500 mt-1">Active devices</div>
        </div>
      </div>

      {/* Overall Usage Visualization */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Overall Storage Usage</h2>
        <div className="flex items-center space-x-6">
          <div className="relative w-40 h-40">
            <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-gray-200"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={`${totalStorage.usagePercentage * 2.827}, 283`}
                className={getUsageColor(totalStorage.usagePercentage)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <div className="text-3xl font-bold text-gray-900">{totalStorage.usagePercentage}%</div>
              <div className="text-sm text-gray-600">Used</div>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Total Capacity</span>
                <span className="font-medium text-gray-900">{totalStorage.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Used Space</span>
                <span className="font-medium text-gray-900">{totalStorage.used}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className={`h-2 rounded-full ${totalStorage.usagePercentage >= 90 ? 'bg-red-500' : totalStorage.usagePercentage >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${totalStorage.usagePercentage}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Free Space</span>
                <span className="font-medium text-gray-900">{totalStorage.free}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${100 - totalStorage.usagePercentage}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Devices List */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Storage Devices</h2>
          <button className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1">
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>

        <div className="space-y-4">
          {storageDevices.map((device) => (
            <div key={device.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg ${device.status === 'healthy' ? 'bg-green-50' : device.status === 'warning' ? 'bg-yellow-50' : 'bg-red-50'}`}>
                    {getTypeIcon(device.type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{device.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{device.path}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(device.status)}`}>
                        {device.status}
                      </span>
                      <span className="text-xs text-gray-500">{device.type}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Settings className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <span className="text-xs text-gray-600">Total</span>
                  <div className="text-sm font-medium text-gray-900">{device.totalSpace}</div>
                </div>
                <div>
                  <span className="text-xs text-gray-600">Used</span>
                  <div className="text-sm font-medium text-gray-900">{device.usedSpace}</div>
                </div>
                <div>
                  <span className="text-xs text-gray-600">Free</span>
                  <div className="text-sm font-medium text-gray-900">{device.freeSpace}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Usage</span>
                  <span>{device.usagePercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${getUsageColor(device.usagePercentage)}`}
                    style={{ width: `${device.usagePercentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Storage Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Retention Settings</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Default Retention Period</span>
              <span className="text-sm font-medium text-gray-900">30 days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Archive Retention</span>
              <span className="text-sm font-medium text-gray-900">90 days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Motion-based Recording</span>
              <span className="text-sm font-medium text-green-600">Enabled</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Auto-cleanup</span>
              <span className="text-sm font-medium text-green-600">Active</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Compression & Quality</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Compression Ratio</span>
              <span className="text-sm font-medium text-gray-900">4:1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Recording Quality</span>
              <span className="text-sm font-medium text-gray-900">High</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Stream Quality</span>
              <span className="text-sm font-medium text-gray-900">1080p</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Dual Stream</span>
              <span className="text-sm font-medium text-green-600">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
