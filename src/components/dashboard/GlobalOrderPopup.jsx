/**
 * GlobalOrderPopup.jsx
 *
 * Global new-order notification popup.
 * Rendered at Dashboard level so it appears on EVERY page.
 * Styled to match the OrdersManagement notification popup exactly.
 * Auto-dismisses after 8 seconds.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const GlobalOrderPopup = ({ order, onClose, onNavigateToOrders }) => {

  // Auto-dismiss after 8 seconds — UNCHANGED
  useEffect(() => {
    if (!order) return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [order, onClose]);

  const fmtOrderNum = (n) =>
    n ? `#${String(n).padStart(3, '0')}` : '—';

  const fmtTotal = (o) =>
    `${o.currencySymbol || '₹'}${(o.totalAmount || o.total || 0).toFixed(0)}`;

  const itemCount = (items) => {
    const total = (items || []).reduce((s, i) => s + (i.quantity || 1), 0);
    return `${total} item${total !== 1 ? 's' : ''}`;
  };

  // Click popup body → navigate to Orders tab
  const handlePopupClick = () => {
    if (onNavigateToOrders) onNavigateToOrders();
  };

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          key="global-order-popup"
          initial={{ opacity: 0, x: 100, scale: 0.9 }}
          animate={{ opacity: 1, x: 0,   scale: 1   }}
          exit={{    opacity: 0, x: 100,  scale: 0.9 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          className="fixed top-4 right-4 z-[9999] p-5 rounded-2xl max-w-sm"
          style={{
            background: 'linear-gradient(135deg,#C9A227,#8B6914)',
            boxShadow:  '0 20px 60px rgba(201,162,39,0.5),0 0 0 1px rgba(255,255,255,0.15)',
            cursor:     'pointer',
          }}
          data-testid="global-order-notification"
          onClick={handlePopupClick}
        >
          {/* Close — stopPropagation so it only dismisses, never navigates */}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.2)' }}
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>

          <div className="flex items-start gap-4">

            {/* Bell icon — exact match to OrdersManagement */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.15)' }}
            >
              🔔
            </div>

            {/* Content — exact match to OrdersManagement */}
            <div>
              <p className="font-black text-white/75 text-xs uppercase tracking-widest mb-0.5">
                New Order!
              </p>

              {/* Order number in Playfair Display — matches omf-title class */}
              <p
                className="font-black text-white text-2xl mb-1"
                style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '0.01em' }}
              >
                {fmtOrderNum(order.orderNumber)}
              </p>

              {order.customerName && (
                <p className="font-bold text-sm text-white/80">{order.customerName}</p>
              )}

              {order.orderType === 'dine-in' && order.tableNumber && (
                <p className="font-bold text-sm text-white/80">🪑 Table {order.tableNumber}</p>
              )}

              {order.orderType === 'delivery' && (
                <p className="text-sm text-white/70">🛵 Delivery</p>
              )}

              <p className="text-sm text-white/70">
                🍽️ {itemCount(order.items)}
              </p>

              <p className="font-black text-xl text-white mt-1">
                💰 {fmtTotal(order)}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalOrderPopup;
