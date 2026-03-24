/**
 * aiService.js
 *
 * Task 1: AI Text Assistant service.
 * - Fetches café data (orders, revenue, top items) from Firestore
 * - Sends structured data + question to Cloud Function /ai-query endpoint
 * - Returns natural language answer
 *
 * API key lives ONLY in the Cloud Function (backend) — never exposed to client.
 */

import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ─── Build structured café context from Firestore ─────────────────────────────

export const buildCafeContext = async (cafeId) => {
  if (!cafeId) throw new Error('cafeId required');

  const [ordersSnap, menuSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('cafeId', '==', cafeId), limit(200))),
    getDocs(query(collection(db, 'menuItems'), where('cafeId', '==', cafeId))),
  ]);

  const orders    = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const menuItems = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ── Revenue summary ──────────────────────────────────────────────────────
  const paidOrders   = orders.filter(o => o.paymentStatus === 'paid');
  const totalRevenue = paidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalOrders  = orders.length;
  const aov          = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

  // Today's stats
  const today      = new Date(); today.setHours(0, 0, 0, 0);
  const todayPaid  = paidOrders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
  const todayRev   = todayPaid.reduce((s, o) => s + (o.totalAmount || 0), 0);

  // ── Top selling items ─────────────────────────────────────────────────────
  const itemMap = {};
  orders.forEach(o => (o.items || []).forEach(i => {
    itemMap[i.name] = (itemMap[i.name] || 0) + (i.quantity || 1);
  }));
  const topItems = Object.entries(itemMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  // ── Payment breakdown ─────────────────────────────────────────────────────
  const paymentMap = {};
  orders.forEach(o => {
    const m = o.paymentMode || 'counter';
    paymentMap[m] = (paymentMap[m] || 0) + 1;
  });

  // ── Order status ──────────────────────────────────────────────────────────
  const statusMap = { new: 0, preparing: 0, ready: 0, completed: 0 };
  orders.forEach(o => { if (statusMap[o.orderStatus] !== undefined) statusMap[o.orderStatus]++; });

  return {
    totalOrders,
    totalRevenue:     parseFloat(totalRevenue.toFixed(2)),
    paidOrders:       paidOrders.length,
    avgOrderValue:    parseFloat(aov.toFixed(2)),
    todayRevenue:     parseFloat(todayRev.toFixed(2)),
    todayOrders:      todayPaid.length,
    topItems,
    paymentBreakdown: paymentMap,
    orderStatus:      statusMap,
    totalMenuItems:   menuItems.length,
  };
};

// ─── Ask AI via Cloud Function ────────────────────────────────────────────────

export const askAI = async (cafeId, question) => {
  if (!cafeId || !question?.trim()) throw new Error('cafeId and question required');

  // Fetch structured data
  const context = await buildCafeContext(cafeId);

  // Call Cloud Function
  const functions  = getFunctions();
  const aiQuery    = httpsCallable(functions, 'aiQuery');
  const result     = await aiQuery({ cafeId, question: question.trim(), context });

  return result.data?.answer || 'No response received.';
};
