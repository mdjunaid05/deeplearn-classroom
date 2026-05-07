import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import VirtualClassroom from './pages/VirtualClassroom';
import BehaviourMonitor from './pages/BehaviourMonitor';
import EngagementAnalytics from './pages/EngagementAnalytics';
import SignLanguageInput from './pages/SignLanguageInput';
import LipReadingSupport from './pages/LipReadingSupport';
import VisualAlerts from './pages/VisualAlerts';
import VideoUpload from './pages/VideoUpload';
import LiveClassroom from './pages/LiveClassroom';
import RecordedClasses from './pages/RecordedClasses';

// Route guards
import ProtectedRoute from './components/ProtectedRoute';
import TeacherRoute from './components/TeacherRoute';
import StudentRoute from './components/StudentRoute';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-surface-900">
        <Navbar />
        <main className="pt-16">
          <Routes>
            {/* ── Public Routes ──────────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ── Student Dashboard (student-only) ───────────────────────── */}
            <Route path="/student" element={
              <StudentRoute><StudentDashboard /></StudentRoute>
            } />

            {/* ── Teacher Dashboard (teacher-only) ───────────────────────── */}
            <Route path="/teacher" element={
              <TeacherRoute><TeacherDashboard /></TeacherRoute>
            } />

            {/* ── Shared Protected Routes (any authenticated user) ───────── */}
            <Route path="/classroom" element={
              <ProtectedRoute><VirtualClassroom /></ProtectedRoute>
            } />
            <Route path="/live-classroom" element={
              <ProtectedRoute><LiveClassroom /></ProtectedRoute>
            } />
            <Route path="/sign-input" element={
              <ProtectedRoute><SignLanguageInput /></ProtectedRoute>
            } />
            <Route path="/lip-reading" element={
              <ProtectedRoute><LipReadingSupport /></ProtectedRoute>
            } />
            <Route path="/alerts" element={
              <ProtectedRoute><VisualAlerts /></ProtectedRoute>
            } />

            {/* ── Teacher-Only Routes ────────────────────────────────────── */}
            <Route path="/behaviour" element={
              <TeacherRoute><BehaviourMonitor /></TeacherRoute>
            } />
            <Route path="/engagement" element={
              <TeacherRoute><EngagementAnalytics /></TeacherRoute>
            } />
            <Route path="/video-upload" element={
              <TeacherRoute><VideoUpload /></TeacherRoute>
            } />
            <Route path="/recordings" element={
              <TeacherRoute><RecordedClasses /></TeacherRoute>
            } />

            {/* ── Catch-all redirect ─────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
