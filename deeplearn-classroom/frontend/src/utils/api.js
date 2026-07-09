/**
 * Central API configuration for all frontend fetch calls.
 *
 * Resolution order (highest priority first):
 *  1. VITE_API_URL env variable (set via .env / .env.production / Vercel dashboard)
 *  2. Auto-detect: if running on localhost → http://localhost:5000
 *  3. Same-origin (empty string) — useful if frontend and backend are co-deployed
 *
 * IMPORTANT: In a Vite production build `import.meta.env.VITE_API_URL` is
 * statically replaced at build time. If the variable is not set the token
 * is replaced with `undefined`, not the string "undefined".
 */

const envUrl = import.meta.env.VITE_API_URL;

function resolveApiBase() {
  // If a build-time or runtime env variable is set, always use it.
  if (envUrl && envUrl !== 'undefined') {
    return envUrl.replace(/\/$/, ''); // strip trailing slash
  }

  // In a browser context, auto-detect local dev.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000';
    }
  }

  // Production fallback — point at the known Render service.
  return 'https://deeplearn-classroom.onrender.com';
}

export const API_BASE = resolveApiBase();

export default API_BASE;
