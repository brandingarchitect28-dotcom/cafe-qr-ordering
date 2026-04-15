import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, doc, addDoc, serverTimestamp, runTransaction, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createInvoiceForOrder } from '../services/invoiceService';
import { deductStockForOrder } from '../services/inventoryService';
import { deductStockByRecipe } from '../services/recipeService';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Plus, Minus, X, Search, Coffee, Package, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';
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

import FoodDetailPremium from '../components/dashboard/FoodDetailPremium';
import CafeDisabled     from './CafeDisabled';

const CafeOrdering = () => {
  const { cafeId } = useParams();
  const [cafe, setCafe] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [offers, setOffers] = useState([]);
  const [cart, setCart] = useState([]);
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
  const [selectedFoodItem, setSelectedFoodItem] = useState(null); // Food detail overlay
  
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
  const addToCart = (item, size = null) => {
    const selectedPrice = size && item.sizePricing?.[size]
      ? parseFloat(item.sizePricing[size])
      : item.price;
    const cartEntry = { ...item, price: selectedPrice, selectedSize: size || null };
    setAddingItemId(item.id);
    setTimeout(() => setAddingItemId(null), 600);
    if (size) {
      const existing = cart.find(i => i.id === item.id && i.selectedSize === size);
      if (existing) {
        setCart(cart.map(i => i.id === item.id && i.selectedSize === size ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        setCart([...cart, { ...cartEntry, quantity: 1 }]);
      }
    } else {
      const existingItem = cart.find(i => i.id === item.id && !i.selectedSize);
      if (existingItem) {
        setCart(cart.map(i => i.id === item.id && !i.selectedSize ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        setCart([...cart, { ...cartEntry, quantity: 1 }]);
      }
    }
    const sizeLabel = size ? ` (${size.charAt(0).toUpperCase() + size.slice(1)})` : '';
    toast.success(`${item.name}${sizeLabel} added to cart`, { duration: 2000 });
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

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateTax = () => {
    if (!cafe?.taxEnabled) return 0;
    return calculateSubtotal() * (parseFloat(cafe.taxRate) || 0) / 100;
  };

  const calculateServiceCharge = () => {
    if (!cafe?.serviceChargeEnabled) return 0;
    return calculateSubtotal() * (parseFloat(cafe.serviceChargeRate) || 0) / 100;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax() + calculateServiceCharge();
  };

  // Keep legacy GST for backward compat with existing orders
  const calculateGST = () => {
    if (!cafe?.gstEnabled) return 0;
    return calculateSubtotal() * (parseFloat(cafe.gstRate) || 0) / 100;
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

      const subtotal = calculateSubtotal();
      const taxAmount = calculateTax();
      const serviceChargeAmount = calculateServiceCharge();
      const gstAmount = calculateGST(); // legacy
      const total = calculateTotal();

      // ── Utility: remove undefined values — Firestore rejects any undefined field ──
      const removeUndefined = (obj) => {
        if (Array.isArray(obj)) return obj.map(removeUndefined);
        if (obj && typeof obj === 'object') {
          return Object.fromEntries(
            Object.entries(obj)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, removeUndefined(v)])
          );
        }
        return obj;
      };

      const orderData = removeUndefined({
        cafeId,
        orderNumber,
        items: cart.map(item => removeUndefined({
          name:         item.name         || '',
          price:        parseFloat(item.price) || 0,
          quantity:     item.quantity     || 1,
          addons:       item.addons       || [],
          addonTotal:   item.addonTotal   || 0,
          selectedSize: item.selectedSize || null,
          comboItems:   item.comboItems   || [],
          ...(item.isOffer   && { isOffer:   true           }),
          ...(item.offerType && { offerType: item.offerType }),
        })),
        subtotalAmount: subtotal,
        taxAmount: taxAmount,
        serviceChargeAmount: serviceChargeAmount,
        gstAmount: gstAmount,
        totalAmount: total,
        currencyCode: cafe?.currencyCode || 'INR',
        currencySymbol: cafe?.currencySymbol || '₹',
        paymentStatus: (paymentMode === 'prepaid' || paymentMode === 'online') ? 'paid' : 'pending',
        paymentMode,
        orderStatus: 'new',
        orderType,
        customerName,
        customerPhone,
        ...(orderType === 'dine-in' && tableNumber && { tableNumber }),
        ...(orderType === 'delivery' && deliveryAddress && { deliveryAddress }),
        ...(specialInstructions && { specialInstructions }),
        createdAt: serverTimestamp()
      });

      console.log('[Order] Writing to Firestore:', {
        cafeId,
        itemCount: orderData.items?.length,
        totalAmount: orderData.totalAmount,
        orderType: orderData.orderType,
      });

      const orderDocRef = await addDoc(collection(db, 'orders'), orderData);

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
        orderSummary += `• ${item.name} x${item.quantity} ${cur}${(item.price * item.quantity).toFixed(2)}\n`;
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
      
      window.location.href = whatsappUrl;
      
    } catch (error) {
      console.error('[Order] PLACEMENT FAILED:', error.code || 'no-code', error.message);
      if (error.code === 'permission-denied') {
        console.error('[Order] FIRESTORE RULE ISSUE — check rules for orders collection');
        toast.error('Order failed: permission denied. Contact support.');
      } else {
        toast.error('Failed to place order. Please try again.');
      }
      console.error('[Order] Full error:', error);
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

  // ── isActive check — add-only: blocks disabled cafes without changing any existing logic ──
  if (cafe.isActive === false) {
    return <CafeDisabled isAdmin={false} />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.background, fontFamily: 'Inter, sans-serif' }}>
      
      {/* Food Detail Premium Overlay */}
      {selectedFoodItem && (
        <FoodDetailPremium
          item={selectedFoodItem}
          onClose={() => setSelectedFoodItem(null)}
        />
      )}

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
                  {(() => {
                    const mediaUrl = item.image || item.video || item.mediaUrl || '';
                    const isVideo  = mediaUrl.toLowerCase().includes('.mp4');
                    return mediaUrl ? (
                      isVideo ? (
                        <video
                          src={mediaUrl}
                          autoPlay muted loop playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <motion.img
                          src={mediaUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          whileHover={{ scale: 1.1 }}
                          transition={{ duration: 0.3 }}
                        />
                      )
                    ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.backgroundSecondary }}
                    >
                      <Coffee className="w-12 h-12" style={{ color: COLORS.textMuted }} />
                    </div>
                  );
                  })()}
                  
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
                  {(() => {
                    const hasSizes = item?.sizePricing != null && item.sizePricing.enabled === true;
                    return hasSizes ? (
                      <div className="space-y-1.5 mt-2">
                        {item.sizePricing.small && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => addToCart(item, 'small')}
                            className="w-full py-1.5 px-3 rounded-full text-sm font-semibold text-white flex justify-between items-center"
                            style={{ backgroundColor: COLORS.primary }}
                            data-testid={`add-small-${item.id}`}
                          ><span>Small</span><span>{CUR}{parseFloat(item.sizePricing.small).toFixed(2)}</span></motion.button>
                        )}
                        {item.sizePricing.medium && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => addToCart(item, 'medium')}
                            className="w-full py-1.5 px-3 rounded-full text-sm font-semibold text-white flex justify-between items-center"
                            style={{ backgroundColor: COLORS.primary }}
                            data-testid={`add-medium-${item.id}`}
                          ><span>Medium</span><span>{CUR}{parseFloat(item.sizePricing.medium).toFixed(2)}</span></motion.button>
                        )}
                        {item.sizePricing.large && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => addToCart(item, 'large')}
                            className="w-full py-1.5 px-3 rounded-full text-sm font-semibold text-white flex justify-between items-center"
                            style={{ backgroundColor: COLORS.primary }}
                            data-testid={`add-large-${item.id}`}
                          ><span>Large</span><span>{CUR}{parseFloat(item.sizePricing.large).toFixed(2)}</span></motion.button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold" style={{ color: COLORS.primary }}>{CUR}{item.price}</span>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => addToCart(item)}
                          className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-all"
                          style={{ backgroundColor: COLORS.primary }}
                          data-testid={`add-${item.id}`}
                        >Add</motion.button>
                      </div>
                    );
                  })()}
                  {/* Show Food Details — opens FoodDetailPremium overlay */}
                  {(item.ingredients || item.calories || item.protein || item.carbs || item.fats) && (
                    <button
                      onClick={() => setSelectedFoodItem(item)}
                      className="w-full text-xs mt-2 py-1.5 text-center transition-colors"
                      style={{ color: COLORS.textMuted }}
                      data-testid={`food-detail-${item.id}`}
                    >
                      🔍 Show Food Details
                    </button>
                  )}
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
                        {item.selectedSize && (
                          <span className="text-xs capitalize" style={{ color: COLORS.textMuted }}>Size: {item.selectedSize}</span>
                        )}
                        <p className="text-sm" style={{ color: COLORS.primary }}>{CUR}{parseFloat(item.price).toFixed(2)} each</p>
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

                {/* Order Total Breakdown */}
                <div className="p-4 rounded-xl space-y-2" style={{ backgroundColor: `${COLORS.primary}15` }}>
                  {(cafe?.taxEnabled || cafe?.serviceChargeEnabled || cafe?.gstEnabled) ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm" style={{ color: COLORS.textMuted }}>Subtotal</span>
                        <span className="font-medium" style={{ color: COLORS.text }}>{CUR}{calculateSubtotal().toFixed(2)}</span>
                      </div>
                      {cafe?.taxEnabled && calculateTax() > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: COLORS.textMuted }}>{cafe.taxName || 'Tax'} ({cafe.taxRate}%)</span>
                          <span className="font-medium" style={{ color: COLORS.text }}>{CUR}{calculateTax().toFixed(2)}</span>
                        </div>
                      )}
                      {cafe?.serviceChargeEnabled && calculateServiceCharge() > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: COLORS.textMuted }}>Service Charge ({cafe.serviceChargeRate}%)</span>
                          <span className="font-medium" style={{ color: COLORS.text }}>{CUR}{calculateServiceCharge().toFixed(2)}</span>
                        </div>
                      )}
                      {cafe?.gstEnabled && calculateGST() > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: COLORS.textMuted }}>GST ({cafe.gstRate}%)</span>
                          <span className="font-medium" style={{ color: COLORS.text }}>{CUR}{calculateGST().toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t pt-2 flex justify-between items-center" style={{ borderColor: `${COLORS.primary}30` }}>
                        <span className="font-semibold" style={{ color: COLORS.text }}>Total</span>
                        <span className="text-2xl font-bold" style={{ color: COLORS.primary }}>{CUR}{calculateTotal().toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="font-semibold" style={{ color: COLORS.text }}>Total</span>
                      <span className="text-2xl font-bold" style={{ color: COLORS.primary }}>{CUR}{calculateTotal().toFixed(2)}</span>
                    </div>
                  )}
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
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmOrder}
                  disabled={!customerName || !customerPhone || orderPlacing}
                  className="w-full py-4 rounded-xl text-white font-semibold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ backgroundColor: COLORS.primary }}
                  data-testid="place-order-btn"
                >
                  {orderPlacing ? 'Placing Order...' : `Place Order — ${CUR}${calculateTotal().toFixed(0)}`}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CafeOrdering;
