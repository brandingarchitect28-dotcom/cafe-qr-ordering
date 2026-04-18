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

// ── Inject café-vibe CSS once ─────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('loy-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'loy-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
    .loy { font-family: 'Nunito', system-ui, sans-serif; }
    .loy-title { font-family: 'Fredoka One', system-ui, sans-serif !important; }
    .loy-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 200ms;
    }
    .loy-card:hover { border-color: rgba(255,140,0,0.2); }
    .loy-input {
      width: 100%; background: #1c1509;
      border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'Nunito', system-ui, sans-serif;
      outline: none; transition: border-color 180ms, box-shadow 180ms;
    }
    .loy-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.1); }
    .loy-input::placeholder { color: #3d3020; }
    .loy-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'Nunito', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 7px 13px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .loy-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .loy-btn:active { transform: scale(0.96); }
    .loy-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.3); }
    .loy-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .loy-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .loy-btn-green  { background: rgba(37,211,102,0.1); color: #25D366; border-color: rgba(37,211,102,0.25); }
    .loy-btn-green:hover  { background: rgba(37,211,102,0.18); }
    .loy-btn-red    { background: rgba(220,50,50,0.12); color: #f87171; border-color: rgba(220,50,50,0.22); }
    .loy-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .loy-btn-gold   { background: rgba(212,175,55,0.12); color: #fbbf24; border-color: rgba(212,175,55,0.25); }
    .loy-btn-gold:hover   { background: rgba(212,175,55,0.22); }
    @keyframes loyIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .loy-in { animation: loyIn 280ms ease forwards; }
  `;
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
    <div className="loy space-y-5">

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Members',   value: totalCustomers,  emoji: '👥', color: '#FF7A20' },
          { label: 'Total Visits',    value: totalVisits,     emoji: '⭐', color: '#60a5fa' },
          { label: 'Loyal (3+)',      value: loyalCustomers,  emoji: '🏆', color: '#34d399' },
          { label: 'Repeat Visits',   value: repeatedVisits,  emoji: '🔄', color: '#a78bfa' },
        ].map(({ label, value, emoji, color }) => (
          <div key={label} className="loy-card p-4 flex items-center gap-3"
            style={{ borderLeft: `3px solid ${color}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: color + '18' }}>
              {emoji}
            </div>
            <div>
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-xs font-bold mt-0.5" style={{ color: '#7a6a55' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + Add ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="loy-input" style={{ paddingLeft: '2.2rem' }} />
        </div>
        <button onClick={() => setShowAddForm(v => !v)}
          className="loy-btn loy-btn-orange"
          data-testid="add-loyalty-customer-btn">
          <UserPlus className="w-4 h-4" />
          ➕ Add Customer
        </button>
      </div>

      {/* ── Add customer form ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="loy-card p-6"
            style={{ border: '1.5px solid rgba(255,140,0,0.22)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">👤</span>
              <h3 className="text-white font-black loy-title text-lg">Add New Loyalty Customer</h3>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#FF7A20' }}>Customer Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma" className="loy-input" disabled={saving} data-testid="loyalty-name-input" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#FF7A20' }}>Phone Number</label>
                  <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 9876543210" className="loy-input" disabled={saving} data-testid="loyalty-phone-input" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#FF7A20' }}>
                  Validity (days) <span className="font-normal normal-case" style={{ color: '#7a6a55' }}>(optional)</span>
                </label>
                <input type="number" min="0" value={validityDays} onChange={e => setValidityDays(e.target.value)}
                  placeholder="e.g. 30" className="loy-input" disabled={saving} data-testid="loyalty-validity-input" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#FF7A20' }}>
                  Custom Discount (%) <span className="font-normal normal-case" style={{ color: '#7a6a55' }}>(optional — overrides default 10%)</span>
                </label>
                <input type="number" min="0" max="100" value={customDiscount} onChange={e => setCustomDiscount(e.target.value)}
                  placeholder="e.g. 20" className="loy-input" disabled={saving} data-testid="loyalty-discount-input" />
              </div>
              <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>
                First visit will be recorded automatically. Customer starts with <span style={{ color: '#FF7A20' }}>10% OFF</span>.
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
      <div className="flex gap-2 flex-wrap">
        {[
          { label: '1 visit',   disc: '10%' },
          { label: '2 visits',  disc: '15%' },
          { label: '3 visits',  disc: '20%' },
          { label: '4 visits',  disc: '25%' },
          { label: '5+ visits', disc: '30% / Free Item 🎁' },
        ].map(({ label, disc }) => (
          <span key={label} className="text-xs px-3 py-1.5 rounded-xl font-black"
            style={{ background: 'rgba(255,140,0,0.07)', color: '#7a6a55', border: '1px solid rgba(255,140,0,0.15)' }}>
            {label} → <span style={{ color: '#FF7A20' }}>{disc}</span>
          </span>
        ))}
      </div>

      {/* ── Customer list ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <div className="text-4xl animate-bounce">⭐</div>
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading customers…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="loy-card p-12 text-center">
          <div className="text-5xl mb-3">🎁</div>
          <p className="font-bold" style={{ color: '#7a6a55' }}>
            {search ? 'No customers match your search.' : 'No loyalty customers yet. Add your first one!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="loy-card"
                data-testid={`loyalty-customer-${customer.id}`}
              >
                {/* Top accent bar */}
                <div style={{ height: 2, background: isFree ? 'linear-gradient(90deg,#34d399,transparent)' : 'linear-gradient(90deg,#FF7A20,transparent)' }} />

                {/* Always-visible header */}
                <button
                  onClick={() => toggleCard(customer.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                  data-testid={`loyalty-toggle-${customer.id}`}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: 'rgba(255,140,0,0.1)', border: '1.5px solid rgba(255,140,0,0.18)' }}>
                    👤
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-black text-sm truncate">{customer.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs">📞</span>
                      <p className="text-xs font-bold truncate" style={{ color: '#7a6a55' }}>{customer.phone}</p>
                    </div>
                  </div>

                  {/* Visit count */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-xs">☕</span>
                    <span className="text-white text-xs font-black">{visits}</span>
                    <span className="text-xs font-bold hidden sm:inline" style={{ color: '#7a6a55' }}>visit{visits !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Discount badge */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
                    style={{
                      background: isFree ? 'rgba(16,185,129,0.12)' : 'rgba(255,140,0,0.1)',
                      border: isFree ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,140,0,0.25)',
                    }}>
                    <span className="text-xs">{isFree ? '🎁' : '⭐'}</span>
                    <span className="text-xs font-black" style={{ color: isFree ? '#34d399' : '#FF7A20' }}>
                      {isFree ? 'Free!' : `${disc}%`}
                    </span>
                  </div>

                  <ChevronDown
                    className="w-4 h-4 flex-shrink-0 transition-transform duration-300"
                    style={{ color: '#7a6a55', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>

                {/* Collapsible body */}
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: '1px solid rgba(255,140,0,0.08)' }}>

                    {/* Expiry date */}
                    {customer.expiryDate && (() => {
                      const exp = customer.expiryDate?.toDate
                        ? customer.expiryDate.toDate()
                        : new Date(customer.expiryDate);
                      const isExpired = exp < new Date();
                      return (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                          style={{
                            background: isExpired ? 'rgba(220,50,50,0.08)' : 'rgba(255,255,255,0.04)',
                            border: isExpired ? '1px solid rgba(220,50,50,0.25)' : '1px solid rgba(255,255,255,0.08)',
                          }}>
                          <span className="text-xs">📅</span>
                          <span className="text-xs font-bold" style={{ color: isExpired ? '#f87171' : '#7a6a55' }}>
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
                        {marking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>☕</span>}
                        {marking ? 'Marking…' : 'Mark Visit'}
                      </button>
                      <button onClick={() => handleSendWA(customer)}
                        className="loy-btn loy-btn-green"
                        data-testid={`wa-loyalty-${customer.id}`}>
                        <MessageSquare className="w-3.5 h-3.5" />WhatsApp
                      </button>
                      <button onClick={() => handleUndoVisit(customer)}
                        disabled={marking || (customer.visits || 1) <= 1}
                        className="loy-btn loy-btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
                        data-testid={`undo-visit-${customer.id}`} title="Undo last visit">
                        <Undo2 className="w-3.5 h-3.5" />Undo
                      </button>
                      <button onClick={() => handleDeleteCustomer(customer)}
                        className="loy-btn loy-btn-red"
                        data-testid={`delete-loyalty-${customer.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />Delete
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
                        <Pencil className="w-3.5 h-3.5" />
                        {editingCustomerId === customer.id ? 'Cancel' : 'Edit'}
                      </button>
                    </div>

                    {/* Inline edit panel */}
                    {editingCustomerId === customer.id && (
                      <div className="mt-2 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,140,0,0.1)' }}
                        data-testid={`edit-panel-${customer.id}`}>
                        <p className="text-xs font-black uppercase tracking-widest" style={{ color: '#FF7A20' }}>
                          ✏️ Edit Loyalty Card
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1" style={{ color: '#7a6a55' }}>Discount (%)</label>
                            <input type="number" min="0" max="100" value={editDiscount}
                              onChange={e => setEditDiscount(e.target.value)}
                              placeholder={`Current: ${customer.currentDiscount || 10}%`}
                              className="loy-input" style={{ padding: '8px 12px', fontSize: 13 }}
                              data-testid={`edit-discount-${customer.id}`} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1" style={{ color: '#7a6a55' }}>Validity (days)</label>
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
                            <Check className="w-3.5 h-3.5" />Save Changes
                          </button>
                          <button onClick={() => handleSendWA(customer)}
                            className="loy-btn loy-btn-green"
                            data-testid={`resend-wa-${customer.id}`}>
                            <MessageSquare className="w-3.5 h-3.5" />Resend WhatsApp
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
      <div className="flex items-center justify-center gap-2 py-2">
        <span>⭐</span>
        <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>
          {totalCustomers} member{totalCustomers !== 1 ? 's' : ''} · {totalVisits} total visits
        </p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
      </div>

      {/* ── Google Review Link setting ──────────────────────────────────────── */}
      <GoogleReviewSettings />
    </div>
  );
};

export default LoyaltyDashboard;
