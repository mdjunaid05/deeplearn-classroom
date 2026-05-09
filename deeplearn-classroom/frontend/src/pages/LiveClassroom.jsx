import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Mic, MicOff, VideoOff, Hand, PhoneOff, MessageSquare,
  Users, Activity, Send, Play, Pause, MonitorUp, StopCircle,
  AlertCircle, Loader2, WifiOff
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLiveCaption } from '../utils/useLiveCaption';
import { useParticipants } from '../utils/useParticipants';
import VisualAlertBanner from '../components/VisualAlertBanner';

const API_BASE = import.meta.env.VITE_API_URL || '';

const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

// Participant card
function ParticipantCard({ p }) {
  const initials = p.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || '??';
  return (
    <div className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all duration-300 ${
      p.isSpeaking ? 'bg-cyan-50 border border-cyan-200 shadow-sm shadow-cyan-100' : 'bg-white border border-slate-100'
    }`}>
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
          style={{ background: p.avatarColor || '#06b6d4' }}>
          {initials}
        </div>
        {p.isSpeaking && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyan-400 border-2 border-white animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">{p.name}</p>
        <p className="text-[10px] text-slate-400 capitalize">{p.role}</p>
      </div>
      <div className="flex gap-1">
        {p.is_muted    && <MicOff   className="w-3.5 h-3.5 text-red-400" />}
        {p.is_video_off && <VideoOff className="w-3.5 h-3.5 text-red-400" />}
      </div>
    </div>
  );
}

export default function LiveClassroom() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isClassStarted, setIsClassStarted] = useState(false);
  const [sessionId,  setSessionId]  = useState(null);
  const [isMuted,    setIsMuted]    = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const [chatInput,   setChatInput]   = useState('');
  const [chatMessages,setChatMessages]= useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const [activeTab,   setActiveTab]   = useState('participants'); // 'participants' | 'chat'

  // Recording
  const [isRecording,       setIsRecording]       = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingTime,     setRecordingTime]     = useState(0);
  const [isScreenSharing,   setIsScreenSharing]   = useState(false);
  const [isUploading,       setIsUploading]       = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const origVideoTrackRef = useRef(null);
  const peerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const callsRef = useRef([]);

  // ── Live captions (fixed hook) ──────────────────────────────────────────
  const {
    caption, interimText, isListening, error: captionError,
    transcript, transcriptRef, handleMute: captionHandleMute,
  } = useLiveCaption({ enabled: isClassStarted && !isMuted, sessionTime });

  // ── Participants (polling hook) ─────────────────────────────────────────
  const { participants, loading: participantsLoading } = useParticipants({
    sessionId, user, isActive: isClassStarted, isMuted, isVideoOff,
  });

  // ── Session timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isClassStarted) return;
    const t = setInterval(() => setSessionTime(p=>p+1), 1000);
    return () => clearInterval(t);
  }, [isClassStarted]);

  // ── Recording timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording || isRecordingPaused) return;
    const t = setInterval(() => setRecordingTime(p=>p+1), 1000);
    return () => clearInterval(t);
  }, [isRecording, isRecordingPaused]);

  // ── Sync mute → captions & tracks ──────────────────────────────────────
  useEffect(() => {
    if (!isClassStarted) return;
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => t.enabled = !isMuted);
      const vt = streamRef.current.getVideoTracks()[0];
      if (vt) vt.enabled = !isVideoOff;
    }
    captionHandleMute(isMuted);
  }, [isMuted, isVideoOff, isClassStarted, captionHandleMute]);

  // ── Start class ─────────────────────────────────────────────────────────
  const startLiveClass = async () => {
    try {
      if (user?.role === 'teacher') {
        const res  = await fetch(`${API_BASE}/start-class`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ teacher_id: user.user_id||user.id||1, course_id: 1 }),
        });
        const data = await res.json();
        if (data.session_id) setSessionId(data.session_id);
      } else {
        setSessionId('deeplearn-live-room');
      }
    } catch { setSessionId('deeplearn-live-room'); }
    setIsClassStarted(true);
  };

  // ── End class ───────────────────────────────────────────────────────────
  const endLiveClass = async () => {
    if (isRecording) stopRecording();
    try {
      if (sessionId) await fetch(`${API_BASE}/end-class`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {}
    if (peerRef.current) peerRef.current.destroy();
    if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    navigate(user?.role==='teacher' ? '/teacher' : '/student');
  };

  // ── Recording helpers ───────────────────────────────────────────────────
  const uploadRecording = useCallback(async () => {
    if (!recordedChunksRef.current.length) return;
    setIsUploading(true);
    const blob = new Blob(recordedChunksRef.current, { type:'video/webm' });
    const fd = new FormData();
    fd.append('video', blob, 'recording.webm');
    fd.append('session_id', sessionId || `local_${Date.now()}`);
    fd.append('teacher_id', user?.user_id||user?.id||1);
    fd.append('course_id', 1);
    fd.append('duration', recordingTime);
    fd.append('participants_count', participants.length);
    fd.append('transcript', JSON.stringify(transcriptRef.current));
    try {
      const res = await fetch(`${API_BASE}/upload-recording`, { method:'POST', body:fd });
      if (res.ok) setActiveAlert({ type:'success', message:'Recording saved!', duration:5000 });
      else throw new Error();
    } catch { setActiveAlert({ type:'error', message:'Upload failed.', duration:5000 }); }
    setIsUploading(false);
  }, [sessionId, user, recordingTime, participants.length, transcriptRef]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    try {
      const mr = new MediaRecorder(streamRef.current, { mimeType:'video/webm; codecs=vp9,opus' });
      mr.ondataavailable = e => { if (e.data?.size>0) recordedChunksRef.current.push(e.data); };
      mr.onstop = uploadRecording;
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setIsRecordingPaused(false);
    } catch(e) { console.error(e); }
  }, [uploadRecording]);

  const pauseRecording  = () => { mediaRecorderRef.current?.pause();  setIsRecordingPaused(true);  };
  const resumeRecording = () => { mediaRecorderRef.current?.resume(); setIsRecordingPaused(false); };
  const stopRecording   = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false); setIsRecordingPaused(false);
    }
  };

  // ── Screen share ────────────────────────────────────────────────────────
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const ds = await navigator.mediaDevices.getDisplayMedia({ video:true });
        const dt = ds.getVideoTracks()[0];
        origVideoTrackRef.current = streamRef.current.getVideoTracks()[0];
        streamRef.current.removeTrack(origVideoTrackRef.current);
        streamRef.current.addTrack(dt);
        if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
        dt.onended = () => { stopScreenShare(); };
        setIsScreenSharing(true);
      } catch {}
    } else stopScreenShare();
  };
  const stopScreenShare = () => {
    if (!origVideoTrackRef.current) return;
    const cur = streamRef.current?.getVideoTracks()[0];
    if (cur) { cur.stop(); streamRef.current.removeTrack(cur); }
    streamRef.current?.addTrack(origVideoTrackRef.current);
    if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
    setIsScreenSharing(false);
  };

  // ── WebRTC ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isClassStarted) return;
    let cleanup = () => {};
    (async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
        streamRef.current = ms;
        origVideoTrackRef.current = ms.getVideoTracks()[0];
        if (localVideoRef.current) localVideoRef.current.srcObject = ms;

        const Peer = (await import('peerjs')).default;
        if (user?.role === 'teacher') {
          const peer = new Peer('deeplearn-teacher-room', {
            config:{ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] }
          });
          peerRef.current = peer;
          peer.on('call', call => {
            call.answer(streamRef.current);
            callsRef.current.push(call);
            call.on('close', () => { callsRef.current = callsRef.current.filter(c=>c!==call); });
          });
          setTimeout(() => { if (streamRef.current) startRecording(); }, 1000);
        } else {
          const peer = new Peer({ config:{ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] } });
          peerRef.current = peer;
          peer.on('open', () => {
            const call = peer.call('deeplearn-teacher-room', streamRef.current);
            call.on('stream', ts => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = ts; });
            call.on('close',  () => { setActiveAlert({ type:'error', message:'Teacher ended the class.', duration:5000 }); setIsClassStarted(false); });
          });
        }
        cleanup = () => {
          ms.getTracks().forEach(t=>t.stop());
          peerRef.current?.destroy();
          if (mediaRecorderRef.current?.state !== 'inactive') try { mediaRecorderRef.current.stop(); } catch {}
        };
      } catch(err) {
        console.error(err);
        setActiveAlert({ type:'error', message:'Could not access camera/microphone.', duration:5000 });
      }
    })();
    return () => cleanup();
  }, [isClassStarted, startRecording, user?.role]);

  const handleSendChat = e => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { user: user?.name||'You', msg: chatInput, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }]);
    setChatInput('');
  };

  // ── Pre-class screen ────────────────────────────────────────────────────
  if (!isClassStarted) return (
    <div className="page-enter max-w-7xl mx-auto px-4 py-20 flex items-center justify-center min-h-[80vh]">
      <div className="text-center glass p-10 rounded-3xl max-w-md w-full shadow-xl border border-slate-200/60">
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-cyan-500/30">
          <Video className="w-12 h-12 text-white" />
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
        </div>
        <h2 className="text-3xl font-display font-bold text-slate-800 mb-2">Live Session</h2>
        <p className="text-slate-500 mb-2 text-sm">
          {user?.role==='teacher' ? 'Start broadcasting to your students.' : 'Join the live class session.'}
        </p>
        <div className="flex items-center justify-center gap-1.5 text-xs text-cyan-600 bg-cyan-50 px-3 py-1.5 rounded-full w-fit mx-auto mb-8">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </div>
        <button onClick={startLiveClass}
          className="w-full py-4 rounded-xl font-bold text-white text-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02]">
          {user?.role==='teacher' ? '🎬 Start Live Class' : '🔗 Join Live Class'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activeAlert && (
        <VisualAlertBanner type={activeAlert.type} message={activeAlert.message}
          duration={activeAlert.duration} onClose={() => setActiveAlert(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Video className="w-7 h-7 text-cyan-500" />
            Live Classroom
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-red-500 text-white px-2.5 py-1 rounded-full ml-1">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />LIVE
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {sessionId ? `Session: ${sessionId.slice(0,12)}…` : 'Local session'}
            {' · '}{participants.length} participant{participants.length!==1?'s':''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg">{fmt(sessionTime)}</span>
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC {fmt(recordingTime)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main video area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video border border-slate-700 shadow-xl">
            {user?.role==='teacher'
              ? <video ref={localVideoRef}  autoPlay playsInline muted className="w-full h-full object-cover" />
              : <video ref={remoteVideoRef} autoPlay playsInline       className="w-full h-full object-cover" />
            }
            {/* Student PiP */}
            {user?.role !== 'teacher' && (
              <div className="absolute bottom-4 right-4 w-28 h-20 rounded-lg overflow-hidden border-2 border-white/30 shadow-lg">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
            )}
            {/* Video off overlay */}
            {isVideoOff && (
              <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                  <VideoOff className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Camera off</p>
                </div>
              </div>
            )}
            {/* Caption bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 py-4">
              <div className="flex items-center gap-2 mb-1.5 justify-center">
                {isListening
                  ? <span className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-semibold tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />LIVE CAPTIONS</span>
                  : <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><WifiOff className="w-3 h-3"/>CAPTIONS OFF</span>
                }
              </div>
              <p className="text-white text-sm text-center max-w-2xl mx-auto leading-relaxed min-h-[1.5rem]">
                {interimText
                  ? <><span className="opacity-60 italic">{interimText}</span></>
                  : caption || (isMuted ? 'Microphone muted.' : 'Start speaking to generate captions...')
                }
              </p>
              {captionError && (
                <p className="text-amber-400 text-[10px] text-center mt-1 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3"/>{captionError}
                </p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="glass rounded-2xl border border-slate-200/60 p-3">
            <div className="flex items-center justify-center gap-2.5 flex-wrap">
              <button onClick={() => setIsMuted(!isMuted)}
                className={`p-3 rounded-xl transition-all duration-200 ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                title={isMuted?'Unmute':'Mute'}>
                {isMuted ? <MicOff className="w-5 h-5"/> : <Mic className="w-5 h-5"/>}
              </button>

              <button onClick={() => setIsVideoOff(!isVideoOff)}
                className={`p-3 rounded-xl transition-all duration-200 ${isVideoOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                title={isVideoOff?'Camera On':'Camera Off'}>
                {isVideoOff ? <VideoOff className="w-5 h-5"/> : <Video className="w-5 h-5"/>}
              </button>

              <button onClick={() => setHandRaised(!handRaised)}
                className={`p-3 rounded-xl transition-all duration-200 ${handRaised ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                title="Raise Hand">
                <Hand className="w-5 h-5"/>
              </button>

              {user?.role==='teacher' && (<>
                <button onClick={toggleScreenShare}
                  className={`p-3 rounded-xl transition-all duration-200 ${isScreenSharing ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  title="Screen Share">
                  <MonitorUp className="w-5 h-5"/>
                </button>
                {!isRecording
                  ? <button onClick={startRecording} className="p-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all" title="Record"><Play className="w-5 h-5"/></button>
                  : <>
                      <button onClick={isRecordingPaused?resumeRecording:pauseRecording}
                        className="p-3 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">
                        {isRecordingPaused?<Play className="w-5 h-5"/>:<Pause className="w-5 h-5"/>}
                      </button>
                      <button onClick={stopRecording} className="p-3 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 transition-all">
                        <StopCircle className="w-5 h-5"/>
                      </button>
                    </>
                }
              </>)}

              <button onClick={endLiveClass}
                className="p-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all ml-2 shadow-lg shadow-red-500/30"
                title="Leave">
                <PhoneOff className="w-5 h-5"/>
              </button>
            </div>

            {isUploading && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-cyan-600">
                <Loader2 className="w-4 h-4 animate-spin"/>Uploading recording…
              </div>
            )}
          </div>

          {/* Live transcript preview */}
          {transcript.length > 0 && (
            <div className="glass rounded-xl border border-slate-200/60 p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Live Transcript ({transcript.length} segments)</h3>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {transcript.slice(-6).map((seg, i) => (
                  <p key={i} className="text-xs text-slate-600">
                    <span className="font-mono text-slate-400 mr-2">{fmt(Math.floor(seg.start_time||0))}</span>
                    {seg.text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="glass rounded-2xl border border-slate-200/60 shadow-lg flex flex-col overflow-hidden" style={{maxHeight: 640}}>
          {/* Tab switcher */}
          <div className="flex border-b border-slate-200/60">
            {[{key:'participants', icon:Users, label:'People'}, {key:'chat', icon:MessageSquare, label:'Chat'}].map(({key,icon:Icon,label}) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                  activeTab===key ? 'text-cyan-600 border-b-2 border-cyan-500 bg-cyan-50/50' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon className="w-3.5 h-3.5"/>{label}
                {key==='participants' && (
                  <span className="ml-0.5 text-[9px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-bold">{participants.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Participants tab */}
          {activeTab==='participants' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {participantsLoading && participants.length===0 && (
                <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin"/>Connecting…
                </div>
              )}
              {participants.length===0 && !participantsLoading && (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 text-slate-200 mx-auto mb-2"/>
                  <p className="text-xs text-slate-400">Waiting for participants…</p>
                </div>
              )}
              {participants.map((p, i) => <ParticipantCard key={p.user_id||i} p={p}/>)}
            </div>
          )}

          {/* Chat tab */}
          {activeTab==='chat' && (<>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {chatMessages.length===0 && (
                <p className="text-xs text-slate-400 text-center py-8">No messages yet.</p>
              )}
              {chatMessages.map((msg,i) => (
                <div key={i} className="bg-white rounded-xl px-3 py-2 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-cyan-600">{msg.user}</span>
                    <span className="text-[10px] text-slate-400">{msg.time}</span>
                  </div>
                  <p className="text-sm text-slate-700">{msg.msg}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200/40">
              <div className="flex gap-2">
                <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"/>
                <button type="submit" className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white transition-colors">
                  <Send className="w-4 h-4"/>
                </button>
              </div>
            </form>
          </>)}
        </div>
      </div>
    </div>
  );
}
