import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, Mail, Lock, User, ArrowRight, GraduationCap, Users } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [role, setRole] = useState('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateEmail = (email) => {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      // Fake registration for demo purposes since we don't have a backend DB yet
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Just redirect to login after "successful" registration
      navigate('/login');
    } catch (err) {
      setErrors({ submit: 'Connection error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-primary-600/15 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-gradient-to-br from-primary-500 to-purple-500 mb-4 glow-primary">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white">Create an Account</h1>
          <p className="text-slate-400 text-sm mt-1">Join DeepLearn to start learning</p>
        </div>

        <div className="flex gap-2 mb-6 p-1 rounded-xl glass">
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

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({...errors, name: ''}) }}
                  placeholder="John Doe"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all ${errors.name ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:border-primary-500/50'}`}
                />
              </div>
              {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({...errors, email: ''}) }}
                  placeholder="student@example.com"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all ${errors.email ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:border-primary-500/50'}`}
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({...errors, password: ''}) }}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all ${errors.password ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:border-primary-500/50'}`}
                />
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
            </div>

            {errors.submit && (
              <div className="p-3 rounded-lg bg-red-600/10 border border-red-500/20">
                <p className="text-xs text-red-300">{errors.submit}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white
                       bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500
                       shadow-lg shadow-primary-600/25 hover:shadow-primary-500/40 disabled:opacity-60 transition-all duration-300"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Sign Up <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
          
          <div className="text-center mt-6">
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                Sign In
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
