/**
 * OrderTracking.jsx
 * Route: /track/:orderId
 *
 * VISUAL UPGRADE — ZERO LOGIC CHANGES.
 * THEME FIX — contrast improvements throughout (dark-mode internal):
 *  - Secondary/muted text: #7a6a3a → #a89050  (passes WCAG AA on #050505 bg)
 *  - Tertiary text: #555 → #888, #666 → #999, #777 → #aaa
 *  - Near-invisible text (#333, #2a2a2a, #444) lifted to visible values
 *  - Card/section borders lifted for better separation
 *  - FloatingParticles opacity lifted 0.18 → 0.25
 *  - Item name color: #F5F0DC → #ffffff for crisp readability
 *  - Combo/addon sub-text lifted from #555 → #888
 *  - Bill breakdown rows: #7a6a3a → #a89050
 *  - Footer credit text: #2a2a2a → #555
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

// ─── Inject premium fonts ─────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('ot-premium-css')) {
  const el = document.createElement('style');
  el.id = 'ot-premium-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&family=Playfair+Display:wght@700;800;900&display=swap');
    .ot { font-family: 'Nunito', system-ui, sans-serif; }
    .ot-serif  { font-family: 'Playfair Display', serif !important; }
    .ot-fun    { font-family: 'Fredoka One', system-ui, sans-serif !important; }
    .ot-scrollbar::-webkit-scrollbar { display: none; }
    .ot-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `;
  document.head.appendChild(el);
}

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

// ─── Floating food emoji particles ───────────────────────────────────────────
const FOOD_EMOJIS = ['☕', '🍰', '🥐', '🧁', '🍩', '🫖', '🍫', '🥗', '🍜', '🧆'];
const FloatingParticles = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none select-none" aria-hidden style={{ zIndex: 0 }}>
    {FOOD_EMOJIS.map((emoji, i) => (
      <motion.span
        key={i}
        className="absolute text-2xl opacity-0"
        style={{
          left: `${5 + i * 9}%`,
          top:  `${15 + (i % 4) * 20}%`,
        }}
        animate={{
          y:       [0, -22, 0],
          // THEME FIX: opacity lifted from 0.18 → 0.25 for visible ambient decoration
          opacity: [0, 0.25, 0],
          rotate:  [0, i % 2 === 0 ? 14 : -14, 0],
        }}
        transition={{
          duration: 3.8 + i * 0.45,
          repeat:   Infinity,
          delay:    i * 0.6,
          ease:     'easeInOut',
        }}
      >
        {emoji}
      </motion.span>
    ))}
  </div>
);

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
                    ? {
                        scale:     [1, 1.18, 1],
                        boxShadow: [
                          `0 0 0px ${s.color}00`,
                          `0 0 20px ${s.color}80`,
                          `0 0 0px ${s.color}00`,
                        ],
                      }
                    : {}}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500"
                  style={{
                    background:  done
                      ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)`
                      : 'rgba(255,255,255,0.06)',
                    borderColor: done ? s.color : 'rgba(255,255,255,0.14)',
                    boxShadow:   done && !active ? `0 2px 10px ${s.color}40` : undefined,
                  }}
                >
                  {active
                    ? <span className="text-base select-none">{s.emoji}</span>
                    : <Icon className="w-4 h-4" style={{ color: done ? '#000' : '#666' }} />
                  }
                </motion.div>
                <p
                  className="text-xs mt-1.5 text-center leading-tight ot"
                  style={{
                    color:      done ? s.color : '#666',
                    fontWeight: active ? 800 : 500,
                    maxWidth:   52,
                    fontFamily: "'Nunito', sans-serif",
                  }}
                >
                  {s.label.split(' ')[0]}
                </p>
              </div>
              {/* Connector */}
              {i < STATUSES.length - 1 && (
                <motion.div
                  className="flex-1 h-0.5 mx-1 mb-5 rounded-full transition-all duration-700"
                  style={{
                    background: i < currentStep
                      ? `linear-gradient(90deg, ${STATUSES[i].color}, ${STATUSES[i+1].color})`
                      : 'rgba(255,255,255,0.10)',
                  }}
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
    paid:    { label: 'Paid',    color: '#10B981', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)'  },
    pending: { label: 'Pending', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)'  },
    failed:  { label: 'Failed',  color: '#EF4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.35)'   },
  };
  const cfg = map[status] || map.pending;
  const emoji = cfg.label === 'Paid' ? '✅' : cfg.label === 'Failed' ? '❌' : '⏳';
  return (
    <span
      className="text-xs font-black px-2.5 py-1 rounded-full ot"
      style={{ background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}`, fontFamily: "'Nunito', sans-serif" }}
    >
      {emoji} {cfg.label}
    </span>
  );
};

// ─── ADDON TRANSPARENCY: shared per-item breakdown renderer ──────────────────
const ItemAddonBreakdown = ({ item, CUR, primary }) => {
  const basePrice  = parseFloat(item.basePrice ?? item.price) || 0;
  const qty        = parseInt(item.quantity) || 1;
  const addons     = Array.isArray(item.addons) ? item.addons : [];
  const comboItems = Array.isArray(item.comboItems) ? item.comboItems : [];
  const addonTotal = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);

  return (
    <div className="mt-1 space-y-0.5">
      {/* THEME FIX: #666 → #999 */}
      <p className="text-xs ml-1 ot" style={{ color: '#999' }}>
        Base: {CUR}{basePrice.toFixed(2)}{qty > 1 ? ` ×${qty}` : ''}
      </p>
      {comboItems.length > 0 && (
        <div className="ml-3 space-y-0.5">
          {comboItems.map((ci, cIdx) => (
            // THEME FIX: #555 → #888
            <p key={cIdx} className="text-xs ot" style={{ color: '#888' }}>
              — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
            </p>
          ))}
        </div>
      )}
      {addons.length > 0 ? (
        <div className="ml-3 space-y-0.5 pt-0.5">
          {/* THEME FIX: #888 → #aaa */}
          <p className="text-xs font-black ot" style={{ color: '#aaa' }}>
            ✨ Add-ons ({addons.length}):
          </p>
          {addons.map((a, ai) => {
            const aQty   = parseInt(a.quantity) || 1;
            const aPrice = parseFloat(a.price)  || 0;
            return (
              <div key={ai} className="flex justify-between text-xs ot" style={{ color: '#999' }}>
                <span>╰ {a.name} ×{aQty}</span>
                {/* THEME FIX: #888 → #aaa */}
                <span style={{ color: '#aaa' }}>+{CUR}{(aPrice * aQty).toFixed(2)}</span>
              </div>
            );
          })}
          <div className="flex justify-between text-xs pt-0.5 border-t ot" style={{ color: '#999', borderColor: 'rgba(255,255,255,0.08)' }}>
            <span>Add-ons total</span>
            <span>+{CUR}{(addonTotal * qty).toFixed(2)}</span>
          </div>
        </div>
      ) : (
        // THEME FIX: #444 → #777
        <p className="text-xs ml-3 italic ot" style={{ color: '#777' }}>No add-ons selected</p>
      )}
    </div>
  );
};

// ─── Add More Items Modal ─────────────────────────────────────────────────────

const AddMoreItemsModal = ({ order, onClose, primary, setAddonModal, setVariantModal, variantAddRef, directAddRef }) => {
  const CUR = order?.currencySymbol || '₹';
  const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

  const [menuItems,   setMenuItems  ] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [newCart,     setNewCart    ] = useState([]);
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

  useEffect(() => {
    if (directAddRef) directAddRef.current = directAddToNewCart;
  }, [directAddToNewCart, directAddRef]);

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

  const newCartTotal = newCart.reduce((s, i) => {
    if (!i) return s;
    const base     = parseFloat(i.basePrice ?? i.price) || 0;
    const addons   = Array.isArray(i.addons) ? i.addons : [];
    const addonAmt = addons.reduce((as, a) => as + (parseFloat(a?.price) || 0) * (parseInt(a?.quantity) || 1), 0);
    return s + (base + addonAmt) * (parseInt(i.quantity) || 1);
  }, 0);

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

    if (Array.isArray(item.addons) && item.addons.length > 0) {
      setAddonModal({
        ...item,
        price:           resolvedPrice,
        basePrice:       resolvedPrice,
        selectedVariant: resolvedVariantName,
        selectedSize:    resolvedVariantName,
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
        selectedVariant: i.selectedVariant || null,
        comboItems:      i.comboItems      || [],
      }));
      const updatedItems = [...existingItems, ...newItems];

      const newSubtotal = updatedItems.reduce((s, item) => {
        const base     = safeNum(item.basePrice ?? item.price);
        const addonAmt = (item.addons || []).reduce(
          (as, a) => as + safeNum(a.price) * (parseInt(a.quantity) || 1), 0
        );
        return s + (base + addonAmt) * safeNum(item.quantity);
      }, 0);

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
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center ot"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />

        <motion.div
          className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #1a1400 0%, #110d00 100%)',
            border: '1.5px solid rgba(212,175,55,0.22)',
            boxShadow: '0 -20px 60px rgba(212,175,55,0.12)',
            maxHeight: '90vh',
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Grip */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(212,175,55,0.35)' }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(212,175,55,0.16)' }}>
            <div>
              <h3 className="text-white font-black text-lg ot-serif flex items-center gap-2">
                🛒 Add More Items
              </h3>
              {/* THEME FIX: #7a6a3a → #a89050 */}
              <p className="text-xs mt-0.5 ot font-semibold" style={{ color: '#a89050' }}>
                Order #{String(order.orderNumber || '').padStart(3, '0')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all"
              style={{ background: 'rgba(212,175,55,0.12)', border: '1.5px solid rgba(212,175,55,0.25)' }}
            >
              <X className="w-4 h-4" style={{ color: '#D4AF37' }} />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search menu..."
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm outline-none font-semibold ot"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1.5px solid rgba(212,175,55,0.20)',
                  color: '#fff',
                  fontFamily: "'Nunito', sans-serif",
                }}
              />
            </div>
          </div>

          {/* Menu list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 ot-scrollbar">
            {loadingMenu ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="text-4xl"
                >
                  🍳
                </motion.div>
                {/* THEME FIX: #7a6a3a → #a89050 */}
                <p className="text-sm font-bold ot" style={{ color: '#a89050' }}>Loading menu…</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-2">🫙</div>
                {/* THEME FIX: #5a4a1a → #8a7030 */}
                <p className="text-sm font-bold ot" style={{ color: '#8a7030' }}>No items found</p>
              </div>
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
                const displayPrice = hasVariants ? `from ${CUR}${fmt(minPrice)}` : `${CUR}${fmt(item.price)}`;
                const btnLabel     = hasVariants ? '📏 Size' : hasAddons ? '✨ Custom' : '➕ Add';

                return (
                  <motion.div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1.5px solid rgba(255,255,255,0.09)',
                    }}
                    whileHover={{
                      borderColor: 'rgba(212,175,55,0.30)',
                      background: 'rgba(212,175,55,0.07)',
                    }}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-white text-sm font-black truncate ot">{item.name}</p>
                      {item.category && (
                        // THEME FIX: #5a4a1a → #8a7030
                        <p className="text-xs mt-0.5 ot font-semibold" style={{ color: '#8a7030' }}>{item.category}</p>
                      )}
                      {hasVariants ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {itemVariants.map((v, vi) => (
                            <span key={vi} className="text-xs px-1.5 py-0.5 rounded-full ot font-black"
                              style={{ background: 'rgba(212,175,55,0.14)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.30)', fontSize: '0.65rem' }}>
                              {v.name || `S${vi+1}`} {CUR}{fmt(v.price)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-black mt-0.5 ot-fun" style={{ color: primary }}>
                          {displayPrice}
                        </p>
                      )}
                    </div>

                    {!hasVariants && qty > 0 ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => removeFromNewCart(item.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}
                        >
                          <Minus className="w-3 h-3 text-white" />
                        </button>
                        <span className="text-white font-black text-sm min-w-[16px] text-center ot-fun">{qty}</span>
                        <button
                          onClick={() => {
                            const entry = newCart.find(i => i.id === item.id);
                            if (entry) directAddToNewCart({ ...entry });
                            else addToNewCart(item);
                          }}
                          className="w-7 h-7 rounded-full flex items-center justify-center font-black"
                          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, color: '#000' }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        whileHover={{ scale: 1.04 }}
                        onClick={() => addToNewCart(item)}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-xs whitespace-nowrap ot"
                        style={{
                          background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                          color: '#000',
                          boxShadow: `0 2px 10px rgba(212,175,55,0.3)`,
                          fontFamily: "'Nunito', sans-serif",
                        }}
                      >
                        {btnLabel}
                      </motion.button>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {newCart.length > 0 && (
            <div className="px-4 py-4 flex-shrink-0 space-y-3"
              style={{ borderTop: '1px solid rgba(212,175,55,0.16)', background: 'rgba(0,0,0,0.2)' }}>
              <p className="text-xs font-black ot" style={{ color: '#D4AF37' }}>
                🛒 Cart · {newCart.length} item{newCart.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1">
                {newCart.map((item, idx) => {
                  if (!item) return null;
                  const addons   = Array.isArray(item.addons) ? item.addons : [];
                  const addonAmt = addons.reduce((s, a) => s + (parseFloat(a?.price) || 0) * (parseInt(a?.quantity) || 1), 0);
                  const lineTotal = ((parseFloat(item.basePrice ?? item.price) || 0) + addonAmt) * (parseInt(item.quantity) || 1);
                  return (
                    <div key={idx} className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                      <span>
                        {item.name}
                        {(item.selectedVariant || item.selectedSize) ? ` (${item.selectedVariant || item.selectedSize})` : ''}
                        {' '}× {item.quantity}
                        {addons.length > 0 ? ` +${addons.length} add-on${addons.length > 1 ? 's' : ''}` : ''}
                      </span>
                      <span className="text-white font-bold">{CUR}{fmt(lineTotal)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-black pt-1" style={{ borderTop: '1px solid rgba(212,175,55,0.14)' }}>
                  <span style={{ color: '#a89050' }} className="ot">New items total</span>
                  <span style={{ color: primary }} className="ot-fun">{CUR}{fmt(newCartTotal)}</span>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60 ot"
                style={{
                  background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                  boxShadow: `0 6px 20px rgba(212,175,55,0.3)`,
                  color: '#000',
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                {saving ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Updating Order…</>
                ) : (
                  <><ShoppingCart className="w-4 h-4" />🛒 Add to Order · {CUR}{fmt(newCartTotal)}</>
                )}
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>
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
  const [addMoreAddonModal, setAddMoreAddonModal] = useState(null);
  const [addMoreVariantModal, setAddMoreVariantModal] = useState(null);
  const directAddRef   = useRef(null);
  const variantAddRef  = useRef(null);

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

  // ── Real-time listener — UNCHANGED ───────────────────────────────────────────
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
    'dine-in':  `🪑 Dine-In${order?.tableNumber ? ` · Table ${order.tableNumber}` : ''}`,
    'takeaway': '🥡 Takeaway',
    'delivery': '🛵 Delivery',
  }[orderType] || orderType;

  const payModeLabel = {
    counter:  '🏪 Pay at Counter',
    table:    '🪑 Pay at Table',
    prepaid:  '📱 UPI (Prepaid)',
    online:   '💳 Online Payment',
  }[order?.paymentMode] || (order?.paymentMode || '—');

  const orderTime = (() => {
    const ts = order?.createdAt;
    try {
      const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
      return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    } catch { return ''; }
  })();

  // ── SINGLE SOURCE OF TRUTH — FREE ITEM FIX applied here ─────────────────────
  const safeN = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const _calcTotals = (itemList) => {
    if (!Array.isArray(itemList)) return { itemsTotal: 0, addonsTotal: 0, grandTotal: 0 };
    let itemsTotal = 0, addonsTotal = 0;
    for (const item of itemList) {
      if (!item) continue;
      const base     = item.isFree ? 0 : safeN(item.basePrice ?? item.price);
      const qty      = safeN(item.quantity) || 1;
      const addons   = Array.isArray(item.addons) ? item.addons : [];
      const addonAmt = addons.reduce((s, a) => {
        if (!a) return s;
        return s + safeN(a.price) * (parseInt(a.quantity) || 1);
      }, 0);
      itemsTotal  += base     * qty;
      addonsTotal += addonAmt * qty;
    }
    return { itemsTotal, addonsTotal, grandTotal: itemsTotal + addonsTotal };
  };

  const { itemsTotal: itemsBaseTotal, addonsTotal: addonsGrandTotal, grandTotal: computedSubtotal } = _calcTotals(order?.items || []);
  const feesTotal          = safeN(order?.gstAmount) + safeN(order?.taxAmount) + safeN(order?.serviceChargeAmount) + safeN(order?.platformFeeAmount);
  const computedGrandTotal = computedSubtotal + feesTotal;

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center ot" style={{ background: '#050505' }}>
      <div className="text-center">
        <motion.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl mb-4 select-none"
        >
          ☕
        </motion.div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 rounded-full border-4 border-t-transparent mx-auto"
          style={{ borderColor: `${primary}40`, borderTopColor: primary }}
        />
      </div>
    </div>
  );

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center text-center p-6 ot" style={{ background: '#050505' }}>
      <div>
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-7xl mb-4 select-none"
        >
          🫙
        </motion.div>
        <h1 className="text-2xl font-black text-white mb-2 ot-serif">
          Order Not Found
        </h1>
        {/* THEME FIX: #A3A3A3 was fine — kept as-is */}
        <p className="font-semibold" style={{ color: '#A3A3A3' }}>
          This order doesn't exist or may have expired.
        </p>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-8 px-4 ot"
      style={{ background: '#050505', fontFamily: "'Nunito', sans-serif" }}
    >
      {/* Floating food particles */}
      <FloatingParticles />

      {/* Ambient glow — status color */}
      <motion.div
        animate={{ opacity: [0.08, 0.20, 0.08], scale: [1, 1.08, 1] }}
        transition={{ duration: 3.5, repeat: Infinity }}
        className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: statusCfg.color, zIndex: 0 }}
      />

      {/* Secondary ambient orb */}
      <motion.div
        animate={{ opacity: [0.04, 0.12, 0.04], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 5.5, repeat: Infinity, delay: 2 }}
        className="fixed bottom-1/4 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none"
        style={{ background: primary, zIndex: 0 }}
      />

      <div className="relative w-full max-w-sm" style={{ zIndex: 1 }}>

        {/* ── Main card ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="rounded-3xl overflow-hidden"
          style={{
            background:     'linear-gradient(180deg, rgba(18,14,5,0.98) 0%, rgba(10,8,0,0.99) 100%)',
            border:         '1.5px solid rgba(212,175,55,0.20)',
            backdropFilter: 'blur(24px)',
            boxShadow:      '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.10)',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-8 pb-5 text-center" style={{ borderBottom: '1px solid rgba(212,175,55,0.12)' }}>
            <motion.div
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="text-5xl mb-3 select-none"
            >
              {statusCfg.emoji}
            </motion.div>
            <h1 className="text-3xl font-black text-white ot-serif">
              Order #{String(order.orderNumber || '').padStart(3, '0')}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-2.5 flex-wrap">
              {/* THEME FIX: #7a6a3a → #a89050 throughout header meta */}
              <span className="text-xs ot font-semibold" style={{ color: '#a89050' }}>{orderTypeLabel}</span>
              {orderTime && (
                <>
                  {/* THEME FIX: separator #333 → #555 */}
                  <span style={{ color: '#555' }} className="text-xs">·</span>
                  <span className="text-xs ot font-semibold" style={{ color: '#a89050' }}>🕐 {orderTime}</span>
                </>
              )}
              <span style={{ color: '#555' }} className="text-xs">·</span>
              <PaymentBadge status={payStatus} />
            </div>
          </div>

          {/* Progress bar */}
          <ProgressBar status={order.orderStatus} />

          {/* Current status bubble */}
          <AnimatePresence mode="wait">
            <motion.div
              key={order.orderStatus}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.3 }}
              className="mx-6 mb-5 p-4 rounded-2xl text-center"
              style={{
                background: `${statusCfg.color}12`,
                border:     `1.5px solid ${statusCfg.color}40`,
                boxShadow:  `0 4px 20px ${statusCfg.color}18`,
              }}
            >
              <motion.p
                className="font-black text-base ot-serif"
                style={{ color: statusCfg.color }}
                animate={{ opacity: [1, 0.8, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {statusCfg.emoji} {statusCfg.label}
              </motion.p>
              {/* THEME FIX: #A3A3A3 was fine — kept */}
              <p className="font-semibold text-sm mt-1 ot" style={{ color: '#A3A3A3' }}>{statusCfg.desc}</p>
              {/* THEME FIX: hint #555 → #888 */}
              {statusCfg.hint && (
                <p className="text-xs mt-1 italic ot" style={{ color: '#888' }}>{statusCfg.hint}</p>
              )}
            </motion.div>
          </AnimatePresence>

          {/* ── Customer info ─────────────────────────────────────────────── */}
          {(order.customerName || order.customerPhone || order.deliveryAddress) && (
            <div className="mx-6 mb-4 p-3.5 rounded-2xl space-y-2"
              style={{
                background: 'rgba(212,175,55,0.05)',
                border: '1.5px solid rgba(212,175,55,0.14)',
              }}>
              {order.customerName && (
                <div className="flex items-center gap-2 text-xs ot font-semibold" style={{ color: '#A3A3A3' }}>
                  {/* THEME FIX: icon color #7a6a3a → #a89050 */}
                  <User className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a89050' }} />
                  👤 {order.customerName}
                </div>
              )}
              {order.customerPhone && (
                <div className="flex items-center gap-2 text-xs ot font-semibold" style={{ color: '#A3A3A3' }}>
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a89050' }} />
                  📞 {order.customerPhone}
                </div>
              )}
              {order.deliveryAddress && (
                <div className="flex items-start gap-2 text-xs ot font-semibold" style={{ color: '#A3A3A3' }}>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#a89050' }} />
                  📍 {order.deliveryAddress}
                </div>
              )}
            </div>
          )}

          {/* ── Items breakdown ───────────────────────────────────────────── */}
          <div className="px-6 pb-2">
            <p className="text-xs uppercase tracking-widest font-black mb-3 ot" style={{ color: '#D4AF37', letterSpacing: '0.08em' }}>
              🍽️ Your Order
            </p>

            <div className="space-y-3">
              {items.map((item, i) => {
                const basePrice  = item.isFree ? 0 : safeN(item.basePrice ?? item.price);
                const qty        = parseInt(item.quantity) || 1;
                const addons     = Array.isArray(item.addons) ? item.addons : [];
                const addonTotal = addons.reduce((s, a) => s + safeN(a.price) * (parseInt(a.quantity) || 1), 0);
                const lineTotal  = (basePrice + addonTotal) * qty;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-2xl p-3.5 space-y-1"
                    style={{
                      background: 'rgba(212,175,55,0.05)',
                      border: '1.5px solid rgba(212,175,55,0.14)',
                    }}
                  >
                    {/* Item name + qty + line total */}
                    <div className="flex justify-between items-start">
                      {/* THEME FIX: #F5F0DC → #ffffff for crisp readability */}
                      <span className="font-black text-sm flex-1 pr-2 ot" style={{ color: '#ffffff' }}>
                        🍴 {item.name}
                        {(item.selectedVariant || item.selectedSize)
                          ? ` (${item.selectedVariant || item.selectedSize})`
                          : ''}
                        {' '}<span className="ot-fun" style={{ color: primary }}>×{qty}</span>
                      </span>
                      {item.isFree ? (
                        <span
                          className="text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0 ot"
                          style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1.5px solid rgba(16,185,129,0.35)' }}
                        >
                          🎁 FREE
                        </span>
                      ) : (
                        <span className="font-black text-sm flex-shrink-0 ot-fun" style={{ color: primary }}>
                          {CUR}{fmt(lineTotal)}
                        </span>
                      )}
                    </div>

                    {/* Base price line */}
                    {item.isFree ? (
                      <p className="text-xs ot font-semibold" style={{ color: '#10B981' }}>
                        🎁 FREE · was {CUR}{fmt(item.actualPrice ?? item.basePrice ?? item.price)}
                      </p>
                    ) : (
                      // THEME FIX: #666 → #999
                      <p className="text-xs ot font-semibold" style={{ color: '#999' }}>
                        Base: {CUR}{fmt(basePrice)}{qty > 1 ? ` ×${qty}` : ''}
                      </p>
                    )}

                    {/* comboItems */}
                    {Array.isArray(item.comboItems) && item.comboItems.length > 0 && (
                      <div className="ml-2 space-y-0.5 pt-0.5">
                        {item.comboItems.map((ci, cIdx) => (
                          // THEME FIX: #555 → #888
                          <p key={cIdx} className="text-xs ot font-semibold" style={{ color: '#888' }}>
                            🔗 {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Add-ons */}
                    {addons.length > 0 ? (
                      // THEME FIX: divider border opacity lifted
                      <div className="ml-2 pt-1.5 space-y-0.5 border-t" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
                        {/* THEME FIX: #888 → #aaa */}
                        <p className="text-xs font-black ot" style={{ color: '#aaa' }}>
                          ✨ Add-ons ({addons.length}):
                        </p>
                        {addons.map((a, ai) => {
                          const aQty   = parseInt(a.quantity) || 1;
                          const aPrice = safeN(a.price);
                          return (
                            <div key={ai} className="flex justify-between text-xs ot font-semibold">
                              {/* THEME FIX: #777 → #999 */}
                              <span style={{ color: '#999' }}>╰ {a.name} ×{aQty}</span>
                              {/* THEME FIX: #888 → #aaa */}
                              <span style={{ color: '#aaa' }}>+{CUR}{fmt(aPrice * aQty)}</span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between text-xs pt-0.5 ot font-semibold" style={{ color: '#999' }}>
                          <span>Add-ons total</span>
                          <span>+{CUR}{fmt(addonTotal * qty)}</span>
                        </div>
                      </div>
                    ) : (
                      // THEME FIX: #444 → #777
                      <p className="text-xs ml-2 italic ot font-semibold" style={{ color: '#777' }}>No add-ons selected</p>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* ── Full order total breakdown ── */}
            {/* THEME FIX: divider border lifted */}
            <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(212,175,55,0.14)' }}>
              {/* THEME FIX: all breakdown row labels #7a6a3a → #a89050 */}
              <div className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                <span>🧮 Items Total</span>
                <span>{CUR}{fmt(itemsBaseTotal)}</span>
              </div>
              {addonsGrandTotal > 0 && (
                <div className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                  <span>✨ Add-ons Total</span>
                  <span>+{CUR}{fmt(addonsGrandTotal)}</span>
                </div>
              )}
              {(order?.gstAmount || 0) > 0 && (
                <div className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                  <span>🏛️ GST</span>
                  <span>+{CUR}{fmt(order.gstAmount)}</span>
                </div>
              )}
              {(order?.taxAmount || 0) > 0 && (
                <div className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                  <span>🏛️ Tax</span>
                  <span>+{CUR}{fmt(order.taxAmount)}</span>
                </div>
              )}
              {(order?.serviceChargeAmount || 0) > 0 && (
                <div className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                  <span>🛎️ Service Charge</span>
                  <span>+{CUR}{fmt(order.serviceChargeAmount)}</span>
                </div>
              )}
              {(order?.platformFeeAmount || 0) > 0 && (
                <div className="flex justify-between text-xs ot font-semibold" style={{ color: '#a89050' }}>
                  <span>💻 Platform Fee</span>
                  <span>+{CUR}{fmt(order.platformFeeAmount)}</span>
                </div>
              )}
              <motion.div
                className="flex justify-between font-black text-sm pt-2 pb-1"
                style={{ borderTop: '1px solid rgba(212,175,55,0.16)' }}
                animate={{ opacity: [1, 0.85, 1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <span className="text-white ot">💵 Grand Total</span>
                <span className="ot-fun" style={{ color: primary, fontSize: '1.1rem' }}>{CUR}{fmt(computedGrandTotal)}</span>
              </motion.div>
            </div>

            {/* Payment mode */}
            <div className="mt-3 flex items-center justify-between text-xs pb-5">
              {/* THEME FIX: #7a6a3a → #a89050 */}
              <div className="flex items-center gap-1.5 ot font-semibold" style={{ color: '#a89050' }}>
                <CreditCard className="w-3.5 h-3.5" />
                {payModeLabel}
              </div>
              {order.specialInstructions && (
                // THEME FIX: #555 → #888
                <p className="text-xs italic max-w-[160px] truncate ot font-semibold" title={order.specialInstructions} style={{ color: '#888' }}>
                  📝 {order.specialInstructions}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <div className="flex gap-3 mt-4">
          {order.cafeId && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/cafe/${order.cafeId}`)}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm ot"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                boxShadow:  `0 6px 24px rgba(212,175,55,0.35)`,
                color: '#000',
                fontFamily: "'Nunito', sans-serif",
              }}
            >
              <Home className="w-4 h-4" />
              🏠 Back to Menu
            </motion.button>
          )}
          {order.customerPhone && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSendInvoice}
              disabled={waSending}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-black transition-all ot"
              style={{
                background: 'rgba(37,211,102,0.14)',
                border:     '1.5px solid rgba(37,211,102,0.35)',
                color:      '#25D366',
                fontFamily: "'Nunito', sans-serif",
              }}
              title="Send invoice to your WhatsApp"
            >
              {waSending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <MessageSquare className="w-4 h-4" />
              }
              💬 Invoice
            </motion.button>
          )}
        </div>

        {/* ── Add More Items button ── */}
        {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && order.cafeId && (
          <motion.button
            whileHover={{ scale: 1.02, borderColor: `rgba(212,175,55,0.50)` }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddMore(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all ot"
            style={{
              background: 'rgba(212,175,55,0.09)',
              border:     '1.5px solid rgba(212,175,55,0.30)',
              color:      primary,
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <Plus className="w-4 h-4" />
            ➕ Add More Items
          </motion.button>
        )}

        {/* ── Loyalty Promo ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(212,175,55,0.06))',
            border: '1.5px solid rgba(212,175,55,0.32)',
            boxShadow: '0 8px 32px rgba(212,175,55,0.12)',
          }}
        >
          <div className="p-5 text-center">
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, -5, 5, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="text-3xl mb-2 select-none"
            >
              🎁
            </motion.div>
            <p className="font-black text-base ot-serif" style={{ color: primary }}>
              Get 10% OFF on your next visit!
            </p>
            {/* THEME FIX: #7a6a3a → #a89050 */}
            <p className="text-sm mt-1 font-semibold ot" style={{ color: '#a89050' }}>
              Leave us a Google review and show it at the counter to redeem.
            </p>
            {googleReviewLink ? (
              <motion.a
                href={googleReviewLink}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full font-black text-sm transition-all ot"
                style={{
                  background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                  color: '#000',
                  boxShadow: `0 4px 16px rgba(212,175,55,0.35)`,
                  fontFamily: "'Nunito', sans-serif",
                  textDecoration: 'none',
                }}
                data-testid="google-review-link"
              >
                ⭐ Leave a Google Review
              </motion.a>
            ) : (
              // THEME FIX: #888 was already fine — kept
              <p className="text-xs mt-3 ot font-semibold" style={{ color: '#888' }}>
                Ask the café owner to add their Google Review link in Settings.
              </p>
            )}
          </div>
        </motion.div>

        {/* THEME FIX: footer credit #2a2a2a → #555 — visible but still subtle */}
        <p className="text-center text-xs mt-5 ot font-semibold" style={{ color: '#555' }}>
          Powered by SmartCafé OS · Branding Architect
        </p>
      </div>

      {/* ── Add More Items Modal ──────────────────────────────────────────── */}
      {showAddMore && order && (
        <div style={{ visibility: (addMoreAddonModal || addMoreVariantModal) ? 'hidden' : 'visible' }}>
          <AddMoreItemsModal
            order={order}
            onClose={() => setShowAddMore(false)}
            primary={primary}
            setAddonModal={setAddMoreAddonModal}
            setVariantModal={setAddMoreVariantModal}
            variantAddRef={variantAddRef}
            directAddRef={directAddRef}
          />
        </div>
      )}

      {/* AddOnModal at root level z-[200] */}
      {addMoreAddonModal && (
        <div className="fixed inset-0 z-[200]">
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
        </div>
      )}

      {/* Variant picker at root level z-[200] */}
      {addMoreVariantModal && (() => {
        const vItem     = addMoreVariantModal;
        const CUR_V     = order?.currencySymbol || '₹';
        const fmt_v     = n => (parseFloat(n) || 0).toFixed(2);
        const primary_v = '#D4AF37';
        const variants  = vItem._resolvedVariants || [];
        return (
          <div className="fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setAddMoreVariantModal(null)} />
            <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
              <div
                className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden ot"
                style={{
                  background: 'linear-gradient(180deg, #1a1400 0%, #110d00 100%)',
                  border: '1.5px solid rgba(212,175,55,0.28)',
                  boxShadow: '0 -20px 60px rgba(212,175,55,0.14)',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Grip */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                  <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(212,175,55,0.35)' }} />
                </div>
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(212,175,55,0.16)' }}>
                  <div>
                    <h3 className="text-white font-black text-base ot-serif">📏 Select Size</h3>
                    {/* THEME FIX: #7a6a3a → #a89050 */}
                    <p className="text-xs mt-0.5 ot font-semibold" style={{ color: '#a89050' }}>{vItem.name}</p>
                  </div>
                  <button
                    onClick={() => setAddMoreVariantModal(null)}
                    className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all"
                    style={{ background: 'rgba(212,175,55,0.12)', border: '1.5px solid rgba(212,175,55,0.25)' }}
                  >
                    <X className="w-4 h-4" style={{ color: primary_v }} />
                  </button>
                </div>
                <div className="px-4 py-3 space-y-2.5 pb-8">
                  {variants.map((v, vi) => (
                    <motion.button
                      key={vi}
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ background: 'rgba(212,175,55,0.20)' }}
                      onClick={() => {
                        setAddMoreVariantModal(null);
                        variantAddRef.current?.(vItem, v);
                      }}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl font-black transition-all ot"
                      style={{
                        background: 'rgba(212,175,55,0.12)',
                        border: '1.5px solid rgba(212,175,55,0.32)',
                        color: primary_v,
                        fontFamily: "'Nunito', sans-serif",
                      }}
                    >
                      <span className="text-sm">
                        {vi === 0 ? '🥤' : vi === 1 ? '🧋' : '🫙'} {v.name}
                      </span>
                      <span className="text-sm ot-fun">{CUR_V}{fmt_v(v.price)}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default OrderTracking;
