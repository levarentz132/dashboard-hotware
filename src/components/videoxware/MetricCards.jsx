import React from 'react';
import { 
  Cloud, 
  CloudOff, 
  UploadCloud, 
  HardDrive, 
  Layers, 
  Database, 
  AlertTriangle, 
  Camera, 
  CheckCircle2, 
  XCircle,
  BarChart3
} from 'lucide-react';

export default function MetricCards({ currentStatus }) {
  if (!currentStatus) return null;

  const {
    cloudOnline,
    uploadRateMbps = 0,
    writeRateMbps = 0,
    queueDepth = 0,
    queueMb = 0,
    cachePercent = 0,
    cacheUsedGb = 0,
    uploaded = 0,
    failed = 0,
    retried = 0,
    dropped = 0,
    s3APICalls = 0,
    s3Errors = 0,
    licCamerasSeen = 0,
    licCameraLimit = 100,
    licDaysLeft = 0,
    licStateName = 'Licensed',
    estimatedUploadGb = 0
  } = currentStatus;

  const cacheColor = cachePercent > 80 ? 'var(--rose)' : cachePercent > 50 ? 'var(--amber)' : 'var(--cyan)';
  const licColor = licDaysLeft < 30 ? 'var(--rose)' : 'var(--purple)';

  return (
    <div className="metrics-grid">
      {/* 1. Cloud Connection Status */}
      <div className={`glass-panel metric-card ${cloudOnline ? 'card-emerald' : 'card-rose'}`}>
        <div className="card-header">
          <span className="card-label">S3 Cloud Status</span>
          {cloudOnline ? <Cloud className="card-icon" style={{ color: '#10b981' }} size={22} /> : <CloudOff className="card-icon" style={{ color: '#f43f5e' }} size={22} />}
        </div>
        <div className="card-value-container">
          <span className="card-value" style={{ color: cloudOnline ? '#34d399' : '#fb7185' }}>
            {cloudOnline ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
        <div className="card-footer">
          {cloudOnline ? <CheckCircle2 size={14} style={{ color: '#34d399' }} /> : <XCircle size={14} style={{ color: '#fb7185' }} />}
          <span>{cloudOnline ? 'S3 bucket reachable' : 'Target unreachable'}</span>
        </div>
      </div>

      {/* 2. Upload Rate */}
      <div className="glass-panel metric-card card-cyan">
        <div className="card-header">
          <span className="card-label">Upload Rate</span>
          <UploadCloud className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{uploadRateMbps}</span>
          <span className="card-unit">Mbps</span>
        </div>
        <div className="card-footer">
          <span>Write Speed: <strong>{writeRateMbps} Mbps</strong></span>
        </div>
      </div>

      {/* 3. Estimated Upload Volume (GB/TB) */}
      <div className="glass-panel metric-card card-emerald">
        <div className="card-header">
          <span className="card-label">Estimated Upload Volume</span>
          <BarChart3 className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{estimatedUploadGb > 1024 ? (estimatedUploadGb / 1024).toFixed(2) : estimatedUploadGb}</span>
          <span className="card-unit">{estimatedUploadGb > 1024 ? 'TB' : 'GB'}</span>
        </div>
        <div className="card-footer">
          <span>Total Files: <strong>{uploaded.toLocaleString()}</strong></span>
        </div>
      </div>

      {/* 4. Upload Queue */}
      <div className="glass-panel metric-card card-purple">
        <div className="card-header">
          <span className="card-label">Upload Queue</span>
          <Layers className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{queueDepth}</span>
          <span className="card-unit">items</span>
        </div>
        <div className="card-footer">
          <span>Pending Data: <strong>{queueMb} MB</strong></span>
        </div>
      </div>

      {/* 5. Cache Usage */}
      <div className="glass-panel metric-card" style={{ borderLeftColor: cacheColor }}>
        <div className="card-header">
          <span className="card-label">Local Cache</span>
          <HardDrive className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{cachePercent}%</span>
          <span className="card-unit">used</span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${Math.min(100, cachePercent)}%`, background: cacheColor }}></div>
        </div>
        <div className="card-footer" style={{ marginTop: '0.5rem' }}>
          <span>Cache Volume: <strong>{cacheUsedGb} GB</strong></span>
        </div>
      </div>

      {/* 6. Transfer Counters */}
      <div className="glass-panel metric-card card-emerald">
        <div className="card-header">
          <span className="card-label">File Operations</span>
          <Database className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{uploaded.toLocaleString()}</span>
          <span className="card-unit">files</span>
        </div>
        <div className="card-footer" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}>
          <div>
            <span>Retried: <strong>{retried}</strong> | Failed (Transient): <strong style={{ color: failed > 0 ? '#fde68a' : 'inherit' }}>{failed}</strong></span>
          </div>
          <div>
            <span>Dropped (Data Loss): <strong style={{ color: dropped > 0 ? '#fb7185' : '#34d399' }}>{dropped}</strong></span>
          </div>
        </div>
      </div>

      {/* 7. S3 API & Errors */}
      <div className="glass-panel metric-card card-amber">
        <div className="card-header">
          <span className="card-label">S3 API Calls</span>
          <AlertTriangle className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{s3APICalls.toLocaleString()}</span>
        </div>
        <div className="card-footer">
          <span>S3 Errors: <strong style={{ color: s3Errors > 0 ? '#fb7185' : '#34d399' }}>{s3Errors}</strong></span>
        </div>
      </div>

      {/* 8. License Status */}
      <div className="glass-panel metric-card card-purple">
        <div className="card-header">
          <span className="card-label">Camera License</span>
          <Camera className="card-icon" size={22} />
        </div>
        <div className="card-value-container">
          <span className="card-value">{licCamerasSeen} / {licCameraLimit}</span>
          <span className="card-unit">cams</span>
        </div>
        <div className="progress-bar-bg">
          <div 
            className="progress-bar-fill" 
            style={{ 
              width: `${Math.min(100, (licCamerasSeen / licCameraLimit) * 100)}%`, 
              background: licColor 
            }}
          ></div>
        </div>
        <div className="card-footer" style={{ marginTop: '0.5rem' }}>
          <span>Status: <strong>{licStateName}</strong> ({licDaysLeft} days left)</span>
        </div>
      </div>
    </div>
  );
}
