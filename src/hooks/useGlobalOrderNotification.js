/**
 * useGlobalOrderNotification.js
 *
 * Global new-order notification hook.
 * Called ONCE at the top-level Dashboard so it works on every page.
 *
 * On a new order:
 *  - Plays /notification.mp3 (Web Audio fallback if file missing)
 *  - Vibrates the device (mobile only)
 *
 * Safety guarantees:
 *  - No sound/vibration on the very first load (seeded from initial count)
 *  - Only triggers when order count INCREASES (not on updates or deletes)
 *  - Deleted orders excluded via isDeleted !== true filter
 *  - Single Firestore listener — no duplicates
 */

import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const useGlobalOrderNotification = (cafeId) => {
  const prevCountRef = useRef(0);   // 0 means "not yet seeded"
  const seededRef    = useRef(false); // true after first snapshot

  useEffect(() => {
    if (!cafeId) return;

    // Build query — exclude soft-deleted orders
    // Note: Firestore inequality filters require a composite index on (cafeId, isDeleted).
    // If the index doesn't exist yet, the listener falls back gracefully (no crash).
    const q = query(
      collection(db, 'orders'),
      where('cafeId', '==', cafeId)
      // isDeleted filter applied client-side below to avoid composite index requirement
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Count only non-deleted orders
      const currentCount = snapshot.docs.filter(
        d => d.data().isDeleted !== true
      ).length;

      if (!seededRef.current) {
        // First snapshot — seed the count silently, no notification
        prevCountRef.current = currentCount;
        seededRef.current    = true;
        return;
      }

      if (currentCount > prevCountRef.current) {
        // ── Sound ────────────────────────────────────────────────────────
        // Try /notification.mp3 first; if blocked or missing, fall back to
        // Web Audio API two-tone chime (same as Overview.jsx)
        const tryMp3 = () => {
          const audio = new Audio('/notification.mp3');
          return audio.play().catch(() => Promise.reject());
        };

        const playWebAudio = () => {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 220].forEach((delay, i) => {
              const osc  = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = i === 0 ? 880 : 1100;
              osc.type = 'sine';
              gain.gain.setValueAtTime(0.3, ctx.currentTime + delay / 1000);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.4);
              osc.start(ctx.currentTime + delay / 1000);
              osc.stop(ctx.currentTime + delay / 1000 + 0.45);
            });
          } catch (_) { /* browser blocked audio entirely — silent */ }
        };

        tryMp3().catch(playWebAudio);

        // ── Vibration (mobile) ────────────────────────────────────────────
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }

        console.log('[GlobalNotification] New order detected — notified');
      }

      prevCountRef.current = currentCount;
    }, (err) => {
      // Listener error — log only, never crash the app
      console.warn('[GlobalNotification] Firestore listener error:', err.message);
    });

    return () => unsubscribe();
  }, [cafeId]);
};
