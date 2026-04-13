/**
 * OrderTracking.jsx
 * Route: /track/:orderId
 *
 * Customer-facing real-time order status page.
 * Uses onSnapshot on orders/{orderId} — SAME listener pattern as before.
 * DO NOT modify this listener — it is the existing real-time system.
 *
 * Added:
 * - Add-ons shown under each item
 * - comboItems shown under combo items
 * - Payment status badge
 * - "Send Invoice on WhatsApp" button (optional, no auto-redirect)
 * - Cancelled state
 * - Full bill breakdown
 * - Estimated time hint per status
 * - "Add More Items" button to append items to existing order
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc, updateDoc, collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coffee, ChefHat, CheckCircle, Clock, Package,
  Home, MessageSquare, RefreshCw, XCircle, Receipt,
  MapPin, Phone, User, CreditCard, Plus, X, ShoppingCart,
  Minus, Search,
} from 'lucide-react';
import { generateInvoiceMessage } from '../services/invoiceService';
import AddOnModal from '../components/AddOnModal';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUSES = [
  {
    id:    'new',
    label: 'Order Received',
    desc:  'Your order is confirmed and waiting to be prepared.',
    hint:  'Usually starts in 2–3 minutes.',
    icon:  Clock,
    color: '#3B82F6',
    emoji: '📋',
    step:  0,
  },
  {
    id:    'preparing',
    label: 'Preparing',
    desc:  'Our kitchen is preparing your order.',
    hint:  'Almost there — hang tight!',
    icon:  ChefHat,
    color: '#F59E0B',
    emoji: '👨‍🍳',
    step:  1,
  },
  {
    id:    'ready',
    label: 'Ready for Pickup',
    desc:  'Your order is ready! Please collect it.',
    hint:  'Head to the counter now.',
    icon:  Package,
    color: '#10B981',
    emoji: '✅',
    step:  2,
  },
  {
    id:    'completed',
    label: 'Completed',
    desc:  'Order delivered. Thank you for visiting!',
    hint:  'Hope you enjoyed it.',
    icon:  CheckCircle,
    color: '#D4AF37',
    emoji: '🎉',
    step:  3,
  },
];

const CANCELLED = {
  id:    'cancelled',
  label: 'Cancelled',
  desc:  'This order was cancelled.',
  hint:  'Please contact staff for assistance.',
  icon:  XCircle,
  color: '#EF4444',
  emoji: '❌',
  step:  -1,
};

const getStatusConfig = (status) =>
  status === 'cancelled'
    ? CANCELLED
    : STATUSES.find(s => s.id === status) || STATUSES[0];

// ─── Step progress bar ────────────────────────────────────────────────────────

const ProgressBar = ({ status }) => {
  const currentStep = getStatusConfig(status)?.step ?? 0;
  if (status === 'cancelled') return null;

  return (
    <div className="px-6 pt-6 pb-2">
      <div className="flex items-center">
        {STATUSES.map((s, i) => {
          const done   = i <= currentStep;
          const active = i === currentStep;
          const Icon   = s.icon;
          return (
            <React.Fragment key={s.id}>
              {/* Step node */}
              <div className="flex flex-col items-center flex-shrink-0">
                <motion.div
                  animate={active
                    ? { scale: [1, 1.15, 1], boxShadow: [`0 0 0px ${s.color}00`, `0 0 16px ${s.color}70`, `0 0 0px ${s.color}00`] }
                    : {}}
                  transition={{ duration: 1.6, repeat: Infinity }}
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500"
                  style={{
                    background:   done ? s.color : 'rgba(255,255,255,0.04)',
                    borderColor:  done ? s.color : 'rgba(255,255,255,0.10)',
                  }}
                >
                  <Icon className="w-4 h-4" style={{ color: done ? '#000' : '#444' }} />
                </motion.div>
                <p className="text-xs mt-1.5 text-center leading-tight"
                  style={{
                    color:      done ? s.color : '#444',
                    fontWeight: active ? 700 : 400,
                    maxWidth:   52,
                  }}>
                  {s.label.split(' ')[0]}
                </p>
              </div>
              {/* Connector */}
              {i < STATUSES.length - 1 && (
                <motion.div
                  className="flex-1 h-0.5 mx-1 mb-5 transition-all duration-700"
                  style={{ background: i < currentStep ? s.color : 'rgba(255,255,255,0.07)' }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ─── Payment badge ────────────────────────────────────────────────────────────

const PaymentBadge = ({ status }) => {
  const map = {
    paid:    { label: 'Paid',    color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    pending: { label: 'Pending', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    failed:  { label: 'Failed',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  };
  const cfg = map[status] || map.pending;
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label === 'Paid' ? '✅' : cfg.label === 'Failed' ? '❌' : '⏳'} {cfg.label}
    </span>
  );
};

// ─── Add More Items Modal ─────────────────────────────────────────────────────

// FIX — ISSUE 1: AddOnModal used to be rendered INSIDE this component which has
// z-[70]. Because a fixed element inside a z-indexed stacking context resolves
// its own z relative to that context, AddOnModal's z-[60] was BELOW the z-[70]
// backdrop, making it invisible and unresponsive to taps.
//
// Fix: addonModal state lives in the parent (OrderTracking). This modal accepts:
//   setAddonModal   — parent setter; called when an addon item is tapped
//   directAddRef    — a React ref the parent provides; we store directAddToNewCart
//                     in it so the parent's AddOnModal onConfirm can call it
// AddOnModal is rendered in OrderTracking, outside any stacking context.
// All other logic in this component is UNCHANGED.
const AddMoreItemsModal = ({ order, onClose, primary, setAddonModal, directAddRef }) => {
  const CUR = order?.currencySymbol || '₹';
  const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

  const [menuItems,   setMenuItems  ] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [newCart,     setNewCart    ] = useState([]);
  // addonModal state removed — now lives in OrderTracking (see fix comment above)
  const [saving,      setSaving     ] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load menu items for this cafe
  useEffect(() => {
    if (!order?.cafeId) return;
    const q = query(
      collection(db, 'menuItems'),
      where('cafeId', '==', order.cafeId),
      where('available', '==', true)
    );
    const unsub = onSnapshot(q, snap => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingMenu(false);
    }, () => setLoadingMenu(false));
    return () => unsub();
  }, [order?.cafeId]);

  const filteredItems = menuItems.filter(item =>
    !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const newCartTotal = newCart.reduce((s, i) => s + i.price * i.quantity, 0);

  const directAddToNewCart = useCallback((cartEntry) => {
    setNewCart(prev => {
      if (cartEntry.addons?.length > 0) return [...prev, cartEntry];
      if (cartEntry.selectedSize) {
        const ex = prev.find(i => i.id === cartEntry.id && i.selectedSize === cartEntry.selectedSize);
        if (ex) return prev.map(i =>
          i.id === cartEntry.id && i.selectedSize === cartEntry.selectedSize
            ? { ...i, quantity: i.quantity + 1 } : i
        );
        return [...prev, cartEntry];
      }
      const ex = prev.find(i => i.id === cartEntry.id && !i.addons?.length && !i.selectedSize);
      if (ex) return prev.map(i =>
        i.id === cartEntry.id && !i.addons?.length && !i.selectedSize
          ? { ...i, quantity: i.quantity + 1 } : i
      );
      return [...prev, cartEntry];
    });
  }, []);

  // FIX — expose directAddToNewCart to parent via ref so the root-level
  // AddOnModal onConfirm can call it directly without re-inventing cart logic
  useEffect(() => {
    if (directAddRef) directAddRef.current = directAddToNewCart;
  }, [directAddToNewCart, directAddRef]);

  const addToNewCart = useCallback((item) => {
    if (item.addons?.length > 0) {
      // FIX — call parent setter instead of local state setter so the parent
      // renders AddOnModal outside the z-[70] stacking context
      setAddonModal(item);
      return;
    }
    directAddToNewCart({
      ...item,
      price:        parseFloat(item.price),
      basePrice:    parseFloat(item.price),
      selectedSize: null,
      quantity:     1,
      addons:       [],
      addonTotal:   0,
      comboItems:   [],
    });
  }, [directAddToNewCart, setAddonModal]);

  const removeFromNewCart = useCallback((id) => {
    setNewCart(prev => {
      const ex = prev.find(i => i.id === id);
      if (!ex) return prev;
      if (ex.quantity === 1) return prev.filter(i => i.id !== id);
      return prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
    });
  }, []);

  const newCartQtyFor = (id) => newCart.find(i => i.id === id)?.quantity || 0;

  const handleSave = async () => {
    if (newCart.length === 0) return;
    setSaving(true);
    try {
      const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };

      const existingItems = order.items || [];
      const newItems = newCart.map(i => ({
        name:         i.name,
        price:        i.basePrice ?? i.price,
        quantity:     i.quantity,
        addons:       i.addons       || [],
        addonTotal:   i.addonTotal   || 0,
        selectedSize: i.selectedSize || null,
        comboItems:   i.comboItems   || [],
      }));
      const updatedItems = [...existingItems, ...newItems];

      // Recalculate totals from scratch using all items
      const newSubtotal = updatedItems.reduce((s, item) => {
        const base = safeNum(item.price);
        const addonAmt = (item.addons || []).reduce((as, a) => as + safeNum(a.price), 0);
        return s + (base + addonAmt) * safeNum(item.quantity);
      }, 0);

      // Re-fetch cafe for rates
      const cafeSnap = await getDoc(doc(db, 'cafes', order.cafeId));
      const cafe = cafeSnap.exists() ? cafeSnap.data() : {};

      const newTax = cafe?.taxEnabled ? newSubtotal * safeNum(cafe.taxRate) / 100 : 0;
      const newSC  = cafe?.serviceChargeEnabled ? newSubtotal * safeNum(cafe.serviceChargeRate) / 100 : 0;
      const newGST = cafe?.gstEnabled ? newSubtotal * safeNum(cafe.gstRate) / 100 : 0;
      const newPlatform = cafe?.platformFeeEnabled ? safeNum(cafe.platformFeeAmount) : 0;
      const newTotal = Math.round(newSubtotal + newTax + newSC + newGST + newPlatform);

      await updateDoc(doc(db, 'orders', order.id), {
        items:                updatedItems,
        subtotalAmount:       newSubtotal,
        taxAmount:            newTax,
        serviceChargeAmount:  newSC,
        gstAmount:            newGST,
        totalAmount:          newTotal,
      });

      onClose();
    } catch (err) {
      console.error('[AddMoreItems] Failed to update order:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
          style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
            <div>
              <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                Add More Items
              </h3>
              <p className="text-xs mt-0.5" style={{ color: '#A3A3A3' }}>
                Order #{String(order.orderNumber || '').padStart(3, '0')}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-all">
              <X className="w-5 h-5 text-[#A3A3A3]" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search menu..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
              />
            </div>
          </div>

          {/* Menu list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {loadingMenu ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-[#555] py-8 text-sm">No items found</p>
            ) : (
              filteredItems.map(item => {
                const qty = newCartQtyFor(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-white text-sm font-medium truncate">{item.name}</p>
                      {item.category && (
                        <p className="text-xs mt-0.5" style={{ color: '#555' }}>{item.category}</p>
                      )}
                      <p className="text-sm font-bold mt-0.5" style={{ color: primary }}>
                        {CUR}{fmt(item.price)}
                      </p>
                    </div>
                    {qty > 0 ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => removeFromNewCart(item.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
                        >
                          <Minus className="w-3 h-3 text-white" />
                        </button>
                        <span className="text-white font-bold text-sm min-w-[16px] text-center">{qty}</span>
                        <button
                          onClick={() => addToNewCart(item)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-black font-bold"
                          style={{ background: primary }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => addToNewCart(item)}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-black font-bold text-xs"
                        style={{ background: primary }}
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </motion.button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {newCart.length > 0 && (
            <div className="px-4 py-4 flex-shrink-0 border-t border-white/8 space-y-3">
              <div className="space-y-1">
                {newCart.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-[#A3A3A3]">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{CUR}{fmt(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-white/5">
                  <span style={{ color: '#A3A3A3' }}>New items total</span>
                  <span style={{ color: primary }}>{CUR}{fmt(newCartTotal)}</span>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
              >
                {saving ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Updating Order…</>
                ) : (
                  <><ShoppingCart className="w-4 h-4" />Add to Order · {CUR}{fmt(newCartTotal)}</>
                )}
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* AddOnModal is rendered at OrderTracking level — see FIX ISSUE 1 comment */}
    </AnimatePresence>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const OrderTracking = () => {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const [order,          setOrder         ] = useState(null);
  const [loading,        setLoading       ] = useState(true);
  const [notFound,       setNotFound      ] = useState(false);
  const [showAddMore,    setShowAddMore   ] = useState(false);
  // FIX — ISSUE 1: addonModal state lives here so AddOnModal renders outside
  // AddMoreItemsModal's z-[70] stacking context (see component comment above)
  const [addMoreAddonModal, setAddMoreAddonModal] = useState(null);
  // directAddRef lets the root-level AddOnModal call directAddToNewCart which
  // lives inside AddMoreItemsModal — avoids duplicating cart logic
  const directAddRef = useRef(null);

  // ── Google Review link — fetched per café from cafes/{cafeId} ───────────────
  const [googleReviewLink, setGoogleReviewLink] = useState('');

  useEffect(() => {
    if (!order?.cafeId) return;
    const fetchReviewLink = async () => {
      try {
        const snap = await getDoc(doc(db, 'cafes', order.cafeId));
        if (snap.exists()) {
          setGoogleReviewLink(snap.data()?.googleReviewLink || '');
        }
      } catch (err) {
        console.warn('[OrderTracking] Could not fetch review link:', err.message);
      }
    };
    fetchReviewLink();
  }, [order?.cafeId]);

  const [waSending, setWaSending] = useState(false);

  // ── Real-time listener — UNCHANGED from existing system ──────────────────────
  useEffect(() => {
    if (!orderId) { setNotFound(true); setLoading(false); return; }

    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      snap => {
        if (snap.exists()) {
          setOrder({ id: snap.id, ...snap.data() });
        } else {
          setNotFound(true);
        }
        setLoading(false);
      },
      () => { setNotFound(true); setLoading(false); }
    );
    return () => unsub();
  }, [orderId]);

  // ── Send invoice to customer via WhatsApp (optional, not auto-redirect) ──────
  const handleSendInvoice = useCallback(() => {
    if (!order) return;
    const phone = (order.customerPhone || '').replace(/\D/g, '');
    if (!phone) { alert('No phone number on this order.'); return; }
    setWaSending(true);
    const msg = generateInvoiceMessage(order);
    window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    setTimeout(() => setWaSending(false), 2000);
  }, [order]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const statusCfg   = getStatusConfig(order?.orderStatus);
  const primary     = '#D4AF37';
  const CUR         = order?.currencySymbol || '₹';
  const fmt         = (n) => (parseFloat(n) || 0).toFixed(2);
  const items       = order?.items || [];
  const payStatus   = order?.paymentStatus || 'pending';
  const orderType   = order?.orderType || 'dine-in';

  const orderTypeLabel = {
    'dine-in':  `Dine-In${order?.tableNumber ? ` · Table ${order.tableNumber}` : ''}`,
    'takeaway': 'Takeaway',
    'delivery': 'Delivery',
  }[orderType] || orderType;

  const payModeLabel = {
    counter:  'Pay at Counter',
    table:    'Pay at Table',
    prepaid:  'UPI (Prepaid)',
    online:   'Online Payment',
  }[order?.paymentMode] || (order?.paymentMode || '—');

  const orderTime = (() => {
    const ts = order?.createdAt;
    try {
      const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
      return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    } catch { return ''; }
  })();

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-4 border-t-transparent"
        style={{ borderColor: `${primary}30`, borderTopColor: primary }}
      />
    </div>
  );

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (notFound) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-6">
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]/20" />
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Order Not Found
        </h1>
        <p className="text-[#A3A3A3] text-sm">
          This order doesn't exist or may have expired.
        </p>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#050505] flex flex-col items-center justify-start py-8 px-4"
      style={{ fontFamily: 'Manrope, sans-serif' }}
    >
      {/* Ambient glow behind card */}
      <motion.div
        animate={{ opacity: [0.08, 0.18, 0.08] }}
        transition={{ duration: 3.5, repeat: Infinity }}
        className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none"
        style={{ background: statusCfg.color }}
      />

      <div className="relative w-full max-w-sm">

        {/* ── Main card ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background:   'rgba(12,12,12,0.96)',
            border:       '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-7 pb-4 text-center border-b border-white/5">
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              className="text-4xl mb-3 select-none"
            >
              {statusCfg.emoji}
            </motion.div>
            <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
              Order #{String(order.orderNumber || '').padStart(3, '0')}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-[#555]">{orderTypeLabel}</span>
              {orderTime && <><span className="text-[#333] text-xs">·</span><span className="text-xs text-[#555]">{orderTime}</span></>}
              <span className="text-[#333] text-xs">·</span>
              <PaymentBadge status={payStatus} />
            </div>
          </div>

          {/* Progress bar */}
          <ProgressBar status={order.orderStatus} />

          {/* Current status bubble */}
          <AnimatePresence mode="wait">
            <motion.div
              key={order.orderStatus}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="mx-6 mb-5 p-4 rounded-xl text-center"
              style={{
                background: `${statusCfg.color}0f`,
                border:     `1px solid ${statusCfg.color}30`,
              }}
            >
              <p className="font-bold text-base" style={{ color: statusCfg.color }}>
                {statusCfg.label}
              </p>
              <p className="text-[#A3A3A3] text-sm mt-0.5">{statusCfg.desc}</p>
              {statusCfg.hint && (
                <p className="text-[#555] text-xs mt-1 italic">{statusCfg.hint}</p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* ── Customer info ─────────────────────────────────────────────── */}
          {(order.customerName || order.customerPhone || order.deliveryAddress) && (
            <div className="mx-6 mb-4 p-3 rounded-xl space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {order.customerName && (
                <div className="flex items-center gap-2 text-xs text-[#A3A3A3]">
                  <User className="w-3.5 h-3.5 text-[#555]" />
                  {order.customerName}
                </div>
              )}
              {order.customerPhone && (
                <div className="flex items-center gap-2 text-xs text-[#A3A3A3]">
                  <Phone className="w-3.5 h-3.5 text-[#555]" />
                  {order.customerPhone}
                </div>
              )}
              {order.deliveryAddress && (
                <div className="flex items-start gap-2 text-xs text-[#A3A3A3]">
                  <MapPin className="w-3.5 h-3.5 text-[#555] mt-0.5 shrink-0" />
                  {order.deliveryAddress}
                </div>
              )}
            </div>
          )}

          {/* ── Items breakdown ───────────────────────────────────────────── */}
          <div className="px-6 pb-2">
            <p className="text-[#444] text-xs uppercase tracking-widest font-semibold mb-3">
              Your Order
            </p>
            <div className="space-y-2">
              {items.map((item, i) => {
                const basePrice  = parseFloat(item.basePrice ?? item.price) || 0;
                const qty        = parseInt(item.quantity) || 1;
                const addons     = Array.isArray(item.addons) ? item.addons : [];
                const comboItems = Array.isArray(item.comboItems) ? item.comboItems : [];
                const addonAmt   = addons.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
                const lineTotal  = (basePrice + addonAmt) * qty;

                return (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#D0D0D0] font-medium">
                        {item.name} × {qty}
                      </span>
                      <span className="text-white font-semibold">{CUR}{fmt(lineTotal)}</span>
                    </div>
                    {/* comboItems indented */}
                    {comboItems.map((ci, cIdx) => (
                      <div key={cIdx} className="flex items-center text-xs pl-3">
                        <span className="text-[#555]">— {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}</span>
                      </div>
                    ))}
                    {/* Add-ons indented */}
                    {addons.map((a, ai) => (
                      <div key={ai} className="flex justify-between text-xs pl-3">
                        <span className="text-[#555]">╰ {a.name}</span>
                        <span className="text-[#666]">+{CUR}{fmt(parseFloat(a.price) || 0)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Bill summary */}
            <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
              {order.subtotalAmount > 0 && order.subtotalAmount !== order.totalAmount && (
                <div className="flex justify-between text-xs text-[#555]">
                  <span>Subtotal</span>
                  <span>{CUR}{fmt(order.subtotalAmount)}</span>
                </div>
              )}
              {(order.gstAmount || 0) > 0 && (
                <div className="flex justify-between text-xs text-[#555]">
                  <span>GST</span>
                  <span>+{CUR}{fmt(order.gstAmount)}</span>
                </div>
              )}
              {(order.taxAmount || 0) > 0 && (
                <div className="flex justify-between text-xs text-[#555]">
                  <span>Tax</span>
                  <span>+{CUR}{fmt(order.taxAmount)}</span>
                </div>
              )}
              {(order.serviceChargeAmount || 0) > 0 && (
                <div className="flex justify-between text-xs text-[#555]">
                  <span>Service Charge</span>
                  <span>+{CUR}{fmt(order.serviceChargeAmount)}</span>
                </div>
              )}
              {(order.platformFeeAmount || 0) > 0 && (
                <div className="flex justify-between text-xs text-[#555]">
                  <span>Platform Fee</span>
                  <span>+{CUR}{fmt(order.platformFeeAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1">
                <span className="text-white">Total</span>
                <span style={{ color: primary }}>{CUR}{fmt(order.totalAmount)}</span>
              </div>
            </div>

            {/* Payment mode */}
            <div className="mt-3 flex items-center justify-between text-xs pb-5">
              <div className="flex items-center gap-1.5 text-[#555]">
                <CreditCard className="w-3.5 h-3.5" />
                {payModeLabel}
              </div>
              {order.specialInstructions && (
                <p className="text-[#555] text-xs italic max-w-[160px] truncate" title={order.specialInstructions}>
                  📝 {order.specialInstructions}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <div className="flex gap-3 mt-4">
          {/* Back to menu */}
          {order.cafeId && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/cafe/${order.cafeId}`)}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-black"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
            >
              <Home className="w-4 h-4" />
              Back to Menu
            </motion.button>
          )}

          {/* Send invoice on WhatsApp — optional, not auto-redirect */}
          {order.customerPhone && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={handleSendInvoice}
              disabled={waSending}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'rgba(37,211,102,0.12)',
                border:     '1px solid rgba(37,211,102,0.25)',
                color:      '#25D366',
              }}
              title="Send invoice to your WhatsApp"
            >
              {waSending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <MessageSquare className="w-4 h-4" />
              }
              Invoice
            </motion.button>
          )}
        </div>

        {/* ── Add More Items button — shown only for active (non-completed/cancelled) orders ── */}
        {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && order.cafeId && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddMore(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all"
            style={{
              background: 'rgba(212,175,55,0.08)',
              border:     '1px solid rgba(212,175,55,0.25)',
              color:      primary,
            }}
          >
            <Plus className="w-4 h-4" />
            Add More Items
          </motion.button>
        )}

        {/* ── Loyalty Promo — add-only, zero change to existing logic ────── */}
        <div className="mt-6 rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.05))', border: '1px solid rgba(212,175,55,0.25)' }}>
          <div className="p-5 text-center">
            <div className="text-2xl mb-2">🎁</div>
            <p className="font-bold text-base" style={{ color: primary }}>
              Get 10% OFF on your next visit!
            </p>
            <p className="text-sm mt-1" style={{ color: '#666' }}>
              Leave us a Google review and show it at the counter to redeem.
            </p>
            {googleReviewLink ? (
              <a
                href={googleReviewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full font-bold text-sm text-black transition-all hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                data-testid="google-review-link"
              >
                ⭐ Leave a Google Review
              </a>
            ) : (
              <p className="text-xs mt-3" style={{ color: '#888' }}>
                Ask the café owner to add their Google Review link in Settings.
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-[#2a2a2a] text-xs mt-5">
          Powered by SmartCafé OS · Branding Architect
        </p>
      </div>

      {/* ── Add More Items Modal ──────────────────────────────────────────── */}
      {showAddMore && order && (
        <AddMoreItemsModal
          order={order}
          onClose={() => setShowAddMore(false)}
          primary={primary}
          setAddonModal={setAddMoreAddonModal}
          directAddRef={directAddRef}
        />
      )}

      {/* FIX — ISSUE 1: AddOnModal rendered HERE at root level so its z-[60]
          is evaluated against the document root, not AddMoreItemsModal's z-[70].
          onConfirm calls directAddRef.current (= directAddToNewCart inside the
          modal) so the cart entry is delivered without duplicating any logic. */}
      {addMoreAddonModal && (
        <AddOnModal
          item={addMoreAddonModal}
          onConfirm={(entry) => {
            directAddRef.current?.(entry);
            setAddMoreAddonModal(null);
          }}
          onClose={() => setAddMoreAddonModal(null)}
          currencySymbol={order?.currencySymbol || '₹'}
          primaryColor={primary}
          theme="dark"
        />
      )}
    </div>
  );
};

export default OrderTracking;
