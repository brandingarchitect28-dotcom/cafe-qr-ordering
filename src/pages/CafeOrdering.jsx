import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, doc, addDoc, updateDoc, serverTimestamp, runTransaction, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createInvoiceForOrder } from '../services/invoiceService';
import { deductStockForOrder } from '../services/inventoryService';
import { deductStockByRecipe } from '../services/recipeService';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Plus, Minus, X, Search, Coffee, Package, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';
import AddOnModal from '../components/AddOnModal';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

// Function to generate theme colors based on cafe settings
const getThemeColors = (primaryColor = '#D4AF37', mode = 'light') => {
  const isLight = mode === 'light';
  
  // Calculate a lighter/darker version of primary color for accents
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 212, g: 175, b: 55 };
  };
  
  const rgb = hexToRgb(primaryColor);
  const shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
  const shadowColorDark = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
  
  if (isLight) {
    return {
      background: '#FDF8F3',
      backgroundSecondary: '#F5EDE4',
      warmWhite: '#FFFBF7',
      text: '#2C1810',
      textLight: '#6B5344',
      textMuted: '#9A8B7A',
      cardBg: '#FFFFFF',
      primary: primaryColor,
      primaryDark: primaryColor,
      shadow: shadowColor,
      shadowDark: shadowColorDark,
      border: '#E5E5E5',
      beige: '#F5EDE4',
    };
  } else {
    return {
      background: '#0f0f0f',
      backgroundSecondary: '#1a1a1a',
      warmWhite: '#151515',
      text: '#ffffff',
      textLight: '#d4d4d4',
      textMuted: '#a3a3a3',
      cardBg: '#1a1a1a',
      primary: primaryColor,
      primaryDark: primaryColor,
      shadow: 'rgba(0, 0, 0, 0.3)',
      shadowDark: 'rgba(0, 0, 0, 0.5)',
      border: '#2a2a2a',
      beige: '#1a1a1a',
    };
  }
};

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

// Error Fallback Component
const ErrorFallback = ({ title, message, onRetry, icon: Icon = AlertCircle, colors }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center p-8 text-center"
    style={{ backgroundColor: colors.background }}
  >
    <Icon className="w-16 h-16 mb-4" style={{ color: colors.primary }} />
    <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif', color: colors.text }}>
      {title}
    </h2>
    <p className="mb-6" style={{ color: colors.textMuted }}>{message}</p>
    {onRetry && (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onRetry}
        className="px-6 py-3 rounded-full text-white font-semibold flex items-center gap-2"
        style={{ backgroundColor: colors.primary }}
      >
        <RefreshCw className="w-5 h-5" />
        Try Again
      </motion.button>
    )}
  </motion.div>
);

// Loading Skeleton Component
const LoadingSkeleton = ({ message = "Loading...", colors }) => (
  <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: colors?.background || '#FDF8F3' }}>
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      className="w-16 h-16 rounded-full border-4 mb-4"
      style={{ borderColor: colors?.primary || '#D4AF37', borderTopColor: 'transparent' }}
    />
    <p style={{ color: colors?.textMuted || '#9A8B7A' }}>{message}</p>
  </div>
);

const CafeOrdering = () => {
  const { cafeId } = useParams();
  const navigate = useNavigate();
  const [cafe, setCafe] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [offers, setOffers] = useState([]);
  const [cart, setCart] = useState([]);
  const [addonModal, setAddonModal] = useState(null); // item waiting for add-on selection
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(true);
  const [cafeNotFound, setCafeNotFound] = useState(false);
  const [menuError, setMenuError] = useState(null);
  const [offersError, setOffersError] = useState(null);
  const [networkError, setNetworkError] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState('dine-in');
  const [tableNumber, setTableNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMode, setPaymentMode] = useState('counter');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [orderPlacing, setOrderPlacing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showHero, setShowHero] = useState(true);
  const [addingItemId, setAddingItemId] = useState(null);
  
  const menuRef = useRef(null);
  const unsubscribersRef = useRef([]);

  // Generate theme colors based on cafe settings
  const COLORS = useMemo(() => {
    return getThemeColors(cafe?.primaryColor || '#D4AF37', cafe?.mode || 'light');
  }, [cafe?.primaryColor, cafe?.mode]);

  // Currency symbol from cafe settings (falls back to ₹)
  const CUR = cafe?.currencySymbol || '₹';

  // Cleanup all listeners on unmount
  useEffect(() => {
    return () => {
      unsubscribersRef.current.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, []);

  // Default colors for initial render
  const defaultColors = getThemeColors('#D4AF37', 'light');

  // Check for missing cafeId
  if (!cafeId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: defaultColors.background }}>
        <ErrorFallback
          title="Invalid Link"
          message="No café ID found in the URL. Please scan a valid QR code or use the correct link."
          icon={AlertCircle}
          colors={defaultColors}
        />
      </div>
    );
  }

  // REAL-TIME: Load cafe data with onSnapshot
  useEffect(() => {
    if (!cafeId) return;
    
    setNetworkError(false);
    const cafeDocRef = doc(db, 'cafes', cafeId);
    
    const unsubscribeCafe = onSnapshot(
      cafeDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const cafeData = { id: docSnap.id, ...docSnap.data() };
          setCafe(cafeData);
          setCafeNotFound(false);
        } else {
          // Try querying by cafeId field as fallback
          const cafeQuery = query(collection(db, 'cafes'), where('cafeId', '==', cafeId));
          const unsubQuery = onSnapshot(cafeQuery, (snapshot) => {
            if (!snapshot.empty) {
              const cafeData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
              setCafe(cafeData);
              setCafeNotFound(false);
            } else {
              setCafeNotFound(true);
              setLoading(false);
            }
          }, () => {
            setCafeNotFound(true);
            setLoading(false);
          });
          unsubscribersRef.current.push(unsubQuery);
        }
      },
      (error) => {
        if (error.code === 'unavailable' || error.message.includes('network')) {
          setNetworkError(true);
        }
        setCafeNotFound(true);
        setLoading(false);
      }
    );

    unsubscribersRef.current.push(unsubscribeCafe);
    return () => unsubscribeCafe();
  }, [cafeId]);

  // REAL-TIME: Load menu items
  useEffect(() => {
    if (!cafeId) return;

    setMenuLoading(true);
    setMenuError(null);

    const menuQuery = query(
      collection(db, 'menuItems'),
      where('cafeId', '==', cafeId),
      where('available', '==', true)
    );

    const unsubscribeMenu = onSnapshot(
      menuQuery,
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMenuItems(items);
        setMenuLoading(false);
        setLoading(false);
        setMenuError(null);
      },
      (error) => {
        // Fallback without available filter (for indexes not set up)
        const fallbackQuery = query(
          collection(db, 'menuItems'),
          where('cafeId', '==', cafeId)
        );
        
        const unsubFallback = onSnapshot(
          fallbackQuery,
          (fallbackSnapshot) => {
            const items = fallbackSnapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter(item => item.available !== false);
            setMenuItems(items);
            setMenuLoading(false);
            setLoading(false);
            setMenuError(null);
          },
          (fallbackError) => {
            setMenuError('Unable to load menu. Please check your connection.');
            setMenuItems([]);
            setMenuLoading(false);
            setLoading(false);
          }
        );
        unsubscribersRef.current.push(unsubFallback);
      }
    );

    unsubscribersRef.current.push(unsubscribeMenu);
    return () => unsubscribeMenu();
  }, [cafeId]);

  // REAL-TIME: Load offers
  useEffect(() => {
    if (!cafeId) return;

    setOffersLoading(true);
    setOffersError(null);

    const offersQuery = query(
      collection(db, 'offers'),
      where('cafeId', '==', cafeId),
      where('active', '==', true)
    );

    const unsubscribe = onSnapshot(
      offersQuery,
      (snapshot) => {
        const activeOffers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOffers(activeOffers);
        setOffersLoading(false);
        setOffersError(null);
      },
      (error) => {
        // Fallback: query without active filter, filter client-side
        const fallbackQuery = query(
          collection(db, 'offers'),
          where('cafeId', '==', cafeId)
        );
        
        const unsubFallback = onSnapshot(
          fallbackQuery,
          (fallbackSnapshot) => {
            const allOffers = fallbackSnapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter(offer => offer.active === true);
            setOffers(allOffers);
            setOffersLoading(false);
            setOffersError(null);
          },
          (fallbackError) => {
            setOffersError('Unable to load offers');
            setOffers([]);
            setOffersLoading(false);
          }
        );
        unsubscribersRef.current.push(unsubFallback);
      }
    );

    unsubscribersRef.current.push(unsubscribe);
    return () => unsubscribe();
  }, [cafeId]);

  // Cart functions
  // Items with add-ons → open AddOnModal first (no change for items without add-ons)
  const addToCart = (item) => {
    if (item.addons?.length > 0) {
      setAddonModal(item);
      return;
    }
    directAddToCart({ ...item, quantity: 1, addons: [], addonTotal: 0 });
  };

  const directAddToCart = (cartEntry) => {
    setAddingItemId(cartEntry.id);
    setTimeout(() => setAddingItemId(null), 600);
    // Items with add-ons always get their own cart row (different selection = different entry)
    if (cartEntry.addons?.length > 0) {
      setCart(prev => [...prev, cartEntry]);
    } else {
      const existingItem = cart.find(i => i.id === cartEntry.id && !i.addons?.length);
      if (existingItem) {
        setCart(cart.map(i =>
          i.id === cartEntry.id && !i.addons?.length ? { ...i, quantity: i.quantity + 1 } : i
        ));
      } else {
        setCart([...cart, cartEntry]);
      }
    }
    toast.success(`${cartEntry.name} added to cart`, { duration: 2000 });
  };

  const updateQuantity = (itemId, change) => {
    const updated = cart.map(item => {
      if (item.id === itemId) {
        const newQuantity = item.quantity + change;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
      }
      return item;
    }).filter(Boolean);
    setCart(updated);
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.id !== itemId));
  };

  // ── Unified safe pricing system ───────────────────────────────────────────
  // Single source of truth for all charge calculations.
  // - All values default to 0 (no undefined/NaN possible)
  // - finalAmount is always a safe integer (Math.round)
  // - UI, order data, and payment all use the same values

  const safeNum = (v) => {
    const n = parseFloat(v);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  };

  const itemsTotal = cart.reduce((sum, item) =>
    sum + (safeNum(item.price) * safeNum(item.quantity)), 0);

  // GST (legacy field — kept for backward compat with existing orders)
  const gstAmount = cafe?.gstEnabled
    ? itemsTotal * safeNum(cafe.gstRate) / 100
    : 0;

  // Tax (separate named tax — shown as taxName label)
  const taxAmount = cafe?.taxEnabled
    ? itemsTotal * safeNum(cafe.taxRate) / 100
    : 0;

  // Service charge
  const serviceChargeAmount = cafe?.serviceChargeEnabled
    ? itemsTotal * safeNum(cafe.serviceChargeRate) / 100
    : 0;

  // Platform fee — fixed amount set by owner
  const platformFeeAmount = cafe?.platformFeeEnabled
    ? safeNum(cafe.platformFeeAmount)
    : 0;

  // Final total — integer (Math.round prevents decimals sent to payment gateway)
  const finalAmount = Math.round(
    itemsTotal + gstAmount + taxAmount + serviceChargeAmount + platformFeeAmount
  );

  // Legacy calc wrappers — keep existing code that calls these working unchanged
  const calculateSubtotal      = () => itemsTotal;
  const calculateTax           = () => taxAmount;
  const calculateServiceCharge = () => serviceChargeAmount;
  const calculateGST           = () => gstAmount;
  const calculateTotal         = () => finalAmount;
  const CUR_SYMBOL             = cafe?.currencySymbol || '₹';

  // Debug log — called before payment to confirm UI = payment amount
  const logAmountBreakdown = () => {
    console.log('──── Order Amount Breakdown ────');
    console.log('Items:    ', itemsTotal.toFixed(2));
    console.log('GST:      ', gstAmount.toFixed(2));
    console.log('Tax:      ', taxAmount.toFixed(2));
    console.log('Service:  ', serviceChargeAmount.toFixed(2));
    console.log('Platform: ', platformFeeAmount.toFixed(2));
    console.log('Final:    ', finalAmount);
    console.log('────────────────────────────────');
  };

  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Categories
  const categories = useMemo(() => {
    const cats = ['all'];
    menuItems.forEach(item => {
      if (item.category && !cats.includes(item.category)) {
        cats.push(item.category);
      }
    });
    return cats;
  }, [menuItems]);

  // Handle offer click
  const handleOfferClick = (offer) => {
    if (offer.items && offer.items.length > 0) {
      if (offer.type === 'combo') {
        setCart([]);
      }
      
      const newCartItems = offer.items.map(offerItem => {
        const menuItem = menuItems.find(m => m.id === offerItem.itemId);
        if (menuItem) {
          return {
            ...menuItem,
            quantity: offerItem.quantity,
            originalPrice: menuItem.price,
            isOfferItem: true,
            offerId: offer.id,
            offerType: offer.type
          };
        }
        return {
          id: offerItem.itemId,
          name: offerItem.itemName,
          price: offerItem.itemPrice,
          quantity: offerItem.quantity,
          originalPrice: offerItem.itemPrice,
          isOfferItem: true,
          offerId: offer.id,
          offerType: offer.type
        };
      }).filter(Boolean);

      if (newCartItems.length > 0) {
        if (offer.type === 'combo' && offer.comboPrice) {
          const totalOriginal = newCartItems.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
          const comboPrice = parseFloat(offer.comboPrice);
          
          const adjustedItems = newCartItems.map(item => ({
            ...item,
            price: (item.originalPrice * item.quantity / totalOriginal) * comboPrice / item.quantity,
            comboPrice: comboPrice,
            offerTitle: offer.title
          }));
          
          setCart(adjustedItems);
          toast.success(`🎉 ${offer.title} added! You save ₹${(totalOriginal - comboPrice).toFixed(0)}!`);
        } else if (offer.type === 'discount') {
          const discountMultiplier = offer.discountType === 'percentage' 
            ? (1 - parseFloat(offer.discountAmount) / 100)
            : 1;
          
          const adjustedItems = newCartItems.map(item => ({
            ...item,
            price: offer.discountType === 'percentage' 
              ? item.price * discountMultiplier
              : item.price,
            discountApplied: true,
            offerTitle: offer.title
          }));
          
          setCart(prev => [...prev, ...adjustedItems]);
          toast.success(`🎉 ${offer.title} applied!`);
        } else if (offer.type === 'buy_x_get_y' && offer.getItemId) {
          setCart(prev => [...prev, ...newCartItems]);
          
          const freeItem = menuItems.find(m => m.id === offer.getItemId);
          if (freeItem) {
            const freeCartItem = {
              ...freeItem,
              quantity: offer.getQuantity || 1,
              price: 0,
              originalPrice: freeItem.price,
              isFreeItem: true,
              offerTitle: offer.title
            };
            setCart(prev => [...prev, freeCartItem]);
            toast.success(`🎁 ${offer.title}! ${freeItem.name} added FREE!`);
          }
        } else {
          setCart(prev => [...prev, ...newCartItems]);
          toast.success(`${offer.title} added to cart!`);
        }
        
      }
    }
  };

  // Filter menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchQuery, selectedCategory]);

  // Scroll to menu
  const scrollToMenu = () => {
    setShowHero(false);
    menuRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Confirm order
  const confirmOrder = async () => {
    setOrderPlacing(true);
    try {
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

      // All values come from the unified pricing system defined above
      // No recalculation — same numbers shown in UI = sent to backend = sent to payment
      const subtotal = calculateSubtotal();
      const total    = calculateTotal(); // finalAmount — already Math.round integer

      // Transparency log — verifies UI amount = payment amount
      logAmountBreakdown();

      const orderData = {
        cafeId,
        orderNumber,
        items: cart.map(item => ({
          name:       item.name,
          price:      item.basePrice ?? item.price,  // base price (without add-ons)
          quantity:   item.quantity,
          addons:     item.addons     || [],
          addonTotal: item.addonTotal || 0,
        })),
        subtotalAmount:      subtotal,
        taxAmount:           taxAmount,
        serviceChargeAmount: serviceChargeAmount,
        gstAmount:           gstAmount,
        platformFeeAmount:   platformFeeAmount,
        totalAmount:         total,
        currencyCode: cafe?.currencyCode || 'INR',
        currencySymbol: cafe?.currencySymbol || '₹',
        // TASK 1 FIX: Always 'pending' at creation.
        // Never mark paid before actual payment confirmation.
        // Only updated to 'paid' by: owner manual action OR future webhook.
        paymentStatus: 'pending',
        paymentMode,
        orderStatus: 'new',
        // calculationStatus: tracks whether prices have been confirmed post-creation.
        // 'pending' → order is live in kitchen immediately, summary loads on tracking page.
        // 'done'    → set right after addDoc (background, non-blocking).
        calculationStatus: 'pending',
        orderType,
        customerName,
        customerPhone,
        ...(orderType === 'dine-in' && { tableNumber }),
        ...(orderType === 'delivery' && { deliveryAddress }),
        ...(specialInstructions && { specialInstructions }),
        createdAt: serverTimestamp()
      };

      const orderDocRef = await addDoc(collection(db, 'orders'), orderData);

      // Mark calculationStatus:'done' immediately after write — non-blocking background update.
      // All prices are already calculated before addDoc, so this is just a status flag.
      // Kitchen and real-time listeners already have the order by this point.
      updateDoc(orderDocRef, { calculationStatus: 'done' }).catch(() => {});

      // ── Feature 1: Auto-generate invoice (non-blocking, does not affect order flow) ──
      createInvoiceForOrder(
        { ...orderData, orderNumber },
        orderDocRef.id,
        cafe
      ).catch((err) => console.error('[Invoice] Background generation failed:', err));

      // ── Feature 5: Auto-deduct inventory stock (non-blocking, safe) ──
      deductStockForOrder(cafeId, orderData.items, menuItems)
        .catch((err) => console.error('[Inventory] Stock deduction failed (non-fatal):', err));

      // ── Recipe-based stock deduction (non-blocking, safe) ──
      deductStockByRecipe(cafeId, orderData.items, menuItems)
        .catch((err) => console.error('[Recipe] Stock deduction failed (non-fatal):', err));

      // TASK 7: Log order creation (no sensitive data logged)
      console.log('[Order] Created successfully:', {
        orderId:     orderDocRef.id,
        orderNumber: String(orderNumber).padStart(3, '0'),
        paymentMode,
        paymentStatus: 'pending',
        totalAmount: total,
      });

      // ── Cashfree payment via backend proxy (Tasks 2, 4, 5) ─────────────
      // TASK 2: Direct browser call to api.cashfree.com is CORS-blocked.
      //         Call your Render/backend instead — it holds the keys server-side.
      // TASK 5: Frontend sends ONLY orderId, amount, phone, cafeId.
      //         Keys NEVER leave the backend.
      // TASK 4: orderId passed consistently so webhook can match it later.
      if (
        paymentMode === 'online' &&
        cafe?.paymentSettings?.enabled &&
        cafe?.paymentSettings?.gateway === 'cashfree'
      ) {
        try {
          // ── REPLACE THIS URL with your Render backend URL ──────────────
          // e.g. https://your-app.onrender.com/create-order
          const BACKEND_URL = cafe?.paymentSettings?.backendUrl || '';

          if (!BACKEND_URL) {
            console.warn('[Payment] Backend URL not configured. Set paymentSettings.backendUrl in café settings.');
            toast.error('Payment backend not configured. Please pay at counter.');
          } else {
            // TASK 7: Log payment initiation (no keys)
            console.log('[Payment] Initiating Cashfree via backend:', {
              orderId: orderDocRef.id,
              amount:  total,
              cafeId,
            });

            const resp = await fetch(`${BACKEND_URL}/create-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // TASK 5: Only non-sensitive data sent from frontend
              body: JSON.stringify({
                orderId:  orderDocRef.id,  // TASK 4: consistent orderId for webhook
                amount:   total,
                phone:    customerPhone,
                cafeId,
                currency: cafe?.currencyCode || 'INR',
                customerName,
                returnUrl: `${window.location.origin}/track/${orderDocRef.id}`,
              }),
            });

            const data = await resp.json();
            console.log('[Payment] Backend response received:', {
              status:             resp.status,
              has_session_id:     !!data?.payment_session_id,
              payment_session_id: data?.payment_session_id || 'MISSING',
            });

            if (data?.payment_session_id) {
              const sessionId = data.payment_session_id;

              // Confirm session received before using it
              console.log('[Payment] Session confirmed — launching Cashfree SDK');
              console.log('[Payment] payment_session_id:', sessionId);
              console.log('[Payment] orderId:', orderDocRef.id);

              // Use Cashfree JS SDK — no redirect delay, no stale session
              // SDK is loaded in index.html via <script src="https://sdk.cashfree.com/js/v3/cashfree.js">
              const cashfree = window.Cashfree({ mode: 'production' });
              cashfree.checkout({ paymentSessionId: sessionId });
              return;
            } else {
              console.error('[Payment] No payment_session_id in response:', data?.error || data);
              toast.error('Payment gateway error. Please pay at counter.');
            }
          }
        } catch (cfErr) {
          // TASK 6: On any failure, order stays 'pending' — no data lost
          console.error('[Payment] Backend call failed (order preserved as pending):', cfErr.message);
          toast.error('Payment unavailable. Your order is saved — please pay at counter.');
        }
      }

      const formattedOrderNumber = String(orderNumber).padStart(3, '0');

      const cur = cafe?.currencySymbol || '₹';
      let orderSummary = `*🚀 New Order*\n\n`;
      orderSummary += `*Order #${formattedOrderNumber}*\n`;
      orderSummary += `*Customer:* ${customerName}\n`;
      orderSummary += `*Phone:* ${customerPhone}\n`;
      orderSummary += `*Type:* ${orderType.charAt(0).toUpperCase() + orderType.slice(1)}\n`;
      
      if (orderType === 'dine-in') {
        orderSummary += `*Table:* ${tableNumber}\n`;
      } else if (orderType === 'delivery') {
        orderSummary += `*Address:* ${deliveryAddress}\n`;
      }
      
      orderSummary += `\n*Items:*\n`;
      cart.forEach(item => {
        const basePrice = item.basePrice ?? item.price;
        const lineTotal = (item.price * item.quantity).toFixed(2); // item.price already = base + addons
        orderSummary += `• ${item.name} x${item.quantity} ${cur}${lineTotal}\n`;
        if (item.addons?.length > 0) {
          item.addons.forEach(a => {
            orderSummary += `   ↳ ${a.name}: +${cur}${(a.price || 0).toFixed(2)}\n`;
          });
        }
      });

      const hasExtras = (cafe?.taxEnabled && taxAmount > 0) || (cafe?.serviceChargeEnabled && serviceChargeAmount > 0) || (cafe?.gstEnabled && gstAmount > 0);
      if (hasExtras) {
        orderSummary += `\n*Subtotal: ${cur}${subtotal.toFixed(2)}*\n`;
        if (cafe?.taxEnabled && taxAmount > 0) {
          orderSummary += `*${cafe.taxName || 'Tax'} (${cafe.taxRate}%): ${cur}${taxAmount.toFixed(2)}*\n`;
        }
        if (cafe?.serviceChargeEnabled && serviceChargeAmount > 0) {
          orderSummary += `*Service Charge (${cafe.serviceChargeRate}%): ${cur}${serviceChargeAmount.toFixed(2)}*\n`;
        }
        if (cafe?.gstEnabled && gstAmount > 0) {
          orderSummary += `*GST (${cafe.gstRate}%): ${cur}${gstAmount.toFixed(2)}*\n`;
        }
        orderSummary += `*Total: ${cur}${total.toFixed(2)}*\n`;
      } else {
        orderSummary += `\n*Total: ${cur}${total.toFixed(2)}*\n`;
      }
      orderSummary += `*Payment Mode:* ${paymentMode === 'counter' ? 'Pay at Counter' : paymentMode === 'table' ? 'Pay on Table' : paymentMode === 'online' ? 'Online Payment (Razorpay)' : 'Prepaid (UPI)'}`;
      
      if (specialInstructions) {
        orderSummary += `\n\n*Special Instructions:* ${specialInstructions}`;
      }

      const whatsappNumber = cafe?.whatsappNumber || '';
      const whatsappUrl = whatsappNumber 
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(orderSummary)}`
        : `https://wa.me/?text=${encodeURIComponent(orderSummary)}`;
      
      toast.success(`Order #${formattedOrderNumber} placed successfully!`);

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setOrderType('dine-in');
      setTableNumber('');
      setDeliveryAddress('');
      setPaymentMode('counter');
      setSpecialInstructions('');
      setShowCheckout(false);

      // Navigate customer to in-app order tracking (no WhatsApp redirect — stays in app)
      // Owner is notified via their WhatsApp from the dashboard order notification system.
      navigate(`/track/${orderDocRef.id}`);
      
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error('Failed to place order');
    } finally {
      setOrderPlacing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.background }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-full border-4"
          style={{ borderColor: COLORS.primary, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  // Not found state
  if (cafeNotFound || !cafe) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: defaultColors.background }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8"
        >
          <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: defaultColors.primary }} />
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif', color: defaultColors.text }}>
            Café Not Found
          </h1>
          <p style={{ color: defaultColors.textMuted }}>The café you're looking for doesn't exist.</p>
          <p className="text-sm mt-2" style={{ color: defaultColors.textMuted }}>ID: {cafeId}</p>
        </motion.div>
      </div>
    );
  }

  // ── isActive gate — show service unavailable if admin disabled this café ──
  if (cafe.isActive === false) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: defaultColors.background }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8 max-w-sm"
        >
          <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{ background: `${defaultColors.primary}15`, border: `2px solid ${defaultColors.primary}30` }}>
            <Coffee className="w-10 h-10" style={{ color: defaultColors.primary }} />
          </div>
          <h1 className="text-2xl font-bold mb-3"
            style={{ fontFamily: 'Playfair Display, serif', color: defaultColors.text }}>
            Service Temporarily Unavailable
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: defaultColors.textMuted }}>
            We're sorry — this café is currently not accepting online orders. Please visit us in person or try again later.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.background, fontFamily: 'Inter, sans-serif' }}>
      
      {/* Dynamic placeholder color — follows dark/light mode */}
      <style>{`
        .cafe-input::placeholder { color: ${COLORS.textMuted}; opacity: 1; }
        .cafe-input:focus { outline: none; box-shadow: 0 0 0 2px ${COLORS.primary}44; }
      `}</style>

      {/* ============ HERO SECTION ============ */}
      <AnimatePresence>
        {showHero && (
          <motion.section
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -50 }}
            className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
            style={{ 
              background: `linear-gradient(180deg, ${COLORS.warmWhite} 0%, ${COLORS.backgroundSecondary} 100%)`
            }}
          >
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-20 left-10 w-32 h-32 rounded-full opacity-20" style={{ backgroundColor: COLORS.primary }} />
              <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full opacity-10" style={{ backgroundColor: COLORS.text }} />
              <div className="absolute top-1/2 left-1/4 w-24 h-24 rounded-full opacity-10" style={{ backgroundColor: COLORS.primary }} />
            </div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="text-center px-6 relative z-10"
            >
              {/* Logo */}
              <motion.div variants={fadeInUp} className="mb-6">
                {cafe.logo ? (
                  <img src={cafe.logo} alt={cafe.name} className="w-24 h-24 mx-auto rounded-full object-cover shadow-lg" />
                ) : (
                  <div 
                    className="w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: COLORS.primary }}
                  >
                    <Coffee className="w-12 h-12 text-white" />
                  </div>
                )}
              </motion.div>

              {/* Café name */}
              <motion.h1 
                variants={fadeInUp}
                className="text-4xl md:text-6xl font-bold mb-4"
                style={{ fontFamily: 'Playfair Display, serif', color: COLORS.text }}
              >
                {cafe.name || 'Welcome'}
              </motion.h1>

              {/* Tagline */}
              <motion.p 
                variants={fadeInUp}
                className="text-lg md:text-xl mb-8 max-w-md mx-auto"
                style={{ color: COLORS.textLight }}
              >
                {cafe.tagline || 'Crafted with love, served with joy'}
              </motion.p>

              {/* CTA Button */}
              <motion.button
                variants={fadeInUp}
                whileHover={{ scale: 1.05, boxShadow: `0 10px 40px ${COLORS.shadowDark}` }}
                whileTap={{ scale: 0.98 }}
                onClick={scrollToMenu}
                className="px-10 py-4 rounded-full text-white text-lg font-semibold shadow-lg transition-all"
                style={{ backgroundColor: COLORS.primary }}
              >
                Order Now
              </motion.button>

              {/* Scroll indicator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, y: [0, 10, 0] }}
                transition={{ delay: 1, duration: 2, repeat: Infinity }}
                className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
              >
                <ChevronDown className="w-8 h-8" style={{ color: COLORS.textMuted }} />
              </motion.div>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ============ TODAY'S OFFERS ============ */}
      {offers.length > 0 && (
        <section className="py-12 px-6" style={{ backgroundColor: COLORS.backgroundSecondary }}>
          <div className="max-w-6xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-2xl md:text-3xl font-bold mb-8 flex items-center gap-3"
              style={{ fontFamily: 'Playfair Display, serif', color: COLORS.text }}
            >
              <span>🔥</span> Today's Offers
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {offers.map((offer, index) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.03, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleOfferClick(offer)}
                  className="rounded-2xl overflow-hidden shadow-lg cursor-pointer group" style={{ backgroundColor: COLORS.cardBg }}
                  data-testid={`offer-banner-${offer.id}`}
                >
                  {offer.bannerImage ? (
                    <div className="aspect-video overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
                      <img 
                        src={offer.bannerImage} 
                        alt={offer.title} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                      />
                      <div className="absolute bottom-3 left-4 z-20">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                          offer.type === 'combo' ? 'bg-purple-500 text-white' :
                          offer.type === 'discount' ? 'bg-green-500 text-white' :
                          'bg-blue-500 text-white'
                        }`}>
                          {offer.type === 'combo' ? 'COMBO' :
                           offer.type === 'discount' ? 'DISCOUNT' : 'BOGO'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="aspect-video flex items-center justify-center"
                      style={{ backgroundColor: COLORS.primary }}
                    >
                      <Package className="w-16 h-16 text-white opacity-50" />
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="text-lg font-bold mb-2" style={{ color: COLORS.text }}>{offer.title}</h3>
                    <p className="text-sm mb-3" style={{ color: COLORS.textMuted }}>{offer.description}</p>
                    
                    {offer.items && offer.items.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {offer.items.slice(0, 3).map((item, idx) => (
                          <span 
                            key={idx} 
                            className="text-xs px-2 py-1 rounded-full"
                            style={{ backgroundColor: `${COLORS.primary}20`, color: COLORS.primary }}
                          >
                            {item.itemName}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      {offer.comboPrice && (
                        <div className="flex items-center gap-2">
                          <span className="line-through text-sm" style={{ color: COLORS.textMuted }}>{CUR}{offer.originalPrice}</span>
                          <span className="text-xl font-bold" style={{ color: COLORS.primary }}>{CUR}{offer.comboPrice}</span>
                        </div>
                      )}
                      {offer.type === 'discount' && (
                        <span className="font-bold" style={{ color: COLORS.primary }}>
                          {offer.discountType === 'percentage' ? `${offer.discountAmount}% OFF` : `₹${offer.discountAmount} OFF`}
                        </span>
                      )}
                      <span 
                        className="text-sm font-semibold group-hover:translate-x-1 transition-transform"
                        style={{ color: COLORS.primary }}
                      >
                        Add →
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ MENU SECTION ============ */}
      <section className="py-12 px-6" style={{ backgroundColor: COLORS.cream }} ref={menuRef}>
        <div className="max-w-6xl mx-auto">
          {/* Search Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <div className="relative max-w-lg mx-auto">
              <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: COLORS.textMuted }} />
              <input
                type="text"
                data-testid="menu-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="cafe-input w-full h-14 pl-14 pr-14 rounded-full border-2 text-lg shadow-sm transition-all focus:shadow-lg outline-none"
                style={{ 
                  backgroundColor: COLORS.cardBg,
                  borderColor: searchQuery ? COLORS.primary : COLORS.border,
                  color: COLORS.text,
                  caretColor: COLORS.primary
                }}
                placeholder="Search menu..."
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-5 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" style={{ color: COLORS.textMuted }} />
                </button>
              )}
            </div>
          </motion.div>

          {/* Category Tabs */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-3 mb-10"
          >
            {categories.map((category) => (
              <motion.button
                key={category}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                data-testid={`category-${category}`}
                onClick={() => setSelectedCategory(category)}
                className="px-6 py-2.5 rounded-full font-medium transition-all"
                style={{
                  backgroundColor: selectedCategory === category ? COLORS.primary : COLORS.cardBg,
                  color: selectedCategory === category ? 'white' : COLORS.textLight,
                  boxShadow: selectedCategory === category ? `0 4px 15px ${COLORS.shadowDark}` : `0 2px 10px ${COLORS.shadow}`
                }}
              >
                {category === 'all' ? 'All Items' : category}
              </motion.button>
            ))}
          </motion.div>

          {/* Menu Grid */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"
          >
            {filteredItems.map((item) => (
              <motion.div
                key={item.id}
                variants={fadeInUp}
                initial="rest"
                whileHover="hover"
                animate={addingItemId === item.id ? { scale: [1, 0.95, 1] } : "rest"}
                className="rounded-2xl overflow-hidden shadow-md group" style={{ backgroundColor: COLORS.cardBg }}
                style={{ boxShadow: `0 4px 20px ${COLORS.shadow}` }}
              >
                {/* Item Image */}
                <div className="aspect-square overflow-hidden relative">
                  {item.image ? (
                    <motion.img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.backgroundSecondary }}
                    >
                      <Coffee className="w-12 h-12" style={{ color: COLORS.textMuted }} />
                    </div>
                  )}
                  
                  {/* Quick Add Button */}
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ opacity: 1, scale: 1 }}
                    animate={addingItemId === item.id ? { scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] } : {}}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: COLORS.primary }}
                    onClick={() => addToCart(item)}
                    data-testid={`quick-add-${item.id}`}
                  >
                    <Plus className="w-5 h-5 text-white" />
                  </motion.button>
                </div>

                {/* Item Details */}
                <div className="p-4">
                  <h3 className="font-semibold text-base mb-1 line-clamp-1" style={{ color: COLORS.text }}>
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-xs mb-3 line-clamp-2" style={{ color: COLORS.textMuted }}>
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold" style={{ color: COLORS.primary }}>
                      {CUR}{item.price}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => addToCart(item)}
                      className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-all"
                      style={{ backgroundColor: COLORS.primary }}
                      data-testid={`add-${item.id}`}
                    >
                      Add
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {filteredItems.length === 0 && (
            <div className="text-center py-12">
              <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: COLORS.textMuted }} />
              <p style={{ color: COLORS.textMuted }}>No items found</p>
            </div>
          )}
        </div>
      </section>

      {/* ============ FLOATING CART BUTTON ============ */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.button
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            whileHover={{ scale: 1.05, boxShadow: `0 10px 40px ${COLORS.shadowDark}` }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCheckout(true)}
            className="fixed bottom-6 right-6 px-6 py-4 rounded-full text-white font-semibold shadow-2xl flex items-center gap-3 z-40"
            style={{ backgroundColor: COLORS.primary }}
            data-testid="floating-cart-btn"
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
            >
              <ShoppingCart className="w-6 h-6" />
            </motion.div>
            <span>{cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'}</span>
            <span className="font-bold">— {CUR}{calculateTotal().toFixed(0)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ============ CHECKOUT MODAL ============ */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center"
            onClick={() => setShowCheckout(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full md:w-[500px] md:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-y-auto"
              style={{ backgroundColor: COLORS.cardBg }}
            >
              {/* Header */}
              <div className="sticky top-0 p-6 border-b flex items-center justify-between z-10"
                style={{ backgroundColor: COLORS.cardBg, borderColor: COLORS.border }}>
                <h2 className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif', color: COLORS.text }}>
                  Your Order
                </h2>
                <button 
                  onClick={() => setShowCheckout(false)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-6 h-6" style={{ color: COLORS.textMuted }} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Cart Items */}
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl" style={{ backgroundColor: COLORS.backgroundSecondary }}>
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: COLORS.primary }}>
                          <Coffee className="w-8 h-8 text-white" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold" style={{ color: COLORS.text }}>{item.name}</h4>
                        <p className="text-sm" style={{ color: COLORS.primary }}>{CUR}{parseFloat(item.basePrice ?? item.price).toFixed(2)} each</p>
                        {item.addons?.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
                            + {item.addons.map(a => a.name).join(', ')}
                          </p>
                        )}
                        {item.isFreeItem && <span className="text-xs text-green-500 font-bold">FREE!</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: COLORS.cardBg }}
                        >
                          <Minus className="w-4 h-4" style={{ color: COLORS.textMuted }} />
                        </button>
                        <span className="w-8 text-center font-semibold" style={{ color: COLORS.text }}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: COLORS.cardBg }}
                        >
                          <Plus className="w-4 h-4" style={{ color: COLORS.textMuted }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Total Breakdown — always shown for full transparency */}
                <div className="p-4 rounded-xl space-y-2" style={{ backgroundColor: `${COLORS.primary}15` }}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: COLORS.textMuted }}>Items Total</span>
                    <span className="font-medium" style={{ color: COLORS.text }}>{CUR}{itemsTotal.toFixed(2)}</span>
                  </div>
                  {cafe?.taxEnabled && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm" style={{ color: COLORS.textMuted }}>
                        {cafe.taxName || 'Tax'} ({cafe.taxRate}%)
                      </span>
                      <span className="font-medium" style={{ color: COLORS.text }}>
                        {taxAmount > 0 ? `${CUR}${taxAmount.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  )}
                  {cafe?.serviceChargeEnabled && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm" style={{ color: COLORS.textMuted }}>
                        Service Charge ({cafe.serviceChargeRate}%)
                      </span>
                      <span className="font-medium" style={{ color: COLORS.text }}>
                        {serviceChargeAmount > 0 ? `${CUR}${serviceChargeAmount.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  )}
                  {cafe?.gstEnabled && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm" style={{ color: COLORS.textMuted }}>
                        GST ({cafe.gstRate}%)
                      </span>
                      <span className="font-medium" style={{ color: COLORS.text }}>
                        {gstAmount > 0 ? `${CUR}${gstAmount.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  )}
                  {cafe?.platformFeeEnabled && platformFeeAmount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm" style={{ color: COLORS.textMuted }}>Platform Fee</span>
                      <span className="font-medium" style={{ color: COLORS.text }}>{CUR}{platformFeeAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {!cafe?.taxEnabled && !cafe?.serviceChargeEnabled && !cafe?.gstEnabled && !cafe?.platformFeeEnabled && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>No additional charges</span>
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>✓</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between items-center" style={{ borderColor: `${COLORS.primary}30` }}>
                    <span className="font-semibold" style={{ color: COLORS.text }}>Total</span>
                    <span className="text-2xl font-bold" style={{ color: COLORS.primary }}>{CUR}{finalAmount}</span>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Your Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="cafe-input w-full h-14 px-5 rounded-xl border-2 outline-none transition-all"
                    style={{ borderColor: COLORS.border, backgroundColor: COLORS.cardBg, color: COLORS.text, caretColor: COLORS.primary }}
                    data-testid="customer-name"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="cafe-input w-full h-14 px-5 rounded-xl border-2 outline-none transition-all"
                    style={{ borderColor: COLORS.border, backgroundColor: COLORS.cardBg, color: COLORS.text, caretColor: COLORS.primary }}
                    data-testid="customer-phone"
                  />

                  {/* Order Type */}
                  <div className="flex gap-3">
                    {['dine-in', 'takeaway', 'delivery'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setOrderType(type)}
                        className="flex-1 py-3 rounded-xl font-medium transition-all"
                        style={{
                          backgroundColor: orderType === type ? COLORS.primary : COLORS.backgroundSecondary,
                          color: orderType === type ? 'white' : COLORS.textLight
                        }}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>

                  {orderType === 'dine-in' && (
                    <input
                      type="text"
                      placeholder="Table Number"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      className="cafe-input w-full h-14 px-5 rounded-xl border-2 outline-none transition-all"
                      style={{ borderColor: COLORS.border, backgroundColor: COLORS.cardBg, color: COLORS.text, caretColor: COLORS.primary }}
                    />
                  )}

                  {orderType === 'delivery' && (
                    <textarea
                      placeholder="Delivery Address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="cafe-input w-full h-24 px-5 py-4 rounded-xl border-2 outline-none resize-none transition-all"
                      style={{ borderColor: COLORS.border, backgroundColor: COLORS.cardBg, color: COLORS.text, caretColor: COLORS.primary }}
                    />
                  )}

                  <textarea
                    placeholder="Special Instructions (optional)"
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    className="cafe-input w-full h-20 px-5 py-4 rounded-xl border-2 outline-none resize-none transition-all"
                    style={{ borderColor: COLORS.border, backgroundColor: COLORS.cardBg, color: COLORS.text, caretColor: COLORS.primary }}
                  />

                  {/* Payment Mode */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: COLORS.textMuted }}>Payment</label>
                    <div className="flex gap-3 flex-wrap">
                      {/* Always show counter + table */}
                      {[
                        { id: 'counter', label: 'At Counter' },
                        { id: 'table',   label: 'On Table'  },
                        { id: 'prepaid', label: 'UPI'       },
                        // Feature 3: show Pay Online only if cafe has it enabled
                        ...(cafe?.paymentSettings?.enabled ? [{ id: 'online', label: '💳 Pay Online' }] : []),
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setPaymentMode(mode.id)}
                          className="flex-1 py-3 rounded-xl font-medium transition-all text-sm"
                          style={{
                            backgroundColor: paymentMode === mode.id ? COLORS.primary : COLORS.backgroundSecondary,
                            color: paymentMode === mode.id ? 'white' : COLORS.textLight,
                            minWidth: mode.id === 'online' ? '100%' : undefined,
                          }}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {/* Feature 3: Razorpay "Pay Online" info strip */}
                    {paymentMode === 'online' && cafe?.paymentSettings?.enabled && (
                      <div
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
                        style={{ backgroundColor: `${COLORS.primary}15`, border: `1px solid ${COLORS.primary}30` }}
                      >
                        <span style={{ color: COLORS.primary }}>💳</span>
                        <span style={{ color: COLORS.textLight }}>
                          You will be taken to a secure Razorpay payment page after placing your order.
                          {cafe.paymentSettings.merchantName && (
                            <span style={{ color: COLORS.primary }}> · {cafe.paymentSettings.merchantName}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* UPI QR Code */}
                {paymentMode === 'prepaid' && cafe?.upiId && (
                  <div className="text-center p-6 rounded-xl" style={{ backgroundColor: COLORS.backgroundSecondary }}>
                    <p className="mb-4 font-medium" style={{ color: COLORS.text }}>Scan to Pay</p>
                    <div className="bg-white p-4 rounded-xl inline-block">
                      <QRCodeSVG
                        value={`upi://pay?pa=${cafe.upiId}&pn=${cafe.name}&am=${calculateTotal()}&cu=INR`}
                        size={180}
                      />
                    </div>
                    <p className="mt-4 text-sm" style={{ color: COLORS.textMuted }}>UPI: {cafe.upiId}</p>
                  </div>
                )}

                {/* Place Order Button */}
                <div className="relative">
                  {/* Pulse ring — visible only while placing */}
                  {orderPlacing && (
                    <motion.span
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      initial={{ opacity: 0.7, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.06 }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
                      style={{ background: 'transparent', border: `2px solid ${COLORS.primary}`, borderRadius: 12 }}
                    />
                  )}
                  <motion.button
                    whileHover={!orderPlacing ? { scale: 1.02 } : {}}
                    whileTap={!orderPlacing ? { scale: 0.96 } : {}}
                    onClick={confirmOrder}
                    disabled={!customerName || !customerPhone || orderPlacing}
                    className="w-full py-4 rounded-xl text-white font-semibold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5"
                    style={{ backgroundColor: COLORS.primary }}
                    data-testid="place-order-btn"
                  >
                    {orderPlacing ? (
                      <>
                        <motion.span
                          className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white block flex-shrink-0"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                        />
                        Placing Order…
                      </>
                    ) : (
                      `Place Order — ${CUR}${calculateTotal().toFixed(0)}`
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add-on selection modal — shown when customer taps item with add-ons */}
      {addonModal && (
        <AddOnModal
          item={addonModal}
          onConfirm={(entry) => { directAddToCart(entry); setAddonModal(null); }}
          onClose={() => setAddonModal(null)}
          currencySymbol={CUR}
          primaryColor={cafe?.primaryColor}
          theme={cafe?.mode}
        />
      )}
    </div>
  );
};

export default CafeOrdering;
