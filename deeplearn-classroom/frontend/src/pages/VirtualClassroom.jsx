import React, { useState, useEffect } from 'react';
import {
  Monitor, Play, Pause, CheckCircle, XCircle, Clock,
  MessageSquare, Activity, BookOpen, ChevronRight, Send, HandMetal
} from 'lucide-react';
import CaptionOverlay from '../components/CaptionOverlay';
import VisualAlertBanner from '../components/VisualAlertBanner';

const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "What is the primary advantage of using a Convolutional Neural Network (CNN)?",
    options: [
      "They are faster to train than linear regression.",
      "They automatically learn spatial hierarchies of features from images.",
      "They process sequential data better than RNNs.",
      "They do not require any training data."
    ],
    correct: 1
  },
  {
    id: 2,
    question: "Which component of an LSTM network helps it avoid the vanishing gradient problem?",
    options: [
      "The softmax activation layer",
      "The pooling layer",
      "The cell state and gating mechanisms",
      "The fully connected output layer"
    ],
    correct: 2
  }
];

export default function VirtualClassroom() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const [engagement, setEngagement] = useState('High');
  const [behaviour, setBehaviour] = useState('Active');
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);

  const MOCK_CAPTION = isPlaying ? "So as you can see, the LSTM network processes sequences..." : "";

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Simulated engagement changes removed for clean state
  useEffect(() => {
    // Engagement and behaviour states will now default to High/Active or be driven by actual API calls in the future.
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleAnswer = (qIdx, optIdx) => {
    setAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmitQuiz = () => {
    setShowResults(true);
  };

  const score = Object.entries(answers).reduce((acc, [qIdx, ans]) => {
    return acc + (QUIZ_QUESTIONS[parseInt(qIdx)]?.correct === ans ? 1 : 0);
  }, 0);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages([...chatMessages, { user: 'You', msg: chatInput, time: 'Just now' }]);
    setChatInput("");
  };

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Virtual Classroom">
      
      {/* Visual Alert Zone at Top */}
      <div className="mb-6 w-full max-w-3xl mx-auto">
        <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <Monitor className="w-8 h-8 text-primary-400" />
            Virtual Classroom
          </h1>
          <p className="text-slate-400 mt-1">Deep Learning Fundamentals — Session Active</p>
        </div>
        <div className="flex gap-3">
          <a
            href="/video-upload"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors"
            aria-label="Upload Class Video"
          >
            <Monitor className="w-4 h-4" aria-hidden="true" />
            Upload Video
          </a>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass">
            <Clock className="w-4 h-4 text-primary-400" />
            <span className="text-sm font-mono text-white">{formatTime(sessionTime)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content — 3 columns */}
        <div className="lg:col-span-3 space-y-6">
          {/* Video Area */}
          <div className="rounded-2xl glass overflow-hidden relative">
            <div className="aspect-video bg-black flex items-center justify-center relative group">
              
              <video
                src="https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4"
                className="w-full h-full object-contain"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                poster="https://storage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg"
              />

              {/* Title overlay (appears on hover) */}
              <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                 <h3 className="text-lg font-bold text-white">Deep Learning Fundamentals</h3>
                 <p className="text-xs text-slate-300">Lecture 5: Neural Network Architectures</p>
              </div>

              {/* Caption Overlay */}
              <div className="absolute bottom-16 left-0 right-0 z-10 pointer-events-none">
                <CaptionOverlay active={isPlaying} mockText={MOCK_CAPTION} />
              </div>
            </div>
          </div>

          {/* Quiz Section */}
          <div className="p-6 rounded-2xl glass">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Quick Assessment
            </h3>

            {!showResults ? (
              <div className="space-y-6">
                {QUIZ_QUESTIONS.map((q, qIdx) => (
                  <div key={q.id} className="p-4 rounded-xl glass-light">
                    <p className="text-sm font-medium text-white mb-3">
                      {qIdx + 1}. {q.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          onClick={() => handleAnswer(qIdx, optIdx)}
                          className={`text-left px-4 py-2.5 rounded-lg text-sm transition-all
                            ${answers[qIdx] === optIdx
                              ? 'bg-primary-600/30 border border-primary-500/50 text-primary-200'
                              : 'bg-white/[0.03] border border-white/5 text-slate-300 hover:bg-white/[0.06] hover:border-white/10'
                            }`}
                          id={`quiz-q${qIdx}-opt${optIdx}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleSubmitQuiz}
                  disabled={Object.keys(answers).length < QUIZ_QUESTIONS.length}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-purple-600
                             text-white font-semibold text-sm
                             hover:from-primary-500 hover:to-purple-500
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all shadow-lg shadow-primary-600/20"
                  id="quiz-submit-btn"
                >
                  Submit Answers
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className={`text-5xl font-display font-bold mb-2 ${
                  score === QUIZ_QUESTIONS.length ? 'text-emerald-400' :
                  score >= QUIZ_QUESTIONS.length / 2 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {score}/{QUIZ_QUESTIONS.length}
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  {score === QUIZ_QUESTIONS.length ? 'Perfect score! Excellent work!' :
                   score >= QUIZ_QUESTIONS.length / 2 ? 'Good job! Keep practicing.' :
                   'Keep studying — you\'ll improve!'}
                </p>

                <div className="space-y-2 text-left mt-6">
                  {QUIZ_QUESTIONS.map((q, qIdx) => (
                    <div key={q.id} className="flex items-center gap-2 p-2 rounded-lg glass-light">
                      {answers[qIdx] === q.correct ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-xs text-slate-300 truncate">{q.question}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => { setShowResults(false); setAnswers({}); }}
                  className="mt-4 px-6 py-2 rounded-lg glass text-sm text-white hover:bg-white/10 transition"
                  id="quiz-retry-btn"
                >
                  Retry Quiz
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — 1 column */}
        <div className="space-y-4">
          {/* Live Engagement */}
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Live Engagement
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${
                engagement === 'High' ? 'bg-emerald-400 shadow-emerald-400/50' :
                engagement === 'Low' ? 'bg-red-400 shadow-red-400/50' : 'bg-amber-400 shadow-amber-400/50'
              } shadow-lg animate-pulse`} />
              <span className={`badge badge-${engagement.toLowerCase()}`}>{engagement}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Updates every 8 seconds</p>
          </div>

          {/* Behaviour Status */}
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Behaviour Status
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <Activity className={`w-4 h-4 ${
                behaviour === 'Active' ? 'text-emerald-400' :
                behaviour === 'Distracted' ? 'text-red-400' : 'text-amber-400'
              }`} />
              <span className={`badge badge-${behaviour.toLowerCase()}`}>{behaviour}</span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Click Rate</span>
                <span className="text-slate-300">—</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Response</span>
                <span className="text-slate-300">—</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Idle Time</span>
                <span className="text-slate-300">—</span>
              </div>
            </div>
          </div>

          {/* Session Info */}
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Session Info
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Course</span>
                <span className="text-slate-300">Deep Learning</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lecture</span>
                <span className="text-slate-300">#5 — NN Arch.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Difficulty</span>
                <span className="badge badge-medium text-[10px]">Medium</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration</span>
                <span className="text-slate-300 font-mono">{formatTime(sessionTime)}</span>
              </div>
            </div>
          </div>

          {/* Text-Only Chat Activity */}
          <div className="p-5 rounded-2xl glass flex flex-col h-72">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              Class Chat (Text Only)
            </h3>
            
            <div className="flex-1 space-y-2 overflow-y-auto mb-3 pr-1" role="log" aria-label="Chat messages">
              {chatMessages.map((chat, idx) => (
                <div key={idx} className="p-2 rounded-lg glass-light">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-primary-300">{chat.user}</span>
                    <span className="text-[10px] text-slate-500">{chat.time}</span>
                  </div>
                  <p className="text-xs text-slate-400">{chat.msg}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="flex gap-2">
               <input 
                 type="text" 
                 value={chatInput}
                 onChange={(e) => setChatInput(e.target.value)}
                 className="flex-1 px-3 py-1.5 rounded-lg bg-surface-800 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                 placeholder="Type a message..."
                 aria-label="Chat message input"
               />
               <button 
                 type="submit" 
                 className="p-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors"
                 aria-label="Send message"
               >
                 <Send className="w-4 h-4" aria-hidden="true" />
               </button>
            </form>
          </div>
          
          {/* Sign Language Input Button */}
          <button 
            onClick={() => setActiveAlert({ type: 'info', message: 'Sign Language Input mode started.', flash: false, duration: 3000 })}
            className="w-full p-4 rounded-2xl glass hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors flex items-center justify-center gap-3 text-emerald-400 group"
            aria-label="Open sign language input"
            tabIndex={0}
          >
             <HandMetal className="w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
             <span className="font-semibold text-sm">Use Sign Language</span>
          </button>
        </div>
      </div>
    </div>
  );
}
