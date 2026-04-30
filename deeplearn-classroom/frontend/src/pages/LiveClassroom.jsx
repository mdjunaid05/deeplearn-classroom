import React, { useState, useEffect, useRef } from 'react';
import {
  Video, Mic, MicOff, VideoOff, Hand, PhoneOff, MessageSquare, 
  Users, Activity, HandMetal, AlertCircle, Send
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
  const [liveCaption, setLiveCaption] = useState("Microphone active. Start speaking...");

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        // Show the latest speech (interim or final)
        const displayCaption = finalTranscript || interimTranscript;
        if (displayCaption.trim()) {
          setLiveCaption(displayCaption);
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
      };
      
      recognition.onend = () => {
        // Auto-restart if not muted (handles continuous listening disconnects)
        if (!isMuted && recognitionRef.current) {
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
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Start Webcam
  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = mediaStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Camera access denied or unavailable", err);
        setActiveAlert({ type: 'error', message: 'Could not access camera/microphone. Please check permissions.', duration: 5000 });
      }
    }
    
    startCamera();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Toggle video/audio tracks and speech recognition
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => track.enabled = !isMuted);
      streamRef.current.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
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
  }, [isMuted, isVideoOff]);

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const toggleHandRaise = () => {
    setHandRaised(!handRaised);
    if (!handRaised) {
      setActiveAlert({ type: 'info', message: 'You raised your hand.', duration: 3000 });
    }
  };

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Live Classroom">
      
      {/* Visual Alert Zone at Top */}
      <div className="mb-6 w-full max-w-3xl mx-auto">
        <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <Video className="w-8 h-8 text-red-500 animate-pulse" />
            Live Classroom
          </h1>
          <p className="text-slate-400 mt-1">Advanced Neural Networks — Live Session</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-semibold tracking-wide">LIVE</span>
            <span className="text-sm font-mono ml-2">{formatTime(sessionTime)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content — Video Area */}
        <div className="lg:col-span-3 flex flex-col space-y-4">
          
          {/* Main Speaker/Teacher Video */}
          <div className="relative rounded-2xl glass overflow-hidden flex-1 min-h-[400px] bg-gradient-to-b from-surface-800 to-surface-900 border border-white/10">
            {user?.role === 'teacher' ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'} transform scale-x-[-1]`}
              />
            ) : null}

            {/* Placeholder if teacher's video is off or user is student */}
            {(user?.role === 'student' || (user?.role === 'teacher' && isVideoOff)) && (
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="text-center">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center mx-auto mb-4 glow-primary">
                      <Users className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-white mb-1">
                      {user?.role === 'teacher' ? user.name : 'Dr. Smith'}
                    </h3>
                    <p className="text-sm text-slate-400">Main Presenter</p>
                 </div>
              </div>
            )}
            
            {/* Presenter Name Badge */}
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md text-xs font-semibold text-white">
              {user?.role === 'teacher' ? `${user.name} (Host)` : 'Dr. Smith (Teacher)'}
            </div>

            {/* Live Caption Overlay */}
            <CaptionOverlay active={!isVideoOff || user?.role === 'student'} mockText={liveCaption} />
          </div>

          {/* Student Grid (Small view) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 h-32">
            {[1, 2, 3, 4].map((i) => {
              const isLocalStudent = user?.role === 'student' && i === 1;

              return (
                <div key={i} className="rounded-xl glass bg-surface-800 relative overflow-hidden flex items-center justify-center border border-white/5">
                  {isLocalStudent ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'} transform scale-x-[-1]`}
                    />
                  ) : null}
                  
                  {(!isLocalStudent || isVideoOff) && (
                    <Users className="w-6 h-6 text-slate-600" />
                  )}

                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/50 text-[10px] text-white">
                    {isLocalStudent ? `${user.name} (You)` : `Student ${i}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 py-4 px-6 rounded-2xl glass mt-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-surface-700 hover:bg-surface-600 text-slate-200'}`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button 
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={`p-4 rounded-full transition-all ${isVideoOff ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-surface-700 hover:bg-surface-600 text-slate-200'}`}
              title={isVideoOff ? "Turn on Camera" : "Turn off Camera"}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
            <button 
              onClick={toggleHandRaise}
              className={`p-4 rounded-full transition-all ${handRaised ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30' : 'bg-surface-700 hover:bg-surface-600 text-slate-200'}`}
              title="Raise Hand"
            >
              <Hand className="w-6 h-6" />
            </button>
            <button 
              className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors ml-4"
              title="Leave Call"
              onClick={() => window.location.href = '/student'}
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>

        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          
          {/* Participants */}
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Participants (24)
            </h3>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
               <div className="flex items-center justify-between">
                 <span className="text-sm text-slate-300">Dr. Smith (Host)</span>
                 <Mic className="w-3 h-3 text-emerald-400" />
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-sm text-slate-300">Alice (You)</span>
                 {isMuted ? <MicOff className="w-3 h-3 text-red-400" /> : <Mic className="w-3 h-3 text-emerald-400" />}
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-sm text-slate-300">Bob</span>
                 <Hand className="w-3 h-3 text-amber-400" />
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-sm text-slate-300">Carol</span>
                 <MicOff className="w-3 h-3 text-red-400" />
               </div>
            </div>
          </div>

          {/* Live Chat */}
          <div className="p-5 rounded-2xl glass flex flex-col h-80">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              Live Chat
            </h3>
            
            <div className="flex-1 space-y-2 overflow-y-auto mb-3 pr-1" role="log" aria-label="Chat messages">
              {chatMessages.map((chat, idx) => (
                <div key={idx} className="p-2 rounded-lg glass-light">
                  <div className="flex items-center justify-between mb-0.5">
                     <span className={`text-xs font-semibold ${chat.user === 'You' ? 'text-primary-400' : 'text-purple-400'}`}>
                       {chat.user}
                     </span>
                     <span className="text-[10px] text-slate-500">{chat.time}</span>
                  </div>
                  <p className="text-xs text-slate-300">{chat.msg}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="flex gap-2 mt-auto">
               <input 
                 type="text" 
                 value={chatInput}
                 onChange={(e) => setChatInput(e.target.value)}
                 className="flex-1 px-3 py-2 rounded-lg bg-surface-800 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                 placeholder="Type a message..."
                 aria-label="Chat message input"
               />
               <button 
                 type="submit" 
                 className="p-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors"
                 aria-label="Send message"
               >
                 <Send className="w-4 h-4" aria-hidden="true" />
               </button>
            </form>
          </div>
          
          {/* Sign Language Input Button */}
          <button 
            onClick={() => setActiveAlert({ type: 'info', message: 'Sign Language Input mode activated for live session.', duration: 3000 })}
            className="w-full p-4 rounded-2xl glass hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors flex items-center justify-center gap-3 text-emerald-400 group"
          >
             <HandMetal className="w-5 h-5 group-hover:scale-110 transition-transform" />
             <span className="font-semibold text-sm">Use Sign Language</span>
          </button>
        </div>
      </div>
    </div>
  );
}
