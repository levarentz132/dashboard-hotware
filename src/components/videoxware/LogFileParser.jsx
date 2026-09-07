import React, { useState } from 'react';
import { FileText, Upload, CheckCircle2, TrendingUp, AlertTriangle } from 'lucide-react';
import { parseLogFileContent } from '@/lib/videoXwareApi';
import MetricsChart from './MetricsChart';
import LogsViewer from './LogsViewer';

export default function LogFileParser() {
  const [fileText, setFileText] = useState('');
  const [parsedData, setParsedData] = useState(null);

  const sampleLogText = `[STATUS] 2026-08-20 08:00:00 cloudOnline=true uploadRateMbps=82.5 writeRateMbps=78.1 queueDepth=0 queueMb=0.0 cachePercent=12.4 uploaded=8400 s3Errors=0
[STATUS] 2026-08-20 08:15:00 cloudOnline=true uploadRateMbps=89.1 writeRateMbps=84.2 queueDepth=1 queueMb=14.5 cachePercent=14.1 uploaded=8428 s3Errors=0
[STATUS] 2026-08-20 08:30:00 cloudOnline=true uploadRateMbps=76.4 writeRateMbps=72.0 queueDepth=3 queueMb=44.2 cachePercent=18.5 uploaded=8455 s3Errors=1
[WARN] 2026-08-20 08:31:12 Cache disk usage exceeded threshold 80%
[STATUS] 2026-08-20 08:45:00 cloudOnline=true uploadRateMbps=91.0 writeRateMbps=86.5 queueDepth=0 queueMb=0.0 cachePercent=11.2 uploaded=8490 s3Errors=0
[STATUS] 2026-08-20 09:00:00 cloudOnline=true uploadRateMbps=84.0 writeRateMbps=80.1 queueDepth=0 queueMb=0.0 cachePercent=10.8 uploaded=8520 s3Errors=0`;

  const handleParse = (textToParse) => {
    const res = parseLogFileContent(textToParse);
    setParsedData(res);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      setFileText(content);
      handleParse(content);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div className="section-title" style={{ marginBottom: '0.75rem' }}>
          <FileText size={22} style={{ color: 'var(--purple)' }} />
          Durable History Parser (`videoxware_s3_metrics.log`)
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Media Server resets in-memory history upon restart. For durable long-term metrics (up to 90 days), load or paste content from <code>videoxware_s3_metrics.log</code> in the plugin folder.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <Upload size={16} />
            Upload log file
            <input type="file" accept=".log,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>

          <button 
            className="btn-icon" 
            onClick={() => {
              setFileText(sampleLogText);
              handleParse(sampleLogText);
            }}
          >
            Load Sample Log Data
          </button>
        </div>

        <textarea 
          className="input-field" 
          rows={6}
          placeholder="Paste videoxware_s3_metrics.log content here..."
          value={fileText}
          onChange={(e) => setFileText(e.target.value)}
        />

        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={() => handleParse(fileText)}>
            Parse Log File
          </button>
        </div>
      </div>

      {/* Parsed Results */}
      {parsedData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--emerald)' }}>
            <CheckCircle2 size={24} style={{ color: '#34d399' }} />
            <div>
              <div style={{ fontWeight: 700, color: '#f3f4f6' }}>Successfully Parsed {parsedData.lineCount} Lines</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Extracted {parsedData.samples.length} status metric intervals and {parsedData.logs.length} error/warning entries.
              </div>
            </div>
          </div>

          {parsedData.samples.length > 0 && (
            <MetricsChart samples={parsedData.samples} rangeRequested="Log File History" />
          )}

          {parsedData.logs.length > 0 && (
            <LogsViewer logs={parsedData.logs} levelFilter="all" onFilterChange={() => {}} />
          )}
        </div>
      )}
    </div>
  );
}
