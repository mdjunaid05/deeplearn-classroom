/**
 * useParticipants.js
 * ------------------
 * Real-time participant tracking for the Live Classroom.
 *
 * Strategy:
 *  - On join: POST /session-join  → registers this user with metadata
 *  - Polls   GET  /session-participants?session_id=X every 4 seconds
 *  - On leave: POST /session-leave (+ beforeunload)
 *
 * Each participant record:
 *  { id, name, role, avatarColor, isMuted, isVideoOff, isSpeaking, joinedAt }
 *
 * This works WITHOUT WebSockets by polling — robust in Vercel/Render deploys.
 *
 * STABILITY NOTE: All callbacks used inside the lifecycle effect are accessed
 * through refs so that the effect's dependency array stays stable. This prevents
 * the teardown→re-fire cycle that previously caused flickering and ghost joins.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 4000;
const API_BASE = import.meta.env.VITE_API_URL || '';

// Deterministic avatar color from user id/name
const AVATAR_COLORS = [
  '#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#3b82f6','#ec4899','#14b8a6','#f97316','#6366f1',
];
function avatarColor(seed) {
  const n = [...String(seed)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export function useParticipants({ sessionId, user, isActive, isMuted, isVideoOff }) {
  const [participants, setParticipants] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const pollRef    = useRef(null);
  const joinedRef  = useRef(false);
  const speakingSimRef = useRef(null);

  // ── Keep latest values in refs for use inside stable callbacks ──────────
  const sessionIdRef  = useRef(sessionId);
  const userRef       = useRef(user);
  const isMutedRef    = useRef(isMuted);
  const isVideoOffRef = useRef(isVideoOff);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);

  // ── Register self on session join ─────────────────────────────────────
  const joinSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    const u = userRef.current;
    if (!sid || !u || joinedRef.current) return;
    joinedRef.current = true;

    const payload = {
      session_id: sid,
      user_id:    u.user_id || u.id,
      name:       u.name || 'Anonymous',
      role:       u.role || 'student',
      is_muted:   isMutedRef.current,
      is_video_off: isVideoOffRef.current,
    };

    try {
      await fetch(`${API_BASE}/session-join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('[Participants] Could not reach /session-join:', e.message);
      // Fallback: add self to local state directly
      const self = buildLocalParticipant(u, isMutedRef.current, isVideoOffRef.current);
      setParticipants([self]);
    }
  }, []); // stable — reads from refs

  // ── Leave session ──────────────────────────────────────────────────────
  const leaveSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    const u = userRef.current;
    if (!sid || !u) return;
    const payload = {
      session_id: sid,
      user_id:    u.user_id || u.id,
    };
    try {
      navigator.sendBeacon(
        `${API_BASE}/session-leave`,
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
    } catch (_) {}
  }, []); // stable

  // ── Update own status when mute/video changes ──────────────────────────
  const updateStatus = useCallback(async () => {
    const sid = sessionIdRef.current;
    const u = userRef.current;
    if (!sid || !u) return;
    try {
      await fetch(`${API_BASE}/session-status`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          session_id:   sid,
          user_id:      u.user_id || u.id,
          name:         u.name || 'Unknown',
          role:         u.role || 'student',
          is_muted:     isMutedRef.current,
          is_video_off: isVideoOffRef.current,
        }),
      });
    } catch (_) {}
  }, []); // stable

  // ── Poll participants list ─────────────────────────────────────────────
  const fetchParticipants = useCallback(async () => {
    const sid = sessionIdRef.current;
    const u = userRef.current;
    if (!sid) return;
    try {
      const userId = u?.user_id || u?.id || '';
      const res  = await fetch(`${API_BASE}/session-participants?session_id=${sid}&user_id=${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.participants) {
        // Enrich with local avatar color
        const enriched = data.participants.map(p => ({
          ...p,
          avatarColor: avatarColor(p.user_id || p.name),
        }));
        setParticipants(enriched);
        setError(null);
      }
    } catch (e) {
      // Backend unreachable — keep showing local participant
      setError('Could not reach server. Showing local state.');
    }
  }, []); // stable

  // ── Lifecycle — single stable effect ──────────────────────────────────
  useEffect(() => {
    if (!isActive || !sessionId) return;

    setLoading(true);
    joinSession().then(() => {
      fetchParticipants().finally(() => setLoading(false));
    });

    pollRef.current = setInterval(fetchParticipants, POLL_INTERVAL_MS);

    // Simulate speaking indicator (audio activity) locally
    speakingSimRef.current = setInterval(() => {
      setParticipants(prev =>
        prev.map(p => ({
          ...p,
          isSpeaking: !p.is_muted && Math.random() > 0.7,
        }))
      );
    }, 2000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(speakingSimRef.current);
      pollRef.current = null;
      speakingSimRef.current = null;
      leaveSession();
      // CRITICAL: reset joinedRef so re-mount can re-join
      joinedRef.current = false;
    };
  }, [isActive, sessionId]); // stable primitives only — no callback deps
  // joinSession, fetchParticipants, leaveSession are all stable (empty deps)

  // Update status when mute/video toggles
  useEffect(() => {
    if (isActive && joinedRef.current) {
      updateStatus();
      // Also update local state for self
      setParticipants(prev =>
        prev.map(p =>
          (p.user_id === (user?.user_id || user?.id))
            ? { ...p, is_muted: isMuted, is_video_off: isVideoOff }
            : p
        )
      );
    }
  }, [isMuted, isVideoOff, isActive, user]);

  // beforeunload
  useEffect(() => {
    const onUnload = () => leaveSession();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [leaveSession]);

  return { participants, loading, error };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildLocalParticipant(user, isMuted, isVideoOff) {
  return {
    user_id:      user.user_id || user.id || 'local',
    name:         user.name    || 'You',
    role:         user.role    || 'student',
    is_muted:     isMuted,
    is_video_off: isVideoOff,
    isSpeaking:   false,
    joinedAt:     new Date().toISOString(),
    avatarColor:  avatarColor(user.user_id || user.name || 'local'),
  };
}
