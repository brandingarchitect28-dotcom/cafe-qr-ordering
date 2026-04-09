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
 *  - No sound/vibration on the very first load (isInitialLoadRef guard)
 *  - Tracks actual order IDs — not count — so every new doc is caught
 *  - Deleted orders excluded (client-side, avoids composite index)
 *  - Single Firestore listener — no duplicates
 *
 * FIX (count → ID tracking):
 *  Previous version compared snapshot.size; if multiple orders arrived
 *  simultaneously or a doc was modified, the count delta was unreliable.
 *  Now each doc.id is checked against a Set of previously seen IDs —
 *  any ID not in the Set is a genuinely new order.
 */

import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const useGlobalOrderNotification = (cafeId) => {
  const isInitialLoadRef = useRef(true);      // true until first snapshot processed
  const prevIdsRef       = useRef(new Set()); // Set of order IDs seen so far

  useEffect(() => {
    if (!cafeId) return;

    // cafeId filter only — isDeleted checked client-side to avoid composite index
    const q = query(
      collection(db, 'orders'),
      where('cafeId', '==', cafeId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentIds = new Set();

      snapshot.forEach(docSnap => {
        const data = docSnap.data();

        // Skip soft-deleted orders
        if (data?.isDeleted) return;

        currentIds.add(docSnap.id);

        // ── New order detection ───────────────────────────────────────────
        // Skip on first load — we're just seeding prevIdsRef
        if (!isInitialLoadRef.current && !prevIdsRef.current.has(docSnap.id)) {
          console.log('[GlobalNotification] NEW ORDER DETECTED:', docSnap.id);

          // ── Sound ───────────────────────────────────────────────────────
          // Try /notification.mp3 first; fall back to Web Audio chime
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
            } catch (_) { /* browser blocked audio — silent fallback */ }
          };

          tryMp3().catch(playWebAudio);

          // ── Vibration (mobile) ──────────────────────────────────────────
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        }
      });

      // Commit the current ID set and clear the initial-load flag
      prevIdsRef.current       = currentIds;
      isInitialLoadRef.current = false;

    }, (err) => {
      // Listener error — log only, never crash the app
      console.warn('[GlobalNotification] Firestore listener error:', err.message);
    });

    return () => unsubscribe();
  }, [cafeId]);
};
