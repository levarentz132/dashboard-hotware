"use client";

import { Database, HardDrive, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { nxAPI } from "@/lib/nxapi";

interface StorageInfo {
  totalCapacity?: string;
  usedSpace?: string;
  availableSpace?: string;
  usagePercentage?: number;
  growthRate?: string;
  retentionDays?: number;
  compressionRatio?: string;
}

export default function StorageWidget() {
  const [storageData, setStorageData] = useState<StorageInfo>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to get storage info from Nx Witness API
        const storage = await nxAPI.getStorageInfo();
        if (storage) {
          setStorageData(storage);
        } else {
          // Use dummy data if API doesn't provide storage info
          setStorageData({
            totalCapacity: "50 TB",
            usedSpace: "39.2 TB",
            availableSpace: "10.8 TB",
            usagePercentage: 78.5,
            growthRate: "+2.3% this month",
            retentionDays: 30,
            compressionRatio: "4:1",
          });
        }
      } catch (err) {
        // Use dummy data on error
        console.log("Storage API not available, using dummy data");
        setStorageData({
          totalCapacity: "50 TB",
          usedSpace: "39.2 TB",
          availableSpace: "10.8 TB",
          usagePercentage: 78.5,
          growthRate: "+2.3% this month",
          retentionDays: 30,
          compressionRatio: "4:1",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStorageInfo();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Storage Management</h3>
          <Database className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-500">Loading storage information...</div>
        </div>
      </div>
    );
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Storage Management</h3>
        <Database className="w-5 h-5 text-gray-600" />
      </div>

      {/* Storage Usage Circle */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
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
              strokeDasharray={`${(storageData.usagePercentage || 0) * 2.827}, 283`}
              className={getUsageColor(storageData.usagePercentage || 0)}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <div className="text-2xl font-bold text-gray-900">{storageData.usagePercentage || 0}%</div>
            <div className="text-xs text-gray-600">Used</div>
          </div>
        </div>
      </div>

      {/* Storage Details */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Total Capacity</span>
          <span className="text-sm font-medium text-gray-900">{storageData.totalCapacity}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Used Space</span>
          <span className="text-sm font-medium text-gray-900">{storageData.usedSpace}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Available</span>
          <span className="text-sm font-medium text-gray-900">{storageData.availableSpace}</span>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-sm text-gray-600">Growth Rate</span>
          <span className="text-sm font-medium text-green-600 flex items-center">
            <TrendingUp className="w-3 h-3 mr-1" />
            {storageData.growthRate}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Retention</span>
          <span className="text-sm font-medium text-gray-900">{storageData.retentionDays} days</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Compression</span>
          <span className="text-sm font-medium text-gray-900">{storageData.compressionRatio}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="w-full text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center space-x-1">
          <HardDrive className="w-4 h-4" />
          <span>Manage Storage Settings</span>
        </button>
      </div>
    </div>
  );
}
