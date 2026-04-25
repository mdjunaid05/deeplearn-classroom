import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Mail, Lock, GraduationCap, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    // Simulated login — redirect after brief delay
    setTimeout(() => {
      setLoading(false);
      login(role);
      if (role === 'student') {
        navigate('/student');
      } else {
        navigate('/teacher');
      }
    }, 800);
  };

  return (
    <div className="page-enter min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-primary-600/15 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-gradient-to-br from-primary-500 to-purple-500 mb-4 glow-primary">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white">Welcome Back</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your DeepLearn account</p>
        </div>

        {/* Role Toggle */}
        <div className="flex gap-2 mb-6 p-1 rounded-xl glass" id="login-role-toggle">
          {[
            { key: 'student', label: 'Student', icon: GraduationCap },
            { key: 'teacher', label: 'Teacher', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setRole(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold
                          transition-all duration-200
                          ${role === key
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                            : 'text-slate-400 hover:text-white'
                          }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={role === 'student' ? 'student@deeplearn.edu' : 'teacher@deeplearn.edu'}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10
                             text-white placeholder-slate-500 text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50
                             transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10
                             text-white placeholder-slate-500 text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50
                             transition-all"
                />
              </div>
            </div>

            {/* Demo hint */}
            <div className="p-3 rounded-lg bg-primary-600/10 border border-primary-500/20">
              <p className="text-xs text-primary-300">
                <strong>Demo:</strong> Enter any email and password to continue.
                This is a demonstration — no real authentication is performed.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="login-submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white
                       bg-gradient-to-r from-primary-600 to-purple-600
                       hover:from-primary-500 hover:to-purple-500
                       shadow-lg shadow-primary-600/25 hover:shadow-primary-500/40
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transition-all duration-300"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Sign In as {role === 'student' ? 'Student' : 'Teacher'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
