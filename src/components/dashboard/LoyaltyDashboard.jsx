/**
 * LoyaltyDashboard.jsx
 *
 * Complete loyalty system for SmartCafé OS.
 * Firestore collection: loyaltyCustomers
 *
 * UI UPGRADE: Café-vibe premium aesthetic. Zero logic changes.
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
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useCollection } from '../../hooks/useFirestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Search, UserPlus, Star, MessageSquare, Phone, User,
  Award, TrendingUp, RefreshCw, Gift, Undo2, Trash2, Repeat, Calendar, Pencil, Check, ChevronDown,
} from 'lucide-react';
import GoogleReviewSettings from './GoogleReviewSettings';

// ── Premium Café OS CSS — Loyalty Dashboard ──────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('loy-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'loy-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700&display=swap');

    /* ── COLOR TOKENS (matching QR Code screen)
       bg:          #0d0d0b  (near-black, warm tint)
       card:        #161610  (dark olive-black)
       card-raised: #1c1c14  (warm dark, like the How-to card)
       accent:      #C9A227  (amber gold — only for CTAs, highlights)
       border:      rgba(201,162,39,0.12)  soft gold border on cards
       text-primary:#e8e0cc  (warm off-white)
       text-muted:  #6b6450  (warm muted brown-grey)
       text-dim:    #3d3828  (very dim, placeholders)
    ── */

    .loy *, .loy *::before, .loy *::after { box-sizing: border-box; }

    .loy {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #e8e0cc;
      letter-spacing: -0.012em;
      line-height: 1.55;
      animation: loyPageIn 0.32s cubic-bezier(0.4,0,0.2,1) both;
    }
    @keyframes loyPageIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Typography ── */
    .loy-title {
      font-family: 'Inter', system-ui, sans-serif !important;
      font-weight: 600;
      letter-spacing: -0.024em;
      color: #f0e8d5;
    }
    .loy-label {
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6b6450;
      display: block;
    }
    .loy-section-title {
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6b6450;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Stat Cards — top-bordered like QR Code buttons ── */
    .loy-stat-card {
      background: #161610;
      border: 1px solid rgba(201,162,39,0.1);
      border-radius: 12px;
      padding: 18px 16px;
      transition:
        border-color 200ms cubic-bezier(0.4,0,0.2,1),
        box-shadow   200ms cubic-bezier(0.4,0,0.2,1),
        transform    200ms cubic-bezier(0.4,0,0.2,1);
      opacity: 0;
      animation: loyFadeUp 0.35s cubic-bezier(0.4,0,0.2,1) forwards;
    }
    .loy-stat-card:nth-child(1) { animation-delay: 0.04s; }
    .loy-stat-card:nth-child(2) { animation-delay: 0.09s; }
    .loy-stat-card:nth-child(3) { animation-delay: 0.14s; }
    .loy-stat-card:nth-child(4) { animation-delay: 0.19s; }
    .loy-stat-card:hover {
      border-color: rgba(201,162,39,0.28);
      box-shadow: 0 6px 28px rgba(0,0,0,0.45), 0 0 0 0 rgba(201,162,39,0);
      transform: translateY(-2px);
    }

    /* ── Main Cards — like the main card in QR screen ── */
    .loy-card {
      background: #161610;
      border: 1px solid rgba(201,162,39,0.1);
      border-radius: 12px;
      overflow: hidden;
      transition:
        border-color 200ms cubic-bezier(0.4,0,0.2,1),
        box-shadow   200ms cubic-bezier(0.4,0,0.2,1),
        transform    200ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-card:hover {
      border-color: rgba(201,162,39,0.22);
      box-shadow: 0 6px 28px rgba(0,0,0,0.4);
      transform: translateY(-1px);
    }

    /* ── Form card — slightly raised, like How-to card ── */
    .loy-form-card {
      background: #1c1c14;
      border: 1px solid rgba(201,162,39,0.14);
      border-radius: 12px;
      overflow: hidden;
    }

    /* ── Inputs ── */
    .loy-input {
      width: 100%;
      background: #0d0d0b;
      border: 1px solid rgba(201,162,39,0.12);
      border-radius: 8px;
      color: #e8e0cc;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 400;
      font-family: 'Inter', system-ui, sans-serif;
      letter-spacing: -0.01em;
      outline: none;
      transition:
        border-color 150ms cubic-bezier(0.4,0,0.2,1),
        box-shadow   150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-input:focus {
      border-color: rgba(201,162,39,0.55);
      box-shadow: 0 0 0 3px rgba(201,162,39,0.07);
    }
    .loy-input::placeholder { color: #3d3828; }
    .loy-input:disabled { opacity: 0.45; cursor: not-allowed; }

    /* ── Buttons base ── */
    .loy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 500;
      font-size: 13px;
      letter-spacing: -0.008em;
      padding: 8px 15px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 150ms cubic-bezier(0.4,0,0.2,1);
      white-space: nowrap;
    }
    .loy-btn:hover { transform: translateY(-1px); }
    .loy-btn:active { transform: scale(0.97); }
    .loy-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

    /* Primary — solid gold, like Download QR button */
    .loy-btn-orange {
      background: #C9A227;
      color: #0d0d0b;
      font-weight: 600;
      border-color: #C9A227;
    }
    .loy-btn-orange:hover {
      background: #d9af2d;
      box-shadow: 0 4px 18px rgba(201,162,39,0.3);
    }
    .loy-btn-orange:active { box-shadow: none; }

    /* Outlined gold — like Print QR button */
    .loy-btn-ghost {
      background: transparent;
      color: #6b6450;
      border-color: rgba(201,162,39,0.18);
    }
    .loy-btn-ghost:hover {
      background: rgba(201,162,39,0.06);
      color: #C9A227;
      border-color: rgba(201,162,39,0.3);
    }

    /* WhatsApp */
    .loy-btn-green {
      background: rgba(34,197,94,0.07);
      color: #4ade80;
      border-color: rgba(34,197,94,0.18);
    }
    .loy-btn-green:hover {
      background: rgba(34,197,94,0.12);
      box-shadow: 0 0 14px rgba(34,197,94,0.1);
    }

    /* Danger */
    .loy-btn-red {
      background: rgba(239,68,68,0.07);
      color: #f87171;
      border-color: rgba(239,68,68,0.18);
    }
    .loy-btn-red:hover {
      background: rgba(239,68,68,0.12);
      box-shadow: 0 0 14px rgba(239,68,68,0.1);
    }

    /* Edit — gold outline */
    .loy-btn-gold {
      background: rgba(201,162,39,0.08);
      color: #C9A227;
      border-color: rgba(201,162,39,0.25);
    }
    .loy-btn-gold:hover {
      background: rgba(201,162,39,0.14);
      box-shadow: 0 0 14px rgba(201,162,39,0.12);
    }

    /* ── Customer row ── */
    .loy-row-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 15px 16px;
      text-align: left;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: background 150ms cubic-bezier(0.4,0,0.2,1);
    }
    .loy-row-btn:hover { background: rgba(201,162,39,0.03); }

    /* ── Pills ── */
    .loy-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }

    /* ── Reward tier pills — like "How to Use" items ── */
    .loy-ladder-pill {
      font-size: 12px;
      font-weight: 400;
      padding: 5px 12px;
      border-radius: 6px;
      background: rgba(201,162,39,0.05);
      border: 1px solid rgba(201,162,39,0.1);
      color: #6b6450;
      letter-spacing: -0.01em;
      transition: border-color 150ms ease, background 150ms ease;
    }
    .loy-ladder-pill:hover {
      background: rgba(201,162,39,0.09);
      border-color: rgba(201,162,39,0.2);
    }
    .loy-ladder-pill strong { color: #C9A227; font-weight: 600; }

    /* ── Avatar ── */
    .loy-avatar {
      width: 36px; height: 36px;
      border-radius: 8px;
      background: #1c1c14;
      border: 1px solid rgba(201,162,39,0.12);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    /* ── Icon wrapper ── */
    .loy-icon-wrap {
      width: 36px; height: 36px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    /* ── Empty / Loading ── */
    .loy-empty {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 64px 24px; gap: 12px;
    }
    .loy-empty-icon {
      width: 52px; height: 52px;
      border-radius: 12px;
      background: rgba(201,162,39,0.05);
      border: 1px solid rgba(201,162,39,0.1);
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Search ── */
    .loy-search-wrap { position: relative; flex: 1; }
    .loy-search-icon {
      position: absolute; left: 13px; top: 50%;
      transform: translateY(-50%); pointer-events: none;
    }
    .loy-search-wrap .loy-input { padding-left: 38px; }

    /* ── Animations ── */
    @keyframes loyFadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .loy-in { animation: loyFadeUp 0.26s cubic-bezier(0.4,0,0.2,1) forwards; }

    @keyframes loySpinSlow {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .loy-spin { animation: loySpinSlow 1.1s linear infinite; }

    /* ── Scrollbar ── */
    .loy ::-webkit-scrollbar { width: 3px; }
    .loy ::-webkit-scrollbar-track { background: transparent; }
    .loy ::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.15); border-radius: 2px; }
  \`;
  document.head.appendChild(el);
}


// ── Discount ladder ────────────────────────────────────────────────────────────
const discountForVisits = (visits) => {
  if (visits <= 1) return 10;
  if (visits === 2) return 15;
  if (visits === 3) return 20;
  if (visits === 4) return 25;
  return 30;
};

// ── WhatsApp message ───────────────────────────────────────────────────────────
const buildWAMessage = (customer) => {
  const disc = customer.currentDiscount;
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
  const [showAddForm,  setShowAddForm  ] = useState(false);
  const [saving,       setSaving       ] = useState(false);
  const [markingId,    setMarkingId    ] = useState(null);

  const [newName,        setNewName       ] = useState('');
  const [newPhone,       setNewPhone      ] = useState('');
  const [validityDays,   setValidityDays  ] = useState('');
  const [customDiscount, setCustomDiscount] = useState('');

  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editDiscount,      setEditDiscount     ] = useState('');
  const [editValidity,      setEditValidity     ] = useState('');

  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const toggleCard = (id) => setExpandedCustomerId(prev => prev === id ? null : id);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
  }, [customers, search]);

  // ── Add new customer ──────────────────────────────────────────────────────
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    console.log('[Loyalty] DB instance:', db);
    console.log('[Loyalty] cafeId:', cafeId);
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return; }
    const already = customers?.find(c => c.phone === newPhone.trim());
    if (already) { toast.error('A customer with this phone number already exists'); return; }
    setSaving(true);
    try {
      console.log('[Loyalty] Attempting addDoc to loyaltyCustomers…');
      const days = Number(validityDays) || 0;
      const expiryDate = days > 0
        ? (() => { const d = new Date(); d.setDate(d.getDate() + days); return d; })()
        : null;
      const discountToUse = customDiscount ? Number(customDiscount) : 10;
      const ref = await addDoc(collection(db, 'loyaltyCustomers'), {
        cafeId, name: newName.trim(), phone: newPhone.trim(),
        visits: 1, currentDiscount: discountToUse,
        validityDays: days, expiryDate,
        createdAt: serverTimestamp(), lastVisit: serverTimestamp(),
      });
      console.log('[Loyalty] ✅ Customer saved, docId:', ref.id);
      toast.success(`${newName.trim()} added to loyalty program ✓`);
      setNewName(''); setNewPhone(''); setValidityDays(''); setCustomDiscount('');
      setShowAddForm(false);
    } catch (err) {
      console.error('[Loyalty] ❌ addDoc failed:', err.code, err.message, err);
      toast.error(`Failed to add customer: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Mark visit ────────────────────────────────────────────────────────────
  const handleMarkVisit = async (customer) => {
    setMarkingId(customer.id);
    try {
      const newVisits   = (customer.visits || 0) + 1;
      const newDiscount = discountForVisits(newVisits);
      console.log('[Loyalty] Marking visit for', customer.name, '→ visits:', newVisits, 'discount:', newDiscount);
      const discountToUse = customDiscount ? Number(customDiscount) : newDiscount;
      const daysToUse = Number(validityDays) || Number(customer.validityDays) || 0;
      const newExpiry = daysToUse > 0
        ? (() => { const d = new Date(); d.setDate(d.getDate() + daysToUse); return d; })()
        : null;
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        visits: newVisits, currentDiscount: discountToUse,
        lastVisit: serverTimestamp(), validityDays: daysToUse,
        ...(newExpiry !== null && { expiryDate: newExpiry }),
      });
      const msg = newDiscount >= 30
        ? `🎁 ${customer.name} unlocked a FREE ITEM! (${newVisits} visits)`
        : `✓ Visit ${newVisits} marked — ${customer.name} now gets ${newDiscount}% OFF`;
      toast.success(msg);
    } catch (err) {
      console.error('[LoyaltyDashboard] mark visit error:', err);
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
      console.log('[Loyalty] Undoing visit for', customer.name, '→ visits:', newVisits);
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), { visits: newVisits, currentDiscount: newDiscount });
      toast.success(`↩ Visit undone — ${customer.name} now at visit ${newVisits} (${newDiscount}% OFF)`);
    } catch (err) {
      console.error('[Loyalty] ❌ undoVisit failed:', err.code, err.message, err);
      toast.error(`Undo failed: ${err.message || 'Unknown error'}`);
    } finally {
      setMarkingId(null);
    }
  };

  // ── Delete customer ───────────────────────────────────────────────────────
  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`Delete ${customer.name} permanently from the loyalty program?`)) return;
    try {
      console.log('[Loyalty] Deleting customer:', customer.id, customer.name);
      await deleteDoc(doc(db, 'loyaltyCustomers', customer.id));
      toast.success(`${customer.name} removed from loyalty program`);
    } catch (err) {
      console.error('[Loyalty] ❌ deleteDoc failed:', err.code, err.message, err);
      toast.error(`Delete failed: ${err.message || 'Unknown error'}`);
    }
  };

  // ── Save inline edit ──────────────────────────────────────────────────────
  const handleSaveEdit = async (customer) => {
    try {
      const newDisc = editDiscount ? Number(editDiscount) : customer.currentDiscount;
      const newDays = editValidity ? Number(editValidity) : (customer.validityDays || 0);
      const expiry  = newDays > 0
        ? (() => { const d = new Date(); d.setDate(d.getDate() + newDays); return d; })()
        : null;
      console.log('[Loyalty] Saving edit for', customer.name, '→ discount:', newDisc, 'validityDays:', newDays);
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        currentDiscount: newDisc, validityDays: newDays,
        ...(expiry !== null && { expiryDate: expiry }),
      });
      toast.success(`${customer.name} updated ✓ — ${newDisc}% OFF${newDays ? `, valid ${newDays}d` : ''}`);
      setEditingCustomerId(null); setEditDiscount(''); setEditValidity('');
    } catch (err) {
      console.error('[Loyalty] ❌ saveEdit failed:', err.code, err.message, err);
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

  const totalCustomers = customers?.length || 0;
  const totalVisits    = customers?.reduce((s, c) => s + (c.visits || 0), 0) || 0;
  const loyalCustomers = customers?.filter(c => (c.visits || 0) >= 3).length || 0;
  const repeatedVisits = customers?.reduce((s, c) => s + ((c.visits || 0) > 1 ? (c.visits - 1) : 0), 0) || 0;

  return (
    <div className="loy space-y-6">

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Members',       value: totalCustomers, Icon: User,       color: '#C9A227' },
          { label: 'Total Visits',  value: totalVisits,    Icon: TrendingUp, color: '#C9A227' },
          { label: 'Loyal (3+)',    value: loyalCustomers, Icon: Award,      color: '#b5893a' },
          { label: 'Repeat Visits', value: repeatedVisits, Icon: Repeat,     color: '#8a7040' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="loy-stat-card"
            style={{ borderTop: `2px solid ${color}`, paddingTop: 18 }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="loy-icon-wrap" style={{ background: color + '12', width: 30, height: 30, borderRadius: 8 }}>
                <Icon size={14} style={{ color }} />
              </div>
              <span className="loy-label" style={{ letterSpacing: '0.05em', fontSize: 10 }}>{label}</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 600, color: '#f0e8d5', letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Search + Add ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="loy-search-wrap">
          <Search size={14} className="loy-search-icon" style={{ color: '#4a4230' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="loy-input" />
        </div>
        <button onClick={() => setShowAddForm(v => !v)}
          className="loy-btn loy-btn-orange"
          style={{ paddingLeft: 18, paddingRight: 18 }}
          data-testid="add-loyalty-customer-btn">
          <UserPlus size={14} />
          Add Customer
        </button>
      </div>

      {/* ── Add customer form ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.4,0,0.2,1] }}
            className="loy-form-card p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <div className="loy-icon-wrap" style={{ background: 'rgba(201,162,39,0.09)', border: '1px solid rgba(201,162,39,0.15)' }}>
                <UserPlus size={15} style={{ color: '#C9A227' }} />
              </div>
              <div>
                <h3 className="loy-title text-base">New Loyalty Customer</h3>
                <p className="text-xs mt-0.5" style={{ color: '#6b6450' }}>Fill in the details below to enrol a customer</p>
              </div>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="loy-label block mb-1.5">Customer Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma" className="loy-input" disabled={saving} data-testid="loyalty-name-input" />
                </div>
                <div>
                  <label className="loy-label block mb-1.5">Phone Number</label>
                  <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 9876543210" className="loy-input" disabled={saving} data-testid="loyalty-phone-input" />
                </div>
              </div>
              <div>
                <label className="loy-label block mb-1.5">
                  Validity (days) <span style={{ color: '#4a4230', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>(optional)</span>
                </label>
                <input type="number" min="0" value={validityDays} onChange={e => setValidityDays(e.target.value)}
                  placeholder="e.g. 30" className="loy-input" disabled={saving} data-testid="loyalty-validity-input" />
              </div>
              <div>
                <label className="loy-label block mb-1.5">
                  Custom Discount (%) <span style={{ color: '#4a4230', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>(optional — overrides default 10%)</span>
                </label>
                <input type="number" min="0" max="100" value={customDiscount} onChange={e => setCustomDiscount(e.target.value)}
                  placeholder="e.g. 20" className="loy-input" disabled={saving} data-testid="loyalty-discount-input" />
              </div>
              <p className="text-xs" style={{ color: '#6b6450' }}>
                First visit is recorded automatically. Customer starts at <span style={{ color: '#C9A227' }}>10% off</span>.
              </p>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="loy-btn loy-btn-orange disabled:opacity-50" data-testid="loyalty-submit-btn">
                  {saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Adding…</> : <><UserPlus className="w-4 h-4" />Add Customer</>}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="loy-btn loy-btn-ghost">Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Discount ladder ────────────────────────────────────────────────── */}
      <div>
      <p className="loy-label mb-2" style={{ fontSize: 10, letterSpacing: '0.08em' }}>Reward Tiers</p>
      <div className="flex gap-2 flex-wrap">
        {[
          { label: '1 visit',   disc: '10%' },
          { label: '2 visits',  disc: '15%' },
          { label: '3 visits',  disc: '20%' },
          { label: '4 visits',  disc: '25%' },
          { label: '5+ visits', disc: '30% / Free Item' },
        ].map(({ label, disc }) => (
          <span key={label} className="loy-ladder-pill">
            {label} <span style={{ color: '#4a4230' }}>→</span> <strong>{disc}</strong>
          </span>
        ))}
      </div>
      </div>

      {/* ── Customer list ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="loy-empty">
          <RefreshCw size={18} className="loy-spin" style={{ color: '#4a4230' }} />
          <p className="text-sm" style={{ color: '#6b6450' }}>Loading customers…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="loy-card">
          <div className="loy-empty">
            <div className="loy-empty-icon">
              <User size={20} style={{ color: '#4a4230' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#a09070' }}>
              {search ? 'No customers match your search.' : 'No loyalty customers yet.'}
            </p>
            {!search && <p className="text-xs" style={{ color: '#6b6450' }}>Add your first customer to get started.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-2" style={{ gap: 0 }}>
          {filtered.map(customer => {
            const disc    = customer.currentDiscount || 10;
            const visits  = customer.visits || 0;
            const isFree  = disc >= 30;
            const marking = markingId === customer.id;
            const isOpen  = expandedCustomerId === customer.id;

            return (
              <motion.div
                key={customer.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.4,0,0.2,1] }}
                className="loy-card"
                data-testid={`loyalty-customer-${customer.id}`}
              >
                {/* Top accent bar */}
                <div style={{ height: 2, background: 'linear-gradient(90deg,#C9A227,transparent)' }} />

                {/* Always-visible header */}
                <button
                  onClick={() => toggleCard(customer.id)}
                  className="loy-row-btn"
                  aria-expanded={isOpen}
                  data-testid={`loyalty-toggle-${customer.id}`}
                >
                  <div className="loy-avatar">
                    <User size={15} style={{ color: '#6b6450' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate" style={{ letterSpacing: "-0.01em", color: "#f0e8d5" }}>{customer.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone size={11} style={{ color: '#4a4230' }} />
                      <p className="text-xs truncate" style={{ color: '#6b6450' }}>{customer.phone}</p>
                    </div>
                  </div>

                  {/* Visit count */}
                  <div className="loy-pill flex-shrink-0"
                    style={{ background: 'rgba(201,162,39,0.05)', border: '1px solid rgba(201,162,39,0.12)' }}>
                    <TrendingUp size={11} style={{ color: '#6b6450' }} />
                    <span className="text-xs font-semibold" style={{ color: "#e8e0cc" }}>{visits}</span>
                    <span className="text-xs hidden sm:inline" style={{ color: '#6b6450' }}>visit{visits !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Discount badge */}
                  <div className="loy-pill flex-shrink-0"
                    style={{
                      background: isFree ? 'rgba(201,162,39,0.12)' : 'rgba(201,162,39,0.08)',
                      border: isFree ? '1px solid rgba(201,162,39,0.3)' : '1px solid rgba(201,162,39,0.18)',
                    }}>
                    {isFree ? <Gift size={11} style={{ color: '#C9A227' }} /> : <Star size={11} style={{ color: '#C9A227' }} />}
                    <span className="text-xs font-semibold" style={{ color: '#C9A227' }}>
                      {isFree ? 'Free' : `${disc}%`}
                    </span>
                  </div>

                  <ChevronDown
                    className="w-4 h-4 flex-shrink-0 transition-transform duration-300"
                    style={{ color: '#4a4230', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)' }}
                  />
                </button>

                {/* Collapsible body */}
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.22, ease: [0.4,0,0.2,1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="px-4 pb-5 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(201,162,39,0.08)' }}>

                    {/* Expiry date */}
                    {customer.expiryDate && (() => {
                      const exp = customer.expiryDate?.toDate
                        ? customer.expiryDate.toDate()
                        : new Date(customer.expiryDate);
                      const isExpired = exp < new Date();
                      return (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                          style={{
                            background: isExpired ? 'rgba(220,50,50,0.08)' : 'rgba(201,162,39,0.05)',
                            border: isExpired ? '1px solid rgba(220,50,50,0.22)' : '1px solid rgba(201,162,39,0.14)',
                          }}>
                          <Calendar size={11} style={{ color: isExpired ? '#f87171' : '#6b6450' }} />
                          <span className="text-xs" style={{ color: isExpired ? '#f87171' : '#6b6450' }}>
                            {isExpired ? 'Expired ' : 'Valid till '}
                            {exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => handleMarkVisit(customer)} disabled={marking}
                        className="loy-btn loy-btn-orange disabled:opacity-50"
                        data-testid={`mark-visit-${customer.id}`}>
                        {marking ? <RefreshCw size={13} className="animate-spin" /> : <TrendingUp size={13} />}
                        {marking ? 'Marking…' : 'Mark Visit'}
                      </button>
                      <button onClick={() => handleSendWA(customer)}
                        className="loy-btn loy-btn-green"
                        data-testid={`wa-loyalty-${customer.id}`}>
                        <MessageSquare size={13} />WhatsApp
                      </button>
                      <button onClick={() => handleUndoVisit(customer)}
                        disabled={marking || (customer.visits || 1) <= 1}
                        className="loy-btn loy-btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
                        data-testid={`undo-visit-${customer.id}`} title="Undo last visit">
                        <Undo2 size={13} />Undo
                      </button>
                      <button onClick={() => handleDeleteCustomer(customer)}
                        className="loy-btn loy-btn-red"
                        data-testid={`delete-loyalty-${customer.id}`}>
                        <Trash2 size={13} />Delete
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
                        className={`loy-btn ${editingCustomerId === customer.id ? 'loy-btn-gold' : 'loy-btn-ghost'}`}
                        data-testid={`edit-loyalty-${customer.id}`}>
                        <Pencil size={13} />
                        {editingCustomerId === customer.id ? 'Cancel' : 'Edit'}
                      </button>
                    </div>

                    {/* Inline edit panel */}
                    {editingCustomerId === customer.id && (
                      <div className="mt-2 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(201,162,39,0.08)' }}
                        data-testid={`edit-panel-${customer.id}`}>
                        <p className="loy-section-title">
                          <Pencil size={11} /> Edit Loyalty Card
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="loy-label block mb-1">Discount (%)</label>
                            <input type="number" min="0" max="100" value={editDiscount}
                              onChange={e => setEditDiscount(e.target.value)}
                              placeholder={`Current: ${customer.currentDiscount || 10}%`}
                              className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                              data-testid={`edit-discount-${customer.id}`} />
                          </div>
                          <div>
                            <label className="loy-label block mb-1">Validity (days)</label>
                            <input type="number" min="0" value={editValidity}
                              onChange={e => setEditValidity(e.target.value)}
                              placeholder={`Current: ${customer.validityDays || 0}d`}
                              className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                              data-testid={`edit-validity-${customer.id}`} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEdit(customer)}
                            className="loy-btn loy-btn-orange"
                            data-testid={`save-edit-${customer.id}`}>
                            <Check size={13} />Save Changes
                          </button>
                          <button onClick={() => handleSendWA(customer)}
                            className="loy-btn loy-btn-green"
                            data-testid={`resend-wa-${customer.id}`}>
                            <MessageSquare size={13} />Resend WhatsApp
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 py-4" style={{ borderTop: '1px solid rgba(201,162,39,0.08)', marginTop: 8 }}>
        <Star size={11} style={{ color: '#C9A227', opacity: 0.8 }} />
        <p className="text-xs" style={{ color: '#6b6450', letterSpacing: '-0.01em' }}>
          {totalCustomers} member{totalCustomers !== 1 ? 's' : ''} · {totalVisits} total visits
        </p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C9A227', opacity: 0.6 }} />
      </div>

      {/* ── Google Review Link setting ──────────────────────────────────────── */}
      <GoogleReviewSettings />
    </div>
  );
};

export default LoyaltyDashboard;
