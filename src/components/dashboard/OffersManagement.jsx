import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AlertCircle, Search, Plus, Edit2, Trash2, Tag, Percent, X, CheckCircle, XCircle, Copy, ToggleLeft, ToggleRight, Gift, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Inject food-theme CSS once ───────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('omof-food-css')) {
  const el = document.createElement('style');
  el.id = 'omof-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');

    .omof { font-family: 'Nunito', system-ui, sans-serif; }
    .omof-title { font-family: 'Fredoka One', system-ui, sans-serif !important; letter-spacing: 0.01em; }

    .omof-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      transition: border-color 200ms, box-shadow 200ms, transform 180ms;
    }
    .omof-card:hover {
      border-color: rgba(255,140,0,0.25);
      box-shadow: 0 6px 24px rgba(0,0,0,0.45);
      transform: translateY(-1px);
    }

    .omof-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'Nunito', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 7px 14px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms;
      white-space: nowrap;
    }
    .omof-btn:hover  { transform: translateY(-1px); filter: brightness(1.1); }
    .omof-btn:active { transform: scale(0.96); }

    .omof-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.3); }
    .omof-btn-orange:hover { box-shadow: 0 5px 18px rgba(255,120,0,0.45); }
    .omof-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .omof-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .omof-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .omof-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .omof-btn-green  { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.22); }
    .omof-btn-green:hover  { background: rgba(16,185,129,0.22); }
    .omof-btn-yellow { background: rgba(255,190,11,0.12); color: #fbbf24; border-color: rgba(255,190,11,0.22); }
    .omof-btn-yellow:hover { background: rgba(255,190,11,0.22); }

    .omof-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'Nunito', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .omof-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.1); }
    .omof-input::placeholder { color: #3d3020; }

    .omof-label {
      display: block; font-size: 12px; font-weight: 800; margin-bottom: 6px;
      color: #a08060; text-transform: uppercase; letter-spacing: 0.06em;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    .omof-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    .omof-tab {
      padding: 6px 16px; border-radius: 22px; font-size: 13px; font-weight: 800;
      cursor: pointer; transition: all 180ms; border: 1.5px solid transparent;
      font-family: 'Nunito', system-ui, sans-serif;
    }
    .omof-tab-on  { background: linear-gradient(135deg,#FF7A20,#E55A00); color: #fff; box-shadow: 0 3px 14px rgba(255,120,0,0.35); }
    .omof-tab-off { background: rgba(255,255,255,0.04); color: #7a6a55; border-color: rgba(255,255,255,0.07); }
    .omof-tab-off:hover { background: rgba(255,140,0,0.08); color: #FF7A20; border-color: rgba(255,140,0,0.2); }

    .omof-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .omof-scroll::-webkit-scrollbar-track { background: transparent; }
    .omof-scroll::-webkit-scrollbar-thumb { background: rgba(255,140,0,0.25); border-radius: 4px; }

    .omof-sheet {
      background: linear-gradient(180deg, #1e1408 0%, #150f06 100%);
      border: 1.5px solid rgba(255,140,0,0.18);
      box-shadow: 0 -20px 60px rgba(255,120,0,0.14);
    }
    .omof-sheet-grip { width: 36px; height: 4px; border-radius: 4px; background: rgba(255,140,0,0.28); }

    .omof-coupon-card {
      background: linear-gradient(135deg, #1e1408 0%, #1a1005 100%);
      border: 1.5px solid rgba(255,140,0,0.18);
      border-radius: 16px;
      position: relative;
      overflow: hidden;
      transition: border-color 200ms, box-shadow 200ms, transform 180ms;
    }
    .omof-coupon-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #FF7A20, #FFBE0B, #FF7A20);
    }
    .omof-coupon-card:hover {
      border-color: rgba(255,140,0,0.35);
      box-shadow: 0 8px 30px rgba(255,120,0,0.15);
      transform: translateY(-2px);
    }
    .omof-coupon-card-disabled {
      opacity: 0.55;
      filter: grayscale(0.4);
    }
    .omof-coupon-card-disabled::before {
      background: #3a3a3a;
    }

    .omof-coupon-hole-left {
      position: absolute; left: -8px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; border-radius: 50%;
      background: #0D0A07;
      border: 1.5px solid rgba(255,140,0,0.18);
    }
    .omof-coupon-hole-right {
      position: absolute; right: -8px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; border-radius: 50%;
      background: #0D0A07;
      border: 1.5px solid rgba(255,140,0,0.18);
    }
    .omof-coupon-dashes {
      position: absolute; top: 50%; left: 16px; right: 16px;
      height: 1px;
      background: repeating-linear-gradient(90deg, rgba(255,140,0,0.2) 0px, rgba(255,140,0,0.2) 6px, transparent 6px, transparent 12px);
      transform: translateY(-50%);
      pointer-events: none;
    }

    @keyframes omofIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .omof-in { animation: omofIn 280ms ease forwards; }

    .omof-ordnum { font-family: 'Fredoka One', system-ui, sans-serif; color: #FF7A20; }
    .omof-sec { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #FF7A20; display: flex; align-items: center; gap: 5px; font-family: 'Nunito', system-ui, sans-serif; }

    .omof-toggle-track {
      width: 40px; height: 22px; border-radius: 11px;
      display: flex; align-items: center;
      padding: 2px; cursor: pointer; transition: background 200ms;
    }
    .omof-toggle-thumb {
      width: 18px; height: 18px; border-radius: 50%; background: #fff;
      transition: transform 200ms; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
  `;
  document.head.appendChild(el);
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const DISCOUNT_TYPES = {
  percentage: { emoji: '📊', label: 'Percentage Off',  color: '#fbbf24' },
  flat:       { emoji: '💰', label: 'Flat Amount Off', color: '#34d399' },
  bogo:       { emoji: '🎁', label: 'Buy 1 Get 1',     color: '#60a5fa' },
  freeitem:   { emoji: '🆓', label: 'Free Item',       color: '#a78bfa' },
};

const fmtN = n => (parseFloat(n) || 0).toFixed(2);

const EMPTY_FORM = {
  title: '', code: '', discountType: 'percentage', discountValue: '',
  minOrderAmount: '', maxDiscountAmount: '', usageLimit: '',
  validFrom: '', validUntil: '', isActive: true, description: '',
  applicableItems: [], termsConditions: '',
};

// ─── Offer Form Modal ─────────────────────────────────────────────────────────
const OfferFormModal = ({ offer, cafeId, cafeCurrency, onClose, onSaved }) => {
  const isEdit = !!offer?.id;
  const [form, setForm] = useState(() => {
    if (!offer) return { ...EMPTY_FORM };
    return {
      title:             offer.title             || '',
      code:              offer.code              || '',
      discountType:      offer.discountType      || 'percentage',
      discountValue:     offer.discountValue     || '',
      minOrderAmount:    offer.minOrderAmount    || '',
      maxDiscountAmount: offer.maxDiscountAmount || '',
      usageLimit:        offer.usageLimit        || '',
      validFrom:         offer.validFrom         || '',
      validUntil:        offer.validUntil        || '',
      isActive:          offer.isActive !== false,
      description:       offer.description       || '',
      applicableItems:   offer.applicableItems   || [],
      termsConditions:   offer.termsConditions   || '',
    };
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim())         { toast.error('🏷️ Offer title is required'); return; }
    if (!form.code.trim())          { toast.error('🎫 Coupon code is required'); return; }
    if (!form.discountValue)        { toast.error('💸 Discount value is required'); return; }
    if (form.discountType === 'percentage' && (parseFloat(form.discountValue) <= 0 || parseFloat(form.discountValue) > 100)) {
      toast.error('📊 Percentage must be between 1–100'); return;
    }

    setSaving(true);
    try {
      const payload = {
        title:             form.title.trim(),
        code:              form.code.trim().toUpperCase(),
        discountType:      form.discountType,
        discountValue:     parseFloat(form.discountValue) || 0,
        minOrderAmount:    parseFloat(form.minOrderAmount) || 0,
        maxDiscountAmount: parseFloat(form.maxDiscountAmount) || 0,
        usageLimit:        parseInt(form.usageLimit) || 0,
        validFrom:         form.validFrom   || null,
        validUntil:        form.validUntil  || null,
        isActive:          form.isActive,
        description:       form.description.trim(),
        applicableItems:   form.applicableItems,
        termsConditions:   form.termsConditions.trim(),
        cafeId,
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await updateDoc(doc(db, 'offers', offer.id), payload);
        toast.success('🎉 Offer updated!');
      } else {
        await addDoc(collection(db, 'offers'), { ...payload, usageCount: 0, createdAt: serverTimestamp() });
        toast.success('🎊 New offer created!');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[OfferForm] Save failed:', err);
      toast.error('Failed to save offer');
    } finally {
      setSaving(false);
    }
  };

  const CUR = cafeCurrency || '₹';
  const dtCfg = DISCOUNT_TYPES[form.discountType] || DISCOUNT_TYPES.percentage;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
        <motion.div
          className="relative w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col omof-sheet omof-scroll"
          style={{ maxHeight: '92vh' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0"><div className="omof-sheet-grip mx-auto" /></div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,140,0,0.12)' }}>
            <div>
              <h3 className="omof-title text-white font-bold text-lg flex items-center gap-2">
                {isEdit ? '✏️ Edit Offer' : '🎁 Create New Offer'}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>{isEdit ? `Editing: ${offer.title}` : 'Set up a discount or coupon for your customers'}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-all" style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.2)' }}>
              <X className="w-4 h-4" style={{ color: '#FF7A20' }} />
            </button>
          </div>

          {/* Form body */}
          <div className="flex-1 overflow-y-auto omof-scroll px-5 py-4 space-y-5 pb-6">

            {/* Title + Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="omof-label">🏷️ Offer Title</label>
                <input className="omof-input" placeholder="e.g. Weekend Special 20% Off" value={form.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div>
                <label className="omof-label">🎫 Coupon Code</label>
                <input className="omof-input uppercase" placeholder="e.g. SAVE20" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="omof-label">📝 Description (optional)</label>
              <textarea className="omof-input" rows={2} placeholder="Short description shown to customers…" value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'none' }} />
            </div>

            {/* Discount Type */}
            <div>
              <label className="omof-label">🎯 Discount Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(DISCOUNT_TYPES).map(([k, cfg]) => (
                  <button key={k} onClick={() => set('discountType', k)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl font-bold text-xs transition-all"
                    style={{
                      background: form.discountType === k ? `${cfg.color}22` : 'rgba(255,255,255,0.03)',
                      border: `1.5px solid ${form.discountType === k ? cfg.color+'55' : 'rgba(255,255,255,0.07)'}`,
                      color: form.discountType === k ? cfg.color : '#7a6a55',
                    }}
                  >
                    <span className="text-xl">{cfg.emoji}</span>
                    <span style={{ fontSize: 10 }}>{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Discount Value */}
            {form.discountType !== 'bogo' && form.discountType !== 'freeitem' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="omof-label">{form.discountType === 'percentage' ? '📊 Discount %' : `💰 Discount Amount (${CUR})`}</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black" style={{ color: dtCfg.color }}>
                      {form.discountType === 'percentage' ? '%' : CUR}
                    </span>
                    <input type="number" min="0" className="omof-input" style={{ paddingLeft: '2rem' }}
                      placeholder={form.discountType === 'percentage' ? '20' : '50'}
                      value={form.discountValue} onChange={e => set('discountValue', e.target.value)} />
                  </div>
                </div>
                {form.discountType === 'percentage' && (
                  <div>
                    <label className="omof-label">🔒 Max Discount Cap ({CUR}) <span style={{ color: '#4a3f35', textTransform: 'none', fontSize: 10 }}>optional</span></label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: '#7a6a55' }}>{CUR}</span>
                      <input type="number" min="0" className="omof-input" style={{ paddingLeft: '1.8rem' }}
                        placeholder="100" value={form.maxDiscountAmount} onChange={e => set('maxDiscountAmount', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Min Order + Usage Limit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="omof-label">🛒 Min Order Amount ({CUR}) <span style={{ color: '#4a3f35', textTransform: 'none', fontSize: 10 }}>optional</span></label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: '#7a6a55' }}>{CUR}</span>
                  <input type="number" min="0" className="omof-input" style={{ paddingLeft: '1.8rem' }}
                    placeholder="200" value={form.minOrderAmount} onChange={e => set('minOrderAmount', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="omof-label">🔢 Usage Limit <span style={{ color: '#4a3f35', textTransform: 'none', fontSize: 10 }}>0 = unlimited</span></label>
                <input type="number" min="0" className="omof-input"
                  placeholder="0 = unlimited" value={form.usageLimit} onChange={e => set('usageLimit', e.target.value)} />
              </div>
            </div>

            {/* Validity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="omof-label">📅 Valid From <span style={{ color: '#4a3f35', textTransform: 'none', fontSize: 10 }}>optional</span></label>
                <input type="date" className="omof-input" style={{ colorScheme: 'dark' }} value={form.validFrom} onChange={e => set('validFrom', e.target.value)} />
              </div>
              <div>
                <label className="omof-label">📅 Valid Until <span style={{ color: '#4a3f35', textTransform: 'none', fontSize: 10 }}>optional</span></label>
                <input type="date" className="omof-input" style={{ colorScheme: 'dark' }} value={form.validUntil} onChange={e => set('validUntil', e.target.value)} />
              </div>
            </div>

            {/* Terms */}
            <div>
              <label className="omof-label">📜 Terms & Conditions <span style={{ color: '#4a3f35', textTransform: 'none', fontSize: 10 }}>optional</span></label>
              <textarea className="omof-input" rows={2} placeholder="e.g. Valid on dine-in only. Not combinable with other offers." value={form.termsConditions} onChange={e => set('termsConditions', e.target.value)} style={{ resize: 'none' }} />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
              <div>
                <p className="text-white font-bold text-sm">⚡ Activate Offer</p>
                <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>Customers can use this coupon right away</p>
              </div>
              <button onClick={() => set('isActive', !form.isActive)} className="omof-toggle-track" style={{ background: form.isActive ? '#FF7A20' : '#2a2018' }}>
                <div className="omof-toggle-thumb" style={{ transform: form.isActive ? 'translateX(18px)' : 'translateX(0)' }} />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 flex-shrink-0 flex gap-3" style={{ borderTop: '1px solid rgba(255,140,0,0.12)', background: 'rgba(0,0,0,0.25)' }}>
            <button onClick={onClose} className="omof-btn omof-btn-ghost flex-1 justify-center py-3">✗ Cancel</button>
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
              className="omof-btn omof-btn-orange flex-1 justify-center py-3 disabled:opacity-60"
              style={{ fontSize: 14 }}
            >
              {saving ? <>⏳ Saving…</> : isEdit ? <>💾 Update Offer</> : <>🚀 Launch Offer</>}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
const DeleteConfirmModal = ({ offer, onClose, onConfirm, deleting }) => (
  <AnimatePresence>
    <motion.div className="fixed inset-0 z-[90] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <motion.div className="relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden omof-sheet p-6 space-y-4" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <div className="text-5xl mb-3">🗑️</div>
          <h3 className="omof-title text-white font-bold text-xl">Delete this offer?</h3>
          <p className="text-sm mt-2" style={{ color: '#7a6a55' }}>
            <span className="font-black" style={{ color: '#FF7A20' }}>{offer?.title}</span>
            {' '}will be permanently removed and customers won't be able to use the coupon code anymore.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="omof-btn omof-btn-ghost flex-1 justify-center py-3">✗ Keep it</button>
          <button onClick={onConfirm} disabled={deleting} className="omof-btn omof-btn-red flex-1 justify-center py-3 disabled:opacity-60">
            {deleting ? '⏳ Deleting…' : '🗑️ Yes, Delete'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  </AnimatePresence>
);

// ─── Coupon Card ──────────────────────────────────────────────────────────────
const CouponCard = ({ offer, cafeCurrency, onEdit, onDelete, onToggle, idx }) => {
  const CUR = cafeCurrency || '₹';
  const dtCfg = DISCOUNT_TYPES[offer.discountType] || DISCOUNT_TYPES.percentage;
  const isActive = offer.isActive !== false;

  const discountLabel = () => {
    if (offer.discountType === 'percentage') return `${offer.discountValue}% OFF`;
    if (offer.discountType === 'flat')       return `${CUR}${fmtN(offer.discountValue)} OFF`;
    if (offer.discountType === 'bogo')       return 'BUY 1 GET 1';
    if (offer.discountType === 'freeitem')   return 'FREE ITEM';
    return `${offer.discountValue} OFF`;
  };

  const isExpired = offer.validUntil && new Date(offer.validUntil) < new Date();
  const isNotStarted = offer.validFrom && new Date(offer.validFrom) > new Date();

  const statusBadge = () => {
    if (!isActive)     return { emoji: '⏸️', label: 'Paused',    bg: 'rgba(100,100,100,0.15)', color: '#888', bd: 'rgba(100,100,100,0.25)' };
    if (isExpired)     return { emoji: '⌛', label: 'Expired',   bg: 'rgba(220,50,50,0.12)',   color: '#f87171', bd: 'rgba(220,50,50,0.22)' };
    if (isNotStarted)  return { emoji: '🕐', label: 'Scheduled', bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', bd: 'rgba(59,130,246,0.22)' };
    return { emoji: '✅', label: 'Live',     bg: 'rgba(16,185,129,0.12)', color: '#34d399', bd: 'rgba(16,185,129,0.22)' };
  };
  const sb = statusBadge();

  const copyCode = e => {
    e.stopPropagation();
    navigator.clipboard.writeText(offer.code).then(() => toast.success(`📋 Copied: ${offer.code}`)).catch(() => toast.error('Failed to copy'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
      className={`omof-coupon-card ${!isActive || isExpired ? 'omof-coupon-card-disabled' : ''}`}
    >
      {/* Coupon perforated divider */}
      <div className="omof-coupon-hole-left" />
      <div className="omof-coupon-hole-right" />

      <div className="flex items-stretch">
        {/* Left — discount badge */}
        <div className="flex flex-col items-center justify-center px-5 py-4 flex-shrink-0 min-w-[90px]" style={{ borderRight: '1.5px dashed rgba(255,140,0,0.2)' }}>
          <span className="text-3xl mb-1">{dtCfg.emoji}</span>
          <span className="omof-title font-black text-center leading-tight" style={{ color: dtCfg.color, fontSize: 13 }}>{discountLabel()}</span>
        </div>

        {/* Right — details */}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-white font-black text-base truncate" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>{offer.title}</h4>
              {offer.description && <p className="text-xs mt-0.5 truncate" style={{ color: '#7a6a55' }}>{offer.description}</p>}
            </div>
            <span className="omof-badge flex-shrink-0" style={{ background: sb.bg, color: sb.color, borderColor: sb.bd }}>{sb.emoji} {sb.label}</span>
          </div>

          {/* Code row */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,140,0,0.1)', border: '1.5px dashed rgba(255,140,0,0.3)' }}>
              <span className="text-sm">🎫</span>
              <span className="font-black tracking-widest text-sm" style={{ color: '#FF7A20', fontFamily: "'Fredoka One', system-ui, sans-serif" }}>{offer.code}</span>
            </div>
            <button onClick={copyCode} className="omof-btn omof-btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }}>
              <Copy className="w-3 h-3" />📋 Copy
            </button>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap gap-2 mt-2.5 text-xs" style={{ color: '#7a6a55' }}>
            {offer.minOrderAmount > 0 && <span>🛒 Min {CUR}{fmtN(offer.minOrderAmount)}</span>}
            {offer.usageLimit > 0 && <span>🔢 {offer.usageCount || 0}/{offer.usageLimit} used</span>}
            {offer.usageLimit === 0 && <span>♾️ Unlimited uses</span>}
            {offer.validFrom  && <span>📅 From {new Date(offer.validFrom).toLocaleDateString()}</span>}
            {offer.validUntil && <span>📅 Until {new Date(offer.validUntil).toLocaleDateString()}</span>}
            {offer.maxDiscountAmount > 0 && offer.discountType === 'percentage' && <span>🔒 Max {CUR}{fmtN(offer.maxDiscountAmount)}</span>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => onToggle(offer)} className={`omof-btn ${isActive ? 'omof-btn-yellow' : 'omof-btn-green'}`} style={{ padding: '5px 10px', fontSize: 11 }}>
              {isActive ? '⏸️ Pause' : '▶️ Activate'}
            </button>
            <button onClick={() => onEdit(offer)} className="omof-btn omof-btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }}>
              <Edit2 className="w-3 h-3" />✏️ Edit
            </button>
            <button onClick={() => onDelete(offer)} className="omof-btn omof-btn-red" style={{ padding: '5px 10px', fontSize: 11 }}>
              <Trash2 className="w-3 h-3" />🗑️ Delete
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const OffersManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const cafeCurrency = cafe?.currencySymbol || '₹';

  const [searchQuery,  setSearchQuery ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter  ] = useState('all');
  const [showForm,     setShowForm    ] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [deletingOffer,setDeletingOffer] = useState(null);
  const [deleting,     setDeleting    ] = useState(false);
  const [toggling,     setToggling    ] = useState(null);

  const { data: offers, loading, error } = useCollection('offers', cafeId ? [where('cafeId', '==', cafeId)] : []);

  useEffect(() => {
    if (error) { console.error('[Offers] Firestore error:', error); toast.error('Error loading offers: ' + error); }
  }, [error]);

  const sortedOffers = useMemo(() => {
    if (!offers?.length) return [];
    return [...offers].sort((a, b) => (b.createdAt?.toDate?.() || new Date(0)) - (a.createdAt?.toDate?.() || new Date(0)));
  }, [offers]);

  const filteredOffers = useMemo(() => {
    let f = sortedOffers;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      f = f.filter(o => o.title?.toLowerCase().includes(q) || o.code?.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
    }

    if (typeFilter !== 'all') f = f.filter(o => o.discountType === typeFilter);

    if (statusFilter !== 'all') {
      const now = new Date();
      f = f.filter(o => {
        const isActive  = o.isActive !== false;
        const isExpired = o.validUntil && new Date(o.validUntil) < now;
        if (statusFilter === 'active')    return isActive && !isExpired;
        if (statusFilter === 'paused')    return !isActive;
        if (statusFilter === 'expired')   return isExpired;
        if (statusFilter === 'scheduled') return isActive && o.validFrom && new Date(o.validFrom) > now;
        return true;
      });
    }

    return f;
  }, [sortedOffers, searchQuery, statusFilter, typeFilter]);

  const handleEdit = useCallback(offer => { setEditingOffer(offer); setShowForm(true); }, []);
  const handleDelete = useCallback(offer => setDeletingOffer(offer), []);

  const handleToggle = useCallback(async offer => {
    setToggling(offer.id);
    try {
      await updateDoc(doc(db, 'offers', offer.id), { isActive: !offer.isActive, updatedAt: serverTimestamp() });
      toast.success(offer.isActive ? '⏸️ Offer paused' : '▶️ Offer activated!');
    } catch (err) {
      console.error('[Offers] Toggle failed:', err);
      toast.error('Failed to update offer');
    } finally { setToggling(null); }
  }, []);

  const handleConfirmDelete = async () => {
    if (!deletingOffer) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'offers', deletingOffer.id));
      toast.success('🗑️ Offer deleted');
      setDeletingOffer(null);
    } catch (err) {
      console.error('[Offers] Delete failed:', err);
      toast.error('Failed to delete offer');
    } finally { setDeleting(false); }
  };

  const openCreate = () => { setEditingOffer(null); setShowForm(true); };

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const total   = sortedOffers.length;
    const live    = sortedOffers.filter(o => o.isActive !== false && !(o.validUntil && new Date(o.validUntil) < now)).length;
    const paused  = sortedOffers.filter(o => o.isActive === false).length;
    const expired = sortedOffers.filter(o => o.validUntil && new Date(o.validUntil) < now).length;
    const totalRedemptions = sortedOffers.reduce((s, o) => s + (o.usageCount || 0), 0);
    return { total, live, paused, expired, totalRedemptions };
  }, [sortedOffers]);

  return (
    <div className="omof space-y-5 relative">

      {/* Modals */}
      {showForm && (
        <OfferFormModal
          offer={editingOffer}
          cafeId={cafeId}
          cafeCurrency={cafeCurrency}
          onClose={() => { setShowForm(false); setEditingOffer(null); }}
          onSaved={() => {}}
        />
      )}
      {deletingOffer && (
        <DeleteConfirmModal
          offer={deletingOffer}
          onClose={() => setDeletingOffer(null)}
          onConfirm={handleConfirmDelete}
          deleting={deleting}
        />
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🎁</div>
          <div>
            <h2 className="omof-title text-2xl font-black text-white">Offers & Coupons</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#7a6a55' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
              Manage discounts &amp; promo codes
            </p>
          </div>
        </div>
        <button onClick={openCreate} data-testid="create-offer-btn" className="omof-btn omof-btn-orange" style={{ padding: '10px 18px', fontSize: 13, borderRadius: 12 }}>
          <Plus className="w-4 h-4" />🎊 Create Offer
        </button>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { emoji: '🗂️', label: 'Total Offers',   value: stats.total,           color: '#FF7A20' },
          { emoji: '✅', label: 'Live Now',        value: stats.live,            color: '#34d399' },
          { emoji: '⏸️', label: 'Paused',         value: stats.paused,          color: '#fbbf24' },
          { emoji: '🎫', label: 'Redemptions',     value: stats.totalRedemptions,color: '#a78bfa' },
        ].map((s, i) => (
          <div key={i} className="omof-card p-4 flex items-center gap-3">
            <div className="text-2xl">{s.emoji}</div>
            <div>
              <p className="omof-title font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search ───────────────────────────────────────────── */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input type="text" data-testid="offer-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="omof-input" style={{ paddingLeft: '2.4rem', height: '44px' }}
          placeholder="Search offers by title, code, or description…" />
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#4a3f35' }}>Status:</span>
        {[['all','🍽️ All'],['active','✅ Live'],['paused','⏸️ Paused'],['expired','⌛ Expired'],['scheduled','🕐 Scheduled']].map(([k,l]) => (
          <button key={k} data-testid={`status-filter-${k}`} onClick={() => setStatusFilter(k)} className={`omof-tab ${statusFilter===k?'omof-tab-on':'omof-tab-off'}`}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#4a3f35' }}>Type:</span>
        <button onClick={() => setTypeFilter('all')} className={`omof-tab ${typeFilter==='all'?'omof-tab-on':'omof-tab-off'}`}>🎯 All Types</button>
        {Object.entries(DISCOUNT_TYPES).map(([k, cfg]) => (
          <button key={k} data-testid={`type-filter-${k}`} onClick={() => setTypeFilter(k)} className={`omof-tab ${typeFilter===k?'omof-tab-on':'omof-tab-off'}`}>{cfg.emoji} {cfg.label}</button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-5xl animate-bounce">🎁</div>
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading your offers…</p>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="omof-card flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="text-6xl mb-1">{sortedOffers.length === 0 ? '🎊' : '🫙'}</div>
          <p className="omof-title font-black text-white text-lg">
            {sortedOffers.length === 0 ? 'No offers yet!' : 'No offers match your filters'}
          </p>
          <p className="text-sm" style={{ color: '#7a6a55' }}>
            {sortedOffers.length === 0 ? 'Create your first promo code to delight your customers 🚀' : 'Try adjusting your search or filters'}
          </p>
          {sortedOffers.length === 0 && (
            <button onClick={openCreate} className="omof-btn omof-btn-orange mt-2" style={{ borderRadius: 12, padding: '10px 20px' }}>
              <Plus className="w-4 h-4" />🎊 Create First Offer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOffers.map((offer, idx) => (
            <CouponCard
              key={offer.id}
              offer={offer}
              cafeCurrency={cafeCurrency}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
              idx={idx}
            />
          ))}
          <div className="flex items-center justify-center gap-2 py-2">
            <span>🎁</span>
            <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>
              {filteredOffers.length} offer{filteredOffers.length !== 1 ? 's' : ''} · {stats.live} live now
            </p>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default OffersManagement;
