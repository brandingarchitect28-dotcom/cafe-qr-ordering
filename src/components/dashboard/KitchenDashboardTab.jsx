import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsCrossed, ExternalLink, ChefHat, Bell, Flame, CheckCircle2, Clock, ArrowRight,
  Package, Armchair, Bike, ShoppingBag, Monitor, Link2, Utensils, Sparkles, Coffee,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

if (typeof document !== 'undefined' && !document.getElementById('kdt-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'kdt-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .kdt { font-family: 'DM Sans', system-ui, sans-serif; }
    .kdt-title { font-family: 'Playfair Display', serif !important; }
    .kdt-card { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 16px; transition: border-color 200ms, box-shadow 200ms; }
    .kdt-card:hover { border-color: rgba(201,162,39,0.22); }
    .kdt-order-card { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 14px; overflow: hidden; transition: border-color 200ms; }
    .kdt-order-card:hover { border-color: rgba(201,162,39,0.22); }
    @keyframes kdtIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .kdt-in { animation: kdtIn 280ms ease forwards; }
  `;
  document.head.appendChild(el);
}

const COLS = [
  { id: 'new',       label: 'New',       icon: Bell,         accent: '#3B82F6', bg: 'rgba(59,130,246,0.08)',  colIcon: Bell         },
  { id: 'preparing', label: 'Preparing', icon: Flame,        accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  colIcon: ChefHat      },
  { id: 'ready',     label: 'Ready',     icon: CheckCircle2, accent: '#10B981', bg: 'rgba(16,185,129,0.08)',  colIcon: CheckCircle2 },
];
const NEXT       = { new: 'preparing', preparing: 'ready', ready: 'completed' };
const NEXT_LABEL = { new: 'Start Preparing', preparing: 'Mark Ready', ready: 'Complete' };
const NEXT_COLOR = { new: '#F59E0B', preparing: '#10B981', ready: '#8B5CF6' };

const KitchenDashboardTab = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: orders, loading } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const kitchenUrl = cafeId ? `${window.location.origin}/kitchen/${cafeId}` : '';

  const activeOrders = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter(o => o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled')
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });
  }, [orders]);

  const columns = COLS.map(col => ({ ...col, orders: activeOrders.filter(o => o.orderStatus === col.id) }));

  const advanceStatus = async (orderId, currentStatus) => {
    const next = NEXT[currentStatus];
    if (!next) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), { orderStatus: next });
      toast.success(`Order moved to ${next}`);
    } catch { toast.error('Failed to update order status'); }
  };

  if (loading) return (
    <div className="kdt flex flex-col items-center justify-center py-20 gap-3">
      {/* 🍳 → ChefHat */}
      <ChefHat className="w-10 h-10 animate-bounce" style={{ color: '#C9A227' }} />
      <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading kitchen…</p>
    </div>
  );

  return (
    <div className="kdt space-y-5">
      <div className="kdt-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* 👨‍🍳 → ChefHat */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.2)' }}>
            <ChefHat className="w-6 h-6" style={{ color: '#C9A227' }} />
          </div>
          <div>
            <h3 className="text-lg font-black text-white kdt-title">Kitchen Display System</h3>
            <p className="text-xs font-semibold mt-0.5" style={{ color: '#7a6a55' }}>Open on your kitchen tablet for a full-screen live view</p>
          </div>
        </div>
        <a href={kitchenUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 font-black rounded-xl text-sm whitespace-nowrap text-black transition-all"
          style={{ background: 'linear-gradient(135deg,#C9A227,#A67C00)', boxShadow: '0 4px 16px rgba(201,162,39,0.3)' }}>
          {/* 🖥️ → Monitor */}
          <ExternalLink className="w-4 h-4" /><Monitor className="inline w-4 h-4 mr-1" /> Open Kitchen Screen
        </a>
      </div>
      <div className="kdt-card px-4 py-3 flex items-center gap-3">
        {/* 🔗 → Link2 */}
        <span className="text-xs font-bold flex-shrink-0 flex items-center gap-1" style={{ color: '#7a6a55' }}><Link2 className="w-3 h-3" /> Kitchen URL:</span>
        <code className="text-xs font-mono flex-1 truncate" style={{ color: '#C9A227' }}>{kitchenUrl}</code>
        <button onClick={() => { navigator.clipboard.writeText(kitchenUrl); toast.success('Kitchen URL copied! 📋'); }}
          className="text-xs px-3 py-1.5 rounded-lg font-black transition-all flex-shrink-0"
          style={{ background: 'rgba(201,162,39,0.1)', color: '#C9A227', border: '1.5px solid rgba(201,162,39,0.2)' }}>Copy</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {columns.map(col => (
          <div key={col.id} className="kdt-card p-4 flex items-center gap-3" style={{ borderLeft: `3px solid ${col.accent}` }}>
            {/* col.emoji (🆕 👨‍🍳 ✅) → col.colIcon component */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: col.bg }}>
              <col.colIcon className="w-5 h-5" style={{ color: col.accent }} />
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: col.accent }}>{col.orders.length}</p>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#7a6a55' }}>{col.label}</p>
            </div>
          </div>
        ))}
      </div>
      {activeOrders.length === 0 ? (
        <div className="kdt-card p-12 text-center">
          {/* 🫙 → Package */}
          <Package className="w-12 h-12 mb-3 mx-auto" style={{ color: '#3a2e1a' }} />
          <p className="font-bold" style={{ color: '#7a6a55' }}>No active orders in the kitchen right now</p>
          {/* ✨ → Sparkles inline */}
          <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: '#4a3f35' }}>Orders will appear here in real-time <Sparkles className="w-3 h-3" /></p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 🍴 → Utensils inline */}
          <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1" style={{ color: '#C9A227' }}><Utensils className="w-3.5 h-3.5" /> Active Orders — {activeOrders.length} total</p>
          <AnimatePresence mode="popLayout">
            {activeOrders.map(order => {
              const colMeta = COLS.find(c => c.id === order.orderStatus) || COLS[0];
              const elapsed = (() => {
                if (!order.createdAt) return '';
                const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                const s = Math.floor((Date.now() - d.getTime()) / 1000);
                if (s < 60) return `${s}s`;
                return `${Math.floor(s / 60)}m`;
              })();
              return (
                <motion.div key={order.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="kdt-order-card">
                  <div style={{ height: 3, background: `linear-gradient(90deg, ${colMeta.accent}, transparent)` }} />
                  <div className="flex items-start gap-4 px-4 py-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-[90px]">
                      {/* 🪑 → Armchair, 🛵 → Bike, 🥡 → ShoppingBag */}
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.18)' }}>
                        {order.orderType === 'dine-in'
                          ? <Armchair className="w-5 h-5" style={{ color: '#C9A227' }} />
                          : order.orderType === 'delivery'
                            ? <Bike className="w-5 h-5" style={{ color: '#C9A227' }} />
                            : <ShoppingBag className="w-5 h-5" style={{ color: '#C9A227' }} />}
                      </div>
                      <span className="font-black text-sm kdt-title" style={{ color: '#C9A227' }}>
                        #{order.orderNumber ? String(order.orderNumber).padStart(3,'0') : order.id.slice(0,6)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black"
                      style={{ backgroundColor: colMeta.bg, color: colMeta.accent, border: `1.5px solid ${colMeta.accent}30` }}>
                      {/* colMeta.emoji → colMeta.colIcon */}
                      <colMeta.colIcon className="w-3 h-3" /> {colMeta.label}
                    </span>
                    {order.tableNumber && (
                      <span className="text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.05)', color: '#A3A3A3' }}>
                        {/* 🪑 → Armchair */}
                        <Armchair className="w-3 h-3" /> Table {order.tableNumber}
                      </span>
                    )}
                    <div className="flex-1 text-sm min-w-0" style={{ color: '#7a6a55' }}>
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="mb-0.5">
                          {/* 🍴 → Utensils inline */}
                          <span className="font-semibold flex items-center gap-1"><Utensils className="w-3 h-3 flex-shrink-0" /> {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''} ×{item.quantity}</span>
                          {item.comboItems?.length > 0 && item.comboItems.map((ci, cIdx) => (
                            <span key={cIdx} className="block text-xs opacity-70 ml-3">— {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}</span>
                          ))}
                          {/* ✨ → Sparkles inline */}
                          {item.addons?.length > 0 && <span className="block text-xs opacity-70 ml-3 flex items-center gap-1"><Sparkles className="w-3 h-3" /> {item.addons.map(a => a.name).join(', ')}</span>}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs flex-shrink-0 font-bold" style={{ color: '#4a3f35' }}>
                      <Clock className="w-3 h-3" />{elapsed}
                    </div>
                    {NEXT[order.orderStatus] && (
                      <button onClick={() => advanceStatus(order.id, order.orderStatus)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-black transition-all flex-shrink-0"
                        style={{ background: NEXT_COLOR[order.orderStatus], boxShadow: `0 3px 12px ${NEXT_COLOR[order.orderStatus]}40` }}>
                        <ArrowRight className="w-3 h-3" />{NEXT_LABEL[order.orderStatus]}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      <div className="flex items-center justify-center gap-2 py-2">
        {/* ☕ → Coffee */}
        <Coffee className="w-4 h-4" style={{ color: '#7a6a55' }} />
        <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>{activeOrders.length} active order{activeOrders.length !== 1 ? 's' : ''} · Live kitchen feed active</p>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
      </div>
    </div>
  );
};

export default KitchenDashboardTab;
