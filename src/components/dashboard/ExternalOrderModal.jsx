/**
 * ExternalOrderModal.jsx
 *
 * Modal form for manually adding external orders from Zomato, Swiggy,
 * Phone orders, Walk-in customers, or any other platform.
 *
 * Creates orders with the IDENTICAL schema used by QR orders so they flow
 * into the same Analytics, Kitchen Display, Invoice system, and Notifications
 * without any separate handling.
 *
 * Exports:
 *  - default  ExternalOrderModal  (the modal component)
 *  - named    ORDER_SOURCES       (platform list used by Analytics source badges)
 *  - named    getSourceMeta       (colour/label lookup used by order cards)
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import {
  collection, doc, addDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X, Plus, Trash2, RefreshCw, ShoppingBag,
  AlertCircle, Check, MessageSquare,
} from 'lucide-react';
import { createInvoiceForOrder, generateInvoiceMessage } from '../../services/invoiceService';

// ─── Platform source definitions ──────────────────────────────────────────────
// Exported so Analytics.jsx and order card badges can reference the same list

export const ORDER_SOURCES = [
  { value: 'zomato',  label: 'Zomato',       color: '#EF4444', bg: 'bg-red-500/15 border-red-500/30 text-red-400'              },
  { value: 'swiggy',  label: 'Swiggy',       color: '#F97316', bg: 'bg-orange-500/15 border-orange-500/30 text-orange-400'    },
  { value: 'phone',   label: 'Phone Order',  color: '#3B82F6', bg: 'bg-blue-500/15 border-blue-500/30 text-blue-400'          },
  { value: 'walkin',  label: 'Walk-in',      color: '#10B981', bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  { value: 'other',   label: 'Other',        color: '#8B5CF6', bg: 'bg-purple-500/15 border-purple-500/30 text-purple-400'    },
];

export const getSourceMeta = (source) =>
  ORDER_SOURCES.find(s => s.value === source?.toLowerCase()) || {
    value: source || 'other',
    label: source?.toUpperCase() || 'DIRECT',
    color: '#A3A3A3',
    bg:    'bg-white/10 border-white/20 text-[#A3A3A3]',
  };

// ─── Internal helpers ─────────────────────────────────────────────────────────

const EMPTY_ITEM = { name: '', quantity: 1, price: '' };

const inputCls =
  'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm';

const labelCls = 'block text-white text-sm font-medium mb-1.5';

// ─── ExternalOrderModal ───────────────────────────────────────────────────────

const ExternalOrderModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [source,          setSource         ] = useState('zomato');
  const [customerName,    setCustomerName   ] = useState('');
  const [customerPhone,   setCustomerPhone  ] = useState('');
  const [tableNumber,     setTableNumber    ] = useState('');
  const [orderMode,       setOrderMode      ] = useState('takeaway'); // 'dine-in' | 'takeaway' | 'delivery'
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes,           setNotes          ] = useState('');
  const [paymentMode,     setPaymentMode    ] = useState('counter');
  const [paymentStatus,   setPaymentStatus  ] = useState('pending');
  const [items,           setItems          ] = useState([{ ...EMPTY_ITEM }]);

  // ── Item CRUD ───────────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
  };

  const addItem    = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (idx) => {
    if (items.length === 1) return; // always keep at least one row
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Running total ───────────────────────────────────────────────────────────
  const calculatedTotal = items.reduce((sum, item) => {
    const qty   = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price)    || 0;
    return sum + qty * price;
  }, 0);

  // ── Submit — creates order with IDENTICAL schema to QR orders ───────────────
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const validItems = items.filter(i => i.name.trim() && parseFloat(i.price) > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one item with a name and price');
      return;
    }

    setSubmitting(true);

    try {
      // Sequential order number — same transaction used by QR orders
      const counterRef = doc(db, 'system', 'counters');
      let orderNumber;

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists()) {
          orderNumber = 1;
          transaction.set(counterRef, { currentOrderNumber: 1 });
        } else {
          orderNumber = (counterDoc.data().currentOrderNumber || 0) + 1;
          transaction.update(counterRef, { currentOrderNumber: orderNumber });
        }
      });

      const formattedItems = validItems.map(i => ({
        name:     i.name.trim(),
        price:    parseFloat(i.price)    || 0,
        quantity: parseInt(i.quantity, 10) || 1,
      }));

      // ── Tax calculation — identical formula used by QR orders ─────────────
      // Reads the same cafe settings (gstEnabled/gstRate, serviceChargeEnabled/
      // serviceChargeRate, taxEnabled/taxRate) so external order invoices match
      // QR order invoices exactly.
      const subtotal          = formattedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const taxAmount         = cafe?.taxEnabled          ? subtotal * (parseFloat(cafe.taxRate)          || 0) / 100 : 0;
      const serviceChargeAmount = cafe?.serviceChargeEnabled ? subtotal * (parseFloat(cafe.serviceChargeRate) || 0) / 100 : 0;
      const gstAmount         = cafe?.gstEnabled          ? subtotal * (parseFloat(cafe.gstRate)          || 0) / 100 : 0;
      const totalAmount       = subtotal + taxAmount + serviceChargeAmount + gstAmount;

      const orderData = {
        // Standard fields — identical shape to QR-placed orders
        cafeId,
        orderNumber,
        items:               formattedItems,
        subtotalAmount:      subtotal,
        taxAmount,
        taxEnabled:          cafe?.taxEnabled          || false,
        taxName:             cafe?.taxName             || 'Tax',
        taxRate:             parseFloat(cafe?.taxRate) || 0,
        serviceChargeAmount,
        serviceChargeEnabled: cafe?.serviceChargeEnabled || false,
        serviceChargeRate:   parseFloat(cafe?.serviceChargeRate) || 0,
        gstAmount,
        gstEnabled:          cafe?.gstEnabled          || false,
        gstRate:             parseFloat(cafe?.gstRate) || 0,
        totalAmount,
        currencyCode:        cafe?.currencyCode   || 'INR',
        currencySymbol:      cafe?.currencySymbol || '₹',
        paymentStatus,
        paymentMode,
        orderStatus:         'new',
        orderType:           orderMode,
        customerName:        customerName.trim() || getSourceMeta(source).label,
        customerPhone:       customerPhone.trim(),
        ...(orderMode === 'dine-in'  && tableNumber    && { tableNumber: tableNumber.trim() }),
        ...(orderMode === 'delivery' && deliveryAddress && { deliveryAddress: deliveryAddress.trim() }),
        ...(notes && { specialInstructions: notes.trim() }),

        // External-order fields (read by Analytics source charts + KDS badges)
        orderSource:   source,   // 'zomato' | 'swiggy' | 'phone' | 'walkin' | 'other'
        externalOrder: true,
        source,                  // kept for backward-compat with KDS + Overview badges

        createdAt: serverTimestamp(),
      };

      const orderDocRef = await addDoc(collection(db, 'orders'), orderData);
      const formattedNum = String(orderNumber).padStart(3, '0');

      // Non-blocking invoice generation — same as QR orders
      createInvoiceForOrder(
        { ...orderData, orderNumber },
        orderDocRef.id,
        cafe
      ).catch(err => console.error('[ExternalOrder] Invoice generation failed:', err));

      // Store for WA button (shown in footer when paymentStatus === 'paid')
      setLastCreatedOrder({ id: orderDocRef.id, ...orderData, orderNumber });

      toast.success(
        `External order #${formattedNum} added from ${getSourceMeta(source).label}!`
      );

      if (onSuccess) onSuccess(orderDocRef.id, orderNumber);
      onClose();

    } catch (err) {
      console.error('[ExternalOrderModal] submit error:', err);
      toast.error('Failed to add order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── WhatsApp Invoice (shown in footer after paid order is created) ───────────
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);

  const fmtWANumber = (raw) => {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const handleSendInvoiceWA = () => {
    if (!lastCreatedOrder) return;
    const phone = fmtWANumber(lastCreatedOrder.customerPhone || '');
    if (!phone) { toast.error('No phone number on this order'); return; }
    try {
      const msg = generateInvoiceMessage(lastCreatedOrder, {
        name:           cafe?.name           || '',
        currencySymbol: lastCreatedOrder.currencySymbol || CUR,
      });
      window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    } catch (err) {
      console.error('[ExternalOrder] WA send error:', err);
      toast.error('Failed to open WhatsApp');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const sourceMeta = getSourceMeta(source);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.93, opacity: 0, y: 24 }}
          animate={{ scale: 1,    opacity: 1, y: 0  }}
          exit={{    scale: 0.93, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0F0F0F] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <h3 className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Add External Order
                </h3>
                <p className="text-[#A3A3A3] text-xs mt-0.5">
                  Manually log orders from external platforms
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable form body */}
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-5">

            {/* Platform Source */}
            <div>
              <label className={labelCls}>Platform Source</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {ORDER_SOURCES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSource(s.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-sm border-2 text-xs font-bold transition-all ${
                      source === s.value
                        ? 'border-white/40 text-white'
                        : 'border-white/10 text-[#A3A3A3] hover:border-white/20 hover:text-white'
                    }`}
                    style={
                      source === s.value
                        ? { borderColor: s.color, backgroundColor: s.color + '18', color: '#fff' }
                        : {}
                    }
                  >
                    <span
                      className="w-5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: source === s.value ? s.color : '#333' }}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
              {/* Selected source badge preview */}
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold ${sourceMeta.bg}`}>
                  {sourceMeta.label}
                </span>
                <span className="text-[#555] text-xs">will appear as this label on order cards</span>
              </div>
            </div>

            {/* Customer + Phone row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Customer Name
                  <span className="text-[#A3A3A3] font-normal ml-1">(optional)</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder={`e.g., ${sourceMeta.label} Customer`}
                  className={inputCls}
                  data-testid="ext-customer-name"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Phone Number
                  <span className="text-[#A3A3A3] font-normal ml-1">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="e.g., 9876543210"
                  className={inputCls}
                  data-testid="ext-customer-phone"
                />
              </div>
            </div>

            {/* Order Mode selector */}
            <div>
              <label className={labelCls}>Order Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'takeaway', label: '🥡 Takeaway' },
                  { value: 'dine-in',  label: '🪑 Dine-In'  },
                  { value: 'delivery', label: '🛵 Delivery'  },
                ].map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setOrderMode(m.value)}
                    className={`py-2.5 px-3 rounded-sm border-2 text-sm font-semibold transition-all ${
                      orderMode === m.value
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]'
                        : 'border-white/10 text-[#A3A3A3] hover:border-white/20 hover:text-white'
                    }`}
                    data-testid={`ext-mode-${m.value}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dine-In: table number */}
            {orderMode === 'dine-in' && (
              <div>
                <label className={labelCls}>
                  Table Number
                  <span className="text-[#A3A3A3] font-normal ml-1">(optional)</span>
                </label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  placeholder="e.g., 5"
                  className={inputCls}
                  data-testid="ext-table-number"
                />
              </div>
            )}

            {/* Delivery: address input */}
            {orderMode === 'delivery' && (
              <div>
                <label className={labelCls}>Delivery Address</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Enter full delivery address"
                  className={inputCls}
                  data-testid="ext-delivery-address"
                />
              </div>
            )}

            {/* Items ordered */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`${labelCls} mb-0`}>Items Ordered</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 text-[#D4AF37] hover:text-[#C5A059] text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Item
                </button>
              </div>

              <div className="space-y-2">
                {/* Column headers */}
                <div className="grid grid-cols-12 gap-2 px-1">
                  <span className="col-span-6 text-[#A3A3A3] text-xs uppercase tracking-wide">Item Name</span>
                  <span className="col-span-2 text-[#A3A3A3] text-xs uppercase tracking-wide text-center">Qty</span>
                  <span className="col-span-3 text-[#A3A3A3] text-xs uppercase tracking-wide">Price ({CUR})</span>
                  <span className="col-span-1" />
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={item.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                      placeholder="Item name"
                      className={`${inputCls} col-span-6`}
                      data-testid={`ext-item-name-${idx}`}
                    />
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      className={`${inputCls} col-span-2 text-center`}
                      data-testid={`ext-item-qty-${idx}`}
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.price}
                      onChange={e => updateItem(idx, 'price', e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} col-span-3`}
                      data-testid={`ext-item-price-${idx}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="col-span-1 flex items-center justify-center p-2 text-[#A3A3A3] hover:text-red-400 hover:bg-red-500/10 rounded transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Running total */}
              <div className="mt-3 flex items-center justify-end gap-2 px-1">
                <span className="text-[#A3A3A3] text-sm">Calculated Total:</span>
                <span className="text-[#D4AF37] font-bold text-lg">
                  {CUR}{calculatedTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Payment Method</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm"
                  data-testid="ext-payment-mode"
                >
                  <option value="counter"  className="bg-[#0F0F0F]">Pay at Counter</option>
                  <option value="prepaid"  className="bg-[#0F0F0F]">Prepaid / UPI</option>
                  <option value="online"   className="bg-[#0F0F0F]">Online Payment</option>
                  <option value="platform" className="bg-[#0F0F0F]">Paid on Platform</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm"
                  data-testid="ext-payment-status"
                >
                  <option value="pending" className="bg-[#0F0F0F]">Pending</option>
                  <option value="paid"    className="bg-[#0F0F0F]">Paid</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>
                Notes / Special Instructions
                <span className="text-[#A3A3A3] font-normal ml-1">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special instructions, allergies, or notes..."
                rows={3}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm px-4 py-3 text-sm resize-none transition-all"
                data-testid="ext-notes"
              />
            </div>

            {/* Info note */}
            <div className="flex items-start gap-3 p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-sm">
              <AlertCircle className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
              <p className="text-[#A3A3A3] text-xs leading-relaxed">
                This order will appear instantly in the <strong className="text-white">Kitchen Display</strong>,{' '}
                <strong className="text-white">Orders Management</strong>, and{' '}
                <strong className="text-white">Analytics</strong> — exactly like a QR order.
                An invoice will also be generated automatically.
              </p>
            </div>
          </form>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-white/10 bg-[#0A0A0A] flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-sm text-[#A3A3A3]">
              {items.filter(i => i.name.trim()).length} item{items.filter(i => i.name.trim()).length !== 1 ? 's' : ''} ·{' '}
              <span className="text-[#D4AF37] font-semibold">{CUR}{calculatedTotal.toFixed(2)}</span>
            </div>
            <div className="flex gap-3 flex-wrap justify-end">
              {/* WhatsApp Invoice — visible after a paid order is created with a phone number */}
              {lastCreatedOrder &&
               lastCreatedOrder.paymentStatus === 'paid' &&
               lastCreatedOrder.customerPhone && (
                <button
                  type="button"
                  onClick={handleSendInvoiceWA}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 font-bold rounded-sm text-sm transition-all"
                  data-testid="ext-wa-invoice-btn"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send Invoice via WhatsApp
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white hover:border-white/20 rounded-sm text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="external-order-form"
                disabled={submitting}
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
                data-testid="ext-submit-btn"
              >
                {submitting
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Adding…</>
                  : <><Check className="w-4 h-4" /> Add Order</>
                }
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ExternalOrderModal;
