/**
 * useGlobalOrderNotification.js
 *
 * Global new-order notification hook.
 * Called ONCE at the top-level Dashboard so it works on every page.
 *
 * Returns: { newOrder, clearNewOrder }
 *  - newOrder      — latest new order object (null when none pending)
 *  - clearNewOrder — dismiss the popup
 *
 * On a new order:
 *  - Sets newOrder state → GlobalOrderPopup renders in Dashboard
 *  - Plays /notification.mp3 (Web Audio fallback if file missing)
 *  - Vibrates the device (mobile only)
 *
 * Safety:
 *  - No notification on first load (isInitialLoadRef guard)
 *  - ID-based tracking — every new doc is caught, duplicates never fire
 *  - Deleted orders excluded client-side (avoids composite index)
 *  - Single Firestore listener
 */

import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const useGlobalOrderNotification = (cafeId) => {
  const [newOrder, setNewOrder] = useState(null);

  const isInitialLoadRef = useRef(true);
  const prevIdsRef       = useRef(new Set());

  useEffect(() => {
    if (!cafeId) return;

    // Check 1 — confirms hook is mounted with a valid cafeId
    console.log('[GlobalNotification] Notification Hook Active:', cafeId);

    const q = query(
      collection(db, 'orders'),
      where('cafeId', '==', cafeId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Check 2 — confirms Firestore listener is firing
      console.log('[GlobalNotification] Snapshot fired:', snapshot.size);

      const currentIds = new Set();

      snapshot.forEach(docSnap => {
        const data = docSnap.data();

        // Client-side isDeleted filter (avoids composite index requirement)
        if (data?.isDeleted) return;

        currentIds.add(docSnap.id);

        // Detect genuinely new orders — skip on first load
        if (!isInitialLoadRef.current && !prevIdsRef.current.has(docSnap.id)) {
          console.log('[GlobalNotification] NEW ORDER DETECTED:', docSnap.id);

          // Surface to UI — GlobalOrderPopup in Dashboard reads this state
          setNewOrder({ id: docSnap.id, ...data });

          // ── Sound ──────────────────────────────────────────────────────
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
            } catch (_) { /* browser blocked audio — silent */ }
          };

          tryMp3().catch(playWebAudio);

          // ── Vibration (mobile) ─────────────────────────────────────────
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        }
      });

      prevIdsRef.current       = currentIds;
      isInitialLoadRef.current = false;

    }, (err) => {
      console.warn('[GlobalNotification] Firestore listener error:', err.message);
    });

    return () => unsubscribe();
  }, [cafeId]);

  return {
    newOrder,
    clearNewOrder: () => setNewOrder(null),
  };
};
