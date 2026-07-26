import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Brain, Mail, Lock, GraduationCap, Users, ArrowRight, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, user } = useAuth();

  const queryParams = new URLSearchParams(location.search);
  const requestedRole = queryParams.get('role');
  const fromRegister = queryParams.get('registered') === 'true';

  const [role, setRole] = useState(requestedRole === 'teacher' ? 'teacher' : 'student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState(fromRegister ? 'Account created successfully! Please sign in.' : '');
  const [wakingUp, setWakingUp] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    if (requestedRole === 'teacher' || requestedRole === 'student') {
      setRole(requestedRole);
    }
  }, [requestedRole]);

  const validateEmail = (email) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);

  const validateForm = () => {
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Invalid email format';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});
    setSuccessMsg('');
    setWakingUp(false);

    const result = await login({ email: email.trim(), password, role }, {
      onStatusChange: (status) => {
        if (status === 'waking') setWakingUp(true);
        else setWakingUp(false);
      },
    });

    if (result.success) {
      if (result.user.role === 'student') {
        console.log('[STUDENT_LOGIN_SUCCESS] Student logged in successfully:', result.user.email);
      }
      const dest = result.user.role === 'teacher' ? '/teacher' : '/student';
      navigate(dest, { replace: true });
    } else {
      setErrors({ submit: result.error });
    }

    setLoading(false);
    setWakingUp(false);
  };

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
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[#06b6d4]/10 rounded-full blur-3xl animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#006a63]/8 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-[#00687a] to-[#006a63] mb-5 shadow-lg shadow-[#00687a]/25
                          transform hover:scale-110 transition-transform duration-300">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#131b2e]">Welcome Back</h1>
          <p className="text-[#3d494c] text-sm mt-2">Sign in to your Lumina Classroom</p>
        </div>

        {/* Success message (post-registration) */}
        {successMsg && (
          <div className="mb-5 flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 animate-fade-in font-semibold">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            {successMsg}
          </div>
        )}

        {/* Role Toggle */}
        <div className="flex gap-2 mb-6 p-1.5 rounded-xl bg-[#eaedff] border border-[#bcc9cd]/40" id="login-role-toggle">
          {[
            { key: 'student', label: 'Student', icon: GraduationCap },
            { key: 'teacher', label: 'Teacher', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setRole(key); setErrors({}); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold
                          transition-all duration-300
                          ${role === key
                            ? 'bg-white text-[#00687a] shadow-md border border-[#bcc9cd]/25'
                            : 'text-[#3d494c] hover:text-[#00687a]'
                          }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="glass-panel rounded-3xl p-6 space-y-4 card-shadow">
            {/* Quick Demo Fill Pill */}
            <div className="flex justify-between items-center text-xs text-[#3d494c] pb-1">
              <span className="font-medium text-[#6d797d]">Need quick demo access?</span>
              <button
                type="button"
                onClick={() => {
                  if (role === 'student') {
                    setEmail('student@deeplearn.edu');
                    setPassword('Student123');
                  } else {
                    setEmail('teacher@deeplearn.edu');
                    setPassword('Teacher123');
                  }
                  setErrors({});
                }}
                className="text-[#00687a] hover:text-[#06b6d4] font-bold underline cursor-pointer transition-colors"
              >
                Auto-fill {role === 'student' ? 'Student' : 'Teacher'}
              </button>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-[#3d494c] mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#3d494c]" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({...errors, email: ''}) }}
                  placeholder={role === 'student' ? 'student@deeplearn.edu' : 'teacher@deeplearn.edu'}
                  className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white border text-[#131b2e] placeholder-[#6d797d] text-sm
                              focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/50 focus:border-[#00687a] transition-all duration-200
                              ${errors.email ? 'border-red-300 focus:ring-red-500/30' : 'border-[#bcc9cd]/60'}`}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-500 font-semibold">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-[#3d494c] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#3d494c]" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({...errors, password: ''}) }}
                  placeholder="••••••••"
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
              {errors.password && <p className="mt-1.5 text-xs text-red-500 font-semibold">{errors.password}</p>}
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 font-bold">{errors.submit}</p>
              </div>
            )}

            {/* Server Wake-Up Banner */}
            {wakingUp && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 animate-fade-in">
                <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-500 rounded-full animate-spin shrink-0" />
                <p className="text-xs text-amber-700 font-semibold">
                  Waking up the server — free-tier servers sleep after inactivity. This may take up to 30 seconds…
                </p>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            id="login-submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-white text-sm
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transform hover:scale-[1.01] active:scale-[0.99]
                       transition-all duration-300 cursor-pointer"
          >
            {loading ? (
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{wakingUp ? 'Waking up server…' : 'Signing in…'}</span>
              </div>
            ) : (
              <>
                Sign In as {role === 'student' ? 'Student' : 'Teacher'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Sign Up Link */}
          <div className="text-center">
            <p className="text-sm text-[#3d494c]">
              Don't have an account?{' '}
              <Link
                to={`/register${role ? `?role=${role}` : ''}`}
                className="text-[#00687a] hover:text-[#06b6d4] font-bold transition-colors"
              >
                Create Account
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
