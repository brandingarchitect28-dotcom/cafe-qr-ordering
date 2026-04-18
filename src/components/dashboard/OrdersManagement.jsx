import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc, collection, addDoc, runTransaction, serverTimestamp, query, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AlertCircle, Search, Download, Phone, MapPin, Clock, Bell, Volume2, X, FileText, Eye, Trash2, MessageSquare, PlusCircle, Plus, Minus, ShoppingCart, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CSVLink } from 'react-csv';
import { motion, AnimatePresence } from 'framer-motion';
import InvoiceModal from './InvoiceModal';
import { getInvoiceByOrderId, ensureInvoiceForOrder, generateInvoiceMessage, createInvoiceForOrder } from '../../services/invoiceService';
import ExternalOrderModal from './ExternalOrderModal';
import AddOnModal from '../AddOnModal';

// Notification sound (base64 encoded short beep)
const NOTIFICATION_SOUND = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDgAAAAAAAAAGw3X+VkgAAAAAAAAAAAAAAAAD/4xjEAAJQAVAAAAAAvYCCB4P+UBn//+D4PoGH/ygM///KAHAY////4Pg+D7/8EMOD4f/6gYf///wfB9///5QGf/lAZ//+UAcH0GH////+oGH//6gYf5QBwfD4fygDg//+D5//ygMAAAAAAA/+MYxBYCwAFYAAAAAPHjx4sePHjx5OTk5FRUVFRU9PT09PT09PT0/////////////////////////////////+MYxCMAAADSAAAAAP///////////////////////////////////////////////+MYxDAAAADSAAAAAP///////////////////////////////////////////////+MYxD4AAADSAAAAAP//////////////////////////////////////////////'

// ─── calculateOrderTotals — SINGLE SOURCE OF TRUTH ───────────────────────────
const calculateOrderTotals = (items = []) => {
  if (!Array.isArray(items)) return { itemsTotal: 0, addonsTotal: 0, grandTotal: 0 };
  const safeN = v => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
  let itemsTotal = 0, addonsTotal = 0;

  for (const item of items) {
    if (!item) continue;
    const base = item.isFree ? 0 : safeN(item.basePrice ?? item.price);
    const qty  = safeN(item.quantity) || 1;
    const addons    = Array.isArray(item.addons) ? item.addons : [];
    const addonAmt  = addons.reduce((s, a) => {
      if (!a) return s;
      return s + safeN(a.price) * (parseInt(a.quantity) || 1);
    }, 0);
    itemsTotal  += base    * qty;
    addonsTotal += addonAmt * qty;
  }

  return { itemsTotal, addonsTotal, grandTotal: itemsTotal + addonsTotal };
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  gold:    '#D4AF37',
  goldDim: 'rgba(212,175,55,0.15)',
  goldBdr: 'rgba(212,175,55,0.25)',
  bg:      '#080808',
  card:    '#0F0F0F',
  cardAlt: '#111111',
  border:  'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  text:    '#FFFFFF',
  muted:   '#7A7A7A',
  dim:     '#444',
  font:    "'DM Sans', 'Syne', system-ui, sans-serif",
  display: "'Syne', 'DM Sans', system-ui, sans-serif",
};

// Injected global styles once
const globalStyleId = 'om-premium-styles';
if (typeof document !== 'undefined' && !document.getElementById(globalStyleId)) {
  const s = document.createElement('style');
  s.id = globalStyleId;
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@600;700;800&display=swap');
    .om-root * { font-family: 'DM Sans', system-ui, sans-serif; }
    .om-root .display-font { font-family: 'Syne', system-ui, sans-serif; }
    .om-card {
      background: #0F0F0F;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      transition: border-color 220ms ease, box-shadow 220ms ease;
    }
    .om-card:hover { border-color: rgba(255,255,255,0.11); box-shadow: 0 4px 24px rgba(0,0,0,0.45); }
    .om-btn {
      border-radius: 8px;
      font-weight: 600;
      font-size: 12px;
      padding: 6px 12px;
      transition: all 200ms ease;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .om-btn:hover { transform: translateY(-1px); }
    .om-btn:active { transform: translateY(0px) scale(0.97); }
    .om-btn-gold {
      background: linear-gradient(135deg, #D4AF37, #B8962E);
      color: #000;
      border-color: transparent;
    }
    .om-btn-gold:hover { box-shadow: 0 4px 16px rgba(212,175,55,0.35); }
    .om-btn-ghost {
      background: rgba(255,255,255,0.05);
      color: #A3A3A3;
      border-color: rgba(255,255,255,0.08);
    }
    .om-btn-ghost:hover { background: rgba(255,255,255,0.09); color: #fff; }
    .om-btn-danger {
      background: rgba(239,68,68,0.12);
      color: #f87171;
      border-color: rgba(239,68,68,0.2);
    }
    .om-btn-danger:hover { background: rgba(239,68,68,0.2); }
    .om-btn-blue {
      background: rgba(59,130,246,0.1);
      color: #60a5fa;
      border-color: rgba(59,130,246,0.18);
    }
    .om-btn-blue:hover { background: rgba(59,130,246,0.18); }
    .om-btn-green {
      background: rgba(16,185,129,0.1);
      color: #34d399;
      border-color: rgba(16,185,129,0.18);
    }
    .om-btn-green:hover { background: rgba(16,185,129,0.18); }
    .om-btn-invoice {
      background: rgba(212,175,55,0.08);
      color: #D4AF37;
      border-color: rgba(212,175,55,0.22);
    }
    .om-btn-invoice:hover { background: rgba(212,175,55,0.16); }
    .om-input {
      background: #0F0F0F;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      color: #fff;
      padding: 10px 14px;
      font-size: 14px;
      font-family: 'DM Sans', system-ui, sans-serif;
      transition: border-color 180ms ease, box-shadow 180ms ease;
      outline: none;
      width: 100%;
    }
    .om-input:focus {
      border-color: rgba(212,175,55,0.55);
      box-shadow: 0 0 0 3px rgba(212,175,55,0.10);
    }
    .om-input::placeholder { color: #3f3f3f; }
    .om-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
    }
    .om-select {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      color: #fff;
      padding: 6px 10px;
      font-size: 12px;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none;
      cursor: pointer;
      transition: border-color 160ms ease;
    }
    .om-select:focus { border-color: rgba(212,175,55,0.5); }
    .om-row-expanded { background: rgba(212,175,55,0.025) !important; }
    .om-table-row {
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 160ms ease;
      cursor: pointer;
    }
    .om-table-row:hover { background: rgba(255,255,255,0.03); }
    .om-divider { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 8px 0; }
    .om-filter-tab {
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 180ms ease;
      border: 1px solid transparent;
    }
    .om-filter-tab-active {
      background: linear-gradient(135deg, #D4AF37, #B8962E);
      color: #000;
      font-weight: 700;
    }
    .om-filter-tab-inactive {
      background: rgba(255,255,255,0.04);
      color: #7A7A7A;
      border-color: rgba(255,255,255,0.06);
    }
    .om-filter-tab-inactive:hover { background: rgba(255,255,255,0.08); color: #ccc; }
    .om-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .om-scroll::-webkit-scrollbar-track { background: transparent; }
    .om-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    .om-scroll::-webkit-scrollbar-thumb:hover { background: rgba(212,175,55,0.3); }
    .om-mobile-card {
      background: #0F0F0F;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      overflow: hidden;
      transition: border-color 220ms ease, box-shadow 220ms ease;
    }
    .om-mobile-card:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 6px 28px rgba(0,0,0,0.5); }
    @keyframes om-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .om-fadein { animation: om-fadein 280ms ease forwards; }
    @keyframes om-stagger { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(s);
}

// ─── Add Items to Order Modal ─────────────────────────────────────────────────

const AddItemsToOrderModal = ({ order, cafeCurrency, onClose, setVariantModal, variantAddRef }) => {
  const CUR = order?.currencySymbol || cafeCurrency || '₹';
  const fmt = (n) => (parseFloat(n) || 0).toFixed(2);
  const primary = '#D4AF37';

  const [menuItems,   setMenuItems  ] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [newCart,     setNewCart    ] = useState([]);
  const [addonModal,  setAddonModal ] = useState(null);
  const [saving,      setSaving     ] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const { grandTotal: newCartTotal } = calculateOrderTotals(newCart);

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

  const handleSave = async () => {
    if (newCart.length === 0) return;
    setSaving(true);
    try {
      const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };

      const existingItems = order.items || [];
      const newItems = newCart.map(i => ({
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
      const updatedItems = [...existingItems, ...newItems];

      const { grandTotal: newSubtotal } = calculateOrderTotals(updatedItems);

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

      toast.success(`${newItems.length} item${newItems.length !== 1 ? 's' : ''} added to order`);
      onClose();
    } catch (err) {
      console.error('[AddItemsToOrder] Failed:', err);
      toast.error('Failed to add items to order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

        <motion.div
          className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #111111 0%, #0D0D0D 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            maxHeight: '90vh',
            boxShadow: '0 -20px 60px rgba(0,0,0,0.7)',
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Grip handle */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div style={{ width: 36, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.12)' }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div>
              <h3 className="text-white font-bold text-lg display-font" style={{ fontFamily: T.display, letterSpacing: '-0.01em' }}>
                Add Items to Order
              </h3>
              <p className="text-xs mt-0.5" style={{ color: T.muted }}>
                #{order.orderNumber ? String(order.orderNumber).padStart(3, '0') : order.id.slice(0, 6)}
                {order.customerName ? ` · ${order.customerName}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              <X className="w-4 h-4" style={{ color: T.muted }} />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 flex-shrink-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.muted }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search menu…"
                className="om-input"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
          </div>

          {/* Menu list */}
          <div className="flex-1 overflow-y-auto om-scroll px-4 py-3 space-y-2">
            {loadingMenu ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: `${T.gold} transparent transparent transparent` }} />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-center py-10 text-sm" style={{ color: T.dim }}>No items found</p>
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

                const rawVariants = item.variants || item.prices || item.sizes || item.options || item.priceVariants || item.multiPrices || null;
                const arrayVariants = Array.isArray(rawVariants) ? rawVariants.filter(v => v && v.price !== undefined) : [];
                const itemVariants = sizePricingVariants.length > 0 ? sizePricingVariants : arrayVariants;
                const hasVariants  = itemVariants.length > 0;
                const hasAddons    = Array.isArray(item.addons) && item.addons.length > 0;
                const minPrice     = hasVariants ? Math.min(...itemVariants.map(v => parseFloat(v.price) || 0)) : null;
                const displayPrice = hasVariants ? `from ${CUR}${fmt(minPrice)}` : `${CUR}${fmt(item.price)}`;
                const btnLabel     = hasVariants ? 'Select Size' : hasAddons ? 'Customize' : 'Add';

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-white text-sm font-semibold truncate">{item.name}</p>
                      {item.category && <p className="text-xs mt-0.5" style={{ color: T.dim }}>{item.category}</p>}
                      {hasVariants ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {itemVariants.map((v, vi) => (
                            <span key={vi} className="om-badge" style={{ background: T.goldDim, color: T.gold, borderColor: T.goldBdr, fontSize: '0.65rem' }}>
                              {v.name || v.label || v.size || v.title || `S${vi+1}`} {CUR}{fmt(v.price)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-bold mt-1" style={{ color: T.gold }}>{displayPrice}</p>
                      )}
                    </div>

                    {!hasVariants && qty > 0 ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => removeFromNewCart(item.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
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
                          className="w-7 h-7 rounded-full flex items-center justify-center text-black font-bold transition-all"
                          style={{ background: `linear-gradient(135deg, ${T.gold}, #B8962E)` }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => addToNewCart(item)}
                        className="om-btn om-btn-gold flex-shrink-0 whitespace-nowrap"
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
            <div className="px-5 py-4 flex-shrink-0 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
              <div className="space-y-1.5">
                {newCart.map((item, idx) => {
                  const addons = Array.isArray(item.addons) ? item.addons : [];
                  const itemAddonAmt = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                  const lineTotal = (parseFloat(item.basePrice ?? item.price) + itemAddonAmt) * (parseInt(item.quantity) || 1);
                  return (
                    <div key={idx} className="flex justify-between text-xs" style={{ color: T.muted }}>
                      <span>
                        {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''}
                        {' '}× {item.quantity}
                        {addons.length > 0 ? ` +${addons.length} add-on${addons.length > 1 ? 's' : ''}` : ''}
                      </span>
                      <span className="text-white font-medium">{CUR}{fmt(lineTotal)}</span>
                    </div>
                  );
                })}
                <hr className="om-divider" />
                <div className="flex justify-between text-sm font-bold">
                  <span style={{ color: T.muted }}>New items total</span>
                  <span style={{ color: T.gold }}>{CUR}{fmt(newCartTotal)}</span>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${T.gold}, #B8962E)`, boxShadow: '0 4px 20px rgba(212,175,55,0.25)' }}
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

        {/* Addon modal */}
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

// ─── Main Component ───────────────────────────────────────────────────────────

const OrdersManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const cafeCurrency = cafe?.currencySymbol || '₹';
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [newOrderNotification, setNewOrderNotification] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousOrdersRef = useRef([]);
  const audioRef = useRef(null);

  const dragScrollRef  = useRef(null);
  const dragState      = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const onDragMouseDown = useCallback((e) => {
    const el = dragScrollRef.current;
    if (!el) return;
    if (e.button !== 0) return;
    dragState.current = {
      active:     true,
      startX:     e.pageX - el.offsetLeft,
      startY:     e.pageY - el.offsetTop,
      scrollLeft: el.scrollLeft,
      scrollTop:  el.scrollTop,
    };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const onDragMouseMove = useCallback((e) => {
    if (!dragState.current.active) return;
    const el = dragScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x    = e.pageX - el.offsetLeft;
    const y    = e.pageY - el.offsetTop;
    const walkX = (x - dragState.current.startX) * 1.2;
    const walkY = (y - dragState.current.startY) * 1.2;
    el.scrollLeft = dragState.current.scrollLeft - walkX;
    el.scrollTop  = dragState.current.scrollTop  - walkY;
  }, []);

  const onDragEnd = useCallback(() => {
    dragState.current.active = false;
    const el = dragScrollRef.current;
    if (!el) return;
    el.style.cursor    = 'grab';
    el.style.userSelect = '';
  }, []);

  const [viewingInvoice, setViewingInvoice]   = useState(null);
  const [invoiceLoading, setInvoiceLoading]   = useState(null);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting]               = useState(false);
  const [addItemsOrder, setAddItemsOrder] = useState(null);
  const [addItemsVariantModal, setAddItemsVariantModal] = useState(null);
  const addItemsVariantAddRef = useRef(null);
  const [removingItem, setRemovingItem] = useState(null);

  useEffect(() => {
    console.log('[OrdersManagement] User cafeId:', cafeId);
  }, [cafeId]);

  const { data: orders, loading, error: ordersError } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  useEffect(() => {
    console.log('[OrdersManagement] Orders received:', orders?.length || 0, 'orders');
    if (orders && orders.length > 0) {
      console.log('[OrdersManagement] Latest order:', orders[0]?.id, orders[0]?.orderStatus);
    }
  }, [orders]);

  useEffect(() => {
    if (ordersError) {
      console.error('[Orders] Firestore error:', ordersError);
      toast.error('Error loading orders: ' + ordersError);
    }
  }, [ordersError]);

  const sortedOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    return [...orders].sort((a, b) => {
      if (a.orderNumber && b.orderNumber) return b.orderNumber - a.orderNumber;
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });
  }, [orders]);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) audioRef.current = new Audio(NOTIFICATION_SOUND);
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) { console.log('Audio error:', e); }
  }, [soundEnabled]);

  useEffect(() => {
    if (!orders || orders.length === 0) {
      previousOrdersRef.current = orders || [];
      return;
    }
    const previousIds = previousOrdersRef.current.map(o => o.id);
    const newOrders = orders.filter(order => !previousIds.includes(order.id));
    if (newOrders.length > 0 && previousOrdersRef.current.length > 0) {
      const latestOrder = newOrders[0];
      setNewOrderNotification(latestOrder);
      playNotificationSound();
      setTimeout(() => setNewOrderNotification(null), 10000);
    }
    previousOrdersRef.current = orders;
  }, [orders, playNotificationSound]);

  const updateOrderStatus = async (orderId, status) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { orderStatus: status });
      toast.success('Order status updated');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const updatePaymentStatus = async (orderId, status) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { paymentStatus: status });
      toast.success('Payment status updated');
    } catch (error) {
      console.error('Error updating payment:', error);
      toast.error('Failed to update payment');
    }
  };

  const handleSoftDelete = async (orderId) => {
    setDeleting(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });
      toast.success('Order removed');
      setDeleteConfirmId(null);
      if (expandedOrder === orderId) setExpandedOrder(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to remove order');
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveItem = useCallback(async (orderId, itemIndex) => {
    setRemovingItem(null);
    try {
      const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
      const orderRef  = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) { toast.error('Order not found'); return; }
      const orderData = orderSnap.data();
      const items = Array.isArray(orderData.items) ? [...orderData.items] : [];
      if (itemIndex < 0 || itemIndex >= items.length) { toast.error('Item index out of range'); return; }
      const removedItem = items[itemIndex];
      items.splice(itemIndex, 1);
      if (items.length === 0) {
        await updateDoc(orderRef, {
          items: [], subtotalAmount: 0, taxAmount: 0,
          serviceChargeAmount: 0, gstAmount: 0, totalAmount: 0,
          orderStatus: 'cancelled', updatedAt: serverTimestamp(),
        });
        toast.success(`Last item removed — order #${String(orderData.orderNumber || '').padStart(3, '0')} cancelled`);
        return;
      }
      const { grandTotal: newSubtotal } = calculateOrderTotals(items);
      const cid = orderData.cafeId;
      let cafe = {};
      if (cid) { const cs = await getDoc(doc(db, 'cafes', cid)); if (cs.exists()) cafe = cs.data(); }
      const newTax      = cafe?.taxEnabled           ? newSubtotal * safeNum(cafe.taxRate)           / 100 : 0;
      const newSC       = cafe?.serviceChargeEnabled ? newSubtotal * safeNum(cafe.serviceChargeRate) / 100 : 0;
      const newGST      = cafe?.gstEnabled           ? newSubtotal * safeNum(cafe.gstRate)           / 100 : 0;
      const newPlatform = cafe?.platformFeeEnabled    ? safeNum(cafe.platformFeeAmount)                    : 0;
      const newTotal = Math.max(0, Math.round(newSubtotal + newTax + newSC + newGST + newPlatform));
      await updateDoc(orderRef, {
        items, subtotalAmount: newSubtotal, taxAmount: newTax,
        serviceChargeAmount: newSC, gstAmount: newGST, totalAmount: newTotal,
        updatedAt: serverTimestamp(),
      });
      toast.success(`"${removedItem?.name || 'Item'}" removed from order`);
    } catch (err) {
      console.error('[RemoveItem] Failed:', err);
      toast.error('Failed to remove item from order');
    }
  }, []);

  const filteredOrders = useMemo(() => {
    let filtered = (sortedOrders || []).filter(o => !o.isDeleted);
    if (statusFilter !== 'all') filtered = filtered.filter(order => order.orderStatus === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.customerName?.toLowerCase().includes(q) ||
        order.customerPhone?.toLowerCase().includes(q) ||
        order.id.toLowerCase().includes(q) ||
        String(order.orderNumber || '').includes(q)
      );
    }
    if (startDate) {
      const start = new Date(startDate); start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(order => {
        const orderDate = order.createdAt?.toDate?.() || new Date(0);
        return orderDate >= start;
      });
    }
    if (endDate) {
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(order => {
        const orderDate = order.createdAt?.toDate?.() || new Date(0);
        return orderDate <= end;
      });
    }
    return filtered;
  }, [sortedOrders, statusFilter, searchQuery, startDate, endDate]);

  const csvData = useMemo(() => {
    return filteredOrders.map(order => ({
      'Order #': order.orderNumber ? `#${String(order.orderNumber).padStart(3, '0')}` : order.id,
      'Date': order.createdAt?.toDate?.().toLocaleDateString() || '',
      'Time': order.createdAt?.toDate?.().toLocaleTimeString() || '',
      'Customer Name': order.customerName || '',
      'Phone': order.customerPhone || '',
      'Order Type': order.orderType || '',
      'Table/Address': order.tableNumber || order.deliveryAddress || '',
      'Items': order.items?.map(item => `${item.name}${item.selectedVariant ? ` (${item.selectedVariant})` : ''} x${item.quantity}`).join(', ') || '',
      'Total': order.totalAmount || order.total || 0,
      'Payment Mode': order.paymentMode || '',
      'Payment Status': order.paymentStatus || '',
      'Order Status': order.orderStatus || '',
      'Special Instructions': order.specialInstructions || '',
    }));
  }, [filteredOrders]);

  const getStatusBadge = (status) => {
    const styles = {
      new:       'bg-blue-500/15 text-blue-400 border-blue-500/25',
      preparing: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
      completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
    };
    return styles[status] || styles.new;
  };

  const getPaymentBadge = (status) => {
    return status === 'paid'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
      : 'bg-red-500/15 text-red-400 border-red-500/25';
  };

  const formatOrderNumber = (num) => num ? `#${String(num).padStart(3, '0')}` : '-';
  const getItemsCount = (items) => {
    if (!items || !items.length) return '0 items';
    const totalItems = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    return `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
  };
  const dismissNotification = () => setNewOrderNotification(null);

  const handleViewInvoice = async (orderId, e) => {
    if (e) e.stopPropagation();
    if (!orderId) { toast.error('Invalid order'); return; }
    setInvoiceLoading(orderId);
    try {
      const { data, error } = await getInvoiceByOrderId(orderId);
      if (error) console.warn('[Invoice] getInvoiceByOrderId error (will use fallback):', error);
      if (!error && data) { setInvoiceLoading(null); setViewingInvoice(data); return; }
      const orderObj = orders?.find(o => o.id === orderId);
      if (!orderObj) { setInvoiceLoading(null); toast.error('Order data not found'); return; }
      const { invoiceId, error: genError } = await ensureInvoiceForOrder(orderId, orderObj, cafe || {});
      if (genError || !invoiceId) {
        const synthetic = {
          orderId, orderNumber: orderObj.orderNumber, cafeId: orderObj.cafeId,
          cafeName: cafe?.name || '', cafeAddress: cafe?.address || '',
          cafePhone: cafe?.phone || '', cafeGstNumber: cafe?.gstNumber || '',
          currencySymbol: orderObj.currencySymbol || cafe?.currencySymbol || '₹',
          customerName: orderObj.customerName || '', customerPhone: orderObj.customerPhone || '',
          tableNumber: orderObj.tableNumber || '', orderType: orderObj.orderType || 'dine-in',
          deliveryAddress: orderObj.deliveryAddress || '', items: orderObj.items || [],
          subtotalAmount: orderObj.subtotalAmount ?? orderObj.totalAmount ?? 0,
          gstAmount: orderObj.gstAmount ?? orderObj.taxAmount ?? 0, taxAmount: orderObj.taxAmount ?? 0,
          serviceChargeAmount: orderObj.serviceChargeAmount ?? 0,
          totalAmount: orderObj.totalAmount ?? orderObj.total ?? 0,
          paymentMode: orderObj.paymentMode || 'counter', paymentStatus: orderObj.paymentStatus || 'pending',
          invoiceNumber: null, orderTime: orderObj.createdAt, createdAt: orderObj.createdAt,
        };
        setInvoiceLoading(null); setViewingInvoice(synthetic); return;
      }
      const { data: fresh } = await getInvoiceByOrderId(orderId);
      setInvoiceLoading(null);
      setViewingInvoice(fresh || { orderId, orderNumber: orderObj.orderNumber });
    } catch (err) { console.error('[Invoice] handleViewInvoice unexpected error:', err); setInvoiceLoading(null); toast.error('Failed to load invoice'); }
  };

  const handleDownloadInvoice = async (orderId, e) => {
    if (e) e.stopPropagation();
    if (!orderId) { toast.error('Invalid order'); return; }
    setInvoiceLoading(orderId);
    try {
      const { data, error } = await getInvoiceByOrderId(orderId);
      if (error) console.warn('[Invoice] getInvoiceByOrderId error (will use fallback):', error);
      if (!error && data) { setInvoiceLoading(null); setViewingInvoice({ ...data, _autoPrint: true }); return; }
      const orderObj = orders?.find(o => o.id === orderId);
      if (!orderObj) { setInvoiceLoading(null); toast.error('Order data not found'); return; }
      const { invoiceId, error: genError } = await ensureInvoiceForOrder(orderId, orderObj, cafe || {});
      if (genError || !invoiceId) {
        const synthetic = {
          orderId, orderNumber: orderObj.orderNumber, cafeId: orderObj.cafeId,
          cafeName: cafe?.name || '', cafeAddress: cafe?.address || '',
          cafePhone: cafe?.phone || '', cafeGstNumber: cafe?.gstNumber || '',
          currencySymbol: orderObj.currencySymbol || cafe?.currencySymbol || '₹',
          customerName: orderObj.customerName || '', customerPhone: orderObj.customerPhone || '',
          tableNumber: orderObj.tableNumber || '', orderType: orderObj.orderType || 'dine-in',
          deliveryAddress: orderObj.deliveryAddress || '', items: orderObj.items || [],
          subtotalAmount: orderObj.subtotalAmount ?? orderObj.totalAmount ?? 0,
          gstAmount: orderObj.gstAmount ?? orderObj.taxAmount ?? 0, taxAmount: orderObj.taxAmount ?? 0,
          serviceChargeAmount: orderObj.serviceChargeAmount ?? 0,
          totalAmount: orderObj.totalAmount ?? orderObj.total ?? 0,
          paymentMode: orderObj.paymentMode || 'counter', paymentStatus: orderObj.paymentStatus || 'pending',
          invoiceNumber: null, orderTime: orderObj.createdAt, createdAt: orderObj.createdAt, _autoPrint: true,
        };
        setInvoiceLoading(null); setViewingInvoice(synthetic); return;
      }
      const { data: fresh } = await getInvoiceByOrderId(orderId);
      setInvoiceLoading(null);
      setViewingInvoice({ ...(fresh || { orderId }), _autoPrint: true });
    } catch (err) { console.error('[Invoice] handleDownloadInvoice unexpected error:', err); setInvoiceLoading(null); toast.error('Failed to download invoice'); }
  };

  const formatWhatsAppNumber = (raw) => {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const handleSendInvoiceWA = (order, e) => {
    if (e) e.stopPropagation();
    if (!order) return;
    const phone = formatWhatsAppNumber(order.customerPhone || '');
    if (!phone) { toast.error('No customer phone number on this order'); return; }
    try {
      const msg = generateInvoiceMessage(order, { name: cafe?.name || '', currencySymbol: order.currencySymbol || cafeCurrency });
      window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    } catch (err) { console.error('[WA-Invoice]', err); toast.error('Failed to open WhatsApp'); }
  };

  const isConfirmingRemove = (orderId, itemIndex) =>
    removingItem?.orderId === orderId && removingItem?.itemIndex === itemIndex;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="om-root space-y-5 relative" style={{ fontFamily: T.font }}>

      {/* ── Invoice Modal ─────────────────────────────────────────── */}
      {viewingInvoice && <InvoiceModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />}

      {/* ── External Order Modal ──────────────────────────────────── */}
      {showExternalModal && (
        <ExternalOrderModal
          onClose={() => setShowExternalModal(false)}
          onSuccess={(id, num) => toast.success(`Order #${String(num).padStart(3, '0')} added to kitchen queue`)}
        />
      )}

      {/* ── Add Items Modal ───────────────────────────────────────── */}
      {addItemsOrder && (
        <div style={{ visibility: addItemsVariantModal ? 'hidden' : 'visible' }}>
          <AddItemsToOrderModal
            order={addItemsOrder}
            cafeCurrency={cafeCurrency}
            onClose={() => setAddItemsOrder(null)}
            setVariantModal={setAddItemsVariantModal}
            variantAddRef={addItemsVariantAddRef}
          />
        </div>
      )}

      {/* ── Variant Picker ────────────────────────────────────────── */}
      {addItemsVariantModal && (() => {
        const vItem     = addItemsVariantModal;
        const CUR_V     = addItemsOrder?.currencySymbol || cafeCurrency || '₹';
        const fmt_v     = n => (parseFloat(n) || 0).toFixed(2);
        const variants  = vItem._resolvedVariants || [];
        return (
          <div className="fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setAddItemsVariantModal(null)} />
            <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
              <div
                className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden"
                style={{ background: 'linear-gradient(180deg, #111111, #0D0D0D)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -20px 60px rgba(0,0,0,0.7)' }}
                onClick={e => e.stopPropagation()}
              >
                {/* Grip */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                  <div style={{ width: 36, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.12)' }} />
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div>
                    <h3 className="text-white font-bold text-base" style={{ fontFamily: T.display }}>Select Size</h3>
                    <p className="text-xs mt-0.5" style={{ color: T.muted }}>{vItem.name}</p>
                  </div>
                  <button
                    onClick={() => setAddItemsVariantModal(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <X className="w-4 h-4" style={{ color: T.muted }} />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-2.5 pb-8">
                  {variants.map((v, vi) => (
                    <button
                      key={vi}
                      onClick={() => { setAddItemsVariantModal(null); addItemsVariantAddRef.current?.(vItem, v); }}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl transition-all font-bold"
                      style={{ background: T.goldDim, border: `1px solid ${T.goldBdr}`, color: T.gold }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.22)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = T.goldDim; }}
                    >
                      <span className="text-sm">{v.name}</span>
                      <span className="text-sm">{CUR_V}{fmt_v(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── New Order Notification ────────────────────────────────── */}
      <AnimatePresence>
        {newOrderNotification && (
          <motion.div
            initial={{ opacity: 0, y: -80, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.94 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="fixed top-4 right-4 z-50 p-5 rounded-2xl max-w-sm"
            style={{
              background: 'linear-gradient(135deg, #D4AF37 0%, #B8962E 100%)',
              boxShadow: '0 20px 60px rgba(212,175,55,0.4), 0 0 0 1px rgba(255,255,255,0.15)',
            }}
            data-testid="new-order-notification"
          >
            <button
              onClick={dismissNotification}
              className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(0,0,0,0.15)' }}
            >
              <X className="w-3.5 h-3.5 text-black" />
            </button>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.15)' }}>
                <Bell className="w-5 h-5 text-black animate-bounce" />
              </div>
              <div>
                <p className="font-bold text-sm text-black/70 uppercase tracking-wider mb-0.5">New Order 🚨</p>
                <p className="font-black text-2xl text-black mb-1" style={{ fontFamily: T.display }}>
                  {formatOrderNumber(newOrderNotification.orderNumber)}
                </p>
                {newOrderNotification.orderType === 'dine-in' && newOrderNotification.tableNumber && (
                  <p className="font-semibold text-sm text-black/80">Table {newOrderNotification.tableNumber}</p>
                )}
                <p className="text-sm text-black/70">{getItemsCount(newOrderNotification.items)}</p>
                <p className="font-black text-xl text-black mt-1">
                  {newOrderNotification.currencySymbol || cafeCurrency}{(newOrderNotification.totalAmount || 0).toFixed(0)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2
            className="text-2xl font-extrabold text-white display-font"
            style={{ fontFamily: T.display, letterSpacing: '-0.02em' }}
          >
            Orders Management
          </h2>
          <p className="text-xs mt-0.5" style={{ color: T.muted }}>Real-time live updates enabled</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowExternalModal(true)}
            data-testid="add-external-order-btn"
            className="om-btn om-btn-gold"
            style={{ padding: '9px 16px', fontSize: '13px', borderRadius: '10px' }}
          >
            <PlusCircle className="w-4 h-4" />
            Add External Order
          </button>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="sound-toggle"
            className="om-btn"
            style={{
              padding: '9px 14px',
              fontSize: '13px',
              borderRadius: '10px',
              background: soundEnabled ? T.goldDim : 'rgba(255,255,255,0.04)',
              color: soundEnabled ? T.gold : T.muted,
              border: `1px solid ${soundEnabled ? T.goldBdr : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            <Volume2 className="w-4 h-4" />
            {soundEnabled ? 'Sound On' : 'Sound Off'}
          </button>
        </div>
      </div>

      {/* ── Search + Export ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.muted }} />
          <input
            type="text"
            data-testid="order-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="om-input"
            style={{ paddingLeft: '2.5rem', height: '44px' }}
            placeholder="Search by order #, customer name, or phone…"
          />
        </div>
        <CSVLink
          data={csvData}
          filename={`orders-${new Date().toISOString().split('T')[0]}.csv`}
          className="om-btn"
          style={{
            background: 'rgba(16,185,129,0.12)',
            color: '#34d399',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '10px',
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
          }}
          data-testid="export-csv-btn"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </CSVLink>
      </div>

      {/* ── Date Filters ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1.5" style={{ color: T.muted }}>Start Date</label>
          <input
            type="date"
            data-testid="start-date-filter"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="om-input"
            style={{ height: '44px', colorScheme: 'dark' }}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1.5" style={{ color: T.muted }}>End Date</label>
          <input
            type="date"
            data-testid="end-date-filter"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="om-input"
            style={{ height: '44px', colorScheme: 'dark' }}
          />
        </div>
      </div>

      {/* ── Status Filter Tabs ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {['all', 'new', 'preparing', 'completed', 'cancelled'].map(status => (
          <button
            key={status}
            data-testid={`filter-${status}`}
            onClick={() => setStatusFilter(status)}
            className={`om-filter-tab ${statusFilter === status ? 'om-filter-tab-active' : 'om-filter-tab-inactive'}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Loading / Empty ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3" style={{ color: T.muted }}>
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: `${T.gold} transparent transparent transparent` }} />
          <span className="text-sm">Loading orders…</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="om-card flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={{ background: T.goldDim }}>
            <AlertCircle className="w-6 h-6" style={{ color: T.gold }} />
          </div>
          <p className="font-semibold text-white">No orders found</p>
          <p className="text-sm" style={{ color: T.muted }}>New orders will appear here in real-time</p>
        </div>
      ) : (
        <>
          {/* ── Desktop Table ────────────────────────────────────── */}
          <div className="hidden lg:block om-card overflow-hidden">
            <div
              ref={dragScrollRef}
              className="overflow-x-auto overflow-y-auto om-scroll"
              style={{ scrollBehavior: 'smooth', cursor: 'grab' }}
              onMouseDown={onDragMouseDown}
              onMouseMove={onDragMouseMove}
              onMouseUp={onDragEnd}
              onMouseLeave={onDragEnd}
            >
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.35)' }}>
                    {['Order #', 'Customer', 'Phone', 'Type', 'Table', 'Items', 'Total', 'Payment', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: T.gold }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, orderIdx) => (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`om-table-row om-fadein ${expandedOrder === order.id ? 'om-row-expanded' : ''}`}
                        style={{ animationDelay: `${Math.min(orderIdx * 30, 300)}ms`, animationFillMode: 'both' }}
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        data-testid={`order-row-${order.id}`}
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-black text-base" style={{ color: T.gold, fontFamily: T.display }}>{formatOrderNumber(order.orderNumber)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-white font-medium text-sm">{order.customerName || '—'}</td>
                        <td className="px-4 py-3.5 text-sm" style={{ color: T.muted }}>{order.customerPhone || '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-white capitalize">{order.orderType || '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-white">
                          {order.orderType === 'dine-in' ? (order.tableNumber || '—') :
                           order.orderType === 'delivery' ? <span style={{ color: T.muted, fontSize: 11 }}>Delivery</span> : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-sm" style={{ color: T.muted }}>{getItemsCount(order.items)}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-bold text-sm" style={{ color: T.gold }}>
                            {order.currencySymbol || cafeCurrency}{(order.totalAmount || order.total || 0).toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`om-badge ${getPaymentBadge(order.paymentStatus)}`}>
                            {order.paymentStatus || 'pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`om-badge capitalize ${getStatusBadge(order.orderStatus)}`}>
                            {order.orderStatus || 'new'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-1.5">
                              <select
                                data-testid={`order-status-${order.id}`}
                                value={order.orderStatus || 'new'}
                                onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                className="om-select"
                              >
                                <option value="new">New</option>
                                <option value="preparing">Preparing</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                              <select
                                data-testid={`payment-status-${order.id}`}
                                value={order.paymentStatus || 'pending'}
                                onChange={(e) => updatePaymentStatus(order.id, e.target.value)}
                                className="om-select"
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                              </select>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              <button onClick={(e) => handleViewInvoice(order.id, e)} disabled={invoiceLoading === order.id} data-testid={`view-invoice-${order.id}`} className="om-btn om-btn-invoice" title="View Invoice">
                                <Eye className="w-3 h-3" />{invoiceLoading === order.id ? '…' : 'Invoice'}
                              </button>
                              <button onClick={(e) => handleDownloadInvoice(order.id, e)} disabled={invoiceLoading === order.id} data-testid={`download-invoice-${order.id}`} className="om-btn om-btn-ghost" title="Download PDF">
                                <FileText className="w-3 h-3" />PDF
                              </button>
                              {order.customerPhone && (
                                <button onClick={(e) => handleSendInvoiceWA(order, e)} data-testid={`wa-invoice-${order.id}`} className="om-btn om-btn-green" title="Send via WhatsApp">
                                  <MessageSquare className="w-3 h-3" />WA
                                </button>
                              )}
                              {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                                <button onClick={(e) => { e.stopPropagation(); setAddItemsOrder(order); }} data-testid={`add-items-${order.id}`} className="om-btn om-btn-blue" title="Add Items">
                                  <Plus className="w-3 h-3" />Add
                                </button>
                              )}
                              {deleteConfirmId === order.id ? (
                                <div className="flex gap-1">
                                  <button onClick={() => handleSoftDelete(order.id)} disabled={deleting} className="om-btn om-btn-danger" style={{ background: '#ef4444', color: '#fff', borderColor: 'transparent' }}>
                                    {deleting ? '…' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(null)} className="om-btn om-btn-ghost">Cancel</button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(order.id); }}
                                  className="om-btn om-btn-ghost"
                                  style={{ padding: '6px 8px' }}
                                  title="Remove order"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded row ───────────────────────────── */}
                      {expandedOrder === order.id && (
                        <tr>
                          <td colSpan="10" style={{ background: 'rgba(212,175,55,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="px-5 py-5 grid grid-cols-2 gap-8">
                              {/* Items column */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.gold }}>Order Items</p>
                                <div className="space-y-2">
                                  {order.items?.map((item, idx) => {
                                    const CUR_D = order.currencySymbol || cafeCurrency;
                                    const basePrice  = item.isFree ? 0 : (parseFloat(item.basePrice ?? item.price) || 0);
                                    const qty        = parseInt(item.quantity) || 1;
                                    const addons     = Array.isArray(item.addons) ? item.addons : [];
                                    const addonTotal = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                                    const itemTotal  = (basePrice + addonTotal) * qty;
                                    return (
                                      <div key={idx} className="pb-2.5 mb-0.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <div className="flex justify-between items-start gap-2">
                                          <span className="text-white font-medium text-sm flex-1">
                                            {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''} ×{qty}
                                          </span>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            {item.isFree ? (
                                              <span className="om-badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', borderColor: 'rgba(16,185,129,0.2)' }}>FREE</span>
                                            ) : (
                                              <span className="font-semibold text-sm" style={{ color: T.gold }}>{CUR_D}{itemTotal.toFixed(2)}</span>
                                            )}
                                            {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                                              isConfirmingRemove(order.id, idx) ? (
                                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                  <button onClick={() => handleRemoveItem(order.id, idx)} data-testid={`confirm-remove-item-${order.id}-${idx}`} className="om-btn" style={{ background: '#ef4444', color: '#fff', padding: '3px 8px', fontSize: 11 }}>Confirm</button>
                                                  <button onClick={() => setRemovingItem(null)} className="om-btn om-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}>Cancel</button>
                                                </div>
                                              ) : (
                                                <button onClick={(e) => { e.stopPropagation(); setRemovingItem({ orderId: order.id, itemIndex: idx }); }} data-testid={`remove-item-${order.id}-${idx}`} className="om-btn om-btn-danger" style={{ padding: '3px 8px', fontSize: 11 }}>
                                                  <X className="w-2.5 h-2.5" />Remove
                                                </button>
                                              )
                                            )}
                                          </div>
                                        </div>
                                        <p className="text-xs mt-0.5 ml-1" style={{ color: '#555' }}>
                                          {item.isFree
                                            ? <span style={{ color: '#10B981' }}>FREE · was {CUR_D}{(parseFloat(item.actualPrice) || 0).toFixed(2)}</span>
                                            : <>Base: {CUR_D}{basePrice.toFixed(2)}{qty > 1 ? ` ×${qty}` : ''}</>
                                          }
                                        </p>
                                        {item.comboItems?.length > 0 && (
                                          <div className="ml-3 mt-0.5 space-y-0.5">
                                            {item.comboItems.map((ci, cIdx) => (
                                              <p key={cIdx} className="text-xs" style={{ color: T.dim }}>— {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}</p>
                                            ))}
                                          </div>
                                        )}
                                        {addons.length > 0 ? (
                                          <div className="ml-3 mt-1.5 space-y-0.5">
                                            <p className="text-xs font-semibold" style={{ color: '#777' }}>Add-ons ({addons.length}):</p>
                                            {addons.map((a, ai) => {
                                              const aQty = parseInt(a.quantity) || 1;
                                              const aPrice = parseFloat(a.price) || 0;
                                              return (
                                                <div key={ai} className="flex justify-between text-xs" style={{ color: '#666' }}>
                                                  <span>╰ {a.name} ×{aQty}</span>
                                                  <span>+{CUR_D}{(aPrice * aQty).toFixed(2)}</span>
                                                </div>
                                              );
                                            })}
                                            <div className="flex justify-between text-xs pt-0.5" style={{ color: '#777' }}>
                                              <span>Add-ons total</span><span>+{CUR_D}{(addonTotal * qty).toFixed(2)}</span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-xs ml-3 mt-0.5 italic" style={{ color: T.dim }}>No add-ons selected</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {/* Totals breakdown */}
                                  {(() => {
                                    const CUR_D = order.currencySymbol || cafeCurrency;
                                    const sN = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
                                    const { itemsTotal, addonsTotal, grandTotal: itemsPlusAddons } = calculateOrderTotals(order?.items || []);
                                    const fees = sN(order?.gstAmount) + sN(order?.taxAmount) + sN(order?.serviceChargeAmount) + sN(order?.platformFeeAmount);
                                    const computedGrand = itemsPlusAddons + fees;
                                    return (
                                      <div className="pt-2.5 mt-1 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                        <div className="flex justify-between text-xs" style={{ color: '#5f5f5f' }}><span>Items Total</span><span>{CUR_D}{itemsTotal.toFixed(2)}</span></div>
                                        {addonsTotal > 0 && <div className="flex justify-between text-xs" style={{ color: '#5f5f5f' }}><span>Add-ons Total</span><span>+{CUR_D}{addonsTotal.toFixed(2)}</span></div>}
                                        {sN(order?.gstAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>GST</span><span>+{CUR_D}{sN(order.gstAmount).toFixed(2)}</span></div>}
                                        {sN(order?.taxAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>Tax</span><span>+{CUR_D}{sN(order.taxAmount).toFixed(2)}</span></div>}
                                        {sN(order?.serviceChargeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>Service Charge</span><span>+{CUR_D}{sN(order.serviceChargeAmount).toFixed(2)}</span></div>}
                                        {sN(order?.platformFeeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>Platform Fee</span><span>+{CUR_D}{sN(order.platformFeeAmount).toFixed(2)}</span></div>}
                                        <div className="flex justify-between font-bold text-sm pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                          <span className="text-white">Grand Total</span>
                                          <span style={{ color: T.gold }}>{CUR_D}{computedGrand.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Details column */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.gold }}>Details</p>
                                <div className="space-y-2.5 text-sm">
                                  <div className="flex items-center gap-2.5" style={{ color: T.muted }}>
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: T.goldDim }}>
                                      <Clock className="w-3 h-3" style={{ color: T.gold }} />
                                    </div>
                                    <span>{order.createdAt?.toDate?.().toLocaleString() || 'N/A'}</span>
                                  </div>
                                  {order.customerPhone && (
                                    <div className="flex items-center gap-2.5" style={{ color: T.muted }}>
                                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: T.goldDim }}>
                                        <Phone className="w-3 h-3" style={{ color: T.gold }} />
                                      </div>
                                      <span>{order.customerPhone}</span>
                                    </div>
                                  )}
                                  {order.orderType === 'delivery' && order.deliveryAddress && (
                                    <div className="flex items-start gap-2.5" style={{ color: T.muted }}>
                                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: T.goldDim }}>
                                        <MapPin className="w-3 h-3" style={{ color: T.gold }} />
                                      </div>
                                      <span>{order.deliveryAddress}</span>
                                    </div>
                                  )}
                                  {order?.orderType === 'delivery' && (
                                    <div className="text-sm mt-1">
                                      <strong style={{ color: T.gold }}>Delivery Address:</strong>
                                      <div className="text-white mt-0.5">{order?.deliveryAddress || 'N/A'}</div>
                                    </div>
                                  )}
                                  {order.specialInstructions && (
                                    <div className="mt-3 p-3 rounded-xl" style={{ background: T.goldDim, border: `1px solid ${T.goldBdr}` }}>
                                      <p className="text-xs font-semibold mb-1" style={{ color: T.gold }}>Special Instructions</p>
                                      <p className="text-white text-sm">{order.specialInstructions}</p>
                                    </div>
                                  )}
                                  <div className="text-xs mt-1" style={{ color: T.muted }}>
                                    Payment: {order.paymentMode === 'counter' ? 'Pay at Counter' : order.paymentMode === 'table' ? 'Pay on Table' : 'Prepaid (UPI)'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Mobile Cards ──────────────────────────────────────── */}
          <div className="lg:hidden space-y-3">
            {filteredOrders.map((order, orderIdx) => (
              <div
                key={order.id}
                data-testid={`order-card-${order.id}`}
                className="om-mobile-card om-fadein"
                style={{ animationDelay: `${Math.min(orderIdx * 40, 400)}ms`, animationFillMode: 'both' }}
              >
                {/* Card header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center w-10 h-10 rounded-xl" style={{ background: T.goldDim, border: `1px solid ${T.goldBdr}` }}>
                      <span className="font-black text-xs" style={{ color: T.gold, fontFamily: T.display }}>{formatOrderNumber(order.orderNumber)}</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{order.customerName || '—'}</p>
                      <p className="text-xs mt-0.5" style={{ color: T.muted }}>{order.customerPhone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="font-bold text-sm" style={{ color: T.gold }}>
                      {order.currencySymbol || cafeCurrency}{(order.totalAmount || order.total || 0).toFixed(0)}
                    </span>
                    <span className={`om-badge capitalize ${getStatusBadge(order.orderStatus)}`}>{order.orderStatus || 'new'}</span>
                  </div>
                </div>

                {/* Card meta strip */}
                <div className="px-4 pb-3.5 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="text-xs capitalize" style={{ color: T.muted }}>{order.orderType}</span>
                  {order.orderType === 'dine-in' && order.tableNumber && (
                    <span className="text-xs text-white">· Table {order.tableNumber}</span>
                  )}
                  {order.orderType === 'delivery' && order.deliveryAddress && (
                    <span className="text-xs truncate max-w-[160px]" style={{ color: T.muted }}>📍 {order.deliveryAddress}</span>
                  )}
                  <span className="text-xs" style={{ color: T.muted }}>· {getItemsCount(order.items)}</span>
                  <span className={`om-badge ${getPaymentBadge(order.paymentStatus)}`}>{order.paymentStatus || 'pending'}</span>
                </div>

                {/* Expanded panel */}
                {expandedOrder === order.id && (
                  <div className="px-4 pb-5 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: T.gold }}>Items</p>
                      <div className="space-y-2">
                        {order.items?.map((item, idx) => {
                          const CUR_M      = order.currencySymbol || cafeCurrency;
                          const basePrice  = item.isFree ? 0 : (parseFloat(item.basePrice ?? item.price) || 0);
                          const qty        = parseInt(item.quantity) || 1;
                          const addons     = Array.isArray(item.addons) ? item.addons : [];
                          const addonTotal = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                          const itemTotal  = (basePrice + addonTotal) * qty;
                          return (
                            <div key={idx} className="pb-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-white font-medium text-sm flex-1">
                                  {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''} ×{qty}
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {item.isFree ? (
                                    <span className="om-badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', borderColor: 'rgba(16,185,129,0.2)' }}>FREE</span>
                                  ) : (
                                    <span className="font-semibold text-sm" style={{ color: T.gold }}>{CUR_M}{itemTotal.toFixed(2)}</span>
                                  )}
                                  {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                                    isConfirmingRemove(order.id, idx) ? (
                                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => handleRemoveItem(order.id, idx)} data-testid={`confirm-remove-item-mobile-${order.id}-${idx}`} className="om-btn" style={{ background: '#ef4444', color: '#fff', padding: '3px 8px', fontSize: 11 }}>Confirm</button>
                                        <button onClick={() => setRemovingItem(null)} className="om-btn om-btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}>Cancel</button>
                                      </div>
                                    ) : (
                                      <button onClick={(e) => { e.stopPropagation(); setRemovingItem({ orderId: order.id, itemIndex: idx }); }} data-testid={`remove-item-mobile-${order.id}-${idx}`} className="om-btn om-btn-danger" style={{ padding: '3px 8px', fontSize: 11 }}>
                                        <X className="w-2.5 h-2.5" />Remove
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                              <p className="text-xs mt-0.5 ml-1" style={{ color: '#555' }}>
                                {item.isFree
                                  ? <span style={{ color: '#10B981' }}>FREE · was {CUR_M}{(parseFloat(item.actualPrice) || 0).toFixed(2)}</span>
                                  : <>Base: {CUR_M}{basePrice.toFixed(2)}{qty > 1 ? ` ×${qty}` : ''}</>
                                }
                              </p>
                              {item.comboItems?.length > 0 && (
                                <div className="ml-3 mt-0.5 space-y-0.5">
                                  {item.comboItems.map((ci, cIdx) => (
                                    <p key={cIdx} className="text-xs" style={{ color: T.dim }}>— {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}</p>
                                  ))}
                                </div>
                              )}
                              {addons.length > 0 ? (
                                <div className="ml-3 mt-1.5 space-y-0.5">
                                  <p className="text-xs font-semibold" style={{ color: '#777' }}>Add-ons ({addons.length}):</p>
                                  {addons.map((a, ai) => {
                                    const aQty = parseInt(a.quantity) || 1;
                                    const aPrice = parseFloat(a.price) || 0;
                                    return (
                                      <div key={ai} className="flex justify-between text-xs" style={{ color: '#666' }}>
                                        <span>╰ {a.name} ×{aQty}</span>
                                        <span>+{CUR_M}{(aPrice * aQty).toFixed(2)}</span>
                                      </div>
                                    );
                                  })}
                                  <div className="flex justify-between text-xs pt-0.5" style={{ color: '#777' }}><span>Add-ons total</span><span>+{CUR_M}{(addonTotal * qty).toFixed(2)}</span></div>
                                </div>
                              ) : (
                                <p className="text-xs ml-3 mt-0.5 italic" style={{ color: T.dim }}>No add-ons selected</p>
                              )}
                            </div>
                          );
                        })}

                        {/* Totals (mobile) */}
                        {(() => {
                          const CUR_M = order.currencySymbol || cafeCurrency;
                          const sN = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
                          const { itemsTotal, addonsTotal, grandTotal: itemsPlusAddons } = calculateOrderTotals(order?.items || []);
                          const fees = sN(order?.gstAmount) + sN(order?.taxAmount) + sN(order?.serviceChargeAmount) + sN(order?.platformFeeAmount);
                          const computedGrand = itemsPlusAddons + fees;
                          return (
                            <div className="pt-2.5 mt-1 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                              <div className="flex justify-between text-xs" style={{ color: '#5f5f5f' }}><span>Items Total</span><span>{CUR_M}{itemsTotal.toFixed(2)}</span></div>
                              {addonsTotal > 0 && <div className="flex justify-between text-xs" style={{ color: '#5f5f5f' }}><span>Add-ons Total</span><span>+{CUR_M}{addonsTotal.toFixed(2)}</span></div>}
                              {sN(order?.gstAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>GST</span><span>+{CUR_M}{sN(order.gstAmount).toFixed(2)}</span></div>}
                              {sN(order?.taxAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>Tax</span><span>+{CUR_M}{sN(order.taxAmount).toFixed(2)}</span></div>}
                              {sN(order?.serviceChargeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>Service Charge</span><span>+{CUR_M}{sN(order.serviceChargeAmount).toFixed(2)}</span></div>}
                              {sN(order?.platformFeeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#4f4f4f' }}><span>Platform Fee</span><span>+{CUR_M}{sN(order.platformFeeAmount).toFixed(2)}</span></div>}
                              <div className="flex justify-between font-bold text-sm pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                <span className="text-white">Grand Total</span>
                                <span style={{ color: T.gold }}>{CUR_M}{computedGrand.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {order?.orderType === 'delivery' && (
                      <div className="text-sm p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <strong style={{ color: T.gold }}>Delivery Address</strong>
                        <div className="text-white mt-1 text-sm">{order?.deliveryAddress || 'N/A'}</div>
                      </div>
                    )}

                    {order.specialInstructions && (
                      <div className="p-3 rounded-xl" style={{ background: T.goldDim, border: `1px solid ${T.goldBdr}` }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: T.gold }}>Special Instructions</p>
                        <p className="text-white text-sm">{order.specialInstructions}</p>
                      </div>
                    )}

                    {/* Status selects */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <select value={order.orderStatus || 'new'} onChange={(e) => updateOrderStatus(order.id, e.target.value)} className="om-select flex-1" style={{ padding: '9px 12px', fontSize: 13, borderRadius: 10 }}>
                        <option value="new">New</option>
                        <option value="preparing">Preparing</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <select value={order.paymentStatus || 'pending'} onChange={(e) => updatePaymentStatus(order.id, e.target.value)} className="om-select flex-1" style={{ padding: '9px 12px', fontSize: 13, borderRadius: 10 }}>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>

                    {/* Invoice actions */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleViewInvoice(order.id, e)} disabled={invoiceLoading === order.id} className="om-btn om-btn-invoice flex-1 justify-center py-2.5" style={{ borderRadius: 10 }}>
                        <Eye className="w-4 h-4" />{invoiceLoading === order.id ? 'Loading…' : 'View Invoice'}
                      </button>
                      <button onClick={(e) => handleDownloadInvoice(order.id, e)} disabled={invoiceLoading === order.id} className="om-btn om-btn-ghost flex-1 justify-center py-2.5" style={{ borderRadius: 10 }}>
                        <FileText className="w-4 h-4" />Download PDF
                      </button>
                    </div>
                    {order.customerPhone && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handleSendInvoiceWA(order, e)} className="om-btn om-btn-green w-full justify-center py-2.5" style={{ borderRadius: 10 }}>
                          <MessageSquare className="w-4 h-4" />Send Invoice via WhatsApp
                        </button>
                      </div>
                    )}
                    {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setAddItemsOrder(order)} data-testid={`add-items-mobile-${order.id}`} className="om-btn om-btn-blue w-full justify-center py-2.5" style={{ borderRadius: 10 }}>
                          <Plus className="w-4 h-4" />Add Items to Order
                        </button>
                      </div>
                    )}
                    <div onClick={(e) => e.stopPropagation()}>
                      {deleteConfirmId === order.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => handleSoftDelete(order.id)} disabled={deleting} className="om-btn flex-1 justify-center py-2.5" style={{ background: '#ef4444', color: '#fff', borderRadius: 10, border: 'none' }}>
                            {deleting ? 'Removing…' : 'Confirm Remove'}
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="om-btn om-btn-ghost flex-1 justify-center py-2.5" style={{ borderRadius: 10 }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(order.id)} className="om-btn om-btn-ghost w-full justify-center py-2.5" style={{ borderRadius: 10, color: '#555' }}>
                          <Trash2 className="w-3.5 h-3.5" />Remove Order
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer count */}
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
            <p className="text-xs" style={{ color: T.muted }}>
              Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} · Real-time updates enabled
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default OrdersManagement;
