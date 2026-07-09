import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Brain, Mail, Lock, User, GraduationCap, Users, ArrowRight,
  Eye, EyeOff, CheckCircle, XCircle, Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isAuthenticated, user } = useAuth();

  const queryParams = new URLSearchParams(location.search);
  const requestedRole = queryParams.get('role');

  const [role, setRole] = useState(requestedRole === 'teacher' ? 'teacher' : 'student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Password strength indicators
  const passwordChecks = {
    length: password.length >= 6,
    upper: /[A-Z]/.test(password),
    digit: /\d/.test(password),
  };
  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;

  const validateForm = () => {
    const newErrors = {};
    if (!name.trim() || name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) newErrors.email = 'Invalid email format';
    if (!password) newErrors.password = 'Password is required';
    else {
      if (!passwordChecks.length) newErrors.password = 'Password must be at least 6 characters';
      else if (!passwordChecks.upper) newErrors.password = 'Must contain an uppercase letter';
      else if (!passwordChecks.digit) newErrors.password = 'Must contain a digit';
    }
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    const result = await register({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
    });

    if (result.success) {
      // Auto-login after registration — redirect to the correct dashboard
      const dest = result.user.role === 'teacher' ? '/teacher' : '/student';
      navigate(dest, { replace: true });
    } else {
      setErrors({ submit: result.error });
    }

    setLoading(false);
  };

  const StrengthBar = () => (
    <div className="flex gap-1 mt-2">
      {[1, 2, 3].map(level => (
        <div
          key={level}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
            passwordStrength >= level
              ? level === 1 ? 'bg-red-400' : level === 2 ? 'bg-amber-400' : 'bg-emerald-400'
              : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );

  const Check = ({ ok, label }) => (
    <div className={`flex items-center gap-1.5 text-[11px] transition-colors duration-200 ${ok ? 'text-emerald-600 font-semibold' : 'text-[#3d494c]'}`}>
      {ok ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-[#bcc9cd]" />}
      {label}
    </div>
  );

  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf8ff]">
        <div className="text-center">
          <Brain className="w-12 h-12 text-[#00687a] animate-pulse mx-auto mb-4" />
          <p className="text-[#131b2e] font-semibold text-sm">Already signed in. Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter bg-nexus-background min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#06b6d4]/10 rounded-full blur-3xl animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-[#006a63]/8 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-[#006a63] to-[#00687a] mb-5 shadow-lg shadow-[#006a63]/25
                          transform hover:scale-110 transition-transform duration-300">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#131b2e]">Create Account</h1>
          <p className="text-[#3d494c] text-sm mt-2">Join the AI-powered Virtual Classroom</p>
        </div>

        {/* Role Toggle */}
        <div className="flex gap-2 mb-6 p-1.5 rounded-xl bg-[#eaedff] border border-[#bcc9cd]/40" id="register-role-toggle">
          {[
            { key: 'student', label: 'Student', icon: GraduationCap, desc: 'Learn & engage' },
            { key: 'teacher', label: 'Teacher', icon: Users, desc: 'Teach & monitor' },
          ].map(({ key, label, icon: Icon, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setRole(key); setErrors({}); }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 rounded-lg text-sm font-bold
                          transition-all duration-300
                          ${role === key
                            ? 'bg-white text-[#00687a] shadow-md border border-[#bcc9cd]/25'
                            : 'text-[#3d494c] hover:text-[#00687a]'
                          }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                {label}
              </div>
              <span className="text-[10px] font-normal text-[#6d797d]">{desc}</span>
            </button>
          ))}
        </div>

        {/* Register Form */}
        <form onSubmit={handleRegister} className="space-y-5">
          <div className="glass-panel rounded-3xl p-6 space-y-4 card-shadow">
            {/* Name */}
            <div>
              <label htmlFor="register-name" className="block text-xs font-bold text-[#3d494c] mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#3d494c]" />
                <input
                  id="register-name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({...errors, name: ''}) }}
                  placeholder="John Doe"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white border text-[#131b2e] placeholder-[#6d797d] text-sm
                              focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/50 focus:border-[#00687a] transition-all duration-200
                              ${errors.name ? 'border-red-300 focus:ring-red-500/30' : 'border-[#bcc9cd]/60'}`}
                />
              </div>
              {errors.name && <p className="mt-1.5 text-xs text-red-500 font-semibold">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="block text-xs font-bold text-[#3d494c] mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#3d494c]" />
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({...errors, email: ''}) }}
                  placeholder="your@email.com"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white border text-[#131b2e] placeholder-[#6d797d] text-sm
                              focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/50 focus:border-[#00687a] transition-all duration-200
                              ${errors.email ? 'border-red-300 focus:ring-red-500/30' : 'border-[#bcc9cd]/60'}`}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-500 font-semibold">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="block text-xs font-bold text-[#3d494c] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#3d494c]" />
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({...errors, password: ''}) }}
                  placeholder="Minimum 6 characters"
                  className={`w-full pl-11 pr-11 py-3 rounded-xl bg-white border text-[#131b2e] placeholder-[#6d797d] text-sm
                              focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/50 focus:border-[#00687a] transition-all duration-200
                              ${errors.password ? 'border-red-300 focus:ring-red-500/30' : 'border-[#bcc9cd]/60'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#3d494c] hover:text-[#00687a] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              {password && (
                <div className="mt-2 space-y-1.5">
                  <StrengthBar />
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Check ok={passwordChecks.length} label="6+ characters" />
                    <Check ok={passwordChecks.upper} label="Uppercase" />
                    <Check ok={passwordChecks.digit} label="Number" />
                  </div>
                </div>
              )}
              {errors.password && <p className="mt-1.5 text-xs text-red-500 font-semibold">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="register-confirm" className="block text-xs font-bold text-[#3d494c] mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#3d494c]" />
                <input
                  id="register-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''}) }}
                  placeholder="••••••••"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white border text-[#131b2e] placeholder-[#6d797d] text-sm
                              focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/50 focus:border-[#00687a] transition-all duration-200
                              ${errors.confirmPassword ? 'border-red-300 focus:ring-red-500/30' : 'border-[#bcc9cd]/60'}`}
                />
                {confirmPassword && confirmPassword === password && (
                  <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-emerald-500" />
                )}
              </div>
              {errors.confirmPassword && <p className="mt-1.5 text-xs text-red-500 font-semibold">{errors.confirmPassword}</p>}
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 font-bold">{errors.submit}</p>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            id="register-submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-white text-sm
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transform hover:scale-[1.01] active:scale-[0.99]
                       transition-all duration-300 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Create {role === 'student' ? 'Student' : 'Teacher'} Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Login Link */}
          <div className="text-center">
            <p className="text-sm text-[#3d494c]">
              Already have an account?{' '}
              <Link
                to={`/login${role ? `?role=${role}` : ''}`}
                className="text-[#00687a] hover:text-[#06b6d4] font-bold transition-colors"
              >
                Sign In
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
