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
  if (envUrl && envUrl !== 'undefined' && envUrl !== 'http://localhost:5000') {
    return envUrl.replace(/\/$/, '');
  }

  // Use Vite relative proxy /api for local dev, tunnels, and local network devices
  return '/api';
}

export const API_BASE = resolveApiBase();

export default API_BASE;
