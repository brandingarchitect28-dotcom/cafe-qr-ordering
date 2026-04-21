/**
 * Overview.jsx
 * Theme-aware version — full light/dark support.
 * All logic, state, handlers, hooks: 100% UNCHANGED.
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
import { useTheme } from '../../hooks/useTheme';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtOrderNum = (n) => n ? `#${String(n).padStart(3, '0')}` : '—';

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
const RecentOrderCard = React.memo(({ order, isNew, CUR, isLight }) => {
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

  // ── color tokens ─────────────────────────────────────────────────────────
  const cardBgLit    = isLight ? 'rgba(201,162,39,0.06)' : 'rgba(212,175,55,0.06)';
  const cardBgNormal = isLight ? 'rgba(0,0,0,0.03)'      : 'rgba(255,255,255,0.025)';
  const cardBdLit    = isLight ? 'rgba(212,175,55,0.45)' : 'rgba(212,175,55,0.45)';
  const cardBdNormal = isLight ? 'rgba(0,0,0,0.09)'      : 'rgba(255,255,255,0.06)';
  const custNameC    = isLight ? '#111111'                : '#ffffff';
  const metaC        = isLight ? '#555555'                : '#A3A3A3';
  const timeC        = isLight ? '#666666'                : '#555555';
  const itemNamesC   = isLight ? '#666666'                : '#555555';
  const dividerC     = isLight ? 'rgba(0,0,0,0.08)'      : 'rgba(255,255,255,0.08)';
  // ─────────────────────────────────────────────────────────────────────────

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
        background:  lit ? cardBgLit : cardBgNormal,
        border:      lit ? `1px solid ${cardBdLit}` : `1px solid ${cardBdNormal}`,
        borderLeft:  lit ? '3px solid #D4AF37' : `3px solid ${st.dotColor || (isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)')}`,
        boxShadow:   lit ? '0 2px 20px rgba(212,175,55,0.10)' : 'none',
      }}
      data-testid={`overview-order-${order.id}`}
    >
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
        {/* Order number */}
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
                <Zap className="w-2 h-2" />NEW
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="w-px h-9 flex-shrink-0" style={{ background: dividerC }} />

        {/* Customer + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm truncate" style={{ color: custNameC }}>
              {order.customerName || 'Guest'}
            </span>
            {src && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${src.cls}`}>
                {src.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
            <span className="flex items-center gap-0.5 text-xs" style={{ color: metaC }}>
              {order.orderType === 'dine-in' ? (
                <><MapPin className="w-3 h-3" />{order.tableNumber ? `T${order.tableNumber}` : 'Dine-in'}</>
              ) : order.orderType === 'delivery' ? (
                <><ExternalLink className="w-3 h-3" />Delivery</>
              ) : (
                <><Package className="w-3 h-3" />Takeaway</>
              )}
            </span>
            <span className="text-xs" style={{ color: metaC }}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>
            <span className={`text-xs font-medium ${pay.cls}`}>{pay.label}</span>
            <span className="text-xs ml-auto" style={{ color: timeC }}>{fmtTime(order.createdAt)}</span>
          </div>

          <p className="text-xs mt-0.5 truncate" style={{ color: itemNamesC }}>
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
const StoreStatusCard = ({ cafe, cafeId, isLight }) => {
  const isOpen      = cafe?.storeOpen !== false;
  const [openTime,  setOpenTime ] = useState(cafe?.openingTime  || '');
  const [closeTime, setCloseTime] = useState(cafe?.closingTime  || '');
  const [saving,    setSaving   ] = useState(false);

  useEffect(() => { setOpenTime(cafe?.openingTime  || ''); }, [cafe?.openingTime ]);
  useEffect(() => { setCloseTime(cafe?.closingTime || ''); }, [cafe?.closingTime]);

  // ── color tokens ─────────────────────────────────────────────────────────
  const cardBg        = isOpen
    ? (isLight ? 'linear-gradient(135deg,rgba(16,185,129,0.06),rgba(16,185,129,0.02))' : 'linear-gradient(135deg,rgba(16,185,129,0.08),rgba(16,185,129,0.03))')
    : (isLight ? 'linear-gradient(135deg,rgba(239,68,68,0.06),rgba(239,68,68,0.02))' : 'linear-gradient(135deg,rgba(239,68,68,0.10),rgba(239,68,68,0.04))');
  const cardBd        = isOpen ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
  const titleC        = isLight ? '#111111' : '#ffffff';
  const subtitleC     = isLight ? '#555555' : '#A3A3A3';
  const inputBg       = isLight ? 'rgba(0,0,0,0.05)'  : 'rgba(255,255,255,0.06)';
  const inputBd       = isLight ? 'rgba(0,0,0,0.12)'  : 'rgba(255,255,255,0.10)';
  const inputC        = isLight ? '#111111'             : '#ffffff';
  const toggleOffBg   = isLight ? 'rgba(0,0,0,0.15)'  : 'rgba(255,255,255,0.10)';
  const toggleOffBd   = isLight ? 'rgba(0,0,0,0.20)'  : 'rgba(255,255,255,0.15)';
  const labelC        = isLight ? '#555555'             : '#A3A3A3';
  const optionalC     = isLight ? '#888888'             : '#555555';
  const bottomBd      = isOpen ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
  // ─────────────────────────────────────────────────────────────────────────

  const handleToggle = async () => {
    if (!cafeId) return;
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
      style={{ background: cardBg, borderColor: cardBd }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: isOpen ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}>
            <Store className="w-5 h-5" style={{ color: isOpen ? '#10B981' : '#EF4444' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: isOpen ? '#10B981' : '#EF4444', boxShadow: isOpen ? '0 0 6px #10B981' : '0 0 6px #EF4444', animation: isOpen ? 'pulse 2s infinite' : 'none' }} />
              <p className="font-bold text-base" style={{ color: titleC }}>
                Store is{' '}
                <span style={{ color: isOpen ? '#10B981' : '#EF4444' }}>
                  {isOpen ? 'OPEN' : 'CLOSED'}
                </span>
              </p>
            </div>
            <p className="text-xs mt-0.5" style={{ color: subtitleC }}>
              {isOpen
                ? (openTime ? `Open until ${closeTime || '—'}` : 'Accepting orders')
                : (openTime ? `Will open at ${openTime}` : 'Not accepting orders')}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={saving}
          title={isOpen ? 'Close store' : 'Open store'}
          className="relative flex-shrink-0 w-14 h-7 rounded-full transition-all duration-300 disabled:opacity-60"
          style={{
            background: isOpen ? '#10B981' : toggleOffBg,
            border:     isOpen ? 'none' : `1px solid ${toggleOffBd}`,
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

      {/* Bottom row — hours */}
      <div className="px-5 py-3 flex flex-wrap items-end gap-3 border-t"
        style={{ borderColor: bottomBd }}>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium mb-1" style={{ color: labelC }}>
            Opening Time <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBd}`, color: inputC }} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium mb-1" style={{ color: labelC }}>
            Closing Time <span style={{ color: optionalC }}>(optional)</span>
          </label>
          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${inputBd}`, color: inputC }} />
        </div>
        <button onClick={handleSaveTimes} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }}>
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

  const { data: orders, loading: ordersLoading } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: inventory } = useCollection('inventory', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── Theme ─────────────────────────────────────────────────────────────────
  const { isLight } = useTheme();

  // ── Color tokens ──────────────────────────────────────────────────────────
  const text         = isLight ? '#111111' : '#ffffff';
  const muted        = isLight ? '#555555' : '#A3A3A3';
  const faint        = isLight ? '#666666' : '#555555';
  const cardBg       = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15,15,15,1)';
  const cardBd       = isLight ? 'rgba(0,0,0,0.09)'       : 'rgba(255,255,255,0.08)';
  const statLabelC   = isLight ? '#555555'                 : '#A3A3A3';
  const summaryBg    = isLight ? 'rgba(255,255,255,0.95)'  : 'rgba(12,12,12,0.96)';
  const summaryBd    = isLight ? 'rgba(201,162,39,0.25)'   : 'rgba(212,175,55,0.22)';
  const summaryHdrBg = isLight
    ? 'linear-gradient(135deg,rgba(212,175,55,0.06),rgba(212,175,55,0.01))'
    : 'linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.02))';
  const summaryHdrBd = isLight ? 'rgba(0,0,0,0.07)'        : 'rgba(212,175,55,0.12)';
  const summaryDateC = isLight ? '#666666'                  : '#555555';
  const summarySubC  = isLight ? '#555555'                  : '#555555';
  const summaryBoxBg = isLight ? 'rgba(0,0,0,0.03)'         : 'rgba(255,255,255,0.03)';
  const summaryItmC  = isLight ? '#111111'                  : '#ffffff';
  const summaryMetC  = isLight ? '#555555'                  : '#A3A3A3';
  const recentBg     = isLight ? 'rgba(255,255,255,0.95)'   : 'rgba(10,10,10,0.96)';
  const recentBd     = isLight ? 'rgba(0,0,0,0.09)'         : 'rgba(255,255,255,0.07)';
  const recentHdrBg  = isLight
    ? 'linear-gradient(135deg,rgba(16,185,129,0.04),transparent)'
    : 'linear-gradient(135deg,rgba(16,185,129,0.05),transparent)';
  const recentHdrBd  = isLight ? 'rgba(0,0,0,0.07)'         : 'rgba(255,255,255,0.06)';
  const recentFtrBd  = isLight ? 'rgba(0,0,0,0.07)'         : 'rgba(255,255,255,0.05)';
  const recentFtrC   = isLight ? '#666666'                  : '#555555';
  const emptyIconC   = isLight ? '#AAAAAA'                  : 'rgba(163,163,163,0.3)';
  const emptyTxtC    = isLight ? '#666666'                  : '#A3A3A3';
  const emptySubC    = isLight ? '#888888'                  : '#555555';
  const skeletonBg   = isLight ? 'rgba(0,0,0,0.05)'         : 'rgba(255,255,255,0.03)';
  // ─────────────────────────────────────────────────────────────────────────

  const liveOrders = useMemo(() => orders?.filter(o => !o.isDeleted) ?? [], [orders]);

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
    } catch (_) {}
  };

  const seenRef = useRef(new Set());
  const [newIds, setNewIds] = useState(new Set());

  useEffect(() => {
    if (!liveOrders?.length) return;
    const incoming = new Set(liveOrders.map(o => o.id));
    if (seenRef.current.size === 0) { seenRef.current = incoming; return; }
    const fresh = new Set();
    incoming.forEach(id => { if (!seenRef.current.has(id)) fresh.add(id); });
    if (fresh.size > 0) {
      playNotify();
      setNewIds(prev => new Set([...prev, ...fresh]));
      setTimeout(() => {
        setNewIds(prev => { const next = new Set(prev); fresh.forEach(id => next.delete(id)); return next; });
      }, 4500);
    }
    seenRef.current = incoming;
  }, [liveOrders]);

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

  const stats = useMemo(() => {
    if (!liveOrders.length) return { todayRevenue: 0, ordersToday: 0, avgOrderValue: 0, activeOrders: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = liveOrders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
    const paid = todayOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'paid');
    const todayRevenue = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
    return { todayRevenue, ordersToday: todayOrders.length, avgOrderValue: paid.length > 0 ? todayRevenue / paid.length : 0, activeOrders: liveOrders.filter(o => o.orderStatus !== 'completed').length };
  }, [liveOrders]);

  const lowStockItems = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter(i => typeof i.quantity === 'number' && typeof i.lowStockThreshold === 'number' && i.quantity <= i.lowStockThreshold);
  }, [inventory]);

  const statCards = [
    { label: "Today's Revenue", value: `${CUR}${stats.todayRevenue.toFixed(2)}`, icon: IndianRupee, color: 'text-[#10B981]', accent: '#10B981' },
    { label: 'Orders Today',    value: stats.ordersToday,                         icon: ShoppingBag, color: 'text-[#D4AF37]', accent: '#D4AF37' },
    { label: 'Avg Order Value', value: `${CUR}${stats.avgOrderValue.toFixed(2)}`,  icon: TrendingUp,  color: 'text-[#3B82F6]', accent: '#3B82F6' },
    { label: 'Active Orders',   value: stats.activeOrders,                        icon: Clock,       color: 'text-[#F59E0B]', accent: '#F59E0B' },
  ];

  const [reportSending, setReportSending] = useState(false);
  const [showSummary,   setShowSummary  ] = useState(false);

  useEffect(() => {
    if (!cafeId || !cafe?.whatsappNumber) return;
    const stop = startDailyReportScheduler(cafeId, cafe.whatsappNumber, () => toast.success('📊 Daily report sent to WhatsApp!'));
    return () => stop();
  }, [cafeId, cafe?.whatsappNumber]);

  const handleSendReport = async () => {
    if (!cafe?.whatsappNumber) { toast.error('Add your WhatsApp number in Settings first'); return; }
    setReportSending(true);
    try { await generateAndSendReport(cafeId, cafe.whatsappNumber); toast.success('📊 Report opened in WhatsApp!'); }
    catch (err) { toast.error('Failed to generate report'); }
    finally { setReportSending(false); }
  };

  return (
    <div className="space-y-6">

      {/* Store Status Card */}
      {cafeId && <StoreStatusCard cafe={cafe} cafeId={cafeId} isLight={isLight} />}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              whileHover={{ y: -3, boxShadow: `0 8px 32px ${stat.accent}18` }}
              transition={{ duration: 0.2 }}
              data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="relative overflow-hidden rounded-xl p-6 cursor-default"
              style={{
                background:  isLight
                  ? `linear-gradient(135deg,${stat.accent}0d 0%,${cardBg} 60%)`
                  : `linear-gradient(135deg,${stat.accent}0a 0%,rgba(15,15,15,1) 60%)`,
                borderLeft:  `3px solid ${stat.accent}55`,
                border:      `1px solid ${cardBd}`,
                borderLeftWidth: '3px',
                boxShadow:   `0 2px 16px ${stat.accent}0a`,
              }}
            >
              <div className="absolute top-3 right-3 w-14 h-14 rounded-full blur-2xl pointer-events-none"
                style={{ background: `${stat.accent}18` }} />
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-widest font-medium" style={{ color: statLabelC }}>{stat.label}</p>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.accent}18`, boxShadow: `0 0 0 1px ${stat.accent}30` }}>
                  <Icon className={`w-4.5 h-4.5 ${stat.color}`} style={{ width: 18, height: 18 }} />
                </div>
              </div>
              <p className="text-3xl font-black tracking-tight" style={{ color: text }}>{stat.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Business Summary */}
      {liveOrders.length > 0 && (() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayOrders = liveOrders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
        const paid    = todayOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'paid');
        const pending = todayOrders.filter(o => o.paymentStatus !== 'paid' && o.status !== 'paid');
        const totalRev = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
        const totalGST = paid.reduce((s, o) => s + (o.gstAmount || o.taxAmount || 0), 0);
        const totalSC  = paid.reduce((s, o) => s + (o.serviceChargeAmount || 0), 0);
        const itemMap = {};
        paid.forEach(o => (o.items || []).forEach(i => { itemMap[i.name] = (itemMap[i.name] || 0) + (i.quantity || 1); }));
        const topItems = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const catMap = {};
        paid.forEach(o => (o.items || []).forEach(i => { const cat = i.category || 'Other'; catMap[cat] = (catMap[cat] || 0) + (i.price || 0) * (i.quantity || 1); }));
        const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden"
            style={{ background: summaryBg, border: `1px solid ${summaryBd}`, boxShadow: '0 4px 32px rgba(212,175,55,0.06)' }}>
            <div onClick={() => setShowSummary(prev => !prev)}
              className="cursor-pointer flex items-center justify-between px-5 py-4 border-b transition-colors"
              style={{ background: summaryHdrBg, borderColor: summaryHdrBd }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(212,175,55,0.18)', boxShadow: '0 0 0 1px rgba(212,175,55,0.32)' }}>
                  <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="font-bold text-sm" style={{ fontFamily: 'Playfair Display, serif', color: text }}>
                    Today's Business Summary
                  </h3>
                  <p className="text-xs" style={{ color: summaryDateC }}>
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#D4AF37] text-xs font-semibold px-2.5 py-1 rounded-full bg-[#D4AF37]/12 border border-[#D4AF37]/25">
                  {todayOrders.length} orders today
                </span>
                <motion.span animate={{ rotate: showSummary ? 180 : 0 }} transition={{ duration: 0.25 }}
                  className="text-sm opacity-60 select-none inline-block" style={{ color: muted }}>▼</motion.span>
              </div>
            </div>

            {showSummary && (
              <>
                <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Revenue',        value: `${CUR}${totalRev.toFixed(2)}`, sub: `${paid.length} paid orders`,    color: '#10B981' },
                    { label: 'Pending',        value: pending.length,                  sub: 'awaiting payment',              color: '#F59E0B' },
                    { label: 'GST Collected',  value: `${CUR}${totalGST.toFixed(2)}`, sub: 'incl. in revenue',              color: '#8B5CF6' },
                    { label: 'Service Charge', value: `${CUR}${totalSC.toFixed(2)}`,  sub: 'collected today',               color: '#3B82F6' },
                  ].map(s => (
                    <div key={s.label} className="space-y-1">
                      <p className="text-xs uppercase tracking-wide" style={{ color: summarySubC }}>{s.label}</p>
                      <p className="font-black text-xl" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs" style={{ color: summarySubC }}>{s.sub}</p>
                    </div>
                  ))}
                </div>

                {(topItems.length > 0 || topCats.length > 0) && (
                  <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {topItems.length > 0 && (
                      <div className="rounded-lg p-3" style={{ background: summaryBoxBg }}>
                        <p className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1" style={{ color: summaryMetC }}>
                          🏆 Top Selling Items
                        </p>
                        {topItems.map(([name, qty], i) => (
                          <div key={name} className="flex justify-between items-center py-1 text-xs"
                            style={{ borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'}` }}>
                            <span className="flex items-center gap-1.5" style={{ color: summaryItmC }}>
                              <span className="text-[#D4AF37] font-bold">{i + 1}.</span>{name}
                            </span>
                            <span style={{ color: summaryMetC }}>{qty} sold</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {topCats.length > 0 && (
                      <div className="rounded-lg p-3" style={{ background: summaryBoxBg }}>
                        <p className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1" style={{ color: summaryMetC }}>
                          📊 Category Revenue
                        </p>
                        {topCats.map(([cat, rev], i) => (
                          <div key={cat} className="flex justify-between items-center py-1 text-xs"
                            style={{ borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'}` }}>
                            <span className="flex items-center gap-1.5" style={{ color: summaryItmC }}>
                              <span className="text-[#D4AF37] font-bold">{i + 1}.</span>{cat}
                            </span>
                            <span className="font-semibold" style={{ color: '#10B981' }}>{CUR}{rev.toFixed(2)}</span>
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

      {/* Low Stock Alert — unchanged */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="relative overflow-hidden rounded-xl p-5"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.28)', borderLeft: '3px solid rgba(239,68,68,0.70)', boxShadow: '0 2px 20px rgba(239,68,68,0.08)' }}
            data-testid="overview-low-stock">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h4 className="text-red-400 font-semibold text-sm">
                  ⚠ Low Stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking
                </h4>
              </div>
              <span className="text-xs hidden sm:block" style={{ color: muted }}>Dashboard → Inventory</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.slice(0, 8).map(item => (
                <span key={item.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/12 border border-red-500/20 rounded text-red-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                  {item.itemName} · {item.quantity} {item.unit}
                </span>
              ))}
              {lowStockItems.length > 8 && <span className="text-red-400/60 text-xs self-center">+{lowStockItems.length - 8} more</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Orders */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: recentBg, border: `1px solid ${recentBd}`, boxShadow: '0 4px 32px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: recentHdrBd, background: recentHdrBg }}>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold" style={{ fontFamily: 'Playfair Display, serif', color: text }}>
              Recent Orders
            </h3>
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[#10B981]/10 border border-[#10B981]/20 rounded-full text-[#10B981] text-[10px] font-semibold uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />LIVE
            </span>
          </div>
          <div className="flex items-center gap-3">
            <AnimatePresence>
              {newIds.size > 0 && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#D4AF37]/15 border border-[#D4AF37]/30 rounded-full text-[#D4AF37] text-xs font-bold">
                  <Zap className="w-3 h-3" />{newIds.size} new
                </motion.span>
              )}
            </AnimatePresence>
            <span className="text-xs" style={{ color: recentFtrC }}>
              Last {recentOrders.length} of {liveOrders.length}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {ordersLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-sm animate-pulse"
                  style={{ background: skeletonBg, animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3" style={{ color: emptyIconC }} />
              <p className="text-sm" style={{ color: emptyTxtC }}>No orders yet</p>
              <p className="text-xs mt-1" style={{ color: emptySubC }}>New orders will appear here instantly</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {recentOrders.map(order => (
                <RecentOrderCard key={order.id} order={order} isNew={newIds.has(order.id)} CUR={CUR} isLight={isLight} />
              ))}
            </AnimatePresence>
          )}
        </div>

        {!ordersLoading && recentOrders.length > 0 && (
          <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: recentFtrBd }}>
            <p className="text-xs flex items-center gap-1.5" style={{ color: recentFtrC }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Updates instantly when new orders arrive
            </p>
            <p className="text-xs" style={{ color: recentFtrC }}>Showing newest {recentOrders.length}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Overview;
