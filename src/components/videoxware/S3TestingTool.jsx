import React, { useState } from 'react';
import { 
  TestTube, 
  Play, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Cloud, 
  ShieldCheck, 
  HardDrive, 
  Clock, 
  Activity,
  Layers,
  Check,
  AlertTriangle,
  Info,
  Server
} from 'lucide-react';
import { runS3DiagnosticTest } from '@/lib/videoXwareApi';

export default function S3TestingTool() {
  const [endpoint, setEndpoint] = useState('https://s3.wasabisys.com');
  const [bucket, setBucket] = useState('videoxware-archive-bucket');
  const [region, setRegion] = useState('ap-southeast-1');
  const [chunkSizeMb, setChunkSizeMb] = useState(5);
  
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleRunTest = async () => {
    setIsRunning(true);
    setTestResult(null);
    try {
      // Simulate real step-by-step diagnostic execution
      const res = await runS3DiagnosticTest({ endpoint, bucket, region, chunkSizeMb });
      setTimeout(() => {
        setTestResult(res);
        setIsRunning(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setIsRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <TestTube size={24} style={{ color: 'var(--amber)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Wasabi S3 Bucket Connection & Read-Write Diagnostic Suite</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Run on-demand diagnostic tests to verify Wasabi S3 endpoint connectivity, credentials, <code>PutObject</code> / <code>GetObject</code> permissions, and bandwidth throughput.
            </p>
          </div>

          <button 
            className="btn-icon"
            onClick={handleRunTest}
            disabled={isRunning}
            style={{ background: 'var(--amber)', color: '#000', fontWeight: 700, padding: '0.65rem 1.3rem', borderRadius: '8px', fontSize: '0.9rem' }}
          >
            <Play size={16} fill="#000" className={isRunning ? 'spin' : ''} />
            {isRunning ? 'Running Diagnostic Tests...' : 'Run S3 Diagnostic Test'}
          </button>
        </div>
      </div>

      {/* Wasabi S3 Test Parameters Input Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Server size={18} style={{ color: 'var(--cyan)' }} />
          Wasabi S3 Target Configuration
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          {/* 1. Endpoint URL */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Wasabi S3 Endpoint URL:
            </label>
            <input 
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.85rem' }}
            />
          </div>

          {/* 2. Target Bucket Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Target Bucket Name:
            </label>
            <input 
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.85rem' }}
            />
          </div>

          {/* 3. Wasabi Region */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Wasabi S3 Region:
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.85rem' }}
            >
              <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
              <option value="ap-northeast-1">ap-northeast-1 (Tokyo)</option>
              <option value="us-east-1">us-east-1 (N. Virginia)</option>
              <option value="eu-central-1">eu-central-1 (Amsterdam)</option>
            </select>
          </div>

          {/* 4. Test Chunk Size */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Sample Chunk Size (MB):
            </label>
            <input 
              type="number"
              min="1"
              max="50"
              value={chunkSizeMb}
              onChange={(e) => setChunkSizeMb(parseInt(e.target.value) || 5)}
              className="glass-input"
              style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

      {/* Test Execution Summary Cards (Shown when test finishes) */}
      {testResult && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="glass-panel metric-card card-emerald" style={{ padding: '1.25rem' }}>
              <span className="card-label">Overall Diagnostic Result</span>
              <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
                <span className="card-value" style={{ color: '#34d399' }}>{testResult.overallResult}</span>
              </div>
              <div className="card-footer">
                <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                <span>{testResult.passedTests} of {testResult.totalTests} Diagnostic Steps Passed</span>
              </div>
            </div>

            <div className="glass-panel metric-card card-cyan" style={{ padding: '1.25rem' }}>
              <span className="card-label">Average S3 Latency</span>
              <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
                <span className="card-value">{testResult.averageLatencyMs}</span>
                <span className="card-unit">ms</span>
              </div>
              <div className="card-footer">
                <span>HTTPS Round-trip Handshake</span>
              </div>
            </div>

            <div className="glass-panel metric-card card-purple" style={{ padding: '1.25rem' }}>
              <span className="card-label">Measured Upload Bandwidth</span>
              <div className="card-value-container" style={{ margin: '0.75rem 0' }}>
                <span className="card-value">{testResult.benchmarkMbps}</span>
                <span className="card-unit">Mbps</span>
              </div>
              <div className="card-footer">
                <span>Burst Throughput Test</span>
              </div>
            </div>
          </div>

          {/* Step-by-Step Test Results Table */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} style={{ color: 'var(--emerald)' }} />
              Step-by-Step Diagnostic Audit Trail
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {testResult.testSteps.map((step, idx) => (
                <div 
                  key={step.id}
                  style={{
                    background: 'rgba(15,23,42,0.6)',
                    padding: '1rem 1.25rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>Step {idx + 1}:</span>
                      {step.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{step.latencyMs} ms</span>
                      <span className="badge badge-online" style={{ fontSize: '0.75rem' }}>
                        <Check size={12} /> {step.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {step.detail}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                    ➜ {step.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
