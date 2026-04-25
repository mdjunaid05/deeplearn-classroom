import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brain, Menu, X, GraduationCap, Users, Monitor, Activity, BarChart3, LogOut, Video } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const allNavLinks = [
  { path: '/', label: 'Home', icon: Brain, roles: ['all'] },
  { path: '/student', label: 'Student', icon: GraduationCap, roles: ['student', 'teacher'] },
  { path: '/teacher', label: 'Teacher', icon: Users, roles: ['teacher'] },
  { path: '/classroom', label: 'Classroom', icon: Monitor, roles: ['student', 'teacher'] },
  { path: '/live-classroom', label: 'Live', icon: Video, roles: ['student', 'teacher'] },
  { path: '/behaviour', label: 'Behaviour', icon: Activity, roles: ['teacher'] },
  { path: '/engagement', label: 'Analytics', icon: BarChart3, roles: ['teacher'] },
  { path: '/sign-input', label: 'Sign Input', icon: Brain, roles: ['student', 'teacher'] },
  { path: '/lip-reading', label: 'Lip Reading', icon: Brain, roles: ['student', 'teacher'] },
  { path: '/alerts', label: 'Alerts', icon: Brain, roles: ['student', 'teacher'] },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsOpen(false);
  };

  const navLinks = allNavLinks.filter(link => {
    if (link.roles.includes('all')) return true;
    if (!user) return false;
    return link.roles.includes(user.role);
  });

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group" id="nav-logo">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center
                            transition-transform group-hover:scale-110">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-display font-bold gradient-text hidden sm:block">
              DeepLearn
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[60%]">
            {navLinks.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  id={`nav-${label.toLowerCase().replace(' ', '-')}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                    ${isActive
                      ? 'bg-primary-600/20 text-primary-300 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Login/Logout Button */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-all duration-200"
              >
                <LogOut className="w-4 h-4" />
                Logout ({user.role})
              </button>
            ) : (
              <Link
                to="/login"
                id="nav-login"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-primary-600 to-purple-600
                           hover:from-primary-500 hover:to-purple-500 text-white transition-all duration-200
                           shadow-lg shadow-primary-600/20 hover:shadow-primary-500/30"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
            id="nav-mobile-toggle"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden glass border-t border-white/5 animate-slide-up max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-primary-600/20 text-primary-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
            
            {user ? (
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-all duration-200 mt-2 border border-white/10"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-center
                           bg-gradient-to-r from-primary-600 to-purple-600 text-white mt-2"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
