/**
 * whatsappReportService.js
 *
 * Generates the end-of-day WhatsApp analytics report.
 *
 * Since Firebase scheduled functions require server-side setup,
 * this implementation works as a CLIENT-SIDE trigger:
 *   1. A "Send Report" button in the dashboard generates it on demand.
 *   2. A browser-based scheduler checks time every minute and auto-triggers at 11 PM.
 *
 * Both methods use window.open(wa.me link) — no backend needed.
 * Zero modifications to existing files.
 */

import {
  collection, query, where, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Report Builder ───────────────────────────────────────────────────────

/**
 * Build the full day analytics report text.
 *
 * @param {string} cafeId
 * @param {Date}   targetDate  — defaults to today
 * @returns {string} formatted WhatsApp message
 */
export const buildDailyReport = async (cafeId, targetDate = new Date()) => {
  // ── 1. Fetch today's orders ────────────────────────────────────────────
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const ordersSnap = await getDocs(
    query(collection(db, 'orders'), where('cafeId', '==', cafeId))
  );
  const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const todayOrders = allOrders.filter(o => {
    const d = o.createdAt?.toDate?.() || new Date(0);
    return d >= startOfDay && d <= endOfDay;
  });

  // ── 2. Core stats ──────────────────────────────────────────────────────
  const totalOrders = todayOrders.length;
  const totalSales  = todayOrders.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);

  // Most sold item
  const itemCounts = {};
  todayOrders.forEach(o => {
    (o.items || []).forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
    });
  });
  const topItem = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])[0];
  const topItemText = topItem
    ? `${topItem[0]} (${topItem[1]} sold)`
    : 'No items sold';

  const totalItemsSold = Object.values(itemCounts).reduce((s, c) => s + c, 0);

  // Peak hour
  const hourCounts = {};
  todayOrders.forEach(o => {
    const h = o.createdAt?.toDate?.()?.getHours?.();
    if (h !== undefined) hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const peakHourText = peakHourEntry
    ? `${peakHourEntry[0]}:00 – ${String(Number(peakHourEntry[0]) + 1).padStart(2,'0')}:00`
    : 'N/A';

  // ── 3. Inventory snapshot ──────────────────────────────────────────────
  const invSnap = await getDocs(
    query(collection(db, 'inventory'), where('cafeId', '==', cafeId))
  );
  const inventory = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lowStock  = inventory.filter(i => i.quantity <= i.lowStockThreshold);

  // ── 4. Recipe-based usage calculation ─────────────────────────────────
  const usage = {}; // { itemId: { name, unit, total } }
  for (const order of todayOrders) {
    for (const ordered of (order.items || [])) {
      // Look up menu item by name in menuItems
      const menuSnap = await getDocs(
        query(
          collection(db, 'menuItems'),
          where('cafeId', '==', cafeId),
          where('name', '==', ordered.name)
        )
      );
      if (menuSnap.empty) continue;
      const menuItemId = menuSnap.docs[0].id;

      // Get recipe
      const recipeSnap = await getDoc(doc(db, 'recipes', menuItemId));
      if (!recipeSnap.exists()) continue;

      const recipe = recipeSnap.data();
      for (const ing of (recipe.ingredients || [])) {
        if (!ing.itemId || !ing.quantity) continue;
        const total = ing.quantity * (ordered.quantity || 1);
        if (!usage[ing.itemId]) {
          const invItem = inventory.find(i => i.id === ing.itemId);
          usage[ing.itemId] = {
            name:  invItem?.itemName || ing.itemName || ing.itemId,
            unit:  invItem?.unit     || ing.unit     || '',
            total: 0,
          };
        }
        usage[ing.itemId].total += total;
      }
    }
  }

  // ── 5. Format report text ─────────────────────────────────────────────
  const dateStr = targetDate.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const cur = '₹'; // will be read from cafe if needed

  let msg = `☕ *Café Daily Report*\n`;
  msg += `📅 Date: ${dateStr}\n\n`;

  msg += `📊 *Today's Summary*\n`;
  msg += `Total Orders: *${totalOrders}*\n`;
  msg += `Total Sales: *${cur}${totalSales.toFixed(2)}*\n`;
  msg += `Top Selling Item: *${topItemText}*\n`;
  msg += `Total Items Sold: *${totalItemsSold}*\n`;
  msg += `Peak Hour: *${peakHourText}*\n`;

  if (Object.keys(usage).length > 0) {
    msg += `\n📦 *Inventory Used Today*\n`;
    Object.values(usage).forEach(u => {
      msg += `• ${u.name} → ${u.total}${u.unit}\n`;
    });
  }

  if (inventory.length > 0) {
    msg += `\n🗃 *Remaining Stock*\n`;
    inventory.slice(0, 8).forEach(i => {
      msg += `• ${i.itemName} → ${i.quantity} ${i.unit}\n`;
    });
    if (inventory.length > 8) msg += `...and ${inventory.length - 8} more items\n`;
  }

  if (lowStock.length > 0) {
    msg += `\n⚠️ *Low Stock Alerts*\n`;
    lowStock.forEach(i => {
      msg += `• ${i.itemName} is running low (${i.quantity} ${i.unit} remaining)\n`;
    });
  }

  if (totalOrders === 0) {
    msg += `\n_No orders recorded today._\n`;
  }

  msg += `\n_Powered by Branding Architect SmartCafé OS_ 🚀`;

  return msg;
};

/**
 * Send the report by opening WhatsApp Web link.
 *
 * @param {string} phone   — with country code e.g. +919876543210
 * @param {string} message — the report text
 */
export const sendWhatsAppReport = (phone, message) => {
  const clean  = phone.replace(/\D/g, ''); // strip non-digits
  const url    = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

/**
 * generateAndSendReport — convenience wrapper for dashboard button
 *
 * @param {string} cafeId
 * @param {string} ownerPhone
 * @param {Date}   date
 */
export const generateAndSendReport = async (cafeId, ownerPhone, date = new Date()) => {
  const message = await buildDailyReport(cafeId, date);
  sendWhatsAppReport(ownerPhone, message);
  return message;
};

// ─── Auto-scheduler (client-side 11 PM trigger) ───────────────────────────

let schedulerInterval = null;

/**
 * startDailyReportScheduler
 *
 * Call this once when the dashboard loads.
 * Checks every 60 seconds if the time is 23:00.
 * If yes → generates report and opens WhatsApp.
 *
 * @param {string}   cafeId
 * @param {string}   ownerPhone
 * @param {Function} onTriggered  — optional callback when report fires
 */
export const startDailyReportScheduler = (cafeId, ownerPhone, onTriggered) => {
  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(async () => {
    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();

    if (h === 23 && m === 0) {
      console.log('[ReportScheduler] 11 PM — generating daily report…');
      try {
        const msg = await generateAndSendReport(cafeId, ownerPhone);
        if (onTriggered) onTriggered(msg);
      } catch (err) {
        console.error('[ReportScheduler] Failed to send report:', err);
      }
    }
  }, 60_000); // check every 60 seconds

  return () => clearInterval(schedulerInterval);
};

export const stopDailyReportScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};
