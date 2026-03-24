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
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Search, MessageSquare, Eye, Filter,
  IndianRupee, CheckCircle, Clock, AlertCircle,
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

  const [invoices,       setInvoices      ] = useState([]);
  const [loading,        setLoading       ] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [search,         setSearch        ] = useState('');
  const [statusFilter,   setStatusFilter  ] = useState('all');

  // Real-time invoice listener
  useEffect(() => {
    if (!cafeId) return;
    setLoading(true);
    const q = query(
      collection(db, 'invoices'),
      where('cafeId', '==', cafeId)
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0);
          const tb = b.createdAt?.toDate?.() || new Date(0);
          return tb - ta; // newest first
        });
      setInvoices(docs);
      setLoading(false);
    }, err => {
      console.error('[InvoicesTab]', err);
      setLoading(false);
    });
    return () => unsub();
  }, [cafeId]);

  // Filter
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const matchStatus = statusFilter === 'all' || inv.paymentStatus === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        String(inv.invoiceNumber || '').toLowerCase().includes(q) ||
        String(inv.orderNumber || '').toLowerCase().includes(q) ||
        (inv.customerName || '').toLowerCase().includes(q) ||
        (inv.customerPhone || '').includes(q);
      return matchStatus && matchSearch;
    });
  }, [invoices, search, statusFilter]);

  // Send invoice via WhatsApp (Task 5, iOS-safe)
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
    if (inv.subtotalAmount)      msg += `*Subtotal:* ${CUR}${fmt(inv.subtotalAmount)}\n`;
    if (inv.gstAmount > 0)       msg += `*GST (${inv.gstRate || ''}%):* ${CUR}${fmt(inv.gstAmount)}\n`;
    if (inv.serviceChargeAmount > 0) msg += `*Service Charge:* ${CUR}${fmt(inv.serviceChargeAmount)}\n`;
    msg += `*Total:* ${CUR}${fmt(inv.totalAmount)}\n`;
    msg += `*Payment:* ${inv.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending'}\n`;
    if (inv.paymentMode) msg += `*Mode:* ${inv.paymentMode}\n`;
    msg += `\nThank you for visiting ${inv.cafeName || ''} ☕`;

    // iOS-safe redirect
    window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

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
            {invoices.length} total · {invoices.filter(i => i.paymentStatus === 'paid').length} paid
          </p>
        </div>
      </div>

      {/* Filters */}
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
        <div className="flex gap-2">
          {['all','paid','pending'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-4 h-10 rounded-sm text-sm font-medium capitalize transition-all"
              style={statusFilter === s
                ? { background: '#D4AF37', color: '#000' }
                : { background: 'rgba(255,255,255,0.05)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.1)' }
              }>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', val: invoices.length,                                              color: '#D4AF37' },
          { label: 'Paid',           val: invoices.filter(i => i.paymentStatus === 'paid').length,      color: '#10B981' },
          { label: 'Pending',        val: invoices.filter(i => i.paymentStatus !== 'paid').length,      color: '#F59E0B' },
          { label: 'Total Revenue',  val: `${CUR}${fmt(invoices.filter(i => i.paymentStatus==='paid').reduce((s,i) => s+(i.totalAmount||0),0))}`, color: '#3B82F6' },
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
            <div key={i} className="h-20 rounded-xl bg-white/3 animate-pulse" style={{ animationDelay: `${i*80}ms` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-[#A3A3A3]/30 mx-auto mb-3" />
          <p className="text-[#A3A3A3]">
            {invoices.length === 0
              ? 'No invoices yet. Invoices are auto-generated when orders are placed.'
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
                        {inv.invoiceNumber || `INV-${String(inv.orderNumber||'').padStart(4,'0')}`}
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

                {/* Items summary (collapsed) */}
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
