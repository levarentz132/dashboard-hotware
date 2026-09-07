import React, { useState, useEffect, useCallback } from 'react';
import './videoxware.css';
import Header from './Header';
import Sidebar from './Sidebar';
import MetricCards from './MetricCards';
import MetricsChart from './MetricsChart';
import LogsViewer from './LogsViewer';
import AlertBanner from './AlertBanner';
import ExportModal from './ExportModal';
import LogFileParser from './LogFileParser';
import ApiSettingsModal from './ApiSettingsModal';
import StorageRetentionCalculator from './StorageRetentionCalculator';
import ArchiveVerificationTool from './ArchiveVerificationTool';
import DiagnosticReportTool from './DiagnosticReportTool';
import NxEventLogTool from './NxEventLogTool';
import CameraExplorer from './CameraExplorer';
import S3TestingTool from './S3TestingTool';
import NxCloudEmbed from './NxCloudEmbed';
import { fetchHealth, fetchMetrics, fetchLogs } from '@/lib/videoXwareApi';
import { LayoutDashboard, Clock, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [range, setRange] = useState('24h');
  const [logLevel, setLogLevel] = useState('all');
  
  const [healthData, setHealthData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [logsData, setLogsData] = useState([]);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30000); // default 30s
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Core Data Fetcher
  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const [hRes, mRes, lRes] = await Promise.all([
        fetchHealth(),
        fetchMetrics(range),
        fetchLogs(range, logLevel)
      ]);

      setHealthData(hRes);
      setMetricsData(mRes);
      setLogsData(lRes.logs || []);
      setLastUpdated(new Date());

      if (mRes.apiError) {
        setErrorMessage(`Connected to endpoint but encountered API notice: ${mRes.apiError}`);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setErrorMessage(err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [range, logLevel]);

  // Initial Load & Range/Log level change listener
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Auto Refresh Interval effect
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;
    const interval = setInterval(() => {
      loadDashboardData();
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadDashboardData]);

  const currentStatus = metricsData?.meta?.currentStatus || null;
  const samples = metricsData?.samples || [];
  const isMock = metricsData?.isMock ?? true;

  return (
    <div className="app-layout">
      {/* Left Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        health={healthData}
      />

      {/* Main Content Workspace */}
      <div className="main-wrapper">
        {/* Top Header Toolbar */}
        <Header 
          health={healthData}
          isMock={isMock}
          isRefreshing={isRefreshing}
          onRefresh={loadDashboardData}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenExport={() => setIsExportOpen(true)}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          onServerChange={loadDashboardData}
        />

        {/* Main Workspace View */}
        <main className="dashboard-container">
          {activeTab === 'dashboard' && (
            <>
              {/* Live Real-time Alert Banner */}
              <AlertBanner currentStatus={currentStatus} />

              {/* Error Message Alert if any */}
              {errorMessage && (
                <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--rose)', background: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <AlertCircle size={20} style={{ color: 'var(--rose)' }} />
                  <div style={{ fontSize: '0.9rem', color: '#fca5a5' }}>{errorMessage}</div>
                </div>
              )}

              {/* Global Toolbar & Range Selector */}
              <div className="section-bar">
                <div className="section-title">
                  <LayoutDashboard size={22} style={{ color: 'var(--primary)' }} />
                  VideoXware S3 Plugin Live Performance
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {lastUpdated && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={13} />
                      Updated {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}

                  <div className="range-selector">
                    {['1h', '24h', '7d'].map((r) => (
                      <button
                        key={r}
                        className={`range-btn ${range === r ? 'active' : ''}`}
                        onClick={() => setRange(r)}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 1. Metric Cards Grid */}
              <MetricCards currentStatus={currentStatus} />

              {/* 2. Time-series Performance Chart */}
              <MetricsChart samples={samples} rangeRequested={range} />

              {/* 3. Log Viewer */}
              <LogsViewer 
                logs={logsData} 
                levelFilter={logLevel} 
                onFilterChange={setLogLevel} 
              />
            </>
          )}

          {activeTab === 'cameras' && <CameraExplorer />}
          {activeTab === 's3test' && <S3TestingTool />}
          {activeTab === 'nxcloud' && <NxCloudEmbed onOpenSettings={() => setIsSettingsOpen(true)} />}
          {activeTab === 'nxevents' && <NxEventLogTool currentStatus={currentStatus} />}
          {activeTab === 'calculator' && <StorageRetentionCalculator />}
          {activeTab === 'verifier' && <ArchiveVerificationTool />}
          {activeTab === 'diagnostics' && <DiagnosticReportTool currentStatus={currentStatus} logs={logsData} />}
          {activeTab === 'parser' && <LogFileParser />}
        </main>
      </div>

      {/* Settings Modal */}
      <ApiSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onSave={loadDashboardData}
      />

      {/* Export Report Modal */}
      <ExportModal 
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        currentStatus={currentStatus}
        samples={samples}
        logs={logsData}
      />
    </div>
  );
}
