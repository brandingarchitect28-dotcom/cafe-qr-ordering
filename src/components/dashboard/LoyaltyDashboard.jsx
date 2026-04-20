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
 * NEW ADDITIONS (zero existing logic changed):
 *  - Customer Name dropdown (tap to select from existing customers)
 *  - Phone Number dropdown (filtered by selected name, or all)
 *  - Top Customers insight panel (sorted by frequency, copy button)
 *
 * Discount ladder:
 *  Visit 1  → 10%   Visit 2  → 15%   Visit 3  → 20%
 *  Visit 4  → 25%   Visit ≥5 → 30%
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  Users, Trophy, RotateCcw, Coffee, Edit, Copy, ChevronUp, Flame, Crown,
} from 'lucide-react';
import GoogleReviewSettings from './GoogleReviewSettings';

// ── Inject café-vibe CSS once ─────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('loy-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'loy-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .loy { font-family: 'DM Sans', system-ui, sans-serif; }
    .loy-title { font-family: 'Playfair Display', serif !important; }
    .loy-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 200ms;
    }
    .loy-card:hover { border-color: rgba(201,162,39,0.2); }
    .loy-input {
      width: 100%; background: #1c1509;
      border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; transition: border-color 180ms, box-shadow 180ms;
    }
    .loy-input:focus { border-color: rgba(201,162,39,0.55); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .loy-input::placeholder { color: #3d3020; }
    .loy-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 7px 13px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .loy-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .loy-btn:active { transform: scale(0.96); }
    .loy-btn-orange { background: linear-gradient(135deg,#C9A227,#A67C00); color:#fff; box-shadow: 0 3px 12px rgba(201,162,39,0.3); }
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

    /* ── Dropdown styles ── */
    .loy-dropdown {
      position: absolute; top: calc(100% + 6px); left: 0; right: 0;
      background: #1a1208;
      border: 1.5px solid rgba(201,162,39,0.25);
      border-radius: 12px;
      z-index: 999;
      max-height: 200px;
      overflow-y: auto;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,39,0.08);
      scrollbar-width: thin;
      scrollbar-color: rgba(201,162,39,0.2) transparent;
    }
    .loy-dropdown::-webkit-scrollbar { width: 4px; }
    .loy-dropdown::-webkit-scrollbar-track { background: transparent; }
    .loy-dropdown::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.2); border-radius: 4px; }
    .loy-dropdown-item {
      display: flex; align-items: center; gap-8px;
      width: 100%; text-align: left;
      padding: 9px 14px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px; font-weight: 600;
      color: #fff8ee;
      background: transparent;
      border: none; cursor: pointer;
      transition: background 140ms;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .loy-dropdown-item:last-child { border-bottom: none; }
    .loy-dropdown-item:hover { background: rgba(201,162,39,0.1); color: #fff; }
    .loy-dropdown-item:first-child { border-radius: 10px 10px 0 0; }
    .loy-dropdown-item:last-child  { border-radius: 0 0 10px 10px; }
    .loy-dropdown-item:only-child  { border-radius: 10px; }

    /* ── Top Customers Panel ── */
    .loy-insight-card {
      background: linear-gradient(135deg, #16100a 0%, #1a1208 100%);
      border: 1.5px solid rgba(201,162,39,0.18);
      border-radius: 16px;
      overflow: hidden;
    }
    .loy-rank-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 150ms;
    }
    .loy-rank-row:last-child { border-bottom: none; }
    .loy-rank-row:hover { background: rgba(201,162,39,0.05); }
    .loy-copy-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 9px; border-radius: 7px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 11px; font-weight: 700;
      background: rgba(255,255,255,0.05);
      color: #7a6a55;
      border: 1px solid rgba(255,255,255,0.07);
      cursor: pointer; transition: all 150ms; white-space: nowrap; flex-shrink: 0;
    }
    .loy-copy-btn:hover { background: rgba(201,162,39,0.12); color: #C9A227; border-color: rgba(201,162,39,0.25); transform: translateY(-1px); }
    .loy-copy-btn:active { transform: scale(0.95); }
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

// ── Rank medal helper ─────────────────────────────────────────────────────────
// Colors: #1 gold = existing brand gold; #2 silver = muted cool gray; #3 bronze = warm muted brown
// All at reduced opacity to stay premium/subtle, not flashy
const RANK_COLORS = {
  1: { icon: '#C9A227', bg: 'rgba(201,162,39,0.12)',  border: 'rgba(201,162,39,0.25)'  }, // gold — existing brand color
  2: { icon: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.18)' }, // silver — neutral light gray
  3: { icon: '#a07850', bg: 'rgba(160,120,80,0.08)',  border: 'rgba(160,120,80,0.18)'  }, // bronze — warm muted brown
};
const RankBadge = ({ rank }) => {
  if (rank === 1) return <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: RANK_COLORS[1].icon }} />;
  if (rank === 2) return <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: RANK_COLORS[2].icon }} />;
  if (rank === 3) return <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: RANK_COLORS[3].icon }} />;
  return <span className="text-xs font-black flex-shrink-0" style={{ color: '#3d3020', minWidth: 14, textAlign: 'center' }}>#{rank}</span>;
};

// ══════════════════════════════════════════════════════════════════════════════
const LoyaltyDashboard = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: customers, loading } = useCollection(
    'loyaltyCustomers',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ── Orders data: used ONLY for Top Customers frequency calculation ────────
  // No new APIs — same useCollection hook, same pattern as loyaltyCustomers above.
  // This data is READ-ONLY here. Zero writes. Zero side effects.
  const { data: orders } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ── Existing state (UNCHANGED) ────────────────────────────────────────────
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

  // ── NEW state: dropdowns + insight panel ─────────────────────────────────
  const [showNameDropdown,    setShowNameDropdown   ] = useState(false);
  const [showPhoneDropdown,   setShowPhoneDropdown  ] = useState(false);
  const [showAllTopCustomers, setShowAllTopCustomers] = useState(false);
  // Visual limit for loyalty card list: show 5 by default, expand on demand
  const [showAllCustomers,    setShowAllCustomers   ] = useState(false);

  const nameDropdownRef  = useRef(null);
  const phoneDropdownRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (nameDropdownRef.current  && !nameDropdownRef.current.contains(e.target))  setShowNameDropdown(false);
      if (phoneDropdownRef.current && !phoneDropdownRef.current.contains(e.target)) setShowPhoneDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Existing memo (UNCHANGED) ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
  }, [customers, search]);

  // ── NEW memos ─────────────────────────────────────────────────────────────

  // Unique sorted names for name dropdown
  const uniqueNames = useMemo(() => {
    if (!customers || customers.length === 0) return [];
    const names = customers
      .map(c => c.name?.trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [customers]);

  // Phone dropdown: filtered by selected name, or all
  const filteredPhones = useMemo(() => {
    if (!customers || customers.length === 0) return [];
    const pool = newName.trim()
      ? customers.filter(c => c.name?.trim().toLowerCase() === newName.trim().toLowerCase())
      : customers;
    const phones = pool
      .map(c => ({ name: c.name?.trim(), phone: c.phone?.trim() }))
      .filter(x => x.phone);
    // Deduplicate by phone
    const seen = new Set();
    return phones.filter(x => {
      if (seen.has(x.phone)) return false;
      seen.add(x.phone);
      return true;
    });
  }, [customers, newName]);

  // ── CORRECTED: Top Customers derived from ORDERS data ────────────────────
  //
  // How it works:
  //   1. Filter out deleted orders (isDeleted === true)
  //   2. Group by composite key: normalised(customerName) + "|" + normalised(customerPhone)
  //      — normalisation: trim + lowercase for grouping, but we preserve original
  //        casing for display (first occurrence wins)
  //   3. Count occurrences = visit count
  //   4. Sort descending by count
  //   5. Slice top 5 for default view; full list for "View All"
  //
  const sortedByFrequency = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const map = new Map(); // key → { name, phone, orderCount }

    for (const order of orders) {
      // Skip soft-deleted orders
      if (order.isDeleted) continue;

      const rawName  = (order.customerName  || '').trim();
      const rawPhone = (order.customerPhone || '').trim();

      // Skip orders with no identifying info
      if (!rawName && !rawPhone) continue;

      // Composite key: normalise to lowercase for consistent grouping
      const key = `${rawName.toLowerCase()}|${rawPhone.toLowerCase()}`;

      if (map.has(key)) {
        map.get(key).orderCount += 1;
      } else {
        // Preserve original casing from first occurrence
        map.set(key, {
          name:       rawName  || '(No Name)',
          phone:      rawPhone || '(No Phone)',
          orderCount: 1,
          // Synthetic id for React key — stable per unique customer
          id: key,
        });
      }
    }

    // Sort descending by order count
    return [...map.values()].sort((a, b) => b.orderCount - a.orderCount);
  }, [orders]);

  const topCustomers = sortedByFrequency.slice(0, 3);
  const displayedTopCustomers = showAllTopCustomers ? sortedByFrequency : topCustomers;

  // ── Copy handler ──────────────────────────────────────────────────────────
  const handleCopy = useCallback((customer) => {
    const text = `${customer.name} - ${customer.phone}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast.success(`Copied: ${text}`))
        .catch(() => {
          // Fallback
          const el = document.createElement('textarea');
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          toast.success(`Copied: ${text}`);
        });
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      toast.success(`Copied: ${text}`);
    }
  }, []);

  // ── Existing handlers (ALL UNCHANGED) ────────────────────────────────────
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

  // ── Existing derived values (UNCHANGED) ──────────────────────────────────
  const totalCustomers = customers?.length || 0;
  const totalVisits    = customers?.reduce((s, c) => s + (c.visits || 0), 0) || 0;
  const loyalCustomers = customers?.filter(c => (c.visits || 0) >= 3).length || 0;
  const repeatedVisits = customers?.reduce((s, c) => s + ((c.visits || 0) > 1 ? (c.visits - 1) : 0), 0) || 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="loy space-y-5">

      {/* ── Stats row (UNCHANGED) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Members',   value: totalCustomers,  icon: Users,       color: '#C9A227' },
          { label: 'Total Visits',    value: totalVisits,     icon: Star,        color: '#60a5fa' },
          { label: 'Loyal (3+)',      value: loyalCustomers,  icon: Trophy,      color: '#34d399' },
          { label: 'Repeat Visits',   value: repeatedVisits,  icon: RotateCcw,   color: '#a78bfa' },
        ].map(({ label, value, icon: StatIcon, color }) => (
          <div key={label} className="loy-card p-4 flex items-center gap-3"
            style={{ borderLeft: `3px solid ${color}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color + '18' }}>
              <StatIcon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-xs font-bold mt-0.5" style={{ color: '#7a6a55' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + Add (UNCHANGED) ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#7a6a55' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="loy-input" style={{ paddingLeft: '2.2rem' }} />
        </div>
        <button onClick={() => setShowAddForm(v => !v)}
          className="loy-btn loy-btn-orange"
          data-testid="add-loyalty-customer-btn">
          <UserPlus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* ── Add customer form with NEW dropdowns ──────────────────────────── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="loy-card p-6"
            style={{ border: '1.5px solid rgba(201,162,39,0.2)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5" style={{ color: '#C9A227' }} />
              <h3 className="text-white font-black loy-title text-lg">Add New Loyalty Customer</h3>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* ── FEATURE 1: Customer Name with dropdown ── */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Customer Name</label>
                  <div className="relative" ref={nameDropdownRef}>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => { setNewName(e.target.value); setShowNameDropdown(true); }}
                      onFocus={() => setShowNameDropdown(true)}
                      placeholder="e.g. Priya Sharma"
                      className="loy-input"
                      disabled={saving}
                      data-testid="loyalty-name-input"
                      autoComplete="off"
                    />
                    {/* Name dropdown */}
                    <AnimatePresence>
                      {showNameDropdown && uniqueNames.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="loy-dropdown"
                        >
                          {uniqueNames
                            .filter(n => !newName.trim() || n.toLowerCase().includes(newName.trim().toLowerCase()))
                            .map(name => (
                              <button
                                key={name}
                                type="button"
                                className="loy-dropdown-item"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setNewName(name);
                                  setShowNameDropdown(false);
                                }}
                              >
                                <span className="flex items-center gap-2">
                                  <User className="w-3 h-3 flex-shrink-0" style={{ color: '#C9A227' }} />
                                  {name}
                                </span>
                              </button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ── FEATURE 2: Phone Number with dropdown ── */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Phone Number</label>
                  <div className="relative" ref={phoneDropdownRef}>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={e => { setNewPhone(e.target.value); setShowPhoneDropdown(true); }}
                      onFocus={() => setShowPhoneDropdown(true)}
                      placeholder="e.g. 9876543210"
                      className="loy-input"
                      disabled={saving}
                      data-testid="loyalty-phone-input"
                      autoComplete="off"
                    />
                    {/* Phone dropdown */}
                    <AnimatePresence>
                      {showPhoneDropdown && filteredPhones.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="loy-dropdown"
                        >
                          {filteredPhones
                            .filter(x => !newPhone.trim() || x.phone.includes(newPhone.trim()))
                            .map(({ name, phone }) => (
                              <button
                                key={phone}
                                type="button"
                                className="loy-dropdown-item"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setNewPhone(phone);
                                  setShowPhoneDropdown(false);
                                }}
                              >
                                <span className="flex items-center gap-2">
                                  <Phone className="w-3 h-3 flex-shrink-0" style={{ color: '#7a6a55' }} />
                                  <span style={{ color: '#fff8ee' }}>{phone}</span>
                                  {name && <span style={{ color: '#5a4a35', fontSize: 11 }}>· {name}</span>}
                                </span>
                              </button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

              </div>

              {/* Validity (UNCHANGED) */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>
                  Validity (days) <span className="font-normal normal-case" style={{ color: '#7a6a55' }}>(optional)</span>
                </label>
                <input type="number" min="0" value={validityDays} onChange={e => setValidityDays(e.target.value)}
                  placeholder="e.g. 30" className="loy-input" disabled={saving} data-testid="loyalty-validity-input" />
              </div>

              {/* Custom discount (UNCHANGED) */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>
                  Custom Discount (%) <span className="font-normal normal-case" style={{ color: '#7a6a55' }}>(optional — overrides default 10%)</span>
                </label>
                <input type="number" min="0" max="100" value={customDiscount} onChange={e => setCustomDiscount(e.target.value)}
                  placeholder="e.g. 20" className="loy-input" disabled={saving} data-testid="loyalty-discount-input" />
              </div>

              <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>
                First visit will be recorded automatically. Customer starts with <span style={{ color: '#C9A227' }}>10% OFF</span>.
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

      {/* ── Discount ladder (UNCHANGED) ───────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: '1 visit',   disc: '10%' },
          { label: '2 visits',  disc: '15%' },
          { label: '3 visits',  disc: '20%' },
          { label: '4 visits',  disc: '25%' },
          { label: '5+ visits', disc: '30% / Free Item' },
        ].map(({ label, disc }) => (
          <span key={label} className="text-xs px-3 py-1.5 rounded-xl font-black flex items-center gap-1"
            style={{ background: 'rgba(201,162,39,0.07)', color: '#7a6a55', border: '1px solid rgba(201,162,39,0.15)' }}>
            {label} → <span style={{ color: '#C9A227' }}>{disc}</span>
            {label === '5+ visits' && <Gift className="w-3 h-3 ml-0.5" style={{ color: '#C9A227' }} />}
          </span>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── FEATURE 3: Top Customers Insight Panel ─────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!loading && sortedByFrequency.length > 0 && (
        <div className="loy-insight-card">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid rgba(201,162,39,0.12)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.2)' }}>
                <Flame className="w-4 h-4" style={{ color: '#C9A227' }} />
              </div>
              <div>
                <h3 className="text-white font-black text-sm loy-title">Top Customers</h3>
                <p className="text-xs font-bold" style={{ color: '#5a4a35' }}>Based on order history</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl"
              style={{ background: 'rgba(201,162,39,0.07)', border: '1px solid rgba(201,162,39,0.12)' }}>
              <Users className="w-3 h-3" style={{ color: '#C9A227' }} />
              <span className="text-xs font-black" style={{ color: '#C9A227' }}>
                {sortedByFrequency.length}
              </span>
            </div>
          </div>

          {/* Customer rows */}
          <div>
            <AnimatePresence initial={false}>
              {displayedTopCustomers.map((customer, idx) => {
                const rank       = idx + 1;
                const orderCount = customer.orderCount;
                // Visit bar width proportional to #1 customer
                const maxCount = sortedByFrequency[0]?.orderCount || 1;
                const barPct   = Math.max(8, Math.round((orderCount / maxCount) * 100));
                // Rank accent: subtle left border + avatar tint for top 3 only
                const rankStyle = RANK_COLORS[rank];

                return (
                  <motion.div
                    key={customer.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, delay: idx * 0.03 }}
                    className="loy-rank-row"
                    style={rankStyle ? { borderLeft: `2px solid ${rankStyle.border}` } : {}}
                  >
                    {/* Rank badge */}
                    <div className="flex-shrink-0 w-5 flex justify-center">
                      <RankBadge rank={rank} />
                    </div>

                    {/* Avatar — rank-tinted for top 3, default for rest */}
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={rankStyle
                        ? { background: rankStyle.bg, border: `1px solid ${rankStyle.border}` }
                        : { background: 'rgba(201,162,39,0.06)', border: '1px solid rgba(255,255,255,0.07)' }
                      }>
                      <User className="w-4 h-4" style={{ color: rankStyle ? rankStyle.icon : '#5a4a35' }} />
                    </div>

                    {/* Name + phone + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-black text-sm truncate" style={{ maxWidth: 120 }}>
                          {customer.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Phone className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#3d3020' }} />
                        <span className="text-xs font-bold" style={{ color: '#5a4a35' }}>{customer.phone}</span>
                      </div>
                      {/* Order frequency bar */}
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.05)', width: '100%' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${barPct}%`,
                            background: rankStyle
                              ? `linear-gradient(90deg,${rankStyle.icon},${rankStyle.border})`
                              : 'linear-gradient(90deg,#3d3020,#2a2010)',
                          }}
                        />
                      </div>
                    </div>

                    {/* Order count pill */}
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Coffee className="w-2.5 h-2.5" style={{ color: '#5a4a35' }} />
                      <span className="text-xs font-black text-white">{orderCount}</span>
                      <span className="text-xs font-bold hidden sm:inline" style={{ color: '#5a4a35' }}>
                        visit{orderCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Copy button */}
                    <button
                      type="button"
                      className="loy-copy-btn"
                      onClick={() => handleCopy(customer)}
                      title={`Copy: ${customer.name} - ${customer.phone}`}
                      data-testid={`copy-customer-${customer.id}`}
                    >
                      <Copy className="w-3 h-3" />
                      <span className="hidden sm:inline">Copy</span>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* View More / See Less footer */}
          {sortedByFrequency.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllTopCustomers(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-3 text-xs font-black transition-colors"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.04)',
                color: '#7a6a55',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#C9A227'; e.currentTarget.style.background = 'rgba(201,162,39,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#7a6a55'; e.currentTarget.style.background = 'transparent'; }}
              data-testid="top-customers-view-more"
            >
              {showAllTopCustomers
                ? <><ChevronUp className="w-3.5 h-3.5" /> See Less</>
                : <><ChevronDown className="w-3.5 h-3.5" /> View All {sortedByFrequency.length} Customers</>
              }
            </button>
          )}
        </div>
      )}

      {/* ── Customer list ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Star className="w-10 h-10 animate-bounce" style={{ color: '#C9A227' }} />
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading customers…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="loy-card p-12 text-center">
          <Gift className="w-12 h-12 mb-3 mx-auto" style={{ color: '#3a2e1a' }} />
          <p className="font-bold" style={{ color: '#7a6a55' }}>
            {search ? 'No customers match your search.' : 'No loyalty customers yet. Add your first one!'}
          </p>
        </div>
      ) : (
        <>
        <div className="space-y-2">
          {/* Slice to 5 by default; show all when expanded */}
          {(showAllCustomers ? filtered : filtered.slice(0, 5)).map(customer => {
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
                <div style={{ height: 2, background: isFree ? 'linear-gradient(90deg,#34d399,transparent)' : 'linear-gradient(90deg,#C9A227,transparent)' }} />

                {/* Always-visible header */}
                <button
                  onClick={() => toggleCard(customer.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                  data-testid={`loyalty-toggle-${customer.id}`}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.18)' }}>
                    <User className="w-5 h-5" style={{ color: '#C9A227' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-black text-sm truncate">{customer.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3 h-3 flex-shrink-0" style={{ color: '#7a6a55' }} />
                      <p className="text-xs font-bold truncate" style={{ color: '#7a6a55' }}>{customer.phone}</p>
                    </div>
                  </div>

                  {/* Visit count */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Coffee className="w-3 h-3" style={{ color: '#7a6a55' }} />
                    <span className="text-white text-xs font-black">{visits}</span>
                    <span className="text-xs font-bold hidden sm:inline" style={{ color: '#7a6a55' }}>visit{visits !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Discount badge */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
                    style={{
                      background: isFree ? 'rgba(16,185,129,0.12)' : 'rgba(201,162,39,0.2)',
                      border: isFree ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(201,162,39,0.2)',
                    }}>
                    {isFree ? <Gift className="w-3 h-3" style={{ color: '#34d399' }} /> : <Star className="w-3 h-3" style={{ color: '#C9A227' }} />}
                    <span className="text-xs font-black" style={{ color: isFree ? '#34d399' : '#C9A227' }}>
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
                  <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: '1px solid rgba(201,162,39,0.2)' }}>

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
                          <Calendar className="w-3 h-3" style={{ color: isExpired ? '#f87171' : '#7a6a55' }} />
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
                        {marking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Coffee className="w-3.5 h-3.5" />}
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
                      <div className="mt-2 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(201,162,39,0.2)' }}
                        data-testid={`edit-panel-${customer.id}`}>
                        <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1" style={{ color: '#C9A227' }}>
                          <Edit className="w-3 h-3" /> Edit Loyalty Card
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

        {/* Load More / Show Less — only shown when list exceeds 5 */}
        {filtered.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAllCustomers(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-black rounded-xl transition-colors"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1.5px solid rgba(255,255,255,0.07)',
              color: '#7a6a55',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,162,39,0.2)'; e.currentTarget.style.color = '#C9A227'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#7a6a55'; }}
            data-testid="loyalty-list-load-more"
          >
            {showAllCustomers
              ? <><ChevronUp className="w-3.5 h-3.5" /> Show Less</>
              : <><ChevronDown className="w-3.5 h-3.5" /> Load More · {filtered.length - 5} remaining</>
            }
          </button>
        )}
        </>
      )}

      {/* Footer (UNCHANGED) */}
      <div className="flex items-center justify-center gap-2 py-2">
        <Star className="w-4 h-4" style={{ color: '#7a6a55' }} />
        <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>
          {totalCustomers} member{totalCustomers !== 1 ? 's' : ''} · {totalVisits} total visits
        </p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
      </div>

      {/* ── Google Review Link setting (UNCHANGED) ──────────────────────────── */}
      <GoogleReviewSettings />
    </div>
  );
};

export default LoyaltyDashboard;
