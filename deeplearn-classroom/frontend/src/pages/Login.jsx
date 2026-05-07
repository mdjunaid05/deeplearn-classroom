import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Brain, Mail, Lock, GraduationCap, Users, ArrowRight, Sparkles, Eye, EyeOff, CheckCircle } from 'lucide-react';
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

    const result = await login({ email: email.trim(), password, role });

    if (result.success) {
      const dest = result.user.role === 'teacher' ? '/teacher' : '/student';
      navigate(dest, { replace: true });
    } else {
      setErrors({ submit: result.error });
    }

    setLoading(false);
  };

  const fillDemo = (demoRole) => {
    if (demoRole === 'student') {
      setRole('student');
      setEmail('student@deeplearn.edu');
      setPassword('Student123');
    } else {
      setRole('teacher');
      setEmail('teacher@deeplearn.edu');
      setPassword('Teacher123');
    }
    setErrors({});
  };

  return (
    <div className="page-enter min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/8 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/6 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-primary-500 to-purple-500 mb-5 shadow-lg shadow-primary-500/25
                          transform hover:scale-110 transition-transform duration-300">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-800">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-2">Sign in to your DeepLearn Classroom</p>
        </div>

        {/* Success message (post-registration) */}
        {successMsg && (
          <div className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 animate-fade-in">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Role Toggle */}
        <div className="flex gap-2 mb-6 p-1.5 rounded-xl bg-slate-100/80 border border-slate-200" id="login-role-toggle">
          {[
            { key: 'student', label: 'Student', icon: GraduationCap },
            { key: 'teacher', label: 'Teacher', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setRole(key); setErrors({}); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold
                          transition-all duration-300
                          ${role === key
                            ? 'bg-white text-primary-600 shadow-md shadow-primary-500/10'
                            : 'text-slate-500 hover:text-slate-700'
                          }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="bg-white rounded-2xl p-6 space-y-4 shadow-lg shadow-slate-200/50 border border-slate-200/80">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({...errors, email: ''}) }}
                  placeholder={role === 'student' ? 'student@deeplearn.edu' : 'teacher@deeplearn.edu'}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-sm
                              focus:outline-none focus:ring-2 focus:bg-white transition-all duration-200
                              ${errors.email ? 'border-red-300 focus:ring-red-500/30' : 'border-slate-200 focus:ring-primary-500/30 focus:border-primary-400'}`}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({...errors, password: ''}) }}
                  placeholder="••••••••"
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
              {errors.password && <p className="mt-1.5 text-xs text-red-500">{errors.password}</p>}
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
            id="login-submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-white text-sm
                       bg-gradient-to-r from-primary-600 to-purple-600
                       hover:from-primary-500 hover:to-purple-500
                       shadow-lg shadow-primary-600/25 hover:shadow-primary-500/40
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transform hover:scale-[1.01] active:scale-[0.99]
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

          {/* Quick Demo Access */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary-400" />
              Quick Demo Access
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fillDemo('student')}
                className="flex-1 py-2 rounded-lg text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-200
                           transition-all duration-200 hover:shadow-sm"
              >
                <GraduationCap className="w-3.5 h-3.5 inline mr-1" />
                Student Demo
              </button>
              <button
                type="button"
                onClick={() => fillDemo('teacher')}
                className="flex-1 py-2 rounded-lg text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200
                           transition-all duration-200 hover:shadow-sm"
              >
                <Users className="w-3.5 h-3.5 inline mr-1" />
                Teacher Demo
              </button>
            </div>
          </div>

          {/* Sign Up Link */}
          <div className="text-center">
            <p className="text-sm text-slate-500">
              Don't have an account?{' '}
              <Link
                to={`/register${role ? `?role=${role}` : ''}`}
                className="text-primary-600 hover:text-primary-500 font-semibold transition-colors"
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
