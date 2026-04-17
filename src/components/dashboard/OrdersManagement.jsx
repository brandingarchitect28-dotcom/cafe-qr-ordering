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
    // FREE ITEM FIX: isFree items have price:0 — honour that, skip basePrice fallback
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
                Add Items to Order
              </h3>
              <p className="text-xs mt-0.5 text-[#A3A3A3]">
                #{order.orderNumber ? String(order.orderNumber).padStart(3, '0') : order.id.slice(0, 6)}
                {order.customerName ? ` · ${order.customerName}` : ''}
              </p>
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
                  <span className="text-[#A3A3A3]">New items total</span>
                  <span style={{ color: primary }}>{CUR}{fmt(newCartTotal)}</span>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
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
      if (a.orderNumber && b.orderNumber) {
        return b.orderNumber - a.orderNumber;
      }
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });
  }, [orders]);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(NOTIFICATION_SOUND);
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
      console.log('Audio error:', e);
    }
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

      setTimeout(() => {
        setNewOrderNotification(null);
      }, 10000);
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
      if (!orderSnap.exists()) {
        toast.error('Order not found');
        return;
      }
      const orderData = orderSnap.data();

      const items = Array.isArray(orderData.items) ? [...orderData.items] : [];
      if (itemIndex < 0 || itemIndex >= items.length) {
        toast.error('Item index out of range');
        return;
      }
      const removedItem = items[itemIndex];
      items.splice(itemIndex, 1);

      if (items.length === 0) {
        await updateDoc(orderRef, {
          items:        [],
          subtotalAmount: 0,
          taxAmount:      0,
          serviceChargeAmount: 0,
          gstAmount:      0,
          totalAmount:    0,
          orderStatus:  'cancelled',
          updatedAt:    serverTimestamp(),
        });
        toast.success(`Last item removed — order #${String(orderData.orderNumber || '').padStart(3, '0')} cancelled`);
        return;
      }

      const { grandTotal: newSubtotal } = calculateOrderTotals(items);

      const cid = orderData.cafeId;
      let cafe = {};
      if (cid) {
        const cafeSnap = await getDoc(doc(db, 'cafes', cid));
        if (cafeSnap.exists()) cafe = cafeSnap.data();
      }

      const newTax      = cafe?.taxEnabled            ? newSubtotal * safeNum(cafe.taxRate)            / 100 : 0;
      const newSC       = cafe?.serviceChargeEnabled  ? newSubtotal * safeNum(cafe.serviceChargeRate)  / 100 : 0;
      const newGST      = cafe?.gstEnabled            ? newSubtotal * safeNum(cafe.gstRate)            / 100 : 0;
      const newPlatform = cafe?.platformFeeEnabled     ? safeNum(cafe.platformFeeAmount)                     : 0;

      const newTotal = Math.max(0, Math.round(newSubtotal + newTax + newSC + newGST + newPlatform));

      await updateDoc(orderRef, {
        items,
        subtotalAmount:      newSubtotal,
        taxAmount:           newTax,
        serviceChargeAmount: newSC,
        gstAmount:           newGST,
        totalAmount:         newTotal,
        updatedAt:           serverTimestamp(),
      });

      toast.success(`"${removedItem?.name || 'Item'}" removed from order`);
    } catch (err) {
      console.error('[RemoveItem] Failed:', err);
      toast.error('Failed to remove item from order');
    }
  }, []);

  const filteredOrders = useMemo(() => {
    let filtered = (sortedOrders || []).filter(o => !o.isDeleted);

    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.orderStatus === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.customerName?.toLowerCase().includes(query) ||
        order.customerPhone?.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query) ||
        String(order.orderNumber || '').includes(query)
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(order => {
        const orderDate = order.createdAt?.toDate?.() || new Date(0);
        return orderDate >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
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
      new:       'bg-blue-500/20 text-blue-400 border-blue-500/30',
      preparing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || styles.new;
  };

  const getPaymentBadge = (status) => {
    return status === 'paid'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const formatOrderNumber = (num) => {
    return num ? `#${String(num).padStart(3, '0')}` : '-';
  };

  const getItemsCount = (items) => {
    if (!items || !items.length) return '0 items';
    const totalItems = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    return `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
  };

  const dismissNotification = () => {
    setNewOrderNotification(null);
  };

  const handleViewInvoice = async (orderId, e) => {
    if (e) e.stopPropagation();
    if (!orderId) {
      console.error('Invalid order for invoice');
      toast.error('Invalid order');
      return;
    }
    setInvoiceLoading(orderId);
    try {
      const { data, error } = await getInvoiceByOrderId(orderId);
      if (error) {
        console.warn('[Invoice] getInvoiceByOrderId error (will use fallback):', error);
      }

      if (!error && data) {
        setInvoiceLoading(null);
        setViewingInvoice(data);
        return;
      }

      const orderObj = orders?.find(o => o.id === orderId);
      if (!orderObj) {
        setInvoiceLoading(null);
        toast.error('Order data not found');
        return;
      }

      const { invoiceId, error: genError } = await ensureInvoiceForOrder(orderId, orderObj, cafe || {});
      if (genError || !invoiceId) {
        console.warn('[Invoice] Firestore write failed — showing synthetic invoice:', genError);
        const synthetic = {
          orderId,
          orderNumber:         orderObj.orderNumber,
          cafeId:              orderObj.cafeId,
          cafeName:            cafe?.name            || '',
          cafeAddress:         cafe?.address         || '',
          cafePhone:           cafe?.phone           || '',
          cafeGstNumber:       cafe?.gstNumber       || '',
          currencySymbol:      orderObj.currencySymbol || cafe?.currencySymbol || '₹',
          customerName:        orderObj.customerName  || '',
          customerPhone:       orderObj.customerPhone || '',
          tableNumber:         orderObj.tableNumber   || '',
          orderType:           orderObj.orderType     || 'dine-in',
          deliveryAddress:     orderObj.deliveryAddress || '',
          items:               orderObj.items          || [],
          subtotalAmount:      orderObj.subtotalAmount ?? orderObj.totalAmount ?? 0,
          gstAmount:           orderObj.gstAmount      ?? orderObj.taxAmount   ?? 0,
          taxAmount:           orderObj.taxAmount      ?? 0,
          serviceChargeAmount: orderObj.serviceChargeAmount ?? 0,
          totalAmount:         orderObj.totalAmount   ?? orderObj.total ?? 0,
          paymentMode:         orderObj.paymentMode   || 'counter',
          paymentStatus:       orderObj.paymentStatus || 'pending',
          invoiceNumber:       null,
          orderTime:           orderObj.createdAt,
          createdAt:           orderObj.createdAt,
        };
        setInvoiceLoading(null);
        setViewingInvoice(synthetic);
        return;
      }

      const { data: fresh } = await getInvoiceByOrderId(orderId);
      setInvoiceLoading(null);
      setViewingInvoice(fresh || { orderId, orderNumber: orderObj.orderNumber });
    } catch (err) {
      console.error('[Invoice] handleViewInvoice unexpected error:', err);
      setInvoiceLoading(null);
      toast.error('Failed to load invoice');
    }
  };

  const handleDownloadInvoice = async (orderId, e) => {
    if (e) e.stopPropagation();
    if (!orderId) {
      console.error('Invalid order for invoice');
      toast.error('Invalid order');
      return;
    }
    setInvoiceLoading(orderId);
    try {
      const { data, error } = await getInvoiceByOrderId(orderId);
      if (error) {
        console.warn('[Invoice] getInvoiceByOrderId error (will use fallback):', error);
      }

      if (!error && data) {
        setInvoiceLoading(null);
        setViewingInvoice({ ...data, _autoPrint: true });
        return;
      }

      const orderObj = orders?.find(o => o.id === orderId);
      if (!orderObj) {
        setInvoiceLoading(null);
        toast.error('Order data not found');
        return;
      }

      const { invoiceId, error: genError } = await ensureInvoiceForOrder(orderId, orderObj, cafe || {});
      if (genError || !invoiceId) {
        console.warn('[Invoice] Firestore write failed — using synthetic for PDF:', genError);
        const synthetic = {
          orderId,
          orderNumber:         orderObj.orderNumber,
          cafeId:              orderObj.cafeId,
          cafeName:            cafe?.name            || '',
          cafeAddress:         cafe?.address         || '',
          cafePhone:           cafe?.phone           || '',
          cafeGstNumber:       cafe?.gstNumber       || '',
          currencySymbol:      orderObj.currencySymbol || cafe?.currencySymbol || '₹',
          customerName:        orderObj.customerName  || '',
          customerPhone:       orderObj.customerPhone || '',
          tableNumber:         orderObj.tableNumber   || '',
          orderType:           orderObj.orderType     || 'dine-in',
          deliveryAddress:     orderObj.deliveryAddress || '',
          items:               orderObj.items          || [],
          subtotalAmount:      orderObj.subtotalAmount ?? orderObj.totalAmount ?? 0,
          gstAmount:           orderObj.gstAmount      ?? orderObj.taxAmount   ?? 0,
          taxAmount:           orderObj.taxAmount      ?? 0,
          serviceChargeAmount: orderObj.serviceChargeAmount ?? 0,
          totalAmount:         orderObj.totalAmount   ?? orderObj.total ?? 0,
          paymentMode:         orderObj.paymentMode   || 'counter',
          paymentStatus:       orderObj.paymentStatus || 'pending',
          invoiceNumber:       null,
          orderTime:           orderObj.createdAt,
          createdAt:           orderObj.createdAt,
          _autoPrint:          true,
        };
        setInvoiceLoading(null);
        setViewingInvoice(synthetic);
        return;
      }

      const { data: fresh } = await getInvoiceByOrderId(orderId);
      setInvoiceLoading(null);
      setViewingInvoice({ ...(fresh || { orderId }), _autoPrint: true });
    } catch (err) {
      console.error('[Invoice] handleDownloadInvoice unexpected error:', err);
      setInvoiceLoading(null);
      toast.error('Failed to download invoice');
    }
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
    if (!phone) {
      toast.error('No customer phone number on this order');
      return;
    }
    try {
      const msg = generateInvoiceMessage(order, {
        name:           cafe?.name           || '',
        currencySymbol: order.currencySymbol || cafeCurrency,
      });
      window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    } catch (err) {
      console.error('[WA-Invoice]', err);
      toast.error('Failed to open WhatsApp');
    }
  };

  const isConfirmingRemove = (orderId, itemIndex) =>
    removingItem?.orderId === orderId && removingItem?.itemIndex === itemIndex;

  return (
    <div className="space-y-6 relative">
      {/* ── Invoice Modal ─────────────────────────────────────────────────── */}
      {viewingInvoice && (
        <InvoiceModal
          invoice={viewingInvoice}
          onClose={() => setViewingInvoice(null)}
        />
      )}

      {/* ── External Order Modal ──────────────────────────────────────────── */}
      {showExternalModal && (
        <ExternalOrderModal
          onClose={() => setShowExternalModal(false)}
          onSuccess={(id, num) => {
            toast.success(`Order #${String(num).padStart(3, '0')} added to kitchen queue`);
          }}
        />
      )}

      {/* ── Add Items to Order Modal ──────────────────────────────────────── */}
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

      {/* Variant picker rendered at root level z-[200] */}
      {addItemsVariantModal && (() => {
        const vItem     = addItemsVariantModal;
        const primary_v = '#D4AF37';
        const CUR_V     = addItemsOrder?.currencySymbol || cafeCurrency || '₹';
        const fmt_v     = n => (parseFloat(n) || 0).toFixed(2);
        const variants  = vItem._resolvedVariants || [];
        return (
          <div className="fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setAddItemsVariantModal(null)} />
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
                  <button onClick={() => setAddItemsVariantModal(null)} className="p-2 rounded-full hover:bg-white/10 transition-all">
                    <X className="w-5 h-5 text-[#A3A3A3]" />
                  </button>
                </div>
                <div className="px-4 py-3 space-y-2 pb-6">
                  {variants.map((v, vi) => (
                    <button
                      key={vi}
                      onClick={() => {
                        setAddItemsVariantModal(null);
                        addItemsVariantAddRef.current?.(vItem, v);
                      }}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl transition-all font-bold"
                      style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.30)', color: primary_v }}
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

      {/* New Order Notification Popup */}
      <AnimatePresence>
        {newOrderNotification && (
          <motion.div
            initial={{ opacity: 0, y: -100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="fixed top-4 right-4 z-50 bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-black p-6 rounded-lg shadow-2xl max-w-sm"
            data-testid="new-order-notification"
          >
            <button
              onClick={dismissNotification}
              className="absolute top-2 right-2 p-1 hover:bg-black/10 rounded"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className="bg-black/20 p-3 rounded-full">
                <Bell className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">New Order 🚨</h3>
                <p className="font-bold text-2xl mb-2">
                  {formatOrderNumber(newOrderNotification.orderNumber)}
                </p>
                {newOrderNotification.orderType === 'dine-in' && newOrderNotification.tableNumber && (
                  <p className="font-semibold">Table {newOrderNotification.tableNumber}</p>
                )}
                <p className="text-sm">{getItemsCount(newOrderNotification.items)}</p>
                <p className="font-bold text-xl mt-2">
                  {newOrderNotification.currencySymbol || cafeCurrency}{(newOrderNotification.totalAmount || 0).toFixed(0)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with Sound Toggle */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
          Orders Management
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExternalModal(true)}
            data-testid="add-external-order-btn"
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Add External Order
          </button>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-all ${
              soundEnabled
                ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30'
                : 'bg-white/5 text-[#A3A3A3] border border-white/10'
            }`}
            data-testid="sound-toggle"
          >
            <Volume2 className="w-4 h-4" />
            {soundEnabled ? 'Sound On' : 'Sound Off'}
          </button>
        </div>
      </div>

      {/* Search and Export */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#A3A3A3] w-5 h-5" />
          <input
            type="text"
            data-testid="order-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0F0F0F] border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 pl-12 px-4 transition-all"
            placeholder="Search by order #, customer name, or phone..."
          />
        </div>

        <CSVLink
          data={csvData}
          filename={`orders-${new Date().toISOString().split('T')[0]}.csv`}
          className="bg-[#10B981] text-white hover:bg-[#059669] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap"
          data-testid="export-csv-btn"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </CSVLink>
      </div>

      {/* Date Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-[#A3A3A3] text-sm mb-2">Start Date</label>
          <input
            type="date"
            data-testid="start-date-filter"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-[#0F0F0F] border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[#A3A3A3] text-sm mb-2">End Date</label>
          <input
            type="date"
            data-testid="end-date-filter"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-[#0F0F0F] border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
          />
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {['all', 'new', 'preparing', 'completed', 'cancelled'].map(status => (
          <button
            key={status}
            data-testid={`filter-${status}`}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-sm font-medium transition-all ${
              statusFilter === status
                ? 'bg-[#D4AF37] text-black'
                : 'bg-white/5 text-[#A3A3A3] hover:bg-white/10 hover:text-white'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-[#A3A3A3] py-8">Loading orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
          <AlertCircle className="w-12 h-12 text-[#A3A3A3] mx-auto mb-4" />
          <p className="text-[#A3A3A3] text-lg">No orders found</p>
          <p className="text-[#666] text-sm mt-2">New orders will appear here in real-time</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden">
            <div
              ref={dragScrollRef}
              className="overflow-x-auto overflow-y-auto"
              style={{ scrollBehavior: 'smooth', cursor: 'grab' }}
              onMouseDown={onDragMouseDown}
              onMouseMove={onDragMouseMove}
              onMouseUp={onDragEnd}
              onMouseLeave={onDragEnd}
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-black/30">
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Order #</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Customer</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Phone</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Type</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Table</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Items</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Total</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Payment</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Status</th>
                    <th className="text-left px-4 py-4 text-[#D4AF37] font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${
                          expandedOrder === order.id ? 'bg-white/5' : ''
                        }`}
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        data-testid={`order-row-${order.id}`}
                      >
                        <td className="px-4 py-4">
                          <span className="text-[#D4AF37] font-bold text-lg">
                            {formatOrderNumber(order.orderNumber)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-white font-medium">{order.customerName || '-'}</td>
                        <td className="px-4 py-4 text-[#A3A3A3]">{order.customerPhone || '-'}</td>
                        <td className="px-4 py-4">
                          <span className="text-white capitalize">{order.orderType || '-'}</span>
                        </td>
                        <td className="px-4 py-4 text-white">
                          {order.orderType === 'dine-in' ? (order.tableNumber || '-') :
                           order.orderType === 'delivery' ? (
                             <span className="text-[#A3A3A3] text-xs">Delivery</span>
                           ) : '-'}
                        </td>
                        <td className="px-4 py-4 text-[#A3A3A3]">{getItemsCount(order.items)}</td>
                        <td className="px-4 py-4">
                          <span className="text-[#D4AF37] font-bold">{order.currencySymbol || cafeCurrency}{(order.totalAmount || order.total || 0).toFixed(0)}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getPaymentBadge(order.paymentStatus)}`}>
                            {order.paymentStatus || 'pending'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium border capitalize ${getStatusBadge(order.orderStatus)}`}>
                            {order.orderStatus || 'new'}
                          </span>
                        </td>
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <select
                                data-testid={`order-status-${order.id}`}
                                value={order.orderStatus || 'new'}
                                onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                className="bg-black/40 border border-white/10 text-white rounded px-2 py-1 text-xs focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
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
                                className="bg-black/40 border border-white/10 text-white rounded px-2 py-1 text-xs focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                              </select>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              <button
                                onClick={(e) => handleViewInvoice(order.id, e)}
                                disabled={invoiceLoading === order.id}
                                data-testid={`view-invoice-${order.id}`}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] rounded text-xs font-medium transition-all disabled:opacity-50"
                                title="View Invoice"
                              >
                                <Eye className="w-3 h-3" />
                                {invoiceLoading === order.id ? '...' : 'Invoice'}
                              </button>
                              <button
                                onClick={(e) => handleDownloadInvoice(order.id, e)}
                                disabled={invoiceLoading === order.id}
                                data-testid={`download-invoice-${order.id}`}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[#A3A3A3] hover:text-white rounded text-xs font-medium transition-all disabled:opacity-50"
                                title="Download PDF"
                              >
                                <FileText className="w-3 h-3" />
                                PDF
                              </button>
                              {order.customerPhone && (
                                <button
                                  onClick={(e) => handleSendInvoiceWA(order, e)}
                                  data-testid={`wa-invoice-${order.id}`}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 rounded text-xs font-medium transition-all"
                                  title="Send Invoice via WhatsApp"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  WA
                                </button>
                              )}
                              {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddItemsOrder(order); }}
                                  data-testid={`add-items-${order.id}`}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded text-xs font-medium transition-all"
                                  title="Add Items to Order"
                                >
                                  <Plus className="w-3 h-3" />
                                  Add Items
                                </button>
                              )}
                              {deleteConfirmId === order.id ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSoftDelete(order.id)}
                                    disabled={deleting}
                                    className="px-2 py-1 bg-red-500 text-white rounded text-xs font-bold transition-all disabled:opacity-50"
                                  >
                                    {deleting ? '…' : 'Confirm'}
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-2 py-1 bg-white/10 text-[#A3A3A3] rounded text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(order.id); }}
                                  className="p-1.5 text-[#555] hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                                  title="Remove order"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded row ─────────────────────────────── */}
                      {expandedOrder === order.id && (
                        <tr className="bg-black/20">
                          <td colSpan="10" className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-[#D4AF37] font-semibold mb-3">Order Items</h4>
                                <div className="space-y-2">
                                  {order.items?.map((item, idx) => {
                                    const CUR_D = order.currencySymbol || cafeCurrency;
                                    // FREE ITEM FIX: honour isFree flag in display price
                                    const basePrice  = item.isFree ? 0 : (parseFloat(item.basePrice ?? item.price) || 0);
                                    const qty        = parseInt(item.quantity) || 1;
                                    const addons     = Array.isArray(item.addons) ? item.addons : [];
                                    const addonTotal = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                                    const itemTotal  = (basePrice + addonTotal) * qty;
                                    return (
                                    <div key={idx} className="text-sm pb-2 mb-1 border-b border-white/5 last:border-0 last:mb-0 last:pb-0">
                                      <div className="flex justify-between items-start gap-2">
                                        <span className="text-white font-medium flex-1">
                                          {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''} ×{qty}
                                        </span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {item.isFree ? (
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>FREE</span>
                                          ) : (
                                            <span className="text-[#D4AF37] font-semibold">{CUR_D}{itemTotal.toFixed(2)}</span>
                                          )}
                                          {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                                            isConfirmingRemove(order.id, idx) ? (
                                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                <button
                                                  onClick={() => handleRemoveItem(order.id, idx)}
                                                  data-testid={`confirm-remove-item-${order.id}-${idx}`}
                                                  className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-bold transition-all"
                                                  title="Confirm remove"
                                                >
                                                  Confirm
                                                </button>
                                                <button
                                                  onClick={() => setRemovingItem(null)}
                                                  className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-[#A3A3A3] rounded text-xs transition-all"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setRemovingItem({ orderId: order.id, itemIndex: idx }); }}
                                                data-testid={`remove-item-${order.id}-${idx}`}
                                                className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                                                title="Remove this item"
                                              >
                                                <X className="w-3 h-3" />
                                                Remove
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-xs mt-0.5 ml-1" style={{ color: '#666' }}>
                                        {item.isFree
                                          ? <span style={{ color: '#10B981' }}>FREE · was {CUR_D}{(parseFloat(item.actualPrice) || 0).toFixed(2)}</span>
                                          : <>Base: {CUR_D}{basePrice.toFixed(2)}{qty > 1 ? ` ×${qty}` : ''}</>
                                        }
                                      </p>
                                      {item.comboItems?.length > 0 && (
                                        <div className="ml-3 mt-0.5 space-y-0.5">
                                          {item.comboItems.map((ci, cIdx) => (
                                            <p key={cIdx} className="text-xs" style={{ color: '#555' }}>
                                              — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                      {addons.length > 0 ? (
                                        <div className="ml-3 mt-1 space-y-0.5">
                                          <p className="text-xs font-semibold" style={{ color: '#888' }}>
                                            Add-ons ({addons.length}):
                                          </p>
                                          {addons.map((a, ai) => {
                                            const aQty   = parseInt(a.quantity) || 1;
                                            const aPrice = parseFloat(a.price)  || 0;
                                            return (
                                              <div key={ai} className="flex justify-between text-xs" style={{ color: '#777' }}>
                                                <span>╰ {a.name} ×{aQty}</span>
                                                <span>+{CUR_D}{(aPrice * aQty).toFixed(2)}</span>
                                              </div>
                                            );
                                          })}
                                          <div className="flex justify-between text-xs pt-0.5" style={{ color: '#888' }}>
                                            <span>Add-ons total</span>
                                            <span>+{CUR_D}{(addonTotal * qty).toFixed(2)}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-xs ml-3 mt-0.5 italic" style={{ color: '#444' }}>No add-ons selected</p>
                                      )}
                                    </div>
                                    );
                                  })}
                                  {/* Order total breakdown */}
                                  {(() => {
                                    const CUR_D = order.currencySymbol || cafeCurrency;
                                    const sN    = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
                                    const { itemsTotal, addonsTotal, grandTotal: itemsPlusAddons } = calculateOrderTotals(order?.items || []);
                                    const fees = sN(order?.gstAmount) + sN(order?.taxAmount) + sN(order?.serviceChargeAmount) + sN(order?.platformFeeAmount);
                                    const computedGrand = itemsPlusAddons + fees;
                                    return (
                                      <div className="border-t border-white/10 pt-2 mt-2 space-y-1">
                                        <div className="flex justify-between text-xs" style={{ color: '#666' }}>
                                          <span>Items Total</span>
                                          <span>{CUR_D}{itemsTotal.toFixed(2)}</span>
                                        </div>
                                        {addonsTotal > 0 && (
                                          <div className="flex justify-between text-xs" style={{ color: '#666' }}>
                                            <span>Add-ons Total</span>
                                            <span>+{CUR_D}{addonsTotal.toFixed(2)}</span>
                                          </div>
                                        )}
                                        {sN(order?.gstAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>GST</span><span>+{CUR_D}{sN(order.gstAmount).toFixed(2)}</span></div>}
                                        {sN(order?.taxAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>Tax</span><span>+{CUR_D}{sN(order.taxAmount).toFixed(2)}</span></div>}
                                        {sN(order?.serviceChargeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>Service Charge</span><span>+{CUR_D}{sN(order.serviceChargeAmount).toFixed(2)}</span></div>}
                                        {sN(order?.platformFeeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>Platform Fee</span><span>+{CUR_D}{sN(order.platformFeeAmount).toFixed(2)}</span></div>}
                                        <div className="flex justify-between font-bold text-sm pt-1 border-t border-white/10">
                                          <span className="text-white">Grand Total</span>
                                          <span className="text-[#D4AF37]">{CUR_D}{computedGrand.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-[#D4AF37] font-semibold mb-3">Details</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center gap-2 text-[#A3A3A3]">
                                    <Clock className="w-4 h-4" />
                                    <span>{order.createdAt?.toDate?.().toLocaleString() || 'N/A'}</span>
                                  </div>
                                  {order.customerPhone && (
                                    <div className="flex items-center gap-2 text-[#A3A3A3]">
                                      <Phone className="w-4 h-4" />
                                      <span>{order.customerPhone}</span>
                                    </div>
                                  )}
                                  {order.orderType === 'delivery' && order.deliveryAddress && (
                                    <div className="flex items-start gap-2 text-[#A3A3A3]">
                                      <MapPin className="w-4 h-4 mt-0.5" />
                                      <span>{order.deliveryAddress}</span>
                                    </div>
                                  )}
                                  {order?.orderType === 'delivery' && (
                                    <div className="text-sm mt-2">
                                      <strong className="text-[#D4AF37]">Delivery Address:</strong>
                                      <div className="text-white mt-0.5">{order?.deliveryAddress || 'N/A'}</div>
                                    </div>
                                  )}
                                  {order.specialInstructions && (
                                    <div className="mt-3 p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded">
                                      <p className="text-[#D4AF37] text-xs font-semibold mb-1">Special Instructions:</p>
                                      <p className="text-white text-sm">{order.specialInstructions}</p>
                                    </div>
                                  )}
                                  <div className="text-[#A3A3A3] text-xs mt-2">
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

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                data-testid={`order-card-${order.id}`}
                className="bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden"
              >
                <div
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-[#D4AF37] font-bold text-xl">
                      {formatOrderNumber(order.orderNumber)}
                    </span>
                    <div>
                      <p className="text-white font-medium">{order.customerName}</p>
                      <p className="text-[#A3A3A3] text-sm">{order.customerPhone}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[#D4AF37] font-bold">{order.currencySymbol || cafeCurrency}{(order.totalAmount || order.total || 0).toFixed(0)}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border capitalize ${getStatusBadge(order.orderStatus)}`}>
                      {order.orderStatus || 'new'}
                    </span>
                  </div>
                </div>

                <div className="px-4 pb-4 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                  <span className="text-[#A3A3A3] text-sm capitalize">{order.orderType}</span>
                  {order.orderType === 'dine-in' && order.tableNumber && (
                    <span className="text-white text-sm">• Table {order.tableNumber}</span>
                  )}
                  {order.orderType === 'delivery' && order.deliveryAddress && (
                    <span className="text-[#A3A3A3] text-xs truncate max-w-[180px]">📍 {order.deliveryAddress}</span>
                  )}
                  <span className="text-[#A3A3A3] text-sm">• {getItemsCount(order.items)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPaymentBadge(order.paymentStatus)}`}>
                    {order.paymentStatus || 'pending'}
                  </span>
                </div>

                {expandedOrder === order.id && (
                  <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-4">
                    <div>
                      <h4 className="text-[#D4AF37] font-semibold mb-2 text-sm">Items</h4>
                      <div className="space-y-2">
                        {order.items?.map((item, idx) => {
                          const CUR_M      = order.currencySymbol || cafeCurrency;
                          // FREE ITEM FIX: honour isFree flag in display price
                          const basePrice  = item.isFree ? 0 : (parseFloat(item.basePrice ?? item.price) || 0);
                          const qty        = parseInt(item.quantity) || 1;
                          const addons     = Array.isArray(item.addons) ? item.addons : [];
                          const addonTotal = addons.reduce((s, a) => s + (parseFloat(a.price) || 0) * (parseInt(a.quantity) || 1), 0);
                          const itemTotal  = (basePrice + addonTotal) * qty;
                          return (
                          <div key={idx} className="text-sm pb-2 mb-1 border-b border-white/5 last:border-0 last:mb-0 last:pb-0">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-white font-medium flex-1">
                                {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''} ×{qty}
                              </span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {item.isFree ? (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>FREE</span>
                                ) : (
                                  <span className="text-[#D4AF37] font-semibold">{CUR_M}{itemTotal.toFixed(2)}</span>
                                )}
                                {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                                  isConfirmingRemove(order.id, idx) ? (
                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                      <button
                                        onClick={() => handleRemoveItem(order.id, idx)}
                                        data-testid={`confirm-remove-item-mobile-${order.id}-${idx}`}
                                        className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-bold transition-all"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => setRemovingItem(null)}
                                        className="px-2 py-0.5 bg-white/10 text-[#A3A3A3] rounded text-xs transition-all"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setRemovingItem({ orderId: order.id, itemIndex: idx }); }}
                                      data-testid={`remove-item-mobile-${order.id}-${idx}`}
                                      className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                                      title="Remove this item"
                                    >
                                      <X className="w-3 h-3" />
                                      Remove
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                            <p className="text-xs mt-0.5 ml-1" style={{ color: '#666' }}>
                              {item.isFree
                                ? <span style={{ color: '#10B981' }}>FREE · was {CUR_M}{(parseFloat(item.actualPrice) || 0).toFixed(2)}</span>
                                : <>Base: {CUR_M}{basePrice.toFixed(2)}{qty > 1 ? ` ×${qty}` : ''}</>
                              }
                            </p>
                            {item.comboItems?.length > 0 && (
                              <div className="ml-3 mt-0.5 space-y-0.5">
                                {item.comboItems.map((ci, cIdx) => (
                                  <p key={cIdx} className="text-xs" style={{ color: '#555' }}>
                                    — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                                  </p>
                                ))}
                              </div>
                            )}
                            {addons.length > 0 ? (
                              <div className="ml-3 mt-1 space-y-0.5">
                                <p className="text-xs font-semibold" style={{ color: '#888' }}>
                                  Add-ons ({addons.length}):
                                </p>
                                {addons.map((a, ai) => {
                                  const aQty   = parseInt(a.quantity) || 1;
                                  const aPrice = parseFloat(a.price)  || 0;
                                  return (
                                    <div key={ai} className="flex justify-between text-xs" style={{ color: '#777' }}>
                                      <span>╰ {a.name} ×{aQty}</span>
                                      <span>+{CUR_M}{(aPrice * aQty).toFixed(2)}</span>
                                    </div>
                                  );
                                })}
                                <div className="flex justify-between text-xs pt-0.5" style={{ color: '#888' }}>
                                  <span>Add-ons total</span>
                                  <span>+{CUR_M}{(addonTotal * qty).toFixed(2)}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs ml-3 mt-0.5 italic" style={{ color: '#444' }}>No add-ons selected</p>
                            )}
                          </div>
                          );
                        })}
                        {/* Order total breakdown (mobile) */}
                        {(() => {
                          const CUR_M = order.currencySymbol || cafeCurrency;
                          const sN    = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
                          const { itemsTotal, addonsTotal, grandTotal: itemsPlusAddons } = calculateOrderTotals(order?.items || []);
                          const fees = sN(order?.gstAmount) + sN(order?.taxAmount) + sN(order?.serviceChargeAmount) + sN(order?.platformFeeAmount);
                          const computedGrand = itemsPlusAddons + fees;
                          return (
                            <div className="border-t border-white/10 pt-2 mt-1 space-y-1">
                              <div className="flex justify-between text-xs" style={{ color: '#666' }}>
                                <span>Items Total</span>
                                <span>{CUR_M}{itemsTotal.toFixed(2)}</span>
                              </div>
                              {addonsTotal > 0 && (
                                <div className="flex justify-between text-xs" style={{ color: '#666' }}>
                                  <span>Add-ons Total</span>
                                  <span>+{CUR_M}{addonsTotal.toFixed(2)}</span>
                                </div>
                              )}
                              {sN(order?.gstAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>GST</span><span>+{CUR_M}{sN(order.gstAmount).toFixed(2)}</span></div>}
                              {sN(order?.taxAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>Tax</span><span>+{CUR_M}{sN(order.taxAmount).toFixed(2)}</span></div>}
                              {sN(order?.serviceChargeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>Service Charge</span><span>+{CUR_M}{sN(order.serviceChargeAmount).toFixed(2)}</span></div>}
                              {sN(order?.platformFeeAmount) > 0 && <div className="flex justify-between text-xs" style={{ color: '#555' }}><span>Platform Fee</span><span>+{CUR_M}{sN(order.platformFeeAmount).toFixed(2)}</span></div>}
                              <div className="flex justify-between font-bold text-sm pt-1 border-t border-white/10">
                                <span className="text-white">Grand Total</span>
                                <span className="text-[#D4AF37]">{CUR_M}{computedGrand.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {order?.orderType === 'delivery' && (
                      <div className="text-sm">
                        <strong className="text-[#D4AF37]">Delivery Address:</strong>
                        <div className="text-white mt-0.5">{order?.deliveryAddress || 'N/A'}</div>
                      </div>
                    )}

                    {order.specialInstructions && (
                      <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded">
                        <p className="text-[#D4AF37] text-xs font-semibold mb-1">Special Instructions:</p>
                        <p className="text-white text-sm">{order.specialInstructions}</p>
                      </div>
                    )}

                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={order.orderStatus || 'new'}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 text-white rounded px-3 py-2 text-sm focus:border-[#D4AF37]"
                      >
                        <option value="new">New</option>
                        <option value="preparing">Preparing</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <select
                        value={order.paymentStatus || 'pending'}
                        onChange={(e) => updatePaymentStatus(order.id, e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 text-white rounded px-3 py-2 text-sm focus:border-[#D4AF37]"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>

                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleViewInvoice(order.id, e)}
                        disabled={invoiceLoading === order.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] rounded text-sm font-medium transition-all disabled:opacity-50"
                      >
                        <Eye className="w-4 h-4" />
                        {invoiceLoading === order.id ? 'Loading…' : 'View Invoice'}
                      </button>
                      <button
                        onClick={(e) => handleDownloadInvoice(order.id, e)}
                        disabled={invoiceLoading === order.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[#A3A3A3] hover:text-white rounded text-sm font-medium transition-all disabled:opacity-50"
                      >
                        <FileText className="w-4 h-4" />
                        Download PDF
                      </button>
                    </div>
                    {order.customerPhone && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleSendInvoiceWA(order, e)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 rounded text-sm font-medium transition-all"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Send Invoice via WhatsApp
                        </button>
                      </div>
                    )}

                    {order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled' && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setAddItemsOrder(order)}
                          data-testid={`add-items-mobile-${order.id}`}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded text-sm font-medium transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          Add Items to Order
                        </button>
                      </div>
                    )}

                    <div onClick={(e) => e.stopPropagation()}>
                      {deleteConfirmId === order.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSoftDelete(order.id)}
                            disabled={deleting}
                            className="flex-1 py-2 bg-red-500 text-white rounded text-sm font-bold disabled:opacity-50"
                          >
                            {deleting ? 'Removing…' : 'Confirm Remove'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="flex-1 py-2 bg-white/10 text-[#A3A3A3] rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(order.id)}
                          className="w-full flex items-center justify-center gap-2 py-2 text-[#555] hover:text-red-400 border border-white/5 hover:border-red-500/20 rounded text-sm transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove Order
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center text-[#A3A3A3] text-sm">
            Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} • Real-time updates enabled
          </div>
        </>
      )}
    </div>
  );
};

export default OrdersManagement;
