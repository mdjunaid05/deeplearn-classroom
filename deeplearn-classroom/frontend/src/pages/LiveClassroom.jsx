import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import {
  Video, Mic, MicOff, VideoOff, Hand, PhoneOff, MessageSquare, 
  Users, Activity, HandMetal, AlertCircle, Send, Play, Square, 
  Pause, MonitorUp, Settings, StopCircle
} from 'lucide-react';
import CaptionOverlay from '../components/CaptionOverlay';
import VisualAlertBanner from '../components/VisualAlertBanner';
import { useAuth } from '../contexts/AuthContext';

export default function LiveClassroom() {
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  
  const fullTranscriptRef = useRef([]);
  const sessionTimeRef = useRef(0);

  // Sync ref with state
  useEffect(() => {
    sessionTimeRef.current = sessionTime;
  }, [sessionTime]);
  const [liveCaption, setLiveCaption] = useState("Microphone active. Start speaking...");
  const [isClassStarted, setIsClassStarted] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);
  const peerRef = useRef(null);
  const recognitionRef = useRef(null);
  const isMutedRef = useRef(isMuted);
  const callsRef = useRef([]);
  const [connectedStudents, setConnectedStudents] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Keep isMutedRef up to date for the recognition onend handler
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Recording timer
  useEffect(() => {
    let interval;
    if (isRecording && !isRecordingPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isRecordingPaused]);

  // Session timer
  useEffect(() => {
    if (!isClassStarted) return;
    const timer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isClassStarted]);

  // Start Class API
  const startLiveClass = async () => {
    try {
      if (user?.role === 'teacher') {
        const res = await fetch('http://127.0.0.1:5000/start-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: user.id || 1, course_id: 1 })
        });
        const data = await res.json();
        if (data.session_id) {
          setSessionId(data.session_id);
        }
      }
      setIsClassStarted(true);
    } catch (err) {
      console.error("Failed to start class on server", err);
      setIsClassStarted(true); // Fallback to local
    }
  };

  // End Class API
  const endLiveClass = async () => {
    if (isRecording) {
      stopRecording();
    }
    try {
      if (user?.role === 'teacher' && sessionId) {
        await fetch('http://127.0.0.1:5000/end-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
      }
    } catch (err) {
      console.error("Failed to end class on server", err);
    }
    
    if (peerRef.current) peerRef.current.destroy();
    window.location.href = user?.role === 'teacher' ? '/teacher' : '/student';
  };

  // Recording Logic
  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const options = { mimeType: 'video/webm; codecs=vp9,opus' };
    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = uploadRecording;
      
      mediaRecorder.start(1000); // collect 1s chunks
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setIsRecordingPaused(false);
      setActiveAlert({ type: 'info', message: 'Recording started.', duration: 3000 });
    } catch (e) {
      console.error('MediaRecorder error:', e);
      setActiveAlert({ type: 'error', message: 'Failed to start recording. Format not supported.', duration: 3000 });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsRecordingPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsRecordingPaused(false);
      setActiveAlert({ type: 'info', message: 'Recording stopped. Processing upload...', duration: 3000 });
    }
  };

  const uploadRecording = async () => {
    if (recordedChunksRef.current.length === 0) return;
    
    setIsUploading(true);
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('video', blob, 'recording.webm');
    formData.append('session_id', sessionId || `local_${Date.now()}`);
    formData.append('teacher_id', user?.id || 1);
    formData.append('course_id', 1);
    formData.append('duration', recordingTime);
    formData.append('participants_count', connectedStudents + 1);
    formData.append('transcript', JSON.stringify(fullTranscriptRef.current));

    try {
      const res = await fetch('http://127.0.0.1:5000/upload-recording', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setActiveAlert({ type: 'success', message: 'Recording saved and uploaded successfully.', duration: 5000 });
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      console.error('Upload error', err);
      setActiveAlert({ type: 'error', message: 'Failed to upload recording. A backup might be needed.', duration: 5000 });
    } finally {
      setIsUploading(false);
    }
  };

  // Screen Share
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const displayTrack = displayStream.getVideoTracks()[0];
        
        // Save original track
        originalVideoTrackRef.current = streamRef.current.getVideoTracks()[0];
        
        // Replace track in stream
        streamRef.current.removeTrack(originalVideoTrackRef.current);
        streamRef.current.addTrack(displayTrack);
        
        // Replace track in peers
        if (peerRef.current && user?.role === 'teacher') {
          Object.values(peerRef.current.connections).forEach(conns => {
            conns.forEach(conn => {
              const sender = conn.peerConnection.getSenders().find(s => s.track.kind === 'video');
              if (sender) sender.replaceTrack(displayTrack);
            });
          });
        }
        
        // Update local video
        if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
        
        displayTrack.onended = () => {
          stopScreenShare();
        };
        
        setIsScreenSharing(true);
      } catch (err) {
        console.error('Error sharing screen:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    const currentVideoTrack = streamRef.current.getVideoTracks()[0];
    currentVideoTrack.stop();
    
    streamRef.current.removeTrack(currentVideoTrack);
    streamRef.current.addTrack(originalVideoTrackRef.current);
    
    // Replace track in peers
    if (peerRef.current && user?.role === 'teacher') {
      Object.values(peerRef.current.connections).forEach(conns => {
        conns.forEach(conn => {
          const sender = conn.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(originalVideoTrackRef.current);
        });
      });
    }
    
    if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
    setIsScreenSharing(false);
  };

  // Initialize Speech Recognition
  useEffect(() => {
    if (!isClassStarted) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const result = event.results[lastResultIndex];
        const currentSentence = result[0].transcript;
        
        if (currentSentence.trim()) {
          setLiveCaption(currentSentence);
          if (result.isFinal) {
            fullTranscriptRef.current.push({
              text: currentSentence.trim(),
              start_time: Math.max(0, sessionTimeRef.current - 3),
              end_time: sessionTimeRef.current
            });
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
          console.warn("Speech recognition error:", event.error);
        }
      };
      
      recognition.onend = () => {
        if (!isMutedRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      };
      
      recognitionRef.current = recognition;
    } else {
      setLiveCaption("Live captions not supported in this browser.");
    }
    
    return () => {
      if (recognitionRef.current) {
        recognition.onend = null; 
        recognitionRef.current.stop();
      }
    };
  }, [isClassStarted]);

  // Start Webcam and WebRTC Peer Connection
  useEffect(() => {
    if (!isClassStarted) return;
    
    async function startCameraAndPeer() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = mediaStream;
        originalVideoTrackRef.current = mediaStream.getVideoTracks()[0];
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }

        if (user?.role === 'teacher') {
          const peer = new Peer('deeplearn-teacher-room', {
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
          });
          peerRef.current = peer;

          peer.on('call', (call) => {
            call.answer(streamRef.current); // Send stream to student
            callsRef.current.push(call);
            setConnectedStudents(callsRef.current.length);

            call.on('close', () => {
              callsRef.current = callsRef.current.filter(c => c !== call);
              setConnectedStudents(callsRef.current.length);
            });
          });
          
          // Automatically start recording when live class starts
          setTimeout(() => {
            startRecording();
          }, 500);
        } else {
          // Student logic
          const peer = new Peer({
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
          });
          peerRef.current = peer;

          peer.on('open', () => {
            const call = peer.call('deeplearn-teacher-room', streamRef.current);
            call.on('stream', (teacherStream) => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = teacherStream;
              }
            });
            call.on('close', () => {
              setActiveAlert({ type: 'error', message: 'Teacher ended the live class.', duration: 5000 });
              setIsClassStarted(false);
            });
          });
        }
      } catch (err) {
        console.error("Camera access denied or unavailable", err);
        setActiveAlert({ type: 'error', message: 'Could not access camera/microphone.', duration: 5000 });
      }
    }
    
    startCameraAndPeer();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) peerRef.current.destroy();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isClassStarted, user?.role]);

  // Toggle video/audio tracks
  useEffect(() => {
    if (!isClassStarted) return;
    
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => track.enabled = !isMuted);
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !isVideoOff;
    }
    
    if (recognitionRef.current) {
      if (!isMuted) {
        try {
          recognitionRef.current.start();
          setLiveCaption("Microphone active. Start speaking...");
        } catch (e) {}
      } else {
        recognitionRef.current.stop();
        setLiveCaption("Microphone muted.");
      }
    }
  }, [isMuted, isVideoOff, isClassStarted]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages([...chatMessages, { user: 'You', msg: chatInput, time: 'Just now' }]);
    setChatInput("");
  };

  if (!isClassStarted) {
    return (
      <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex items-center justify-center min-h-[80vh]">
        <div className="text-center glass p-10 rounded-3xl max-w-md w-full relative overflow-hidden shadow-lg border border-slate-200/60">
          <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-6 glow-primary">
            <Video className="w-12 h-12 text-primary-500" />
          </div>
          <h2 className="text-3xl font-display font-bold text-slate-800 mb-3">Live Session</h2>
          <p className="text-slate-600 mb-8">
            {user?.role === 'teacher' 
              ? 'Start the live class to begin streaming your video to the students.' 
              : 'Join the live class to participate.'}
          </p>
          <button
            onClick={startLiveClass}
            className="w-full py-4 rounded-xl font-bold text-white text-lg bg-primary-600 hover:bg-primary-500 shadow-lg shadow-primary-600/30 transition-all hover:scale-[1.02]"
          >
            {user?.role === 'teacher' ? 'Start Live Class' : 'Join Live Class'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6" role="main">
      <div className="mb-4 w-full max-w-3xl mx-auto">
        <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Video className="w-6 h-6 text-red-500 animate-pulse" />
            Live Classroom
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            Advanced Neural Networks 
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            {formatTime(sessionTime)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Recording Controls for Teacher */}
          {user?.role === 'teacher' && (
            <div className="flex items-center gap-2 bg-white rounded-xl p-1.5 shadow-sm border border-slate-200">
              {isRecording ? (
                <>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-200 bg-red-50 text-red-600`}>
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                    Auto-Recording: {formatTime(recordingTime)}
                  </div>
                </>
              ) : isUploading ? (
                <span className="text-xs text-primary-500 font-semibold px-2 animate-pulse">Saving Recording...</span>
              ) : (
                <span className="text-xs text-slate-500 font-semibold px-2">Ready to record</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-100 text-red-600 shadow-sm">
            <span className="text-xs font-bold tracking-widest">LIVE</span>
          </div>

          <button onClick={endLiveClass} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02]">
             {user?.role === 'teacher' ? 'End Class' : 'Leave'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column - Video & Controls (Span 8) */}
        <div className="lg:col-span-9 flex flex-col space-y-4">
          
          {/* Main Video View */}
          <div className="relative rounded-2xl bg-slate-900 overflow-hidden flex-1 min-h-[500px] border border-slate-800 shadow-2xl">
            {user?.role === 'teacher' ? (
              <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-contain ${isVideoOff ? 'hidden' : 'block'} ${!isScreenSharing && 'transform scale-x-[-1]'}`} />
            ) : (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
            )}

            {/* Video Off Placeholder */}
            {(user?.role === 'teacher' && isVideoOff && !isScreenSharing) && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                 <div className="text-center">
                    <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                      <Users className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{user.name}</h3>
                 </div>
              </div>
            )}
            
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md text-xs font-semibold text-white z-20">
              {user?.role === 'teacher' ? `${user.name} (Host) ${isScreenSharing ? '- Screen Sharing' : ''}` : 'Teacher (Host)'}
            </div>

            <div className="absolute bottom-4 left-4 right-4 z-20">
              <CaptionOverlay active={!isVideoOff || user?.role === 'student'} mockText={liveCaption} />
            </div>
          </div>

          {/* Teacher Tool Bar */}
          <div className="flex items-center justify-center gap-4 py-3 px-6 rounded-2xl glass shadow-sm border border-slate-200">
            <button onClick={() => setIsMuted(!isMuted)} className={`p-3.5 rounded-full transition-all ${isMuted ? 'bg-red-50 text-red-500' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}>
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button onClick={() => setIsVideoOff(!isVideoOff)} className={`p-3.5 rounded-full transition-all ${isVideoOff ? 'bg-red-50 text-red-500' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}>
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
            {user?.role === 'teacher' && (
              <button onClick={toggleScreenShare} className={`p-3.5 rounded-full transition-all ${isScreenSharing ? 'bg-primary-50 text-primary-600' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}>
                <MonitorUp className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => setHandRaised(!handRaised)} className={`p-3.5 rounded-full transition-all ${handRaised ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}>
              <Hand className="w-5 h-5" />
            </button>
            <div className="w-px h-8 bg-slate-200 mx-2"></div>
            <button onClick={endLiveClass} className="p-3.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors">
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Column - Sidebar (Span 4) */}
        <div className="lg:col-span-3 flex flex-col space-y-4">
          
          {/* AI Tools & Accessibility */}
          <div className="p-4 rounded-2xl glass shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" /> AI & Accessibility
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors">
                <MessageSquare className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Auto Captions</span>
              </button>
              <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                <HandMetal className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Sign Language</span>
              </button>
              <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors">
                <Activity className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Analytics</span>
              </button>
              <button className="flex flex-col items-center justify-center p-3 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                <Users className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Attendance</span>
              </button>
            </div>
          </div>

          {/* Participants Area */}
          <div className="p-4 rounded-2xl glass shadow-sm border border-slate-200 flex-1 flex flex-col">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Participants ({user?.role === 'teacher' ? connectedStudents + 1 : 2})
            </h3>
            <div className="flex-1 space-y-2 overflow-y-auto max-h-40 pr-2">
               <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                 <span className="text-sm font-semibold text-slate-700">{user?.role === 'teacher' ? `${user.name} (Host, You)` : 'Teacher (Host)'}</span>
                 <div className="flex gap-2">
                    {user?.role === 'teacher' && isMuted ? <MicOff className="w-4 h-4 text-slate-400" /> : <Mic className="w-4 h-4 text-emerald-500" />}
                 </div>
               </div>
               
               {user?.role === 'student' && (
                 <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                   <span className="text-sm font-semibold text-slate-700">{user.name} (You)</span>
                   {isMuted ? <MicOff className="w-4 h-4 text-slate-400" /> : <Mic className="w-4 h-4 text-emerald-500" />}
                 </div>
               )}

               {user?.role === 'teacher' && Array.from({ length: connectedStudents }).map((_, i) => (
                 <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                   <span className="text-sm text-slate-600">Student {i + 1}</span>
                   <Mic className="w-4 h-4 text-emerald-500" />
                 </div>
               ))}
            </div>
          </div>

          {/* Chat */}
          <div className="p-4 rounded-2xl glass shadow-sm border border-slate-200 flex flex-col h-64">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Live Chat
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-2">
              {chatMessages.map((chat, idx) => (
                <div key={idx} className="bg-slate-50 p-2.5 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                     <span className={`text-xs font-bold ${chat.user === 'You' ? 'text-primary-600' : 'text-slate-700'}`}>{chat.user}</span>
                     <span className="text-[10px] text-slate-400">{chat.time}</span>
                  </div>
                  <p className="text-xs text-slate-600">{chat.msg}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2 mt-auto">
               <input 
                 type="text" 
                 value={chatInput}
                 onChange={(e) => setChatInput(e.target.value)}
                 className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 shadow-sm"
                 placeholder="Type message..."
               />
               <button type="submit" className="p-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white shadow-sm transition-colors">
                 <Send className="w-4 h-4" />
               </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
