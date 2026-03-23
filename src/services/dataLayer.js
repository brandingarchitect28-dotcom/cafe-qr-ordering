/**
 * dataLayer.js
 *
 * Task 14: Database migration abstraction layer.
 *
 * Old cafes: orders/menuItems/inventory at root level, cafeId field filter
 * New cafes: cafes/{cafeId}/orders, cafes/{cafeId}/menu, etc. (subcollections)
 *
 * How to tell which: cafes/{cafeId}.systemType = "old" | "new"
 * Default (no field) = "old" — backward compatible.
 *
 * New cafes created from now use systemType: "new" automatically.
 *
 * Usage:
 *   const orders = await getOrders(cafeId, systemType);
 *   const menu   = await getMenu(cafeId, systemType);
 */

import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── helpers ─────────────────────────────────────────────────────────────────

const toArray = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// ─── Orders ──────────────────────────────────────────────────────────────────

export const getOrders = async (cafeId, systemType = 'old', maxItems = 500) => {
  if (!cafeId) return [];

  if (systemType === 'new') {
    // New structure: subcollection
    const snap = await getDocs(
      query(collection(db, 'cafes', cafeId, 'orders'), limit(maxItems))
    );
    return toArray(snap);
  }

  // Old structure: root collection with cafeId filter
  const snap = await getDocs(
    query(collection(db, 'orders'), where('cafeId', '==', cafeId), limit(maxItems))
  );
  return toArray(snap);
};

// ─── Menu items ───────────────────────────────────────────────────────────────

export const getMenu = async (cafeId, systemType = 'old') => {
  if (!cafeId) return [];

  if (systemType === 'new') {
    const snap = await getDocs(collection(db, 'cafes', cafeId, 'menu'));
    return toArray(snap);
  }

  const snap = await getDocs(
    query(collection(db, 'menuItems'), where('cafeId', '==', cafeId))
  );
  return toArray(snap);
};

// ─── Inventory ────────────────────────────────────────────────────────────────

export const getInventory = async (cafeId, systemType = 'old') => {
  if (!cafeId) return [];

  if (systemType === 'new') {
    const snap = await getDocs(collection(db, 'cafes', cafeId, 'inventory'));
    return toArray(snap);
  }

  const snap = await getDocs(
    query(collection(db, 'inventory'), where('cafeId', '==', cafeId))
  );
  return toArray(snap);
};

// ─── Recipes ─────────────────────────────────────────────────────────────────

export const getRecipes = async (cafeId, systemType = 'old') => {
  if (!cafeId) return [];

  if (systemType === 'new') {
    const snap = await getDocs(collection(db, 'cafes', cafeId, 'recipes'));
    return toArray(snap);
  }

  const snap = await getDocs(
    query(collection(db, 'recipes'), where('cafeId', '==', cafeId))
  );
  return toArray(snap);
};

// ─── Full analytics snapshot (abstracted) ────────────────────────────────────

export const getAnalyticsData = async (cafeId, systemType = 'old') => {
  const [orders, menu, inventory, recipes] = await Promise.all([
    getOrders(cafeId, systemType),
    getMenu(cafeId, systemType),
    getInventory(cafeId, systemType),
    getRecipes(cafeId, systemType),
  ]);
  return { orders, menu, inventory, recipes };
};

// ─── Get the correct orders collection path for real-time listeners ───────────

export const getOrdersCollectionRef = (cafeId, systemType = 'old') => {
  if (systemType === 'new') {
    return collection(db, 'cafes', cafeId, 'orders');
  }
  return collection(db, 'orders');
};

export const getOrdersQuery = (cafeId, systemType = 'old') => {
  if (systemType === 'new') {
    return query(collection(db, 'cafes', cafeId, 'orders'));
  }
  return query(collection(db, 'orders'), where('cafeId', '==', cafeId));
};
