/**
 * useAdvancedAnalytics.js
 * Updated: supports custom fromDate/toDate range (Feature 1)
 * Still no real-time — one-shot getDocs + 60s auto-refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getAnalyticsData } from '../services/dataLayer';
import { buildAnalyticsSnapshot } from '../services/analyticsEngine';

const REFRESH_INTERVAL = 60_000;

export const useAdvancedAnalytics = (cafeId, fromDate = null, toDate = null) => {
  const [data,      setData     ] = useState(null);
  const [loading,   setLoading  ] = useState(false);
  const [error,     setError    ] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!cafeId) return;
    setLoading(true);
    setError(null);

    try {
      const cafeSnap   = await getDoc(doc(db, 'cafes', cafeId));
      const systemType = cafeSnap.exists() ? (cafeSnap.data().systemType || 'old') : 'old';

      const { orders, menu, inventory, recipes } = await getAnalyticsData(cafeId, systemType);

      // Custom date range support
      const from = fromDate ? new Date(fromDate) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
      const to   = toDate   ? new Date(toDate)   : new Date();
      to.setHours(23, 59, 59, 999); // include full end day

      const filtered = orders.filter(o => {
        const t = o.createdAt?.toDate?.() || new Date(0);
        return t >= from && t <= to;
      });

      const snapshot = buildAnalyticsSnapshot(filtered, menu, inventory, recipes);
      setData(snapshot);
      setLastFetch(new Date());
    } catch (err) {
      console.error('[useAdvancedAnalytics]', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cafeId, fromDate, toDate]);

  useEffect(() => {
    if (!cafeId) return;
    fetch();
    timerRef.current = setInterval(fetch, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetch]);

  return { data, loading, error, lastFetch, refresh: fetch };
};
