/**
 * inventoryService.js
 *
 * All Firestore operations for the Inventory collection.
 * Rule: never touches orders, invoices, payments, or existing collections.
 *
 * Collection: inventory/{itemId}
 * Fields:
 *   cafeId            string
 *   itemName          string
 *   category          string
 *   quantity          number   ← current stock
 *   unit              string   (kg | g | pcs | ml | l | dozen)
 *   lowStockThreshold number
 *   lastUpdated       timestamp
 *   createdAt         timestamp
 *
 * Ingredient mapping lives in: menuItems/{itemId}.ingredients
 *   ingredients: [{ inventoryItemId, inventoryItemName, quantityUsed, unit }]
 * This is OPTIONAL — if absent, no stock deduction happens.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── CRUD ──────────────────────────────────────────────────────────────────

/**
 * Add a new inventory item
 */
export const addInventoryItem = async (cafeId, itemData) => {
  try {
    const ref = await addDoc(collection(db, 'inventory'), {
      cafeId,
      itemName:          itemData.itemName.trim(),
      category:          itemData.category.trim(),
      quantity:          parseFloat(itemData.quantity) || 0,
      unit:              itemData.unit || 'pcs',
      lowStockThreshold: parseFloat(itemData.lowStockThreshold) || 0,
      costPerUnit:       parseFloat(itemData.costPerUnit) || 0,
      lastUpdated:       serverTimestamp(),
      createdAt:         serverTimestamp(),
    });
    return { id: ref.id, error: null };
  } catch (err) {
    return { id: null, error: err.message };
  }
};

/**
 * Update an existing inventory item (all editable fields)
 */
export const updateInventoryItem = async (itemId, itemData) => {
  try {
    await updateDoc(doc(db, 'inventory', itemId), {
      itemName:          itemData.itemName.trim(),
      category:          itemData.category.trim(),
      quantity:          parseFloat(itemData.quantity) || 0,
      unit:              itemData.unit || 'pcs',
      lowStockThreshold: parseFloat(itemData.lowStockThreshold) || 0,
      costPerUnit:       parseFloat(itemData.costPerUnit) || 0,
      lastUpdated:       serverTimestamp(),
    });
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Update only the stock quantity of an item (manual restock)
 */
export const updateStockQuantity = async (itemId, newQuantity) => {
  try {
    await updateDoc(doc(db, 'inventory', itemId), {
      quantity:    parseFloat(newQuantity) || 0,
      lastUpdated: serverTimestamp(),
    });
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Delete an inventory item
 */
export const deleteInventoryItem = async (itemId) => {
  try {
    await deleteDoc(doc(db, 'inventory', itemId));
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
};

// ─── REAL-TIME LISTENER ───────────────────────────────────────────────────

/**
 * Subscribe to all inventory items for a café (real-time)
 * Returns unsubscribe function
 */
export const subscribeToInventory = (cafeId, callback) => {
  const q = query(
    collection(db, 'inventory'),
    where('cafeId', '==', cafeId)
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
    callback(items);
  }, (err) => {
    console.error('[InventoryService] listener error:', err);
    callback([]);
  });
};

// ─── STOCK DEDUCTION ON ORDER ─────────────────────────────────────────────

/**
 * deductStockForOrder
 *
 * Called NON-BLOCKING after an order is saved.
 * For each ordered item, look up the matching menuItem document.
 * If it has an `ingredients` array, subtract each ingredient from inventory.
 *
 * Safe contract:
 *   - Never throws — errors are logged only.
 *   - Never modifies orders / invoices / cafes.
 *   - If menuItem has no ingredients field → silently skipped.
 *   - If inventory item not found → silently skipped.
 *
 * @param {string}   cafeId
 * @param {Array}    orderedItems  — [{ name, price, quantity }]  from order.items
 * @param {Array}    menuItems     — full menuItems array for this café (already loaded in CafeOrdering)
 */
export const deductStockForOrder = async (cafeId, orderedItems, menuItemsList) => {
  try {
    if (!cafeId || !orderedItems?.length || !menuItemsList?.length) return;

    // Map menu item name → menu item doc (to find ingredients)
    const menuMap = {};
    menuItemsList.forEach(m => { menuMap[m.name] = m; });

    // Accumulate deductions: inventoryItemId → totalDeduction
    const deductions = {}; // { [inventoryItemId]: number }

    for (const ordered of orderedItems) {
      const menuItem = menuMap[ordered.name];
      if (!menuItem?.ingredients?.length) continue;

      for (const ingredient of menuItem.ingredients) {
        if (!ingredient.inventoryItemId || !ingredient.quantityUsed) continue;
        const total = (ingredient.quantityUsed || 0) * (ordered.quantity || 1);
        deductions[ingredient.inventoryItemId] =
          (deductions[ingredient.inventoryItemId] || 0) + total;
      }
    }

    if (!Object.keys(deductions).length) return; // nothing to deduct

    // Batch write all decrements
    const batch = writeBatch(db);
    for (const [inventoryItemId, amount] of Object.entries(deductions)) {
      const ref = doc(db, 'inventory', inventoryItemId);
      batch.update(ref, {
        quantity:    increment(-amount),
        lastUpdated: serverTimestamp(),
      });
    }
    await batch.commit();
    console.log('[InventoryService] Stock deducted for order:', deductions);
  } catch (err) {
    // Silent — must never break order placement
    console.error('[InventoryService] deductStockForOrder failed (non-fatal):', err);
  }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────

/**
 * Get low-stock items for a café (one-shot fetch)
 */
export const getLowStockItems = async (cafeId) => {
  try {
    const q = query(collection(db, 'inventory'), where('cafeId', '==', cafeId));
    const snap = await getDocs(q);
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return all.filter(item => item.quantity <= item.lowStockThreshold);
  } catch (err) {
    console.error('[InventoryService] getLowStockItems error:', err);
    return [];
  }
};

export const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'dozen', 'cup', 'tbsp', 'tsp'];
