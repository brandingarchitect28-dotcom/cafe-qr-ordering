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
 * UPGRADE: Items section now uses the SAME product-selection UI as the
 * "Add Items to Order" flow in OrdersManagement — full size + add-on support,
 * inventory deduction, and analytics tracking. Zero new logic introduced.
 *
 * Exports:
 *  - default  ExternalOrderModal  (the modal component)
 *  - named    ORDER_SOURCES       (platform list used by Analytics source badges)
 *  - named    getSourceMeta       (colour/label lookup used by order cards)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import {
  collection, doc, addDoc, runTransaction, serverTimestamp,
  query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X, Plus, Minus, Trash2, RefreshCw, ShoppingBag,
  AlertCircle, Check, MessageSquare, Search, ShoppingCart,
} from 'lucide-react';
import { createInvoiceForOrder, generateInvoiceMessage } from '../../services/invoiceService';
import { deductStockForOrder } from '../../services/inventoryService';
import AddOnModal from '../AddOnModal';

// ─── calculateOrderTotals — identical to OrdersManagement single source of truth ─
const calculateOrderTotals = (items = []) => {
  if (!Array.isArray(items)) return { itemsTotal: 0, addonsTotal: 0, grandTotal: 0 };
  const safeN = v => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
  let itemsTotal = 0, addonsTotal = 0;
  for (const item of items) {
    if (!item) continue;
    const base = safeN(item.basePrice ?? item.price);
    const qty  = safeN(item.quantity) || 1;
    const addons   = Array.isArray(item.addons) ? item.addons : [];
    const addonAmt = addons.reduce((s, a) => {
      if (!a) return s;
      return s + safeN(a.price) * (parseInt(a.quantity) || 1);
    }, 0);
    itemsTotal  += base    * qty;
    addonsTotal += addonAmt * qty;
  }
  return { itemsTotal, addonsTotal, grandTotal: itemsTotal + addonsTotal };
};

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

const inputCls =
  'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm';

const labelCls = 'block text-white text-sm font-medium mb-1.5';

// ─── ExternalItemPickerModal ──────────────────────────────────────────────────
// Identical logic to AddItemsToOrderModal in OrdersManagement.jsx.
// Only difference: no handleSave — calls onConfirm(cart) instead so
// ExternalOrderModal owns the cart state and submits via its own handleSubmit.

const ExternalItemPickerModal = ({ cafeId, CUR, onClose, onConfirm, setVariantModal, variantAddRef }) => {
  const fmt     = (n) => (parseFloat(n) || 0).toFixed(2);
  const primary = '#D4AF37';

  const [menuItems,   setMenuItems  ] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [newCart,     setNewCart    ] = useState([]);
  const [addonModal,  setAddonModal ] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load menu items for this cafe — identical to AddItemsToOrderModal
  useEffect(() => {
    if (!cafeId) return;
    const q = query(
      collection(db, 'menuItems'),
      where('cafeId', '==', cafeId),
      where('available', '==', true)
    );
    const unsub = onSnapshot(q, snap => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingMenu(false);
    }, () => setLoadingMenu(false));
    return () => unsub();
  }, [cafeId]);

  const filteredItems = menuItems.filter(item =>
    !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { grandTotal: newCartTotal } = calculateOrderTotals(newCart);

  // ── Cart logic — byte-for-byte identical to AddItemsToOrderModal ─────────
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

  const addToNewCart = useCallback((item, forcedVariant) => {
    if (!item) return;

    if (!forcedVariant) {
      const sp = item.sizePricing;
      if (sp && sp.enabled === true) {
        const sizePricingVariants = [
          sp.small  != null && { name: 'Small',  price: parseFloat(sp.small)  },
          sp.medium != null && { name: 'Medium', price: parseFloat(sp.medium) },
          sp.large  != null && { name: 'Large',  price: parseFloat(sp.large)  },
        ].filter(Boolean);
        if (sizePricingVariants.length > 0) {
          setVariantModal({ ...item, _resolvedVariants: sizePricingVariants });
          return;
        }
      }
      const rawVariants =
        item.variants      ||
        item.prices        ||
        item.sizes         ||
        item.options       ||
        item.priceVariants ||
        item.multiPrices   ||
        null;
      const variants = Array.isArray(rawVariants)
        ? rawVariants.filter(v => v && v.price !== undefined)
        : null;
      if (variants && variants.length > 0) {
        setVariantModal({ ...item, _resolvedVariants: variants });
        return;
      }
    }

    const resolvedPrice       = forcedVariant ? (parseFloat(forcedVariant.price) || parseFloat(item.price) || 0) : (parseFloat(item.price) || 0);
    const resolvedVariantName = forcedVariant?.name || forcedVariant?.label || forcedVariant?.size || forcedVariant?.title || null;

    if (item.addons?.length > 0) {
      setAddonModal({
        ...item,
        price:           resolvedPrice,
        basePrice:       resolvedPrice,
        selectedVariant: resolvedVariantName,
      });
      return;
    }

    directAddToNewCart({
      ...item,
      price:           resolvedPrice,
      basePrice:       resolvedPrice,
      selectedSize:    resolvedVariantName,
      selectedVariant: resolvedVariantName,
      quantity:        1,
      addons:          [],
      addonTotal:      0,
      comboItems:      Array.isArray(item.comboItems) ? item.comboItems : [],
    });
  }, [directAddToNewCart, setAddonModal, setVariantModal]);

  // Keep variantAddRef current — identical pattern to OrdersManagement
  useEffect(() => {
    if (variantAddRef) variantAddRef.current = (item, variant) => addToNewCart(item, variant);
  });

  const removeFromNewCart = useCallback((id) => {
    setNewCart(prev => {
      const ex = prev.find(i => i.id === id);
      if (!ex) return prev;
      if (ex.quantity === 1) return prev.filter(i => i.id !== id);
      return prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
    });
  }, []);

  const newCartQtyFor = (id) => newCart.find(i => i.id === id)?.quantity || 0;

  // ── Render — identical to AddItemsToOrderModal, just footer button changed ─
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

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
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
            <div>
              <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                Select Items
              </h3>
              <p className="text-xs mt-0.5 text-[#A3A3A3]">Search and add items to this order</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-all">
              <X className="w-5 h-5 text-[#A3A3A3]" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0 border-b border-white/5">
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

                const sp = item.sizePricing;
                const sizePricingVariants = (sp && sp.enabled === true)
                  ? [
                      sp.small  != null && { name: 'Small',  price: parseFloat(sp.small)  },
                      sp.medium != null && { name: 'Medium', price: parseFloat(sp.medium) },
                      sp.large  != null && { name: 'Large',  price: parseFloat(sp.large)  },
                    ].filter(Boolean)
                  : [];

                const rawVariants =
                  item.variants || item.prices || item.sizes ||
                  item.options  || item.priceVariants || item.multiPrices || null;
                const arrayVariants = Array.isArray(rawVariants)
                  ? rawVariants.filter(v => v && v.price !== undefined)
                  : [];

                const itemVariants = sizePricingVariants.length > 0 ? sizePricingVariants : arrayVariants;
                const hasVariants  = itemVariants.length > 0;
                const hasAddons    = Array.isArray(item.addons) && item.addons.length > 0;

                const minPrice     = hasVariants ? Math.min(...itemVariants.map(v => parseFloat(v.price) || 0)) : null;
                const displayPrice = hasVariants
                  ? `from ${CUR}${fmt(minPrice)}`
                  : `${CUR}${fmt(item.price)}`;

                const btnLabel = hasVariants ? 'Select Size' : hasAddons ? 'Customize' : 'Add';

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-white text-sm font-medium truncate">{item.name}</p>
                      {item.category && (
                        <p className="text-xs mt-0.5 text-[#555]">{item.category}</p>
                      )}
                      {hasVariants ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {itemVariants.map((v, vi) => (
                            <span
                              key={vi}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(212,175,55,0.10)', color: '#D4AF37', fontSize: '0.65rem' }}
                            >
                              {v.name || v.label || v.size || v.title || `S${vi+1}`} {CUR}{fmt(v.price)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-bold mt-0.5" style={{ color: primary }}>
                          {displayPrice}
                        </p>
                      )}
                    </div>

                    {!hasVariants && qty > 0 ? (
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
                          onClick={() => {
                            const entry = newCart.find(i => i.id === item.id);
                            if (entry) directAddToNewCart({ ...entry });
                            else addToNewCart(item);
                          }}
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
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-black font-bold text-xs whitespace-nowrap"
                        style={{ background: primary }}
                      >
                        <Plus className="w-3 h-3" />
                        {btnLabel}
                      </motion.button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {newCart.length > 0 && (
            <div className="px-4 py-4 flex-shrink-0 border-t border-white/5 space-y-3">
              <div className="space-y-1">
                {newCart.map((item, idx) => {
                  const addons = Array.isArray(item.addons) ? item.addons : [];
                  const itemAddonAmt = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                  const lineTotal = (parseFloat(item.basePrice ?? item.price) + itemAddonAmt) * (parseInt(item.quantity) || 1);
                  return (
                    <div key={idx} className="flex justify-between text-xs text-[#A3A3A3]">
                      <span>
                        {item.name}
                        {item.selectedVariant ? ` (${item.selectedVariant})` : ''}
                        {' '}× {item.quantity}
                        {addons.length > 0 ? ` +${addons.length} add-on${addons.length > 1 ? 's' : ''}` : ''}
                      </span>
                      <span>{CUR}{fmt(lineTotal)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-white/5">
                  <span className="text-[#A3A3A3]">Selected total</span>
                  <span style={{ color: primary }}>{CUR}{fmt(newCartTotal)}</span>
                </div>
              </div>
              {/* Confirm button — passes cart back to ExternalOrderModal */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onConfirm(newCart)}
                className="w-full py-3.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
              >
                <Check className="w-4 h-4" />
                Confirm {newCart.length} Item{newCart.length !== 1 ? 's' : ''} · {CUR}{fmt(newCartTotal)}
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* AddOnModal rendered inside picker — identical pattern to AddItemsToOrderModal */}
        {addonModal && (
          <AddOnModal
            item={addonModal}
            onConfirm={(entry) => { directAddToNewCart(entry); setAddonModal(null); }}
            onClose={() => setAddonModal(null)}
            currencySymbol={CUR}
            primaryColor={primary}
            theme="dark"
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// ─── ExternalOrderModal ───────────────────────────────────────────────────────

const ExternalOrderModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const [submitting, setSubmitting] = useState(false);

  // ── Form state — ALL UNCHANGED from original ─────────────────────────────
  const [source,          setSource         ] = useState('zomato');
  const [customerName,    setCustomerName   ] = useState('');
  const [customerPhone,   setCustomerPhone  ] = useState('');
  const [tableNumber,     setTableNumber    ] = useState('');
  const [orderMode,       setOrderMode      ] = useState('takeaway');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes,           setNotes          ] = useState('');
  const [paymentMode,     setPaymentMode    ] = useState('counter');
  const [paymentStatus,   setPaymentStatus  ] = useState('pending');

  // ── Cart state — replaces manual items array ─────────────────────────────
  // cart items have the SAME structure as AddItemsToOrderModal newCart entries:
  // { id, name, price, basePrice, quantity, addons, addonTotal,
  //   selectedSize, selectedVariant, comboItems, ...menuItem fields }
  const [cart,           setCart          ] = useState([]);
  const [showPicker,     setShowPicker    ] = useState(false);

  // ── Variant picker state — identical pattern to OrdersManagement root ────
  const [extVariantModal, setExtVariantModal] = useState(null);
  const extVariantAddRef = useRef(null);

  // ── WA invoice — UNCHANGED from original ─────────────────────────────────
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);

  // ── Cart total — uses same formula as calculateOrderTotals ───────────────
  const { grandTotal: cartTotal } = calculateOrderTotals(cart);

  // ── Remove item from cart ─────────────────────────────────────────────────
  const removeFromCart = useCallback((idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Submit — SAME pipeline as original, items now from cart ──────────────
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (cart.length === 0) {
      toast.error('Add at least one item before placing the order');
      return;
    }

    setSubmitting(true);

    try {
      // Sequential order number — UNCHANGED from original
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

      // formattedItems — IDENTICAL structure to AddItemsToOrderModal.handleSave
      // Ensures Kitchen, Analytics, Inventory all receive the same shape as QR orders
      const formattedItems = cart.map(i => ({
        name:            i.name,
        price:           i.basePrice ?? i.price,
        basePrice:       i.basePrice ?? i.price,
        quantity:        i.quantity,
        addons:          i.addons          || [],
        addonTotal:      i.addonTotal      || 0,
        selectedSize:    i.selectedSize    || null,
        selectedVariant: i.selectedVariant || i.selectedSize || null,
        comboItems:      i.comboItems      || [],
      }));

      // subtotal — uses same calculateOrderTotals formula (includes add-ons)
      const { grandTotal: subtotal } = calculateOrderTotals(formattedItems);

      // Tax calculation — UNCHANGED from original
      const taxAmount           = cafe?.taxEnabled           ? subtotal * (parseFloat(cafe.taxRate)           || 0) / 100 : 0;
      const serviceChargeAmount = cafe?.serviceChargeEnabled ? subtotal * (parseFloat(cafe.serviceChargeRate) || 0) / 100 : 0;
      const gstAmount           = cafe?.gstEnabled           ? subtotal * (parseFloat(cafe.gstRate)           || 0) / 100 : 0;
      const totalAmount         = Math.round(subtotal + taxAmount + serviceChargeAmount + gstAmount);

      const orderData = {
        // Standard fields — IDENTICAL shape to QR-placed orders — UNCHANGED
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
        ...(orderMode === 'dine-in'  && tableNumber     && { tableNumber:     tableNumber.trim() }),
        ...(orderMode === 'delivery' && deliveryAddress && { deliveryAddress: deliveryAddress.trim() }),
        ...(notes && { specialInstructions: notes.trim() }),

        // External-order fields — UNCHANGED
        orderSource:   source,
        externalOrder: true,
        source,

        createdAt: serverTimestamp(),
      };

      const orderDocRef = await addDoc(collection(db, 'orders'), orderData);
      const formattedNum = String(orderNumber).padStart(3, '0');

      // Non-blocking invoice generation — UNCHANGED
      createInvoiceForOrder(
        { ...orderData, orderNumber },
        orderDocRef.id,
        cafe
      ).catch(err => console.error('[ExternalOrder] Invoice generation failed:', err));

      // Inventory deduction — same call used by QR orders (deductStockForOrder)
      // Passes formattedItems + full menuItems array fetched inside the service
      // Non-blocking: never breaks order placement on failure
      deductStockForOrder(cafeId, formattedItems, cart)
        .catch(err => console.error('[ExternalOrder] Stock deduction failed (non-fatal):', err));

      // Store for WA button — UNCHANGED
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

  // ── WA invoice — UNCHANGED from original ─────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  const sourceMeta = getSourceMeta(source);
  const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

  return (
    <>
      {/* ── Item Picker Modal — opens on top of ExternalOrderModal ────────── */}
      {showPicker && (
        <div style={{ visibility: extVariantModal ? 'hidden' : 'visible' }}>
          <ExternalItemPickerModal
            cafeId={cafeId}
            CUR={CUR}
            onClose={() => setShowPicker(false)}
            onConfirm={(selectedCart) => {
              setCart(selectedCart);
              setShowPicker(false);
            }}
            setVariantModal={setExtVariantModal}
            variantAddRef={extVariantAddRef}
          />
        </div>
      )}

      {/* ── Variant picker at root level z-[200] — identical to OrdersManagement ── */}
      {extVariantModal && (() => {
        const vItem     = extVariantModal;
        const primary_v = '#D4AF37';
        const fmt_v     = n => (parseFloat(n) || 0).toFixed(2);
        const variants  = vItem._resolvedVariants || [];
        return (
          <div className="fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setExtVariantModal(null)} />
            <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
              <div
                className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden"
                style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                  <div>
                    <h3 className="text-white font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                      Select Size
                    </h3>
                    <p className="text-xs mt-0.5 text-[#A3A3A3]">{vItem.name}</p>
                  </div>
                  <button onClick={() => setExtVariantModal(null)} className="p-2 rounded-full hover:bg-white/10 transition-all">
                    <X className="w-5 h-5 text-[#A3A3A3]" />
                  </button>
                </div>
                <div className="px-4 py-3 space-y-2 pb-6">
                  {variants.map((v, vi) => (
                    <button
                      key={vi}
                      onClick={() => {
                        setExtVariantModal(null);
                        extVariantAddRef.current?.(vItem, v);
                      }}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl transition-all font-bold"
                      style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.30)', color: primary_v }}
                    >
                      <span className="text-sm">{v.name}</span>
                      <span className="text-sm">{CUR}{fmt_v(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Main modal — ALL original markup preserved ───────────────────── */}
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
            {/* Header — UNCHANGED */}
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

              {/* Platform Source — UNCHANGED */}
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
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold ${sourceMeta.bg}`}>
                    {sourceMeta.label}
                  </span>
                  <span className="text-[#555] text-xs">will appear as this label on order cards</span>
                </div>
              </div>

              {/* Customer + Phone row — UNCHANGED */}
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

              {/* Order Mode selector — UNCHANGED */}
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

              {/* Dine-In: table number — UNCHANGED */}
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

              {/* Delivery: address input — UNCHANGED */}
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

              {/* ── Items section — REPLACED with product picker ─────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className={`${labelCls} mb-0`}>Items Ordered</label>
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-black font-bold text-xs transition-all"
                    style={{ background: '#D4AF37' }}
                    data-testid="ext-add-items-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {cart.length > 0 ? 'Change Items' : 'Add Items'}
                  </button>
                </div>

                {cart.length === 0 ? (
                  /* Empty state */
                  <div
                    className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-white/10 cursor-pointer hover:border-[#D4AF37]/40 transition-all"
                    onClick={() => setShowPicker(true)}
                  >
                    <ShoppingCart className="w-8 h-8 text-[#A3A3A3] mb-2 opacity-40" />
                    <p className="text-[#A3A3A3] text-sm">No items selected</p>
                    <p className="text-[#555] text-xs mt-0.5">Click to browse menu</p>
                  </div>
                ) : (
                  /* Cart preview — same style as AddItemsToOrderModal footer */
                  <div
                    className="rounded-xl overflow-hidden border border-white/8"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="divide-y divide-white/5">
                      {cart.map((item, idx) => {
                        const addons = Array.isArray(item.addons) ? item.addons : [];
                        const addonAmt = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                        const lineTotal = (parseFloat(item.basePrice ?? item.price) + addonAmt) * (parseInt(item.quantity) || 1);
                        return (
                          <div key={idx} className="flex items-start justify-between px-4 py-3 gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium">
                                {item.name}
                                {item.selectedVariant ? ` (${item.selectedVariant})` : ''}
                                <span className="text-[#A3A3A3] font-normal"> × {item.quantity}</span>
                              </p>
                              {addons.length > 0 && (
                                <p className="text-xs mt-0.5 text-[#555]">
                                  + {addons.map(a => a.name).join(', ')}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[#D4AF37] text-sm font-semibold">{CUR}{fmt(lineTotal)}</span>
                              <button
                                type="button"
                                onClick={() => removeFromCart(idx)}
                                className="p-1 text-[#555] hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                                title="Remove item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Cart total */}
                    <div className="flex justify-between items-center px-4 py-3 border-t border-white/5">
                      <span className="text-[#A3A3A3] text-sm">Items Total</span>
                      <span className="text-[#D4AF37] font-bold">{CUR}{fmt(cartTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment row — UNCHANGED */}
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

              {/* Notes — UNCHANGED */}
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

              {/* Info note — UNCHANGED */}
              <div className="flex items-start gap-3 p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-sm">
                <AlertCircle className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
                <p className="text-[#A3A3A3] text-xs leading-relaxed">
                  This order will appear instantly in the <strong className="text-white">Kitchen Display</strong>,{' '}
                  <strong className="text-white">Orders Management</strong>, and{'  '}
                  <strong className="text-white">Analytics</strong> — exactly like a QR order.
                  An invoice will also be generated automatically.
                </p>
              </div>
            </form>

            {/* Footer actions — UNCHANGED except cart-based item count + total */}
            <div className="px-6 py-4 border-t border-white/10 bg-[#0A0A0A] flex items-center justify-between gap-3 flex-shrink-0">
              <div className="text-sm text-[#A3A3A3]">
                {cart.length} item{cart.length !== 1 ? 's' : ''} ·{'  '}
                <span className="text-[#D4AF37] font-semibold">{CUR}{fmt(cartTotal)}</span>
              </div>
              <div className="flex gap-3 flex-wrap justify-end">
                {/* WhatsApp Invoice — UNCHANGED */}
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
    </>
  );
};

export default ExternalOrderModal;
