/**
 * KitchenDashboardTab.jsx
 *
 * Shown when the cafe owner clicks "Kitchen" in the dashboard sidebar.
 * Provides:
 *   1. A live summary of active orders by status (mirrors the KDS).
 *   2. A button to open the full Kitchen Display in a new tab.
 *   3. Quick status update capability (same as OrdersManagement).
 */

import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsCrossed, ExternalLink, ChefHat, Bell,
  Flame, CheckCircle2, Clock, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

// Status column config (same accent palette as KitchenDisplay)
const COLS = [
  { id: 'new',       label: 'New',       icon: Bell,         accent: '#3B82F6', bg: 'rgba(59,130,246,0.08)'  },
  { id: 'preparing', label: 'Preparing', icon: Flame,        accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
  { id: 'ready',     label: 'Ready',     icon: CheckCircle2, accent: '#10B981', bg: 'rgba(16,185,129,0.08)'  },
];

const NEXT = { new: 'preparing', preparing: 'ready', ready: 'completed' };
const NEXT_LABEL = { new: 'Start Preparing', preparing: 'Mark Ready', ready: 'Complete' };
const NEXT_COLOR = { new: '#F59E0B', preparing: '#10B981', ready: '#8B5CF6' };

const KitchenDashboardTab = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;

  const { data: orders,  loading } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe              } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();

  // Kitchen URL — same cafeId used for the QR ordering page
  const kitchenUrl = cafeId ? `${window.location.origin}/kitchen/${cafeId}` : '';

  // Active (non-completed, non-cancelled) orders sorted newest first
  const activeOrders = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter(o => o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled')
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta; // newest first
      });
  }, [orders]);

  const columns = COLS.map(col => ({
    ...col,
    orders: activeOrders.filter(o => o.orderStatus === col.id),
  }));

  const advanceStatus = async (orderId, currentStatus) => {
    const next = NEXT[currentStatus];
    if (!next) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), { orderStatus: next });
      toast.success(`Order moved to ${next}`);
    } catch {
      toast.error('Failed to update order status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className={`${T.card} rounded-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
            <ChefHat className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <div>
            <h3 className={`text-xl font-semibold ${T.heading}`} style={{ fontFamily: 'Playfair Display, serif' }}>
              Kitchen Display System
            </h3>
            <p className={`${T.muted} text-sm mt-0.5`}>
              Open this URL on your kitchen tablet for a full-screen live view.
            </p>
          </div>
        </div>
        <a
          href={kitchenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm transition-all text-sm whitespace-nowrap"
        >
          <ExternalLink className="w-4 h-4" />
          Open Kitchen Screen
        </a>
      </div>

      {/* ── Kitchen URL copy strip ───────────────────────────────────────── */}
      <div className={`${T.card} rounded-sm px-4 py-3 flex items-center gap-3`}>
        <span className={`${T.muted} text-xs flex-shrink-0`}>Kitchen URL:</span>
        <code className="text-[#D4AF37] text-xs font-mono flex-1 truncate">{kitchenUrl}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(kitchenUrl); toast.success('Kitchen URL copied!'); }}
          className={`text-[#A3A3A3] hover:${T.body} text-xs px-3 py-1 border ${T.borderMd} rounded hover:border-white/20 transition-all flex-shrink-0`}
        >
          Copy
        </button>
      </div>

      {/* ── Live status summary counters ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {columns.map(col => {
          const Icon = col.icon;
          return (
            <div
              key={col.id}
              className={`${T.card} rounded-sm p-5 flex items-center gap-4`}
              style={{ borderLeft: `3px solid ${col.accent}` }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: col.bg }}
              >
                <Icon className="w-5 h-5" style={{ color: col.accent }} />
              </div>
              <div>
                <p className="text-3xl font-bold" style={{ color: col.accent }}>
                  {col.orders.length}
                </p>
                <p className={`${T.muted} text-xs uppercase tracking-wide`}>{col.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Active order cards ───────────────────────────────────────────── */}
      {activeOrders.length === 0 ? (
        <div className={`${T.card} rounded-sm p-12 text-center`}>
          <UtensilsCrossed className={`w-12 h-12 ${T.muted} mx-auto mb-3`} />
          <p className={`${T.muted}`}>No active orders in the kitchen right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className={`${T.heading} font-semibold text-sm uppercase tracking-wide text-[#A3A3A3]`}>
            Active Orders — {activeOrders.length} total
          </h4>
          <AnimatePresence mode="popLayout">
            {activeOrders.map(order => {
              const colMeta = COLS.find(c => c.id === order.orderStatus) || COLS[0];
              const Icon    = colMeta.icon;
              const elapsed = (() => {
                if (!order.createdAt) return '';
                const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                const s = Math.floor((Date.now() - d.getTime()) / 1000);
                if (s < 60) return `${s}s`;
                return `${Math.floor(s / 60)}m`;
              })();

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{    opacity: 0, y: -6  }}
                  className={`${T.card} rounded-sm overflow-hidden flex items-stretch`}
                >
                  {/* Status colour bar */}
                  <div className="w-1 flex-shrink-0" style={{ backgroundColor: colMeta.accent }} />

                  <div className="flex-1 px-4 py-3 flex items-start gap-4 flex-wrap">
                    {/* Order # + table */}
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <span className="text-[#D4AF37] font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                        #{order.orderNumber ? String(order.orderNumber).padStart(3,'0') : order.id.slice(0,6)}
                      </span>
                      {order.tableNumber && (
                        <span className={`text-xs ${T.muted}`}>T{order.tableNumber}</span>
                      )}
                    </div>

                    {/* Status badge */}
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: colMeta.bg, color: colMeta.accent }}
                    >
                      <Icon className="w-3 h-3" />
                      {colMeta.label}
                    </span>

                    {/* Items summary — with comboItems and addons */}
                    <div className={`flex-1 text-sm ${T.muted} min-w-0`}>
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="mb-0.5">
                          <span>{item.name} ×{item.quantity}</span>
                          {/* comboItems under item */}
                          {item.comboItems?.length > 0 && (
                            <div className="ml-2 mt-0.5">
                              {item.comboItems.map((ci, cIdx) => (
                                <span key={cIdx} className="block text-xs opacity-70">
                                  — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* addons under item */}
                          {item.addons?.length > 0 && (
                            <span className="block text-xs opacity-70 ml-2">
                              + {item.addons.map(a => a.name).join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Elapsed */}
                    <div className="flex items-center gap-1 text-xs text-[#666] flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {elapsed}
                    </div>

                    {/* Advance button */}
                    {NEXT[order.orderStatus] && (
                      <button
                        onClick={() => advanceStatus(order.id, order.orderStatus)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold text-black transition-all flex-shrink-0"
                        style={{ backgroundColor: NEXT_COLOR[order.orderStatus] }}
                      >
                        <ArrowRight className="w-3 h-3" />
                        {NEXT_LABEL[order.orderStatus]}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default KitchenDashboardTab;
