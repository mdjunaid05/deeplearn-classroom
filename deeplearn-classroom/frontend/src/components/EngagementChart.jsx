import React from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, Legend,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-lg px-3 py-2 text-xs">
        <p className="text-slate-300 mb-1">{`Activity ${label}`}</p>
        {payload.map((entry, idx) => (
          <p key={idx} style={{ color: entry.color }} className="font-semibold">
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function EngagementLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="activity_id"
          stroke="#64748b"
          fontSize={11}
          tickLine={false}
        />
        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="quiz_score"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ fill: '#6366f1', r: 3 }}
          activeDot={{ r: 5, fill: '#818cf8' }}
          name="Quiz Score"
        />
        <Line
          type="monotone"
          dataKey="participation_count"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ fill: '#22c55e', r: 3 }}
          name="Participation"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function EngagementAreaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="partGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="period" stroke="#64748b" fontSize={11} tickLine={false} />
        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="high_engagement_pct"
          stroke="#6366f1"
          fillOpacity={1}
          fill="url(#engGrad)"
          strokeWidth={2}
          name="High Engagement %"
        />
        <Area
          type="monotone"
          dataKey="active_behaviour_pct"
          stroke="#22c55e"
          fillOpacity={1}
          fill="url(#partGrad)"
          strokeWidth={2}
          name="Active Behaviour %"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EngagementGauge({ score, label }) {
  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const data = [
    { name: label || 'Engagement', value: normalizedScore, fill: '#6366f1' },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadialBarChart
        cx="50%"
        cy="50%"
        innerRadius="60%"
        outerRadius="90%"
        barSize={12}
        data={data}
        startAngle={180}
        endAngle={0}
      >
        <RadialBar
          background={{ fill: 'rgba(255,255,255,0.05)' }}
          dataKey="value"
          cornerRadius={6}
        />
        <text
          x="50%"
          y="45%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-display"
          fill="#e2e8f0"
          fontSize={28}
          fontWeight={700}
        >
          {normalizedScore.toFixed(0)}
        </text>
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={12}
        >
          {label || 'Score'}
        </text>
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

export default EngagementLineChart;
