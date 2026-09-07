import React, { useState } from 'react';
import { 
  Calculator, 
  HardDrive, 
  Cloud, 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Check, 
  Layers, 
  Info,
  Camera,
  Activity
} from 'lucide-react';
import { calculateRetentionSizing, generateIniConfig } from '@/lib/videoXwareApi';

export default function StorageRetentionCalculator() {
  const [cameras, setCameras] = useState(8);
  const [bitrate, setBitrate] = useState(2.0);
  const [localDays, setLocalDays] = useState(30);
  const [cloudDays, setCloudDays] = useState(365);
  const [copied, setCopied] = useState(false);

  const sizing = calculateRetentionSizing(cameras, bitrate, localDays, cloudDays);
  const iniText = generateIniConfig(sizing.reportedTotalGb);

  const handleCopyIni = () => {
    navigator.clipboard.writeText(iniText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Description */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Calculator size={24} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Wasabi Cloud & Local Retention Sizing Calculator</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
          Calculate recommended <strong>reported_total_gb</strong> virtual cloud capacity for Nx Witness and verify local vs cloud disk retention ratio boundaries.
        </p>
      </div>

      {/* Input Parameters Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={18} style={{ color: 'var(--cyan)' }} />
          Deployment Parameters
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          {/* 1. Camera Count */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              <Camera size={14} style={{ display: 'inline', marginRight: '0.3rem' }} />
              Camera Count: <strong>{cameras}</strong>
            </label>
            <input 
              type="number"
              min="1"
              max="500"
              value={cameras}
              onChange={(e) => setCameras(Math.max(1, parseInt(e.target.value) || 1))}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white' }}
            />
          </div>

          {/* 2. Bitrate (Mbps) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              <Activity size={14} style={{ display: 'inline', marginRight: '0.3rem' }} />
              Typical Bitrate (Mbps): <strong>{bitrate} Mbps</strong>
            </label>
            <input 
              type="number"
              step="0.5"
              min="0.5"
              max="50"
              value={bitrate}
              onChange={(e) => setBitrate(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white' }}
            />
          </div>

          {/* 3. Local Days */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              <HardDrive size={14} style={{ display: 'inline', marginRight: '0.3rem' }} />
              Local Retention (Days): <strong>{localDays} days</strong>
            </label>
            <select 
              value={localDays}
              onChange={(e) => setLocalDays(parseInt(e.target.value))}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white' }}
            >
              <option value={14}>14 Days</option>
              <option value={30}>30 Days (Standard Customer Split)</option>
              <option value={40}>40 Days (Recommended Fix for Nx Flag)</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>

          {/* 4. Cloud Days */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              <Cloud size={14} style={{ display: 'inline', marginRight: '0.3rem' }} />
              Cloud Retention (Days): <strong>{cloudDays} days</strong>
            </label>
            <select 
              value={cloudDays}
              onChange={(e) => setCloudDays(parseInt(e.target.value))}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white' }}
            >
              <option value={90}>90 Days</option>
              <option value={180}>180 Days</option>
              <option value={365}>365 Days (1 Full Year)</option>
              <option value={730}>730 Days (2 Years)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Output Results Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {/* Daily Volume Card */}
        <div className="glass-panel metric-card card-cyan" style={{ padding: '1.25rem' }}>
          <span className="card-label">GB Per Camera / Day</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{sizing.gbPerCamPerDay}</span>
            <span className="card-unit">GB / day</span>
          </div>
          <div className="card-footer">
            <span>Formula: Bitrate × 10.8</span>
          </div>
        </div>

        {/* Local Storage Required Card */}
        <div className="glass-panel metric-card card-emerald" style={{ padding: '1.25rem' }}>
          <span className="card-label">Local Disk Sizing ({localDays} Days)</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{(sizing.localStorageGb / 1024).toFixed(2)}</span>
            <span className="card-unit">TB ({sizing.localStorageGb.toLocaleString()} GB)</span>
          </div>
          <div className="card-footer">
            <span>Daily All Cams: <strong>{sizing.totalDailyGb} GB/day</strong></span>
          </div>
        </div>

        {/* Wasabi Reported Total GB Card */}
        <div className="glass-panel metric-card card-purple" style={{ padding: '1.25rem' }}>
          <span className="card-label">reported_total_gb (INI Setting)</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{sizing.reportedTotalGb.toLocaleString()}</span>
            <span className="card-unit">GB (~{sizing.cloudStorageTb} TB)</span>
          </div>
          <div className="card-footer">
            <span>Formula: Cams × Bitrate × 3,942 × 1.2</span>
          </div>
        </div>
      </div>

      {/* Nx Storage Reserved Warning Banner & Recommendation */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '1.25rem 1.5rem', 
          borderColor: sizing.isNxReservedWarning ? 'var(--amber)' : 'var(--emerald)',
          background: sizing.isNxReservedWarning ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
          {sizing.isNxReservedWarning ? (
            <AlertTriangle size={22} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <CheckCircle2 size={22} style={{ color: 'var(--emerald)', flexShrink: 0, marginTop: '2px' }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: sizing.isNxReservedWarning ? '#fde68a' : '#a7f3d0', marginBottom: '0.3rem' }}>
              Retention Ratio: {sizing.retentionRatioPercent}% ({localDays} days local vs {cloudDays} days cloud)
            </div>
            <p style={{ fontSize: '0.85rem', color: '#e5e7eb', lineHeight: '1.5' }}>
              {sizing.recommendation}
            </p>
            {sizing.isNxReservedWarning && (
              <button 
                className="btn-icon" 
                onClick={() => setLocalDays(40)}
                style={{ marginTop: '0.75rem', background: 'var(--amber)', color: '#000', fontWeight: 600, padding: '0.4rem 0.8rem', borderRadius: '6px' }}
              >
                Apply 40-Day Local Retention Sizing ({ (sizing.localStorageGb40 / 1024).toFixed(2) } TB)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Generated INI File Configuration Snippet */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
            <Info size={18} style={{ color: 'var(--primary)' }} />
            Generated INI Configuration (videoXware_s3_storage.ini)
          </div>
          <button 
            className="btn-icon" 
            onClick={handleCopyIni}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.4rem' }}
          >
            {copied ? <Check size={14} style={{ color: 'var(--emerald)' }} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Config'}
          </button>
        </div>

        <pre style={{ 
          background: '#090d16', 
          padding: '1rem', 
          borderRadius: '10px', 
          border: '1px solid var(--border-subtle)', 
          fontFamily: 'var(--font-mono)', 
          fontSize: '0.85rem',
          color: '#38bdf8',
          overflowX: 'auto'
        }}>
          {iniText}
        </pre>
      </div>
    </div>
  );
}
