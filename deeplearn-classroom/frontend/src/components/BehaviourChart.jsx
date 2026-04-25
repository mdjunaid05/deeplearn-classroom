import React from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const BEHAVIOR_COLORS = {
  Active: '#22c55e',
  Passive: '#eab308',
  Distracted: '#ef4444',
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-lg px-3 py-2 text-xs">
        {payload.map((entry, idx) => (
          <p key={idx} style={{ color: entry.color || entry.payload?.fill }} className="font-semibold">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function BehaviourBarChart({ data }) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    name: key,
    count: value,
    fill: BEHAVIOR_COLORS[key] || '#6366f1',
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Students">
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BehaviourPieChart({ data }) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    name: key,
    value: value,
    fill: BEHAVIOR_COLORS[key] || '#6366f1',
  }));

  const renderLabel = ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderLabel}
          outerRadius={100}
          innerRadius={50}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BehaviourTimeline({ events }) {
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {events.map((event, idx) => {
        const color = BEHAVIOR_COLORS[event.behaviour_label] || '#6366f1';
        return (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-lg glass-light card-hover"
          >
            <div
              className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={`badge badge-${event.behaviour_label.toLowerCase()}`}>
                  {event.behaviour_label}
                </span>
                <span className="text-xs text-slate-500">Activity #{event.activity_id}</span>
              </div>
              <div className="flex gap-4 text-xs text-slate-400">
                <span>Idle: {event.idle_time}min</span>
                <span>Chat: {event.chat_count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BehaviourBarChart;
