'use client'

import { Camera, MapPin, Wifi, WifiOff } from 'lucide-react'

export default function CameraStatusGrid() {
  const cameras = [
    { id: 'CAM-001', name: 'Main Entrance', location: 'Building A', status: 'online', type: 'Dome' },
    { id: 'CAM-002', name: 'Parking Lot North', location: 'Outdoor', status: 'online', type: 'PTZ' },
    { id: 'CAM-003', name: 'Reception Area', location: 'Building A', status: 'offline', type: 'Fixed' },
    { id: 'CAM-004', name: 'Server Room', location: 'Building B', status: 'online', type: 'Thermal' },
    { id: 'CAM-005', name: 'Emergency Exit', location: 'Building A', status: 'warning', type: 'Fixed' },
    { id: 'CAM-006', name: 'Loading Dock', location: 'Building C', status: 'online', type: 'PTZ' },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'offline':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Wifi className="w-4 h-4 text-green-600" />
      case 'offline':
        return <WifiOff className="w-4 h-4 text-red-600" />
      case 'warning':
        return <Wifi className="w-4 h-4 text-yellow-600" />
      default:
        return <Wifi className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Camera Status</h3>
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">Online (236)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-gray-600">Offline (12)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.map((camera) => (
          <div key={camera.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <Camera className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{camera.name}</h4>
                  <div className="flex items-center space-x-1 text-sm text-gray-500 mt-1">
                    <MapPin className="w-3 h-3" />
                    <span>{camera.location}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{camera.id} • {camera.type}</div>
                </div>
              </div>
              
              <div className="flex flex-col items-end space-y-2">
                {getStatusIcon(camera.status)}
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(camera.status)}`}>
                  {camera.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
          View all cameras →
        </button>
      </div>
    </div>
  )
}