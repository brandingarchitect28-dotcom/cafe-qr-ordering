/**
 * recipeService.js
 *
 * Manages the recipes collection.
 * A recipe links a menuItem to its ingredients in inventory.
 *
 * Firestore structure:
 * recipes/{menuItemId}   ← document ID = menuItem Firestore ID
 * {
 *   menuItemId:   string,
 *   menuItemName: string,
 *   cafeId:       string,
 *   ingredients: [
 *     { itemId: string, itemName: string, quantity: number, unit: string }
 *   ],
 *   updatedAt: timestamp
 * }
 *
 * Rules:
 *  - Never modifies orders, invoices, payments, or existing collections.
 *  - deductStockByRecipe() is non-blocking — never breaks order flow.
 */

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── CRUD ─────────────────────────────────────────────────────────────────

/**
 * Save (create or overwrite) a recipe for a menu item.
 * Document ID = menuItemId for easy lookup.
 */
export const saveRecipe = async (menuItemId, recipeData) => {
  try {
    await setDoc(doc(db, 'recipes', menuItemId), {
      menuItemId,
      menuItemName: recipeData.menuItemName || '',
      cafeId:       recipeData.cafeId,
      ingredients:  recipeData.ingredients || [],
      updatedAt:    serverTimestamp(),
    });
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get a single recipe by menuItemId
 */
export const getRecipe = async (menuItemId) => {
  try {
    const snap = await getDoc(doc(db, 'recipes', menuItemId));
    if (snap.exists()) return { data: { id: snap.id, ...snap.data() }, error: null };
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
};

/**
 * Delete a recipe
 */
export const deleteRecipe = async (menuItemId) => {
  try {
    await deleteDoc(doc(db, 'recipes', menuItemId));
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Real-time listener for all recipes in a cafe
 */
export const subscribeToRecipes = (cafeId, callback) => {
  const q = query(collection(db, 'recipes'), where('cafeId', '==', cafeId));
  return onSnapshot(q, (snap) => {
    const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(recipes);
  }, (err) => {
    console.error('[RecipeService] listener error:', err);
    callback([]);
  });
};

// ─── STOCK DEDUCTION VIA RECIPES ─────────────────────────────────────────

/**
 * deductStockByRecipe
 *
 * Called NON-BLOCKING after an order is confirmed.
 * Looks up recipes/{menuItemId} for each ordered item.
 * Deducts ingredients × quantity from inventory using batch write.
 *
 * Safe contract:
 *  - Never throws.
 *  - Never blocks order placement.
 *  - If no recipe exists → silently skipped.
 *  - Works alongside existing deductStockForOrder (ingredients on menuItem).
 *
 * @param {string} cafeId
 * @param {Array}  orderedItems  — [{ name, quantity }] from order.items
 * @param {Array}  menuItemsList — full menuItems array from CafeOrdering state
 */
export const deductStockByRecipe = async (cafeId, orderedItems, menuItemsList) => {
  try {
    if (!cafeId || !orderedItems?.length || !menuItemsList?.length) return;

    // Build name → menuItem ID map
    const nameToId = {};
    menuItemsList.forEach(m => { nameToId[m.name] = m.id; });

    // Accumulate deductions: inventoryItemId → total quantity to deduct
    const deductions = {};

    for (const ordered of orderedItems) {
      const menuItemId = nameToId[ordered.name];
      if (!menuItemId) continue;

      // Fetch recipe for this menu item
      const snap = await getDoc(doc(db, 'recipes', menuItemId));
      if (!snap.exists()) continue;

      const recipe = snap.data();
      if (!recipe.ingredients?.length) continue;

      for (const ing of recipe.ingredients) {
        if (!ing.itemId || !ing.quantity) continue;
        const total = ing.quantity * (ordered.quantity || 1);
        deductions[ing.itemId] = (deductions[ing.itemId] || 0) + total;
      }
    }

    if (!Object.keys(deductions).length) return;

    // Batch decrement inventory
    const batch = writeBatch(db);
    for (const [itemId, amount] of Object.entries(deductions)) {
      batch.update(doc(db, 'inventory', itemId), {
        quantity:    increment(-amount),
        lastUpdated: serverTimestamp(),
      });
    }
    await batch.commit();
    console.log('[RecipeService] Stock deducted via recipes:', deductions);
  } catch (err) {
    console.error('[RecipeService] deductStockByRecipe failed (non-fatal):', err);
  }
};

// ─── DAILY USAGE CALCULATION ──────────────────────────────────────────────

/**
 * Calculate today's inventory usage from orders + recipes.
 * Used for the WhatsApp analytics report.
 */
export const calculateDailyInventoryUsage = async (cafeId, todayOrders, menuItemsList) => {
  try {
    if (!todayOrders?.length || !menuItemsList?.length) return {};

    const nameToId = {};
    menuItemsList.forEach(m => { nameToId[m.name] = m.id; });

    const usage = {}; // { itemId: { itemName, unit, total } }

    for (const order of todayOrders) {
      for (const ordered of (order.items || [])) {
        const menuItemId = nameToId[ordered.name];
        if (!menuItemId) continue;

        const snap = await getDoc(doc(db, 'recipes', menuItemId));
        if (!snap.exists()) continue;

        const recipe = snap.data();
        for (const ing of (recipe.ingredients || [])) {
          if (!ing.itemId || !ing.quantity) continue;
          const total = ing.quantity * (ordered.quantity || 1);
          if (!usage[ing.itemId]) {
            usage[ing.itemId] = { itemName: ing.itemName || ing.itemId, unit: ing.unit || '', total: 0 };
          }
          usage[ing.itemId].total += total;
        }
      }
    }

    return usage;
  } catch (err) {
    console.error('[RecipeService] calculateDailyInventoryUsage error:', err);
    return {};
  }
};
