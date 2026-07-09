import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Brain, Zap, Shield, BarChart3, GraduationCap, Users,
  Monitor, Activity, ArrowRight, Sparkles, Eye, Cpu,
  Volume2, VolumeX, Type, Layers
} from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Adaptive Learning',
    desc: 'DNN-powered difficulty adjustment that adapts in real-time to each student\'s performance level.',
    color: 'from-[#06b6d4] to-[#00687a]',
    borderStyle: 'ai-border',
  },
  {
    icon: Eye,
    title: 'Behaviour Monitoring',
    desc: 'LSTM-based classification tracks click patterns, response speed, and idle time to identify engagement.',
    color: 'from-[#006a63] to-[#9cf2e8]',
    borderStyle: 'border border-[#bcc9cd]/40',
  },
  {
    icon: Zap,
    title: 'Engagement Detection',
    desc: 'Deep neural network analyzes participation, quiz scores, and session patterns for engagement levels.',
    color: 'from-[#5c5f61] to-[#e0e3e5]',
    borderStyle: 'border border-[#bcc9cd]/40',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    desc: 'Rich visualizations for teachers with engagement distributions, behaviour breakdowns, and trends.',
    color: 'from-[#00687a] to-[#06b6d4]',
    borderStyle: 'border border-[#bcc9cd]/40',
  },
  {
    icon: Cpu,
    title: 'Deep Learning Models',
    desc: 'Three specialized TensorFlow models trained on student interaction data for intelligent predictions.',
    color: 'from-[#06b6d4] to-[#00687a]',
    borderStyle: 'border border-[#bcc9cd]/40',
  },
  {
    icon: Shield,
    title: 'Real-time Insights',
    desc: 'Confidence scores and probability distributions alongside every prediction for transparent AI.',
    color: 'from-[#006a63] to-[#9cf2e8]',
    borderStyle: 'border border-[#bcc9cd]/40',
  },
];

const stats = [
  { value: '95%+', label: 'Insight Accuracy' },
  { value: '3', label: 'Deep Learning Models' },
  { value: '< 10ms', label: 'Real-Time Analytics' },
];

export default function Landing() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="page-enter bg-nexus-background min-h-screen text-nexus-on-background">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden py-12 lg:py-24">
        {/* Background effects / Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#06b6d4]/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#006a63]/8 rounded-full blur-3xl animate-pulse-slow"
               style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left Column: Copy */}
          <div className="flex-1 text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 ai-chip px-4 py-1.5 rounded-full font-semibold text-sm mb-2 shadow-sm border border-[#06b6d4]/20">
              <Brain className="w-4 h-4" />
              <span>Next-Gen Learning AI</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-nexus-on-surface tracking-tight leading-tight">
              AI-Powered Inclusive <br className="hidden lg:block" /> Virtual Classroom
            </h1>

            <p className="text-lg text-nexus-on-surface-variant max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Empowering every student with adaptive intelligence. Real-time insights, accessible by design, and built for modern enterprise education.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              {(!isAuthenticated || user?.role === 'student') && (
                <Link
                  to="/student"
                  id="hero-student-btn"
                  className="btn-primary w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 text-center"
                >
                  <GraduationCap className="w-5 h-5" />
                  Student Dashboard
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
              )}
              {(!isAuthenticated || user?.role === 'teacher') && (
                <Link
                  to="/teacher"
                  id="hero-teacher-btn"
                  className="btn-secondary w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 card-shadow text-center"
                >
                  <Users className="w-5 h-5" />
                  Teacher Dashboard
                </Link>
              )}
            </div>
          </div>

          {/* Right Column: Illustration Placeholder & Floating Icons */}
          <div className="flex-1 relative w-full aspect-square max-w-lg mx-auto">
            {/* Main graphic container */}
            <div className="absolute inset-0 rounded-[40px] overflow-hidden card-shadow bg-[#eaedff] border border-[#bcc9cd]/40">
              <img
                className="w-full h-full object-cover mix-blend-multiply opacity-90"
                alt="A highly professional and clean digital illustration of an inclusive virtual classroom environment powered by AI."
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAivRu4x8PUE6o9ao2oDVhZE9gp8zhP1-71f8xFhL5zKyQaLAgz_xQNk_RkCunEs3qaTL0mMXNRm3uZ9rimNtFGymgpJxIcm_Aw7-gppSEyY6laxX9rS4rUMvGF1ZfeDLyVwlhYKKgsL7RmG0jg0x6PFMcsH0vuQgCpw3eA4HpUlvbl7jwu2IlLbxcqfxG19p_p3v0u1tOZGTrltUTn4AviaD54Zhx8l9RmA5uFnr5tpN6UyKm8zrPac3uFiT1aNtVBG7BRvUOhDmZw"
              />
            </div>

            {/* Floating Accessibility Icons (Glassmorphic) */}
            <div className="absolute -left-4 top-1/4 glass-panel p-4 rounded-2xl card-shadow animate-bounce flex items-center justify-center w-14 h-14" style={{ animationDuration: '3s' }}>
              <VolumeX className="w-7 h-7 text-[#00687a]" />
            </div>
            <div className="absolute -right-4 top-1/2 glass-panel p-4 rounded-2xl card-shadow animate-bounce flex items-center justify-center w-14 h-14" style={{ animationDuration: '4s', animationDelay: '1s' }}>
              <Eye className="w-7 h-7 text-[#006a63]" />
            </div>
            <div className="absolute left-1/4 -bottom-4 glass-panel p-4 rounded-2xl card-shadow animate-bounce flex items-center justify-center w-14 h-14" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }}>
              <Type className="w-7 h-7 text-[#5c5f61]" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="bg-[#f2f3ff] py-12 border-y border-[#bcc9cd]/40">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((stat, idx) => (
            <div key={idx} className="text-center md:border-r last:border-r-0 border-[#bcc9cd]/40 py-2">
              <div className="text-4xl font-extrabold text-[#00687a] tracking-tight">{stat.value}</div>
              <div className="text-sm font-semibold text-nexus-on-surface-variant uppercase tracking-wider mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl font-bold text-nexus-on-surface">
            Intelligent Features for Every Learner
          </h2>
          <p className="text-nexus-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Our specialized AI models work continuously to adapt, monitor, and engage, ensuring no student is left behind.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className={`bg-white rounded-[24px] p-8 card-shadow ${feat.borderStyle} transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl cursor-pointer group`}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feat.color}
                               flex items-center justify-center mb-6 shadow-md
                               transition-transform group-hover:scale-110`}>
                <feat.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-nexus-on-surface mb-3">{feat.title}</h3>
              <p className="text-sm text-nexus-on-surface-variant leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-white border-t border-[#bcc9cd]/40 text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Brain className="w-6 h-6 text-[#00687a]" />
          <span className="text-xl font-bold text-nexus-on-surface">Lumina Edu</span>
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-sm font-semibold text-nexus-on-surface-variant">
          <a href="#" className="hover:text-[#00687a] transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-[#00687a] transition-colors">Accessibility Statement</a>
          <a href="#" className="hover:text-[#00687a] transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-[#00687a] transition-colors">Contact</a>
        </div>
        <p className="text-xs text-nexus-on-surface-variant/80 pt-4">
          © 2026 Lumina AI Education. All rights reserved. Built for inclusion.
        </p>
      </footer>
    </div>
  );
}
