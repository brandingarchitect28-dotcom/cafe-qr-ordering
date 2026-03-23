/**
 * whatsappReportService.js
 *
 * iOS FIX: All redirects now use window.location.href (not window.open).
 * window.open is blocked by Safari on iOS — window.location.href works on all devices.
 */

import {
  collection, query, where, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Report Builder ───────────────────────────────────────────────────────────

export const buildDailyReport = async (cafeId, targetDate = new Date()) => {
  const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay   = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

  const ordersSnap = await getDocs(
    query(collection(db, 'orders'), where('cafeId', '==', cafeId))
  );
  const allOrders   = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const todayOrders = allOrders.filter(o => {
    const d = o.createdAt?.toDate?.() || new Date(0);
    return d >= startOfDay && d <= endOfDay;
  });

  const totalOrders = todayOrders.length;
  const totalSales  = todayOrders.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);

  const itemCounts = {};
  todayOrders.forEach(o => {
    (o.items || []).forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
    });
  });
  const topItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0];
  const topItemText     = topItem ? `${topItem[0]} (${topItem[1]} sold)` : 'No items sold';
  const totalItemsSold  = Object.values(itemCounts).reduce((s, c) => s + c, 0);

  const hourCounts = {};
  todayOrders.forEach(o => {
    const h = o.createdAt?.toDate?.()?.getHours?.();
    if (h !== undefined) hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const peakHourText  = peakHourEntry
    ? `${peakHourEntry[0]}:00 – ${String(Number(peakHourEntry[0]) + 1).padStart(2,'0')}:00`
    : 'N/A';

  const invSnap  = await getDocs(query(collection(db, 'inventory'), where('cafeId', '==', cafeId)));
  const inventory = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lowStock  = inventory.filter(i => i.quantity <= i.lowStockThreshold);

  const usage = {};
  for (const order of todayOrders) {
    for (const ordered of (order.items || [])) {
      const menuSnap = await getDocs(
        query(collection(db, 'menuItems'), where('cafeId', '==', cafeId), where('name', '==', ordered.name))
      );
      if (menuSnap.empty) continue;
      const recipeSnap = await getDoc(doc(db, 'recipes', menuSnap.docs[0].id));
      if (!recipeSnap.exists()) continue;
      for (const ing of (recipeSnap.data().ingredients || [])) {
        if (!ing.itemId || !ing.quantity) continue;
        const total = ing.quantity * (ordered.quantity || 1);
        if (!usage[ing.itemId]) {
          const invItem = inventory.find(i => i.id === ing.itemId);
          usage[ing.itemId] = { name: invItem?.itemName || ing.itemName || ing.itemId, unit: invItem?.unit || ing.unit || '', total: 0 };
        }
        usage[ing.itemId].total += total;
      }
    }
  }

  const dateStr = targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const cur = '₹';

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
    Object.values(usage).forEach(u => { msg += `• ${u.name} → ${u.total}${u.unit}\n`; });
  }
  if (inventory.length > 0) {
    msg += `\n🗃 *Remaining Stock*\n`;
    inventory.slice(0, 8).forEach(i => { msg += `• ${i.itemName} → ${i.quantity} ${i.unit}\n`; });
    if (inventory.length > 8) msg += `...and ${inventory.length - 8} more items\n`;
  }
  if (lowStock.length > 0) {
    msg += `\n⚠️ *Low Stock Alerts*\n`;
    lowStock.forEach(i => { msg += `• ${i.itemName} is running low (${i.quantity} ${i.unit} remaining)\n`; });
  }
  if (totalOrders === 0) msg += `\n_No orders recorded today._\n`;
  msg += `\n_Powered by Branding Architect SmartCafé OS_ 🚀`;
  return msg;
};

/**
 * Send WhatsApp report.
 * iOS FIX: Uses window.location.href — works on Safari + Chrome on all devices.
 */
export const sendWhatsAppReport = (phone, message) => {
  const clean = phone.replace(/\D/g, '');
  const url   = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  window.location.href = url;
};

export const generateAndSendReport = async (cafeId, ownerPhone, date = new Date()) => {
  const message = await buildDailyReport(cafeId, date);
  sendWhatsAppReport(ownerPhone, message);
  return message;
};

// ─── Auto-scheduler (client-side 11 PM trigger) ───────────────────────────────

let schedulerInterval = null;

export const startDailyReportScheduler = (cafeId, ownerPhone, onTriggered) => {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() === 0) {
      console.log('[ReportScheduler] 11 PM — generating daily report…');
      try {
        const msg = await generateAndSendReport(cafeId, ownerPhone);
        if (onTriggered) onTriggered(msg);
      } catch (err) {
        console.error('[ReportScheduler] Failed:', err);
      }
    }
  }, 60_000);
  return () => clearInterval(schedulerInterval);
};

export const stopDailyReportScheduler = () => {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
};
