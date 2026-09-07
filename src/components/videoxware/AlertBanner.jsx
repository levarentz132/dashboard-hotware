import React from 'react';
import { AlertOctagon, AlertTriangle, ShieldAlert, X } from 'lucide-react';

export default function AlertBanner({ currentStatus, onDismiss }) {
  if (!currentStatus) return null;

  const alerts = [];

  // 1. Files Dropped (Emergency Eviction / Data Loss)
  if (currentStatus.dropped > 0) {
    alerts.push({
      type: 'critical',
      icon: <AlertOctagon size={18} />,
      title: 'CRITICAL DATA LOSS WARNING (Files Dropped)',
      desc: `${currentStatus.dropped} recording file(s) were evicted from cache before uploading to cloud! Check cache disk size & upload bandwidth immediately.`
    });
  }

  // 2. Cloud Connection Offline
  if (currentStatus.cloudOnline === false) {
    alerts.push({
      type: 'critical',
      icon: <AlertOctagon size={18} />,
      title: 'S3 Connection Offline',
      desc: 'Media Server has lost connectivity to the target S3 cloud storage bucket.'
    });
  }

  // 3. Upload Stalled (Rate = 0 Mbps while items queued)
  if (currentStatus.uploadRateMbps === 0 && currentStatus.queueDepth > 0) {
    alerts.push({
      type: 'warning',
      icon: <AlertTriangle size={18} />,
      title: 'Upload Pipeline Stalled',
      desc: `Upload rate dropped to 0 Mbps while ${currentStatus.queueDepth} file(s) (${currentStatus.queueMb} MB) are pending in queue.`
    });
  }

  // 4. Cache Utilization (High 85% / Critical 95%)
  if (currentStatus.cachePercent >= 95) {
    alerts.push({
      type: 'critical',
      icon: <AlertOctagon size={18} />,
      title: 'Cache Capacity Critical (95%+)',
      desc: `Local cache usage is at ${currentStatus.cachePercent}%. Eviction of un-uploaded files is imminent if cache fills to 100%!`
    });
  } else if (currentStatus.cachePercent >= 85) {
    alerts.push({
      type: 'warning',
      icon: <AlertTriangle size={18} />,
      title: 'Cache Capacity High (85%+)',
      desc: `Local cache usage reached ${currentStatus.cachePercent}% (Threshold: <80%). High watermark exceeded.`
    });
  }

  // 5. S3 Error Rate High (> 5%)
  const s3Calls = currentStatus.s3APICalls || 0;
  const s3Errs = currentStatus.s3Errors || 0;
  const errorRatePercent = s3Calls > 0 ? (s3Errs / s3Calls) * 100 : 0;

  if (errorRatePercent > 5.0) {
    alerts.push({
      type: 'warning',
      icon: <AlertTriangle size={18} />,
      title: 'S3 API Error Rate High (>5%)',
      desc: `S3 error rate is elevated at ${errorRatePercent.toFixed(1)}% (${s3Errs} errors out of ${s3Calls} calls).`
    });
  }

  // 6. Upload Queue Backlog (> 5 items or 500 MB)
  if (currentStatus.queueDepth > 5 && currentStatus.uploadRateMbps > 0) {
    alerts.push({
      type: 'warning',
      icon: <AlertTriangle size={18} />,
      title: 'Upload Queue Backlog',
      desc: `Upload queue depth elevated (${currentStatus.queueDepth} items, ${currentStatus.queueMb} MB pending).`
    });
  }

  // 7. License Expiry
  if (currentStatus.licDaysLeft < 30) {
    alerts.push({
      type: 'info',
      icon: <ShieldAlert size={18} />,
      title: 'Camera License Expiring Soon',
      desc: `License expires in ${currentStatus.licDaysLeft} days (${currentStatus.licCamerasSeen}/${currentStatus.licCameraLimit} cams).`
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
      {alerts.map((alert, idx) => {
        const isCrit = alert.type === 'critical';
        const isWarn = alert.type === 'warning';
        const borderColor = isCrit ? 'var(--rose)' : isWarn ? 'var(--amber)' : 'var(--purple)';
        const bg = isCrit ? 'rgba(244, 63, 94, 0.12)' : isWarn ? 'rgba(245, 158, 11, 0.12)' : 'rgba(139, 92, 246, 0.12)';
        const textColor = isCrit ? '#fca5a5' : isWarn ? '#fde68a' : '#c4b5fd';

        return (
          <div 
            key={idx}
            className="glass-panel"
            style={{
              padding: '0.85rem 1.25rem',
              borderColor,
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
              <span style={{ color: borderColor }}>{alert.icon}</span>
              <div>
                <strong style={{ color: textColor, fontSize: '0.9rem' }}>{alert.title}: </strong>
                <span style={{ color: '#f3f4f6', fontSize: '0.85rem' }}>{alert.desc}</span>
              </div>
            </div>
            {onDismiss && (
              <button 
                onClick={() => onDismiss(idx)}
                style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
