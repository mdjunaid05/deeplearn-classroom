import React, { useState, useEffect } from 'react';
import { Activity, Clock, MousePointer2, MessageSquare, AlertTriangle } from 'lucide-react';
import { BehaviourTimeline } from '../components/BehaviourChart';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Empty events — will be populated from backend
const EMPTY_EVENTS = [];

export default function BehaviourMonitor() {
  const [studentId, setStudentId] = useState(1001);

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-400" />
            Behaviour Monitor
          </h1>
          <p className="text-slate-400 mt-1">Detailed breakdown of student interaction patterns</p>
        </div>
        <div className="flex gap-2">
           <input
            type="number"
            value={studentId}
            onChange={(e) => setStudentId(Number(e.target.value))}
            className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            placeholder="Student ID"
            id="behaviour-student-id"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column — Summary & Alerts */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Behaviour Categories</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-emerald-400">Active</span>
                  <span className="text-xs text-emerald-300">Target State</span>
                </div>
                <p className="text-xs text-slate-400">High click frequency, fast response speed, active in chat.</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-amber-400">Passive</span>
                  <span className="text-xs text-amber-300">Needs Motivation</span>
                </div>
                <p className="text-xs text-slate-400">Low interaction, moderate idle time, infrequent chatting.</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-red-400">Distracted</span>
                  <span className="text-xs text-red-300">Intervention Req.</span>
                </div>
                <p className="text-xs text-slate-400">High idle time, very low click frequency, zero chat activity.</p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl glass">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Recent Alerts
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg glass-light">
                <Clock className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">No alerts yet</p>
                  <p className="text-xs text-slate-400 mt-1">Alerts will appear here when data is available.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg glass-light">
                <MousePointer2 className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">—</p>
                  <p className="text-xs text-slate-400 mt-1">—</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Timeline */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center justify-between">
            <span>Interaction Timeline (Student #{studentId})</span>
            <span className="text-xs font-normal text-slate-500">Based on LSTM classifications</span>
          </h3>
          
          <div className="bg-surface-800/50 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Click Freq</p>
                <p className="text-lg font-bold text-white">— <span className="text-xs font-normal text-slate-400">/min</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Response</p>
                <p className="text-lg font-bold text-white">— <span className="text-xs font-normal text-slate-400">sec</span></p>
              </div>
               <div>
                <p className="text-xs text-slate-500 mb-1">Total Chats</p>
                <p className="text-lg font-bold text-white flex items-center justify-center gap-1">
                  <MessageSquare className="w-3 h-3 text-primary-400" />
                  0
                </p>
              </div>
               <div>
                <p className="text-xs text-slate-500 mb-1">Total Idle</p>
                <p className="text-lg font-bold text-red-400">0 <span className="text-xs font-normal">min</span></p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute top-0 bottom-0 left-[21px] w-0.5 bg-white/5" />
            <BehaviourTimeline events={EMPTY_EVENTS} />
          </div>
        </div>
      </div>
    </div>
  );
}
