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
    <div className={`flex items-center gap-1.5 text-[11px] transition-colors duration-200 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </div>
  );

  return (
    <div className="page-enter min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/8 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-primary-500/6 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-purple-500 to-primary-500 mb-5 shadow-lg shadow-purple-500/25
                          transform hover:scale-110 transition-transform duration-300">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-800">Create Account</h1>
          <p className="text-slate-500 text-sm mt-2">Join the AI-powered Virtual Classroom</p>
        </div>

        {/* Role Toggle */}
        <div className="flex gap-2 mb-6 p-1.5 rounded-xl bg-slate-100/80 border border-slate-200" id="register-role-toggle">
          {[
            { key: 'student', label: 'Student', icon: GraduationCap, desc: 'Learn & engage' },
            { key: 'teacher', label: 'Teacher', icon: Users, desc: 'Teach & monitor' },
          ].map(({ key, label, icon: Icon, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setRole(key); setErrors({}); }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 rounded-lg text-sm font-semibold
                          transition-all duration-300
                          ${role === key
                            ? 'bg-white text-primary-600 shadow-md shadow-primary-500/10'
                            : 'text-slate-500 hover:text-slate-700'
                          }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                {label}
              </div>
              <span className="text-[10px] font-normal text-slate-400">{desc}</span>
            </button>
          ))}
        </div>

        {/* Register Form */}
        <form onSubmit={handleRegister} className="space-y-5">
          <div className="bg-white rounded-2xl p-6 space-y-4 shadow-lg shadow-slate-200/50 border border-slate-200/80">
            {/* Name */}
            <div>
              <label htmlFor="register-name" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="register-name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({...errors, name: ''}) }}
                  placeholder="John Doe"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-sm
                              focus:outline-none focus:ring-2 focus:bg-white transition-all duration-200
                              ${errors.name ? 'border-red-300 focus:ring-red-500/30' : 'border-slate-200 focus:ring-primary-500/30 focus:border-primary-400'}`}
                />
              </div>
              {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({...errors, email: ''}) }}
                  placeholder="your@email.com"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-sm
                              focus:outline-none focus:ring-2 focus:bg-white transition-all duration-200
                              ${errors.email ? 'border-red-300 focus:ring-red-500/30' : 'border-slate-200 focus:ring-primary-500/30 focus:border-primary-400'}`}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-500">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({...errors, password: ''}) }}
                  placeholder="Minimum 6 characters"
                  className={`w-full pl-10 pr-11 py-3 rounded-xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-sm
                              focus:outline-none focus:ring-2 focus:bg-white transition-all duration-200
                              ${errors.password ? 'border-red-300 focus:ring-red-500/30' : 'border-slate-200 focus:ring-primary-500/30 focus:border-primary-400'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
              {errors.password && <p className="mt-1.5 text-xs text-red-500">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="register-confirm" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="register-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''}) }}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-sm
                              focus:outline-none focus:ring-2 focus:bg-white transition-all duration-200
                              ${errors.confirmPassword ? 'border-red-300 focus:ring-red-500/30' : 'border-slate-200 focus:ring-primary-500/30 focus:border-primary-400'}`}
                />
                {confirmPassword && confirmPassword === password && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                )}
              </div>
              {errors.confirmPassword && <p className="mt-1.5 text-xs text-red-500">{errors.confirmPassword}</p>}
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 font-medium">{errors.submit}</p>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            id="register-submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-white text-sm
                       bg-gradient-to-r from-purple-600 to-primary-600
                       hover:from-purple-500 hover:to-primary-500
                       shadow-lg shadow-purple-600/25 hover:shadow-purple-500/40
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transform hover:scale-[1.01] active:scale-[0.99]
                       transition-all duration-300"
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
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link
                to={`/login${role ? `?role=${role}` : ''}`}
                className="text-primary-600 hover:text-primary-500 font-semibold transition-colors"
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
