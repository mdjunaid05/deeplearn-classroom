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

    // Otherwise, call the login API with a 10-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
      if (err.name === 'AbortError') {
        return { success: false, error: 'Server is taking too long to respond. Please try again in a moment.' };
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
