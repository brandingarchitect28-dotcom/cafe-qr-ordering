/**
 * LoyaltyDashboard.jsx
 *
 * Complete loyalty system for SmartCafé OS.
 * Firestore collection: loyaltyCustomers
 *
 * Features:
 *  - Search by phone or name
 *  - Add new customer (visits = 1, discount = 10%)
 *  - Mark Visit + Upgrade (increments visits, escalates discount)
 *  - Send loyalty reward via WhatsApp
 *
 * Discount ladder:
 *  Visit 1  → 10%
 *  Visit 2  → 15%
 *  Visit 3  → 20%
 *  Visit 4  → 25%
 *  Visit ≥5 → 30%
 *
 * Add-only — zero changes to any existing system.
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
  Award, TrendingUp, RefreshCw, Gift, Undo2, Trash2, Repeat,
} from 'lucide-react';
import GoogleReviewSettings from './GoogleReviewSettings';

// ── Discount ladder ────────────────────────────────────────────────────────────
const discountForVisits = (visits) => {
  if (visits <= 1) return 10;
  if (visits === 2) return 15;
  if (visits === 3) return 20;
  if (visits === 4) return 25;
  return 30; // visits >= 5
};

// ── Styling helpers ────────────────────────────────────────────────────────────
const inputCls =
  'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm';

const labelCls = 'block text-white text-sm font-medium mb-1.5';

// ── WhatsApp message ───────────────────────────────────────────────────────────
const buildWAMessage = (customer) => {
  const disc = customer.currentDiscount;
  const isFree = disc >= 30;
  return (
    `🎉 Welcome back, ${customer.name}!\n\n` +
    (isFree
      ? `🎁 You've unlocked a FREE ITEM on your next visit! 🥳\n`
      : `🔥 You've unlocked *${disc}% OFF* on your next order!\n`) +
    `\nShow this message at the counter to redeem.\n` +
    `\n👀 Keep visiting — your next reward is just around the corner!`
  );
};

// ══════════════════════════════════════════════════════════════════════════════
const LoyaltyDashboard = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  // ── Firestore ────────────────────────────────────────────────────────────────
  const { data: customers, loading } = useCollection(
    'loyaltyCustomers',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ── Local state ──────────────────────────────────────────────────────────────
  const [search,       setSearch      ] = useState('');
  const [showAddForm,  setShowAddForm  ] = useState(false);
  const [saving,       setSaving       ] = useState(false);
  const [markingId,    setMarkingId    ] = useState(null); // id of customer being marked

  const [newName,  setNewName ] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // ── Derived / filtered list ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      c =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [customers, search]);

  // ── Add new customer ─────────────────────────────────────────────────────────
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    // ── DEBUG: confirm db is a valid Firestore instance ──────────────────────
    console.log('[Loyalty] DB instance:', db);
    console.log('[Loyalty] cafeId:', cafeId);

    if (!newName.trim() || !newPhone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    // Duplicate check
    const already = customers?.find(c => c.phone === newPhone.trim());
    if (already) {
      toast.error('A customer with this phone number already exists');
      return;
    }
    setSaving(true);
    try {
      console.log('[Loyalty] Attempting addDoc to loyaltyCustomers…');
      const ref = await addDoc(collection(db, 'loyaltyCustomers'), {
        cafeId,
        name:            newName.trim(),
        phone:           newPhone.trim(),
        visits:          1,
        currentDiscount: 10,
        createdAt:       serverTimestamp(),
        lastVisit:       serverTimestamp(),
      });
      console.log('[Loyalty] ✅ Customer saved, docId:', ref.id);
      toast.success(`${newName.trim()} added to loyalty program ✓`);
      setNewName('');
      setNewPhone('');
      setShowAddForm(false);
    } catch (err) {
      // ── Verbose error so the exact failure reason is visible in console ──
      console.error('[Loyalty] ❌ addDoc failed:', err.code, err.message, err);
      toast.error(`Failed to add customer: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Mark visit + upgrade discount ────────────────────────────────────────────
  const handleMarkVisit = async (customer) => {
    setMarkingId(customer.id);
    try {
      const newVisits   = (customer.visits || 0) + 1;
      const newDiscount = discountForVisits(newVisits);
      console.log('[Loyalty] Marking visit for', customer.name, '→ visits:', newVisits, 'discount:', newDiscount);
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        visits:          newVisits,
        currentDiscount: newDiscount,
        lastVisit:       serverTimestamp(),
      });
      const msg =
        newDiscount >= 30
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

  // ── Undo visit (decrement visits + roll back discount) ──────────────────────
  const handleUndoVisit = async (customer) => {
    if ((customer.visits || 1) <= 1) {
      toast.error('Cannot reduce below 1 visit');
      return;
    }
    setMarkingId(customer.id);
    try {
      const newVisits   = customer.visits - 1;
      const newDiscount = discountForVisits(newVisits);
      console.log('[Loyalty] Undoing visit for', customer.name, '→ visits:', newVisits);
      await updateDoc(doc(db, 'loyaltyCustomers', customer.id), {
        visits:          newVisits,
        currentDiscount: newDiscount,
      });
      toast.success(`↩ Visit undone — ${customer.name} now at visit ${newVisits} (${newDiscount}% OFF)`);
    } catch (err) {
      console.error('[Loyalty] ❌ undoVisit failed:', err.code, err.message, err);
      toast.error(`Undo failed: ${err.message || 'Unknown error'}`);
    } finally {
      setMarkingId(null);
    }
  };

  // ── Delete customer (hard delete) ────────────────────────────────────────────
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

  // ── Send WhatsApp ─────────────────────────────────────────────────────────────
  const handleSendWA = (customer) => {
    if (!customer.phone) {
      toast.error('No phone number for this customer');
      return;
    }
    // Normalise: strip non-digits, add country code if 10 digits
    const digits = customer.phone.replace(/\D/g, '');
    const waNum  = digits.length === 10 ? `91${digits}` : digits;
    const msg    = buildWAMessage(customer);
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Stats bar ─────────────────────────────────────────────────────────────────
  const totalCustomers  = customers?.length || 0;
  const totalVisits     = customers?.reduce((s, c) => s + (c.visits || 0), 0) || 0;
  const loyalCustomers  = customers?.filter(c => (c.visits || 0) >= 3).length || 0;
  const repeatedVisits  = customers?.reduce((s, c) => s + ((c.visits || 0) > 1 ? (c.visits - 1) : 0), 0) || 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Stats row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Members',    value: totalCustomers,  icon: User,    color: '#D4AF37' },
          { label: 'Total Visits',     value: totalVisits,     icon: Star,    color: '#3B82F6' },
          { label: 'Loyal (3+)',       value: loyalCustomers,  icon: Award,   color: '#10B981' },
          { label: 'Repeated Visits',  value: repeatedVisits,  icon: Repeat,  color: '#A855F7' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0F0F0F] border border-white/5 rounded-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: color + '18' }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-[#A3A3A3] text-xs mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + Add button ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full bg-[#0F0F0F] border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 pl-9 pr-4 transition-all text-sm"
          />
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all"
          data-testid="add-loyalty-customer-btn"
        >
          <UserPlus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* ── Add customer form ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#0F0F0F] border border-[#D4AF37]/30 rounded-sm p-6"
          >
            <h3 className="text-white font-semibold mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              Add New Loyalty Customer
            </h3>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Customer Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className={inputCls}
                    disabled={saving}
                    data-testid="loyalty-name-input"
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className={inputCls}
                    disabled={saving}
                    data-testid="loyalty-phone-input"
                  />
                </div>
              </div>
              <p className="text-[#A3A3A3] text-xs">
                First visit will be recorded automatically. Customer starts with <strong className="text-[#D4AF37]">10% OFF</strong>.
              </p>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
                  data-testid="loyalty-submit-btn"
                >
                  {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Adding…</> : <><UserPlus className="w-4 h-4" /> Add Customer</>}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-5 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Discount ladder info ───────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { visits: 1, label: '1 visit',  disc: '10%' },
          { visits: 2, label: '2 visits', disc: '15%' },
          { visits: 3, label: '3 visits', disc: '20%' },
          { visits: 4, label: '4 visits', disc: '25%' },
          { visits: 5, label: '5+ visits',disc: '30% / Free Item' },
        ].map(({ label, disc }) => (
          <span key={label} className="text-xs px-3 py-1 rounded-full border border-[#D4AF37]/20 text-[#A3A3A3]">
            {label} → <span className="text-[#D4AF37] font-semibold">{disc}</span>
          </span>
        ))}
      </div>

      {/* ── Customer list ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center text-[#A3A3A3] py-12">Loading customers…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
          <Gift className="w-12 h-12 text-[#A3A3A3] mx-auto mb-3" />
          <p className="text-[#A3A3A3]">
            {search ? 'No customers match your search.' : 'No loyalty customers yet. Add your first one!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(customer => {
            const disc    = customer.currentDiscount || 10;
            const visits  = customer.visits || 0;
            const isFree  = disc >= 30;
            const marking = markingId === customer.id;

            return (
              <motion.div
                key={customer.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0F0F0F] border border-white/5 rounded-sm p-4 hover:border-white/10 transition-colors"
                data-testid={`loyalty-customer-${customer.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">

                  {/* Customer info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{customer.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3 h-3 text-[#A3A3A3]" />
                        <p className="text-[#A3A3A3] text-sm">{customer.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Visit + discount badges */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5 bg-white/5 rounded-sm px-3 py-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#A3A3A3]" />
                      <span className="text-white text-sm font-semibold">{visits}</span>
                      <span className="text-[#A3A3A3] text-xs">visit{visits !== 1 ? 's' : ''}</span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 rounded-sm px-3 py-1.5"
                      style={{
                        backgroundColor: isFree ? '#10B98118' : '#D4AF3718',
                        border:          isFree ? '1px solid #10B98140' : '1px solid #D4AF3740',
                      }}
                    >
                      <Star className="w-3.5 h-3.5" style={{ color: isFree ? '#10B981' : '#D4AF37' }} />
                      <span className="text-sm font-bold" style={{ color: isFree ? '#10B981' : '#D4AF37' }}>
                        {isFree ? 'Free Item' : `${disc}% OFF`}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => handleMarkVisit(customer)}
                      disabled={marking}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-xs transition-all disabled:opacity-50"
                      data-testid={`mark-visit-${customer.id}`}
                    >
                      {marking
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Star className="w-3.5 h-3.5" />}
                      {marking ? 'Marking…' : 'Mark Visit'}
                    </button>
                    <button
                      onClick={() => handleSendWA(customer)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 font-bold rounded-sm text-xs transition-all"
                      data-testid={`wa-loyalty-${customer.id}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      WhatsApp
                    </button>
                    {/* ── Undo visit ───────────────────────────────────────── */}
                    <button
                      onClick={() => handleUndoVisit(customer)}
                      disabled={marking || (customer.visits || 1) <= 1}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[#A3A3A3] hover:text-white font-bold rounded-sm text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      data-testid={`undo-visit-${customer.id}`}
                      title="Undo last visit"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Undo
                    </button>
                    {/* ── Delete customer ──────────────────────────────────── */}
                    <button
                      onClick={() => handleDeleteCustomer(customer)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold rounded-sm text-xs transition-all"
                      data-testid={`delete-loyalty-${customer.id}`}
                      title="Delete customer permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Google Review Link setting — feeds OrderTracking promo button ── */}
      <GoogleReviewSettings />

    </div>
  );
};

export default LoyaltyDashboard;
