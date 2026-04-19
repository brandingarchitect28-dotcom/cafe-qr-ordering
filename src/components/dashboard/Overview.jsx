/**
 * Overview.jsx
 *
 * Dashboard Overview — real-time stats + real-time recent orders.
 *
 * STORE ON/OFF TOGGLE ADDED (new StoreStatusCard section):
 *  - Writes storeOpen (boolean), openingTime (string), closingTime (string) to cafes/{cafeId}
 *  - All existing stats, orders, summary, low-stock logic: 100% UNCHANGED
 *
 * Architecture:
 *  - useCollection('orders') already uses onSnapshot — fully real-time, zero extra listeners.
 *  - recentOrders: client-side sorted newest-first, limited to 10 (avoids composite index).
 *  - New-order detection: seenRef tracks previously seen IDs; new arrivals are "fresh"
 *    for 4.5 s, then the highlight clears automatically.
 *  - isDeleted filter: applied once at the top (liveOrders) — every section below uses it.
 *  - Paid-only: revenue, avgOrderValue, and all Business Summary figures from paid orders only.
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IndianRupee, ShoppingBag, TrendingUp, Clock,
  AlertTriangle, Zap, MapPin, Package, ExternalLink,
  Send, RefreshCw, Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateAndSendReport, startDailyReportScheduler } from '../../services/whatsappReportService';

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
  completed: { dot: 'bg-green-500',   text: 'text-green-400',   label: 'Completed', dotColor: '#22c55e' },
  ready:     { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Ready',     dotColor: '#34d399' },
  preparing: { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'Preparing', dotColor: '#fbbf24' },
  cancelled: { dot: 'bg-red-500',     text: 'text-red-400',     label: 'Cancelled', dotColor: '#ef4444' },
  new:       { dot: 'bg-blue-400',    text: 'text-blue-400',    label: 'New',       dotColor: '#60a5fa' },
};
const getStatus = (s) => STATUS[s] || STATUS.new;

const SOURCE_BADGE = {
  zomato: { label: 'ZOMATO', cls: 'bg-red-500/20 text-red-400 border-red-500/30'         },
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
  const srcKey     = typeof order.source === 'string' ? order.source.toLowerCase() : '';
  const src        = order.source && order.source !== 'qr' && order.source !== 'direct'
                       ? SOURCE_BADGE[srcKey] || {
                           label: typeof order.source === 'string' ? order.source.toUpperCase() : String(order.source),
                           cls:   'bg-purple-500/20 text-purple-400 border-purple-500/30',
                         }
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
      className="relative rounded-xl border overflow-hidden transition-all duration-500"
      style={{
        background:  lit ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.025)',
        border:      lit ? '1px solid rgba(212,175,55,0.45)' : '1px solid rgba(255,255,255,0.06)',
        borderLeft:  lit ? '3px solid #D4AF37' : `3px solid ${st.dotColor || 'rgba(255,255,255,0.10)'}`,
        boxShadow:   lit ? '0 2px 20px rgba(212,175,55,0.10)' : 'none',
      }}
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
            <span className="text-white font-semibold text-sm truncate">
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
            <span className="flex items-center gap-0.5 text-[#A3A3A3] text-xs">
              {order.orderType === 'dine-in' ? (
                <><MapPin className="w-3 h-3" />{order.tableNumber ? `T${order.tableNumber}` : 'Dine-in'}</>
              ) : order.orderType === 'delivery' ? (
                <><ExternalLink className="w-3 h-3" />Delivery</>
              ) : (
                <><Package className="w-3 h-3" />Takeaway</>
              )}
            </span>

            {/* Items count */}
            <span className="text-[#A3A3A3] text-xs">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>

            {/* Payment */}
            <span className={`text-xs font-medium ${pay.cls}`}>{pay.label}</span>

            {/* Time — pushed right */}
            <span className="text-[#555] text-xs ml-auto">{fmtTime(order.createdAt)}</span>
          </div>

          {/* Item names */}
          <p className="text-[#555] text-xs mt-0.5 truncate">
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

// ─── StoreStatusCard ──────────────────────────────────────────────────────────
// NEW component — purely additive. Reads/writes cafes/{cafeId} only.
// Does not touch orders, cart, menu, or any existing logic.

const StoreStatusCard = ({ cafe, cafeId }) => {
  // Derive current values from cafe doc.
  // storeOpen undefined (old docs) = treat as open (safe default).
  const isOpen      = cafe?.storeOpen !== false;
  const [openTime,  setOpenTime ] = useState(cafe?.openingTime  || '');
  const [closeTime, setCloseTime] = useState(cafe?.closingTime  || '');
  const [saving,    setSaving   ] = useState(false);

  // Sync local inputs if cafe doc updates externally (real-time listener)
  useEffect(() => { setOpenTime(cafe?.openingTime  || ''); }, [cafe?.openingTime ]);
  useEffect(() => { setCloseTime(cafe?.closingTime || ''); }, [cafe?.closingTime]);

  const handleToggle = async () => {
    if (!cafeId) return;
    // Opening time required when turning store ON
    if (isOpen === false && !openTime.trim()) {
      toast.error('Set an opening time before opening the store');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'cafes', cafeId), {
        storeOpen:   !isOpen,
        openingTime: openTime.trim()  || '',
        closingTime: closeTime.trim() || '',
      });
      toast.success(isOpen ? '🔒 Store closed' : '✅ Store is now open!');
    } catch (err) {
      console.error('[StoreToggle]', err);
      toast.error('Failed to update store status');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTimes = async () => {
    if (!cafeId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'cafes', cafeId), {
        openingTime: openTime.trim()  || '',
        closingTime: closeTime.trim() || '',
      });
      toast.success('Opening hours saved');
    } catch (err) {
      toast.error('Failed to save hours');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden border"
      style={{
        background: isOpen
          ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04))',
        borderColor: isOpen ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
      }}
    >
      {/* Top row — status + toggle */}
      <div className="flex items-center justify-between px-5 py-4">

        {/* Left — icon + label */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: isOpen ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            }}
          >
            <Store className="w-5 h-5" style={{ color: isOpen ? '#10B981' : '#EF4444' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {/* Pulsing dot */}
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: isOpen ? '#10B981' : '#EF4444',
                  boxShadow:  isOpen ? '0 0 6px #10B981' : '0 0 6px #EF4444',
                  animation:  isOpen ? 'pulse 2s infinite' : 'none',
                }}
              />
              <p className="text-white font-bold text-base">
                Store is{' '}
                <span style={{ color: isOpen ? '#10B981' : '#EF4444' }}>
                  {isOpen ? 'OPEN' : 'CLOSED'}
                </span>
              </p>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#A3A3A3' }}>
              {isOpen
                ? (openTime ? `Open until ${closeTime || '—'}` : 'Accepting orders')
                : (openTime ? `Will open at ${openTime}` : 'Not accepting orders')}
            </p>
          </div>
        </div>

        {/* Right — toggle switch */}
        <button
          onClick={handleToggle}
          disabled={saving}
          title={isOpen ? 'Close store' : 'Open store'}
          className="relative flex-shrink-0 w-14 h-7 rounded-full transition-all duration-300 disabled:opacity-60"
          style={{
            background: isOpen ? '#10B981' : 'rgba(255,255,255,0.10)',
            border:     isOpen ? 'none' : '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md"
            style={{ left: isOpen ? '50%' : '2px' }}
          />
        </button>
      </div>

      {/* Bottom row — opening hours */}
      <div
        className="px-5 py-3 flex flex-wrap items-end gap-3 border-t"
        style={{ borderColor: isOpen ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}
      >
        {/* Opening time — required */}
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium mb-1" style={{ color: '#A3A3A3' }}>
            Opening Time <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="time"
            value={openTime}
            onChange={e => setOpenTime(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none text-white"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border:     '1px solid rgba(255,255,255,0.10)',
            }}
          />
        </div>

        {/* Closing time — optional */}
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium mb-1" style={{ color: '#A3A3A3' }}>
            Closing Time <span style={{ color: '#555' }}>(optional)</span>
          </label>
          <input
            type="time"
            value={closeTime}
            onChange={e => setCloseTime(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none text-white"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border:     '1px solid rgba(255,255,255,0.10)',
            }}
          />
        </div>

        {/* Save times button */}
        <button
          onClick={handleSaveTimes}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }}
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          Save Hours
        </button>
      </div>
    </motion.div>
  );
};

// ─── Overview ─────────────────────────────────────────────────────────────────

const Overview = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;

  const { data: orders, loading: ordersLoading } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: inventory } = useCollection(
    'inventory',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── Global isDeleted filter — applied once, used everywhere below ──────────
  const liveOrders = useMemo(
    () => orders?.filter(o => !o.isDeleted) ?? [],
    [orders]
  );

  // ── Sound notification ─────────────────────────────────────────────────────
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
    } catch (_) { /* audio blocked by browser — silent fallback */ }
  };

  // ── New-order detection ────────────────────────────────────────────────────
  const seenRef = useRef(new Set());
  const [newIds, setNewIds] = useState(new Set());

  useEffect(() => {
    if (!liveOrders?.length) return;
    const incoming = new Set(liveOrders.map(o => o.id));

    if (seenRef.current.size === 0) {
      seenRef.current = incoming;
      return;
    }

    const fresh = new Set();
    incoming.forEach(id => { if (!seenRef.current.has(id)) fresh.add(id); });

    if (fresh.size > 0) {
      playNotify();
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
  }, [liveOrders]);

  // ── Recent orders ──────────────────────────────────────────────────────────
  const recentOrders = useMemo(() => {
    if (!liveOrders.length) return [];
    return [...liveOrders]
      .sort((a, b) => {
        if (a.orderNumber && b.orderNumber) return b.orderNumber - a.orderNumber;
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      })
      .slice(0, 10);
  }, [liveOrders]);

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!liveOrders.length) return { todayRevenue: 0, ordersToday: 0, avgOrderValue: 0, activeOrders: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const todayOrders = liveOrders.filter(
      o => (o.createdAt?.toDate?.() || new Date(0)) >= today
    );
    const paid = todayOrders.filter(
      o => o.paymentStatus === 'paid' || o.status === 'paid'
    );
    const todayRevenue = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);

    return {
      todayRevenue,
      ordersToday:   todayOrders.length,
      avgOrderValue: paid.length > 0 ? todayRevenue / paid.length : 0,
      activeOrders:  liveOrders.filter(o => o.orderStatus !== 'completed').length,
    };
  }, [liveOrders]);

  // ── Low stock ──────────────────────────────────────────────────────────────
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

  // ── WhatsApp Daily Report ──────────────────────────────────────────────────
  const [reportSending, setReportSending] = useState(false);
  const [showSummary,   setShowSummary  ] = useState(false);

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

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── STORE STATUS CARD — NEW ────────────────────────────────────────── */}
      {/* Purely additive. Reads/writes cafes/{cafeId} only.                   */}
      {/* Zero effect on orders, stats, menu, cart, or any existing logic.     */}
      {cafeId && (
        <StoreStatusCard cafe={cafe} cafeId={cafeId} />
      )}

      {/* ── 4 Stat Cards — UNCHANGED ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              whileHover={{ y: -3, boxShadow: `0 8px 32px ${stat.accent}18` }}
              transition={{ duration: 0.2 }}
              data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="relative overflow-hidden rounded-xl border border-white/8 p-6 cursor-default"
              style={{
                background:  `linear-gradient(135deg, ${stat.accent}0a 0%, rgba(15,15,15,1) 60%)`,
                borderLeft:  `3px solid ${stat.accent}55`,
                boxShadow:   `0 2px 16px ${stat.accent}0a`,
              }}
            >
              {/* Subtle glow blob behind icon */}
              <div
                className="absolute top-3 right-3 w-14 h-14 rounded-full blur-2xl pointer-events-none"
                style={{ background: `${stat.accent}18` }}
              />
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-xs uppercase tracking-widest font-medium">{stat.label}</p>
                {/* Icon with glow ring */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.accent}18`, boxShadow: `0 0 0 1px ${stat.accent}30` }}
                >
                  <Icon className={`w-4.5 h-4.5 ${stat.color}`} style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <p className="text-3xl font-black text-white tracking-tight">{stat.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Today's Business Summary (toggle) — UNCHANGED ─────────────────── */}
      {liveOrders.length > 0 && (() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const todayOrders = liveOrders.filter(
          o => (o.createdAt?.toDate?.() || new Date(0)) >= today
        );
        const paid    = todayOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'paid');
        const pending = todayOrders.filter(o => o.paymentStatus !== 'paid' && o.status !== 'paid');

        const totalRev = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
        const totalGST = paid.reduce((s, o) => s + (o.gstAmount || o.taxAmount || 0), 0);
        const totalSC  = paid.reduce((s, o) => s + (o.serviceChargeAmount || 0), 0);

        const itemMap = {};
        paid.forEach(o => (o.items || []).forEach(i => {
          itemMap[i.name] = (itemMap[i.name] || 0) + (i.quantity || 1);
        }));
        const topItems = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

        const catMap = {};
        paid.forEach(o => (o.items || []).forEach(i => {
          const cat = i.category || 'Other';
          catMap[cat] = (catMap[cat] || 0) + (i.price || 0) * (i.quantity || 1);
        }));
        const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(12,12,12,0.96)',
              border:     '1px solid rgba(212,175,55,0.22)',
              boxShadow:  '0 4px 32px rgba(212,175,55,0.06)',
            }}
          >
            {/* Header — clickable toggle, visual upgrade only */}
            <div
              onClick={() => setShowSummary(prev => !prev)}
              className="cursor-pointer flex items-center justify-between px-5 py-4 border-b transition-colors"
              style={{
                background:   'linear-gradient(135deg, rgba(212,175,55,0.10), rgba(212,175,55,0.02))',
                borderColor:  'rgba(212,175,55,0.12)',
              }}
            >
              <div className="flex items-center gap-3">
                {/* Icon with stronger glow ring */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(212,175,55,0.18)', boxShadow: '0 0 0 1px rgba(212,175,55,0.32)' }}
                >
                  <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Today's Business Summary
                  </h3>
                  <p className="text-[#555] text-xs">
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#D4AF37] text-xs font-semibold px-2.5 py-1 rounded-full bg-[#D4AF37]/12 border border-[#D4AF37]/25">
                  {todayOrders.length} orders today
                </span>
                {/* Animated rotating chevron */}
                <motion.span
                  animate={{ rotate: showSummary ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-[#A3A3A3] text-sm opacity-60 select-none inline-block"
                >
                  ▼
                </motion.span>
              </div>
            </div>

            {showSummary && (
              <>
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

                {(topItems.length > 0 || topCats.length > 0) && (
                  <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {topItems.length > 0 && (
                      <div className="bg-white/3 rounded-lg p-3">
                        <p className="text-[#A3A3A3] text-xs uppercase tracking-wide mb-2 flex items-center gap-1">
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
                        <p className="text-[#A3A3A3] text-xs uppercase tracking-wide mb-2 flex items-center gap-1">
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
              </>
            )}
          </motion.div>
        );
      })()}

      {/* ── Low Stock Alert — UNCHANGED ────────────────────────────────────── */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -8  }}
            className="relative overflow-hidden rounded-xl p-5"
            style={{
              background:  'rgba(239,68,68,0.06)',
              border:      '1px solid rgba(239,68,68,0.28)',
              borderLeft:  '3px solid rgba(239,68,68,0.70)',
              boxShadow:   '0 2px 20px rgba(239,68,68,0.08)',
            }}
            data-testid="overview-low-stock"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h4 className="text-red-400 font-semibold text-sm">
                  ⚠ Low Stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking
                </h4>
              </div>
              <span className="text-[#A3A3A3] text-xs hidden sm:block">Dashboard → Inventory</span>
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

      {/* ── Recent Orders — visual upgrade only, all data/logic unchanged ──── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(10,10,10,0.96)',
          border:     '1px solid rgba(255,255,255,0.07)',
          boxShadow:  '0 4px 32px rgba(0,0,0,0.25)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'linear-gradient(135deg, rgba(16,185,129,0.05), transparent)' }}>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
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
            <span className="text-[#A3A3A3] text-xs">
              Last {recentOrders.length} of {liveOrders.length}
            </span>
          </div>
        </div>

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
              <ShoppingBag className="w-10 h-10 text-[#A3A3A3]/30 mx-auto mb-3" />
              <p className="text-[#A3A3A3] text-sm">No orders yet</p>
              <p className="text-[#555] text-xs mt-1">New orders will appear here instantly</p>
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

        {!ordersLoading && recentOrders.length > 0 && (
          <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-[#555] text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Updates instantly when new orders arrive
            </p>
            <p className="text-[#555] text-xs">
              Showing newest {recentOrders.length}
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

export default Overview;
