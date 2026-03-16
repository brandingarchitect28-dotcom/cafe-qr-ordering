/**
 * uploadImage — Reliable Firebase Storage upload.
 *
 * ROOT CAUSE OF ALL PREVIOUS FAILURES:
 * The VITE_FIREBASE_STORAGE_BUCKET was set to "branding-architect.appspot.com"
 * but Firebase migrated this project's bucket to "branding-architect.firebasestorage.app"
 * Every upload attempt was hitting the WRONG bucket → "Load failed" error.
 *
 * NOW FIXED: bucket = branding-architect.firebasestorage.app
 *
 * Upload strategy:
 * 1. Try Firebase SDK uploadBytes() with 30s timeout (clean, simple)
 * 2. If that fails → fallback to REST API with auth token (handles CORS edge cases)
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../config/firebase';

// Wrap any promise with a hard timeout
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s — check internet connection`)),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Approach A: Firebase SDK
async function uploadViaSDK(file, storagePath) {
  const storageRef = ref(storage, storagePath);
  const snapshot = await withTimeout(
    uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' }),
    30000,
    'SDK upload'
  );
  const url = await withTimeout(
    getDownloadURL(snapshot.ref),
    10000,
    'getDownloadURL'
  );
  return url;
}

// Approach B: Direct REST API (fallback)
async function uploadViaREST(file, storagePath) {
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw new Error('VITE_FIREBASE_STORAGE_BUCKET not set');

  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated — please sign in again');
  const idToken = await user.getIdToken(true);

  const encodedPath = encodeURIComponent(storagePath);
  const uploadURL =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
    `?uploadType=media&name=${encodedPath}`;

  const response = await withTimeout(
    fetch(uploadURL, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'image/jpeg',
        'Authorization': `Firebase ${idToken}`,
      },
      body: file,
    }),
    60000,
    'REST upload'
  );

  if (!response.ok) {
    let msg = `Upload failed (HTTP ${response.status})`;
    try {
      const err = await response.json();
      if (response.status === 403) msg = 'Permission denied — check Firebase Storage rules';
      else if (err?.error?.message) msg = err.error.message;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await response.json();
  const token = data.downloadTokens;
  if (!token) throw new Error('No download token returned');

  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function uploadImage(file, storagePath, onProgress) {
  if (!file)        throw new Error('No file provided');
  if (!storagePath) throw new Error('No storage path provided');

  if (onProgress) onProgress(0);
  let lastError = null;

  // Attempt 1: SDK
  try {
    if (onProgress) onProgress(20);
    const url = await uploadViaSDK(file, storagePath);
    if (onProgress) onProgress(100);
    return url;
  } catch (err) {
    console.warn('[uploadImage] SDK failed, trying REST:', err.message);
    lastError = err;
  }

  // Attempt 2: REST fallback
  try {
    if (onProgress) onProgress(40);
    const url = await uploadViaREST(file, storagePath);
    if (onProgress) onProgress(100);
    return url;
  } catch (err) {
    console.error('[uploadImage] REST also failed:', err.message);
    lastError = err;
  }

  // Both failed
  const msg = lastError?.message || 'Upload failed';
  if (msg.includes('Permission denied') || lastError?.code === 'storage/unauthorized') {
    throw new Error('Permission denied — publish Firebase Storage rules in Firebase Console');
  }
  if (msg.includes('Not authenticated')) {
    throw new Error('Session expired — please sign out and sign in again');
  }
  throw new Error(`Upload failed: ${msg}`);
}
