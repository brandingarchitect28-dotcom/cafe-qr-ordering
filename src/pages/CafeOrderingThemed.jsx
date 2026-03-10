import React, { useState, useEffect, useMemo } from 'react';
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

  const addToCart = (item) => {
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      setCart(cart.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
    toast.success(`${item.name} added to cart`);
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

      {/* Rest of the component continues in next file... */}
    </div>
  );
};

export default CafeOrderingThemed;
