import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || '';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  // ── Restore session from localStorage on mount ────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        setToken(storedToken);
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  // ── Login: call backend and persist token ─────────────────────────────────
  const login = useCallback(async (credentials) => {
    // If credentials already contain a token (from register), use directly
    if (credentials.token && credentials.user) {
      const { token: t, user: u } = credentials;
      setToken(t);
      setUser(u);
      localStorage.setItem('auth_token', t);
      localStorage.setItem('user', JSON.stringify(u));
      return { success: true, user: u };
    }

    // Otherwise, call the login API
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        const userData = {
          user_id: data.user_id,
          email: data.email,
          name: data.name,
          role: data.role,
        };
        setToken(data.token);
        setUser(userData);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user', JSON.stringify(userData));
        return { success: true, user: userData };
      }

      return { success: false, error: data.error || 'Login failed' };
    } catch (err) {
      // Offline / backend unreachable — demo-account fallback
      console.warn('Backend unreachable, trying demo fallback…');
      const { email, password, role } = credentials;

      const demoAccounts = {
        'student@deeplearn.edu': { password: 'Student123', name: 'Demo Student', role: 'student', user_id: 1001 },
        'teacher@deeplearn.edu': { password: 'Teacher123', name: 'Demo Teacher', role: 'teacher', user_id: 2001 },
      };

      const demo = demoAccounts[email];
      if (demo && demo.password === password && demo.role === role) {
        const userData = { user_id: demo.user_id, email, name: demo.name, role: demo.role };
        setUser(userData);
        setToken('demo-token');
        localStorage.setItem('auth_token', 'demo-token');
        localStorage.setItem('user', JSON.stringify(userData));
        return { success: true, user: userData };
      }

      return { success: false, error: 'Cannot reach server. Use demo accounts: student@deeplearn.edu / Student123' };
    }
  }, []);

  // ── Register: call backend ────────────────────────────────────────────────
  const register = useCallback(async (credentials) => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        const userData = data.user;
        setToken(data.token);
        setUser(userData);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user', JSON.stringify(userData));
        return { success: true, user: userData };
      }

      return { success: false, error: data.error || 'Registration failed' };
    } catch (err) {
      return { success: false, error: 'Cannot reach server. Please try again later.' };
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }, []);

  // ── Role checks ───────────────────────────────────────────────────────────
  const isTeacher = useMemo(() => user?.role === 'teacher', [user]);
  const isStudent = useMemo(() => user?.role === 'student', [user]);
  const isAuthenticated = useMemo(() => !!user && !!token, [user, token]);

  // ── Authenticated fetch helper ────────────────────────────────────────────
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  }, [token]);

  const value = useMemo(() => ({
    user,
    token,
    loading,
    login,
    register,
    logout,
    isTeacher,
    isStudent,
    isAuthenticated,
    authFetch,
  }), [user, token, loading, login, register, logout, isTeacher, isStudent, isAuthenticated, authFetch]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
