import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * StudentRoute — requires student role.
 * Redirects unauthenticated users to login, teachers to their dashboard.
 */
export default function StudentRoute({ children }) {
  const { user, loading, isStudent } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
          <p className="text-sm text-slate-500">Verifying permissions…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?role=student" state={{ from: location }} replace />;
  }

  if (!isStudent) {
    return <Navigate to="/teacher" replace />;
  }

  return children;
}
