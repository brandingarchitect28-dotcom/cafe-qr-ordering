/**
 * WhatsAppMarketing.jsx
 *
 * Task 9: WhatsApp marketing system.
 * - Load customers from orders collection
 * - Filter: all, frequent, recent
 * - Compose message (manual or template)
 * - Open wa.me links for each selected customer
 * - Bulk send via sequential WhatsApp opens
 */

import { formatWhatsAppNumber } from '../../utils/whatsapp';
import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Users, Send, Filter, Check, X, ChevronDown, Star, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

// ─── message templates ────────────────────────────────────────────────────────

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

// ─── customer processing ──────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

const WhatsAppMarketing = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';

  const [filter,    setFilter  ] = useState('all'); // all | frequent | recent
  const [selected,  setSelected] = useState(new Set());
  const [message,   setMessage ] = useState('');
  const [template,  setTemplate] = useState('');
  const [sending,   setSending ] = useState(false);
  const [sent,      setSent    ] = useState(0);

  // Build deduplicated customer list
  const allCustomers = useMemo(() => buildCustomerList(orders), [orders]);

  // Apply filter
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

  // Open WhatsApp for each selected customer sequentially
  const handleSend = async () => {
    if (!message.trim()) { toast.error('Write a message first'); return; }
    if (selected.size === 0) { toast.error('Select at least one customer'); return; }

    setSending(true);
    setSent(0);
    let count = 0;

    for (const phone of selected) {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      count++;
      setSent(count);
      // Small delay between opens to avoid popup blocking
      await new Promise(r => setTimeout(r, 600));
    }

    toast.success(`Opened WhatsApp for ${count} customer${count !== 1 ? 's' : ''} ✓`);
    setSending(false);
    setSelected(new Set());
  };

  const inputCls = 'w-full ${T.innerCard} border ${T.borderMd} text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-lg px-4 py-3 text-sm transition-all outline-none';

  return (
    <div className="space-y-6">
      {/* Header */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left — Compose message */}
        <div className="space-y-4">
          <div className={`${T.card} rounded-xl p-5`}>
            <h3 className={`${T.heading} font-semibold mb-4 flex items-center gap-2`}>
              <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
              Compose Message
            </h3>

            {/* Templates */}
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

            {/* Message */}
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

            {/* Send button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={sending || selected.size === 0 || !message.trim()}
              className="w-full mt-4 py-3 rounded-xl text-black font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
            >
              {sending
                ? <><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Sending {sent}/{selected.size}...</>
                : <><Send className="w-4 h-4" />Send to {selected.size} Customer{selected.size !== 1 ? 's' : ''}</>
              }
            </motion.button>
            {selected.size > 0 && (
              <p className={`${T.faint} text-xs text-center mt-2`}>
                WhatsApp will open for each customer. Allow popups.
              </p>
            )}
          </div>
        </div>

        {/* Right — Customer list */}
        <div className={`${T.card} rounded-xl overflow-hidden`}>
          {/* Filters */}
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

          {/* List */}
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
                      {/* Checkbox */}
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                        style={isSelected
                          ? { background: '#D4AF37' }
                          : { border: '1px solid rgba(255,255,255,0.2)' }
                        }>
                        {isSelected && <Check className="w-3 h-3 text-black" />}
                      </div>

                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`${T.label} text-sm font-medium truncate`}>{c.name}</p>
                        <p className={`${T.faint} text-xs`}>
                          {c.phone} · {c.orderCount} order{c.orderCount !== 1 ? 's' : ''} · {CUR}{c.totalSpend.toFixed(0)}
                        </p>
                      </div>

                      {/* Badges */}
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

          {/* Selected count */}
          {selected.size > 0 && (
            <div className={`px-5 py-3 border-t ${T.border} flex items-center justify-between`}>
              <p className="text-[#D4AF37] text-sm font-semibold">{selected.size} selected</p>
              <button onClick={() => setSelected(new Set())} className={`text-[#555] hover:${T.body} text-xs transition-colors`}>
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppMarketing;
