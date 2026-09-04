import React, { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

/**
 * TranscriptPanel.jsx
 * -------------------
 * Dedicated transcript reading panel located below the video player.
 * Formatted specifically for reading lesson transcription without looking like
 * a duplicate floating video subtitle.
 *
 * Props:
 *   transcript     - Array<{ text: string, timestamp: number }>
 *   currentCaption - string (active caption text being spoken)
 *   isActive       - boolean (whether video is currently playing)
 */
export default function TranscriptPanel({
  transcript = [],
  currentCaption = '',
  isActive = false,
}) {
  const scrollRef = useRef(null);

  // Auto-scroll the transcript list as new segments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length]);

  return (
    <div
      className="w-full p-5 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md transition-all duration-300 shadow-sm"
      role="region"
      aria-label="Lesson Transcript"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00687a]/15 text-[#00687a] flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#131b2e] dark:text-slate-200">
              Transcript
            </h3>
            <p className="text-[11px] text-[#6d797d] dark:text-slate-400">
              Lesson speech transcription
            </p>
          </div>
        </div>

        {transcript.length > 0 && (
          <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-[#00687a]/10 text-[#00687a] dark:text-[#52c7db] border border-[#00687a]/20">
            {transcript.length} {transcript.length === 1 ? 'segment' : 'segments'}
          </span>
        )}
      </div>

      {/* Transcript Text List */}
      <div
        ref={scrollRef}
        className="mt-3 max-h-48 overflow-y-auto space-y-1.5 pr-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {transcript.length === 0 ? (
          <div className="py-6 text-center text-[#6d797d] dark:text-slate-400 text-xs italic">
            {isActive
              ? 'Listening for speech… transcript will update as the lesson plays.'
              : 'Transcript will appear here as the video plays.'}
          </div>
        ) : (
          transcript.map((item, idx) => {
            const isCurrent = currentCaption && item.text === currentCaption;
            const minutes = Math.floor(item.timestamp / 60);
            const seconds = Math.floor(item.timestamp % 60);
            const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            return (
              <div
                key={`transcript-line-${item.timestamp}-${idx}`}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 ${
                  isCurrent
                    ? 'bg-[#00687a]/10 border-l-4 border-[#00687a] text-[#131b2e] dark:text-white font-medium shadow-xs'
                    : 'text-[#3d494c] dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                }`}
              >
                <span className="text-[11px] font-mono text-[#6d797d] dark:text-slate-500 mt-0.5 select-none shrink-0">
                  {timeFormatted}
                </span>
                <p className="flex-1 text-xs sm:text-sm leading-relaxed">
                  {item.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
