/**
 * InvoicesTab.jsx
 *
 * Task 3: Dedicated Invoices tab in dashboard.
 * - Fetches all invoices for this café from Firestore
 * - Shows Order ID, items, GST, service charge, total, payment status
 * - View Invoice button → opens InvoiceModal
 * - Send via WhatsApp button (Task 5) → window.location.href iOS-safe
 * - Search + filter by payment status
 * - Real-time listener (same pattern as Orders)
 *
 * IMPROVEMENTS (additive — zero existing logic removed):
 *  1. Orders fallback: also listens to the orders collection and derives
 *     synthetic invoice objects for paid, non-deleted orders that have no
 *     matching invoice document. This ensures the page is never empty when
 *     orders exist but haven't been through the invoice-generation flow.
 *  2. isDeleted filter: deleted orders are excluded from the fallback list.
 *  3. CSV download button added next to status filters.
 *  4. Delivery address shown on invoice cards for delivery orders.
 *  5. Empty state copy improved: "No paid invoices yet."
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Search, MessageSquare, Eye, Download,
  IndianRupee, CheckCircle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import InvoiceModal from './InvoiceModal';

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

const StatusBadge = ({ status }) => {
  const cfg = status === 'paid'
    ? { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle, label: 'Paid' }
    : { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',   icon: Clock,        label: 'Pending' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${cfg.cls}`}>
      <cfg.icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

const InvoicesTab = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── Real Firestore invoice documents (unchanged from original) ──────────────
  const [firestoreInvoices, setFirestoreInvoices] = useState([]);
  const [invoicesLoading,   setInvoicesLoading  ] = useState(true);

  useEffect(() => {
    if (!cafeId) return;
    setInvoicesLoading(true);
    const q = query(collection(db, 'invoices'), where('cafeId', '==', cafeId));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, _source: 'invoice', ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0);
          const tb = b.createdAt?.toDate?.() || new Date(0);
          return tb - ta;
        });
      setFirestoreInvoices(docs);
      setInvoicesLoading(false);
    }, err => {
      console.error('[InvoicesTab] invoices listener:', err);
      setInvoicesLoading(false);
    });
    return () => unsub();
  }, [cafeId]);

  // ── IMPROVEMENT 1: Orders fallback ─────────────────────────────────────────
  // Listen to orders collection to catch paid orders that were placed before
  // the invoice-generation system existed (no matching invoice document).
  // These are shaped to match the invoice object schema so the UI renders them
  // identically — the only difference is _source: 'order'.
  const [rawOrders,     setRawOrders    ] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!cafeId) return;
    setOrdersLoading(true);
    const q = query(collection(db, 'orders'), where('cafeId', '==', cafeId));
    const unsub = onSnapshot(q, snap => {
      setRawOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setOrdersLoading(false);
    }, err => {
      console.error('[InvoicesTab] orders listener:', err);
      setOrdersLoading(false);
    });
    return () => unsub();
  }, [cafeId]);

  const loading = invoicesLoading || ordersLoading;

  // ── IMPROVEMENT 2: Derive paid, non-deleted orders that need fallback ───────
  const isPaidOrder = (o) =>
    (o.paymentStatus === 'paid' ||
     o.paymentStatus === 'SUCCESS' ||
     o.status === 'paid') &&
    !o.isDeleted;

  const invoices = useMemo(() => {
    // Set of orderIds that already have a real invoice document
    const coveredOrderIds = new Set(
      firestoreInvoices.map(inv => inv.orderId).filter(Boolean)
    );

    // Build synthetic invoice objects from paid, non-deleted orders that
    // have NO matching Firestore invoice doc yet
    const syntheticInvoices = rawOrders
      .filter(o => isPaidOrder(o) && !coveredOrderIds.has(o.id))
      .map(o => ({
        // Shape matches Firestore invoice schema for seamless rendering
        id:                   `order_${o.id}`,
        _source:              'order',          // marks as derived, not a real invoice doc
        orderId:              o.id,
        orderNumber:          o.orderNumber,
        cafeId:               o.cafeId,
        customerName:         o.customerName   || '',
        customerPhone:        o.customerPhone  || '',
        tableNumber:          o.tableNumber    || '',
        orderType:            o.orderType      || 'dine-in',
        deliveryAddress:      o.deliveryAddress || '',   // IMPROVEMENT 4 data
        items:                o.items          || [],
        subtotalAmount:       o.subtotalAmount ?? o.totalAmount ?? 0,
        gstAmount:            o.gstAmount      ?? o.taxAmount ?? 0,
        serviceChargeAmount:  o.serviceChargeAmount ?? 0,
        totalAmount:          o.totalAmount    ?? o.total ?? 0,
        paymentMode:          o.paymentMode    || 'counter',
        paymentStatus:        'paid',
        currencySymbol:       o.currencySymbol || CUR,
        invoiceNumber:        null,             // no invoice number — derived from order
        createdAt:            o.createdAt,
        cafeName:             cafe?.name       || '',
      }));

    // Merge: real Firestore invoices first, then synthetic fallbacks
    // Sort combined list newest-first
    return [...firestoreInvoices, ...syntheticInvoices].sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0);
      const tb = b.createdAt?.toDate?.() || new Date(0);
      return tb - ta;
    });
  }, [firestoreInvoices, rawOrders, CUR, cafe?.name]);

  // ── Search / filter (unchanged logic) ──────────────────────────────────────
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [search,         setSearch        ] = useState('');
  const [statusFilter,   setStatusFilter  ] = useState('all');

  // Date range filter (additive — does not change existing search/status logic)
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate  ] = useState('');

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const matchStatus = statusFilter === 'all' || inv.paymentStatus === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        String(inv.invoiceNumber || '').toLowerCase().includes(q) ||
        String(inv.orderNumber   || '').toLowerCase().includes(q) ||
        (inv.customerName  || '').toLowerCase().includes(q) ||
        (inv.customerPhone || '').includes(q);

      // Date range filter — applied only when a date is entered
      let matchDate = true;
      if (startDate || endDate) {
        try {
          const ts  = inv.createdAt;
          const date = ts?.toDate ? ts.toDate() : new Date(ts);
          if (startDate) {
            const from = new Date(startDate);
            from.setHours(0, 0, 0, 0);
            if (date < from) matchDate = false;
          }
          if (endDate && matchDate) {
            const to = new Date(endDate);
            to.setHours(23, 59, 59, 999);
            if (date > to) matchDate = false;
          }
        } catch (_) { matchDate = true; }
      }

      return matchStatus && matchSearch && matchDate;
    });
  }, [invoices, search, statusFilter, startDate, endDate]);

  // ── Stats (IMPROVEMENT 3: all from paid orders / real invoices) ────────────
  const paidInvoices    = invoices.filter(i => i.paymentStatus === 'paid');
  const pendingOrders   = rawOrders.filter(
    o => !isPaidOrder(o) && !o.isDeleted
  ).length;
  const totalRevenue    = paidInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);

  // ── IMPROVEMENT 3: CSV download ────────────────────────────────────────────
  const downloadCSV = () => {
    if (invoices.length === 0) {
      toast.error('No invoices to export');
      return;
    }
    try {
      const rows = invoices.map(o => ({
        invoiceNumber: o.invoiceNumber || '',
        orderId:       o.orderId || o.id || '',
        orderNumber:   o.orderNumber || '',
        name:          o.customerName || '',
        phone:         o.customerPhone || '',
        total:         o.totalAmount || 0,
        gst:           o.gstAmount || 0,
        serviceCharge: o.serviceChargeAmount || 0,
        status:        o.paymentStatus || '',
        paymentMode:   o.paymentMode || '',
        type:          o.orderType || '',
        address:       o.deliveryAddress || '',
        date:          (() => {
          try {
            const ts = o.createdAt;
            if (!ts) return '';
            const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
            return d.toLocaleString('en-IN');
          } catch { return ''; }
        })(),
      }));

      const headers = Object.keys(rows[0]).join(',');
      const csvRows = rows.map(r =>
        Object.values(r).map(v =>
          `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      );
      const csvContent = [headers, ...csvRows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `invoices_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} invoices exported ✓`);
    } catch (err) {
      console.error('[InvoicesTab] CSV export error:', err);
      toast.error('CSV export failed');
    }
  };

  // ── WhatsApp send (unchanged from original) ─────────────────────────────────
  const handleSendWA = (inv) => {
    const phone = (inv.customerPhone || '').replace(/\D/g, '');
    if (!phone) { toast.error('No customer phone number on this invoice'); return; }

    const items = (inv.items || [])
      .map(i => `• ${i.name} × ${i.quantity} — ${CUR}${fmt(i.price * i.quantity)}`)
      .join('\n');

    let msg = `🧾 *Invoice ${inv.invoiceNumber || ''}*\n`;
    msg += `*Order #${String(inv.orderNumber || '').padStart(3, '0')}*\n`;
    if (inv.customerName) msg += `*Customer:* ${inv.customerName}\n`;
    msg += `\n*Items:*\n${items}\n\n`;
    if (inv.subtotalAmount)         msg += `*Subtotal:* ${CUR}${fmt(inv.subtotalAmount)}\n`;
    if (inv.gstAmount > 0)          msg += `*GST (${inv.gstRate || ''}%):* ${CUR}${fmt(inv.gstAmount)}\n`;
    if (inv.serviceChargeAmount > 0) msg += `*Service Charge:* ${CUR}${fmt(inv.serviceChargeAmount)}\n`;
    msg += `*Total:* ${CUR}${fmt(inv.totalAmount)}\n`;
    msg += `*Payment:* ${inv.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'}\n`;
    if (inv.paymentMode) msg += `*Mode:* ${inv.paymentMode}\n`;
    msg += `\nThank you for visiting ${inv.cafeName || ''} ☕`;

    window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Viewing invoice modal */}
      {viewingInvoice && (
        <InvoiceModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-bold text-2xl" style={{ fontFamily: 'Playfair Display, serif' }}>
            Invoices
          </h2>
          <p className="text-[#555] text-xs mt-0.5">
            {invoices.length} total · {paidInvoices.length} paid
          </p>
        </div>
      </div>

      {/* Date range filter — additive, does not change existing search/status UI */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-[#555] text-xs whitespace-nowrap">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="flex-1 h-10 bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm px-3 text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-[#555] text-xs whitespace-nowrap">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="flex-1 h-10 bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm px-3 text-sm outline-none"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="h-10 px-3 text-xs text-[#A3A3A3] hover:text-white border border-white/10 rounded-sm transition-all whitespace-nowrap"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Filters + CSV button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice #, order #, customer name or phone…"
            className="w-full pl-9 pr-4 h-10 bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm text-sm outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'paid', 'pending'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-4 h-10 rounded-sm text-sm font-medium capitalize transition-all"
              style={statusFilter === s
                ? { background: '#D4AF37', color: '#000' }
                : { background: 'rgba(255,255,255,0.05)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.1)' }
              }>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
          {/* IMPROVEMENT 3: CSV download button */}
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-4 h-10 rounded-sm text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        </div>
      </div>

      {/* Stats row (IMPROVEMENT 3: correct counts) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', val: invoices.length,                         color: '#D4AF37' },
          { label: 'Paid',           val: paidInvoices.length,                     color: '#10B981' },
          { label: 'Pending',        val: pendingOrders,                            color: '#F59E0B' },
          { label: 'Total Revenue',  val: `${CUR}${fmt(totalRevenue)}`,            color: '#3B82F6' },
        ].map(s => (
          <motion.div key={s.label} whileHover={{ y: -2 }}
            className="bg-[#0F0F0F] border border-white/5 rounded-xl p-4">
            <p className="text-[#555] text-xs uppercase tracking-wide mb-1">{s.label}</p>
            <p className="font-black text-xl" style={{ color: s.color }}>{s.val}</p>
          </motion.div>
        ))}
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_,i) => (
            <div key={i} className="h-20 rounded-xl bg-white/3 animate-pulse"
              style={{ animationDelay: `${i*80}ms` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-[#A3A3A3]/30 mx-auto mb-3" />
          {/* IMPROVEMENT 5: improved empty state */}
          <p className="text-[#A3A3A3]">
            {invoices.length === 0
              ? 'No paid invoices yet. Invoices appear automatically when orders are marked as paid.'
              : 'No invoices match your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((inv, i) => (
              <motion.div key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-[#0F0F0F] border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-colors"
              >
                {/* Main row */}
                <div className="flex items-center justify-between px-5 py-4 gap-4">
                  {/* Left: invoice info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[#D4AF37] font-bold text-sm">
                        {inv.invoiceNumber || `ORD-${String(inv.orderNumber||'').padStart(4,'0')}`}
                      </span>
                      <span className="text-[#555] text-xs">Order #{String(inv.orderNumber||'').padStart(3,'0')}</span>
                      <StatusBadge status={inv.paymentStatus} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {inv.customerName && (
                        <span className="text-white text-sm">{inv.customerName}</span>
                      )}
                      {inv.customerPhone && (
                        <span className="text-[#555] text-xs">{inv.customerPhone}</span>
                      )}
                      <span className="text-[#555] text-xs">{formatDate(inv.createdAt)}</span>
                    </div>

                    {/* IMPROVEMENT 4: Delivery address (only for delivery orders) */}
                    {inv?.orderType === 'delivery' && (
                      <div className="mt-1 text-xs text-[#A3A3A3]">
                        <span className="text-[#555]">Address: </span>
                        {inv?.deliveryAddress || 'N/A'}
                      </div>
                    )}
                  </div>

                  {/* Right: amounts + actions */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      {inv.gstAmount > 0 && (
                        <p className="text-[#555] text-xs">GST: {CUR}{fmt(inv.gstAmount)}</p>
                      )}
                      {inv.serviceChargeAmount > 0 && (
                        <p className="text-[#555] text-xs">SC: {CUR}{fmt(inv.serviceChargeAmount)}</p>
                      )}
                      <p className="text-[#D4AF37] font-black text-base">{CUR}{fmt(inv.totalAmount)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingInvoice(inv)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/20 text-[#D4AF37] rounded-lg text-xs font-semibold transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">View</span>
                      </button>
                      {inv.customerPhone && (
                        <button
                          onClick={() => handleSendWA(inv)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 rounded-lg text-xs font-semibold transition-all"
                          title="Send Invoice via WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items summary */}
                {inv.items?.length > 0 && (
                  <div className="px-5 pb-3 border-t border-white/5 pt-2">
                    <div className="flex flex-wrap gap-2">
                      {inv.items.slice(0, 4).map((item, j) => (
                        <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-[#A3A3A3]">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {inv.items.length > 4 && (
                        <span className="text-xs text-[#555]">+{inv.items.length - 4} more</span>
                      )}
                    </div>
                    {/* Mobile total */}
                    <div className="flex items-center justify-between mt-2 sm:hidden">
                      <span className="text-[#555] text-xs">
                        {inv.gstAmount > 0 ? `GST: ${CUR}${fmt(inv.gstAmount)}` : ''}
                        {inv.serviceChargeAmount > 0 ? ` · SC: ${CUR}${fmt(inv.serviceChargeAmount)}` : ''}
                      </span>
                      <span className="text-[#D4AF37] font-black">{CUR}{fmt(inv.totalAmount)}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default InvoicesTab;
