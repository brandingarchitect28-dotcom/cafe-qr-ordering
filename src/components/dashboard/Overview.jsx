/**
 * Overview.jsx
 *
 * Dashboard Overview — real-time stats + real-time recent orders.
 * Visual theme unified with OrdersManagement (DM Sans + Playfair Display,
 * #C9A227 gold, #120f00 warm-dark backgrounds, omf-* CSS classes).
 *
 * ALL DATA / LOGIC / FIRESTORE / WHATSAPP / STORE TOGGLE: 100% UNCHANGED.
 * Only className strings, inline style values, and the CSS injection block
 * have been updated to match the OrdersManagement aesthetic.
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

// ─── Inject shared omf CSS (same pattern as OrdersManagement) ────────────────
if (typeof document !== 'undefined' && !document.getElementById('omf-overview-css')) {
  const el = document.createElement('style');
  el.id = 'omf-overview-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .omf-ov { font-family: 'DM Sans', system-ui, sans-serif; }
    .omf-ov-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    /* Stat card */
    .omf-ov-stat {
      background: #120f00;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      transition: border-color 200ms, box-shadow 200ms, transform 180ms;
      cursor: default;
      overflow: hidden;
      position: relative;
    }
    .omf-ov-stat:hover {
      border-color: rgba(201,162,39,0.25);
      transform: translateY(-2px);
    }

    /* Section card */
    .omf-ov-card {
      background: #120f00;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
    }

    /* Section header */
    .omf-ov-card-header {
      background: rgba(201,162,39,0.04);
      border-bottom: 1px solid rgba(201,162,39,0.12);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Recent order row */
    .omf-ov-order-row {
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.05);
      background: rgba(255,255,255,0.02);
      transition: border-color 160ms, background 160ms;
      overflow: hidden;
      position: relative;
    }
    .omf-ov-order-row:hover {
      border-color: rgba(201,162,39,0.2);
      background: rgba(201,162,39,0.03);
    }

    /* Badge */
    .omf-ov-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Section label */
    .omf-ov-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase;
      letter-spacing: 0.08em; color: #C9A227;
      display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Pill chip */
    .omf-ov-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 12px; border-radius: 20px; font-size: 11px;
      font-weight: 800; border: 1.5px solid rgba(201,162,39,0.25);
      background: rgba(201,162,39,0.1); color: #C9A227;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Button */
    .omf-ov-btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 8px 14px; border-radius: 10px;
      border: 1.5px solid transparent; cursor: pointer;
      transition: all 180ms; white-space: nowrap;
    }
    .omf-ov-btn:hover  { transform: translateY(-1px); filter: brightness(1.1); }
    .omf-ov-btn:active { transform: scale(0.96); }
    .omf-ov-btn-gold {
      background: linear-gradient(135deg, #C9A227, #8B6914);
      color: #fff; box-shadow: 0 3px 14px rgba(201,162,39,0.32);
    }
    .omf-ov-btn-ghost {
      background: rgba(255,255,255,0.05); color: #7a6a3a;
      border-color: rgba(255,255,255,0.08);
    }
    .omf-ov-btn-ghost:hover { background: rgba(255,255,255,0.09); color: #fff; }

    /* Inputs (store hours) */
    .omf-ov-input {
      background: #1a1500; border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 10px; color: #fdf8e1; padding: 8px 12px;
      font-size: 13px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .omf-ov-input:focus {
      border-color: rgba(201,162,39,0.55);
      box-shadow: 0 0 0 3px rgba(201,162,39,0.1);
    }
    .omf-ov-input[type="time"] { color-scheme: dark; }

    /* Scrollbar */
    .omf-ov-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .omf-ov-scroll::-webkit-scrollbar-track { background: transparent; }
    .omf-ov-scroll::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.25); border-radius: 4px; }

    /* Fade-in */
    @keyframes omfOvIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .omf-ov-in { animation: omfOvIn 280ms ease forwards; }

    /* Store card open */
    .omf-ov-store-open {
      background: linear-gradient(135deg, rgba(201,162,39,0.07), #120f00) !important;
      border-color: rgba(201,162,39,0.28) !important;
    }
    /* Store card closed */
    .omf-ov-store-closed {
      background: linear-gradient(135deg, rgba(180,50,50,0.08), #120f00) !important;
      border-color: rgba(180,50,50,0.22) !important;
    }

    /* Low stock alert */
    .omf-ov-alert {
      background: rgba(180,50,50,0.07);
      border: 1.5px solid rgba(180,50,50,0.25);
      border-left: 3px solid rgba(180,50,50,0.65);
      border-radius: 14px;
      padding: 16px 20px;
    }

    /* Summary card */
    .omf-ov-summary {
      background: #120f00;
      border: 1.5px solid rgba(201,162,39,0.2);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 28px rgba(201,162,39,0.06);
    }
    .omf-ov-summary-header {
      background: linear-gradient(135deg, rgba(201,162,39,0.1), rgba(201,162,39,0.02));
      border-bottom: 1px solid rgba(201,162,39,0.12);
      padding: 16px 20px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: space-between;
      transition: background 180ms;
    }
    .omf-ov-summary-header:hover { background: linear-gradient(135deg, rgba(201,162,39,0.14), rgba(201,162,39,0.04)); }

    /* New-order flash top bar */
    @keyframes omfOvPulse { 0%,100%{ opacity:1; } 50%{ opacity:0.5; } }
    .omf-ov-new-pulse { animation: omfOvPulse 0.8s infinite; }
  `;
  document.head.appendChild(el);
}

// ─── helpers (identical to original) ─────────────────────────────────────────

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
  completed: { dot: '#4ade80', text: '#4ade80',  label: 'Completed' },
  ready:     { dot: '#34d399', text: '#34d399',  label: 'Ready'     },
  preparing: { dot: '#fbbf24', text: '#fbbf24',  label: 'Preparing' },
  cancelled: { dot: '#f87171', text: '#f87171',  label: 'Cancelled' },
  new:       { dot: '#60a5fa', text: '#60a5fa',  label: 'New'       },
};
const getStatus = (s) => STATUS[s] || STATUS.new;

const SOURCE_BADGE = {
  zomato: { label: 'ZOMATO', bg: 'rgba(220,50,50,0.15)',   color: '#f87171', bd: 'rgba(220,50,50,0.25)'   },
  swiggy: { label: 'SWIGGY', bg: 'rgba(255,140,50,0.15)',  color: '#fb923c', bd: 'rgba(255,140,50,0.25)'  },
};

const PAYMENT_LABEL = {
  online:  { label: 'Online',  color: '#a78bfa' },
  prepaid: { label: 'UPI',     color: '#4ade80' },
  table:   { label: 'Table',   color: '#fbbf24' },
  counter: { label: 'Counter', color: '#7a6a3a' },
};
const getPayment = (m) => PAYMENT_LABEL[m] || PAYMENT_LABEL.counter;

// ─── RecentOrderCard ──────────────────────────────────────────────────────────

const RecentOrderCard = React.memo(({ order, isNew, CUR }) => {
  const [lit, setLit] = useState(isNew);
  const st      = getStatus(order.orderStatus);
  const srcKey  = typeof order.source === 'string' ? order.source.toLowerCase() : '';
  const src     = order.source && order.source !== 'qr' && order.source !== 'direct'
                    ? SOURCE_BADGE[srcKey] || {
                        label: typeof order.source === 'string' ? order.source.toUpperCase() : String(order.source),
                        bg: 'rgba(120,60,200,0.15)', color: '#c084fc', bd: 'rgba(120,60,200,0.25)',
                      }
                    : null;
  const pay       = getPayment(order.paymentMode);
  const totalItems = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) ?? 0;
  const cur       = order.currencySymbol || CUR;

  useEffect(() => {
    if (!isNew) return;
    const id = setTimeout(() => setLit(false), 4000);
    return () => clearTimeout(id);
  }, [isNew]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1,  y: 0,   scale: 1    }}
      exit={{    opacity: 0,  y: 8,   scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="omf-ov-order-row"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: lit ? '#C9A227' : (st.dot || 'rgba(255,255,255,0.1)'),
        background:  lit ? 'rgba(201,162,39,0.06)' : undefined,
        borderColor: lit ? 'rgba(201,162,39,0.35)'  : undefined,
        boxShadow:   lit ? '0 2px 20px rgba(201,162,39,0.1)' : undefined,
      }}
      data-testid={`overview-order-${order.id}`}
    >
      {/* Gold top flash bar */}
      <AnimatePresence>
        {lit && (
          <motion.div
            initial={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0, transition: { duration: 0.5 } }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#C9A227', transformOrigin: 'left' }}
          />
        )}
      </AnimatePresence>

      <div className="omf-ov" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>

        {/* Order number + NEW badge */}
        <div style={{ width: 56, flexShrink: 0, textAlign: 'center' }}>
          <p className="omf-ov-title" style={{ fontSize: 15, fontWeight: 900, color: '#C9A227', lineHeight: 1 }}>
            {fmtOrderNum(order.orderNumber)}
          </p>
          <AnimatePresence>
            {lit && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="omf-ov-new-pulse"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 4,
                  padding: '2px 7px', background: '#C9A227', color: '#120f00',
                  fontSize: 9, fontWeight: 900, borderRadius: 20,
                }}
              >
                <Zap style={{ width: 8, height: 8 }} />
                NEW
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

        {/* Customer + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#fdf8e1', fontWeight: 700, fontSize: 13 }}>
              {order.customerName || 'Guest'}
            </span>
            {src && (
              <span className="omf-ov-badge" style={{ background: src.bg, color: src.color, borderColor: src.bd, fontSize: 9 }}>
                {src.label}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#7a6a3a', fontSize: 11 }}>
              {order.orderType === 'dine-in' ? (
                <><MapPin style={{ width: 11, height: 11 }} />{order.tableNumber ? `T${order.tableNumber}` : 'Dine-in'}</>
              ) : order.orderType === 'delivery' ? (
                <><ExternalLink style={{ width: 11, height: 11 }} />Delivery</>
              ) : (
                <><Package style={{ width: 11, height: 11 }} />Takeaway</>
              )}
            </span>
            <span style={{ color: '#7a6a3a', fontSize: 11 }}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}
            </span>
            <span style={{ color: pay.color, fontSize: 11, fontWeight: 700 }}>{pay.label}</span>
            <span style={{ color: '#3d341a', fontSize: 11, marginLeft: 'auto' }}>{fmtTime(order.createdAt)}</span>
          </div>

          <p style={{ color: '#3d341a', fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.items?.slice(0, 3).map(i => `${i.name} ×${i.quantity}`).join(' · ')}
            {(order.items?.length ?? 0) > 3 && ` +${order.items.length - 3}`}
          </p>
        </div>

        {/* Amount + status */}
        <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 8 }}>
          <p style={{ color: '#C9A227', fontWeight: 900, fontSize: 14 }}>
            {cur}{(order.totalAmount || order.total || 0).toFixed(0)}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: st.text, fontWeight: 700, textTransform: 'capitalize' }}>{st.label}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
RecentOrderCard.displayName = 'RecentOrderCard';

// ─── StoreStatusCard ──────────────────────────────────────────────────────────
// Logic 100% identical to original. Only visual classes updated.

const StoreStatusCard = ({ cafe, cafeId }) => {
  const isOpen      = cafe?.storeOpen !== false;
  const [openTime,  setOpenTime ] = useState(cafe?.openingTime  || '');
  const [closeTime, setCloseTime] = useState(cafe?.closingTime  || '');
  const [saving,    setSaving   ] = useState(false);

  useEffect(() => { setOpenTime(cafe?.openingTime  || ''); }, [cafe?.openingTime ]);
  useEffect(() => { setCloseTime(cafe?.closingTime || ''); }, [cafe?.closingTime]);

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

  const accentColor = isOpen ? '#C9A227' : '#f87171';
  const accentBg    = isOpen ? 'rgba(201,162,39,0.12)' : 'rgba(180,50,50,0.12)';
  const accentBd    = isOpen ? 'rgba(201,162,39,0.25)' : 'rgba(180,50,50,0.25)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`omf-ov omf-ov-card ${isOpen ? 'omf-ov-store-open' : 'omf-ov-store-closed'}`}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>

        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentBg, border: `1.5px solid ${accentBd}`, flexShrink: 0 }}>
            <Store style={{ width: 18, height: 18, color: accentColor }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: accentColor,
                boxShadow: `0 0 6px ${accentColor}`,
                animation: isOpen ? 'pulse 2s infinite' : 'none',
                flexShrink: 0,
              }} />
              <p className="omf-ov-title" style={{ color: '#fdf8e1', fontWeight: 700, fontSize: 15 }}>
                Store is{' '}
                <span style={{ color: accentColor }}>{isOpen ? 'OPEN' : 'CLOSED'}</span>
              </p>
            </div>
            <p style={{ color: '#7a6a3a', fontSize: 11, marginTop: 2 }}>
              {isOpen
                ? (openTime ? `Open until ${closeTime || '—'}` : 'Accepting orders')
                : (openTime ? `Will open at ${openTime}` : 'Not accepting orders')}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={saving}
          title={isOpen ? 'Close store' : 'Open store'}
          style={{
            position: 'relative', flexShrink: 0, width: 52, height: 28, borderRadius: 14,
            background: isOpen ? '#C9A227' : 'rgba(255,255,255,0.08)',
            border: isOpen ? 'none' : '1.5px solid rgba(255,255,255,0.12)',
            cursor: 'pointer', transition: 'background 250ms', opacity: saving ? 0.6 : 1,
          }}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{
              position: 'absolute', top: 2, width: 24, height: 24,
              borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 6px rgba(0,0,0,0.35)',
              left: isOpen ? 'calc(100% - 26px)' : 2,
            }}
          />
        </button>
      </div>

      {/* Hours row */}
      <div style={{ padding: '12px 20px 16px', borderTop: `1px solid ${accentBd}`, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#7a6a3a', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Opening Time <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="omf-ov-input" />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#7a6a3a', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Closing Time <span style={{ color: '#3d341a' }}>(optional)</span>
          </label>
          <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="omf-ov-input" />
        </div>
        <button onClick={handleSaveTimes} disabled={saving} className="omf-ov-btn omf-ov-btn-ghost" style={{ flexShrink: 0, borderColor: 'rgba(201,162,39,0.25)', color: '#C9A227', background: 'rgba(201,162,39,0.1)' }}>
          {saving ? <RefreshCw style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : null}
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

  // ── isDeleted filter — unchanged ───────────────────────────────────────────
  const liveOrders = useMemo(
    () => orders?.filter(o => !o.isDeleted) ?? [],
    [orders]
  );

  // ── Sound notification — unchanged ─────────────────────────────────────────
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
    } catch (_) { /* silent */ }
  };

  // ── New-order detection — unchanged ───────────────────────────────────────
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
        setNewIds(prev => {
          const next = new Set(prev);
          fresh.forEach(id => next.delete(id));
          return next;
        });
      }, 4500);
    }
    seenRef.current = incoming;
  }, [liveOrders]);

  // ── Recent orders — unchanged ──────────────────────────────────────────────
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

  // ── Stats — unchanged ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!liveOrders.length) return { todayRevenue: 0, ordersToday: 0, avgOrderValue: 0, activeOrders: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = liveOrders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
    const paid = todayOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'paid');
    const todayRevenue = paid.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);
    return {
      todayRevenue,
      ordersToday:   todayOrders.length,
      avgOrderValue: paid.length > 0 ? todayRevenue / paid.length : 0,
      activeOrders:  liveOrders.filter(o => o.orderStatus !== 'completed').length,
    };
  }, [liveOrders]);

  // ── Low stock — unchanged ──────────────────────────────────────────────────
  const lowStockItems = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter(i =>
      typeof i.quantity === 'number' &&
      typeof i.lowStockThreshold === 'number' &&
      i.quantity <= i.lowStockThreshold
    );
  }, [inventory]);

  // Stat card definitions — accent colors kept same as original
  const statCards = [
    { label: "Today's Revenue", value: `${CUR}${stats.todayRevenue.toFixed(2)}`,  icon: IndianRupee, accent: '#10B981', testId: "today's-revenue" },
    { label: 'Orders Today',    value: stats.ordersToday,                          icon: ShoppingBag, accent: '#C9A227', testId: 'orders-today'    },
    { label: 'Avg Order Value', value: `${CUR}${stats.avgOrderValue.toFixed(2)}`,  icon: TrendingUp,  accent: '#3B82F6', testId: 'avg-order-value' },
    { label: 'Active Orders',   value: stats.activeOrders,                         icon: Clock,       accent: '#F59E0B', testId: 'active-orders'   },
  ];

  // ── WhatsApp Daily Report — unchanged ────────────────────────────────────
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
    <div className="omf-ov space-y-5">

      {/* ── Store Status Card ─────────────────────────────────────────────── */}
      {cafeId && <StoreStatusCard cafe={cafe} cafeId={cafeId} />}

      {/* ── 4 Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, si) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className="omf-ov-stat omf-ov-in"
              style={{
                animationDelay: `${si * 60}ms`, animationFillMode: 'both',
                borderLeft: `3px solid ${stat.accent}55`,
                background: `linear-gradient(135deg, ${stat.accent}08 0%, #120f00 60%)`,
                boxShadow:  `0 2px 16px ${stat.accent}0a`,
              }}
              data-testid={`stat-${stat.testId}`}
            >
              {/* Glow blob */}
              <div style={{ position: 'absolute', top: 10, right: 10, width: 52, height: 52, borderRadius: '50%', background: `${stat.accent}14`, filter: 'blur(20px)', pointerEvents: 'none' }} />

              <div style={{ padding: '20px 20px 18px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <p style={{ color: '#7a6a3a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</p>
                  <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${stat.accent}18`, boxShadow: `0 0 0 1.5px ${stat.accent}30`, flexShrink: 0 }}>
                    <Icon style={{ width: 16, height: 16, color: stat.accent }} />
                  </div>
                </div>
                <p className="omf-ov-title" style={{ fontSize: 28, fontWeight: 900, color: '#fdf8e1', letterSpacing: '-0.01em' }}>{stat.value}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Today's Business Summary ───────────────────────────────────────── */}
      {liveOrders.length > 0 && (() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayOrders = liveOrders.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= today);
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
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="omf-ov-summary">

            {/* Header */}
            <div className="omf-ov-summary-header" onClick={() => setShowSummary(prev => !prev)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(201,162,39,0.15)', boxShadow: '0 0 0 1.5px rgba(201,162,39,0.3)', flexShrink: 0 }}>
                  <TrendingUp style={{ width: 16, height: 16, color: '#C9A227' }} />
                </div>
                <div>
                  <h3 className="omf-ov-title" style={{ color: '#fdf8e1', fontWeight: 700, fontSize: 14 }}>
                    Today's Business Summary
                  </h3>
                  <p style={{ color: '#7a6a3a', fontSize: 11, marginTop: 1 }}>
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="omf-ov-chip">{todayOrders.length} orders today</span>
                <motion.span
                  animate={{ rotate: showSummary ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ color: '#7a6a3a', fontSize: 12, display: 'inline-block', userSelect: 'none' }}
                >▼</motion.span>
              </div>
            </div>

            {showSummary && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16, padding: '20px 20px 16px' }}>
                  {[
                    { label: 'Revenue',        value: `${CUR}${totalRev.toFixed(2)}`, sub: `${paid.length} paid orders`,    color: '#4ade80' },
                    { label: 'Pending',         value: pending.length,                  sub: 'awaiting payment',              color: '#fbbf24' },
                    { label: 'GST Collected',   value: `${CUR}${totalGST.toFixed(2)}`, sub: 'incl. in revenue',              color: '#a78bfa' },
                    { label: 'Service Charge',  value: `${CUR}${totalSC.toFixed(2)}`,  sub: 'collected today',               color: '#60a5fa' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <p style={{ color: '#7a6a3a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{s.label}</p>
                      <p className="omf-ov-title" style={{ color: s.color, fontWeight: 900, fontSize: 20 }}>{s.value}</p>
                      <p style={{ color: '#3d341a', fontSize: 10, marginTop: 3 }}>{s.sub}</p>
                    </div>
                  ))}
                </div>

                {(topItems.length > 0 || topCats.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '0 20px 20px' }}>
                    {topItems.length > 0 && (
                      <div style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p className="omf-ov-sec" style={{ marginBottom: 10 }}>🏆 Top Selling Items</p>
                        {topItems.map(([name, qty], i) => (
                          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                            <span style={{ color: '#fdf8e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#C9A227', fontWeight: 900 }}>{i + 1}.</span>{name}
                            </span>
                            <span style={{ color: '#7a6a3a' }}>{qty} sold</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {topCats.length > 0 && (
                      <div style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p className="omf-ov-sec" style={{ marginBottom: 10 }}>📊 Category Revenue</p>
                        {topCats.map(([cat, rev], i) => (
                          <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                            <span style={{ color: '#fdf8e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#C9A227', fontWeight: 900 }}>{i + 1}.</span>{cat}
                            </span>
                            <span style={{ color: '#4ade80', fontWeight: 700 }}>{CUR}{rev.toFixed(2)}</span>
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

      {/* ── Low Stock Alert ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1,  y: 0  }}
            exit={{    opacity: 0,  y: -8  }}
            className="omf-ov-alert"
            data-testid="overview-low-stock"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle style={{ width: 15, height: 15, color: '#f87171' }} />
                <h4 style={{ color: '#f87171', fontWeight: 800, fontSize: 13 }}>
                  ⚠ Low Stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking
                </h4>
              </div>
              <span style={{ color: '#7a6a3a', fontSize: 11 }} className="hidden sm:block">Dashboard → Inventory</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {lowStockItems.slice(0, 8).map(item => (
                <span key={item.id} className="omf-ov-badge" style={{ background: 'rgba(180,50,50,0.12)', color: '#f87171', borderColor: 'rgba(180,50,50,0.25)', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', animation: 'pulse 2s infinite', flexShrink: 0 }} />
                  {item.itemName} · {item.quantity} {item.unit}
                </span>
              ))}
              {lowStockItems.length > 8 && (
                <span style={{ color: 'rgba(248,113,113,0.55)', fontSize: 11, alignSelf: 'center' }}>+{lowStockItems.length - 8} more</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Recent Orders ──────────────────────────────────────────────────── */}
      <div className="omf-ov-card">
        {/* Card header */}
        <div className="omf-ov-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 className="omf-ov-title" style={{ color: '#fdf8e1', fontWeight: 700, fontSize: 18 }}>
              Recent Orders
            </h3>
            <span className="omf-ov-badge" style={{ background: 'rgba(201,162,39,0.12)', color: '#C9A227', borderColor: 'rgba(201,162,39,0.25)', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A227', animation: 'pulse 2s infinite' }} />
              Live
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AnimatePresence>
              {newIds.size > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1,  scale: 1   }}
                  exit={{    opacity: 0,  scale: 0.8  }}
                  className="omf-ov-badge"
                  style={{ background: 'rgba(201,162,39,0.15)', color: '#C9A227', borderColor: 'rgba(201,162,39,0.3)', gap: 5 }}
                >
                  <Zap style={{ width: 11, height: 11 }} />
                  {newIds.size} new
                </motion.span>
              )}
            </AnimatePresence>
            <span style={{ color: '#7a6a3a', fontSize: 11 }}>
              Last {recentOrders.length} of {liveOrders.length}
            </span>
          </div>
        </div>

        {/* Order list */}
        <div className="omf-ov-scroll" style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ordersLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height: 72, borderRadius: 10, background: 'rgba(255,255,255,0.025)', animation: `pulse 1.5s ease-in-out ${i * 80}ms infinite` }} />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🫙</div>
              <p className="omf-ov-title" style={{ color: '#fdf8e1', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>No orders yet!</p>
              <p style={{ color: '#7a6a3a', fontSize: 12 }}>New orders will appear here in real-time 🚀</p>
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
          <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(201,162,39,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ color: '#3d341a', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A227', animation: 'pulse 2s infinite' }} />
              Updates instantly when new orders arrive
            </p>
            <p style={{ color: '#3d341a', fontSize: 11 }}>Showing newest {recentOrders.length}</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default Overview;
