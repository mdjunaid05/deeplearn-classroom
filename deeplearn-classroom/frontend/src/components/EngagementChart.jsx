import React from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, Legend,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel rounded-xl px-3.5 py-2.5 text-xs card-shadow border border-[#bcc9cd]/40">
        <p className="text-[#3d494c] mb-1 font-bold">{`Activity ${label}`}</p>
        {payload.map((entry, idx) => (
          <p key={idx} style={{ color: entry.color }} className="font-bold">
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
        <XAxis
          dataKey="activity_id"
          stroke="#6d797d"
          fontSize={11}
          tickLine={false}
        />
        <YAxis stroke="#6d797d" fontSize={11} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="quiz_score"
          stroke="#00687a"
          strokeWidth={2}
          dot={{ fill: '#00687a', r: 3 }}
          activeDot={{ r: 5, fill: '#06b6d4' }}
          name="Quiz Score"
        />
        <Line
          type="monotone"
          dataKey="participation_count"
          stroke="#006a63"
          strokeWidth={2}
          dot={{ fill: '#006a63', r: 3 }}
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
            <stop offset="5%" stopColor="#00687a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00687a" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="partGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#006a63" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#006a63" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
        <XAxis dataKey="period" stroke="#6d797d" fontSize={11} tickLine={false} />
        <YAxis stroke="#6d797d" fontSize={11} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="high_engagement_pct"
          stroke="#00687a"
          fillOpacity={1}
          fill="url(#engGrad)"
          strokeWidth={2}
          name="High Engagement %"
        />
        <Area
          type="monotone"
          dataKey="active_behaviour_pct"
          stroke="#006a63"
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
    { name: label || 'Engagement', value: normalizedScore, fill: '#00687a' },
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
          background={{ fill: 'rgba(0,0,0,0.05)' }}
          dataKey="value"
          cornerRadius={6}
        />
        <text
          x="50%"
          y="45%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#131b2e"
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
          fill="#3d494c"
          fontSize={12}
        >
          {label || 'Score'}
        </text>
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

export default EngagementLineChart;
