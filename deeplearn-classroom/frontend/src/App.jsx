import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
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
import ProtectedRoute from './components/ProtectedRoute';
import TeacherRoute from './components/TeacherRoute';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-surface-900">
        <Navbar />
        <main className="pt-16">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            
            {/* Student & Shared Routes (Protected) */}
            <Route path="/student" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
            <Route path="/classroom" element={<ProtectedRoute><VirtualClassroom /></ProtectedRoute>} />
            <Route path="/live-classroom" element={<ProtectedRoute><LiveClassroom /></ProtectedRoute>} />
            <Route path="/sign-input" element={<ProtectedRoute><SignLanguageInput /></ProtectedRoute>} />
            <Route path="/lip-reading" element={<ProtectedRoute><LipReadingSupport /></ProtectedRoute>} />
            <Route path="/alerts" element={<ProtectedRoute><VisualAlerts /></ProtectedRoute>} />
            
            {/* Teacher Only Routes */}
            <Route path="/teacher" element={<TeacherRoute><TeacherDashboard /></TeacherRoute>} />
            <Route path="/behaviour" element={<TeacherRoute><BehaviourMonitor /></TeacherRoute>} />
            <Route path="/engagement" element={<TeacherRoute><EngagementAnalytics /></TeacherRoute>} />
            <Route path="/video-upload" element={<TeacherRoute><VideoUpload /></TeacherRoute>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
