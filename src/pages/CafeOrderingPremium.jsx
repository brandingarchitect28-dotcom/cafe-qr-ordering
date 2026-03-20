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
import { useParams } from 'react-router-dom';
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

const OfferDetailModal = ({ offer, menuItems, CUR, onAdd, onClose }) => {
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
          background: 'rgba(15,15,15,0.95)',
          border: '1px solid rgba(212,175,55,0.2)',
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
              <h2 className="text-white text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
                {offer.title}
              </h2>
              {offer.description && (
                <p className="text-[#A3A3A3] text-sm mt-1">{offer.description}</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 text-[#A3A3A3] hover:text-white rounded-lg hover:bg-white/10 transition-all flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items breakdown */}
          {offerItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[#A3A3A3] text-xs uppercase tracking-wide font-semibold">Includes</p>
              {offerItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  {item.image && (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                      <MediaPreview url={item.image} className="w-full h-full" alt={item.itemName} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.itemName}</p>
                    <p className="text-[#A3A3A3] text-xs">
                      {CUR}{fmt(item.itemPrice)} × {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price breakdown */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
            {offer.type === 'combo' && offer.comboPrice && (
              <div className="flex justify-between items-center">
                <span className="text-[#A3A3A3] text-sm">Combo Price</span>
                <span className="text-[#D4AF37] text-xl font-black">{CUR}{fmt(offer.comboPrice)}</span>
              </div>
            )}
            {offer.type === 'discount' && (
              <div className="flex justify-between items-center">
                <span className="text-[#A3A3A3] text-sm">
                  {offer.discountType === 'percentage'
                    ? `${offer.discountAmount}% off`
                    : `${CUR}${fmt(offer.discountAmount)} off`}
                </span>
                <span className="text-[#D4AF37] text-xl font-black">Save!</span>
              </div>
            )}
            {offer.type === 'buy_x_get_y' && (
              <p className="text-white text-sm font-semibold">
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
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8962E)' }}
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

const MenuCard = React.memo(({ item, CUR, cartQty, onAdd, onAddWithAnim }) => {
  const mediaType = getMediaType(item.image);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl overflow-hidden relative group"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
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
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'rgba(212,175,55,0.05)' }}>
            <Coffee className="w-12 h-12 text-[#D4AF37]/30" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Category pill */}
        {item.category && (
          <div className="absolute top-3 left-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', color: '#D4AF37', backdropFilter: 'blur(8px)', border: '1px solid rgba(212,175,55,0.3)' }}>
              {item.category}
            </span>
          </div>
        )}

        {/* Cart count badge */}
        {cartQty > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#D4AF37] text-black text-xs font-black flex items-center justify-center"
          >
            {cartQty}
          </motion.div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="text-white font-semibold text-base leading-tight">{item.name}</h3>
          <span className="text-[#D4AF37] font-black text-base flex-shrink-0">{CUR}{fmt(item.price)}</span>
        </div>

        {/* Add button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={(e) => onAddWithAnim(e, item)}
          className="w-full py-2.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #C5A059)' }}
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

  // Primary colour
  const primary = cafe?.primaryColor || '#D4AF37';
  const rgb     = hexToRgb(primary);
  const glow    = `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`;
  const CUR     = cafe?.currencySymbol || '₹';

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
        paymentStatus: ['prepaid','online'].includes(paymentMode) ? 'paid' : 'pending',
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

      setOrderNumber(String(oNum).padStart(3, '0'));
      setCart([]);
      setShowCheckout(false);
      setOrderDone(true);
    } catch (err) {
      toast.error('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setOrderPlacing(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-4 border-t-transparent"
        style={{ borderColor: `${primary}40`, borderTopColor: primary }} />
    </div>
  );

  if (cafeNotFound || !cafe) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-8">
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]/30" />
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>Café Not Found</h1>
        <p className="text-[#A3A3A3]">Check your QR code and try again.</p>
      </div>
    </div>
  );

  if (cafe.isActive === false) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-8">
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: primary }} />
        <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Playfair Display, serif' }}>
          Service Temporarily Unavailable
        </h1>
        <p className="text-[#A3A3A3] text-sm max-w-xs mx-auto">
          We're not accepting online orders right now. Please visit us in person.
        </p>
      </div>
    </div>
  );

  // ── Order done screen ──────────────────────────────────────────────────────
  if (orderDone) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
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
        <h1 className="text-3xl font-black text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Order Placed!
        </h1>
        <p className="text-[#A3A3A3] mb-4">Your order #{orderNumber} is being prepared.</p>
        <div className="p-4 rounded-2xl mb-6" style={{ background: `${primary}10`, border: `1px solid ${primary}30` }}>
          <p className="text-white font-bold text-2xl" style={{ color: primary }}>#{orderNumber}</p>
          <p className="text-[#A3A3A3] text-sm">Keep this number handy</p>
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #050505 0%, #0a0a0a 100%)', fontFamily: 'Manrope, sans-serif' }}>

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
            onAdd={() => addOfferToCart(selectedOffer)}
            onClose={() => setSelectedOffer(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(180deg, ${primary}15 0%, transparent 100%)` }}>
        {/* Glow blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: primary }} />

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
            className="text-3xl font-black text-white mb-1"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {cafe.name}
          </motion.h1>
          {cafe.tagline && (
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-[#A3A3A3] text-sm"
            >
              {cafe.tagline}
            </motion.p>
          )}
        </div>
      </div>

      {/* ── Sticky top bar ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 px-4 py-3"
        style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search menu..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Cart button */}
          <motion.button
            ref={cartBtnRef}
            whileTap={{ scale: 0.92 }}
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
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all"
              style={selectedCat === cat
                ? { background: primary, color: '#000' }
                : { background: 'rgba(255,255,255,0.06)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-32 space-y-8 pt-6">

        {/* ── Offers ────────────────────────────────────────────────────── */}
        {offers.length > 0 && (
          <section>
            <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              <Gift className="w-5 h-5" style={{ color: primary }} />
              Special Offers
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {offers.map(offer => (
                <motion.button
                  key={offer.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedOffer(offer)}
                  className="flex-shrink-0 w-64 rounded-2xl overflow-hidden text-left"
                  style={{ background: `linear-gradient(135deg, ${primary}20, ${primary}08)`, border: `1px solid ${primary}30` }}
                >
                  {offer.bannerImage && (
                    <div className="w-full h-28 overflow-hidden">
                      <MediaPreview url={offer.bannerImage} className="w-full h-full" alt={offer.title} />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-white font-bold text-sm">{offer.title}</p>
                    {offer.description && (
                      <p className="text-[#A3A3A3] text-xs mt-0.5 line-clamp-2">{offer.description}</p>
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
          <h2 className="text-white font-bold text-lg mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
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
                  />
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <Coffee className="w-12 h-12 mx-auto mb-3 text-[#A3A3A3]/30" />
                <p className="text-[#A3A3A3]">No items found</p>
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
              style={{ background: 'rgba(10,10,10,0.98)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>Your Order</h3>
                <button onClick={() => setShowCart(false)} className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                <AnimatePresence>
                  {cart.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-[#A3A3A3]/30" />
                      <p className="text-[#A3A3A3]">Your cart is empty</p>
                    </motion.div>
                  ) : cart.map(item => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {item.image && (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                          <MediaPreview url={item.image} className="w-full h-full" alt={item.name} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.name}</p>
                        <p className="text-[#A3A3A3] text-xs">{CUR}{fmt(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white transition-all"
                          style={{ background: 'rgba(255,255,255,0.1)' }}>
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-white font-bold text-sm w-5 text-center">{item.quantity}</span>
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
                <div className="px-5 py-4 border-t border-white/5 flex-shrink-0 space-y-3">
                  <div className="flex justify-between text-white font-bold text-lg">
                    <span>Total</span>
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
              style={{ background: 'rgba(10,10,10,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>Checkout</h3>
                <button onClick={() => setShowCheckout(false)} className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {/* Name + Phone */}
                {[
                  { label: 'Your Name', value: customerName, set: setCustomerName, placeholder: 'Enter your name', type: 'text' },
                  { label: 'Phone Number', value: customerPhone, set: setCustomerPhone, placeholder: '10-digit mobile number', type: 'tel' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-white text-sm font-medium mb-1.5">{f.label}</label>
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full py-3 px-4 rounded-xl text-white text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                ))}

                {/* Order type */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Order Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: 'dine-in', label: '🍽 Dine In' }, { id: 'takeaway', label: '🥡 Takeaway' }, { id: 'delivery', label: '🛵 Delivery' }].map(t => (
                      <button key={t.id} onClick={() => setOrderType(t.id)}
                        className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                        style={orderType === t.id
                          ? { background: primary, color: '#000' }
                          : { background: 'rgba(255,255,255,0.06)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.08)' }
                        }>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {orderType === 'dine-in' && (
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">Table Number</label>
                    <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="e.g., 5"
                      className="w-full py-3 px-4 rounded-xl text-white text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                )}

                {orderType === 'delivery' && (
                  <div>
                    <label className="block text-white text-sm font-medium mb-1.5">Delivery Address</label>
                    <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Full delivery address" rows={3}
                      className="w-full py-3 px-4 rounded-xl text-white text-sm outline-none resize-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                )}

                {/* Payment */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Payment Method</label>
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
                          ? { background: primary, color: '#000' }
                          : { background: 'rgba(255,255,255,0.06)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.08)' }
                        }>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* UPI QR */}
                {paymentMode === 'prepaid' && cafe?.upiId && (
                  <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <QRCodeSVG value={`upi://pay?pa=${cafe.upiId}&pn=${cafe.name}&am=${cartTotal}&cu=INR`} size={140} className="mx-auto" />
                    <p className="text-[#A3A3A3] text-xs mt-2">Scan to pay {CUR}{fmt(cartTotal)}</p>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-white text-sm font-medium mb-1.5">Special Instructions <span className="text-[#555] font-normal">(optional)</span></label>
                  <textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="Allergies, preferences..." rows={2}
                    className="w-full py-3 px-4 rounded-xl text-white text-sm outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>

                {/* Order summary */}
                <div className="p-4 rounded-xl space-y-2" style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
                  <p className="text-white font-semibold text-sm mb-3">Order Summary</p>
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-[#A3A3A3]">{item.name} × {item.quantity}</span>
                      <span className="text-white">{CUR}{fmt(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                    <span className="text-white">Total</span>
                    <span style={{ color: primary }}>{CUR}{fmt(cartTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-white/5 flex-shrink-0">
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
