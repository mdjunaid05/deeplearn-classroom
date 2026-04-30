/**
 * db.js — IndexedDB utility for the DeepLearn Virtual Classroom
 * -------------------------------------------------------------
 * Stores the uploaded video file AND its extracted captions so both
 * survive page reloads and navigation to the Virtual Classroom.
 *
 * Exports:
 *   initDB()                 — open / upgrade the database
 *   saveVideo(file)          — save the video File blob
 *   loadVideo()              — load { file, name }
 *   saveCaptions(captions)   — save Array<{ start, end, text }>
 *   loadCaptions()           — load the stored captions (or [])
 */

const DB_NAME    = 'VideoDB';
const DB_VERSION = 2;           // bumped from 1 → 2 to add captions store
const STORE_VID  = 'videos';
const STORE_CAP  = 'captions';

// ─── open / upgrade ───────────────────────────────────────────────────────────
export const initDB = () =>
  new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Create videos store if missing (original)
        if (!db.objectStoreNames.contains(STORE_VID)) {
          db.createObjectStore(STORE_VID);
        }
        // Create captions store (new in v2)
        if (!db.objectStoreNames.contains(STORE_CAP)) {
          db.createObjectStore(STORE_CAP);
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror   = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });

// ─── video helpers ────────────────────────────────────────────────────────────
export const saveVideo = async (file) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_VID, 'readwrite');
      const store = tx.objectStore(STORE_VID);
      store.put(file,       'latest_video');
      store.put(file.name,  'latest_video_name');
      tx.oncomplete = () => {
        console.log('[DB] Video saved to IndexedDB:', file.name);
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[DB] saveVideo error:', err);
  }
};

export const loadVideo = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx      = db.transaction(STORE_VID, 'readonly');
      const store   = tx.objectStore(STORE_VID);
      const getFile = store.get('latest_video');
      const getName = store.get('latest_video_name');
      tx.oncomplete = () => {
        const result = { file: getFile.result, name: getName.result };
        console.log('[DB] Video loaded from IndexedDB:', result.name ?? '(none)');
        resolve(result);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[DB] loadVideo error:', err);
    return { file: null, name: null };
  }
};

// ─── captions helpers ─────────────────────────────────────────────────────────

/**
 * saveCaptions
 * @param {Array<{ start: number, end: number, text: string }>} captions
 */
export const saveCaptions = async (captions) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_CAP, 'readwrite');
      const store = tx.objectStore(STORE_CAP);
      store.put(JSON.stringify(captions), 'latest_captions');
      tx.oncomplete = () => {
        console.log('[DB] Captions saved to IndexedDB:', captions.length, 'segments');
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[DB] saveCaptions error:', err);
  }
};

/**
 * loadCaptions
 * @returns {Promise<Array<{ start: number, end: number, text: string }>>}
 */
export const loadCaptions = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_CAP, 'readonly');
      const store = tx.objectStore(STORE_CAP);
      const req   = store.get('latest_captions');
      tx.oncomplete = () => {
        try {
          const parsed = req.result ? JSON.parse(req.result) : [];
          console.log('[DB] Captions loaded from IndexedDB:', parsed.length, 'segments');
          resolve(parsed);
        } catch {
          resolve([]);
        }
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[DB] loadCaptions error:', err);
    return [];
  }
};
