import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import {
  Video, Mic, MicOff, VideoOff, Hand, PhoneOff, MessageSquare, 
  Users, Activity, HandMetal, AlertCircle, Send, Play, Square, 
  Pause, MonitorUp, Settings, StopCircle
} from 'lucide-react';
import CaptionOverlay from '../components/CaptionOverlay';
import VisualAlertBanner from '../components/VisualAlertBanner';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function LiveClassroom() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  // Start Class API — uses API_BASE instead of hardcoded localhost
  const startLiveClass = async () => {
    try {
      if (user?.role === 'teacher') {
        const res = await fetch(`${API_BASE}/start-class`, {
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

  // End Class API — uses navigate() instead of window.location.href
  const endLiveClass = async () => {
    if (isRecording) {
      stopRecording();
    }
    try {
      if (user?.role === 'teacher' && sessionId) {
        await fetch(`${API_BASE}/end-class`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
      }
    } catch (err) {
      console.error("Failed to end class on server", err);
    }
    
    if (peerRef.current) peerRef.current.destroy();
    navigate(user?.role === 'teacher' ? '/teacher' : '/student');
  };

  // Recording Logic
  const startRecording = useCallback(() => {
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
  }, []);

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

  // Upload uses API_BASE
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
      const res = await fetch(`${API_BASE}/upload-recording`, {
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
              const sender = conn.peerConnection?.getSenders()?.find(s => s.track?.kind === 'video');
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
    if (!streamRef.current || !originalVideoTrackRef.current) return;
    const currentVideoTrack = streamRef.current.getVideoTracks()[0];
    if (currentVideoTrack) {
      currentVideoTrack.stop();
      streamRef.current.removeTrack(currentVideoTrack);
    }
    streamRef.current.addTrack(originalVideoTrackRef.current);
    
    // Replace track in peers
    if (peerRef.current && user?.role === 'teacher') {
      Object.values(peerRef.current.connections).forEach(conns => {
        conns.forEach(conn => {
          const sender = conn.peerConnection?.getSenders()?.find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(originalVideoTrackRef.current);
        });
      });
    }
    
    if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
    setIsScreenSharing(false);
  };

  // Initialize Speech Recognition — fixed scoping bug
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
        // Fixed: was referencing out-of-scope `recognition` variable
        recognitionRef.current.onend = null; 
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, [isClassStarted]);

  // Start Webcam and WebRTC Peer Connection
  useEffect(() => {
    if (!isClassStarted) return;
    const role = user?.role;
    
    async function startCameraAndPeer() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = mediaStream;
        originalVideoTrackRef.current = mediaStream.getVideoTracks()[0];
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }

        if (role === 'teacher') {
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
          
          // Delay recording start to ensure stream is ready
          const recTimeout = setTimeout(() => {
            if (streamRef.current) startRecording();
          }, 1000);
          
          return () => clearTimeout(recTimeout);
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
        streamRef.current = null;
      }
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch(e) {}
      }
    };
  }, [isClassStarted, startRecording]);

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
        try { recognitionRef.current.stop(); } catch (e) {}
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
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activeAlert && (
        <VisualAlertBanner
          type={activeAlert.type}
          message={activeAlert.message}
          duration={activeAlert.duration}
          onClose={() => setActiveAlert(null)}
        />
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Video className="w-7 h-7 text-primary-400" />
            Live Classroom
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.role === 'teacher' ? `Session: ${sessionId || 'Local'} · ${connectedStudents} student(s)` : 'Connected to live session'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg">
            {formatTime(sessionTime)}
          </span>
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC {formatTime(recordingTime)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Video Area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video glass border border-slate-200/60 shadow-lg">
            {user?.role === 'teacher' ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            )}

            {/* Student's own small video (PiP) */}
            {user?.role !== 'teacher' && (
              <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/30 shadow-lg">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
            )}

            {/* Live caption overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-white text-sm text-center max-w-2xl mx-auto leading-relaxed">
                {liveCaption}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-3 rounded-xl transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            
            <button
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={`p-3 rounded-xl transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setHandRaised(!handRaised)}
              className={`p-3 rounded-xl transition-all ${handRaised ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              title="Raise Hand"
            >
              <Hand className="w-5 h-5" />
            </button>

            {user?.role === 'teacher' && (
              <>
                <button
                  onClick={toggleScreenShare}
                  className={`p-3 rounded-xl transition-all ${isScreenSharing ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  title="Screen Share"
                >
                  <MonitorUp className="w-5 h-5" />
                </button>

                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="p-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                    title="Start Recording"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={isRecordingPaused ? resumeRecording : pauseRecording}
                      className="p-3 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
                      title={isRecordingPaused ? "Resume" : "Pause"}
                    >
                      {isRecordingPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={stopRecording}
                      className="p-3 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 transition-all"
                      title="Stop Recording"
                    >
                      <StopCircle className="w-5 h-5" />
                    </button>
                  </>
                )}
              </>
            )}
            
            <button
              onClick={endLiveClass}
              className="p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all ml-4"
              title="End Call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

          {isUploading && (
            <div className="p-3 rounded-xl bg-primary-50 border border-primary-200 text-center">
              <p className="text-sm text-primary-700 font-semibold">Uploading recording...</p>
            </div>
          )}
        </div>

        {/* Sidebar: Chat */}
        <div className="glass rounded-2xl border border-slate-200/60 shadow-lg flex flex-col overflow-hidden max-h-[600px]">
          <div className="px-4 py-3 border-b border-slate-200/40 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-slate-700">Chat</h3>
            <span className="ml-auto text-xs text-slate-400">{chatMessages.length} messages</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {chatMessages.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-8">No messages yet. Start the conversation!</p>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary-600">{msg.user}</span>
                  <span className="text-[10px] text-slate-400">{msg.time}</span>
                </div>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{msg.msg}</p>
              </div>
            ))}
          </div>
          
          <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200/40">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              />
              <button
                type="submit"
                className="p-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
