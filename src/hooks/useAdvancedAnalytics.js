/**
 * useAdvancedAnalytics.js
 *
 * Tasks 1, 13, 14, 15:
 * - One-shot fetches (no real-time — Task 15)
 * - Uses data abstraction layer (Task 14 — supports old + new DB)
 * - Auto-refreshes every 60 seconds
 * - Manual refresh available
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc }  from 'firebase/firestore';
import { db }           from '../lib/firebase';
import { getAnalyticsData } from '../services/dataLayer';
import { buildAnalyticsSnapshot } from '../services/analyticsEngine';

const REFRESH_INTERVAL = 60_000; // 60 seconds

export const useAdvancedAnalytics = (cafeId, dateRange = 30) => {
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
      // Get system type from cafe doc (Task 14 abstraction)
      const cafeSnap   = await getDoc(doc(db, 'cafes', cafeId));
      const systemType = cafeSnap.exists() ? (cafeSnap.data().systemType || 'old') : 'old';

      // Fetch all data via abstraction layer
      const { orders, menu, inventory, recipes } = await getAnalyticsData(cafeId, systemType);

      // Filter to date range
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dateRange);
      const filtered = orders.filter(o => {
        const t = o.createdAt?.toDate?.() || new Date(0);
        return t >= cutoff;
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
  }, [cafeId, dateRange]);

  // Initial fetch + 60s auto-refresh
  useEffect(() => {
    if (!cafeId) return;
    fetch();
    timerRef.current = setInterval(fetch, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetch]);

  return { data, loading, error, lastFetch, refresh: fetch };
};
