/**
 * LoyaltyDashboard.jsx
 *
 * Complete loyalty system for SmartCafé OS.
 * Firestore collection: loyaltyCustomers
 *
 * UI: Identical design language to OrdersManagement —
 *     same CSS tokens, same #111827 base, same #C9A227 gold,
 *     same Inter font, same omf-* class structure, emojis only.
 *
 * Discount ladder:
 *  Visit 1 → 10%  |  Visit 2 → 15%  |  Visit 3 → 20%
 *  Visit 4 → 25%  |  Visit 5+ → 30%
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useCollection } from '../../hooks/useFirestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import GoogleReviewSettings from './GoogleReviewSettings';

// ── Inject CSS — exact same tokens as OrdersManagement (omf-*) ───────────────
if (typeof document !== 'undefined' && !document.getElementById('loy-v2-css')) {
  const el = document.createElement('style');
  el.id = 'loy-v2-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .loy { font-family: 'Inter', system-ui, sans-serif; color: #D1D5DB; }
    .loy * { box-sizing: border-box; }
    .loy-title { font-family: 'Inter', system-ui, sans-serif !important; font-weight: 600; letter-spacing: -0.02em; }

    /* ── Cards — same as omf-card ── */
    .loy-card {
      background: #111827;
      border: 1px solid #1F2937;
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-card:hover {
      border-color: #374151;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }

    /* ── Stat card ── */
    .loy-stat {
      background: #111827;
      border: 1px solid #1F2937;
      border-radius: 12px;
      padding: 18px 16px;
      transition: border-color 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-stat:hover { border-color: #374151; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }

    /* ── Buttons — same as omf-btn ── */
    .loy-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 500; font-size: 12px;
      padding: 6px 12px; border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 150ms cubic-bezier(0.4,0,0.2,1);
      white-space: nowrap; letter-spacing: -0.01em;
    }
    .loy-btn:hover  { transform: translateY(-1px); }
    .loy-btn:active { transform: scale(0.98); }
    .loy-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; pointer-events: none; }

    /* Gold primary — same as omf-btn-orange */
    .loy-btn-primary {
      background: #C9A227; color: #000; font-weight: 600;
      box-shadow: 0 1px 8px rgba(201,162,39,0.2);
    }
    .loy-btn-primary:hover { background: #D4AD35; box-shadow: 0 4px 16px rgba(201,162,39,0.25); }

    /* Ghost — same as omf-btn-ghost */
    .loy-btn-ghost { background: rgba(255,255,255,0.04); color: #6B7280; border-color: #1F2937; }
    .loy-btn-ghost:hover { background: rgba(255,255,255,0.07); color: #D1D5DB; border-color: #374151; }

    /* Green — same as omf-btn-green */
    .loy-btn-green { background: rgba(34,197,94,0.08); color: #4ADE80; border-color: rgba(34,197,94,0.2); }
    .loy-btn-green:hover { background: rgba(34,197,94,0.14); }

    /* Red — same as omf-btn-red */
    .loy-btn-red { background: rgba(239,68,68,0.08); color: #F87171; border-color: rgba(239,68,68,0.2); }
    .loy-btn-red:hover { background: rgba(239,68,68,0.14); }

    /* Yellow — same as omf-btn-yellow */
    .loy-btn-yellow { background: rgba(245,158,11,0.08); color: #FCD34D; border-color: rgba(245,158,11,0.2); }
    .loy-btn-yellow:hover { background: rgba(245,158,11,0.14); }

    /* Danger confirm */
    .loy-btn-danger { background: #dc2626; color: #fff; border-color: #dc2626; font-weight: 600; }
    .loy-btn-danger:hover { background: #ef4444; }

    /* ── Inputs — same as omf-input ── */
    .loy-input {
      background: #0B0F14;
      border: 1px solid #1F2937;
      border-radius: 8px;
      color: #F9FAFB;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 400;
      font-family: 'Inter', system-ui, sans-serif;
      outline: none;
      width: 100%;
      transition: border-color 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-input:focus { border-color: #C9A227; box-shadow: 0 0 0 2px rgba(201,162,39,0.12); }
    .loy-input::placeholder { color: #374151; }
    .loy-input:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Badges — same as omf-badge ── */
    .loy-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 500;
      border: 1px solid transparent;
      font-family: 'Inter', system-ui, sans-serif;
      letter-spacing: 0.01em;
    }

    /* ── Filter tabs — same as omf-tab ── */
    .loy-tab {
      padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 500;
      cursor: pointer;
      transition: all 150ms cubic-bezier(0.4,0,0.2,1);
      border: 1px solid #1F2937;
      font-family: 'Inter', system-ui, sans-serif;
      letter-spacing: -0.01em;
    }
    .loy-tab-on  { background: #C9A227; color: #000; border-color: #C9A227; font-weight: 600; box-shadow: 0 1px 8px rgba(201,162,39,0.2); }
    .loy-tab-off { background: transparent; color: #6B7280; }
    .loy-tab-off:hover { background: rgba(255,255,255,0.04); color: #D1D5DB; border-color: #374151; }

    /* ── Row button (collapsible header) ── */
    .loy-row-btn {
      width: 100%; display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; background: transparent; border: none;
      cursor: pointer; text-align: left;
      transition: background 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-row-btn:hover { background: rgba(255,255,255,0.025); }

    /* ── Section label — same as omf-sec ── */
    .loy-sec {
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
      color: #6B7280; display: flex; align-items: center; gap: 5px;
      font-family: 'Inter', system-ui, sans-serif;
    }

    /* ── Gold number — same as omf-ordnum ── */
    .loy-gold { color: #C9A227; font-weight: 600; font-family: 'Inter', system-ui, sans-serif; }

    /* ── Tier pills ── */
    .loy-tier-pill {
      font-size: 11px; font-weight: 500;
      padding: 3px 10px; border-radius: 4px;
      background: rgba(255,255,255,0.04); border: 1px solid #1F2937;
      color: #6B7280; font-family: 'Inter', system-ui, sans-serif;
    }
    .loy-tier-pill strong { color: #C9A227; }

    /* ── Fade-in — same as omf-in ── */
    @keyframes loyIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .loy-in { animation: loyIn 200ms cubic-bezier(0.4,0,0.2,1) forwards; }

    /* ── Spin ── */
    @keyframes loySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .loy-spin { animation: loySpin 1s linear infinite; display: inline-block; }

    /* ── Search bar ── */
    .loy-search-wrap { position: relative; flex: 1; }
    .loy-search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); pointer-events: none; font-size: 14px; line-height: 1; }
    .loy-search-wrap .loy-input { padding-left: 36px; height: 44px; }

    /* ── Scrollbar — same as omf-scroll ── */
    .loy ::-webkit-scrollbar { width: 3px; }
    .loy ::-webkit-scrollbar-track { background: transparent; }
    .loy ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
  `;
  document.head.appendChild(el);
}

// ── Discount ladder ──────────────────────────────────────────────────────────
const discountForVisits = (v) => {
  if (v <= 1) return 10;
  if (v === 2) return 15;
  if (v === 3) return 20;
  if (v === 4) return 25;
  return 30;
};

// ── Tier badge config (mirrors STATUS object in OrdersManagement) ─────────────
const getTier = (disc) => {
  if (disc >= 30) return { label: 'Free Item', bg: 'rgba(34,197,94,0.1)',    color: '#4ADE80', bd: 'rgba(34,197,94,0.25)',    emoji: '🎁' };
  if (disc >= 25) return { label: `${disc}% OFF`, bg: 'rgba(201,162,39,0.12)', color: '#C9A227', bd: 'rgba(201,162,39,0.3)',  emoji: '👑' };
  if (disc >= 20) return { label: `${disc}% OFF`, bg: 'rgba(201,162,39,0.08)', color: '#C9A227', bd: 'rgba(201,162,39,0.22)', emoji: '⭐' };
  if (disc >= 15) return { label: `${disc}% OFF`, bg: 'rgba(201,162,39,0.06)', color: '#C9A227', bd: 'rgba(201,162,39,0.16)', emoji: '🌟' };
  return               { label: `${disc}% OFF`, bg: 'rgba(255,255,255,0.05)', color: '#9CA3AF', bd: '#1F2937',               emoji: '🎫' };
};

// ── WhatsApp message ─────────────────────────────────────────────────────────
const buildWAMessage = (customer) => {
  const disc   = customer.currentDiscount;
  const isFree = disc >= 30;
  const expiryText = (() => {
    if (!customer.expiryDate) return null;
    const d = customer.expiryDate?.toDate ? customer.expiryDate.toDate() : new Date(customer.expiryDate);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
  return (
    `🎉 Welcome back, ${customer.name}!\n\n` +
    (isFree
      ? `🎁 You've unlocked a FREE ITEM on your next visit!\n`
      : `🔥 You've unlocked *${disc}% OFF* on your next order!\n`) +
    (expiryText ? `📅 Valid till: ${expiryText}\n` : '') +
    `\nShow this message at the counter to redeem.\n` +
    `\n👀 Keep visiting — your next reward is just around the corner!`
  );
};

// ════════════════════════════════════════════════════════════════════════════
const LoyaltyDashboard = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: customers, loading } = useCollection(
    'loyaltyCustomers',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  const [search,          setSearch         ] = useState('');
  const [filterTier,      setFilterTier     ] = useState('all');
  const [showAddForm,     setShowAddForm     ] = useState(false);
  const [saving,          setSaving          ] = useState(false);
  const [markingId,       setMarkingId       ] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId ] = useState(null);
  const [deleting,        setDeleting        ] = useState(false);
  const [expandedId,      setExpandedId      ] = useState(null);
  const [editingId,       setEditingId       ] = useState(null);
  const [editDiscount,    setEditDiscount    ] = useState('');
  const [editValidity,    setEditValidity    ] = useState('');

  const [newName,        setNewName       ] = useState('');
  const [newPhone,       setNewPhone      ] = useState('');
  const [validityDays,   setValidityDays  ] = useState('');
  const [customDiscount, setCustomDiscount] = useState('');

  const filtered = useMemo(() => {
    if (!customers) return [];
    let list = customers;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
    if (filterTier === 'new')    list = list.filter(c => (c.visits || 0) === 1);
    if (filterTier === 'rising') list = list.filter(c => (c.visits || 0) >= 2 && (c.visits || 0) <= 3);
    if (filterTier === 'loyal')  list = list.filter(c => (c.visits || 0) >= 4);
    return list;
  }, [customers, search, filterTier]);

  const totalCustomers = customers?.length || 0;
  const totalVisits    = customers?.reduce((s, c) => s + (c.visits || 0), 0) || 0;
  const loyalCount     = customers?.filter(c => (c.visits || 0) >= 3).length || 0;
  const repeatVisits   = customers?.reduce((s, c) => s + Math.max(0, (c.visits || 0) - 1), 0) || 0;

  // ── Add customer ───────────────────────────────────────────────────────────
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return; }
    if (customers?.find(c => c.phone === newPhone.trim())) { toast.error('Phone number already exists'); return; }
    setSaving(true);
    try {
      const days   = Number(validityDays) || 0;
      const expiry = days > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + days); return d; })() : null;
      const disc   = customDiscount ? Number(customDiscount) : 10;
      await addDoc(collection(db, 'loyaltyCustomers'), {
        cafeId, name: newName.trim(), phone: newPhone.trim(),
        visits: 1, currentDiscount: disc,
        validityDays: days, expiryDate: expiry,
        createdAt: serverTimestamp(), lastVisit: serverTimestamp(),
      });
      toast.success(`⭐ ${newName.trim()} added to loyalty program`);
      setNewName(''); setNewPhone(''); setValidityDays(''); setCustomDiscount('');
      setShowAddForm(false);
    } catch (err) {
      console.error('[Loyalty] addDoc failed:', err);
      toast.error(`Failed to add customer: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Mark visit ─────────────────────────────────────────────────────────────
  const handleMarkVisit = async (customer) => {
    setMarkingId(customer.id);
    try {
      const newVisits = (customer.visits || 0) + 1;
      const newDisc   = discountForVisits(newVisits);
      const days      = Number(customer.validityDays) || 0;
      const expiry    = days > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + days); return d; })() : null;
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        visits: newVisits, currentDiscount: newDisc,
        lastVisit: serverTimestamp(), validityDays: days,
        ...(expiry !== null && { expiryDate: expiry }),
      });
      toast.success(
        newDisc >= 30
          ? `🎁 ${customer.name} unlocked a FREE ITEM! (${newVisits} visits)`
          : `✅ Visit ${newVisits} marked — ${customer.name} gets ${newDisc}% OFF`
      );
    } catch (err) {
      console.error('[Loyalty] mark visit error:', err);
      toast.error('Failed to update visit');
    } finally {
      setMarkingId(null);
    }
  };

  // ── Undo visit ─────────────────────────────────────────────────────────────
  const handleUndoVisit = async (customer) => {
    if ((customer.visits || 1) <= 1) { toast.error('Cannot reduce below 1 visit'); return; }
    setMarkingId(customer.id);
    try {
      const newVisits = customer.visits - 1;
      const newDisc   = discountForVisits(newVisits);
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), { visits: newVisits, currentDiscount: newDisc });
      toast.success(`↩️ Undone — ${customer.name} at visit ${newVisits} (${newDisc}% OFF)`);
    } catch (err) {
      console.error('[Loyalty] undo visit failed:', err);
      toast.error(`Undo failed: ${err.message}`);
    } finally {
      setMarkingId(null);
    }
  };

  // ── Delete customer ────────────────────────────────────────────────────────
  const handleDelete = async (customer) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'loyaltyCustomers', customer.id));
      toast.success(`🗑️ ${customer.name} removed`);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('[Loyalty] delete failed:', err);
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── Save edit ──────────────────────────────────────────────────────────────
  const handleSaveEdit = async (customer) => {
    try {
      const newDisc = editDiscount ? Number(editDiscount) : customer.currentDiscount;
      const newDays = editValidity !== '' ? Number(editValidity) : (customer.validityDays || 0);
      const expiry  = newDays > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + newDays); return d; })() : null;
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        currentDiscount: newDisc, validityDays: newDays,
        ...(expiry !== null && { expiryDate: expiry }),
      });
      toast.success(`✅ ${customer.name} updated — ${newDisc}% OFF${newDays ? `, ${newDays}d validity` : ''}`);
      setEditingId(null); setEditDiscount(''); setEditValidity('');
    } catch (err) {
      console.error('[Loyalty] save edit failed:', err);
      toast.error(`Update failed: ${err.message}`);
    }
  };

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  const handleSendWA = (customer) => {
    if (!customer.phone) { toast.error('No phone number'); return; }
    const digits = customer.phone.replace(/\D/g, '');
    const num    = digits.length === 10 ? `91${digits}` : digits;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(buildWAMessage(customer))}`, '_blank');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="loy space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="loy-title text-xl font-semibold text-white tracking-tight">Loyalty</h2>
          <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#6B7280' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9A227' }} />
            Rewards program — real-time
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="loy-btn loy-btn-primary"
          style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px' }}
          data-testid="add-loyalty-customer-btn"
        >
          ➕ Add Customer
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { emoji: '👥', label: 'Members',       value: totalCustomers, color: '#C9A227' },
          { emoji: '📈', label: 'Total Visits',  value: totalVisits,    color: '#60A5FA' },
          { emoji: '🏆', label: 'Loyal (3+)',    value: loyalCount,     color: '#4ADE80' },
          { emoji: '🔄', label: 'Repeat Visits', value: repeatVisits,   color: '#A78BFA' },
        ].map(({ emoji, label, value, color }) => (
          <div key={label} className="loy-stat" style={{ borderTop: `2px solid ${color}` }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span style={{ fontSize: 15 }}>{emoji}</span>
              <p className="loy-sec" style={{ fontSize: 10 }}>{label}</p>
            </div>
            <p className="text-white font-bold" style={{ fontSize: 28, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="loy-search-wrap">
          <span className="loy-search-icon">🔍</span>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="loy-input"
            placeholder="Search by name or phone…"
          />
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all',    label: 'All' },
          { key: 'new',    label: '🌟 New (1 visit)' },
          { key: 'rising', label: '⭐ Rising (2–3)' },
          { key: 'loyal',  label: '👑 Loyal (4+)' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilterTier(key)} className={`loy-tab ${filterTier === key ? 'loy-tab-on' : 'loy-tab-off'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Add customer form ── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="loy-card"
            style={{ padding: 24 }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="loy-title text-white text-base">🎟️ New Loyalty Customer</h3>
                <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Enrol a customer in the rewards program</p>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', cursor: 'pointer' }}
              >✕</button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#6B7280' }}>👤 Customer Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma" className="loy-input" disabled={saving}
                    data-testid="loyalty-name-input" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#6B7280' }}>📱 Phone Number</label>
                  <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 9876543210" className="loy-input" disabled={saving}
                    data-testid="loyalty-phone-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#6B7280' }}>📅 Validity (days) <span style={{ fontWeight: 400 }}>— optional</span></label>
                  <input type="number" min="0" value={validityDays} onChange={e => setValidityDays(e.target.value)}
                    placeholder="e.g. 30" className="loy-input" disabled={saving}
                    data-testid="loyalty-validity-input" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#6B7280' }}>💎 Custom Discount (%) <span style={{ fontWeight: 400 }}>— optional</span></label>
                  <input type="number" min="0" max="100" value={customDiscount} onChange={e => setCustomDiscount(e.target.value)}
                    placeholder="Default: 10%" className="loy-input" disabled={saving}
                    data-testid="loyalty-discount-input" />
                </div>
              </div>
              <p className="text-xs" style={{ color: '#6B7280' }}>
                First visit is recorded automatically. Customer starts at <span className="loy-gold">10% off</span>.
              </p>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="loy-btn loy-btn-primary" data-testid="loyalty-submit-btn">
                  {saving ? <><RefreshCw size={12} className="loy-spin" /> Adding…</> : '➕ Add Customer'}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="loy-btn loy-btn-ghost">Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reward tiers ── */}
      <div>
        <p className="loy-sec mb-2">🏅 Reward Tiers</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { visits: '1 visit',   disc: '10%' },
            { visits: '2 visits',  disc: '15%' },
            { visits: '3 visits',  disc: '20%' },
            { visits: '4 visits',  disc: '25%' },
            { visits: '5+ visits', disc: '🎁 Free Item' },
          ].map(({ visits, disc }) => (
            <span key={visits} className="loy-tier-pill">
              {visits} → <strong>{disc}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* ── Customer list ── */}
      {loading ? (
        <div className="loy-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: 12 }}>
          <RefreshCw size={20} className="loy-spin" style={{ color: '#6B7280' }} />
          <p className="text-sm font-medium" style={{ color: '#6B7280' }}>Loading loyalty members…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="loy-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: 10, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1F2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 4 }}>🫙</div>
          <p className="text-base font-semibold text-white">No customers found</p>
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {search ? 'Try a different name or phone number.' : 'Add your first loyalty customer to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer, ci) => {
            const disc    = customer.currentDiscount || 10;
            const visits  = customer.visits || 0;
            const tier    = getTier(disc);
            const marking = markingId === customer.id;
            const isOpen  = expandedId === customer.id;
            const isEditing = editingId === customer.id;
            const isDeleteConfirm = deleteConfirmId === customer.id;

            return (
              <div
                key={customer.id}
                className="loy-card loy-in"
                style={{ animationDelay: `${Math.min(ci * 25, 250)}ms`, animationFillMode: 'both' }}
                data-testid={`loyalty-customer-${customer.id}`}
              >
                {/* Top color bar */}
                <div style={{
                  height: 2,
                  background: disc >= 30
                    ? 'linear-gradient(90deg,#4ADE80,transparent)'
                    : disc >= 20
                    ? 'linear-gradient(90deg,#C9A227,transparent)'
                    : 'linear-gradient(90deg,rgba(201,162,39,0.4),transparent)',
                }} />

                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isOpen ? null : customer.id)}
                  className="loy-row-btn"
                  aria-expanded={isOpen}
                  data-testid={`loyalty-toggle-${customer.id}`}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1F2937', border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    👤
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-white font-semibold text-sm" style={{ letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</p>
                    <p className="text-xs" style={{ color: '#6B7280', marginTop: 2 }}>📱 {customer.phone}</p>
                  </div>

                  <span className="loy-badge" style={{ background: 'rgba(255,255,255,0.04)', color: '#9CA3AF', borderColor: '#1F2937', flexShrink: 0 }}>
                    📊 <span className="text-white font-bold">{visits}</span>
                    <span className="hidden sm:inline"> visit{visits !== 1 ? 's' : ''}</span>
                  </span>

                  <span className="loy-badge" style={{ background: tier.bg, color: tier.color, borderColor: tier.bd, flexShrink: 0 }}>
                    {tier.emoji} {tier.label}
                  </span>

                  <span style={{ fontSize: 11, color: '#374151', flexShrink: 0, display: 'inline-block', transition: 'transform 200ms', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </button>

                {/* Expanded body */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="space-y-3" style={{ padding: '12px 16px 20px', borderTop: '1px solid #1F2937' }}>

                        {/* Expiry badge */}
                        {customer.expiryDate && (() => {
                          const exp     = customer.expiryDate?.toDate ? customer.expiryDate.toDate() : new Date(customer.expiryDate);
                          const expired = exp < new Date();
                          return (
                            <div>
                              <span className="loy-badge" style={{
                                background: expired ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                                color: expired ? '#F87171' : '#6B7280',
                                borderColor: expired ? 'rgba(239,68,68,0.2)' : '#1F2937',
                              }}>
                                {expired ? '⚠️ Expired' : '📅 Valid till'}{' '}
                                {exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Action buttons */}
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => handleMarkVisit(customer)} disabled={marking} className="loy-btn loy-btn-primary" data-testid={`mark-visit-${customer.id}`}>
                            {marking ? <><RefreshCw size={11} className="loy-spin" /> Marking…</> : '📈 Mark Visit'}
                          </button>

                          <button onClick={() => handleSendWA(customer)} className="loy-btn loy-btn-green" data-testid={`wa-loyalty-${customer.id}`}>
                            💬 WhatsApp
                          </button>

                          <button onClick={() => handleUndoVisit(customer)} disabled={marking || visits <= 1} className="loy-btn loy-btn-ghost" data-testid={`undo-visit-${customer.id}`}>
                            ↩️ Undo
                          </button>

                          <button
                            onClick={() => {
                              if (isEditing) { setEditingId(null); setEditDiscount(''); setEditValidity(''); }
                              else { setEditingId(customer.id); setEditDiscount(String(disc)); setEditValidity(String(customer.validityDays || '')); }
                            }}
                            className={`loy-btn ${isEditing ? 'loy-btn-yellow' : 'loy-btn-ghost'}`}
                            data-testid={`edit-loyalty-${customer.id}`}
                          >
                            ✏️ {isEditing ? 'Cancel Edit' : 'Edit'}
                          </button>

                          {/* Two-step delete — same as Orders */}
                          {isDeleteConfirm ? (
                            <>
                              <button onClick={() => handleDelete(customer)} disabled={deleting} className="loy-btn loy-btn-danger" data-testid={`delete-confirm-${customer.id}`}>
                                {deleting ? '⏳ Removing…' : '🗑️ Yes, Remove'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="loy-btn loy-btn-ghost">✗ Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirmId(customer.id)} className="loy-btn loy-btn-ghost" style={{ color: '#5a4a1a' }} data-testid={`delete-loyalty-${customer.id}`}>
                              🗑️ Delete
                            </button>
                          )}
                        </div>

                        {/* Inline edit panel */}
                        <AnimatePresence initial={false}>
                          {isEditing && (
                            <motion.div
                              key="edit"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <div className="space-y-3 pt-3" style={{ borderTop: '1px solid #1F2937' }} data-testid={`edit-panel-${customer.id}`}>
                                <p className="loy-sec">✏️ Edit Loyalty Card</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold mb-1" style={{ color: '#6B7280' }}>💎 Discount (%)</label>
                                    <input type="number" min="0" max="100" value={editDiscount}
                                      onChange={e => setEditDiscount(e.target.value)}
                                      placeholder={`Current: ${disc}%`}
                                      className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                                      data-testid={`edit-discount-${customer.id}`} />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold mb-1" style={{ color: '#6B7280' }}>📅 Validity (days)</label>
                                    <input type="number" min="0" value={editValidity}
                                      onChange={e => setEditValidity(e.target.value)}
                                      placeholder={`Current: ${customer.validityDays || 0}d`}
                                      className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                                      data-testid={`edit-validity-${customer.id}`} />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveEdit(customer)} className="loy-btn loy-btn-primary" data-testid={`save-edit-${customer.id}`}>
                                    ✅ Save Changes
                                  </button>
                                  <button onClick={() => handleSendWA(customer)} className="loy-btn loy-btn-green" data-testid={`resend-wa-${customer.id}`}>
                                    💬 Resend WhatsApp
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-center gap-2 py-2" style={{ borderTop: '1px solid #1F2937' }}>
        <span>⭐</span>
        <p className="text-xs font-bold" style={{ color: '#4B5563' }}>
          {totalCustomers} member{totalCustomers !== 1 ? 's' : ''} · {totalVisits} total visits
        </p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9A227' }} />
      </div>

      {/* ── Google Review Link setting ── */}
      <GoogleReviewSettings />

    </div>
  );
};

export default LoyaltyDashboard;
