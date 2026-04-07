/**
 * Overview.jsx
 *
 * RESTORED: All original sections present — 4 stat cards, Business Summary
 * toggle panel, Recent Orders feed.
 *
 * CALCULATION FIXES (paid-only consistency):
 *  - ordersToday    = paid today orders only (was all today orders)
 *  - cancelledToday = shown separately below Orders card (transparency)
 *  - avgOrderValue  = paid revenue ÷ paid count (was revenue ÷ all count)
 *  - Business Summary figures (Revenue, GST, Service Charge) = paid only
 *  - Top items qty and Category revenue = paid orders only
 *  - Order deletion: handled automatically by Firestore real-time listener
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IndianRupee, ShoppingBag, TrendingUp, Clock, XCircle,
} from 'lucide-react';

// ─── Shared paid-order predicate — same rule used everywhere in this file ─────
const isPaid = (o) =>
  o.paymentStatus === 'paid' ||
  o.paymentStatus === 'SUCCESS' ||
  o.status === 'paid';

// ─── Overview ─────────────────────────────────────────────────────────────────
const Overview = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;

  // Real-time order stream — Firestore automatically reflects deletions
  const { data: orders } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // Business Summary is deferred — no extra data fetch; uses already-loaded orders
  const [showSummary, setShowSummary] = useState(false);

  // ── Stat cards calculations ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!orders) return {
      todayRevenue: 0, ordersToday: 0, cancelledToday: 0,
      avgOrderValue: 0, activeOrders: 0,
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(o => {
      const d = o.createdAt?.toDate?.() || new Date(0);
      return d >= todayStart;
    });

    // Paid today — single source of truth for all revenue figures
    const paidToday = todayOrders.filter(isPaid);

    const todayRevenue  = paidToday.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
    const ordersToday   = paidToday.length;                   // paid count only
    const cancelledToday = todayOrders.filter(o => o.orderStatus === 'cancelled').length;
    const avgOrderValue  = ordersToday > 0 ? todayRevenue / ordersToday : 0;

    // Active = in-progress (not finished, not cancelled)
    const activeOrders = orders.filter(
      o => o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled'
    ).length;

    return { todayRevenue, ordersToday, cancelledToday, avgOrderValue, activeOrders };
  }, [orders]);

  return (
    <div className="space-y-6">

      {/* ─────────────────────────────────────────────────────────────────────
          4 Stat Cards
      ───────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Today's Revenue */}
        <div
          data-testid="stat-today's-revenue"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Today's Revenue</p>
            <IndianRupee className="w-5 h-5 text-[#10B981]" />
          </div>
          <p className="text-3xl font-bold text-white">{CUR}{stats.todayRevenue.toFixed(2)}</p>
          <p className="text-[#555] text-xs mt-1">Paid orders only</p>
        </div>

        {/* Orders Today — paid count + cancelled shown separately */}
        <div
          data-testid="stat-orders-today"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Orders Today</p>
            <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.ordersToday}</p>
          {stats.cancelledToday > 0 ? (
            <div className="flex items-center gap-1 mt-1">
              <XCircle className="w-3 h-3 text-red-400" />
              <p className="text-red-400 text-xs">{stats.cancelledToday} cancelled</p>
            </div>
          ) : (
            <p className="text-[#555] text-xs mt-1">Paid orders only</p>
          )}
        </div>

        {/* Avg Order Value */}
        <div
          data-testid="stat-avg-order-value"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Avg Order Value</p>
            <TrendingUp className="w-5 h-5 text-[#3B82F6]" />
          </div>
          <p className="text-3xl font-bold text-white">{CUR}{stats.avgOrderValue.toFixed(2)}</p>
          <p className="text-[#555] text-xs mt-1">Paid orders only</p>
        </div>

        {/* Active Orders */}
        <div
          data-testid="stat-active-orders"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Active Orders</p>
            <Clock className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.activeOrders}</p>
          <p className="text-[#555] text-xs mt-1">In progress now</p>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Today's Business Summary — deferred render (no extra fetch)
      ───────────────────────────────────────────────────────────────────── */}
      {!showSummary && (
        <button
          onClick={() => setShowSummary(true)}
          className="w-full flex items-center justify-center gap-2.5 py-3 bg-[#0F0F0F] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5 rounded-xl text-[#D4AF37] text-sm font-semibold transition-all duration-200 group"
        >
          <TrendingUp className="w-4 h-4 group-hover:scale-110 transition-transform" />
          View Today's Business Summary
        </button>
      )}

      <AnimatePresence>
        {showSummary && orders?.length > 0 && (() => {
          // Compute from already-loaded orders array — no Firestore calls
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          const todayOrders = orders.filter(
            o => (o.createdAt?.toDate?.() || new Date(0)) >= todayStart
          );

          const paid    = todayOrders.filter(isPaid);
          const pending = todayOrders.filter(o => !isPaid(o) && o.orderStatus !== 'cancelled');

          // All monetary figures — paid orders only
          const totalRev = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
          const totalGST = paid.reduce((s, o) => s + (o.gstAmount || o.taxAmount || 0), 0);
          const totalSC  = paid.reduce((s, o) => s + (o.serviceChargeAmount || 0), 0);

          // Top items — qty from paid orders only
          const itemMap = {};
          paid.forEach(o => (o.items || []).forEach(i => {
            itemMap[i.name] = (itemMap[i.name] || 0) + (i.quantity || 1);
          }));
          const topItems = Object.entries(itemMap)
            .sort((a, b) => b[1] - a[1]).slice(0, 3);

          // Category revenue — paid orders only
          const catMap = {};
          paid.forEach(o => (o.items || []).forEach(i => {
            const cat = i.category || 'Other';
            catMap[cat] = (catMap[cat] || 0) + (i.price || 0) * (i.quantity || 1);
          }));
          const topCats = Object.entries(catMap)
            .sort((a, b) => b[1] - a[1]).slice(0, 3);

          return (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1    }}
              exit={{    opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.22 }}
              className="bg-[#0F0F0F] border border-[#D4AF37]/20 rounded-xl overflow-hidden"
            >
              {/* Summary header */}
              <div
                className="flex items-center justify-between px-5 py-4 border-b border-white/5"
                style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.08), transparent)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                      Today's Business Summary
                    </h3>
                    <p className="text-[#555] text-xs">
                      {new Date().toLocaleDateString('en-IN', {
                        weekday: 'long', day: '2-digit', month: 'long',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#D4AF37] text-xs font-semibold px-2 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20">
                    {todayOrders.length} orders today
                  </span>
                  <button
                    onClick={() => setShowSummary(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#555] hover:text-white hover:bg-white/10 transition-all"
                    title="Hide summary"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 4 financial figures — all paid-only */}
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-[#555] text-xs uppercase tracking-wide">Revenue</p>
                  <p className="text-[#10B981] font-black text-xl">{CUR}{totalRev.toFixed(2)}</p>
                  <p className="text-[#555] text-xs">{paid.length} paid orders</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[#555] text-xs uppercase tracking-wide">Pending</p>
                  <p className="text-[#F59E0B] font-black text-xl">{pending.length}</p>
                  <p className="text-[#555] text-xs">awaiting payment</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[#555] text-xs uppercase tracking-wide">GST Collected</p>
                  <p className="text-[#8B5CF6] font-black text-xl">{CUR}{totalGST.toFixed(2)}</p>
                  <p className="text-[#555] text-xs">incl. in revenue</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[#555] text-xs uppercase tracking-wide">Service Charge</p>
                  <p className="text-[#3B82F6] font-black text-xl">{CUR}{totalSC.toFixed(2)}</p>
                  <p className="text-[#555] text-xs">collected today</p>
                </div>
              </div>

              {/* Top items + category breakdown */}
              {(topItems.length > 0 || topCats.length > 0) && (
                <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {topItems.length > 0 && (
                    <div className="bg-white/3 rounded-lg p-3">
                      <p className="text-[#A3A3A3] text-xs uppercase tracking-wide mb-2">
                        🏆 Top Selling Items
                      </p>
                      {topItems.map(([name, qty], i) => (
                        <div key={name} className="flex justify-between items-center py-1 text-xs border-b border-white/5 last:border-0">
                          <span className="text-white flex items-center gap-1.5">
                            <span className="text-[#D4AF37] font-bold">{i + 1}.</span>{name}
                          </span>
                          <span className="text-[#A3A3A3]">{qty} sold</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {topCats.length > 0 && (
                    <div className="bg-white/3 rounded-lg p-3">
                      <p className="text-[#A3A3A3] text-xs uppercase tracking-wide mb-2">
                        📊 Category Revenue
                      </p>
                      {topCats.map(([cat, rev], i) => (
                        <div key={cat} className="flex justify-between items-center py-1 text-xs border-b border-white/5 last:border-0">
                          <span className="text-white flex items-center gap-1.5">
                            <span className="text-[#D4AF37] font-bold">{i + 1}.</span>{cat}
                          </span>
                          <span className="text-[#10B981] font-semibold">{CUR}{rev.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────────────
          Recent Orders (last 5)
      ───────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3
          className="text-xl font-semibold text-white mb-4"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Recent Orders
        </h3>
        <div className="space-y-3">
          {orders?.slice(0, 5).map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between bg-black/20 p-4 rounded-sm"
            >
              <div>
                <p className="text-white font-semibold">{order.customerName}</p>
                <p className="text-[#A3A3A3] text-sm">{order.items?.length || 0} items</p>
              </div>
              <div className="text-right">
                <p className="text-[#D4AF37] font-bold">
                  {order.currencySymbol || CUR}
                  {(order.totalAmount || order.total || 0).toFixed(2)}
                </p>
                <p className={`text-sm ${
                  order.orderStatus === 'completed' ? 'text-green-500'  :
                  order.orderStatus === 'preparing' ? 'text-yellow-500' :
                  order.orderStatus === 'cancelled' ? 'text-red-400'    :
                  'text-blue-500'
                }`}>
                  {order.orderStatus}
                </p>
              </div>
            </div>
          ))}
          {(!orders || orders.length === 0) && (
            <p className="text-center text-[#A3A3A3] py-8">No orders yet</p>
          )}
        </div>
      </div>

    </div>
  );
};

export default Overview;
