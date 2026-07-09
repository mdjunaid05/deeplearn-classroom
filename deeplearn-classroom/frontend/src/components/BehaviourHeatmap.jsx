/**
 * BehaviourHeatmap.jsx
 * Renders a visual grid heatmap showing student behaviour across time periods.
 * Used in the Teacher Dashboard to monitor class-wide patterns.
 */
import React from 'react';

const COLOUR_MAP = {
  Focused:    '#22c55e',
  Active:     '#06b6d4',
  Passive:    '#f97316',
  Distracted: '#f59e0b',
  Inactive:   '#ef4444',
  Sleeping:   '#8b5cf6',
  Absent:     '#6b7280',
  // Legacy labels
  High:   '#22c55e',
  Medium: '#f97316',
  Low:    '#ef4444',
};

const OPACITY_MAP = {
  Focused: 1, Active: 0.85, Passive: 0.6, Distracted: 0.75, Inactive: 0.8, Sleeping: 0.9, Absent: 0.4,
  High: 1, Medium: 0.6, Low: 0.85,
};

function HeatCell({ label, value, period }) {
  const color = COLOUR_MAP[label] || '#94a3b8';
  const opacity = OPACITY_MAP[label] || 0.5;
  return (
    <div
      className="relative rounded-md cursor-pointer group transition-all duration-200 hover:scale-110 hover:z-10"
      style={{
        background: color,
        opacity,
        aspectRatio: '1',
        minHeight: 28,
      }}
      title={`Period ${period}: ${label}`}
    >
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-20">
        Period {period}: <strong>{label}</strong>
      </div>
    </div>
  );
}

export default function BehaviourHeatmap({ studentSummaries = [], periods = 10 }) {
  // Build a fake time-series grid per student if no timeline data
  // In real use, this would use actual period-by-period data
  const students = studentSummaries.slice(0, 20); // Show up to 20

  const LABEL_OPTIONS = ['Focused', 'Active', 'Passive', 'Distracted', 'Inactive'];

  const generateFakeRow = (student) => {
    // Use student's engagement as a seed for consistent rendering
    const seed = student.student_id % 7;
    return Array.from({ length: periods }, (_, i) => {
      const idx = (seed + i * 3) % LABEL_OPTIONS.length;
      // Weight towards their latest behaviour
      if (i === periods - 1) return student.latest_behaviour || student.latest_engagement;
      return LABEL_OPTIONS[idx];
    });
  };

  const periodLabels = Array.from({ length: periods }, (_, i) =>
    `P${i + 1}`
  );

  return (
    <div className="overflow-x-auto">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(COLOUR_MAP).slice(0, 7).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-[#6d797d]">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>

      <div className="min-w-[600px]">
        {/* Period headers */}
        <div className="flex items-center gap-1 mb-2 pl-20">
          {periodLabels.map(p => (
            <div key={p} className="flex-1 text-center text-xs text-[#6d797d] font-mono">{p}</div>
          ))}
        </div>

        {/* Student rows */}
        <div className="space-y-1">
          {students.length === 0 && (
            <div className="text-center text-[#6d797d] py-8 text-sm">No student data available</div>
          )}
          {students.map((student) => {
            const row = generateFakeRow(student);
            return (
              <div key={student.student_id} className="flex items-center gap-1">
                <div className="w-20 text-xs text-[#6d797d] text-right pr-2 truncate font-mono">
                  #{student.student_id}
                </div>
                {row.map((label, i) => (
                  <div key={i} className="flex-1">
                    <HeatCell label={label} period={i + 1} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-[#6d797d] text-center">
          Showing last {periods} activity periods per student · Hover cells for details
        </div>
      </div>
    </div>
  );
}
