/**
 * OrderTracking.jsx
 *
 * Task 7 & 8: Customer-facing real-time order status tracker.
 * Route: /track/:orderId
 *
 * Uses onSnapshot on orders/{orderId} — real-time, as allowed by Task 15.
 * Shows: Received → Preparing → Ready → Completed
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Coffee, ChefHat, CheckCircle, Clock, Package, ArrowLeft, Home } from 'lucide-react';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUSES = [
  {
    id: 'new',
    label: 'Order Received',
    desc: 'Your order has been received and confirmed.',
    icon: Clock,
    color: '#3B82F6',
    emoji: '📋',
  },
  {
    id: 'preparing',
    label: 'Preparing',
    desc: 'Our kitchen is preparing your order with love.',
    icon: ChefHat,
    color: '#F59E0B',
    emoji: '👨‍🍳',
  },
  {
    id: 'ready',
    label: 'Ready for Pickup',
    desc: 'Your order is ready! Please collect it.',
    icon: Package,
    color: '#10B981',
    emoji: '✅',
  },
  {
    id: 'completed',
    label: 'Completed',
    desc: 'Thank you for your order. Enjoy!',
    icon: CheckCircle,
    color: '#D4AF37',
    emoji: '🎉',
  },
];

const STATUS_INDEX = { new: 0, preparing: 1, ready: 2, completed: 3 };

// ─── Step indicator ────────────────────────────────────────────────────────────

const StepIndicator = ({ status, primary }) => {
  const currentIdx = STATUS_INDEX[status] ?? 0;

  return (
    <div className="flex items-center justify-center gap-0 my-8">
      {STATUSES.map((s, i) => {
        const done    = i <= currentIdx;
        const active  = i === currentIdx;
        const Icon    = s.icon;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center">
              <motion.div
                animate={active ? { scale: [1, 1.12, 1], boxShadow: [`0 0 0px ${s.color}00`, `0 0 20px ${s.color}80`, `0 0 0px ${s.color}00`] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500"
                style={{
                  background: done ? s.color : 'rgba(255,255,255,0.05)',
                  borderColor: done ? s.color : 'rgba(255,255,255,0.1)',
                }}
              >
                <Icon className="w-5 h-5" style={{ color: done ? '#000' : '#555' }} />
              </motion.div>
              <p className="text-xs mt-2 text-center max-w-[60px] leading-tight"
                style={{ color: done ? s.color : '#555', fontWeight: active ? 700 : 400 }}>
                {s.label.split(' ')[0]}
              </p>
            </div>
            {i < STATUSES.length - 1 && (
              <div className="w-8 sm:w-12 h-0.5 mb-6 mx-1 transition-all duration-500"
                style={{ background: i < currentIdx ? STATUSES[i].color : 'rgba(255,255,255,0.08)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const OrderTracking = () => {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const [order,    setOrder   ] = useState(null);
  const [loading,  setLoading ] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Real-time listener (allowed by Task 15 — orders are real-time)
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

  const currentStatus = order?.orderStatus || 'new';
  const statusConfig  = STATUSES.find(s => s.id === currentStatus) || STATUSES[0];
  const primary       = '#D4AF37';

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-4 border-t-transparent"
        style={{ borderColor: `${primary}40`, borderTopColor: primary }} />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-6">
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]/30" />
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Order Not Found
        </h1>
        <p className="text-[#A3A3A3] text-sm">This order ID doesn't exist or has expired.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4"
      style={{ fontFamily: 'Manrope, sans-serif' }}>

      {/* Background glow */}
      <motion.div
        animate={{ opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: statusConfig.color }}
      />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(15,15,15,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 text-center border-b border-white/5">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-4xl mb-3"
            >
              {statusConfig.emoji}
            </motion.div>
            <h1 className="text-xl font-black text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
              Order #{String(order.orderNumber || '').padStart(3, '0')}
            </h1>
            <p className="text-[#A3A3A3] text-sm mt-1">
              {order.customerName && `Hi ${order.customerName}! `}
              Track your order below.
            </p>
          </div>

          {/* Status indicator */}
          <div className="px-6">
            <StepIndicator status={currentStatus} primary={primary} />
          </div>

          {/* Current status */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStatus}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-6 mb-5 p-4 rounded-xl text-center"
              style={{ background: `${statusConfig.color}10`, border: `1px solid ${statusConfig.color}30` }}
            >
              <p className="font-bold text-base" style={{ color: statusConfig.color }}>
                {statusConfig.label}
              </p>
              <p className="text-[#A3A3A3] text-sm mt-1">{statusConfig.desc}</p>
            </motion.div>
          </AnimatePresence>

          {/* Order summary */}
          <div className="px-6 pb-6 space-y-2">
            <p className="text-[#555] text-xs uppercase tracking-wide mb-3">Your Order</p>
            {(order.items || []).map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-[#A3A3A3]">{item.name} × {item.quantity}</span>
                <span className="text-white">{order.currencySymbol || '₹'}{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-white/5 pt-2 mt-2 flex justify-between font-bold">
              <span className="text-white">Total</span>
              <span style={{ color: primary }}>
                {order.currencySymbol || '₹'}{(order.totalAmount || 0).toFixed(2)}
              </span>
            </div>
            {order.tableNumber && (
              <p className="text-[#555] text-xs text-center pt-1">Table #{order.tableNumber}</p>
            )}
          </div>
        </motion.div>

        {/* Footer */}
        {/* Back to Menu button */}
        <div className="flex gap-3 mt-4">
          {order?.cafeId && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/cafe/${order.cafeId}`)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-black font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
            >
              <Home className="w-4 h-4" />
              Back to Menu
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#A3A3A3' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </motion.button>
        </div>

        <p className="text-center text-[#333] text-xs mt-4">
          Powered by Branding Architect SmartCafé OS
        </p>
      </div>
    </div>
  );
};

export default OrderTracking;
