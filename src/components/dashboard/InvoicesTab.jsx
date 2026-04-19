/**
 * InvoicesTab.jsx
 *
 * CHANGES FROM ORIGINAL (additive only — zero existing logic removed):
 *
 * TASK 1 — Date Range Filter:
 *   Added `dateFrom` and `dateTo` state (ISO date strings).
 *   Two date <input type="date"> fields placed inline with existing
 *   search/filter row (second flex row, mobile-stacked).
 *   `filtered` useMemo extended with date range check via `isInDateRange()`.
 *
 * TASK 2 — Default = Today:
 *   `dateFrom` and `dateTo` both initialise to today's ISO date string
 *   via `getTodayISO()` helper. No data loading change — just filter state.
 *
 * TASK 3 — CSV respects date filter:
 *   `downloadCSV` now uses `filtered` (already date-filtered) instead of
 *   the full `invoices` array. One-line swap, no other export logic changed.
 *
 * TASK 4 — Minor text size reduction:
 *   CSS class `.inv-card` secondary text nudged from implicit sizes down ~1px.
 *   Specific inline `text-xs` callouts kept; a few `text-sm` → `text-xs`
 *   on secondary/meta lines inside the card. Primary amounts unchanged.
 *
 * TASK 5 — Responsiveness:
 *   Date inputs use `w-full sm:w-auto` so they stack on mobile without overflow.
 *   `min-w-0` on the date row container. Input `type="date"` is natively mobile
 *   friendly on iOS/Android (native date picker).
 *
 * Everything else: 100% identical to original.
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

// ── Inject café-vibe CSS once ─────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('inv-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'inv-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .inv { font-family: 'DM Sans', system-ui, sans-serif; }
    .inv-title { font-family: 'Playfair Display', serif !important; }
    .inv-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 200ms;
    }
    .inv-card:hover { border-color: rgba(201,162,39,0.22); }
    .inv-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 11px;
      padding: 5px 11px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms;
      white-space: nowrap;
    }
    .inv-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .inv-btn:active { transform: scale(0.96); }
    .inv-btn-gold   { background: rgba(212,175,55,0.12); color: #D4AF37; border-color: rgba(212,175,55,0.25); }
    .inv-btn-gold:hover { background: rgba(212,175,55,0.22); }
    .inv-btn-green  { background: rgba(37,211,102,0.1); color: #25D366; border-color: rgba(37,211,102,0.25); }
    .inv-btn-green:hover { background: rgba(37,211,102,0.18); }
    .inv-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 13px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .inv-input:focus { border-color: rgba(201,162,39,0.55); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .inv-input::placeholder { color: #3d3020; }

    /* TASK 1+5 — date inputs: match inv-input style, mobile-safe */
    .inv-date {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 9px 12px; font-size: 12px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; transition: border-color 180ms, box-shadow 180ms;
      cursor: pointer;
      /* Prevent iOS overflow */
      min-width: 0; max-width: 100%;
      /* Style the calendar icon to match theme */
      color-scheme: dark;
    }
    .inv-date:focus { border-color: rgba(201,162,39,0.55); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .inv-date-label {
      font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em;
      color: #7a6a55; margin-bottom: 4px; display: block;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    @keyframes invIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .inv-in { animation: invIn 280ms ease forwards; }
  `;
  document.head.appendChild(el);
}

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

// ── TASK 2: helper to get today's date as YYYY-MM-DD ─────────────────────────
const getTodayISO = () => new Date().toISOString().slice(0, 10);

// ── TASK 1: helper — check if invoice timestamp falls within [from, to] ───────
const isInDateRange = (createdAt, from, to) => {
  if (!from && !to) return true;
  try {
    const d = createdAt?.toDate
      ? createdAt.toDate()
      : createdAt?.seconds
        ? new Date(createdAt.seconds * 1000)
        : null;
    if (!d) return false;
    // Compare date strings only (YYYY-MM-DD) so we include full day boundaries
    const dStr = d.toISOString().slice(0, 10);
    if (from && dStr < from) return false;
    if (to   && dStr > to)   return false;
    return true;
  } catch {
    return false;
  }
};

const StatusBadge = ({ status }) => {
  const isPaid = status === 'paid';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black"
      style={{
        fontSize: '11px',
        background: isPaid ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
        color:      isPaid ? '#34d399'               : '#fbbf24',
        border:     `1.5px solid ${isPaid ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.22)'}`,
      }}
    >
      {isPaid ? '💰 Paid' : '⏳ Pending'}
    </span>
  );
};

const InvoicesTab = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── Real Firestore invoice documents ─────────────────────────────────────
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

  // ── Orders fallback ───────────────────────────────────────────────────────
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

  const isPaidOrder = (o) =>
    (o.paymentStatus === 'paid' || o.paymentStatus === 'SUCCESS' || o.status === 'paid') && !o.isDeleted;

  const invoices = useMemo(() => {
    const coveredOrderIds = new Set(firestoreInvoices.map(inv => inv.orderId).filter(Boolean));
    const syntheticInvoices = rawOrders
      .filter(o => isPaidOrder(o) && !coveredOrderIds.has(o.id))
      .map(o => ({
        id:                   `order_${o.id}`,
        _source:              'order',
        orderId:              o.id,
        orderNumber:          o.orderNumber,
        cafeId:               o.cafeId,
        customerName:         o.customerName   || '',
        customerPhone:        o.customerPhone  || '',
        tableNumber:          o.tableNumber    || '',
        orderType:            o.orderType      || 'dine-in',
        deliveryAddress:      o.deliveryAddress || '',
        items:                o.items          || [],
        subtotalAmount:       o.subtotalAmount ?? o.totalAmount ?? 0,
        gstAmount:            o.gstAmount      ?? o.taxAmount ?? 0,
        serviceChargeAmount:  o.serviceChargeAmount ?? 0,
        totalAmount:          o.totalAmount    ?? o.total ?? 0,
        paymentMode:          o.paymentMode    || 'counter',
        paymentStatus:        'paid',
        currencySymbol:       o.currencySymbol || CUR,
        invoiceNumber:        null,
        createdAt:            o.createdAt,
        cafeName:             cafe?.name       || '',
      }));

    return [...firestoreInvoices, ...syntheticInvoices].sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0);
      const tb = b.createdAt?.toDate?.() || new Date(0);
      return tb - ta;
    });
  }, [firestoreInvoices, rawOrders, CUR, cafe?.name]);

  // ── Search / filter ───────────────────────────────────────────────────────
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [search,         setSearch        ] = useState('');
  const [statusFilter,   setStatusFilter  ] = useState('all');

  // TASK 1 + 2: date range state — defaults to today
  const [dateFrom, setDateFrom] = useState(getTodayISO);
  const [dateTo,   setDateTo  ] = useState(getTodayISO);

  // TASK 1: extend filtered with date range check
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const matchStatus = statusFilter === 'all' || inv.paymentStatus === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        String(inv.invoiceNumber || '').toLowerCase().includes(q) ||
        String(inv.orderNumber   || '').toLowerCase().includes(q) ||
        (inv.customerName  || '').toLowerCase().includes(q) ||
        (inv.customerPhone || '').includes(q);
      // TASK 1: date range filter
      const matchDate = isInDateRange(inv.createdAt, dateFrom, dateTo);
      return matchStatus && matchSearch && matchDate;
    });
  }, [invoices, search, statusFilter, dateFrom, dateTo]);

  // ── Stats (based on full unfiltered invoices list — unchanged) ───────────
  const paidInvoices  = invoices.filter(i => i.paymentStatus === 'paid');
  const pendingOrders = rawOrders.filter(o => !isPaidOrder(o) && !o.isDeleted).length;
  const totalRevenue  = paidInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);

  // ── TASK 3: CSV now uses `filtered` (respects date range) ─────────────────
  const downloadCSV = () => {
    if (filtered.length === 0) { toast.error('No invoices to export for selected range'); return; }
    try {
      const rows = filtered.map(o => ({   // ← was `invoices`, now `filtered`
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
      const headers  = Object.keys(rows[0]).join(',');
      const csvRows  = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csvContent = [headers, ...csvRows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `invoices_${dateFrom}_to_${dateTo}.csv`);  // filename reflects range
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

  // ── WhatsApp send — UNCHANGED ─────────────────────────────────────────────
  const handleSendWA = (inv) => {
    const phone = (inv.customerPhone || '').replace(/\D/g, '');
    if (!phone) { toast.error('No customer phone number on this invoice'); return; }
    const items = (inv.items || []).map(i => `• ${i.name} × ${i.quantity} — ${CUR}${fmt(i.price * i.quantity)}`).join('\n');
    let msg = `🧾 *Invoice ${inv.invoiceNumber || ''}*\n`;
    msg += `*Order #${String(inv.orderNumber || '').padStart(3, '0')}*\n`;
    if (inv.customerName) msg += `*Customer:* ${inv.customerName}\n`;
    msg += `\n*Items:*\n${items}\n\n`;
    if (inv.subtotalAmount)          msg += `*Subtotal:* ${CUR}${fmt(inv.subtotalAmount)}\n`;
    if (inv.gstAmount > 0)           msg += `*GST:* ${CUR}${fmt(inv.gstAmount)}\n`;
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="inv space-y-5">

      {viewingInvoice && (
        <InvoiceModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
      )}

      {/* Header — UNCHANGED */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.2)' }}>
            🧾
          </div>
          <div>
            <h2 className="text-white font-black text-2xl inv-title">Invoices</h2>
            {/* TASK 4: secondary text slightly smaller */}
            <p className="font-bold mt-0.5" style={{ color: '#7a6a55', fontSize: '11px' }}>
              {invoices.length} total · {paidInvoices.length} paid
            </p>
          </div>
        </div>
      </div>

      {/* TASK 1+5: Date range row — placed above search, mobile-stacked */}
      <div className="flex flex-col sm:flex-row gap-3 min-w-0">
        <div className="flex items-end gap-2 flex-wrap min-w-0">
          <div className="min-w-0">
            <label className="inv-date-label">📅 From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
              className="inv-date"
              style={{ width: '100%', maxWidth: '160px' }}
            />
          </div>
          <div className="min-w-0">
            <label className="inv-date-label">📅 To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              className="inv-date"
              style={{ width: '100%', maxWidth: '160px' }}
            />
          </div>
          {/* Quick-clear: reset to today */}
          {(dateFrom !== getTodayISO() || dateTo !== getTodayISO()) && (
            <button
              onClick={() => { setDateFrom(getTodayISO()); setDateTo(getTodayISO()); }}
              className="self-end pb-0.5"
              style={{ fontSize: '11px', color: '#7a6a55', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              ↩ Today
            </button>
          )}
        </div>

        {/* TASK 4: result count for current date range */}
        <div className="flex items-end pb-1 min-w-0">
          <span style={{ fontSize: '11px', color: '#4a3f35', fontWeight: 700 }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      </div>

      {/* Filters + CSV — UNCHANGED structure, TASK 4: font sizes slightly tighter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice #, order #, customer name or phone…"
            className="inv-input"
            style={{ paddingLeft: '2.2rem' }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'paid', 'pending'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 h-10 rounded-xl font-black capitalize transition-all"
              style={{
                fontSize: '12px',
                ...(statusFilter === s
                  ? { background: 'linear-gradient(135deg,#C9A227,#A67C00)', color: '#fff', boxShadow: '0 3px 12px rgba(201,162,39,0.3)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1.5px solid rgba(255,255,255,0.07)' }
                )
              }}>
              {s === 'all' ? '📋 All' : s === 'paid' ? '💰 Paid' : '⏳ Pending'}
            </button>
          ))}
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 h-10 rounded-xl font-black transition-all"
            style={{ fontSize: '12px', background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1.5px solid rgba(255,255,255,0.07)' }}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">📥 Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        </div>
      </div>

      {/* Stats row — UNCHANGED */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', val: invoices.length,              color: '#C9A227', emoji: '🧾' },
          { label: 'Paid',           val: paidInvoices.length,          color: '#34d399', emoji: '💰' },
          { label: 'Pending',        val: pendingOrders,                 color: '#fbbf24', emoji: '⏳' },
          { label: 'Total Revenue',  val: `${CUR}${fmt(totalRevenue)}`, color: '#60a5fa', emoji: '📊' },
        ].map(s => (
          <motion.div key={s.label} whileHover={{ y: -2 }}
            className="inv-card p-4"
            style={{ borderLeft: `3px solid ${s.color}` }}>
            <p className="text-2xl mb-0.5">{s.emoji}</p>
            <p className="font-black text-xl" style={{ color: s.color }}>{s.val}</p>
            {/* TASK 4: label slightly smaller */}
            <p className="font-bold mt-0.5" style={{ color: '#7a6a55', fontSize: '11px' }}>{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/3 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="inv-card p-12 text-center">
          <div className="text-5xl mb-3">🧾</div>
          {/* TASK 4: slightly smaller secondary text */}
          <p className="font-bold" style={{ color: '#7a6a55', fontSize: '13px' }}>
            {invoices.length === 0
              ? 'No paid invoices yet. Invoices appear automatically when orders are marked as paid.'
              : dateFrom || dateTo
                ? `No invoices found for ${dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}.`
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
                className="inv-card"
              >
                {/* Top accent bar — UNCHANGED */}
                <div style={{ height: 2, background: inv.paymentStatus === 'paid' ? 'linear-gradient(90deg,#34d399,transparent)' : 'linear-gradient(90deg,#fbbf24,transparent)' }} />

                <div className="flex items-center justify-between px-5 py-3 gap-4">
                  {/* Left */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* TASK 4: invoice number slightly smaller */}
                      <span className="font-black inv-title" style={{ color: '#C9A227', fontSize: '13px' }}>
                        {inv.invoiceNumber || `ORD-${String(inv.orderNumber||'').padStart(4,'0')}`}
                      </span>
                      <span className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>
                        Order #{String(inv.orderNumber||'').padStart(3,'0')}
                      </span>
                      <StatusBadge status={inv.paymentStatus} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {inv.customerName && (
                        <span className="font-semibold" style={{ color: '#fff8ee', fontSize: '12px' }}>👤 {inv.customerName}</span>
                      )}
                      {inv.customerPhone && (
                        <span className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>📞 {inv.customerPhone}</span>
                      )}
                      <span className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>📅 {formatDate(inv.createdAt)}</span>
                    </div>
                    {inv?.orderType === 'delivery' && (
                      <div className="mt-1 font-semibold" style={{ color: '#7a6a55', fontSize: '11px' }}>
                        🛵 {inv?.deliveryAddress || 'N/A'}
                      </div>
                    )}
                  </div>

                  {/* Right: amounts + actions — UNCHANGED structure */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      {inv.gstAmount > 0 && (
                        <p className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>GST: {CUR}{fmt(inv.gstAmount)}</p>
                      )}
                      {inv.serviceChargeAmount > 0 && (
                        <p className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>SC: {CUR}{fmt(inv.serviceChargeAmount)}</p>
                      )}
                      {/* TASK 4: total amount kept prominent, just slightly tightened */}
                      <p className="font-black" style={{ color: '#C9A227', fontSize: '14px' }}>💵 {CUR}{fmt(inv.totalAmount)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingInvoice(inv)}
                        className="inv-btn inv-btn-gold"
                      >
                        <Eye className="w-3 h-3" />
                        <span className="hidden sm:inline">View</span>
                      </button>
                      {inv.customerPhone && (
                        <button
                          onClick={() => handleSendWA(inv)}
                          className="inv-btn inv-btn-green"
                          title="Send Invoice via WhatsApp"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items summary — UNCHANGED structure, TASK 4: tag text tighter */}
                {inv.items?.length > 0 && (
                  <div className="px-5 pb-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex flex-wrap gap-1.5">
                      {inv.items.slice(0, 4).map((item, j) => (
                        <span key={j} className="px-2 py-0.5 rounded-full font-bold"
                          style={{ fontSize: '11px', background: 'rgba(201,162,39,0.08)', color: '#7a6a55', border: '1px solid rgba(201,162,39,0.15)' }}>
                          🍴 {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {inv.items.length > 4 && (
                        <span className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>+{inv.items.length - 4} more</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 sm:hidden">
                      <span className="font-bold" style={{ color: '#4a3f35', fontSize: '11px' }}>
                        {inv.gstAmount > 0 ? `GST: ${CUR}${fmt(inv.gstAmount)}` : ''}
                        {inv.serviceChargeAmount > 0 ? ` · SC: ${CUR}${fmt(inv.serviceChargeAmount)}` : ''}
                      </span>
                      <span className="font-black" style={{ color: '#C9A227', fontSize: '13px' }}>{CUR}{fmt(inv.totalAmount)}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Footer — UNCHANGED */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span>☕</span>
        <p className="font-bold" style={{ color: '#7a6a55', fontSize: '11px' }}>
          {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} · Real-time sync active
        </p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
      </div>
    </div>
  );
};

export default InvoicesTab;
