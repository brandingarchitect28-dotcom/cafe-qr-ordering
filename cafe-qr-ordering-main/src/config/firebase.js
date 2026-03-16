import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = requiredEnvVars.filter((key) => !import.meta.env[key]);

if (missing.length > 0) {
  const msg = `Firebase config error: missing environment variables:\n${missing.join('\n')}\n\nAdd these in Netlify → Site Settings → Environment Variables.`;
  document.getElementById('root').innerHTML = `
    <div style="font-family:monospace;padding:2rem;background:#1a0000;color:#ff6b6b;min-height:100vh">
      <h2 style="margin-bottom:1rem">⚠️ Configuration Error</h2>
      <pre style="white-space:pre-wrap">${msg}</pre>
    </div>`;
  throw new Error(msg);
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Guard against duplicate initialisation during HMR
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const auth    = getAuth(app);
export const db      = getFirestore(app);

// IMPORTANT: Pass bucket explicitly as gs:// URL
// Firebase migrated from .appspot.com → .firebasestorage.app
// The env var must match EXACTLY what Firebase Console shows
export const storage = getStorage(app, `gs://${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}`);

export default app;
