import React, { useState } from 'react';
import { 
  Camera, 
  Search, 
  Filter, 
  Cloud, 
  Video, 
  CheckCircle2, 
  AlertCircle, 
  HardDrive, 
  Grid, 
  List, 
  Folder, 
  ExternalLink,
  ShieldCheck,
  Activity,
  Layers
} from 'lucide-react';
import { fetchCameraList } from '@/lib/videoXwareApi';

export default function CameraExplorer() {
  const [cameras] = useState(() => fetchCameraList());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

  const filteredCameras = cameras.filter((cam) => {
    const matchesSearch = cam.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          cam.ip.includes(searchTerm) ||
                          cam.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || cam.nxStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalCams = cameras.length;
  const recordingCams = cameras.filter(c => c.nxStatus === 'RECORDING' || c.nxStatus === 'MOTION_ONLY').length;
  const totalUploadedGb = cameras.reduce((acc, c) => acc + c.uploadedGb, 0).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Camera size={24} style={{ color: 'var(--cyan)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Nx Witness Cameras & Wasabi S3 Storage Mapping</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              List of all CCTV cameras connected to your Nx Witness account mapped to their corresponding Wasabi S3 bucket paths.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              style={{ background: viewMode === 'grid' ? 'var(--primary)' : 'rgba(255,255,255,0.05)' }}
              title="Grid View"
            >
              <Grid size={16} />
              Grid
            </button>
            <button 
              className={`btn-icon ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              style={{ background: viewMode === 'table' ? 'var(--primary)' : 'rgba(255,255,255,0.05)' }}
              title="Table View"
            >
              <List size={16} />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <div className="glass-panel metric-card card-cyan" style={{ padding: '1.25rem' }}>
          <span className="card-label">Total Connected Cameras</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{totalCams}</span>
            <span className="card-unit">cams</span>
          </div>
          <div className="card-footer">
            <span>Nx Witness Account Cams</span>
          </div>
        </div>

        <div className="glass-panel metric-card card-emerald" style={{ padding: '1.25rem' }}>
          <span className="card-label">Active Recording Cameras</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value" style={{ color: '#34d399' }}>{recordingCams}</span>
            <span className="card-unit">/ {totalCams}</span>
          </div>
          <div className="card-footer">
            <CheckCircle2 size={14} style={{ color: '#34d399' }} />
            <span>Continuous & Motion Recording</span>
          </div>
        </div>

        <div className="glass-panel metric-card card-purple" style={{ padding: '1.25rem' }}>
          <span className="card-label">Wasabi S3 Cloud Storage Volume</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value">{totalUploadedGb}</span>
            <span className="card-unit">GB</span>
          </div>
          <div className="card-footer">
            <span>Bucket: <code>videoxware-archive-bucket</code></span>
          </div>
        </div>

        <div className="glass-panel metric-card card-amber" style={{ padding: '1.25rem' }}>
          <span className="card-label">S3 Sync Status</span>
          <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
            <span className="card-value" style={{ color: '#34d399' }}>100%</span>
          </div>
          <div className="card-footer">
            <ShieldCheck size={14} style={{ color: '#34d399' }} />
            <span>All cameras uploading smoothly</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              placeholder="Search camera by name, ID, or IP address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem 0.6rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nx Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="glass-input"
            style={{ padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="RECORDING">Recording</option>
            <option value="MOTION_ONLY">Motion Only</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>
      </div>

      {/* Main View: Grid Cards or Table */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredCameras.map((cam) => {
            const isRec = cam.nxStatus === 'RECORDING' || cam.nxStatus === 'MOTION_ONLY';

            return (
              <div 
                key={cam.id}
                className="glass-panel"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  borderColor: isRec ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-subtle)'
                }}
              >
                {/* Card Top Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Video size={16} style={{ color: 'var(--cyan)' }} />
                      {cam.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      IP: <code>{cam.ip}</code> | ID: <code>{cam.id}</code>
                    </div>
                  </div>

                  <span 
                    className="badge" 
                    style={{ 
                      background: isRec ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                      color: isRec ? '#34d399' : '#fb7185',
                      borderColor: isRec ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                      fontSize: '0.7rem'
                    }}
                  >
                    <span className="pulse-dot"></span>
                    {cam.nxStatus}
                  </span>
                </div>

                {/* Simulated Camera Video Frame Placeholder */}
                <div 
                  style={{ 
                    height: '140px', 
                    borderRadius: '10px', 
                    background: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)', 
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <Camera size={36} style={{ color: 'rgba(255,255,255,0.15)' }} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                    {cam.resolution} @ {cam.fps} FPS ({cam.bitrateMbps} Mbps)
                  </div>
                  
                  <div style={{ position: 'absolute', bottom: '8px', left: '10px', fontSize: '0.7rem', color: '#38bdf8', background: 'rgba(9,13,22,0.8)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    LIVE FEED STABILITY: 100%
                  </div>
                </div>

                {/* Wasabi S3 Bucket Mapping Section */}
                <div style={{ background: 'rgba(15,23,42,0.6)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--purple)', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Cloud size={14} />
                    Wasabi S3 Cloud Path:
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {cam.s3Prefix}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    <span>Uploaded: <strong>{cam.uploadedGb} GB</strong></span>
                    <span>Chunks: <strong>{cam.totalChunks.toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Table View */
        <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Camera Name & ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>IP & Model</th>
                <th style={{ padding: '0.75rem 1rem' }}>Resolution & Bitrate</th>
                <th style={{ padding: '0.75rem 1rem' }}>Nx Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Wasabi S3 Bucket Path</th>
                <th style={{ padding: '0.75rem 1rem' }}>Cloud Volume</th>
                <th style={{ padding: '0.75rem 1rem' }}>S3 Sync</th>
              </tr>
            </thead>
            <tbody>
              {filteredCameras.map((cam) => (
                <tr key={cam.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {cam.name} <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400 }}>{cam.id}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <code>{cam.ip}</code>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cam.model}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {cam.resolution}
                    <div style={{ fontSize: '0.75rem', color: 'var(--cyan)' }}>{cam.bitrateMbps} Mbps</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-online" style={{ fontSize: '0.75rem' }}>
                      {cam.nxStatus}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#38bdf8' }}>
                    {cam.s3Prefix}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {cam.uploadedGb} GB
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-online" style={{ fontSize: '0.75rem' }}>
                      <CheckCircle2 size={12} /> {cam.s3SyncStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
