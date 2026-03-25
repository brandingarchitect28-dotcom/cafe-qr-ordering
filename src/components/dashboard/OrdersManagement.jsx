import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AlertCircle, Search, Download, Phone, MapPin, Clock, Bell, Volume2, X, FileText, Eye, PlusCircle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { CSVLink } from 'react-csv';
import { generateInvoiceMessage } from '../../services/invoiceService';
import { motion, AnimatePresence } from 'framer-motion';
import InvoiceModal from './InvoiceModal';
import { getInvoiceByOrderId, getInvoiceById, ensureInvoiceForOrder } from '../../services/invoiceService';
import ExternalOrderModal, { getSourceMeta } from './ExternalOrderModal';

// Notification sound (base64 encoded short beep)
const NOTIFICATION_SOUND = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDgAAAAAAAAAGw3X+VkgAAAAAAAAAAAAAAAAD/4xjEAAJQAVAAAAAAvYCCB4P+UBn//+D4PoGH/ygM///KAHAY////4Pg+D7/8EMOD4f/6gYf///wfB9///5QGf/lAZ//+UAcH0GH////+oGH//6gYf5QBwfD4fygDg//+D5//ygMAAAAAAA/+MYxBYCwAFYAAAAAPHjx4sePHjx5OTk5FRUVFRU9PT09PT09PT0/////////////////////////////////+MYxCMAAADSAAAAAP///////////////////////////////////////////////+MYxDAAAADSAAAAAP///////////////////////////////////////////////+MYxD4AAADSAAAAAP//////////////////////////////////////////////';

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

  // ── Feature 1: Invoice state ──
  const [viewingInvoice, setViewingInvoice] = useState(null);   // invoice object
  const [invoiceLoading, setInvoiceLoading] = useState(null);   // orderId being loaded

  // ── External Orders: modal state ──
  const [showExternalModal, setShowExternalModal] = useState(false);

  // Debug: Log cafeId
  useEffect(() => {
    console.log('[OrdersManagement] User cafeId:', cafeId);
  }, [cafeId]);

  // Fetch orders with real-time updates (onSnapshot is used in useCollection)
  // NOTE: Removed orderBy to avoid composite index requirement - sorting done client-side
  const { data: orders, loading, error: ordersError } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // Debug: Log orders data
  useEffect(() => {
    console.log('[OrdersManagement] Orders received:', orders?.length || 0, 'orders');
    if (orders && orders.length > 0) {
      console.log('[OrdersManagement] Latest order:', orders[0]?.id, orders[0]?.orderStatus);
    }
  }, [orders]);

  // Log any errors
  useEffect(() => {
    if (ordersError) {
      console.error('[Orders] Firestore error:', ordersError);
      toast.error('Error loading orders: ' + ordersError);
    }
  }, [ordersError]);

  // Sort by orderNumber DESC (or createdAt if no orderNumber) for display
  const sortedOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    return [...orders].sort((a, b) => {
      // First try orderNumber
      if (a.orderNumber && b.orderNumber) {
        return b.orderNumber - a.orderNumber;
      }
      // Fall back to createdAt
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });
  }, [orders]);

  // Play notification sound
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

  // Detect new orders and show notification
  useEffect(() => {
    if (!orders || orders.length === 0) {
      previousOrdersRef.current = orders || [];
      return;
    }

    const previousIds = previousOrdersRef.current.map(o => o.id);
    const newOrders = orders.filter(order => !previousIds.includes(order.id));

    if (newOrders.length > 0 && previousOrdersRef.current.length > 0) {
      // Show notification for the newest order
      const latestOrder = newOrders[0];
      setNewOrderNotification(latestOrder);
      playNotificationSound();
      
      // Auto-dismiss after 10 seconds
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

      // ── Auto-generate invoice when payment becomes paid ──────────────
      // Safe: ensureInvoiceForOrder is idempotent — skips if invoice exists
      if (status === 'paid') {
        // Find the order from already-loaded list (no extra Firestore read)
        const order = orders?.find(o => o.id === orderId);
        if (order) {
          // Fetch cafe data for tax/GST settings (needed for invoice amounts)
          let cafeData = cafe;
          if (!cafeData && cafeId) {
            try {
              const cafeSnap = await getDoc(doc(db, 'cafes', cafeId));
              if (cafeSnap.exists()) cafeData = cafeSnap.data();
            } catch (_) { /* non-fatal */ }
          }
          // Non-blocking — never delays the UI
          ensureInvoiceForOrder(orderId, { ...order, paymentStatus: 'paid' }, cafeData)
            .then(({ invoiceId, skipped, error }) => {
              if (error) {
                console.error('[Orders] Invoice generation failed (non-fatal):', error);
              } else if (!skipped) {
                toast.success('Invoice generated ✓');
              }
            })
            .catch(err => console.error('[Orders] ensureInvoiceForOrder threw (non-fatal):', err));
        }
      }
    } catch (error) {
      console.error('Error updating payment:', error);
      toast.error('Failed to update payment');
    }
  };

  const filteredOrders = useMemo(() => {
    let filtered = sortedOrders;
    
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
      'Items': order.items?.map(item => `${item.name} x${item.quantity}`).join(', ') || '',
      'Total': order.totalAmount || order.total || 0,
      'Payment Mode': order.paymentMode || '',
      'Payment Status': order.paymentStatus || '',
      'Order Status': order.orderStatus || '',
      'Order Source': order.orderSource || 'direct',
      'External Order': order.externalOrder ? 'Yes' : 'No',
      'Special Instructions': order.specialInstructions || ''
    }));
  }, [filteredOrders]);

  const getStatusBadge = (status) => {
    const styles = {
      new:       'bg-blue-500/20 text-blue-400 border-blue-500/30',
      preparing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      ready:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30'
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

  // ── Feature 1: Invoice handlers ──
  const handleViewInvoice = async (orderId, e) => {
    e.stopPropagation();
    setInvoiceLoading(orderId);

    try {
      // Fast path — use invoiceId directly from order doc if available
      const order = orders?.find(o => o.id === orderId);
      let data, error;

      if (order?.invoiceId) {
        ({ data, error } = await getInvoiceById(order.invoiceId));
      } else {
        ({ data, error } = await getInvoiceByOrderId(orderId));
      }

      // If still no invoice — auto-generate it now
      if (!data && order) {
        toast.loading('Generating invoice…', { id: 'inv-gen' });
        try {
          const cafeSnap = await import('firebase/firestore').then(({ doc, getDoc }) => getDoc(doc(db, 'cafes', order.cafeId)));
          const cafeData = cafeSnap.exists() ? cafeSnap.data() : {};
          const result   = await ensureInvoiceForOrder(orderId, order, cafeData);
          if (result?.invoiceId) {
            ({ data } = await getInvoiceById(result.invoiceId));
          }
          toast.dismiss('inv-gen');
        } catch (genErr) {
          toast.dismiss('inv-gen');
          console.error('[Invoice] Auto-generate failed:', genErr);
        }
      }

      if (error) { toast.error('Invoice could not be loaded.'); return; }
      if (!data)  { toast.info('Invoice not available for this order.'); return; }
      setViewingInvoice(data);
    } catch (err) {
      toast.error('Invoice could not be loaded.');
    } finally {
      setInvoiceLoading(null);
    }
  };

  const handleDownloadInvoice = async (orderId, e) => {
    e.stopPropagation();
    setInvoiceLoading(orderId);

    try {
      const order = orders?.find(o => o.id === orderId);
      let data, error;

      if (order?.invoiceId) {
        ({ data, error } = await getInvoiceById(order.invoiceId));
      } else {
        ({ data, error } = await getInvoiceByOrderId(orderId));
      }

      if (error || !data) {
        toast.info('Invoice still generating. Please try again in a moment.');
        return;
      }
      setViewingInvoice(data);
    } catch (err) {
      toast.error('Invoice could not be loaded.');
    } finally {
      setInvoiceLoading(null);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* ── Feature 1: Invoice Modal ── */}
      {viewingInvoice && (
        <InvoiceModal
          invoice={viewingInvoice}
          onClose={() => setViewingInvoice(null)}
        />
      )}

      {/* ── External Order Modal ── */}
      {showExternalModal && (
        <ExternalOrderModal
          onClose={() => setShowExternalModal(false)}
          onSuccess={(id, num) => {
            toast.success(`Order #${String(num).padStart(3,'0')} added to kitchen queue`);
          }}
        />
      )}
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* ── External Order Button ── */}
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
        {['all', 'new', 'preparing', 'ready', 'completed', 'cancelled'].map(status => (
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
            <div className="overflow-x-auto">
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
                          <div className="flex flex-col gap-1">
                            <span className="text-[#D4AF37] font-bold text-lg">
                              {formatOrderNumber(order.orderNumber)}
                            </span>
                            {order.orderSource && (() => {
                              const meta = getSourceMeta(order.orderSource);
                              return (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border w-fit ${meta.bg}`}>
                                  {meta.label}
                                </span>
                              );
                            })()}
                          </div>
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
                                <option value="ready">Ready</option>
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
                            {/* ── Feature 1: Invoice Buttons ── */}
                            <div className="flex gap-1.5">
                              {order.invoiceId || order.paymentStatus !== 'pending' ? (
                                <>
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
                                  {/* WhatsApp Send Invoice */}
                                  {order.customerPhone && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const phone = order.customerPhone.replace(/\D/g,'');
                                        const msg = generateInvoiceMessage(order, { currencySymbol: order.currencySymbol || cafeCurrency });
                                        window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                                      }}
                                      data-testid={`wa-invoice-${order.id}`}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 rounded text-xs font-medium transition-all"
                                      title="Send Invoice via WhatsApp"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      WA
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[#555] text-xs italic px-1 py-1.5">
                                  Invoice generating…
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {expandedOrder === order.id && (
                        <tr className="bg-black/20">
                          <td colSpan="10" className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-[#D4AF37] font-semibold mb-3">Order Items</h4>
                                <div className="space-y-2">
                                  {order.items?.map((item, idx) => (
                                    <div key={idx} className="space-y-0.5">
                                      <div className="flex justify-between text-sm">
                                        <span className="text-white">{item.name} x{item.quantity}</span>
                                        <span className="text-[#D4AF37]">{order.currencySymbol || cafeCurrency}{(item.price * item.quantity).toFixed(2)}</span>
                                      </div>
                                      {item.addons?.map((a, ai) => (
                                        <div key={ai} className="flex justify-between text-xs pl-3">
                                          <span className="text-[#555]">↳ {a.name}</span>
                                          <span className="text-[#A3A3A3]">+{order.currencySymbol || cafeCurrency}{(a.price || 0).toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                  <div className="border-t border-white/10 pt-2 mt-2 flex justify-between font-bold">
                                    <span className="text-white">Total</span>
                                    <span className="text-[#D4AF37]">{order.currencySymbol || cafeCurrency}{(order.totalAmount || order.total || 0).toFixed(2)}</span>
                                  </div>
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
                    <div className="flex flex-col gap-1">
                      <span className="text-[#D4AF37] font-bold text-xl">
                        {formatOrderNumber(order.orderNumber)}
                      </span>
                      {order.orderSource && (() => {
                        const meta = getSourceMeta(order.orderSource);
                        return (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border w-fit ${meta.bg}`}>
                            {meta.label}
                          </span>
                        );
                      })()}
                    </div>
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
                  <span className="text-[#A3A3A3] text-sm">• {getItemsCount(order.items)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPaymentBadge(order.paymentStatus)}`}>
                    {order.paymentStatus || 'pending'}
                  </span>
                </div>

                {expandedOrder === order.id && (
                  <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-4">
                    <div>
                      <h4 className="text-[#D4AF37] font-semibold mb-2 text-sm">Items</h4>
                      <div className="space-y-1">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="space-y-0.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-white">{item.name} x{item.quantity}</span>
                              <span className="text-[#D4AF37]">{order.currencySymbol || cafeCurrency}{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                            {item.addons?.map((a, ai) => (
                              <div key={ai} className="flex justify-between text-xs pl-3">
                                <span className="text-[#555]">↳ {a.name}</span>
                                <span className="text-[#A3A3A3]">+{order.currencySymbol || cafeCurrency}{(a.price || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

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
                        <option value="ready">Ready</option>
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
                    {/* ── Feature 1: Invoice Buttons (mobile) ── */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {order.invoiceId || order.paymentStatus !== 'pending' ? (
                        <>
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
                            PDF
                          </button>
                          {/* WhatsApp Send Invoice — mobile */}
                          {order.customerPhone && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const phone = order.customerPhone.replace(/\D/g,'');
                                const msg = generateInvoiceMessage(order, { currencySymbol: order.currencySymbol || cafeCurrency });
                                window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                              }}
                              className="flex items-center justify-center gap-1 px-3 py-2.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 rounded text-sm font-medium transition-all"
                              title="Send Invoice via WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4" />
                              WA
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-[#555] text-xs italic py-2">
                          Invoice generating… please wait.
                        </p>
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
