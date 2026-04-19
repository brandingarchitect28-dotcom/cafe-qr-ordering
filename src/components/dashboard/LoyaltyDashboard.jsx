/**
 * LoyaltyDashboard.jsx
 *
 * Complete loyalty system for SmartCafé OS.
 * Firestore collection: loyaltyCustomers
 *
 * UI: Matches OrdersManagement premium aesthetic — Inter font, #111827 base,
 *     #C9A227 gold accents, emoji labels, omf-* design tokens.
 *
 * Features:
 *  - Search by phone or name
 *  - Add new customer (visits = 1, discount = 10%)
 *  - Mark Visit + Upgrade (increments visits, escalates discount)
 *  - Send loyalty reward via WhatsApp
 *
 * Discount ladder:
 *  Visit 1  → 10%   Visit 2  → 15%   Visit 3  → 20%
 *  Visit 4  → 25%   Visit ≥5 → 30%
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
import {
  Search, UserPlus, Star, MessageSquare, Phone, User,
  Award, TrendingUp, RefreshCw, Gift, Undo2, Trash2, Repeat,
  Calendar, Pencil, Check, ChevronDown, X,
} from 'lucide-react';
import GoogleReviewSettings from './GoogleReviewSettings';

// ── Inject CSS once — matches omf-* design language ─────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('loy-omf-css')) {
  const el = document.createElement('style');
  el.id = 'loy-omf-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .loy { font-family: 'Inter', system-ui, sans-serif; color: #D1D5DB; }
    .loy * { box-sizing: border-box; }
    .loy-title { font-family: 'Inter', system-ui, sans-serif !important; font-weight: 600; letter-spacing: -0.02em; }

    /* ── Cards ── */
    .loy-card {
      background: #111827;
      border: 1px solid #1F2937;
      border-radius: 12px;
      transition: border-color 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1);
      overflow: hidden;
    }
    .loy-card:hover {
      border-color: rgba(201,162,39,0.22);
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }

    /* ── Stat cards ── */
    .loy-stat {
      background: #111827;
      border: 1px solid #1F2937;
      border-radius: 12px;
      padding: 18px 16px;
      transition: border-color 150ms cubic-bezier(0.4,0,0.2,1), box-shadow 150ms cubic-bezier(0.4,0,0.2,1), transform 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-stat:hover {
      border-color: #374151;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      transform: translateY(-2px);
    }

    /* ── Form card ── */
    .loy-form-card {
      background: #111827;
      border: 1px solid #1F2937;
      border-radius: 12px;
      padding: 24px;
      overflow: hidden;
    }

    /* ── Inputs ── */
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
    .loy-input:focus {
      border-color: #C9A227;
      box-shadow: 0 0 0 2px rgba(201,162,39,0.12);
    }
    .loy-input::placeholder { color: #374151; }
    .loy-input:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Buttons ── */
    .loy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 500;
      font-size: 12px;
      padding: 7px 13px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 150ms cubic-bezier(0.4,0,0.2,1);
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
    .loy-btn:hover  { transform: translateY(-1px); }
    .loy-btn:active { transform: scale(0.98); }
    .loy-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; pointer-events: none; }

    /* Gold primary */
    .loy-btn-gold {
      background: #C9A227;
      color: #000;
      font-weight: 600;
      box-shadow: 0 1px 8px rgba(201,162,39,0.2);
    }
    .loy-btn-gold:hover {
      background: #D4AD35;
      box-shadow: 0 4px 16px rgba(201,162,39,0.25);
    }

    /* Ghost */
    .loy-btn-ghost { background: rgba(255,255,255,0.04); color: #6B7280; border-color: #1F2937; }
    .loy-btn-ghost:hover { background: rgba(255,255,255,0.07); color: #D1D5DB; border-color: #374151; }

    /* WhatsApp */
    .loy-btn-green  { background: rgba(34,197,94,0.08);  color: #4ADE80; border-color: rgba(34,197,94,0.2); }
    .loy-btn-green:hover  { background: rgba(34,197,94,0.14); }

    /* Danger */
    .loy-btn-red    { background: rgba(239,68,68,0.08);  color: #F87171; border-color: rgba(239,68,68,0.2); }
    .loy-btn-red:hover    { background: rgba(239,68,68,0.14); }

    /* Yellow / edit */
    .loy-btn-yellow { background: rgba(245,158,11,0.08); color: #FCD34D; border-color: rgba(245,158,11,0.2); }
    .loy-btn-yellow:hover { background: rgba(245,158,11,0.14); }

    /* Blue */
    .loy-btn-blue   { background: rgba(59,130,246,0.08); color: #60A5FA; border-color: rgba(59,130,246,0.2); }
    .loy-btn-blue:hover   { background: rgba(59,130,246,0.14); }

    /* ── Badges ── */
    .loy-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      border: 1px solid transparent;
      font-family: 'Inter', system-ui, sans-serif;
      letter-spacing: 0.01em;
    }

    /* ── Filter tabs ── */
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

    /* ── Row button ── */
    .loy-row-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      transition: background 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-row-btn:hover { background: rgba(255,255,255,0.025); }

    /* ── Section label ── */
    .loy-sec {
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
      color: #6B7280; display: flex; align-items: center; gap: 5px;
      font-family: 'Inter', system-ui, sans-serif;
    }

    /* ── Ladder pills ── */
    .loy-tier-pill {
      font-size: 11px; font-weight: 500;
      padding: 3px 10px; border-radius: 4px;
      background: rgba(255,255,255,0.04); border: 1px solid #1F2937;
      color: #6B7280; letter-spacing: -0.01em;
      transition: border-color 150ms, background 150ms;
    }
    .loy-tier-pill:hover { background: rgba(255,255,255,0.06); border-color: #374151; }
    .loy-tier-pill strong { color: #C9A227; font-weight: 600; }

    /* ── Empty / loading ── */
    .loy-empty {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 60px 24px; gap: 10px;
    }

    /* ── Animations ── */
    @keyframes loyIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .loy-in { animation: loyIn 200ms cubic-bezier(0.4,0,0.2,1) forwards; }

    @keyframes loySpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .loy-spin { animation: loySpinSlow 1s linear infinite; }

    /* ── Search bar ── */
    .loy-search-wrap { position: relative; flex: 1; }
    .loy-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
    .loy-search-wrap .loy-input { padding-left: 36px; }

    /* ── Scrollbar ── */
    .loy ::-webkit-scrollbar { width: 3px; }
    .loy ::-webkit-scrollbar-track { background: transparent; }
    .loy ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }

    /* ── Gold number accent ── */
    .loy-num { font-family: 'Inter', system-ui, sans-serif; color: #C9A227; font-weight: 600; }
  `;
  document.head.appendChild(el);
}

// ── Discount ladder ─────────────────────────────────────────────────────────
const discountForVisits = (visits) => {
  if (visits <= 1) return 10;
  if (visits === 2) return 15;
  if (visits === 3) return 20;
  if (visits === 4) return 25;
  return 30;
};

// ── WhatsApp message ────────────────────────────────────────────────────────
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
      ? `🎁 You've unlocked a FREE ITEM on your next visit! 🥳\n`
      : `🔥 You've unlocked *${disc}% OFF* on your next order!\n`) +
    (expiryText ? `📅 Valid till: ${expiryText}\n` : '') +
    `\nShow this message at the counter to redeem.\n` +
    `\n👀 Keep visiting — your next reward is just around the corner!`
  );
};

// ══════════════════════════════════════════════════════════════════════════════
const LoyaltyDashboard = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: customers, loading } = useCollection(
    'loyaltyCustomers',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  const [search,       setSearch      ] = useState('');
  const [filterTier,   setFilterTier  ] = useState('all');
  const [showAddForm,  setShowAddForm  ] = useState(false);
  const [saving,       setSaving       ] = useState(false);
  const [markingId,    setMarkingId    ] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting,     setDeleting     ] = useState(false);

  const [newName,        setNewName       ] = useState('');
  const [newPhone,       setNewPhone      ] = useState('');
  const [validityDays,   setValidityDays  ] = useState('');
  const [customDiscount, setCustomDiscount] = useState('');

  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editDiscount,      setEditDiscount      ] = useState('');
  const [editValidity,      setEditValidity      ] = useState('');

  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const toggleCard = (id) => setExpandedCustomerId(prev => prev === id ? null : id);

  const filtered = useMemo(() => {
    if (!customers) return [];
    let list = customers;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
    if (filterTier === 'new')    list = list.filter(c => (c.visits || 0) === 1);
    if (filterTier === 'silver') list = list.filter(c => (c.visits || 0) >= 2 && (c.visits || 0) <= 3);
    if (filterTier === 'gold')   list = list.filter(c => (c.visits || 0) >= 4);
    return list;
  }, [customers, search, filterTier]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalCustomers = customers?.length || 0;
  const totalVisits    = customers?.reduce((s, c) => s + (c.visits || 0), 0) || 0;
  const loyalCustomers = customers?.filter(c => (c.visits || 0) >= 3).length || 0;
  const repeatedVisits = customers?.reduce((s, c) => s + ((c.visits || 0) > 1 ? (c.visits - 1) : 0), 0) || 0;

  // ── Add new customer ──────────────────────────────────────────────────────
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return; }
    const already = customers?.find(c => c.phone === newPhone.trim());
    if (already) { toast.error('A customer with this phone already exists'); return; }
    setSaving(true);
    try {
      const days          = Number(validityDays) || 0;
      const expiryDate    = days > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + days); return d; })() : null;
      const discountToUse = customDiscount ? Number(customDiscount) : 10;
      const ref = await addDoc(collection(db, 'loyaltyCustomers'), {
        cafeId, name: newName.trim(), phone: newPhone.trim(),
        visits: 1, currentDiscount: discountToUse,
        validityDays: days, expiryDate,
        createdAt: serverTimestamp(), lastVisit: serverTimestamp(),
      });
      console.log('[Loyalty] ✅ Customer saved, docId:', ref.id);
      toast.success(`⭐ ${newName.trim()} added to loyalty program`);
      setNewName(''); setNewPhone(''); setValidityDays(''); setCustomDiscount('');
      setShowAddForm(false);
    } catch (err) {
      console.error('[Loyalty] ❌ addDoc failed:', err);
      toast.error(`Failed to add customer: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Mark visit ────────────────────────────────────────────────────────────
  const handleMarkVisit = async (customer) => {
    setMarkingId(customer.id);
    try {
      const newVisits      = (customer.visits || 0) + 1;
      const newDiscount    = discountForVisits(newVisits);
      const daysToUse      = Number(customer.validityDays) || 0;
      const newExpiry      = daysToUse > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + daysToUse); return d; })() : null;
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        visits: newVisits, currentDiscount: newDiscount,
        lastVisit: serverTimestamp(), validityDays: daysToUse,
        ...(newExpiry !== null && { expiryDate: newExpiry }),
      });
      const msg = newDiscount >= 30
        ? `🎁 ${customer.name} unlocked a FREE ITEM! (${newVisits} visits)`
        : `✅ Visit ${newVisits} marked — ${customer.name} now gets ${newDiscount}% OFF`;
      toast.success(msg);
    } catch (err) {
      console.error('[Loyalty] mark visit error:', err);
      toast.error('Failed to update visit');
    } finally {
      setMarkingId(null);
    }
  };

  // ── Undo visit ────────────────────────────────────────────────────────────
  const handleUndoVisit = async (customer) => {
    if ((customer.visits || 1) <= 1) { toast.error('Cannot reduce below 1 visit'); return; }
    setMarkingId(customer.id);
    try {
      const newVisits   = customer.visits - 1;
      const newDiscount = discountForVisits(newVisits);
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), { visits: newVisits, currentDiscount: newDiscount });
      toast.success(`↩️ Visit undone — ${customer.name} now at visit ${newVisits} (${newDiscount}% OFF)`);
    } catch (err) {
      console.error('[Loyalty] undoVisit failed:', err);
      toast.error(`Undo failed: ${err.message || 'Unknown error'}`);
    } finally {
      setMarkingId(null);
    }
  };

  // ── Delete customer ───────────────────────────────────────────────────────
  const handleDeleteCustomer = async (customer) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'loyaltyCustomers', customer.id));
      toast.success(`🗑️ ${customer.name} removed from loyalty program`);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('[Loyalty] deleteDoc failed:', err);
      toast.error(`Delete failed: ${err.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── Save inline edit ──────────────────────────────────────────────────────
  const handleSaveEdit = async (customer) => {
    try {
      const newDisc = editDiscount ? Number(editDiscount) : customer.currentDiscount;
      const newDays = editValidity ? Number(editValidity) : (customer.validityDays || 0);
      const expiry  = newDays > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + newDays); return d; })() : null;
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        currentDiscount: newDisc, validityDays: newDays,
        ...(expiry !== null && { expiryDate: expiry }),
      });
      toast.success(`✅ ${customer.name} updated — ${newDisc}% OFF${newDays ? `, valid ${newDays}d` : ''}`);
      setEditingCustomerId(null); setEditDiscount(''); setEditValidity('');
    } catch (err) {
      console.error('[Loyalty] saveEdit failed:', err);
      toast.error(`Update failed: ${err.message || 'Unknown error'}`);
    }
  };

  // ── Send WhatsApp ─────────────────────────────────────────────────────────
  const handleSendWA = (customer) => {
    if (!customer.phone) { toast.error('No phone number for this customer'); return; }
    const digits = customer.phone.replace(/\D/g, '');
    const waNum  = digits.length === 10 ? `91${digits}` : digits;
    const msg    = buildWAMessage(customer);
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Tier badge helper ─────────────────────────────────────────────────────
  const getTierBadge = (visits, disc) => {
    const isFree = disc >= 30;
    if (isFree)      return { emoji: '🎁', label: 'Free Item', bg: 'rgba(16,185,129,0.1)',  color: '#4ADE80', bd: 'rgba(16,185,129,0.25)' };
    if (disc >= 25)  return { emoji: '👑', label: `${disc}% OFF`, bg: 'rgba(201,162,39,0.12)', color: '#C9A227', bd: 'rgba(201,162,39,0.3)' };
    if (disc >= 20)  return { emoji: '⭐', label: `${disc}% OFF`, bg: 'rgba(201,162,39,0.08)', color: '#C9A227', bd: 'rgba(201,162,39,0.2)' };
    return               { emoji: '🌟', label: `${disc}% OFF`, bg: 'rgba(201,162,39,0.06)', color: '#C9A227', bd: 'rgba(201,162,39,0.15)' };
  };

  return (
    <div className="loy space-y-5">

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { emoji: '👥', label: 'Members',       value: totalCustomers, color: '#C9A227' },
          { emoji: '📈', label: 'Total Visits',  value: totalVisits,    color: '#60A5FA' },
          { emoji: '🏆', label: 'Loyal (3+)',    value: loyalCustomers, color: '#4ADE80' },
          { emoji: '🔄', label: 'Repeat Visits', value: repeatedVisits, color: '#A78BFA' },
        ].map(({ emoji, label, value, color }) => (
          <div key={label} className="loy-stat" style={{ borderTop: `2px solid ${color}` }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-base">{emoji}</span>
              <span className="loy-sec" style={{ letterSpacing: '0.06em', fontSize: 10 }}>{label}</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#F9FAFB', letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Search + Add ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="loy-search-wrap">
          <Search size={13} className="loy-search-icon" style={{ color: '#374151' }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by name or phone…"
            className="loy-input"
          />
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className={`loy-btn ${showAddForm ? 'loy-btn-ghost' : 'loy-btn-gold'}`}
          style={{ paddingLeft: 16, paddingRight: 16 }}
          data-testid="add-loyalty-customer-btn"
        >
          {showAddForm ? <><X size={13} />Cancel</> : <><UserPlus size={13} />➕ Add Customer</>}
        </button>
      </div>

      {/* ── Tier filter tabs ──────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all',    label: '🌐 All' },
          { key: 'new',    label: '🌟 New (1 visit)' },
          { key: 'silver', label: '⭐ Silver (2–3)' },
          { key: 'gold',   label: '👑 Gold (4+)' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterTier(key)}
            className={`loy-tab ${filterTier === key ? 'loy-tab-on' : 'loy-tab-off'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Add customer form ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.4,0,0.2,1] }}
            className="loy-form-card"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🎟️</span>
                <div>
                  <h3 className="loy-title text-white text-base">New Loyalty Customer</h3>
                  <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Enrol a customer in the rewards program</p>
                </div>
              </div>
              <button onClick={() => setShowAddForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#1F2937', border: '1px solid #374151' }}>
                <X size={13} style={{ color: '#9CA3AF' }} />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="loy-sec mb-1.5 block">👤 Customer Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma" className="loy-input" disabled={saving}
                    data-testid="loyalty-name-input" />
                </div>
                <div>
                  <label className="loy-sec mb-1.5 block">📱 Phone Number</label>
                  <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 9876543210" className="loy-input" disabled={saving}
                    data-testid="loyalty-phone-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="loy-sec mb-1.5 block">📅 Validity (days) <span style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, color: '#374151' }}>optional</span></label>
                  <input type="number" min="0" value={validityDays} onChange={e => setValidityDays(e.target.value)}
                    placeholder="e.g. 30" className="loy-input" disabled={saving}
                    data-testid="loyalty-validity-input" />
                </div>
                <div>
                  <label className="loy-sec mb-1.5 block">💎 Custom Discount (%) <span style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, color: '#374151' }}>optional</span></label>
                  <input type="number" min="0" max="100" value={customDiscount} onChange={e => setCustomDiscount(e.target.value)}
                    placeholder="Default: 10%" className="loy-input" disabled={saving}
                    data-testid="loyalty-discount-input" />
                </div>
              </div>
              <p className="text-xs" style={{ color: '#6B7280' }}>
                🌟 First visit is recorded automatically. Customer starts at <span style={{ color: '#C9A227', fontWeight: 600 }}>10% off</span>.
              </p>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="loy-btn loy-btn-gold" data-testid="loyalty-submit-btn">
                  {saving
                    ? <><RefreshCw size={12} className="loy-spin" />Adding…</>
                    : <><UserPlus size={12} />➕ Add Customer</>}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="loy-btn loy-btn-ghost">Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reward tiers ─────────────────────────────────────────────────── */}
      <div>
        <p className="loy-sec mb-2">🏅 Reward Tiers</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: '1 visit',   disc: '10%' },
            { label: '2 visits',  disc: '15%' },
            { label: '3 visits',  disc: '20%' },
            { label: '4 visits',  disc: '25%' },
            { label: '5+ visits', disc: '🎁 Free Item' },
          ].map(({ label, disc }) => (
            <span key={label} className="loy-tier-pill">
              {label} <span style={{ color: '#374151' }}>→</span> <strong>{disc}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* ── Customer list ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="loy-card">
          <div className="loy-empty">
            <div className="text-4xl animate-bounce">⭐</div>
            <p className="text-sm" style={{ color: '#6B7280' }}>Loading loyalty members…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="loy-card">
          <div className="loy-empty">
            <div className="text-4xl mb-1">🫙</div>
            <p className="text-sm font-medium" style={{ color: '#6B7280' }}>
              {search ? 'No customers match your search.' : 'No loyalty customers yet.'}
            </p>
            {!search && <p className="text-xs" style={{ color: '#4B5563' }}>Add your first customer to get started.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer, ci) => {
            const disc    = customer.currentDiscount || 10;
            const visits  = customer.visits || 0;
            const tier    = getTierBadge(visits, disc);
            const marking = markingId === customer.id;
            const isOpen  = expandedCustomerId === customer.id;

            return (
              <motion.div
                key={customer.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.4,0,0.2,1], delay: Math.min(ci * 30, 300) / 1000 }}
                className="loy-card loy-in"
                style={{ animationDelay: `${Math.min(ci * 30, 300)}ms`, animationFillMode: 'both' }}
                data-testid={`loyalty-customer-${customer.id}`}
              >
                {/* Top status bar */}
                <div style={{ height: 2, background: disc >= 30 ? 'linear-gradient(90deg,#4ADE80,transparent)' : disc >= 25 ? 'linear-gradient(90deg,#C9A227,transparent)' : 'linear-gradient(90deg,rgba(201,162,39,0.5),transparent)' }} />

                {/* Collapsed header */}
                <button
                  onClick={() => toggleCard(customer.id)}
                  className="loy-row-btn"
                  aria-expanded={isOpen}
                  data-testid={`loyalty-toggle-${customer.id}`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#1F2937', border: '1px solid #374151' }}>
                    <User size={16} style={{ color: '#6B7280' }} />
                  </div>

                  {/* Name + phone */}
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm truncate" style={{ letterSpacing: '-0.01em' }}>{customer.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Phone size={10} style={{ color: '#374151' }} />
                      <p className="text-xs truncate" style={{ color: '#6B7280' }}>{customer.phone}</p>
                    </div>
                  </div>

                  {/* Visit count */}
                  <div className="loy-badge flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937' }}>
                    <span className="text-xs">📊</span>
                    <span className="text-white font-bold text-xs">{visits}</span>
                    <span className="text-xs hidden sm:inline" style={{ color: '#6B7280' }}>visit{visits !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Discount badge */}
                  <div className="loy-badge flex-shrink-0" style={{ background: tier.bg, border: `1px solid ${tier.bd}` }}>
                    <span className="text-xs">{tier.emoji}</span>
                    <span className="text-xs font-semibold" style={{ color: tier.color }}>{tier.label}</span>
                  </div>

                  <ChevronDown
                    size={14}
                    className="flex-shrink-0"
                    style={{ color: '#374151', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)' }}
                  />
                </button>

                {/* Expanded body */}
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.2, ease: [0.4,0,0.2,1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="px-4 pb-5 pt-3 space-y-3" style={{ borderTop: '1px solid #1F2937' }}>

                    {/* Expiry */}
                    {customer.expiryDate && (() => {
                      const exp = customer.expiryDate?.toDate ? customer.expiryDate.toDate() : new Date(customer.expiryDate);
                      const isExpired = exp < new Date();
                      return (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                          style={{
                            background: isExpired ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                            border: isExpired ? '1px solid rgba(239,68,68,0.2)' : '1px solid #1F2937',
                          }}>
                          <Calendar size={11} style={{ color: isExpired ? '#F87171' : '#6B7280' }} />
                          <span className="text-xs" style={{ color: isExpired ? '#F87171' : '#6B7280' }}>
                            {isExpired ? '⚠️ Expired ' : '📅 Valid till '}
                            {exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleMarkVisit(customer)} disabled={marking}
                        className="loy-btn loy-btn-gold"
                        data-testid={`mark-visit-${customer.id}`}
                      >
                        {marking ? <><RefreshCw size={12} className="loy-spin" />Marking…</> : <>📈 Mark Visit</>}
                      </button>
                      <button onClick={() => handleSendWA(customer)} className="loy-btn loy-btn-green" data-testid={`wa-loyalty-${customer.id}`}>
                        <MessageSquare size={12} />💬 WhatsApp
                      </button>
                      <button
                        onClick={() => handleUndoVisit(customer)}
                        disabled={marking || (customer.visits || 1) <= 1}
                        className="loy-btn loy-btn-ghost"
                        data-testid={`undo-visit-${customer.id}`}
                        title="Undo last visit"
                      >
                        <Undo2 size={12} />↩️ Undo
                      </button>
                      <button
                        onClick={() => {
                          if (editingCustomerId === customer.id) {
                            setEditingCustomerId(null); setEditDiscount(''); setEditValidity('');
                          } else {
                            setEditingCustomerId(customer.id);
                            setEditDiscount(String(customer.currentDiscount || ''));
                            setEditValidity(String(customer.validityDays    || ''));
                          }
                        }}
                        className={`loy-btn ${editingCustomerId === customer.id ? 'loy-btn-yellow' : 'loy-btn-ghost'}`}
                        data-testid={`edit-loyalty-${customer.id}`}
                      >
                        <Pencil size={12} />✏️ {editingCustomerId === customer.id ? 'Cancel' : 'Edit'}
                      </button>

                      {/* Delete with confirm */}
                      {deleteConfirmId === customer.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteCustomer(customer)} disabled={deleting}
                            className="loy-btn" style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                            data-testid={`delete-confirm-${customer.id}`}
                          >
                            {deleting ? '⏳ Removing…' : '🗑️ Yes, Remove'}
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="loy-btn loy-btn-ghost">✗ Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(customer.id)}
                          className="loy-btn loy-btn-ghost"
                          data-testid={`delete-loyalty-${customer.id}`}
                          style={{ color: '#5a4a1a' }}
                        >
                          <Trash2 size={12} />🗑️ Delete
                        </button>
                      )}
                    </div>

                    {/* Inline edit panel */}
                    {editingCustomerId === customer.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="pt-3 space-y-3"
                        style={{ borderTop: '1px solid #1F2937' }}
                        data-testid={`edit-panel-${customer.id}`}
                      >
                        <p className="loy-sec">✏️ Edit Loyalty Card</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="loy-sec mb-1 block">💎 Discount (%)</label>
                            <input type="number" min="0" max="100" value={editDiscount}
                              onChange={e => setEditDiscount(e.target.value)}
                              placeholder={`Current: ${customer.currentDiscount || 10}%`}
                              className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                              data-testid={`edit-discount-${customer.id}`} />
                          </div>
                          <div>
                            <label className="loy-sec mb-1 block">📅 Validity (days)</label>
                            <input type="number" min="0" value={editValidity}
                              onChange={e => setEditValidity(e.target.value)}
                              placeholder={`Current: ${customer.validityDays || 0}d`}
                              className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                              data-testid={`edit-validity-${customer.id}`} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEdit(customer)} className="loy-btn loy-btn-gold" data-testid={`save-edit-${customer.id}`}>
                            <Check size={12} />✅ Save Changes
                          </button>
                          <button onClick={() => handleSendWA(customer)} className="loy-btn loy-btn-green" data-testid={`resend-wa-${customer.id}`}>
                            <MessageSquare size={12} />💬 Resend WhatsApp
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 py-3" style={{ borderTop: '1px solid #1F2937' }}>
        <span>⭐</span>
        <p className="text-xs font-bold" style={{ color: '#4B5563' }}>
          {totalCustomers} member{totalCustomers !== 1 ? 's' : ''} · {totalVisits} total visits
        </p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9A227' }} />
      </div>

      {/* ── Google Review Link setting ───────────────────────────────────────── */}
      <GoogleReviewSettings />
    </div>
  );
};

export default LoyaltyDashboard;
