/**
 * AIRecommendations.jsx
 * Displays AI-generated improvement suggestions based on student behaviour metrics.
 */
import React from 'react';
import { Lightbulb, TrendingUp, BookOpen, Coffee, Focus, Zap } from 'lucide-react';

const RECOMMENDATIONS = {
  Focused: [
    { icon: '🎯', text: 'Outstanding focus! Keep your environment distraction-free.' },
    { icon: '💧', text: 'Take a short hydration break — you\'ve been working hard!' },
    { icon: '📝', text: 'Consider making quick notes to reinforce retention.' },
  ],
  Active: [
    { icon: '✅', text: 'Great engagement! Participate in discussions to reinforce learning.' },
    { icon: '🔗', text: 'Try connecting today\'s content to real-world examples.' },
    { icon: '🤝', text: 'Collaborate with peers — peer learning boosts retention by 50%.' },
  ],
  Passive: [
    { icon: '👀', text: 'Try interactive activities to re-engage with the material.' },
    { icon: '❓', text: 'Ask a question in chat — curiosity drives engagement.' },
    { icon: '📖', text: 'Review key points from the last 10 minutes of the lecture.' },
  ],
  Distracted: [
    { icon: '🎧', text: 'Minimize browser tabs and use focus mode.' },
    { icon: '🍃', text: 'Take a 2-minute mindful breathing break to reset focus.' },
    { icon: '📵', text: 'Put your phone in another room during class time.' },
    { icon: '⏰', text: 'Use Pomodoro: 25 min focus, 5 min break.' },
  ],
  Inactive: [
    { icon: '🙋', text: 'Your presence matters! Rejoin the class and participate.' },
    { icon: '💬', text: 'Send a message in chat to let the teacher know you\'re here.' },
    { icon: '🔔', text: 'Set a reminder to check in every 10 minutes.' },
  ],
  Sleeping: [
    { icon: '☕', text: 'Time for a coffee or water break to boost alertness.' },
    { icon: '🚶', text: 'Stand up and walk for 2 minutes to increase blood flow.' },
    { icon: '💡', text: 'Increase screen brightness or open a window for natural light.' },
  ],
  Absent: [
    { icon: '📹', text: 'Class recordings are saved — catch up when you\'re back!' },
    { icon: '📧', text: 'Notify your teacher if you\'ll miss a session.' },
    { icon: '📚', text: 'Review class materials and complete any missed quizzes.' },
  ],
};

const SCORE_TIPS = {
  low: [
    { icon: '🎯', text: 'Set a specific goal for this class session.' },
    { icon: '📖', text: 'Pre-read the topic to build familiarity before class.' },
  ],
  medium: [
    { icon: '🔄', text: 'Try spaced repetition — review material 24h after class.' },
    { icon: '✏️', text: 'Summarize key concepts in your own words.' },
  ],
  high: [
    { icon: '🚀', text: 'Challenge yourself with advanced exercises on this topic.' },
    { icon: '🏆', text: 'Consider helping a classmate — teaching reinforces learning.' },
  ],
};

export default function AIRecommendations({ behaviour = 'Focused', engagementScore = 75, focusScore = 70 }) {
  const recs = RECOMMENDATIONS[behaviour] || RECOMMENDATIONS.Passive;
  const avgScore = (engagementScore + focusScore) / 2;
  const scoreLevel = avgScore < 40 ? 'low' : avgScore < 70 ? 'medium' : 'high';
  const scoreRecs = SCORE_TIPS[scoreLevel];

  const allRecs = [...recs.slice(0, 2), ...scoreRecs.slice(0, 1)];

  return (
    <div className="glass rounded-2xl border border-slate-200/60 shadow-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200/40 flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-700">AI Recommendations</h3>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${
          scoreLevel === 'high' ? 'bg-emerald-100 text-emerald-600' :
          scoreLevel === 'medium' ? 'bg-amber-100 text-amber-600' :
          'bg-red-100 text-red-600'
        }`}>
          {scoreLevel === 'high' ? 'Excellent' : scoreLevel === 'medium' ? 'Good' : 'Needs Work'}
        </span>
      </div>
      <div className="p-5 space-y-3">
        {allRecs.map((rec, idx) => (
          <div key={idx}
            className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/60 hover:border-cyan-300 transition-all duration-200 hover:bg-cyan-50/30">
            <span className="text-lg leading-none mt-0.5">{rec.icon}</span>
            <p className="text-sm text-slate-600 leading-relaxed">{rec.text}</p>
          </div>
        ))}
        <div className="pt-2 text-xs text-slate-400 text-center">
          Powered by DeepLearn AI · Updates every session
        </div>
      </div>
    </div>
  );
}
