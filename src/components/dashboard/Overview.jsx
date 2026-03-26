/**
 * Overview.jsx
 *
 * Dashboard Overview — real-time stats + real-time recent orders.
 *
 * Architecture:
 *  - useCollection('orders') already uses onSnapshot — fully real-time, zero extra listeners.
 *  - recentOrders: client-side sorted newest-first, limited to 10 (avoids composite index).
 *  - New-order detection: seenIdsRef tracks previously seen IDs; new arrivals are "fresh"
 *    for 4 s, then the highlight clears automatically.
 *  - No changes to orders / invoices / payments / kitchen code.
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IndianRupee, ShoppingBag, TrendingUp, Clock,
  AlertTriangle, Zap, MapPin, Package, ExternalLink,
  Send, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateAndSendReport, startDailyReportScheduler, stopDailyReportScheduler } from '../../services/whatsappReportService';
import { useTheme } from '../../hooks/useTheme';

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmtOrderNum = (n) =>
  n ? `#${String(n).padStart(3, '0')}` : '—';

const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const STATUS = {
  completed: { dot: 'bg-green-500',   text: 'text-green-400',   label: 'Completed' },
  ready:     { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Ready'     },
  preparing: { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'Preparing' },
  cancelled: { dot: 'bg-red-500',     text: 'text-red-400',     label: 'Cancelled' },
  new:       { dot: 'bg-blue-400',    text: 'text-blue-400',    label: 'New'       },
};
const getStatus = (s) => STATUS[s] || STATUS.new;

const SOURCE_BADGE = {
  zomato: { label: 'ZOMATO', cls: 'bg-red-500/20 text-red-400 border-red-500/30'    },
  swiggy: { label: 'SWIGGY', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
};

const PAYMENT_LABEL = {
  online:  { label: 'Online',  cls: 'text-violet-400'  },
  prepaid: { label: 'UPI',     cls: 'text-emerald-400' },
  table:   { label: 'Table',   cls: 'text-amber-400'   },
  counter: { label: 'Counter', cls: 'text-[#A3A3A3]'   },
};
const getPayment = (m) => PAYMENT_LABEL[m] || PAYMENT_LABEL.counter;

// ─── RecentOrderCard ──────────────────────────────────────────────────────────

const RecentOrderCard = React.memo(({ order, isNew, CUR }) => {
  const [lit, setLit] = useState(isNew);
  const st         = getStatus(order.orderStatus);
  const src        = order.source && order.source !== 'qr' && order.source !== 'direct'
                       ? SOURCE_BADGE[typeof order.source === 'string' ? order.source.toLowerCase() : ''] || { label: typeof order.source === 'string' ? order.source.toUpperCase() : String(order.source), cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }
                       : null;
  const pay        = getPayment(order.paymentMode);
  const totalItems = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) ?? 0;
  const cur        = order.currencySymbol || CUR;

  useEffect(() => {
    if (!isNew) return;
    const id = setTimeout(() => setLit(false), 4000);
    return () => clearTimeout(id);
  }, [isNew]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0,   scale: 1    }}
      exit={{    opacity: 0, y: 10,   scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={`relative rounded-sm border overflow-hidden transition-colors duration-700 ${
        lit
          ? 'border-[#D4AF37]/50 bg-[#D4AF37]/5'
          : '${T.border} ${T.innerCard} hover:border-white/8 hover:${T.innerCard}'
      }`}
      data-testid={`overview-order-${order.id}`}
    >
      {/* Gold flash bar at top */}
      <AnimatePresence>
        {lit && (
          <motion.div
            initial={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0, transition: { duration: 0.5 } }}
            className="absolute top-0 left-0 right-0 h-0.5 bg-[#D4AF37] origin-left"
          />
        )}
      </AnimatePresence>

      <div className="px-4 py-3 flex items-center gap-3">

        {/* Order number + NEW badge */}
        <div className="w-14 flex-shrink-0 text-center">
          <p className="text-base font-bold leading-none text-[#D4AF37]"
             style={{ fontFamily: 'Playfair Display, serif' }}>
            {fmtOrderNum(order.orderNumber)}
          </p>
          <AnimatePresence>
            {lit && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [1, 0.5, 1], scale: 1,
                  transition: { opacity: { repeat: Infinity, duration: 0.8 } } }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 bg-[#D4AF37] text-black text-[9px] font-black rounded-full"
              >
                <Zap className="w-2 h-2" />
                NEW
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="w-px h-9 bg-white/8 flex-shrink-0" />

        {/* Customer + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`${T.heading} font-semibold text-sm truncate`}>
              {order.customerName || 'Guest'}
            </span>
            {src && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${src.cls}`}>
                {src.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
            {/* Table / order type */}
            <span className={`flex items-center gap-0.5 ${T.muted} text-xs`}>
              {order.orderType === 'dine-in' ? (
                <><MapPin className="w-3 h-3" />{order.tableNumber ? `T${order.tableNumber}` : 'Dine-in'}</>
              ) : order.orderType === 'delivery' ? (
                <><ExternalLink className="w-3 h-3" />Delivery</>
              ) : (
                <><Package className="w-3 h-3" />Takeaway</>
              )}
            </span>

            {/* Items count */}
            <span className={`${T.muted} text-xs`}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>

            {/* Payment */}
            <span className={`text-xs font-medium ${pay.cls}`}>{pay.label}</span>

            {/* Time — pushed right */}
            <span className={`${T.faint} text-xs ml-auto`}>{fmtTime(order.createdAt)}</span>
          </div>

          {/* Item names */}
          <p className={`${T.faint} text-xs mt-0.5 truncate`}>
            {order.items?.slice(0, 3).map(i => `${i.name} ×${i.quantity}`).join(' · ')}
            {(order.items?.length ?? 0) > 3 && ` +${order.items.length - 3}`}
          </p>
        </div>

        {/* Amount + status */}
        <div className="flex-shrink-0 text-right ml-2">
          <p className="text-[#D4AF37] font-bold text-sm">
            {cur}{(order.totalAmount || order.total || 0).toFixed(0)}
          </p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            <span className={`text-xs capitalize ${st.text}`}>{st.label}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
RecentOrderCard.displayName = 'RecentOrderCard';

// ─── Overview ─────────────────────────────────────────────────────────────────

const Overview = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders,    loading: ordersLoading } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: inventory } = useCollection(
    'inventory',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';

  // ── Sound notification — plays once per genuinely new order ──────────────
  // Same two-tone chime as KitchenDisplay. Uses Web Audio API (no files needed).
  // AudioContext is created fresh each time to avoid suspended-context issues.
  const playNotify = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 220].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = i === 0 ? 880 : 1100;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.35, ctx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.45);
        osc.start(ctx.currentTime + delay / 1000);
        osc.stop(ctx.currentTime + delay / 1000 + 0.5);
      });
    } catch (_) { /* audio blocked by browser policy — silent fallback */ }
  };

  // ── new-order detection ────────────────────────────────────────────────
  const seenRef  = useRef(new Set());
  const [newIds, setNewIds] = useState(new Set());

  useEffect(() => {
    if (!orders?.length) return;
    const incoming = new Set(orders.map(o => o.id));

    if (seenRef.current.size === 0) {       // first load — seed without flagging
      seenRef.current = incoming;
      return;
    }

    const fresh = new Set();
    incoming.forEach(id => { if (!seenRef.current.has(id)) fresh.add(id); });

    if (fresh.size > 0) {
      playNotify(); // Feature 1: sound on new order
      setNewIds(prev => new Set([...prev, ...fresh]));
      setTimeout(() => {
        setNewIds(prev => {
          const next = new Set(prev);
          fresh.forEach(id => next.delete(id));
          return next;
        });
      }, 4500);
    }
    seenRef.current = incoming;
  }, [orders]);

  // ── sorted recent orders — newest first, max 10 ────────────────────────
  const recentOrders = useMemo(() => {
    if (!orders?.length) return [];
    return [...orders]
      .sort((a, b) => {
        if (a.orderNumber && b.orderNumber) return b.orderNumber - a.orderNumber;
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      })
      .slice(0, 10);
  }, [orders]);

  // ── stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!orders) return { todayRevenue: 0, ordersToday: 0, avgOrderValue: 0, activeOrders: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // todayOrders: all orders created today (used for "Orders Today" counter)
    const todayOrders  = orders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
    // Revenue: ONLY paymentStatus === 'paid' — no orderStatus condition (paid orders may not be 'completed' yet)
    const paid         = todayOrders.filter(o => o.paymentStatus === 'paid');
    const todayRevenue = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
    return {
      todayRevenue,
      ordersToday:   todayOrders.length,
      // avgOrderValue over paid orders only — avoids dilution from pending/cancelled
      avgOrderValue: paid.length > 0 ? todayRevenue / paid.length : 0,
      activeOrders:  orders.filter(o => o.orderStatus !== 'completed').length,
    };
  }, [orders]);

  // ── low stock ──────────────────────────────────────────────────────────
  const lowStockItems = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter(i =>
      typeof i.quantity === 'number' &&
      typeof i.lowStockThreshold === 'number' &&
      i.quantity <= i.lowStockThreshold
    );
  }, [inventory]);

  const statCards = [
    { label: "Today's Revenue", value: `${CUR}${stats.todayRevenue.toFixed(2)}`, icon: IndianRupee, color: 'text-[#10B981]', accent: '#10B981' },
    { label: 'Orders Today',    value: stats.ordersToday,                        icon: ShoppingBag, color: 'text-[#D4AF37]', accent: '#D4AF37' },
    { label: 'Avg Order Value', value: `${CUR}${stats.avgOrderValue.toFixed(2)}`, icon: TrendingUp,  color: 'text-[#3B82F6]', accent: '#3B82F6' },
    { label: 'Active Orders',   value: stats.activeOrders,                       icon: Clock,       color: 'text-[#F59E0B]', accent: '#F59E0B' },
  ];

  // ── WhatsApp Daily Report ──────────────────────────────────────────────
  const [reportSending, setReportSending] = useState(false);

  // ── Today's Business Summary toggle — deferred render until user clicks ─
  // The IIFE below does no extra fetching — it computes from the already-loaded
  // `orders` array. Deferring it just skips the JSX construction + DOM nodes
  // until the user actually wants to see it, keeping the initial paint lean.
  const [showSummary, setShowSummary] = useState(false);

  // Start 11 PM auto-scheduler when cafe data loads
  useEffect(() => {
    if (!cafeId || !cafe?.whatsappNumber) return;
    const stop = startDailyReportScheduler(
      cafeId,
      cafe.whatsappNumber,
      () => toast.success('📊 Daily report sent to WhatsApp!')
    );
    return () => stop();
  }, [cafeId, cafe?.whatsappNumber]);

  const handleSendReport = async () => {
    if (!cafe?.whatsappNumber) {
      toast.error('Add your WhatsApp number in Settings first');
      return;
    }
    setReportSending(true);
    try {
      await generateAndSendReport(cafeId, cafe.whatsappNumber);
      toast.success('📊 Report opened in WhatsApp!');
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setReportSending(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`${T.card} rounded-sm p-6 hover:${T.borderMd} transition-colors`}
              style={{ borderLeft: `3px solid ${stat.accent}22` }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className={`${T.muted} text-sm uppercase tracking-wide`}>{stat.label}</p>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className={`text-3xl font-bold ${T.heading}`}>{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── Today's Business Summary — loads on demand ─────────────────── */}
      {/* Button shown when summary is hidden */}
      {!showSummary && (
        <button
          onClick={() => setShowSummary(true)}
          className={`w-full flex items-center justify-center gap-2.5 py-3 ${T.card} border-[#D4AF37]/20 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5 rounded-xl text-[#D4AF37] text-sm font-semibold transition-all duration-200 group`}
        >
          <TrendingUp className="w-4 h-4 group-hover:scale-110 transition-transform" />
          View Today's Business Summary
        </button>
      )}

      {/* Summary panel — only mounted after button click, dismissed with ✕ */}
      <AnimatePresence>
        {showSummary && orders?.length > 0 && (() => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const todayOrders = orders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
          const paid        = todayOrders.filter(o => o.paymentStatus === 'paid');
          const pending     = todayOrders.filter(o => o.paymentStatus !== 'paid');
          const totalRev    = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
          const totalGST    = paid.reduce((s, o) => s + (o.gstAmount || 0), 0);
          const totalSC     = paid.reduce((s, o) => s + (o.serviceChargeAmount || 0), 0);

          const itemMap = {};
          todayOrders.forEach(o => (o.items||[]).forEach(i => {
            itemMap[i.name] = (itemMap[i.name] || 0) + (i.quantity || 1);
          }));
          const topItems = Object.entries(itemMap).sort((a,b) => b[1]-a[1]).slice(0,3);

          const catMap = {};
          paid.forEach(o => (o.items||[]).forEach(i => {
            const cat = i.category || 'Other';
            catMap[cat] = (catMap[cat] || 0) + (i.price||0) * (i.quantity||1);
          }));
          const topCats = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,3);

          return (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1    }}
              exit={{    opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.22 }}
              className={`${T.card} border-[#D4AF37]/20 rounded-xl overflow-hidden`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b ${T.border}`}
                style={{ background:'linear-gradient(135deg, rgba(212,175,55,0.08), transparent)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className={`${T.heading} font-bold text-sm`} style={{ fontFamily:'Playfair Display,serif' }}>
                      Today's Business Summary
                    </h3>
                    <p className={`${T.faint} text-xs`}>{new Date().toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long' })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#D4AF37] text-xs font-semibold px-2 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20">
                    {todayOrders.length} orders today
                  </span>
                  {/* Collapse button */}
                  <button
                    onClick={() => setShowSummary(false)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[#555] hover:${T.heading} hover:bg-white/10 transition-all`}
                    title="Hide summary"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className={`${T.faint} text-xs uppercase tracking-wide`}>Revenue</p>
                  <p className="text-[#10B981] font-black text-xl">{CUR}{totalRev.toFixed(2)}</p>
                  <p className={`${T.faint} text-xs`}>{paid.length} paid orders</p>
                </div>
                <div className="space-y-1">
                  <p className={`${T.faint} text-xs uppercase tracking-wide`}>Pending</p>
                  <p className="text-[#F59E0B] font-black text-xl">{pending.length}</p>
                  <p className={`${T.faint} text-xs`}>awaiting payment</p>
                </div>
                <div className="space-y-1">
                  <p className={`${T.faint} text-xs uppercase tracking-wide`}>GST Collected</p>
                  <p className="text-[#8B5CF6] font-black text-xl">{CUR}{totalGST.toFixed(2)}</p>
                  <p className={`${T.faint} text-xs`}>incl. in revenue</p>
                </div>
                <div className="space-y-1">
                  <p className={`${T.faint} text-xs uppercase tracking-wide`}>Service Charge</p>
                  <p className="text-[#3B82F6] font-black text-xl">{CUR}{totalSC.toFixed(2)}</p>
                  <p className={`${T.faint} text-xs`}>collected today</p>
                </div>
              </div>

              {(topItems.length > 0 || topCats.length > 0) && (
                <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {topItems.length > 0 && (
                    <div className="bg-white/3 rounded-lg p-3">
                      <p className={`${T.muted} text-xs uppercase tracking-wide mb-2 flex items-center gap-1`}>
                        🏆 Top Selling Items
                      </p>
                      {topItems.map(([name, qty], i) => (
                        <div key={name} className={`flex justify-between items-center py-1 text-xs border-b ${T.border} last:border-0`}>
                          <span className={`${T.heading} flex items-center gap-1.5`}>
                            <span className="text-[#D4AF37] font-bold">{i+1}.</span>{name}
                          </span>
                          <span className={`${T.muted}`}>{qty} sold</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {topCats.length > 0 && (
                    <div className="bg-white/3 rounded-lg p-3">
                      <p className={`${T.muted} text-xs uppercase tracking-wide mb-2 flex items-center gap-1`}>
                        📊 Category Revenue
                      </p>
                      {topCats.map(([cat, rev], i) => (
                        <div key={cat} className={`flex justify-between items-center py-1 text-xs border-b ${T.border} last:border-0`}>
                          <span className={`${T.heading} flex items-center gap-1.5`}>
                            <span className="text-[#D4AF37] font-bold">{i+1}.</span>{cat}
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

      {/* ── WhatsApp Daily Report Button ────────────────────────────────── */}
      <div className={`${T.card} rounded-sm px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
        <div>
          <p className={`${T.heading} font-semibold text-sm`}>📊 Daily Analytics Report</p>
          <p className={`${T.muted} text-xs mt-0.5`}>
            Auto-sends to WhatsApp at 11:00 PM · or send now manually
          </p>
        </div>
        <button
          onClick={handleSendReport}
          disabled={reportSending}
          className={`flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 ${T.heading} font-bold rounded-sm text-sm transition-all disabled:opacity-50 flex-shrink-0`}
        >
          {reportSending
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
            : <><Send className="w-4 h-4" /> Send Report Now</>
          }
        </button>
      </div>

      {/* Low Stock Alert */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -8  }}
            className="bg-red-500/8 border border-red-500/20 rounded-sm p-5"
            data-testid="overview-low-stock"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h4 className="text-red-400 font-semibold text-sm">
                  ⚠ Low Stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking
                </h4>
              </div>
              <span className={`${T.muted} text-xs hidden sm:block`}>Dashboard → Inventory</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.slice(0, 8).map(item => (
                <span key={item.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/12 border border-red-500/20 rounded text-red-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                  {item.itemName} · {item.quantity} {item.unit}
                </span>
              ))}
              {lowStockItems.length > 8 && (
                <span className="text-red-400/60 text-xs self-center">+{lowStockItems.length - 8} more</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Orders */}
      <div className={`${T.card} rounded-sm overflow-hidden`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${T.border}`}>
          <div className="flex items-center gap-3">
            <h3 className={`text-xl font-semibold ${T.heading}`} style={{ fontFamily: 'Playfair Display, serif' }}>
              Recent Orders
            </h3>
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[#10B981]/10 border border-[#10B981]/20 rounded-full text-[#10B981] text-[10px] font-semibold uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex items-center gap-3">
            <AnimatePresence>
              {newIds.size > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1   }}
                  exit={{    opacity: 0, scale: 0.8  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37]/15 border border-[#D4AF37]/30 rounded-full text-[#D4AF37] text-xs font-bold"
                >
                  <Zap className="w-3 h-3" />
                  {newIds.size} new
                </motion.span>
              )}
            </AnimatePresence>
            <span className={`${T.muted} text-xs`}>
              Last {recentOrders.length} of {orders?.length ?? 0}
            </span>
          </div>
        </div>

        {/* Cards */}
        <div className="p-4 space-y-2">
          {ordersLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-sm bg-white/3 animate-pulse"
                  style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className={`w-10 h-10 ${T.muted}/30 mx-auto mb-3`} />
              <p className={`${T.muted} text-sm`}>No orders yet</p>
              <p className={`${T.faint} text-xs mt-1`}>New orders will appear here instantly</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {recentOrders.map(order => (
                <RecentOrderCard
                  key={order.id}
                  order={order}
                  isNew={newIds.has(order.id)}
                  CUR={CUR}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        {!ordersLoading && recentOrders.length > 0 && (
          <div className={`px-6 py-3 border-t ${T.border} flex items-center justify-between`}>
            <p className={`${T.faint} text-xs flex items-center gap-1.5`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Updates instantly when new orders arrive
            </p>
            <p className={`${T.faint} text-xs`}>
              Showing newest {recentOrders.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Overview;
