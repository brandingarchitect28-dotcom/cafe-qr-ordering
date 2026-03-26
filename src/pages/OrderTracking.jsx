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
 * - Payment status badge
 * - "Send Invoice on WhatsApp" button (optional, no auto-redirect)
 * - Cancelled state
 * - Full bill breakdown
 * - Estimated time hint per status
 */

import { formatWhatsAppNumber } from '../utils/whatsapp';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coffee, ChefHat, CheckCircle, Clock, Package,
  Home, MessageSquare, RefreshCw, XCircle, Receipt,
  MapPin, Phone, User, CreditCard,
} from 'lucide-react';
import { generateInvoiceMessage } from '../services/invoiceService';

// ─── Loading text sequence — cycles through reassuring messages ───────────────
// Pure display component, zero side effects, no data fetching.
const LOADING_STEPS = [
  'Confirming your order…',
  'Preparing your summary…',
  'Almost ready…',
];
const LoadingTextSequence = ({ primary }) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 800),
      setTimeout(() => setStep(2), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 text-xs"
        style={{ color: primary }}
      >
        <motion.span
          className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent flex-shrink-0 block"
          style={{ borderColor: `${primary}40`, borderTopColor: primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        {LOADING_STEPS[step]}
      </motion.div>
    </AnimatePresence>
  );
};

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

// ─── Main ─────────────────────────────────────────────────────────────────────

const OrderTracking = () => {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const [order,    setOrder   ] = useState(null);
  const [loading,  setLoading ] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [waSending, setWaSending] = useState(false);

  // ── Real-time listener — UNCHANGED from existing system ──────────────────────
  // Uses the same onSnapshot pattern. Kitchen updates flow here automatically.
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
    const phone = (order.customerPhone || '');
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
  const calcStatus  = order?.calculationStatus || 'done'; // 'done' default = backward compat
  const orderType   = order?.orderType || 'dine-in';
  const isPaid      = payStatus === 'paid';
  const isFailed    = payStatus === 'failed';

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

            {/* calculationStatus === 'pending': premium skeleton + loading sequence */}
            {calcStatus === 'pending' ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4 pb-4"
              >
                {/* Animated loading text sequence */}
                <LoadingTextSequence primary={primary} />

                {/* Animated progress bar */}
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${primary}80, ${primary})` }}
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>

                {/* Shimmer skeleton rows — mimic real item layout */}
                {[
                  { nameW: '55%', priceW: '18%' },
                  { nameW: '45%', priceW: '16%' },
                  { nameW: '60%', priceW: '20%' },
                ].map((row, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex justify-between items-center gap-3"
                  >
                    <div className="h-3 rounded-md" style={{ width: row.nameW, background: 'rgba(255,255,255,0.06)' }}>
                      <motion.div className="h-full w-full rounded-md overflow-hidden">
                        <motion.div
                          className="h-full w-1/3 rounded-md"
                          style={{ background: 'rgba(255,255,255,0.1)' }}
                          animate={{ x: ['-100%', '400%'] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                        />
                      </motion.div>
                    </div>
                    <div className="h-3 rounded-md flex-shrink-0" style={{ width: row.priceW, background: 'rgba(255,255,255,0.06)' }} />
                  </motion.div>
                ))}

                {/* Skeleton total row */}
                <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                  <div className="h-3 w-10 rounded-md" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <div className="h-4 w-20 rounded-md" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
              </motion.div>
            ) : (
              /* calculationStatus === 'done': fade+slide in real data */
              <motion.div
                key="real-data"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-2"
              >
                {items.map((item, i) => {
                  const basePrice  = parseFloat(item.basePrice ?? item.price) || 0;
                  const qty        = parseInt(item.quantity) || 1;
                  const addons     = Array.isArray(item.addons) ? item.addons : [];
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
                      {addons.map((a, ai) => (
                        <div key={ai} className="flex justify-between text-xs pl-3">
                          <span className="text-[#555]">╰ {a.name}</span>
                          <span className="text-[#666]">+{CUR}{fmt(parseFloat(a.price) || 0)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* Bill summary — only show when calculation done */}
            {calcStatus === 'done' && (
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
            )}

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

            {/* ── Payment action area (shown only when calculation is done) ── */}
            <AnimatePresence>
              {calcStatus === 'done' && !isPaid && order.orderStatus !== 'cancelled' && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="mb-4 space-y-2"
                >
                  {/* Failed payment state */}
                  {isFailed && (
                    <div className="flex items-center gap-2 p-3 rounded-xl text-xs text-red-400"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      ❌ Payment failed — please retry or pay at counter
                    </div>
                  )}

                  {/* Online payment button — only if cafe supports it */}
                  {order.paymentMode === 'online' && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.95, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                      whileHover={{ scale: 1.02, boxShadow: `0 6px 28px ${primary}50` }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => navigate(`/cafe/${order.cafeId}`)}
                      className="w-full py-3.5 rounded-xl font-bold text-sm text-black transition-shadow"
                      style={{
                        background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                        boxShadow: `0 4px 20px ${primary}40`,
                      }}
                    >
                      {isFailed ? '🔄 Retry Payment' : '💳 Pay Now'}
                    </motion.button>
                  )}

                  {/* Pay at Counter option (for non-prepaid orders) */}
                  {order.paymentMode !== 'prepaid' && order.paymentMode !== 'online' && (
                    <div className="p-3 rounded-xl text-center text-xs text-[#A3A3A3]"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      🏪 Pay at counter when ready — staff will confirm your payment
                    </div>
                  )}

                  {/* For failed online payments, offer counter fallback */}
                  {isFailed && order.paymentMode === 'online' && (
                    <div className="p-3 rounded-xl text-center text-xs text-[#555]"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      Or pay at counter — your order is saved
                    </div>
                  )}
                </motion.div>
              )}

              {/* Paid confirmation — scale bounce + green glow */}
              {isPaid && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.88, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                  className="mb-4 p-4 rounded-xl text-center font-bold text-sm text-green-400"
                  style={{
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.25)',
                    boxShadow: '0 0 20px rgba(16,185,129,0.12)',
                  }}
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 500, damping: 18 }}
                    className="text-xl block mb-1"
                  >
                    ✅
                  </motion.span>
                  Payment confirmed — enjoy your order!
                </motion.div>
              )}
            </AnimatePresence>
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

          {/* Invoice button — ONLY shown when paymentStatus === 'paid' */}
          {isPaid && order.customerPhone && (
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

        <p className="text-center text-[#2a2a2a] text-xs mt-5">
          Powered by SmartCafé OS · Branding Architect
        </p>
      </div>
    </div>
  );
};

export default OrderTracking;
