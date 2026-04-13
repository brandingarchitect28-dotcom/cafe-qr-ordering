/**
 * KitchenDisplay.jsx
 * Route: /kitchen/:cafeId
 *
 * Real-time Kitchen Display System (KDS).
 * - No auth required — staff open this URL directly on a kitchen tablet.
 * - All order mutations go through the same `orders/{orderId}.orderStatus`
 *   field used by Dashboard / Analytics / OrdersManagement — fully compatible.
 * - Statuses: new → preparing → ready → completed
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  collection, doc, query, where, onSnapshot, updateDoc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat, Clock, CheckCircle2, Flame, Bell, Wifi, WifiOff,
  UtensilsCrossed, RefreshCw, Package, ArrowRight, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── constants ────────────────────────────────────────────────────────────────

const COLUMNS = [
  {
    id:    'new',
    label: 'New Orders',
    icon:  Bell,
    accent:  '#3B82F6',          // blue
    bg:      'rgba(59,130,246,0.08)',
    border:  'rgba(59,130,246,0.20)',
    badge:   'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  },
  {
    id:    'preparing',
    label: 'Preparing',
    icon:  Flame,
    accent:  '#F59E0B',          // amber
    bg:      'rgba(245,158,11,0.08)',
    border:  'rgba(245,158,11,0.20)',
    badge:   'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  },
  {
    id:    'ready',
    label: 'Ready',
    icon:  CheckCircle2,
    accent:  '#10B981',          // green
    bg:      'rgba(16,185,129,0.08)',
    border:  'rgba(16,185,129,0.20)',
    badge:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  },
];

// Action buttons config — what action is available FROM each status
const ACTIONS = {
  new:       { label: 'Start Preparing', next: 'preparing', icon: Flame,        color: '#F59E0B' },
  preparing: { label: 'Ready for Pickup', next: 'ready',     icon: CheckCircle2, color: '#10B981' },
  ready:     { label: 'Mark Completed',  next: 'completed',  icon: Package,      color: '#8B5CF6' },
};

// Elapsed-time helper
const useElapsed = (timestamp) => {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const calc = () => {
      if (!timestamp) { setElapsed(''); return; }
      const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const secs = Math.floor((Date.now() - d.getTime()) / 1000);
      if (secs < 60)  { setElapsed(`${secs}s ago`); return; }
      const mins = Math.floor(secs / 60);
      if (mins < 60)  { setElapsed(`${mins}m ago`);  return; }
      setElapsed(`${Math.floor(mins / 60)}h ago`);
    };
    calc();
    const id = setInterval(calc, 10000);
    return () => clearInterval(id);
  }, [timestamp]);
  return elapsed;
};

// ─── OrderCard ────────────────────────────────────────────────────────────────

const OrderCard = ({ order, onAdvance, advancing }) => {
  const elapsed = useElapsed(order.createdAt);
  const action  = ACTIONS[order.orderStatus];

  const isOld = (() => {
    if (!order.createdAt) return false;
    const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
    return (Date.now() - d.getTime()) > 15 * 60 * 1000; // > 15 min
  })();

  const totalItems = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) ?? 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: '#0D0D0D',
        borderColor: isOld ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.07)',
        boxShadow: isOld
          ? '0 0 0 1px rgba(239,68,68,0.2), 0 4px 24px rgba(0,0,0,0.4)'
          : '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Card header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="text-xl font-bold"
            style={{ fontFamily: 'Playfair Display, serif', color: '#D4AF37' }}
          >
            #{order.orderNumber ? String(order.orderNumber).padStart(3, '0') : order.id.slice(0, 6)}
          </span>
          {order.orderType === 'dine-in' && order.tableNumber && (
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-white/10 text-white">
              Table {order.tableNumber}
            </span>
          )}
          {order.orderType === 'takeaway' && (
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-500/20 text-purple-300">
              Takeaway
            </span>
          )}
          {order.orderType === 'delivery' && (
            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-300">
              Delivery
            </span>
          )}
          {/* External platform label (Feature 7 compat) */}
          {order.source && order.source !== 'qr' && (
            <span className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase ${
              order.source === 'zomato'  ? 'bg-red-500/20 text-red-400' :
              order.source === 'swiggy'  ? 'bg-orange-500/20 text-orange-400' :
              'bg-gray-500/20 text-gray-300'
            }`}>
              {order.source}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Clock className={`w-3.5 h-3.5 ${isOld ? 'text-red-400' : 'text-[#A3A3A3]'}`} />
          <span className={isOld ? 'text-red-400 font-semibold' : 'text-[#A3A3A3]'}>{elapsed}</span>
        </div>
      </div>

      {/* Items list */}
      <div className="px-4 py-3 space-y-1.5">
        {(order.items || []).map((item, idx) => (
          <div key={idx} className="flex items-baseline justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-white text-sm font-medium leading-snug">{item.name}</span>

              {/* Combo items */}
              {item.comboItems?.length > 0 && (
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  {item.comboItems.map((ci, cIdx) => (
                    <div key={cIdx} style={{ color: '#A3A3A3', paddingLeft: '8px' }}>
                      - {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* Addons */}
              {item.addons?.length > 0 && (
                <div style={{ fontSize: '12px', opacity: 0.8, color: '#A3A3A3', paddingLeft: '8px' }}>
                  + {item.addons.map(a => a.name).join(', ')}
                </div>
              )}
            </div>

            <span
              className="flex-shrink-0 text-sm font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}
            >
              ×{item.quantity}
            </span>
          </div>
        ))}
        {order.specialInstructions && (
          <div
            className="mt-2 px-3 py-2 rounded-lg text-xs text-amber-300 border border-amber-500/20"
            style={{ backgroundColor: 'rgba(245,158,11,0.06)' }}
          >
            📝 {order.specialInstructions}
          </div>
        )}
      </div>

      {/* Footer — item count + action button */}
      <div
        className="px-4 py-3 border-t flex items-center justify-between gap-3"
        style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.01)' }}
      >
        <span className="text-[#A3A3A3] text-xs">
          {totalItems} item{totalItems !== 1 ? 's' : ''}
          {order.customerName ? ` · ${order.customerName}` : ''}
        </span>

        {action && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onAdvance(order.id, action.next)}
            disabled={advancing === order.id}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-black transition-all disabled:opacity-50"
            style={{ backgroundColor: action.color, minWidth: 110 }}
          >
            {advancing === order.id ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <action.icon className="w-3.5 h-3.5" />
            )}
            {advancing === order.id ? 'Updating…' : action.label}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};

// ─── KitchenDisplay ──────────────────────────────────────────────────────────

const KitchenDisplay = () => {
  const { cafeId } = useParams();

  const [cafe,        setCafe        ] = useState(null);
  const [orders,      setOrders      ] = useState([]);
  const [cafeLoading, setCafeLoading ] = useState(true);
  const [ordersReady, setOrdersReady ] = useState(false);
  const [online,      setOnline      ] = useState(navigator.onLine);
  const [advancing,   setAdvancing   ] = useState(null);  // orderId being mutated
  const [ticker,      setTicker      ] = useState(0);     // forces clock re-render

  // ── Pagination: track current page per column ─────────────────────────────
  const PAGE_SIZE = 20; // show 20 cards per column — handles 300+ orders without lag
  const [colPages, setColPages] = useState({ new: 0, preparing: 0, ready: 0 });
  const setColPage = (colId, page) => setColPages(prev => ({ ...prev, [colId]: page }));

  const prevOrderIdsRef = useRef(new Set());
  const notifyAudioRef  = useRef(null);

  // ── network status ────────────────────────────────────────────────────────
  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // ── clock tick every minute (for elapsed time display) ───────────────────
  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── load cafe info ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cafeId) { setCafeLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'cafes', cafeId), snap => {
      setCafe(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setCafeLoading(false);
    }, () => setCafeLoading(false));
    return () => unsub();
  }, [cafeId]);

  // ── real-time orders listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!cafeId) return;

    // Fetch only non-completed orders for the kitchen board.
    // Completed orders move off the board automatically.
    const q = query(
      collection(db, 'orders'),
      where('cafeId', '==', cafeId),
    );

    const unsub = onSnapshot(q, snap => {
      const incoming   = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled');
      const incomingIds = new Set(incoming.map(o => o.id));

      if (prevOrderIdsRef.current.size > 0) {
        const newOnes = incoming.filter(o => !prevOrderIdsRef.current.has(o.id));
        if (newOnes.length > 0) {
          playNotify();
          newOnes.forEach(o => {
            toast.success(
              `New order #${o.orderNumber ? String(o.orderNumber).padStart(3,'0') : o.id.slice(0,6)}`,
              { duration: 6000, icon: '🍽️' }
            );
          });
          // Jump to page 0 so new orders are visible at the top
          setColPages({ new: 0, preparing: 0, ready: 0 });
        }
      }
      prevOrderIdsRef.current = incomingIds;

      setOrders(incoming);
      setOrdersReady(true);
    }, err => {
      console.error('[KDS] Firestore error:', err);
      setOrdersReady(true);
    });

    return () => unsub();
  }, [cafeId]);

  // ── notification sound ────────────────────────────────────────────────────
  const playNotify = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Simple two-tone chime — no external file needed
      [0, 200].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = i === 0 ? 880 : 1100;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, ctx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.5);
        osc.start(ctx.currentTime + delay / 1000);
        osc.stop(ctx.currentTime + delay / 1000 + 0.5);
      });
    } catch (_) { /* audio blocked — silent */ }
  }, []);

  // ── advance order status ──────────────────────────────────────────────────
  const handleAdvance = async (orderId, nextStatus) => {
    setAdvancing(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        orderStatus: nextStatus,
        [`${nextStatus}At`]: serverTimestamp(),  // audit trail field
      });
      // If completed → remove from kitchen board (listener filters it out automatically)
    } catch (err) {
      console.error('[KDS] Failed to update order:', err);
      toast.error('Failed to update order status');
    } finally {
      setAdvancing(null);
    }
  };

  // ── derived column data with pagination ──────────────────────────────────
  const columns = COLUMNS.map(col => {
    const allColOrders = orders
      .filter(o => o.orderStatus === col.id)
      .sort((a, b) => {
        // Newest orders on top (descending)
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });
    const page      = colPages[col.id] || 0;
    const totalPages = Math.ceil(allColOrders.length / PAGE_SIZE) || 1;
    const pageOrders = allColOrders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return {
      ...col,
      orders:     pageOrders,
      allOrders:  allColOrders,
      totalCount: allColOrders.length,
      page,
      totalPages,
    };
  });

  const totalActive = orders.length;

  // ── current time display ──────────────────────────────────────────────────
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  // ── loading / error states ────────────────────────────────────────────────
  if (cafeLoading) {
    return (
      <div className="min-h-screen bg-[#060606] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-4 border-[#D4AF37] border-t-transparent"
        />
      </div>
    );
  }

  if (!cafe) {
    return (
      <div className="min-h-screen bg-[#060606] flex items-center justify-center text-center p-8">
        <div>
          <UtensilsCrossed className="w-16 h-16 text-[#A3A3A3] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Café Not Found
          </h2>
          <p className="text-[#A3A3A3]">No café with ID: <code className="text-[#D4AF37]">{cafeId}</code></p>
        </div>
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: '#060606', fontFamily: 'Manrope, sans-serif' }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: '#0A0A0A' }}
      >
        {/* Left: cafe name + KDS badge */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(212,175,55,0.12)' }}
          >
            <ChefHat className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h1
              className="text-base font-bold text-white leading-none"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {cafe.name || 'Kitchen'}
            </h1>
            <span className="text-[10px] text-[#A3A3A3] uppercase tracking-widest">Kitchen Display</span>
          </div>
        </div>

        {/* Centre: active order count */}
        <div className="flex items-center gap-5">
          <div className="text-center hidden sm:block">
            <p className="text-[28px] font-bold leading-none" style={{ color: '#D4AF37' }}>
              {totalActive}
            </p>
            <p className="text-[10px] text-[#A3A3A3] uppercase tracking-wide">Active</p>
          </div>
          {columns.map(col => (
            <div key={col.id} className="text-center hidden md:block">
              <p className="text-xl font-bold leading-none" style={{ color: col.accent }}>
                {col.orders.length}
              </p>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: col.accent + 'aa' }}>
                {col.label.split(' ')[0]}
              </p>
            </div>
          ))}
        </div>

        {/* Right: time + date + network */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-white">{timeStr}</p>
            <p className="text-[10px] text-[#A3A3A3]">{dateStr}</p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
            online ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {online
              ? <><Wifi className="w-3 h-3" /> Live</>
              : <><WifiOff className="w-3 h-3" /> Offline</>
            }
          </div>
        </div>
      </header>

      {/* ── Column headers (tablet pill row) ─────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-stretch gap-px border-b"
        style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: '#080808' }}
      >
        {columns.map(col => {
          const Icon = col.icon;
          return (
            <div
              key={col.id}
              className="flex-1 flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: `2px solid ${col.accent}` }}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" style={{ color: col.accent }} />
                <span className="font-semibold text-sm text-white">{col.label}</span>
              </div>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: col.accent + '25', color: col.accent }}
              >
                {col.orders.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Kanban board ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex gap-px overflow-hidden" style={{ backgroundColor: '#111' }}>
        {columns.map(col => (
          <div
            key={col.id}
            className="flex-1 flex flex-col overflow-hidden"
            style={{ backgroundColor: col.bg }}
          >
            {/* Scrollable card list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <AnimatePresence mode="popLayout">
                {col.orders.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 gap-3 text-center"
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: col.border }}
                    >
                      <col.icon className="w-6 h-6" style={{ color: col.accent + '80' }} />
                    </div>
                    <p className="text-sm" style={{ color: col.accent + '60' }}>
                      No orders
                    </p>
                  </motion.div>
                ) : (
                  col.orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onAdvance={handleAdvance}
                      advancing={advancing}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Pagination controls — only shown when column has >PAGE_SIZE orders */}
            {col.totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between px-3 py-2 border-t"
                style={{ borderColor: col.border, background: col.bg }}>
                <button
                  onClick={() => setColPage(col.id, Math.max(0, col.page - 1))}
                  disabled={col.page === 0}
                  className="px-3 py-1 rounded text-xs font-bold transition-all disabled:opacity-30"
                  style={{ background: col.page === 0 ? 'transparent' : col.accent + '20', color: col.accent }}
                >
                  ← Prev
                </button>
                <span className="text-xs" style={{ color: col.accent + 'aa' }}>
                  {col.page + 1} / {col.totalPages} · {col.totalCount} orders
                </span>
                <button
                  onClick={() => setColPage(col.id, Math.min(col.totalPages - 1, col.page + 1))}
                  disabled={col.page >= col.totalPages - 1}
                  className="px-3 py-1 rounded text-xs font-bold transition-all disabled:opacity-30"
                  style={{ background: col.page >= col.totalPages - 1 ? 'transparent' : col.accent + '20', color: col.accent }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Loading overlay (first data fetch) ────────────────────────────── */}
      <AnimatePresence>
        {!ordersReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#060606] flex items-center justify-center z-50"
          >
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-10 h-10 rounded-full border-4 border-[#D4AF37] border-t-transparent mx-auto mb-4"
              />
              <p className="text-[#A3A3A3] text-sm">Connecting to kitchen…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default KitchenDisplay;
