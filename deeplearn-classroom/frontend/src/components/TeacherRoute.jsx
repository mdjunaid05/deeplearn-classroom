import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * TeacherRoute — requires teacher role.
 * Redirects unauthenticated users to login, students to their dashboard.
 */
export default function TeacherRoute({ children }) {
  const { user, loading, isTeacher } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#00687a]" />
          <p className="text-sm text-[#6d797d]">Verifying permissions…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?role=teacher" state={{ from: location }} replace />;
  }

  if (!isTeacher) {
    return <Navigate to="/student" replace />;
  }

  return children;
}
