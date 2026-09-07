import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { TrendingUp, Layers } from 'lucide-react';

export default function MetricsChart({ samples, rangeRequested }) {
  if (!samples || samples.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        No historical sample data available.
      </div>
    );
  }

  // Format samples for chart display
  const chartData = samples.map(s => {
    const d = new Date(s.tMs);
    let timeLabel = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    if (rangeRequested === '7d') {
      timeLabel = `${d.getMonth() + 1}/${d.getDate()} ${timeLabel}`;
    }
    return {
      time: timeLabel,
      uploadMbps: s.uploadRateMbps || 0,
      writeMbps: s.writeRateMbps || 0,
      queueDepth: s.queueDepth || 0,
      queueMb: s.queueMb || 0,
      cachePercent: s.cachePercent || 0
    };
  });

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div className="section-bar" style={{ marginBottom: '1.25rem' }}>
        <div className="section-title">
          <TrendingUp size={20} style={{ color: 'var(--cyan)' }} />
          Network & Queue Performance Timeline ({rangeRequested})
        </div>
      </div>

      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id="colorQueue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            
            <Tooltip 
              contentStyle={{ 
                background: 'rgba(15, 23, 42, 0.95)', 
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px',
                color: '#f3f4f6',
                fontFamily: 'JetBrains Mono, monospace'
              }}
            />
            
            <Legend wrapperStyle={{ paddingTop: '10px' }} />

            <Area 
              type="monotone" 
              dataKey="uploadMbps" 
              name="Upload Rate (Mbps)" 
              stroke="#06b6d4" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorUpload)" 
            />
            <Area 
              type="monotone" 
              dataKey="writeMbps" 
              name="Write Rate (Mbps)" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorWrite)" 
            />
            <Area 
              type="monotone" 
              dataKey="queueDepth" 
              name="Queue Depth (items)" 
              stroke="#f59e0b" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorQueue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
