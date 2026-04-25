import React from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, Zap, Shield, BarChart3, GraduationCap, Users,
  Monitor, Activity, ArrowRight, Sparkles, Eye, Cpu,
} from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Adaptive Learning',
    desc: 'DNN-powered difficulty adjustment that adapts in real-time to each student\'s performance level.',
    color: 'from-primary-500 to-purple-500',
  },
  {
    icon: Eye,
    title: 'Behaviour Monitoring',
    desc: 'LSTM-based classification tracks click patterns, response speed, and idle time to identify engagement.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Engagement Detection',
    desc: 'Deep neural network analyzes participation, quiz scores, and session patterns for engagement levels.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    desc: 'Rich visualizations for teachers with engagement distributions, behaviour breakdowns, and trends.',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: Cpu,
    title: 'Deep Learning Models',
    desc: 'Three specialized TensorFlow models trained on student interaction data for intelligent predictions.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: Shield,
    title: 'Real-time Insights',
    desc: 'Confidence scores and probability distributions alongside every prediction for transparent AI.',
    color: 'from-violet-500 to-fuchsia-500',
  },
];

const stats = [
  { value: '3', label: 'DL Models' },
  { value: '250+', label: 'Data Points' },
  { value: '95%+', label: 'Accuracy' },
  { value: '< 50ms', label: 'Inference' },
];

export default function Landing() {
  return (
    <div className="page-enter">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl animate-pulse-slow"
               style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl animate-pulse-slow"
               style={{ animationDelay: '2s' }} />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.02]"
             style={{
               backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
               backgroundSize: '40px 40px',
             }} />

        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-6 animate-fade-in">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-slate-300">Powered by TensorFlow Deep Learning</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-extrabold mb-6 leading-tight animate-fade-in">
            <span className="text-white">Smart Virtual</span>
            <br />
            <span className="gradient-text">Classroom System</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up">
            An AI-powered adaptive learning platform with real-time behaviour monitoring,
            engagement detection, and intelligent difficulty adjustment — built on deep learning.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up"
               style={{ animationDelay: '0.2s' }}>
            <Link
              to="/student"
              id="hero-student-btn"
              className="group flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white
                         bg-gradient-to-r from-primary-600 to-purple-600
                         hover:from-primary-500 hover:to-purple-500
                         shadow-xl shadow-primary-600/25 hover:shadow-primary-500/40
                         transition-all duration-300"
            >
              <GraduationCap className="w-5 h-5" />
              Student Dashboard
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/teacher"
              id="hero-teacher-btn"
              className="group flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold
                         text-slate-200 glass hover:bg-white/10
                         transition-all duration-300"
            >
              <Users className="w-5 h-5" />
              Teacher Dashboard
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="py-8 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className="text-3xl font-display font-bold gradient-text">{stat.value}</div>
              <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
              Intelligent Features
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Three deep learning models work together to create a truly adaptive learning experience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="group p-6 rounded-2xl glass card-hover"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feat.color}
                                 flex items-center justify-center mb-4
                                 transition-transform group-hover:scale-110`}>
                  <feat.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/5 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-primary-400" />
          <span className="font-display font-bold gradient-text">DeepLearn</span>
        </div>
        <p className="text-sm text-slate-500">
          Smart Virtual Classroom System — Deep Learning–Based Adaptive Learning Platform
        </p>
      </footer>
    </div>
  );
}
