import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE } from '../utils/api';

const AuthContext = createContext(null);

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
        if (parsed) {
          if (!parsed.id && parsed.user_id) {
            parsed.id = parsed.user_id;
          }
          console.log('[TOKEN_VALIDATED] restored user session:', parsed.email, 'role:', parsed.role);
        }
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
  // Render free-tier spins down after ~15 min of inactivity; cold starts can
  // take 30-60 s.  We use a generous 60 s timeout and an `onStatusChange`
  // callback so the UI can show "waking up the server…" while we wait.
  const login = useCallback(async (credentials, { onStatusChange } = {}) => {
    // If credentials already contain a token (from register), use directly
    if (credentials.token && credentials.user) {
      const { token: t, user: u } = credentials;
      setToken(t);
      setUser(u);
      localStorage.setItem('auth_token', t);
      localStorage.setItem('user', JSON.stringify(u));
      return { success: true, user: u };
    }

    // ── 1. Quick health probe (2 s) — if it fails the server is cold ────────
    let serverCold = false;
    try {
      const probe = new AbortController();
      const probeTimer = setTimeout(() => probe.abort(), 2000);
      await fetch(`${API_BASE}/`, { method: 'GET', signal: probe.signal });
      clearTimeout(probeTimer);
    } catch {
      serverCold = true;
      if (onStatusChange) onStatusChange('waking');
    }

    // ── 2. Actual login request — 60 s timeout to survive cold starts ───────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (onStatusChange) onStatusChange('done');
      const data = await res.json();

      if (res.ok && data.token) {
        const userData = {
          id: data.user_id,
          user_id: data.user_id,
          email: data.email,
          name: data.name,
          role: data.role,
        };
        console.log('[TOKEN_VALIDATED] user logged in:', userData.email, 'role:', userData.role);
        setToken(data.token);
        setUser(userData);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user', JSON.stringify(userData));
        return { success: true, user: userData };
      }

      return { success: false, error: data.error || 'Login failed. Please check your credentials.' };
    } catch (err) {
      clearTimeout(timeoutId);
      if (onStatusChange) onStatusChange('done');
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'The server is still waking up — this can take up to a minute on the free tier. Please try again.',
        };
      }
      console.error('Login error:', err);
      return { success: false, error: 'Cannot reach the server. Please check your connection and try again.' };
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
        const userData = {
          ...data.user,
          id: data.user.user_id || data.user.id
        };
        console.log('[TOKEN_VALIDATED] user registered:', userData.email, 'role:', userData.role);
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
