/**
 * CafeOrderingPremium.jsx
 * Route: /cafe/:cafeId  (loaded when cafe.planType === 'premium')
 *
 * Ultra-premium ordering experience:
 * - Glassmorphism UI
 * - Framer Motion animations
 * - Video / GIF / Image menu cards
 * - Flying add-to-cart animation
 * - Offer detail modal (2-step flow)
 * - Full order + checkout flow (same backend as basic page)
 *
 * IMPORTANT: Does NOT modify existing CafeOrdering.jsx
 */

import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, doc, addDoc,
  serverTimestamp, runTransaction, onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createInvoiceForOrder } from '../services/invoiceService';
import { deductStockForOrder } from '../services/inventoryService';
import { deductStockByRecipe } from '../services/recipeService';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import {
  ShoppingCart, Plus, Minus, X, Search, Coffee,
  ChevronDown, AlertCircle, Sparkles, Gift, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { MediaPreview, getMediaType } from '../components/MediaUpload';

// ─── helpers ──────────────────────────────────────────────────────────────────

const hexToRgb = (hex) => {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
    : { r: 212, g: 175, b: 55 };
};

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

// ─── Flying cart dot animation ────────────────────────────────────────────────

const FlyingDot = ({ from, to, onDone }) => {
  return (
    <motion.div
      className="fixed z-[9999] w-5 h-5 rounded-full bg-[#D4AF37] pointer-events-none shadow-lg shadow-[#D4AF37]/50"
      initial={{ x: from.x, y: from.y, scale: 1, opacity: 1 }}
      animate={{ x: to.x, y: to.y, scale: 0.3, opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
      onAnimationComplete={onDone}
    />
  );
};

// ─── Offer detail modal ───────────────────────────────────────────────────────

const OfferDetailModal = ({ offer, menuItems, CUR, onAdd, onClose, primary = '#D4AF37', theme }) => {
  const T = theme || {
    bgModal: 'rgba(10,10,10,0.95)',
    border:  'rgba(255,255,255,0.08)',
    text:    '#ffffff',
    textMuted: '#A3A3A3',
    bgInput: 'rgba(255,255,255,0.05)',
  };

  const offerItems = (offer.items || []).map(i => {
    const menuItem = menuItems.find(m => m.id === i.itemId);
    return { ...i, image: menuItem?.image || '' };
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.95 }}
        animate={{ y: 0,  opacity: 1, scale: 1    }}
        exit={{    y: 60, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: T.bgModal,
          border: `1px solid ${T.border}`,
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Banner */}
        {offer.bannerImage && (
          <div className="w-full h-44 overflow-hidden">
            <MediaPreview url={offer.bannerImage} className="w-full h-full" alt={offer.title} />
          </div>
        )}

        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
                {offer.title}
              </h2>
              {offer.description && (
                <p className="text-sm mt-1" style={{ color: T.textMuted }}>{offer.description}</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-all flex-shrink-0" style={{ color: T.textMuted }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items breakdown */}
          {offerItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: T.textMuted }}>Includes</p>
              {offerItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: T.bgInput }}>
                  {item.image && (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                      <MediaPreview url={item.image} className="w-full h-full" alt={item.itemName} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: T.text }}>{item.itemName}</p>
                    <p className="text-xs" style={{ color: T.textMuted }}>
                      {CUR}{fmt(item.itemPrice)} × {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="p-4 rounded-xl" style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
            {offer.type === 'combo' && offer.comboPrice && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: T.textMuted }}>Combo Price</span>
                <span className="text-xl font-black" style={{ color: primary }}>{CUR}{fmt(offer.comboPrice)}</span>
              </div>
            )}
            {offer.type === 'discount' && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: T.textMuted }}>
                  {offer.discountType === 'percentage' ? `${offer.discountAmount}% off` : `${CUR}${fmt(offer.discountAmount)} off`}
                </span>
                <span className="text-xl font-black" style={{ color: primary }}>Save!</span>
              </div>
            )}
            {offer.type === 'buy_x_get_y' && (
              <p className="text-sm font-semibold" style={{ color: T.text }}>
                Buy {offer.buyQuantity} Get {offer.getQuantity} Free
              </p>
            )}
          </div>

          {/* Add to cart */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { onAdd(); onClose(); }}
            className="w-full py-4 rounded-xl text-black font-bold text-base flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 20px ${primary}40` }}
          >
            <ShoppingCart className="w-5 h-5" />
            Add to Cart
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Menu Item Card (premium) ─────────────────────────────────────────────────

const MenuCard = React.memo(({ item, CUR, cartQty, onAdd, onAddWithAnim, primary = '#D4AF37', theme }) => {
  const mediaType = getMediaType(item.image);
  const T = theme || {
    bgCard: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
    text: '#ffffff',
    textMuted: '#A3A3A3',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -6, boxShadow: `0 16px 40px rgba(0,0,0,0.2)` }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl overflow-hidden relative group cursor-pointer"
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Media */}
      <div className="relative overflow-hidden aspect-[4/3]">
        {item.image ? (
          <>
            {mediaType === 'video' ? (
              <video
                src={item.image}
                autoPlay muted loop playsInline
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            ) : (
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: `${primary}08` }}>
            <Coffee className="w-12 h-12" style={{ color: primary, opacity: 0.3 }} />
          </div>
        )}

        {/* Gradient overlay — stronger on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent transition-opacity duration-300 group-hover:opacity-80" />

        {/* Glow on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ boxShadow: `inset 0 0 30px ${primary}20` }} />

        {/* Category pill */}
        {item.category && (
          <div className="absolute top-3 left-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', color: primary, backdropFilter: 'blur(8px)', border: `1px solid ${primary}40` }}>
              {item.category}
            </span>
          </div>
        )}

        {/* Cart count badge */}
        {cartQty > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full text-black text-xs font-black flex items-center justify-center shadow-lg"
            style={{ background: primary }}
          >
            {cartQty}
          </motion.div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-base leading-tight" style={{ color: T.text }}>{item.name}</h3>
          <span className="font-black text-base flex-shrink-0" style={{ color: primary }}>{CUR}{fmt(item.price)}</span>
        </div>

        {/* Add button with ripple */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.02 }}
          onClick={(e) => onAddWithAnim(e, item)}
          className="w-full py-2.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}dd)`, boxShadow: `0 4px 16px ${primary}30` }}
        >
          <Plus className="w-4 h-4" />
          Add to Cart
        </motion.button>
      </div>
    </motion.div>
  );
});
MenuCard.displayName = 'MenuCard';

// ─── Main component ───────────────────────────────────────────────────────────

const CafeOrderingPremium = () => {
  const { cafeId } = useParams();
  const navigate   = useNavigate();
  const [cafe,          setCafe         ] = useState(null);
  const [menuItems,     setMenuItems    ] = useState([]);
  const [offers,        setOffers       ] = useState([]);
  const [cart,          setCart         ] = useState([]);
  const [loading,       setLoading      ] = useState(true);
  const [cafeNotFound,  setCafeNotFound ] = useState(false);
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [selectedCat,   setSelectedCat  ] = useState('all');
  const [showCart,      setShowCart     ] = useState(false);
  const [showCheckout,  setShowCheckout ] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [flyingDots,    setFlyingDots   ] = useState([]);
  const cartBtnRef = useRef(null);
  const unsubRef   = useRef([]);

  // Checkout form
  const [customerName,       setCustomerName      ] = useState('');
  const [customerPhone,      setCustomerPhone     ] = useState('');
  const [orderType,          setOrderType         ] = useState('dine-in');
  const [tableNumber,        setTableNumber       ] = useState('');
  const [deliveryAddress,    setDeliveryAddress   ] = useState('');
  const [paymentMode,        setPaymentMode       ] = useState('counter');
  const [specialInstructions,setSpecialInstructions] = useState('');
  const [orderPlacing,       setOrderPlacing      ] = useState(false);
  const [orderDone,          setOrderDone         ] = useState(false);
  const [orderNumber,        setOrderNumber       ] = useState(null);

  // ── Theme — reads cafe.primaryColor + cafe.mode from settings ─────────────
  const primary   = cafe?.primaryColor || '#D4AF37';
  const isLight   = cafe?.mode === 'light';
  const rgb        = hexToRgb(primary);
  const glow       = `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`;
  const glowSoft   = `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`;
  const CUR        = cafe?.currencySymbol || '₹';

  // Dynamic theme colours based on light/dark mode
  const T = {
    bg:          isLight ? '#f8f6f2'          : '#050505',
    bgCard:      isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.04)',
    bgOverlay:   isLight ? 'rgba(248,246,242,0.9)' : 'rgba(5,5,5,0.92)',
    bgModal:     isLight ? 'rgba(255,255,255,0.97)' : 'rgba(10,10,10,0.98)',
    bgInput:     isLight ? 'rgba(0,0,0,0.05)'  : 'rgba(255,255,255,0.06)',
    border:      isLight ? 'rgba(0,0,0,0.08)'  : 'rgba(255,255,255,0.08)',
    borderLight: isLight ? 'rgba(0,0,0,0.05)'  : 'rgba(255,255,255,0.05)',
    text:        isLight ? '#111111'            : '#ffffff',
    textMuted:   isLight ? '#666666'            : '#A3A3A3',
    textFaint:   isLight ? '#999999'            : '#555555',
    sticky:      isLight ? 'rgba(248,246,242,0.88)' : 'rgba(5,5,5,0.88)',
    heroGrad:    isLight
      ? `linear-gradient(180deg, ${primary}18 0%, transparent 100%)`
      : `linear-gradient(180deg, ${primary}15 0%, transparent 100%)`,
    cardBorder:  `1px solid ${isLight ? `rgba(0,0,0,0.07)` : `rgba(255,255,255,0.08)`}`,
  };

  // Cleanup
  useEffect(() => () => unsubRef.current.forEach(u => u?.()), []);

  // Load cafe
  useEffect(() => {
    if (!cafeId) { setCafeNotFound(true); setLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'cafes', cafeId), snap => {
      if (snap.exists()) { setCafe({ id: snap.id, ...snap.data() }); setLoading(false); }
      else { setCafeNotFound(true); setLoading(false); }
    }, () => { setCafeNotFound(true); setLoading(false); });
    unsubRef.current.push(unsub);
  }, [cafeId]);

  // Load menu
  useEffect(() => {
    if (!cafeId) return;
    const q = query(collection(db, 'menuItems'), where('cafeId', '==', cafeId), where('available', '==', true));
    const unsub = onSnapshot(q, snap => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubRef.current.push(unsub);
  }, [cafeId]);

  // Load offers
  useEffect(() => {
    if (!cafeId) return;
    const q = query(collection(db, 'offers'), where('cafeId', '==', cafeId), where('active', '==', true));
    const unsub = onSnapshot(q, snap => {
      setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubRef.current.push(unsub);
  }, [cafeId]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const cartTotal   = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const cartCount   = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartQtyFor  = (id) => cart.find(i => i.id === id)?.quantity || 0;

  const addToCart = useCallback((item) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (ex) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === id);
      if (!ex) return prev;
      if (ex.quantity === 1) return prev.filter(i => i.id !== id);
      return prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
    });
  }, []);

  // ── Flying dot animation ───────────────────────────────────────────────────
  const addWithAnim = useCallback((e, item) => {
    addToCart(item);
    const rect    = e.currentTarget.getBoundingClientRect();
    const cartRect = cartBtnRef.current?.getBoundingClientRect();
    if (!cartRect) return;
    const id = Date.now();
    setFlyingDots(prev => [...prev, {
      id,
      from: { x: rect.left + rect.width / 2 - 10, y: rect.top + rect.height / 2 - 10 },
      to:   { x: cartRect.left + cartRect.width / 2 - 10, y: cartRect.top + cartRect.height / 2 - 10 },
    }]);
  }, [addToCart]);

  // ── Categories ─────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    return ['all', ...cats];
  }, [menuItems]);

  const filtered = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat    = selectedCat === 'all' || item.category === selectedCat;
      const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menuItems, selectedCat, searchQuery]);

  // ── Add offer to cart ──────────────────────────────────────────────────────
  const addOfferToCart = (offer) => {
    (offer.items || []).forEach(oi => {
      const menuItem = menuItems.find(m => m.id === oi.itemId);
      if (!menuItem) return;
      for (let i = 0; i < (oi.quantity || 1); i++) addToCart(menuItem);
    });
    toast.success(`${offer.title} added to cart ✓`);
  };

  // ── Order placement ────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!customerName.trim()) { toast.error('Enter your name'); return; }
    if (!customerPhone.trim()) { toast.error('Enter your phone number'); return; }
    setOrderPlacing(true);
    try {
      const counterRef = doc(db, 'system', 'counters');
      let oNum;
      await runTransaction(db, async (tx) => {
        const cd = await tx.get(counterRef);
        oNum = (cd.exists() ? cd.data().currentOrderNumber || 0 : 0) + 1;
        cd.exists() ? tx.update(counterRef, { currentOrderNumber: oNum }) : tx.set(counterRef, { currentOrderNumber: oNum });
      });

      const subtotal = cartTotal;
      const taxAmount = cafe?.taxEnabled ? subtotal * (parseFloat(cafe.taxRate) || 0) / 100 : 0;
      const scAmount  = cafe?.serviceChargeEnabled ? subtotal * (parseFloat(cafe.serviceChargeRate) || 0) / 100 : 0;
      const gstAmount = cafe?.gstEnabled ? subtotal * (parseFloat(cafe.gstRate) || 0) / 100 : 0;
      const total     = subtotal + taxAmount + scAmount + gstAmount;

      const orderData = {
        cafeId,
        orderNumber: oNum,
        items: cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
        subtotalAmount: subtotal,
        taxAmount,
        serviceChargeAmount: scAmount,
        gstAmount,
        totalAmount: total,
        currencyCode:   cafe?.currencyCode   || 'INR',
        currencySymbol: cafe?.currencySymbol || '₹',
        // TASK 1 FIX: Always 'pending' at creation. Never optimistically paid.
        paymentStatus: 'pending',
        paymentMode,
        orderStatus: 'new',
        orderType,
        customerName,
        customerPhone,
        ...(orderType === 'dine-in'  && { tableNumber }),
        ...(orderType === 'delivery' && { deliveryAddress }),
        ...(specialInstructions && { specialInstructions }),
        createdAt: serverTimestamp(),
      };

      const orderRef = await addDoc(collection(db, 'orders'), orderData);

      createInvoiceForOrder({ ...orderData, orderNumber: oNum }, orderRef.id, cafe)
        .catch(console.error);
      deductStockForOrder(cafeId, orderData.items, menuItems).catch(console.error);
      deductStockByRecipe(cafeId, orderData.items, menuItems).catch(console.error);

      // TASK 7: Log order creation (no sensitive data)
      console.log('[Order] Created successfully:', {
        orderId:     orderRef.id,
        orderNumber: String(oNum).padStart(3, '0'),
        paymentMode,
        paymentStatus: 'pending',
        totalAmount: total,
      });

      // ── Cashfree payment via backend proxy (Tasks 2, 4, 5) ─────────────
      // TASK 2: Direct browser call is CORS-blocked. Use backend instead.
      // TASK 5: Only non-sensitive data sent — keys never leave backend.
      // TASK 4: orderId passed consistently for webhook matching.
      if (
        paymentMode === 'online' &&
        cafe?.paymentSettings?.enabled &&
        cafe?.paymentSettings?.gateway === 'cashfree'
      ) {
        try {
          const BACKEND_URL = cafe?.paymentSettings?.backendUrl || '';

          if (!BACKEND_URL) {
            console.warn('[Payment] Backend URL not configured in café settings.');
            toast.error('Payment backend not configured. Please pay at counter.');
          } else {
            console.log('[Payment] Initiating Cashfree via backend:', {
              orderId: orderRef.id,
              amount:  total,
              cafeId,
            });

            const resp = await fetch(`${BACKEND_URL}/create-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId:      orderRef.id,
                amount:       total,
                phone:        customerPhone,
                cafeId,
                currency:     cafe?.currencyCode || 'INR',
                customerName,
                returnUrl:    `${window.location.origin}/track/${orderRef.id}`,
              }),
            });

            const data = await resp.json();
            console.log('[Payment] Backend response:', {
              status:             resp.status,
              has_session_id:     !!data?.payment_session_id,
              payment_session_id: data?.payment_session_id || 'MISSING',
            });

            if (data?.payment_session_id) {
              const sessionId = data.payment_session_id;

              // Confirm session before using
              console.log('[Payment] Session confirmed — launching Cashfree SDK');
              console.log('[Payment] payment_session_id:', sessionId);
              console.log('[Payment] orderId:', orderRef.id);

              // Use Cashfree JS SDK immediately — no stale session, no delay
              const cashfree = window.Cashfree({ mode: 'production' });
              cashfree.checkout({ paymentSessionId: sessionId });
              return;
            } else {
              console.error('[Payment] No payment_session_id in response:', data?.error || data);
              toast.error('Payment gateway error. Please pay at counter.');
            }
          }
        } catch (cfErr) {
          // TASK 6: Order stays 'pending' safely on any failure
          console.error('[Payment] Backend call failed (order preserved as pending):', cfErr.message);
          toast.error('Payment unavailable. Your order is saved — please pay at counter.');
        }
      }

      // ── WhatsApp redirect (same as basic page) ──────────────────────────
      const formattedNum = String(oNum).padStart(3, '0');
      const cur = cafe?.currencySymbol || '₹';
      const hasExtras = (cafe?.taxEnabled && taxAmount > 0) ||
        (cafe?.serviceChargeEnabled && scAmount > 0) ||
        (cafe?.gstEnabled && gstAmount > 0);

      let msg = `*🚀 New Order*\n\n`;
      msg += `*Order #${formattedNum}*\n`;
      msg += `*Customer:* ${customerName}\n`;
      msg += `*Phone:* ${customerPhone}\n`;
      msg += `*Type:* ${orderType.charAt(0).toUpperCase() + orderType.slice(1)}\n`;
      if (orderType === 'dine-in' && tableNumber) msg += `*Table:* ${tableNumber}\n`;
      if (orderType === 'delivery' && deliveryAddress) msg += `*Address:* ${deliveryAddress}\n`;
      msg += `\n*Items:*\n`;
      cart.forEach(i => { msg += `• ${i.name} x${i.quantity} — ${cur}${(i.price * i.quantity).toFixed(2)}\n`; });
      if (hasExtras) {
        msg += `\n*Subtotal:* ${cur}${subtotal.toFixed(2)}\n`;
        if (cafe?.taxEnabled && taxAmount > 0) msg += `*${cafe.taxName || 'Tax'} (${cafe.taxRate}%):* ${cur}${taxAmount.toFixed(2)}\n`;
        if (cafe?.serviceChargeEnabled && scAmount > 0) msg += `*Service Charge (${cafe.serviceChargeRate}%):* ${cur}${scAmount.toFixed(2)}\n`;
        if (cafe?.gstEnabled && gstAmount > 0) msg += `*GST (${cafe.gstRate}%):* ${cur}${gstAmount.toFixed(2)}\n`;
      }
      msg += `*Total:* ${cur}${total.toFixed(2)}\n`;
      msg += `*Payment:* ${paymentMode === 'counter' ? 'Pay at Counter' : paymentMode === 'table' ? 'Pay on Table' : paymentMode === 'online' ? 'Online Payment' : 'Prepaid (UPI)'}`;
      if (specialInstructions) msg += `\n\n*Special Instructions:* ${specialInstructions}`;

      const waNumber = cafe?.whatsappNumber || '';
      const waUrl = waNumber
        ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

      // Reset state before redirect
      const formattedForDisplay = formattedNum;
      setOrderNumber(formattedForDisplay);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setTableNumber('');
      setDeliveryAddress('');
      setSpecialInstructions('');
      setPaymentMode('counter');
      setShowCheckout(false);

      // iOS-compatible WhatsApp redirect (window.open blocked by Safari)
      window.location.href = waUrl;

      // Navigate customer to live order tracking
      navigate(`/track/${orderRef.id}`);
    } catch (err) {
      toast.error('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setOrderPlacing(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-4 border-t-transparent"
        style={{ borderColor: `${primary}40`, borderTopColor: primary }} />
    </div>
  );

  if (cafeNotFound || !cafe) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8" style={{ background: T.bg }}>
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: primary, opacity: 0.3 }} />
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Café Not Found</h1>
        <p style={{ color: T.textMuted }}>Check your QR code and try again.</p>
      </div>
    </div>
  );

  if (cafe.isActive === false) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8" style={{ background: T.bg }}>
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: primary }} />
        <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
          Service Temporarily Unavailable
        </h1>
        <p className="text-sm max-w-xs mx-auto" style={{ color: T.textMuted }}>
          We're not accepting online orders right now. Please visit us in person.
        </p>
      </div>
    </div>
  );

  if (orderDone) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: T.bg }}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1,   opacity: 1 }}
        className="text-center max-w-sm"
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{ background: `${primary}20`, border: `2px solid ${primary}` }}
        >
          <span className="text-4xl">☕</span>
        </motion.div>
        <h1 className="text-3xl font-black mb-2" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
          Order Placed!
        </h1>
        <p className="mb-4" style={{ color: T.textMuted }}>Your order #{orderNumber} is being prepared.</p>
        <div className="p-4 rounded-2xl mb-6" style={{ background: `${primary}10`, border: `1px solid ${primary}30` }}>
          <p className="font-bold text-2xl" style={{ color: primary }}>#{orderNumber}</p>
          <p className="text-sm" style={{ color: T.textMuted }}>Keep this number handy</p>
        </div>
        <button
          onClick={() => setOrderDone(false)}
          className="px-8 py-3 rounded-xl text-black font-bold"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
        >
          Order More
        </button>
      </motion.div>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: T.bg, fontFamily: 'Manrope, sans-serif' }}>

      {/* Flying dots */}
      {flyingDots.map(dot => (
        <FlyingDot
          key={dot.id}
          from={dot.from}
          to={dot.to}
          onDone={() => setFlyingDots(prev => prev.filter(d => d.id !== dot.id))}
        />
      ))}

      {/* Offer Detail Modal */}
      <AnimatePresence>
        {selectedOffer && (
          <OfferDetailModal
            offer={selectedOffer}
            menuItems={menuItems}
            CUR={CUR}
            primary={primary}
            theme={T}
            onAdd={() => addOfferToCart(selectedOffer)}
            onClose={() => setSelectedOffer(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: T.heroGrad }}>
        {/* Animated glow blobs */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: primary }}
        />
        <motion.div
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-10 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none"
          style={{ background: primary }}
        />

        <div className="relative px-6 pt-12 pb-8 text-center">
          {cafe.logo && (
            <motion.img
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              src={cafe.logo}
              alt={cafe.name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-xl"
              style={{ boxShadow: `0 8px 32px ${glow}` }}
            />
          )}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-black mb-1"
            style={{ fontFamily: 'Playfair Display, serif', color: T.text }}
          >
            {cafe.name}
          </motion.h1>
          {cafe.tagline && (
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-sm"
              style={{ color: T.textMuted }}
            >
              {cafe.tagline}
            </motion.p>
          )}
        </div>
      </div>

      {/* ── Sticky top bar ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 px-4 py-3"
        style={{ background: T.sticky, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${T.borderLight}` }}>
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.textMuted }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search menu..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }}
            />
          </div>

          {/* Cart button */}
          <motion.button
            ref={cartBtnRef}
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-black font-bold text-sm flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: cartCount > 0 ? `0 4px 20px ${glow}` : 'none' }}
          >
            <ShoppingCart className="w-4 h-4" />
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={{ scale: 1.4 }}
                animate={{ scale: 1 }}
                className="font-black"
              >
                {cartCount}
              </motion.span>
            )}
          </motion.button>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 max-w-2xl mx-auto scrollbar-none">
          {categories.map(cat => (
            <motion.button
              key={cat}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedCat(cat)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all"
              style={selectedCat === cat
                ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }
              }
            >
              {cat === 'all' ? '✦ All' : cat}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-32 space-y-8 pt-6">

        {/* ── Offers ────────────────────────────────────────────────────── */}
        {offers.length > 0 && (
          <section>
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
              <Gift className="w-5 h-5" style={{ color: primary }} />
              Special Offers
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {offers.map(offer => (
                <motion.button
                  key={offer.id}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedOffer(offer)}
                  className="flex-shrink-0 w-64 rounded-2xl overflow-hidden text-left"
                  style={{ background: `linear-gradient(135deg, ${primary}20, ${primary}08)`, border: `1px solid ${primary}30`, boxShadow: `0 4px 20px ${glowSoft}` }}
                >
                  {offer.bannerImage && (
                    <div className="w-full h-28 overflow-hidden">
                      <MediaPreview url={offer.bannerImage} className="w-full h-full" alt={offer.title} />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="font-bold text-sm" style={{ color: T.text }}>{offer.title}</p>
                    {offer.description && (
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: T.textMuted }}>{offer.description}</p>
                    )}
                    <p className="text-xs font-semibold mt-2" style={{ color: primary }}>Tap to see details →</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* ── Menu grid ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-bold text-lg mb-4" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
            {selectedCat === 'all' ? 'Our Menu' : selectedCat}
          </h2>
          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map(item => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    CUR={CUR}
                    cartQty={cartQtyFor(item.id)}
                    onAdd={addToCart}
                    onAddWithAnim={addWithAnim}
                    primary={primary}
                    theme={T}
                  />
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <Coffee className="w-12 h-12 mx-auto mb-3" style={{ color: T.textMuted, opacity: 0.3 }} />
                <p style={{ color: T.textMuted }}>No items found</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* ── Cart drawer ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCart(false)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm flex flex-col"
              style={{ background: T.bgModal, backdropFilter: 'blur(20px)', borderLeft: `1px solid ${T.border}` }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: T.borderLight }}>
                <h3 className="font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Your Order</h3>
                <button onClick={() => setShowCart(false)} className="p-2 rounded-lg transition-all" style={{ color: T.textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                <AnimatePresence>
                  {cart.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3" style={{ color: T.textMuted, opacity: 0.3 }} />
                      <p style={{ color: T.textMuted }}>Your cart is empty</p>
                    </motion.div>
                  ) : cart.map(item => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}` }}
                    >
                      {item.image && (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                          <MediaPreview url={item.image} className="w-full h-full" alt={item.name} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: T.text }}>{item.name}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>{CUR}{fmt(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                          style={{ background: T.bgInput, color: T.text, border: `1px solid ${T.border}` }}>
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-sm w-5 text-center" style={{ color: T.text }}>{item.quantity}</span>
                        <button onClick={() => addToCart(item)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-black transition-all"
                          style={{ background: primary }}>
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {cart.length > 0 && (
                <div className="px-5 py-4 border-t flex-shrink-0 space-y-3" style={{ borderColor: T.borderLight }}>
                  <div className="flex justify-between font-bold text-lg">
                    <span style={{ color: T.text }}>Total</span>
                    <span style={{ color: primary }}>{CUR}{fmt(cartTotal)}</span>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowCart(false); setShowCheckout(true); }}
                    className="w-full py-4 rounded-xl text-black font-bold text-base"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 20px ${glow}` }}
                  >
                    Proceed to Checkout
                  </motion.button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Checkout modal ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
              style={{ background: T.bgModal, border: `1px solid ${T.border}` }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: T.borderLight }}>
                <h3 className="font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Checkout</h3>
                <button onClick={() => setShowCheckout(false)} className="p-2 rounded-lg transition-all" style={{ color: T.textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {[
                  { label: 'Your Name', value: customerName, set: setCustomerName, placeholder: 'Enter your name', type: 'text' },
                  { label: 'Phone Number', value: customerPhone, set: setCustomerPhone, placeholder: '10-digit mobile number', type: 'tel' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>{f.label}</label>
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full py-3 px-4 rounded-xl text-sm outline-none"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }}
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: T.text }}>Order Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: 'dine-in', label: '🍽 Dine In' }, { id: 'takeaway', label: '🥡 Takeaway' }, { id: 'delivery', label: '🛵 Delivery' }].map(t => (
                      <button key={t.id} onClick={() => setOrderType(t.id)}
                        className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                        style={orderType === t.id
                          ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                          : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }
                        }>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {orderType === 'dine-in' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>Table Number</label>
                    <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="e.g., 5"
                      className="w-full py-3 px-4 rounded-xl text-sm outline-none"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                  </div>
                )}

                {orderType === 'delivery' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>Delivery Address</label>
                    <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Full delivery address" rows={3}
                      className="w-full py-3 px-4 rounded-xl text-sm outline-none resize-none"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: T.text }}>Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'counter', label: '🏪 At Counter' },
                      { id: 'table',   label: '🪑 At Table'   },
                      { id: 'prepaid', label: '📱 UPI'        },
                      ...(cafe?.paymentSettings?.enabled ? [{ id: 'online', label: '💳 Online' }] : []),
                    ].map(p => (
                      <button key={p.id} onClick={() => setPaymentMode(p.id)}
                        className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                        style={paymentMode === p.id
                          ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                          : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }
                        }>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMode === 'prepaid' && cafe?.upiId && (
                  <div className="p-4 rounded-xl text-center" style={{ background: T.bgInput, border: `1px solid ${T.border}` }}>
                    <QRCodeSVG value={`upi://pay?pa=${cafe.upiId}&pn=${cafe.name}&am=${cartTotal}&cu=INR`} size={140} className="mx-auto" />
                    <p className="text-xs mt-2" style={{ color: T.textMuted }}>Scan to pay {CUR}{fmt(cartTotal)}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>
                    Special Instructions <span className="font-normal" style={{ color: T.textFaint }}>(optional)</span>
                  </label>
                  <textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="Allergies, preferences..." rows={2}
                    className="w-full py-3 px-4 rounded-xl text-sm outline-none resize-none"
                    style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                </div>

                {/* Order summary */}
                <div className="p-4 rounded-xl space-y-2" style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
                  <p className="font-semibold text-sm mb-3" style={{ color: T.text }}>Order Summary</p>
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span style={{ color: T.textMuted }}>{item.name} × {item.quantity}</span>
                      <span style={{ color: T.text }}>{CUR}{fmt(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-bold" style={{ borderColor: T.borderLight }}>
                    <span style={{ color: T.text }}>Total</span>
                    <span style={{ color: primary }}>{CUR}{fmt(cartTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: T.borderLight }}>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handlePlaceOrder}
                  disabled={orderPlacing}
                  className="w-full py-4 rounded-xl text-black font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 24px ${glow}` }}
                >
                  {orderPlacing
                    ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 rounded-full border-2 border-black/30 border-t-black" />Placing Order…</>
                    : `Place Order • ${CUR}${fmt(cartTotal)}`
                  }
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating cart button (mobile) */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && !showCheckout && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0,   opacity: 1 }}
            exit={{ y: 100,  opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30"
          >
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowCart(true)}
              className="flex items-center gap-3 px-6 py-3.5 rounded-2xl text-black font-bold shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 8px 32px ${glow}` }}
            >
              <ShoppingCart className="w-5 h-5" />
              <span>{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
              <span className="font-black">{CUR}{fmt(cartTotal)}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CafeOrderingPremium;
