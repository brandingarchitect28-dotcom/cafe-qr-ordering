/**
 * GlobalOrderPopup.jsx
 *
 * Global new-order notification popup.
 * Rendered at Dashboard level so it appears on EVERY page.
 * Same visual style as the existing OrdersManagement notification popup.
 * Auto-dismisses after 8 seconds.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';

const GlobalOrderPopup = ({ order, onClose }) => {
  // Auto-dismiss after 8 seconds
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

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          key="global-order-popup"
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0,    scale: 1    }}
          exit={{    opacity: 0, y: -50,   scale: 0.9  }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-4 right-4 z-[9999] bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-black p-6 rounded-lg shadow-2xl max-w-sm w-full"
          data-testid="global-order-notification"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1 hover:bg-black/10 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4">
            <div className="bg-black/20 p-3 rounded-full flex-shrink-0">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-lg mb-1">New Order 🚨</h3>
              <p className="font-bold text-2xl mb-2">
                {fmtOrderNum(order.orderNumber)}
              </p>
              {order.customerName && (
                <p className="font-semibold text-sm truncate">{order.customerName}</p>
              )}
              {order.orderType === 'dine-in' && order.tableNumber && (
                <p className="font-semibold text-sm">Table {order.tableNumber}</p>
              )}
              {order.orderType === 'delivery' && (
                <p className="text-sm">🛵 Delivery</p>
              )}
              <p className="text-sm mt-1">{itemCount(order.items)}</p>
              <p className="font-bold text-xl mt-2">{fmtTotal(order)}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalOrderPopup;
