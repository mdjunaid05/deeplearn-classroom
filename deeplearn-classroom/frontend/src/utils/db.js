export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VideoDB', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('videos');
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const saveVideo = async (file) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('videos', 'readwrite');
      const store = tx.objectStore('videos');
      store.put(file, 'latest_video');
      store.put(file.name, 'latest_video_name');
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("IndexedDB Save Error:", err);
  }
};

export const loadVideo = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('videos', 'readonly');
      const store = tx.objectStore('videos');
      const getFile = store.get('latest_video');
      const getName = store.get('latest_video_name');
      
      tx.oncomplete = () => {
        resolve({
          file: getFile.result,
          name: getName.result
        });
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("IndexedDB Load Error:", err);
    return { file: null, name: null };
  }
};
