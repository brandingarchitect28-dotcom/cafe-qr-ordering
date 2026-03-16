/**
 * ExternalOrderModal.jsx
 *
 * Modal form for manually adding external orders (Zomato, Swiggy, Phone, Walk-in).
 * Saves to the SAME orders/{orderId} collection with identical structure to QR orders.
 * Adds two new fields: orderSource, externalOrder: true
 *
 * Rules:
 *  - Does NOT touch CafeOrdering.jsx order flow
 *  - Does NOT break invoice generation (createInvoiceForOrder called after save)
 *  - Does NOT break kitchen display (uses same orderStatus: 'new')
 *  - Matches existing Tailwind dark dashboard design exactly
 */

import React, { useState, useCallback } from 'react';
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
  ChevronDown, AlertCircle, Check,
} from 'lucide-react';
import { createInvoiceForOrder } from '../../services/invoiceService';

// ─── constants ────────────────────────────────────────────────────────────────

export const ORDER_SOURCES = [
  { value: 'zomato',  label: 'Zomato',       color: '#EF4444', bg: 'bg-red-500/15 border-red-500/30 text-red-400'       },
  { value: 'swiggy',  label: 'Swiggy',       color: '#F97316', bg: 'bg-orange-500/15 border-orange-500/30 text-orange-400' },
  { value: 'phone',   label: 'Phone Order',  color: '#3B82F6', bg: 'bg-blue-500/15 border-blue-500/30 text-blue-400'    },
  { value: 'walkin',  label: 'Walk-in',      color: '#10B981', bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  { value: 'other',   label: 'Other',        color: '#8B5CF6', bg: 'bg-purple-500/15 border-purple-500/30 text-purple-400' },
];

export const getSourceMeta = (source) =>
  ORDER_SOURCES.find(s => s.value === source?.toLowerCase()) || {
    value: source || 'other',
    label: source?.toUpperCase() || 'DIRECT',
    color: '#A3A3A3',
    bg: 'bg-white/10 border-white/20 text-[#A3A3A3]',
  };

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMPTY_ITEM = { name: '', quantity: 1, price: '' };

const inputCls =
  'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm';

const labelCls = 'block text-white text-sm font-medium mb-1.5';

// ─── ExternalOrderModal ──────────────────────────────────────────────────────

const ExternalOrderModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [source,        setSource       ] = useState('zomato');
  const [customerName,  setCustomerName ] = useState('');
  const [tableNumber,   setTableNumber  ] = useState('');
  const [notes,         setNotes        ] = useState('');
  const [paymentMode,   setPaymentMode  ] = useState('counter');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [items,         setItems        ] = useState([{ ...EMPTY_ITEM }]);

  // ── item CRUD ─────────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
  };

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (idx) => {
    if (items.length === 1) return; // always keep at least 1
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // ── totals ────────────────────────────────────────────────────────────────
  const calculatedTotal = items.reduce((sum, item) => {
    const qty   = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price)    || 0;
    return sum + qty * price;
  }, 0);

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const validItems = items.filter(i => i.name.trim() && parseFloat(i.price) > 0);
    if (validItems.length === 0) {
      toast.error('Add at least one item with a name and price');
      return;
    }

    setSubmitting(true);

    try {
      // Sequential order number (same transaction used by QR orders)
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
        price:    parseFloat(i.price) || 0,
        quantity: parseInt(i.quantity) || 1,
      }));

      const totalAmount = formattedItems.reduce(
        (sum, i) => sum + i.price * i.quantity, 0
      );

      const orderData = {
        // ── standard order fields (identical shape to QR orders) ──
        cafeId,
        orderNumber,
        items:         formattedItems,
        subtotalAmount: totalAmount,
        taxAmount:      0,
        serviceChargeAmount: 0,
        gstAmount:      0,
        totalAmount,
        currencyCode:   cafe?.currencyCode   || 'INR',
        currencySymbol: cafe?.currencySymbol || '₹',
        paymentStatus,
        paymentMode,
        orderStatus:   'new',
        orderType:     tableNumber ? 'dine-in' : 'takeaway',
        customerName:  customerName.trim() || getSourceMeta(source).label,
        customerPhone: '',
        ...(tableNumber && { tableNumber: tableNumber.trim() }),
        ...(notes && { specialInstructions: notes.trim() }),

        // ── external order fields ──
        orderSource:   source,        // 'zomato' | 'swiggy' | 'phone' | 'walkin' | 'other'
        externalOrder: true,
        source,                        // kept for backward compat with KDS + Overview badges

        createdAt: serverTimestamp(),
      };

      const orderDocRef = await addDoc(collection(db, 'orders'), orderData);
      const formattedNum = String(orderNumber).padStart(3, '0');

      // Non-blocking invoice generation (same as QR orders)
      createInvoiceForOrder(
        { ...orderData, orderNumber },
        orderDocRef.id,
        cafe
      ).catch(err => console.error('[ExternalOrder] Invoice generation failed:', err));

      toast.success(`External order #${formattedNum} added from ${getSourceMeta(source).label}!`);

      if (onSuccess) onSuccess(orderDocRef.id, orderNumber);
      onClose();

    } catch (err) {
      console.error('[ExternalOrderModal] submit error:', err);
      toast.error('Failed to add order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
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
          {/* ── Header ──────────────────────────────────────────────────── */}
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

          {/* ── Scrollable form body ─────────────────────────────────────── */}
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
                        ? `border-[${s.color}] bg-[${s.color}]/10 text-white`
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

            {/* Customer + Table row */}
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
            </div>

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
                    {/* Name */}
                    <input
                      type="text"
                      value={item.name}
                      onChange={e => updateItem(idx, 'name', e.target.value)}
                      placeholder="Item name"
                      className={`${inputCls} col-span-6`}
                      data-testid={`ext-item-name-${idx}`}
                    />
                    {/* Quantity */}
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      className={`${inputCls} col-span-2 text-center`}
                      data-testid={`ext-item-qty-${idx}`}
                    />
                    {/* Price */}
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
                    {/* Remove */}
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

          {/* ── Footer actions ───────────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-white/10 bg-[#0A0A0A] flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-sm text-[#A3A3A3]">
              {items.filter(i => i.name.trim()).length} item{items.filter(i => i.name.trim()).length !== 1 ? 's' : ''} ·{' '}
              <span className="text-[#D4AF37] font-semibold">{CUR}{calculatedTotal.toFixed(2)}</span>
            </div>
            <div className="flex gap-3">
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
