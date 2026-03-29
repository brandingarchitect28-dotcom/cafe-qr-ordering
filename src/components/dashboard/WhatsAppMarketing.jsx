/**
 * WhatsAppMarketing.jsx
 *
 * Task 9: WhatsApp marketing system.
 * - Load customers from orders collection
 * - Filter: all, frequent, recent
 * - Compose message (manual or template)
 * - Open wa.me links for each selected customer
 * - Bulk send via sequential WhatsApp opens
 *
 * EXTENDED: Queue-based campaign system
 * - POST /api/send-whatsapp-campaign → backend processes sequentially
 * - Live progress via Firestore onSnapshot on whatsapp_campaigns doc
 * - Campaign history from whatsapp_campaigns collection
 * - Validation: dedup + min-length check + 200-cap before send
 * - Concurrent-campaign lock (one per cafe at a time)
 */

import { formatWhatsAppNumber } from '../../utils/whatsapp';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import {
  where, collection, query, orderBy, limit, onSnapshot, doc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Users, Send, Check, Star, Clock, Sparkles,
  History, AlertCircle, CheckCircle2, Loader2, XCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

// ─── message templates (unchanged) ───────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'promo',
    label: 'Promo Offer',
    text: (cafe) => `🎉 *Special Offer from ${cafe?.name || 'our café'}!*\n\nWe're running an exclusive deal just for our valued customers.\n\n📱 Order now via QR code at your table.\n\nSee you soon! ☕`,
  },
  {
    id: 'weekend',
    label: 'Weekend Special',
    text: (cafe) => `🌟 *Weekend Special at ${cafe?.name || 'our café'}!*\n\nThis weekend only — enjoy special discounts on our bestsellers.\n\nVisit us or scan the QR at your table to order.\n\nWe'd love to see you! 🙌`,
  },
  {
    id: 'thankyou',
    label: 'Thank You',
    text: (cafe) => `💛 *Thank you for visiting ${cafe?.name || 'us'}!*\n\nWe hope you enjoyed your experience. Your feedback means the world to us.\n\nSee you again soon! ☕✨`,
  },
  {
    id: 'new_item',
    label: 'New Item Launch',
    text: (cafe) => `🆕 *New on our menu at ${cafe?.name || 'our café'}!*\n\nWe've added exciting new items to our menu.\n\nCome try them today or order via QR code at your table!\n\nSee you soon! 👨‍🍳`,
  },
];

// ─── customer processing (unchanged) ─────────────────────────────────────────

const buildCustomerList = (orders) => {
  const map = {};
  orders?.forEach(o => {
    const phone = o.customerPhone?.replace(/\D/g, '').replace(/^0/, '91');
    if (!phone || phone.length < 10) return;
    if (!map[phone]) {
      map[phone] = {
        phone,
        name: o.customerName || 'Customer',
        orderCount: 0,
        lastOrder: null,
        totalSpend: 0,
      };
    }
    map[phone].orderCount++;
    map[phone].totalSpend += (o.totalAmount || 0);
    const t = o.createdAt?.toDate?.() || new Date(0);
    if (!map[phone].lastOrder || t > map[phone].lastOrder) {
      map[phone].lastOrder = t;
    }
  });
  return Object.values(map);
};

// ─── StatusBadge sub-component ────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const MAP = {
    processing: { label: 'Sending…',  color: '#F59E0B', Icon: Loader2,      spin: true  },
    completed:  { label: 'Completed', color: '#10B981', Icon: CheckCircle2, spin: false },
    failed:     { label: 'Failed',    color: '#EF4444', Icon: XCircle,      spin: false },
  };
  const cfg = MAP[status] || MAP.processing;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${cfg.color}18`, color: cfg.color }}>
      <cfg.Icon className={`w-3 h-3${cfg.spin ? ' animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
};

// ─── ProgressBar sub-component ────────────────────────────────────────────────

const ProgressBar = ({ sent, total }) => {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1" style={{ color: '#A3A3A3' }}>
        <span>Sending {sent} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #25D366, #128C7E)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const WhatsAppMarketing = () => {
  const { user }   = useAuth();
  const cafeId     = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe   } = useDocument('cafes', cafeId);
  const { T, isLight   } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';

  // ── Existing state (preserved exactly) ────────────────────────────────────
  const [filter,   setFilter  ] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [message,  setMessage ] = useState('');
  const [template, setTemplate] = useState('');
  const [sending,  setSending ] = useState(false);
  const [sent,     setSent    ] = useState(0);

  // ── New campaign state ────────────────────────────────────────────────────
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [campaigns,      setCampaigns     ] = useState([]);
  const [historyOpen,    setHistoryOpen   ] = useState(false);
  const unsubRef = useRef(null);

  // Derive backendUrl from cafe Firestore doc (same pattern as AdminApiSettings)
  const backendUrl = (cafe?.paymentSettings?.backendUrl || '').replace(/\/$/, '');

  // ── Real-time campaign history listener ───────────────────────────────────
  useEffect(() => {
    if (!cafeId) return;
    const q = query(
      collection(db, 'whatsapp_campaigns'),
      where('cafeId', '==', cafeId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q,
      snap => setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err  => console.error('[WA-History]', err.message)
    );
    return () => unsub();
  }, [cafeId]);

  // ── Live progress listener for the active campaign ────────────────────────
  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!activeCampaign?.id) return;

    const unsub = onSnapshot(
      doc(db, 'whatsapp_campaigns', activeCampaign.id),
      snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        setActiveCampaign(prev => ({ ...prev, ...d }));
        if (d.status === 'completed' || d.status === 'failed') {
          setSending(false);
          if (d.status === 'completed') {
            toast.success(`Campaign completed — ${d.sent} sent, ${d.failed} failed ✓`);
          } else {
            toast.error('Campaign failed. Check your backend logs.');
          }
        }
      },
      err => console.error('[WA-Progress]', err.message)
    );
    unsubRef.current = unsub;
    return () => { unsub(); unsubRef.current = null; };
  }, [activeCampaign?.id]);

  // ── Existing customer list logic (unchanged) ──────────────────────────────
  const allCustomers = useMemo(() => buildCustomerList(orders), [orders]);

  const customers = useMemo(() => {
    const now = new Date();
    if (filter === 'frequent') return allCustomers.filter(c => c.orderCount >= 2);
    if (filter === 'recent') {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 14);
      return allCustomers.filter(c => c.lastOrder && c.lastOrder > cutoff);
    }
    return allCustomers;
  }, [allCustomers, filter]);

  const toggleCustomer = (phone) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers.map(c => c.phone)));
    }
  };

  const applyTemplate = (tpl) => {
    setTemplate(tpl.id);
    setMessage(tpl.text(cafe));
  };

  // ── Build validated + deduped customer payload ────────────────────────────
  const buildValidCustomers = () => {
    const seen  = new Set();
    const valid = [];
    for (const phone of selected) {
      const digits = String(phone || '').replace(/\D/g, '');
      if (!digits || digits.length < 10) continue;
      if (seen.has(digits)) continue;
      seen.add(digits);
      const c = allCustomers.find(x => x.phone === phone);
      valid.push({ phone: digits, name: c?.name || 'Customer' });
      if (valid.length >= 200) break;
    }
    return valid;
  };

  // ── Send handler — upgraded to backend campaign API ───────────────────────
  const handleSend = async () => {
    if (!message.trim())     { toast.error('Write a message first'); return; }
    if (selected.size === 0) { toast.error('Select at least one customer'); return; }
    if (!backendUrl) {
      toast.error('Backend URL not set. Go to Settings → Payment Settings.'); return;
    }

    const validCustomers = buildValidCustomers();
    if (validCustomers.length === 0) {
      toast.error('No valid phone numbers in selection.'); return;
    }

    setSending(true);
    setSent(0);
    setActiveCampaign(null);

    try {
      const resp = await fetch(`${backendUrl}/api/send-whatsapp-campaign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cafeId, customers: validCustomers, message: message.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `Server error ${resp.status}`);

      setActiveCampaign({ id: json.campaignId, total: json.total, sent: 0, failed: 0, status: 'processing' });
      setSelected(new Set());
      toast.success(`Campaign started — ${json.total} recipients queued ✓`);
    } catch (err) {
      console.error('[WA-Campaign] Launch failed:', err.message);
      toast.error(`Failed to start campaign: ${err.message}`);
      setSending(false);
    }
  };

  // ── inputCls (preserved from original) ───────────────────────────────────
  const inputCls = `w-full ${T.input} rounded-lg px-4 py-3 text-sm transition-all outline-none`;

  // ── Date formatter ────────────────────────────────────────────────────────
  const fmtDate = (val) => {
    if (!val) return '—';
    try {
      const d = val?.toDate?.() || (val instanceof Date ? val : new Date(val));
      return d.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return '—'; }
  };

  // ─── valid count for send button label ───────────────────────────────────
  const validCount    = buildValidCustomers().length;
  const skippedCount  = selected.size - validCount;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header (unchanged) ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`${T.heading} font-bold text-2xl`} style={{ fontFamily: 'Playfair Display, serif' }}>
            WhatsApp Marketing
          </h2>
          <p className={`${T.muted} text-sm mt-1`}>
            {allCustomers.length} unique customers · {orders?.length || 0} total orders
          </p>
        </div>
      </div>

      {/* ── Live campaign progress (NEW) ── */}
      <AnimatePresence>
        {activeCampaign && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`${T.card} rounded-xl p-5`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {activeCampaign.status === 'processing' && (
                  <div className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
                )}
                <h3 className={`${T.heading} font-semibold text-sm`}>Campaign Progress</h3>
              </div>
              <StatusBadge status={activeCampaign.status} />
            </div>

            <ProgressBar sent={activeCampaign.sent || 0} total={activeCampaign.total || 1} />

            <div className="flex justify-between mt-3 text-xs">
              <span className="text-emerald-400 font-semibold">✓ Sent: {activeCampaign.sent || 0}</span>
              {(activeCampaign.failed || 0) > 0 && (
                <span className="text-red-400 font-semibold">✗ Failed: {activeCampaign.failed}</span>
              )}
              <span className={T.faint}>Total: {activeCampaign.total}</span>
            </div>

            {activeCampaign.status === 'completed' && (
              <div className="mt-3 p-3 rounded-lg text-sm font-semibold text-emerald-400 text-center"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                ✓ Campaign completed successfully
              </div>
            )}
            {activeCampaign.status === 'failed' && (
              <div className="mt-3 p-3 rounded-lg text-sm font-semibold text-red-400 text-center"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                ✗ Campaign failed — check backend logs
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2-column layout (unchanged) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left — Compose (unchanged structure, extended send button) */}
        <div className="space-y-4">
          <div className={`${T.card} rounded-xl p-5`}>
            <h3 className={`${T.heading} font-semibold mb-4 flex items-center gap-2`}>
              <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
              Compose Message
            </h3>

            {/* Templates (unchanged) */}
            <div className="mb-4">
              <p className={`${T.muted} text-xs uppercase tracking-wide mb-2 flex items-center gap-1`}>
                <Sparkles className="w-3 h-3" />
                Quick Templates
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="text-xs px-3 py-2 rounded-lg text-left transition-all border"
                    style={template === tpl.id
                      ? { background: '#D4AF37', color: '#000', borderColor: '#D4AF37' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#A3A3A3', borderColor: 'rgba(255,255,255,0.08)' }
                    }
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message textarea (unchanged) */}
            <div>
              <label className={`block ${T.label} text-sm font-medium mb-2`}>Message</label>
              <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setTemplate(''); }}
                placeholder="Type your marketing message here... (Supports WhatsApp formatting: *bold*, _italic_)"
                rows={8}
                className={`${inputCls} resize-none`}
              />
              <p className={`${T.faint} text-xs mt-1`}>{message.length} characters</p>
            </div>

            {/* Validation summary (NEW) */}
            {selected.size > 0 && (
              <div className="mt-3 p-3 rounded-lg text-xs space-y-1"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                <p className={`${T.heading} font-semibold`}>
                  Ready to send:{' '}
                  <span className="text-[#D4AF37]">{validCount}</span>
                  {validCount >= 200 && (
                    <span className="text-amber-400 ml-1">(capped at 200)</span>
                  )}
                </p>
                {skippedCount > 0 && (
                  <p className="text-amber-400">
                    ⚠ {skippedCount} skipped (invalid or duplicate numbers)
                  </p>
                )}
              </div>
            )}

            {/* Send button (extended state) */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={sending || selected.size === 0 || !message.trim()}
              className="w-full mt-4 py-3 rounded-xl text-black font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Campaign Running…{' '}
                  {activeCampaign
                    ? `${activeCampaign.sent || 0} / ${activeCampaign.total}`
                    : ''}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send to {validCount || selected.size} Customer{selected.size !== 1 ? 's' : ''}
                </>
              )}
            </motion.button>

            {/* Backend URL warning (NEW) */}
            {!backendUrl && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg text-xs"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Backend URL not configured — go to Settings → Payment Settings.
              </div>
            )}

            {selected.size > 0 && backendUrl && (
              <p className={`${T.faint} text-xs text-center mt-2`}>
                Messages processed via backend queue — no popup blocking
              </p>
            )}
          </div>
        </div>

        {/* Right — Customer list (unchanged exactly) */}
        <div className={`${T.card} rounded-xl overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${T.border}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`${T.heading} font-semibold flex items-center gap-2`}>
                <Users className="w-4 h-4 text-[#D4AF37]" />
                Customers ({customers.length})
              </h3>
              <button
                onClick={toggleAll}
                className="text-xs px-3 py-1.5 rounded-lg border transition-all"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#A3A3A3' }}
              >
                {selected.size === customers.length && customers.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex gap-2">
              {[
                { id: 'all',      label: 'All',      icon: Users },
                { id: 'frequent', label: 'Frequent',  icon: Star  },
                { id: 'recent',   label: 'Recent',   icon: Clock },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => { setFilter(f.id); setSelected(new Set()); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={filter === f.id
                    ? { background: '#D4AF37', color: '#000' }
                    : { background: 'rgba(255,255,255,0.05)', color: '#A3A3A3' }
                  }
                >
                  <f.icon className="w-3 h-3" />
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '460px' }}>
            {customers.length === 0 ? (
              <div className="text-center py-12">
                <Users className={`w-10 h-10 mx-auto mb-3 ${T.muted}/30`} />
                <p className={`${T.muted} text-sm`}>No customers match this filter</p>
              </div>
            ) : (
              <AnimatePresence>
                {customers.map((c, i) => {
                  const isSelected = selected.has(c.phone);
                  return (
                    <motion.div
                      key={c.phone}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => toggleCustomer(c.phone)}
                      className={`flex items-center gap-3 px-5 py-3 border-b ${T.border} cursor-pointer transition-all hover:bg-white/3`}
                      style={isSelected ? { background: 'rgba(212,175,55,0.06)' } : {}}
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                        style={isSelected
                          ? { background: '#D4AF37' }
                          : { border: '1px solid rgba(255,255,255,0.2)' }
                        }>
                        {isSelected && <Check className="w-3 h-3 text-black" />}
                      </div>

                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`${T.label} text-sm font-medium truncate`}>{c.name}</p>
                        <p className={`${T.faint} text-xs`}>
                          {c.phone} · {c.orderCount} order{c.orderCount !== 1 ? 's' : ''} · {CUR}{c.totalSpend.toFixed(0)}
                        </p>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        {c.orderCount >= 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] font-semibold">
                            VIP
                          </span>
                        )}
                        {c.lastOrder && (new Date() - c.lastOrder) < 7 * 24 * 3600 * 1000 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                            NEW
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {selected.size > 0 && (
            <div className={`px-5 py-3 border-t ${T.border} flex items-center justify-between`}>
              <p className="text-[#D4AF37] text-sm font-semibold">{selected.size} selected</p>
              <button onClick={() => setSelected(new Set())} className={`${T.faint} hover:${T.body} text-xs transition-colors`}>
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Campaign History (NEW) ── */}
      <div className={`${T.card} rounded-xl overflow-hidden`}>
        <button
          onClick={() => setHistoryOpen(v => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 border-b ${T.border} transition-all`}
        >
          <h3 className={`${T.heading} font-semibold flex items-center gap-2`}>
            <History className="w-4 h-4 text-[#D4AF37]" />
            Campaign History
            {campaigns.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                {campaigns.length}
              </span>
            )}
          </h3>
          {historyOpen
            ? <ChevronUp className={`w-4 h-4 ${T.muted}`} />
            : <ChevronDown className={`w-4 h-4 ${T.muted}`} />
          }
        </button>

        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              {campaigns.length === 0 ? (
                <div className="text-center py-10">
                  <History className={`w-8 h-8 mx-auto mb-2 ${T.muted} opacity-30`} />
                  <p className={`${T.muted} text-sm`}>No campaigns sent yet</p>
                </div>
              ) : (
                <>
                  {/* Header row */}
                  <div className={`grid px-5 py-2 text-xs font-semibold uppercase tracking-wide ${T.muted} border-b ${T.border}`}
                    style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr' }}>
                    <span>Date</span>
                    <span className="text-center">Total</span>
                    <span className="text-center">Sent</span>
                    <span className="text-center">Failed</span>
                    <span className="text-center">Status</span>
                  </div>

                  {campaigns.map((c, i) => (
                    <div key={c.id}
                      className={`grid items-center px-5 py-3 border-b ${T.border} text-sm`}
                      style={{
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      }}
                    >
                      <div>
                        <p className={`${T.heading} text-xs font-medium`}>{fmtDate(c.createdAt)}</p>
                        {c.message && (
                          <p className={`${T.faint} text-xs truncate max-w-[180px]`} title={c.message}>
                            {c.message.slice(0, 50)}{c.message.length > 50 ? '…' : ''}
                          </p>
                        )}
                      </div>
                      <p className={`${T.heading} text-center font-semibold`}>{c.total ?? '—'}</p>
                      <p className="text-center font-semibold text-emerald-400">{c.sent ?? '—'}</p>
                      <p className={`text-center font-semibold ${(c.failed || 0) > 0 ? 'text-red-400' : T.faint}`}>
                        {c.failed ?? '—'}
                      </p>
                      <div className="flex justify-center">
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};

export default WhatsAppMarketing;
