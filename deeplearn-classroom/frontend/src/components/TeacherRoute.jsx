import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function TeacherRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login?role=teacher" state={{ from: location }} replace />;
  }

  if (user.role !== 'teacher') {
    return <Navigate to="/student" replace />; // or another page
  }

  return children;
}
