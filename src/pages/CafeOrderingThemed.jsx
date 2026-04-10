import React, { useState, useEffect, useMemo } from 'react';
import FoodDetailPremium from '../components/dashboard/FoodDetailPremium';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Plus, Minus, X, Send, Search, Copy, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { getTheme, getThemedColors } from '../config/themes';

const CafeOrderingThemed = () => {
  const { cafeId } = useParams();
  const [cafe, setCafe] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [offers, setOffers] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
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
  const [selectedFoodItem, setSelectedFoodItem] = useState(null); // Food detail overlay

  // Get theme configuration — respects dark/light mode and custom primary color
  const theme = useMemo(() => {
    if (!cafe) return getThemedColors('luxury', 'dark', null);
    return getThemedColors(
      cafe.themeStyle || cafe.theme?.layoutStyle || 'luxury',
      cafe.mode || 'dark',
      cafe.primaryColor || cafe.theme?.primaryColor || null
    );
  }, [cafe]);

  useEffect(() => {
    const loadCafeData = async () => {
      try {
        const cafeDoc = await getDoc(doc(db, 'cafes', cafeId));
        if (cafeDoc.exists()) {
          setCafe({ id: cafeDoc.id, ...cafeDoc.data() });
        }

        const menuQuery = query(collection(db, 'menuItems'), where('cafeId', '==', cafeId), where('available', '==', true));
        const menuSnapshot = await getDocs(menuQuery);
        const items = menuSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMenuItems(items);

        const offersQuery = query(collection(db, 'offers'), where('cafeId', '==', cafeId), where('active', '==', true));
        const offersSnapshot = await getDocs(offersQuery);
        const activeOffers = offersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOffers(activeOffers);
      } catch (error) {
        console.error('Error loading cafe:', error);
        toast.error('Failed to load cafe');
      } finally {
        setLoading(false);
      }
    };

    loadCafeData();
  }, [cafeId]);

  const addToCart = (item, size = null) => {
    const selectedPrice = size && item.sizePricing?.[size]
      ? parseFloat(item.sizePricing[size])
      : item.price;
    const cartEntry = { ...item, price: selectedPrice, selectedSize: size || null };
    if (size) {
      const existing = cart.find(i => i.id === item.id && i.selectedSize === size);
      if (existing) {
        setCart(cart.map(i => i.id === item.id && i.selectedSize === size ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        setCart([...cart, { ...cartEntry, quantity: 1 }]);
      }
    } else {
      const existing = cart.find(i => i.id === item.id && !i.selectedSize);
      if (existing) {
        setCart(cart.map(i => i.id === item.id && !i.selectedSize ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        setCart([...cart, { ...cartEntry, quantity: 1 }]);
      }
    }
    const sizeLabel = size ? ` (${size.charAt(0).toUpperCase() + size.slice(1)})` : '';
    toast.success(`${item.name}${sizeLabel} added to cart`);
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

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const categories = useMemo(() => {
    const cats = ['all'];
    menuItems.forEach(item => {
      if (item.category && !cats.includes(item.category)) {
        cats.push(item.category);
      }
    });
    return cats;
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    let filtered = menuItems;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [menuItems, selectedCategory, searchQuery]);

  const proceedToCheckout = () => {
    if (cart.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    setShowCart(false);
    setShowCheckout(true);
  };

  const placeOrder = async () => {
    if (!customerName || !customerPhone) {
      toast.error('Please enter your name and phone number');
      return;
    }

    if (orderType === 'dine-in' && !tableNumber) {
      toast.error('Please enter table number');
      return;
    }

    if (orderType === 'delivery' && !deliveryAddress) {
      toast.error('Please enter delivery address');
      return;
    }

    if (cart.length === 0) {
      toast.error('Your cart is empty');
      return;
    }

    if (paymentMode === 'prepaid') {
      setShowCheckout(false);
      setShowPayment(true);
      return;
    }

    await confirmOrder();
  };

  const confirmOrder = async () => {
    setOrderPlacing(true);
    try {
      const orderData = {
        cafeId,
        items: cart.map(item => ({ name: item.name, price: item.price, quantity: item.quantity })),
        totalAmount: calculateTotal(),
        paymentStatus: paymentMode === 'prepaid' ? 'paid' : 'pending',
        paymentMode,
        orderStatus: 'new',
        orderType,
        customerName,
        customerPhone,
        ...(orderType === 'dine-in' && { tableNumber }),
        ...(orderType === 'delivery' && { deliveryAddress }),
        ...(specialInstructions && { specialInstructions }),
        createdAt: serverTimestamp()
      };

      const orderRef = await addDoc(collection(db, 'orders'), orderData);
      const orderId = orderRef.id;

      let orderSummary = `*🔔 New Order Received*\n\n`;
      orderSummary += `*Cafe:* ${cafe?.name || 'Cafe'}\n\n`;
      orderSummary += `*Customer:* ${customerName}\n`;
      orderSummary += `*Phone:* ${customerPhone}\n\n`;
      orderSummary += `*Order Type:* ${orderType.charAt(0).toUpperCase() + orderType.slice(1)}\n`;
      
      if (orderType === 'dine-in') {
        orderSummary += `*Table Number:* ${tableNumber}\n`;
      } else if (orderType === 'delivery') {
        orderSummary += `*Delivery Address:* ${deliveryAddress}\n`;
      }
      
      orderSummary += `\n*Items:*\n`;
      cart.forEach(item => {
        orderSummary += `• ${item.name} × ${item.quantity} - ₹${(item.price * item.quantity).toFixed(2)}\n`;
      });
      
      orderSummary += `\n*Total: ₹${calculateTotal().toFixed(2)}*\n`;
      orderSummary += `*Payment Mode:* ${paymentMode === 'counter' ? 'Pay at Counter' : paymentMode === 'table' ? 'Pay on Table' : 'Prepaid (UPI)'}\n`;
      
      if (specialInstructions) {
        orderSummary += `\n*Special Instructions:* ${specialInstructions}\n`;
      }
      
      orderSummary += `\n*Order ID:* ${orderId}`;

      const whatsappNumber = cafe?.whatsappNumber || '';
      const whatsappUrl = whatsappNumber 
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(orderSummary)}`
        : `https://wa.me/?text=${encodeURIComponent(orderSummary)}`;
      
      window.open(whatsappUrl, '_blank');

      toast.success('Order placed successfully!');
      
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setOrderType('dine-in');
      setTableNumber('');
      setDeliveryAddress('');
      setPaymentMode('counter');
      setSpecialInstructions('');
      setShowCart(false);
      setShowCheckout(false);
      setShowPayment(false);
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error('Failed to place order');
    } finally {
      setOrderPlacing(false);
    }
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: theme.colors.background }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 rounded-full"
          style={{ 
            borderColor: theme.colors.primary,
            borderTopColor: 'transparent'
          }}
        />
      </div>
    );
  }

  if (!cafe) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: theme.colors.background }}
      >
        <div style={{ color: theme.colors.text }}>Cafe not found</div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen"
      style={{ 
        backgroundColor: theme.colors.background,
        fontFamily: theme.fonts.body,
        color: theme.colors.text
      }}
    >
      {/* Food Detail Premium Overlay */}
      {selectedFoodItem && (
        <FoodDetailPremium
          item={selectedFoodItem}
          onClose={() => setSelectedFoodItem(null)}
        />
      )}
      {/* Hero Section - Animated */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`
        }}
      >
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <motion.div
            animate={{ 
              backgroundPosition: ['0% 0%', '100% 100%']
            }}
            transition={{ duration: 20, repeat: Infinity, repeatType: 'reverse' }}
            className="w-full h-full"
            style={{
              backgroundImage: `radial-gradient(circle, ${theme.colors.primary} 1px, transparent 1px)`,
              backgroundSize: '50px 50px'
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-16">
          <div className="text-center">
            {/* Logo */}
            {cafe.logo && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="mb-6 flex justify-center"
              >
                <img 
                  src={cafe.logo} 
                  alt={cafe.name} 
                  className="w-24 h-24 object-cover rounded-full border-4"
                  style={{ borderColor: theme.colors.primary }}
                />
              </motion.div>
            )}

            {/* Cafe Name */}
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-5xl md:text-7xl font-bold mb-4"
              style={{ 
                fontFamily: theme.fonts.heading,
                color: theme.colors.text
              }}
            >
              {cafe.name}
            </motion.h1>

            {/* Tagline */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg md:text-xl mb-8"
              style={{ color: theme.colors.textSecondary }}
            >
              Premium dining experience at your fingertips
            </motion.p>

            {/* Cart Button - Floating */}
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ delay: 0.5 }}
              onClick={() => setShowCart(true)}
              className="relative px-8 py-4 font-bold rounded-full shadow-lg flex items-center gap-3 mx-auto"
              style={{
                backgroundColor: theme.colors.primary,
                color: theme.colors.background,
                boxShadow: theme.styles.cardHoverShadow
              }}
            >
              <ShoppingCart className="w-6 h-6" />
              View Cart
              {cart.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: '#EF4444' }}
                >
                  {cart.length}
                </motion.span>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Search + Category Filter ─────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: theme.colors.textSecondary }} />
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-full text-sm outline-none"
              style={{ background: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.1)'}` }}
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-all"
              style={{
                background: selectedCategory === cat ? theme.colors.primary : theme.colors.surface,
                color: selectedCategory === cat ? theme.colors.background : theme.colors.textSecondary,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Menu Grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMenuItems.map(item => {
            const hasSizes = item?.sizePricing != null && item.sizePricing.enabled === true;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl overflow-hidden"
                style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.08)'}` }}
              >
                {item.image && (
                  <div className="aspect-[4/3] overflow-hidden">
                    <img src={item.image} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-base leading-tight" style={{ color: theme.colors.text }}>{item.name}</h3>
                    {!hasSizes && (
                      <span className="font-black text-base flex-shrink-0" style={{ color: theme.colors.primary }}>
                        {cafe?.currencySymbol || '₹'}{item.price}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs mb-3 line-clamp-2" style={{ color: theme.colors.textSecondary }}>{item.description}</p>
                  )}
                  {/* Size pricing OR single Add button */}
                  {hasSizes ? (
                    <div className="space-y-1.5 mt-2">
                      {item.sizePricing.small && (
                        <button
                          onClick={() => addToCart(item, 'small')}
                          className="w-full py-2 px-3 rounded-full text-sm font-semibold flex justify-between items-center transition-all"
                          style={{ background: theme.colors.primary, color: theme.colors.background }}
                          data-testid={`add-small-${item.id}`}
                        >
                          <span>Small</span>
                          <span>{cafe?.currencySymbol || '₹'}{parseFloat(item.sizePricing.small).toFixed(2)}</span>
                        </button>
                      )}
                      {item.sizePricing.medium && (
                        <button
                          onClick={() => addToCart(item, 'medium')}
                          className="w-full py-2 px-3 rounded-full text-sm font-semibold flex justify-between items-center transition-all"
                          style={{ background: theme.colors.primary, color: theme.colors.background }}
                          data-testid={`add-medium-${item.id}`}
                        >
                          <span>Medium</span>
                          <span>{cafe?.currencySymbol || '₹'}{parseFloat(item.sizePricing.medium).toFixed(2)}</span>
                        </button>
                      )}
                      {item.sizePricing.large && (
                        <button
                          onClick={() => addToCart(item, 'large')}
                          className="w-full py-2 px-3 rounded-full text-sm font-semibold flex justify-between items-center transition-all"
                          style={{ background: theme.colors.primary, color: theme.colors.background }}
                          data-testid={`add-large-${item.id}`}
                        >
                          <span>Large</span>
                          <span>{cafe?.currencySymbol || '₹'}{parseFloat(item.sizePricing.large).toFixed(2)}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(item)}
                      className="w-full py-2 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                      style={{ background: theme.colors.primary, color: theme.colors.background }}
                      data-testid={`add-${item.id}`}
                    >
                      <Plus className="w-4 h-4" />
                      Add to Cart
                    </button>
                  )}

                  {/* Show Food Details — only when nutrition data exists */}
                  {(item.ingredients || item.calories || item.protein || item.carbs || item.fats) && (
                    <button
                      onClick={() => setSelectedFoodItem(item)}
                      className="w-full text-xs mt-2 py-1.5 text-center transition-opacity opacity-70 hover:opacity-100"
                      style={{ color: theme.colors.textSecondary }}
                      data-testid={`food-detail-${item.id}`}
                    >
                      🔍 Show Food Details
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {filteredMenuItems.length === 0 && (
          <div className="text-center py-16" style={{ color: theme.colors.textSecondary }}>
            No items found
          </div>
        )}
      </div>

      {/* ── Floating Cart Button ─────────────────────────────────────────── */}
      {cart.length > 0 && (
        <motion.div
          initial={{ y: 80 }} animate={{ y: 0 }}
          className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4"
        >
          <button
            onClick={() => setShowCart(true)}
            className="px-8 py-4 rounded-full font-bold flex items-center gap-3 shadow-2xl"
            style={{ background: theme.colors.primary, color: theme.colors.background }}
          >
            <ShoppingCart className="w-5 h-5" />
            View Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items) — {cafe?.currencySymbol || '₹'}{calculateTotal().toFixed(2)}
          </button>
        </motion.div>
      )}

      {/* ── Cart Drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowCart(false)}
          >
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm h-full flex flex-col overflow-hidden"
              style={{ background: theme.colors.background }}
            >
              <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: theme.colors.border || 'rgba(255,255,255,0.1)' }}>
                <h2 className="text-xl font-bold" style={{ color: theme.colors.text }}>Your Cart</h2>
                <button onClick={() => setShowCart(false)} style={{ color: theme.colors.textSecondary }}><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {cart.map(item => (
                  <div key={`${item.id}-${item.selectedSize || 'none'}`} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: theme.colors.surface }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: theme.colors.text }}>{item.name}</p>
                      {item.selectedSize && (
                        <p className="text-xs capitalize" style={{ color: theme.colors.textSecondary }}>Size: {item.selectedSize}</p>
                      )}
                      <p className="text-sm font-bold" style={{ color: theme.colors.primary }}>{cafe?.currencySymbol || '₹'}{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: theme.colors.background, color: theme.colors.text }}>
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-bold text-sm" style={{ color: theme.colors.text }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: theme.colors.primary, color: theme.colors.background }}>
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-5 border-t" style={{ borderColor: theme.colors.border || 'rgba(255,255,255,0.1)' }}>
                <div className="flex justify-between mb-4">
                  <span style={{ color: theme.colors.textSecondary }}>Total</span>
                  <span className="font-black text-lg" style={{ color: theme.colors.primary }}>{cafe?.currencySymbol || '₹'}{calculateTotal().toFixed(2)}</span>
                </div>
                <button
                  onClick={proceedToCheckout}
                  className="w-full py-4 rounded-full font-bold text-base"
                  style={{ background: theme.colors.primary, color: theme.colors.background }}
                >
                  Proceed to Checkout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Checkout Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ background: theme.colors.background }}
            >
              <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: theme.colors.border || 'rgba(255,255,255,0.1)' }}>
                <h2 className="text-xl font-bold" style={{ color: theme.colors.text }}>Checkout</h2>
                <button onClick={() => setShowCheckout(false)} style={{ color: theme.colors.textSecondary }}><X className="w-6 h-6" /></button>
              </div>
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                <input
                  placeholder="Your Name *"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl outline-none"
                  style={{ background: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.1)'}` }}
                />
                <input
                  placeholder="Phone Number *"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  type="tel"
                  className="w-full px-4 py-3 rounded-xl outline-none"
                  style={{ background: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.1)'}` }}
                />
                <div className="grid grid-cols-3 gap-2">
                  {['dine-in', 'takeaway', 'delivery'].map(type => (
                    <button
                      key={type}
                      onClick={() => setOrderType(type)}
                      className="py-2 rounded-xl text-sm font-semibold capitalize transition-all"
                      style={{
                        background: orderType === type ? theme.colors.primary : theme.colors.surface,
                        color: orderType === type ? theme.colors.background : theme.colors.textSecondary,
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                {orderType === 'dine-in' && (
                  <input
                    placeholder="Table Number *"
                    value={tableNumber}
                    onChange={e => setTableNumber(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl outline-none"
                    style={{ background: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.1)'}` }}
                  />
                )}
                {orderType === 'delivery' && (
                  <input
                    placeholder="Delivery Address *"
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl outline-none"
                    style={{ background: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.1)'}` }}
                  />
                )}
                <textarea
                  placeholder="Special instructions (optional)"
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl outline-none resize-none"
                  style={{ background: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border || 'rgba(255,255,255,0.1)'}` }}
                />
              </div>
              <div className="p-5 border-t" style={{ borderColor: theme.colors.border || 'rgba(255,255,255,0.1)' }}>
                <button
                  onClick={placeOrder}
                  disabled={orderPlacing}
                  className="w-full py-4 rounded-full font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: theme.colors.primary, color: theme.colors.background }}
                >
                  <Send className="w-4 h-4" />
                  {orderPlacing ? 'Placing Order…' : `Place Order — ${cafe?.currencySymbol || '₹'}${calculateTotal().toFixed(2)}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CafeOrderingThemed;
