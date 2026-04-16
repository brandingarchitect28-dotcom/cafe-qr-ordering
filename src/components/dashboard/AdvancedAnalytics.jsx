/**
 * AdvancedAnalytics.jsx
 *
 * Features 1–5, 9:
 * 1. Custom date range picker (from/to)
 * 2. Chart explanations + fixed white tooltips
 * 3. Service charges in all figures
 * 4. Category-wise breakdown
 * 5. Payment + source breakdown
 *
 * UI UPGRADE (safe-only):
 * - Premium StatCard with colored border accent + glow
 * - SectionCard with dark header bar + explanation panel
 * - CustomTooltip with glass styling
 * - Grouped toolbar buttons
 * - Gradient category bars
 * - Enhanced growth + customer cards
 * ALL logic, calculations, hooks, APIs — 100% unchanged.
 */

import { formatWhatsAppNumber } from '../../utils/whatsapp';
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument, useCollection } from '../../hooks/useFirestore';
import { useAdvancedAnalytics } from '../../hooks/useAdvancedAnalytics';
import { where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, ShoppingBag, IndianRupee, Download, MessageSquare,
  RefreshCw, Clock, Package, Star, BarChart2, FileText, AlertCircle, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadPDFReport, downloadGSTCSV, buildWhatsAppReport } from '../../services/pdfReportService';
import { useTheme } from '../../hooks/useTheme';

// ─── constants — UNCHANGED ────────────────────────────────────────────────────
const COLORS = ['#D4AF37','#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

// ─── Safe string helper — UNCHANGED ──────────────────────────────────────────
const safeLower = (v) => {
  if (typeof v === 'string') return v.toLowerCase();
  if (v === null || v === undefined) return '';
  return String(v).toLowerCase();
};

// ─── CustomTooltip — logic UNCHANGED, styling upgraded ───────────────────────
const CustomTooltip = ({ active, payload, label, CUR = '₹', T: TProp }) => {
  const T = TProp || { card: 'bg-[#0F0F0F] border border-white/5', muted: 'text-[#A3A3A3]', heading: 'text-white', faint: 'text-[#555]', border: 'border-white/5' };
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(10,10,10,0.96)',
      border: '1px solid rgba(212,175,55,0.35)',
      borderRadius: 10,
      padding: '12px 16px',
      color: '#fff',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.1)',
      backdropFilter: 'blur(12px)',
      minWidth: 140,
    }}>
      {label && (
        <p style={{ color: '#D4AF37', fontWeight: 700, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: '#fff', fontSize: 13, margin: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: p.color || '#D4AF37', fontSize: 8 }}>◆</span>
          <span style={{ color: '#A3A3A3', fontSize: 11 }}>{p.name}:</span>
          <strong style={{ color: '#fff' }}>
            {typeof p.value === 'number' && safeLower(p.name).includes('revenue')
              ? `${CUR}${p.value.toFixed(2)}`
              : p.value}
          </strong>
        </p>
      ))}
    </div>
  );
};

// ─── StatCard — logic UNCHANGED, styling upgraded ─────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, color, index, T }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.06, duration: 0.4 }}
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    className={`relative rounded-xl p-5 overflow-hidden cursor-default`}
    style={{
      background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(20,20,20,0.95) 100%)',
      border: `1px solid rgba(255,255,255,0.07)`,
      borderLeft: `3px solid ${color}`,
      boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)`,
    }}
  >
    {/* Ambient glow */}
    <div style={{
      position: 'absolute', top: 0, right: 0, width: 80, height: 80,
      background: `radial-gradient(circle at 100% 0%, ${color}18 0%, transparent 70%)`,
      pointerEvents: 'none',
    }} />

    <div className="flex items-center justify-between mb-3">
      <p style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {label}
      </p>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 15, height: 15, color }} />
      </div>
    </div>

    <p style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1, fontFamily: 'Playfair Display, serif' }}>
      {value}
    </p>
    {sub && (
      <p style={{ color: '#555', fontSize: 11, marginTop: 6, fontWeight: 500 }}>{sub}</p>
    )}
  </motion.div>
);

// ─── SectionCard — logic UNCHANGED, styling upgraded ─────────────────────────
// Chart container height is always stable — no collapse, no mount/unmount risk.
const SectionCard = ({ title, icon: Icon, explanation, children, delay = 0, T }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    style={{
      background: 'linear-gradient(180deg, rgba(15,15,15,0.99) 0%, rgba(12,12,12,0.98) 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
    }}
  >
    {/* Header bar */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 20px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'rgba(212,175,55,0.12)',
        border: '1px solid rgba(212,175,55,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon style={{ width: 14, height: 14, color: '#D4AF37' }} />
      </div>
      <h3 style={{
        color: '#fff', fontWeight: 600, fontSize: 14, flex: 1,
        fontFamily: 'Playfair Display, serif',
      }}>
        {title}
      </h3>
      {/* Subtle gold accent line */}
      <div style={{ width: 24, height: 2, background: 'linear-gradient(90deg, #D4AF37, transparent)', borderRadius: 2 }} />
    </div>

    <div style={{ padding: 20 }}>
      {/* Explanation panel — styled as an insight card */}
      {explanation && (
        <div style={{
          marginBottom: 18,
          padding: '10px 14px',
          background: 'rgba(212,175,55,0.04)',
          border: '1px solid rgba(212,175,55,0.12)',
          borderRadius: 8,
          borderLeft: '3px solid rgba(212,175,55,0.4)',
        }}>
          <p style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>
            <span style={{ color: '#D4AF37', fontWeight: 700, marginRight: 6, fontSize: 10 }}>INSIGHT</span>
            {explanation}
          </p>
        </div>
      )}
      {children}
    </div>
  </motion.div>
);

// ─── Skeleton — UNCHANGED ─────────────────────────────────────────────────────
const Skel = ({ h='h-4', w='w-full', T: TT }) => <div className={`${h} ${w} rounded ${TT ? TT.subCard : 'bg-white/5'} animate-pulse`} />;

// ─── Helpers — ALL UNCHANGED ──────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
const buildExplanation = (data, CUR='₹') => {
  if (!data) return {};
  const { revenue, payment, categories, items, gst } = data;
  const topPay  = payment?.sort((a,b)=>b.revenue-a.revenue)[0];
  const topCat  = categories?.categories?.[0];
  const topItem = items?.top?.[0];
  return {
    revenue:   `Total of ${revenue?.totalOrders} orders in the selected period. Average order value is ${CUR}${(revenue?.aov||0).toFixed(2)}.`,
    payment:   topPay  ? `${topPay.method} is the most-used payment method, contributing ${topPay.pct}% of revenue (${CUR}${topPay.revenue?.toFixed(2)}).` : '',
    category:  topCat  ? `"${topCat.category}" is the highest-earning category at ${CUR}${topCat.revenue?.toFixed(2)} (${topCat.pct}% of total revenue).` : '',
    items:     topItem ? `"${topItem.name}" is the top-selling item with ${topItem.qty} units sold, generating ${CUR}${topItem.revenue?.toFixed(2)}.` : '',
    gst:       `Total GST collected: ${CUR}${(gst?.totalGST||0).toFixed(2)} across ${gst?.byRate?.length||0} GST slab(s).`,
    profit:    `Net profit after deducting COGS and GST. ${data.profit?.hasCostData ? 'Recipe costs are included.' : 'Add recipe costs in Inventory for full profit calculation.'}`,
  };
};

// ─── Main — ALL LOGIC UNCHANGED ───────────────────────────────────────────────
const AdvancedAnalytics = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';

  // Feature 1: Custom date range — UNCHANGED
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate,   setToDate  ] = useState(today());
  const [preset,   setPreset  ] = useState('30');

  const applyPreset = (p) => {
    setPreset(p);
    setToDate(today());
    if (p === 'today') { setFromDate(today()); }
    else if (p === '7')  { setFromDate(daysAgo(7));  }
    else if (p === '30') { setFromDate(daysAgo(30)); }
    else if (p === '90') { setFromDate(daysAgo(90)); }
  };

  const { data, loading, error, lastFetch, refresh } = useAdvancedAnalytics(cafeId, fromDate, toDate);
  const serviceCharge = data?.serviceChargeTotal || 0;
  useEffect(() => {
  }, [cafeId, fromDate, toDate]);
  const explanations = useMemo(() => buildExplanation(data, CUR), [data, CUR]);

  const { data: orders } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // Growth Analysis — UNCHANGED
  const growthMetrics = useMemo(() => {
    if (!data?.revenueByDay || data.revenueByDay.length < 2) return null;
    const days = data.revenueByDay;
    const todayRev     = days[days.length - 1]?.revenue ?? 0;
    const yesterdayRev = days[days.length - 2]?.revenue ?? 0;
    const todayPct = yesterdayRev === 0
      ? (todayRev > 0 ? 100 : 0)
      : parseFloat((((todayRev - yesterdayRev) / yesterdayRev) * 100).toFixed(1));
    const rev30 = data.revenueBy30 || [];
    const thisWeekRev = rev30.slice(-7).reduce((s, d) => s + d.revenue, 0);
    const lastWeekRev = rev30.slice(-14, -7).reduce((s, d) => s + d.revenue, 0);
    const weekPct = lastWeekRev === 0
      ? (thisWeekRev > 0 ? 100 : 0)
      : parseFloat((((thisWeekRev - lastWeekRev) / lastWeekRev) * 100).toFixed(1));
    return { todayRev, yesterdayRev, todayPct, thisWeekRev, lastWeekRev, weekPct };
  }, [data]);

  // Customer Analysis — UNCHANGED
  const customerMetrics = useMemo(() => {
    if (!orders?.length) return null;
    const from = new Date(fromDate);
    const to   = new Date(toDate); to.setHours(23, 59, 59, 999);
    const lifetimeCounts = {};
    orders.forEach(o => {
      const ph = o.customerPhone?.replace(/\D/g, '');
      if (!ph || ph.length < 10) return;
      lifetimeCounts[ph] = (lifetimeCounts[ph] || 0) + 1;
    });
    const periodOrders = orders.filter(o => {
      const t = o.createdAt?.toDate?.() || new Date(0);
      return t >= from && t <= to;
    });
    const periodPhones = new Set();
    periodOrders.forEach(o => {
      const ph = o.customerPhone?.replace(/\D/g, '');
      if (ph && ph.length >= 10) periodPhones.add(ph);
    });
    let newCustomers = 0;
    periodPhones.forEach(ph => {
      const allPhoneOrders = orders.filter(o => o.customerPhone?.replace(/\D/g, '') === ph);
      const earliest = allPhoneOrders.reduce((min, o) => {
        const t = o.createdAt?.toDate?.() || new Date(9999, 0);
        return t < min ? t : min;
      }, new Date(9999, 0));
      if (earliest >= from && earliest <= to) newCustomers++;
    });
    const total  = periodPhones.size;
    const repeat = periodPhones.size > 0
      ? [...periodPhones].filter(ph => (lifetimeCounts[ph] || 0) > 1).length
      : 0;
    return { total, newCustomers, repeat };
  }, [orders, fromDate, toDate]);

  const [pdfLoading, setPdfLoading] = useState(false);

  // Export handlers — ALL UNCHANGED
  const handlePDF = () => {
    if (!data) { toast.error('No data to export'); return; }
    setPdfLoading(true);
    try {
      downloadPDFReport(data, cafe, fromDate, toDate);
      toast.success('Report downloading ✓');
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setTimeout(() => setPdfLoading(false), 1500);
    }
  };
  const handleGST = () => {
    if (!data) { toast.error('No data'); return; }
    downloadGSTCSV(data, cafe);
    toast.success('GST CSV downloaded ✓');
  };
  const handleWA = () => {
    if (!data) { toast.error('No data'); return; }
    const msg = buildWhatsAppReport(data, cafe, fromDate, toDate);
    const phone = formatWhatsAppNumber(cafe?.whatsappNumber || '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.location.href = url;
  };

  const inputCls = `${T.input} rounded-sm px-3 h-9 text-sm`;

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 26, fontFamily: 'Playfair Display, serif', lineHeight: 1.2 }}>
              Advanced Analytics
            </h2>
            {lastFetch && (
              <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>
                Last updated: {lastFetch.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Toolbar — grouped visually */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Control group */}
            <div style={{
              display: 'flex', gap: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '4px 6px',
            }}>
              <button
                onClick={refresh}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  background: 'transparent', color: '#A3A3A3',
                  fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#A3A3A3'}
              >
                <RefreshCw style={{ width: 13, height: 13 }} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={() => { applyPreset('30'); setTimeout(refresh, 50); }}
                disabled={loading}
                title="Recalculate analytics from scratch using only paid orders"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  background: 'transparent', color: '#F59E0B',
                  fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                }}
              >
                <RefreshCw style={{ width: 13, height: 13 }} />
                Reset
              </button>
            </div>

            {/* Export group */}
            <div style={{
              display: 'flex', gap: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '4px 6px',
            }}>
              <button
                onClick={handleGST}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  background: 'rgba(16,185,129,0.12)', color: '#10B981',
                  fontSize: 12, fontWeight: 700, border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer',
                }}
              >
                <FileText style={{ width: 13, height: 13 }} />
                GST CSV
              </button>
              <button
                onClick={handleWA}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  background: 'rgba(37,211,102,0.12)', color: '#25D366',
                  fontSize: 12, fontWeight: 700, border: '1px solid rgba(37,211,102,0.2)', cursor: 'pointer',
                }}
              >
                <MessageSquare style={{ width: 13, height: 13 }} />
                WhatsApp
              </button>
            </div>

            {/* PDF — primary CTA */}
            <button
              onClick={handlePDF}
              disabled={pdfLoading || !data}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                background: pdfLoading ? 'rgba(212,175,55,0.6)' : 'linear-gradient(135deg, #D4AF37, #B8962E)',
                color: '#000', fontSize: 13, fontWeight: 800,
                border: 'none', cursor: pdfLoading || !data ? 'not-allowed' : 'pointer',
                boxShadow: data ? '0 4px 16px rgba(212,175,55,0.3)' : 'none',
                transition: 'opacity 0.2s',
                opacity: (!data) ? 0.5 : 1,
              }}
            >
              {pdfLoading
                ? <><RefreshCw style={{ width: 14, height: 14 }} className="animate-spin" />Generating…</>
                : <><Download style={{ width: 14, height: 14 }} />PDF Report</>
              }
            </button>
          </div>
        </div>

        {/* Date range card — upgraded */}
        <div style={{
          background: 'rgba(12,12,12,0.98)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Calendar style={{ width: 14, height: 14, color: '#D4AF37' }} />
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Date Range</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Preset pills */}
            <div style={{
              display: 'flex', gap: 4,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: 4,
            }}>
              {[{v:'today',l:'Today'},{v:'7',l:'7 Days'},{v:'30',l:'30 Days'},{v:'90',l:'90 Days'}].map(p => (
                <button
                  key={p.v}
                  onClick={() => applyPreset(p.v)}
                  style={{
                    padding: '5px 12px', borderRadius: 6,
                    background: preset === p.v ? '#D4AF37' : 'transparent',
                    color: preset === p.v ? '#000' : '#666',
                    fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {p.l}
                </button>
              ))}
            </div>

            <span style={{ color: '#333', fontSize: 11 }}>or custom:</span>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span style={{ color: '#666', fontSize: 11 }}>From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => { setFromDate(e.target.value); setPreset('custom'); }}
                  className={inputCls}
                  max={toDate}
                />
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: '#666', fontSize: 11 }}>To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => { setToDate(e.target.value); setPreset('custom'); }}
                  className={inputCls}
                  min={fromDate}
                  max={today()}
                />
              </div>
              <button
                onClick={refresh}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  background: '#D4AF37', color: '#000',
                  fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error — UNCHANGED logic, upgraded styling */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, color: '#EF4444', fontSize: 13,
        }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Loading skeletons — UNCHANGED */}
      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_,i) => (
            <div key={i} className={`${T.card} rounded-xl p-5 space-y-3`}>
              <Skel T={T} h="h-3" w="w-1/2"/><Skel T={T} h="h-7" w="w-3/4"/>
            </div>
          ))}
        </div>
      )}

      {/* No data — UNCHANGED logic */}
      {!loading && !data && !error && (
        <div style={{
          background: 'rgba(12,12,12,0.98)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14, padding: '48px 24px', textAlign: 'center',
        }}>
          <BarChart2 style={{ width: 40, height: 40, color: '#333', margin: '0 auto 12px' }} />
          <p style={{ color: '#555' }}>No orders in selected date range.</p>
        </div>
      )}

      {data && (
        <>
          {/* ── Stat cards — 7 cards, ALL DATA UNCHANGED ──────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label:'Gross Revenue',   value:`${CUR}${data.revenue.gross.toFixed(2)}`,      sub:`${data.revenue.paidOrders} paid orders`,  icon:IndianRupee, color:'#10B981', index:0 },
              { label:'Net Revenue',     value:`${CUR}${data.revenue.netRevenue.toFixed(2)}`,  sub:'After discounts',                         icon:TrendingUp,  color:'#D4AF37', index:1 },
              { label:'Avg Order Value', value:`${CUR}${data.revenue.aov.toFixed(2)}`,         sub:'Per paid order',                          icon:ShoppingBag, color:'#3B82F6', index:2 },
              { label:'Orders (Paid)',   value:data.revenue.totalOrders,                       sub:`${fromDate} → ${toDate}`,                 icon:Package,     color:'#F59E0B', index:3 },
              { label:'GST Collected',   value:`${CUR}${data.gst.totalGST.toFixed(2)}`,        sub:`${data.gst.byRate?.length||0} slabs`,     icon:FileText,    color:'#8B5CF6', index:4 },
              { label:'Net Profit',      value:`${CUR}${data.profit.netProfit.toFixed(2)}`,    sub:`Margin: ${data.profit.margin}%`,           icon:Star,        color:data.profit.netProfit>=0?'#10B981':'#EF4444', index:5 },
              { label:'Service Charges', value:`${CUR}${Number(serviceCharge).toFixed(2)}`,   sub:'Collected from paid orders',              icon:FileText,    color:'#EC4899', index:6 },
            ].map(s => <StatCard T={T} key={s.label} {...s} />)}
          </div>

          {/* ── Revenue trend — chart DATA + logic UNCHANGED ─────── */}
          <SectionCard T={T} title="Revenue Trend" icon={TrendingUp} delay={0.1} explanation={explanations.revenue}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#333" fontSize={10} tick={{ fill: '#555' }} />
                <YAxis stroke="#333" fontSize={10} tick={{ fill: '#555' }} />
                <Tooltip content={<CustomTooltip CUR={CUR} />} />
                <Legend wrapperStyle={{ color: '#666', fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name={`Revenue (${CUR})`} stroke="#D4AF37" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="orders"  name="Orders"             stroke="#10B981" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* ── GST + Profit — DATA + logic UNCHANGED ─────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard T={T} title="GST Summary" icon={FileText} delay={0.15} explanation={explanations.gst}>
              <div className="space-y-2 mb-4">
                {(data.gst.byRate||[]).map((g,i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{
                      color: '#666', fontSize: 12,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, padding: '2px 8px',
                    }}>
                      GST {g.rate}%
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{CUR}{g.gst.toFixed(2)}</p>
                      <p style={{ color: '#444', fontSize: 11 }}>on {CUR}{g.taxable.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {!(data.gst.byRate?.length) && (
                  <p style={{ color: '#333', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                    No GST data for this period
                  </p>
                )}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', borderRadius: 8,
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.18)',
              }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Total GST</span>
                <span style={{ color: '#D4AF37', fontWeight: 900, fontSize: 18, fontFamily: 'Playfair Display, serif' }}>
                  {CUR}{data.gst.totalGST.toFixed(2)}
                </span>
              </div>
            </SectionCard>

            <SectionCard T={T} title="Profit Analysis" icon={IndianRupee} delay={0.2} explanation={explanations.profit}>
              {!data.profit.hasCostData && (
                <p style={{ color: '#444', fontSize: 11, fontStyle: 'italic', marginBottom: 12 }}>
                  Add recipe costs in Inventory → Manage Recipes to see full profit
                </p>
              )}
              {[
                { label:'Total Revenue',  val:  data.profit.totalRevenue, color:'#10B981' },
                { label:'Cost of Goods',  val: -data.profit.totalCost,   color:'#EF4444' },
                { label:'GST Collected',  val: -data.profit.totalGST,    color:'#F59E0B' },
              ].map(r => (
                <div key={r.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ color: '#666', fontSize: 13 }}>{r.label}</span>
                  <span style={{ color: r.color, fontWeight: 700, fontSize: 14 }}>
                    {r.val>=0?'+':''}{CUR}{Math.abs(r.val).toFixed(2)}
                  </span>
                </div>
              ))}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 14, marginTop: 2,
              }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Net Profit</span>
                <span style={{
                  color: data.profit.netProfit>=0 ? '#10B981' : '#EF4444',
                  fontWeight: 900, fontSize: 18, fontFamily: 'Playfair Display, serif',
                }}>
                  {CUR}{data.profit.netProfit.toFixed(2)}
                  <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6, opacity: 0.7 }}>
                    ({data.profit.margin}%)
                  </span>
                </span>
              </div>
            </SectionCard>
          </div>

          {/* ── Payment + Source — DATA + logic UNCHANGED ────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard T={T} title="Payment Methods" icon={IndianRupee} delay={0.25} explanation={explanations.payment}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.payment} cx="50%" cy="50%" outerRadius={75} dataKey="count"
                    label={({ method, pct }) => `${method}: ${pct}%`} labelLine={false}>
                    {data.payment.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip CUR={CUR} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {data.payment.map((p,i) => (
                  <span key={p.method} style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 20,
                    background: `${COLORS[i%COLORS.length]}15`,
                    color: COLORS[i%COLORS.length],
                    border: `1px solid ${COLORS[i%COLORS.length]}30`,
                    fontWeight: 600,
                  }}>
                    {p.method} {p.pct}% · {CUR}{p.revenue?.toFixed(0)}
                  </span>
                ))}
              </div>
            </SectionCard>

            <SectionCard T={T} title="Order Sources" icon={ShoppingBag} delay={0.3}
              explanation="Breakdown of where orders came from — QR code, Zomato, Swiggy, phone, walk-in.">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.source} cx="50%" cy="50%" outerRadius={75} dataKey="count"
                    label={({ source, pct }) => `${source}: ${pct}%`} labelLine={false}>
                    {data.source.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip CUR={CUR} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {data.source.map((s,i) => (
                  <span key={s.source} style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 20,
                    background: `${COLORS[i%COLORS.length]}15`,
                    color: COLORS[i%COLORS.length],
                    border: `1px solid ${COLORS[i%COLORS.length]}30`,
                    fontWeight: 600,
                  }}>
                    {s.source} {s.pct}% ({s.count})
                  </span>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* ── Peak hours — DATA + logic UNCHANGED ──────────────── */}
          <SectionCard T={T} title="Peak Hours" icon={Clock} delay={0.35}
            explanation="Hours with the most orders. Use this to plan staffing and kitchen prep.">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.peakHours.slice(6,24)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="label" stroke="#333" fontSize={9} tick={{ fill: '#555' }} interval={1} />
                <YAxis stroke="#333" fontSize={9} tick={{ fill: '#555' }} />
                <Tooltip content={<CustomTooltip CUR={CUR} />} />
                <Bar dataKey="count" name="Orders" fill="#D4AF37" radius={[4,4,0,0]}>
                  {data.peakHours.slice(6,24).map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.count === Math.max(...data.peakHours.slice(6,24).map(h => h.count))
                        ? '#D4AF37'
                        : 'rgba(212,175,55,0.45)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* ── Category — DATA + logic UNCHANGED ─────────────────── */}
          <SectionCard T={T} title="Category Performance" icon={BarChart2} delay={0.4} explanation={explanations.category}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {(data.categories.categories||[]).slice(0,6).map((cat,i) => (
                  <div key={cat.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>{cat.category}</span>
                      <span style={{ color: '#666', fontSize: 12 }}>{CUR}{cat.revenue.toFixed(2)} · {cat.pct}%</span>
                    </div>
                    {/* Gradient bar — safe style-only change */}
                    <div style={{
                      height: 6, borderRadius: 3,
                      background: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                    }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${cat.pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.06 }}
                        style={{
                          height: '100%', borderRadius: 3,
                          background: `linear-gradient(90deg, ${COLORS[i%COLORS.length]}, ${COLORS[i%COLORS.length]}88)`,
                        }}
                      />
                    </div>
                  </div>
                ))}

                {/* Best / Worst insight cards */}
                {data.categories.highest && (
                  <div style={{
                    marginTop: 8, padding: '10px 12px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.15)',
                  }}>
                    🏆 <span style={{ color: '#10B981', fontWeight: 700 }}>Best:</span>
                    <span style={{ color: '#ccc', marginLeft: 4 }}>{data.categories.highest.category}</span>
                    <span style={{ color: '#444', marginLeft: 4 }}>— {CUR}{data.categories.highest.revenue?.toFixed(2)}</span>
                  </div>
                )}
                {data.categories.lowest && data.categories.categories?.length > 1 && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.15)',
                  }}>
                    ⚠️ <span style={{ color: '#EF4444', fontWeight: 700 }}>Needs attention:</span>
                    <span style={{ color: '#ccc', marginLeft: 4 }}>{data.categories.lowest.category}</span>
                  </div>
                )}
              </div>

              {/* Pie chart — UNCHANGED */}
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={(data.categories.categories||[]).slice(0,6)} cx="50%" cy="50%" outerRadius={75}
                    dataKey="revenue" nameKey="category" labelLine={false}
                    label={({ category, pct }) => pct>8 ? `${category?.slice(0,8)}: ${pct}%` : ''}>
                    {(data.categories.categories||[]).slice(0,6).map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip CUR={CUR} />} formatter={(v) => [`${CUR}${v.toFixed(2)}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* ── Item performance — DATA + logic UNCHANGED ─────────── */}
          <SectionCard T={T} title="Item Performance" icon={Star} delay={0.45} explanation={explanations.items}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 12 }}>
                  🏆 Top Performers
                </p>
                {(data.items.top||[]).slice(0,5).map((item,i) => (
                  <div key={item.name} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        color: '#D4AF37', fontWeight: 900, fontSize: 14,
                        width: 20, textAlign: 'center', fontFamily: 'Playfair Display, serif',
                      }}>
                        {i+1}
                      </span>
                      <div>
                        <p style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{item.name}</p>
                        <p style={{ color: '#444', fontSize: 11 }}>{item.category}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#D4AF37', fontWeight: 700, fontSize: 14 }}>{CUR}{item.revenue.toFixed(0)}</p>
                      <p style={{ color: '#444', fontSize: 11 }}>{item.qty} sold</p>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 12 }}>
                  ⚠️ Needs Attention
                </p>
                {(data.items.bottom||[]).slice(0,5).map((item) => (
                  <div key={item.name} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div>
                      <p style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{item.name}</p>
                      <p style={{ color: '#444', fontSize: 11 }}>{item.category}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#EF4444', fontWeight: 700, fontSize: 14 }}>{CUR}{item.revenue.toFixed(0)}</p>
                      <p style={{ color: '#444', fontSize: 11 }}>{item.qty} sold</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ── Growth Analysis — DATA + logic UNCHANGED ─────────── */}
          {growthMetrics && (
            <SectionCard T={T} title="Growth Analysis" icon={TrendingUp} delay={0.5}
              explanation="Compares revenue performance across time periods. Growth % = ((Current - Previous) / Previous) × 100.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Today vs Yesterday */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: 20,
                }}>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 14 }}>
                    Today vs Yesterday
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
                    <div>
                      <p style={{ color: '#444', fontSize: 11, marginBottom: 3 }}>Today</p>
                      <p style={{ color: '#D4AF37', fontSize: 22, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                        {CUR}{growthMetrics.todayRev.toFixed(2)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#444', fontSize: 11, marginBottom: 3 }}>Yesterday</p>
                      <p style={{ color: '#fff', fontSize: 22, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                        {CUR}{growthMetrics.yesterdayRev.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8,
                    background: growthMetrics.todayPct >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${growthMetrics.todayPct >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    <span style={{ color: '#ccc', fontWeight: 700, fontSize: 13 }}>Daily Growth</span>
                    <span style={{
                      color: growthMetrics.todayPct >= 0 ? '#10B981' : '#EF4444',
                      fontSize: 18, fontWeight: 900,
                    }}>
                      {growthMetrics.todayPct >= 0 ? '+' : ''}{growthMetrics.todayPct}%
                      {' '}{growthMetrics.todayPct >= 0 ? '📈' : '📉'}
                    </span>
                  </div>
                </div>

                {/* This Week vs Last Week */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: 20,
                }}>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 14 }}>
                    This Week vs Last Week
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
                    <div>
                      <p style={{ color: '#444', fontSize: 11, marginBottom: 3 }}>This Week</p>
                      <p style={{ color: '#D4AF37', fontSize: 22, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                        {CUR}{growthMetrics.thisWeekRev.toFixed(2)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#444', fontSize: 11, marginBottom: 3 }}>Last Week</p>
                      <p style={{ color: '#fff', fontSize: 22, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                        {CUR}{growthMetrics.lastWeekRev.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8,
                    background: growthMetrics.weekPct >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${growthMetrics.weekPct >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    <span style={{ color: '#ccc', fontWeight: 700, fontSize: 13 }}>Weekly Growth</span>
                    <span style={{
                      color: growthMetrics.weekPct >= 0 ? '#10B981' : '#EF4444',
                      fontSize: 18, fontWeight: 900,
                    }}>
                      {growthMetrics.weekPct >= 0 ? '+' : ''}{growthMetrics.weekPct}%
                      {' '}{growthMetrics.weekPct >= 0 ? '📈' : '📉'}
                    </span>
                  </div>
                </div>

              </div>
            </SectionCard>
          )}

          {/* ── Customer Analysis — DATA + logic UNCHANGED ────────── */}
          {customerMetrics && (
            <SectionCard T={T} title="Customer Analysis" icon={ShoppingBag} delay={0.55}
              explanation="Unique customers identified by phone number. New = first order within selected period. Repeat = ordered more than once across all time.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                <div style={{
                  background: 'rgba(212,175,55,0.05)',
                  border: '1px solid rgba(212,175,55,0.12)',
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(212,175,55,0.12)',
                    border: '1px solid rgba(212,175,55,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <ShoppingBag style={{ width: 18, height: 18, color: '#D4AF37' }} />
                  </div>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>Total Customers</p>
                  <p style={{ color: '#D4AF37', fontSize: 32, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                    {customerMetrics.total}
                  </p>
                  <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>unique phone numbers</p>
                </div>

                <div style={{
                  background: 'rgba(16,185,129,0.05)',
                  border: '1px solid rgba(16,185,129,0.12)',
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <Star style={{ width: 18, height: 18, color: '#10B981' }} />
                  </div>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>New Customers</p>
                  <p style={{ color: '#10B981', fontSize: 32, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                    {customerMetrics.newCustomers}
                  </p>
                  <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>first order this period</p>
                </div>

                <div style={{
                  background: 'rgba(139,92,246,0.05)',
                  border: '1px solid rgba(139,92,246,0.12)',
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(139,92,246,0.12)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <TrendingUp style={{ width: 18, height: 18, color: '#8B5CF6' }} />
                  </div>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>Repeat Customers</p>
                  <p style={{ color: '#8B5CF6', fontSize: 32, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                    {customerMetrics.repeat}
                  </p>
                  <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>ordered more than once</p>
                </div>

              </div>

              {/* Retention bar — upgraded to segmented, safe style-only ── */}
              {customerMetrics.total > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#555', fontSize: 11 }}>Retention Rate</span>
                    <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 12 }}>
                      {Math.round((customerMetrics.repeat / customerMetrics.total) * 100)}%
                    </span>
                  </div>
                  {/* Segmented bar: new (gold) + repeat (purple) */}
                  <div style={{
                    height: 8, borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden', display: 'flex',
                  }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((customerMetrics.newCustomers / customerMetrics.total) * 100)}%` }}
                      transition={{ duration: 0.7, delay: 0.2 }}
                      style={{ height: '100%', background: '#D4AF37' }}
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((customerMetrics.repeat / customerMetrics.total) * 100)}%` }}
                      transition={{ duration: 0.7, delay: 0.35 }}
                      style={{ height: '100%', background: '#8B5CF6' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: '#555' }}>
                      <span style={{ color: '#D4AF37' }}>■</span> New: {customerMetrics.newCustomers}
                    </span>
                    <span style={{ fontSize: 10, color: '#555' }}>
                      <span style={{ color: '#8B5CF6' }}>■</span> Repeat: {customerMetrics.repeat}
                    </span>
                  </div>
                  <p style={{ color: '#333', fontSize: 11, marginTop: 4 }}>
                    {customerMetrics.repeat} of {customerMetrics.total} customers came back
                  </p>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
};

export default AdvancedAnalytics;
