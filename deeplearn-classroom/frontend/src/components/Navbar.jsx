import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Brain, Menu, X, GraduationCap, Users, Monitor, Activity, BarChart3,
  LogOut, Video, Upload, Mic, AlertTriangle, Hand, User, ChevronDown,
  LayoutDashboard, BookOpen, Headphones, Eye
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ── Role-based Navigation Configuration ─────────────────────────────────────
const navConfig = {
  // Public links (always visible)
  public: [
    { path: '/', label: 'Home', icon: Brain },
  ],

  // Student-only links
  student: [
    { path: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/classroom', label: 'Classroom', icon: Monitor },
    { path: '/live-classroom', label: 'Live Class', icon: Video },
    { path: '/sign-input', label: 'Sign Language', icon: Hand },
    { path: '/lip-reading', label: 'Lip Reading', icon: Eye },
    { path: '/alerts', label: 'Alerts', icon: AlertTriangle },
  ],

  // Teacher-only links
  teacher: [
    { path: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/classroom', label: 'Classroom', icon: Monitor },
    { path: '/live-classroom', label: 'Live Class', icon: Video },
    { path: '/behaviour', label: 'Behaviour', icon: Activity },
    { path: '/engagement', label: 'Analytics', icon: BarChart3 },
    { path: '/video-upload', label: 'Upload', icon: Upload },
    { path: '/recordings', label: 'Recordings', icon: BookOpen },
  ],
};

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, isTeacher } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsOpen(false);
    setShowUserMenu(false);
  };

  // Build navigation links based on role
  const getNavLinks = () => {
    const links = [...navConfig.public];
    if (!user) return links;

    if (isTeacher) {
      links.push(...navConfig.teacher);
    } else {
      links.push(...navConfig.student);
    }

    return links;
  };

  const navLinks = getNavLinks();

  // User initials for avatar
  const getInitials = () => {
    if (!user?.name) return '?';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const roleColor = isTeacher ? 'purple' : 'primary';
  const roleBg = isTeacher ? 'bg-purple-500' : 'bg-primary-500';
  const roleLabel = isTeacher ? 'Teacher' : 'Student';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group" id="nav-logo">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center
                            transition-transform group-hover:scale-110 shadow-sm">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-display font-bold gradient-text hidden sm:block">
              DeepLearn
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-0.5 overflow-x-auto no-scrollbar max-w-[55%]">
            {navLinks.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  id={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                    ${isActive
                      ? 'bg-primary-100 text-primary-600 shadow-sm'
                      : 'text-slate-500 hover:text-primary-600 hover:bg-primary-50'
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* User Section / Auth Buttons */}
          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all duration-200"
                  id="nav-user-menu"
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-lg ${roleBg} text-white text-xs font-bold flex items-center justify-center shadow-sm`}>
                    {getInitials()}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-sm font-semibold text-slate-700 leading-tight">{user?.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{roleLabel}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown */}
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-20 animate-fade-in">
                      {/* User info header */}
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                                         ${isTeacher ? 'bg-purple-100 text-purple-600' : 'bg-primary-100 text-primary-600'}`}>
                          {roleLabel}
                        </span>
                      </div>

                      {/* Quick links */}
                      <div className="py-1">
                        <Link
                          to={isTeacher ? '/teacher' : '/student'}
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          My Dashboard
                        </Link>
                        {isTeacher && (
                          <Link
                            to="/engagement"
                            onClick={() => setShowUserMenu(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                          >
                            <BarChart3 className="w-4 h-4" />
                            Analytics
                          </Link>
                        )}
                      </div>

                      {/* Logout */}
                      <div className="border-t border-slate-100 py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  id="nav-login"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  id="nav-register"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-primary-600 to-purple-600
                             hover:from-primary-500 hover:to-purple-500 text-white transition-all duration-200
                             shadow-md shadow-primary-600/20 hover:shadow-primary-500/30"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
            id="nav-mobile-toggle"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-200/60 animate-slide-up max-h-[80vh] overflow-y-auto shadow-lg">
          {/* Mobile user info */}
          {isAuthenticated && (
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${roleBg} text-white text-sm font-bold flex items-center justify-center`}>
                {getInitials()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                                 ${isTeacher ? 'bg-purple-100 text-purple-600' : 'bg-primary-100 text-primary-600'}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          )}

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
                      ? 'bg-primary-100 text-primary-600'
                      : 'text-slate-600 hover:text-primary-600 hover:bg-primary-50'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}

            <div className="pt-2 border-t border-slate-100 mt-2">
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold
                             text-red-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 border border-red-200"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 text-center px-3 py-2.5 rounded-lg text-sm font-semibold
                               text-primary-600 border border-primary-200 hover:bg-primary-50 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 text-center px-3 py-2.5 rounded-lg text-sm font-semibold
                               bg-gradient-to-r from-primary-600 to-purple-600 text-white"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
