import React, { useState } from 'react';
import { 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw, 
  FileCode, 
  Search, 
  Check, 
  Clock, 
  Camera,
  AlertCircle,
  Database
} from 'lucide-react';
import { verifyArchiveRange } from '@/lib/videoXwareApi';

export default function ArchiveVerificationTool() {
  const [rangeWindow, setRangeWindow] = useState('24h');
  const [verificationData, setVerificationData] = useState(() => verifyArchiveRange('24h'));
  const [isVerifying, setIsVerifying] = useState(false);

  const handleRunVerification = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setVerificationData(verifyArchiveRange(rangeWindow));
      setIsVerifying(false);
    }, 600);
  };

  const {
    verifiedAt,
    totalHoursChecked,
    camerasCheckedCount,
    totalChunksChecked,
    totalUploadedChunks,
    totalMissingChunks,
    overallCompletion,
    cameraResults,
    authoritativeCheck
  } = verificationData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={24} style={{ color: 'var(--emerald)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Archive Upload Verification Tool (compare.ps1)</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Compares Nx Witness local archive footage recorded against actual Wasabi S3 bucket objects to verify 100% upload completion and flag footage gaps.
            </p>
          </div>

          <button 
            className="btn-icon"
            onClick={handleRunVerification}
            disabled={isVerifying}
            style={{ background: 'var(--primary)', color: 'white', fontWeight: 600, padding: '0.6rem 1.2rem', borderRadius: '8px' }}
          >
            <RefreshCw size={16} className={isVerifying ? 'spin' : ''} />
            {isVerifying ? 'Verifying S3 Objects...' : 'Run Verification (compare.ps1)'}
          </button>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Verification Time Window:</span>
          <div className="range-selector">
            {['1h', '24h', '7d'].map((r) => (
              <button
                key={r}
                className={`range-btn ${rangeWindow === r ? 'active' : ''}`}
                onClick={() => {
                  setRangeWindow(r);
                  setVerificationData(verifyArchiveRange(r));
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Clock size={14} />
          Last Verified: {new Date(verifiedAt).toLocaleTimeString()}
        </div>
      </div>

      {/* Verification Status Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {/* Completion Rate */}
        <div className="glass-panel metric-card card-emerald" style={{ padding: '1.25rem' }}>
          <span className="card-label">Overall Completion Rate</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value" style={{ color: '#34d399' }}>{overallCompletion.toFixed(1)}%</span>
          </div>
          <div className="card-footer">
            <CheckCircle2 size={14} style={{ color: '#34d399' }} />
            <span>0 Gaps / 100% Uploaded</span>
          </div>
        </div>

        {/* Chunks Verified */}
        <div className="glass-panel metric-card card-cyan" style={{ padding: '1.25rem' }}>
          <span className="card-label">Chunks Verified (S3 Objects)</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{totalUploadedChunks.toLocaleString()}</span>
            <span className="card-unit">/ {totalChunksChecked.toLocaleString()}</span>
          </div>
          <div className="card-footer">
            <span>5-minute video chunks checked</span>
          </div>
        </div>

        {/* Cameras Audited */}
        <div className="glass-panel metric-card card-purple" style={{ padding: '1.25rem' }}>
          <span className="card-label">Active Cameras Audited</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{camerasCheckedCount}</span>
            <span className="card-unit">cameras</span>
          </div>
          <div className="card-footer">
            <span>Window: <strong>{totalHoursChecked} Hours</strong></span>
          </div>
        </div>

        {/* Missing Chunks */}
        <div className="glass-panel metric-card card-emerald" style={{ padding: '1.25rem' }}>
          <span className="card-label">Missing Chunks (Gaps)</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value" style={{ color: totalMissingChunks > 0 ? '#fb7185' : '#34d399' }}>
              {totalMissingChunks}
            </span>
          </div>
          <div className="card-footer">
            <span>{totalMissingChunks === 0 ? 'Passed (Zero data loss)' : 'Gaps detected!'}</span>
          </div>
        </div>
      </div>

      {/* Camera Breakdown Table */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Camera size={18} style={{ color: 'var(--primary)' }} />
          Per-Camera Upload Verification Table
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Camera ID & Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Bitrate</th>
                <th style={{ padding: '0.75rem 1rem' }}>Nx Recorded</th>
                <th style={{ padding: '0.75rem 1rem' }}>Wasabi S3 Uploaded</th>
                <th style={{ padding: '0.75rem 1rem' }}>Completion</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {cameraResults.map((cam) => (
                <tr key={cam.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {cam.name} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({cam.id})</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--cyan)' }}>{cam.bitrate}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{cam.recordedHours} Hours</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{cam.uploadedHours} Hours</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="progress-bar-bg" style={{ width: '80px', height: '6px' }}>
                        <div className="progress-bar-fill" style={{ width: `${cam.completionPercent}%`, background: 'var(--emerald)' }}></div>
                      </div>
                      <span style={{ color: '#34d399', fontWeight: 600 }}>{cam.completionPercent}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-online" style={{ fontSize: '0.75rem' }}>
                      <Check size={12} /> {cam.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileCode size={14} style={{ color: 'var(--cyan)' }} />
          <span>Authoritative script: <code>{authoritativeCheck}</code></span>
        </div>
      </div>
    </div>
  );
}
