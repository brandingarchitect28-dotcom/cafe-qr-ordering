/**
 * AdvancedAnalytics.jsx
 *
 * Features 1–5, 9:
 * 1. Custom date range picker (from/to)
 * 2. Chart explanations + fixed white tooltips
 * 3. Service charges in all figures
 * 4. Category-wise breakdown
 * 5. Payment + source breakdown
 */

import { formatWhatsAppNumber } from '../../utils/whatsapp';
import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { useAdvancedAnalytics } from '../../hooks/useAdvancedAnalytics';
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

// ─── constants ────────────────────────────────────────────────────────────────
const COLORS = ['#D4AF37','#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

// ─── Fixed tooltip with white text ────────────────────────────────────────────
// ─── Safe string helper — prevents TypeError: x.toLowerCase is not a function ─
// Handles null, undefined, numbers, objects — always returns a string.
const safeLower = (v) => {
  if (typeof v === 'string') return v.toLowerCase();
  if (v === null || v === undefined) return '';
  return String(v).toLowerCase();
};

const CustomTooltip = ({ active, payload, label, CUR = '₹' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1a1a1a', border:'1px solid rgba(212,175,55,0.3)', borderRadius:8, padding:'10px 14px', color:'#fff' }}>
      {label && <p style={{ color:'#D4AF37', fontWeight:700, marginBottom:4, fontSize:12 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color:'#fff', fontSize:12, margin:'2px 0' }}>
          <span style={{ color: p.color || '#D4AF37' }}>●</span>{' '}
          {p.name}: <strong>{typeof p.value === 'number' && safeLower(p.name).includes('revenue') ? `${CUR}${p.value.toFixed(2)}` : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, color, index }) => (
  <motion.div
    initial={{ opacity:0, y:16 }}
    animate={{ opacity:1, y:0 }}
    transition={{ delay: index * 0.05 }}
    whileHover={{ y:-3 }}
    className={`${T.card} rounded-xl p-5`}
  >
    <div className="flex items-center justify-between mb-3">
      <p className={`${T.muted} text-xs uppercase tracking-wide`}>{label}</p>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:`${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
    </div>
    <p className="text-2xl font-black" style={{ color }}>{value}</p>
    {sub && <p className={`${T.faint} text-xs mt-1`}>{sub}</p>}
  </motion.div>
);

// ─── Section with explanation panel ───────────────────────────────────────────
const SectionCard = ({ title, icon: Icon, explanation, children, delay = 0 }) => (
  <motion.div
    initial={{ opacity:0, y:16 }}
    animate={{ opacity:1, y:0 }}
    transition={{ delay }}
    className={`${T.card} rounded-xl overflow-hidden`}
  >
    <div className={`flex items-center gap-3 px-5 py-4 border-b ${T.border}`}>
      <Icon className="w-4 h-4 text-[#D4AF37]" />
      <h3 className={`${T.heading} font-semibold text-sm flex-1`} style={{ fontFamily:'Playfair Display,serif' }}>{title}</h3>
    </div>
    <div className="p-5">
      {explanation && (
        <div className="mb-4 p-3 rounded-lg bg-[#D4AF37]/5 border border-[#D4AF37]/15">
          <p className={`${T.muted} text-xs leading-relaxed`}>{explanation}</p>
        </div>
      )}
      {children}
    </div>
  </motion.div>
);

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Skel = ({ h='h-4', w='w-full' }) => <div className={`${h} ${w} rounded ${T.subCard} animate-pulse`} />;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Main ─────────────────────────────────────────────────────────────────────
const AdvancedAnalytics = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';

  // Feature 1: Custom date range
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
  const explanations = useMemo(() => buildExplanation(data, CUR), [data, CUR]);

  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePDF = () => {
    if (!data) { toast.error('No data to export'); return; }
    setPdfLoading(true);
    try {
      downloadPDFReport(data, cafe, fromDate, toDate);
      toast.success('Report downloading ✓');
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      // Brief delay so the user sees the generating state
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
    // iOS-compatible: window.open is blocked by Safari
    window.location.href = url;
  };

  const inputCls = '${T.innerCard} border ${T.borderMd} text-white rounded-sm px-3 h-9 text-sm focus:border-[#D4AF37] outline-none';

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className={`${T.heading} font-bold text-2xl`} style={{ fontFamily:'Playfair Display,serif' }}>Advanced Analytics</h2>
            {lastFetch && <p className={`${T.faint} text-xs mt-1`}>Last updated: {lastFetch.toLocaleTimeString()}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={refresh} disabled={loading} className={`flex items-center gap-1.5 px-3 h-9 ${T.subCard} hover:bg-white/10 border ${T.borderMd} text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all disabled:opacity-50`}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />Refresh
            </button>
            {/* Reset Analytics — clears date range back to 30 days and forces fresh fetch */}
            <button
              onClick={() => { applyPreset('30'); setTimeout(refresh, 50); }}
              disabled={loading}
              title="Recalculate analytics from scratch using only paid orders"
              className="flex items-center gap-1.5 px-3 h-9 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-sm text-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />Reset
            </button>
            <button onClick={handleGST} className={`flex items-center gap-1.5 px-3 h-9 bg-emerald-600 hover:bg-emerald-700 ${T.heading} rounded-sm text-sm transition-all`}>
              <FileText className="w-3.5 h-3.5" />GST CSV
            </button>
            <button onClick={handleWA} className={`flex items-center gap-1.5 px-3 h-9 bg-green-600 hover:bg-green-700 ${T.heading} rounded-sm text-sm transition-all`}>
              <MessageSquare className="w-3.5 h-3.5" />WhatsApp
            </button>
            <button onClick={handlePDF} disabled={pdfLoading || !data} className="flex items-center gap-1.5 px-4 h-9 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {pdfLoading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Generating…</>
                : <><Download className="w-3.5 h-3.5" />PDF Report</>
              }
            </button>
          </div>
        </div>

        {/* Feature 1: Date range filter */}
        <div className={`${T.card} rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[#D4AF37]" />
            <span className={`${T.body} text-sm font-semibold`}>Date Range</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Presets */}
            <div className="flex gap-1.5 flex-wrap">
              {[{v:'today',l:'Today'},{v:'7',l:'7 Days'},{v:'30',l:'30 Days'},{v:'90',l:'90 Days'}].map(p => (
                <button key={p.v} onClick={() => applyPreset(p.v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={preset===p.v ? {background:'#D4AF37',color:'#000'} : {background:'rgba(255,255,255,0.06)',color:'#A3A3A3',border:'1px solid rgba(255,255,255,0.1)'}}>
                  {p.l}
                </button>
              ))}
            </div>
            <span className={`${T.faint} text-xs hidden sm:block`}>or custom:</span>
            {/* Custom pickers */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`${T.muted} text-xs`}>From</span>
                <input type="date" value={fromDate}
                  onChange={e => { setFromDate(e.target.value); setPreset('custom'); }}
                  className={inputCls} max={toDate} />
              </div>
              <div className="flex items-center gap-2">
                <span className={`${T.muted} text-xs`}>To</span>
                <input type="date" value={toDate}
                  onChange={e => { setToDate(e.target.value); setPreset('custom'); }}
                  className={inputCls} min={fromDate} max={today()} />
              </div>
              <button onClick={refresh}
                className="px-4 py-1.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-xs transition-all">
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_,i) => (
            <div key={i} className={`${T.card} rounded-xl p-5 space-y-3`}>
              <Skel h="h-3" w="w-1/2"/><Skel h="h-7" w="w-3/4"/>
            </div>
          ))}
        </div>
      )}

      {/* No data */}
      {!loading && !data && !error && (
        <div className={`${T.card} rounded-xl p-12 text-center`}>
          <BarChart2 className={`w-12 h-12 ${T.muted}/30 mx-auto mb-3`} />
          <p className={`${T.muted}`}>No orders in selected date range.</p>
        </div>
      )}

      {data && (
        <>
          {/* ── Stat cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label:'Gross Revenue',  value:`${CUR}${data.revenue.gross.toFixed(2)}`,       sub:`${data.revenue.paidOrders} paid orders`,   icon:IndianRupee, color:'#10B981', index:0 },
              { label:'Net Revenue',    value:`${CUR}${data.revenue.netRevenue.toFixed(2)}`,   sub:'After discounts',                          icon:TrendingUp,  color:'#D4AF37', index:1 },
              { label:'Avg Order',      value:`${CUR}${data.revenue.aov.toFixed(2)}`,          sub:'Per paid order',                           icon:ShoppingBag, color:'#3B82F6', index:2 },
              { label:'Total Orders',   value:data.revenue.totalOrders,                        sub:`${fromDate} → ${toDate}`,                  icon:Package,     color:'#F59E0B', index:3 },
              { label:'GST Collected',  value:`${CUR}${data.gst.totalGST.toFixed(2)}`,         sub:`${data.gst.byRate?.length||0} slabs`,      icon:FileText,    color:'#8B5CF6', index:4 },
              { label:'Net Profit',     value:`${CUR}${data.profit.netProfit.toFixed(2)}`,     sub:`Margin: ${data.profit.margin}%`,            icon:Star,        color:data.profit.netProfit>=0?'#10B981':'#EF4444', index:5 },
            ].map(s => <StatCard key={s.label} {...s} />)}
          </div>

          {/* ── Revenue trend ────────────────────────────────────────── */}
          <SectionCard title="Revenue Trend" icon={TrendingUp} delay={0.1} explanation={explanations.revenue}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#444" fontSize={10} />
                <YAxis stroke="#444" fontSize={10} />
                <Tooltip content={<CustomTooltip CUR={CUR} />} />
                <Legend wrapperStyle={{ color:'#A3A3A3', fontSize:11 }} />
                <Line type="monotone" dataKey="revenue" name={`Revenue (${CUR})`} stroke="#D4AF37" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders"  name="Orders"             stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* ── GST + Profit side by side ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="GST Summary" icon={FileText} delay={0.15} explanation={explanations.gst}>
              <div className="space-y-2 mb-4">
                {(data.gst.byRate||[]).map((g,i) => (
                  <div key={i} className={`flex items-center justify-between py-2 border-b ${T.border} text-sm`}>
                    <span className={`${T.muted}`}>GST {g.rate}%</span>
                    <div className="text-right">
                      <p className={`${T.heading} font-semibold`}>{CUR}{g.gst.toFixed(2)}</p>
                      <p className={`${T.faint} text-xs`}>on {CUR}{g.taxable.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {!(data.gst.byRate?.length) && <p className={`${T.faint} text-sm text-center py-4`}>No GST data for this period</p>}
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ background:'rgba(212,175,55,0.07)', border:'1px solid rgba(212,175,55,0.2)' }}>
                <span className={`${T.heading} font-semibold text-sm`}>Total GST</span>
                <span className="text-[#D4AF37] font-black text-lg">{CUR}{data.gst.totalGST.toFixed(2)}</span>
              </div>
            </SectionCard>

            <SectionCard title="Profit Analysis" icon={IndianRupee} delay={0.2} explanation={explanations.profit}>
              {!data.profit.hasCostData && (
                <p className={`${T.faint} text-xs italic mb-3`}>Add recipe costs in Inventory → Manage Recipes to see full profit</p>
              )}
              {[
                { label:'Total Revenue',      val:  data.profit.totalRevenue,  color:'#10B981' },
                { label:'Cost of Goods',       val: -data.profit.totalCost,    color:'#EF4444' },
                { label:'GST Collected',       val: -data.profit.totalGST,     color:'#F59E0B' },
              ].map(r => (
                <div key={r.label} className={`flex justify-between py-2.5 border-b ${T.border} text-sm`}>
                  <span className={`${T.muted}`}>{r.label}</span>
                  <span className="font-semibold" style={{ color:r.color }}>
                    {r.val>=0?'+':''}{CUR}{Math.abs(r.val).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-3 font-bold text-base">
                <span className={`${T.heading}`}>Net Profit</span>
                <span style={{ color:data.profit.netProfit>=0?'#10B981':'#EF4444' }}>
                  {CUR}{data.profit.netProfit.toFixed(2)}
                  <span className="text-sm font-normal ml-1">({data.profit.margin}%)</span>
                </span>
              </div>
            </SectionCard>
          </div>

          {/* ── Payment + Source ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Payment Methods" icon={IndianRupee} delay={0.25} explanation={explanations.payment}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.payment} cx="50%" cy="50%" outerRadius={75} dataKey="count"
                    label={({ method, pct }) => `${method}: ${pct}%`} labelLine={false}>
                    {data.payment.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip CUR={CUR} />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mt-2">
                {data.payment.map((p,i) => (
                  <span key={p.method} className="text-xs px-2 py-1 rounded-full" style={{ background:`${COLORS[i%COLORS.length]}15`, color:COLORS[i%COLORS.length], border:`1px solid ${COLORS[i%COLORS.length]}30` }}>
                    {p.method} {p.pct}% · {CUR}{p.revenue?.toFixed(0)}
                  </span>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Order Sources" icon={ShoppingBag} delay={0.3} explanation="Breakdown of where orders came from — QR code, Zomato, Swiggy, phone, walk-in.">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.source} cx="50%" cy="50%" outerRadius={75} dataKey="count"
                    label={({ source, pct }) => `${source}: ${pct}%`} labelLine={false}>
                    {data.source.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip CUR={CUR} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {data.source.map((s,i) => (
                  <span key={s.source} className="text-xs px-2 py-1 rounded-full" style={{ background:`${COLORS[i%COLORS.length]}15`, color:COLORS[i%COLORS.length], border:`1px solid ${COLORS[i%COLORS.length]}30` }}>
                    {s.source} {s.pct}% ({s.count})
                  </span>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* ── Peak hours ───────────────────────────────────────────── */}
          <SectionCard title="Peak Hours" icon={Clock} delay={0.35} explanation="Hours with the most orders. Use this to plan staffing and kitchen prep.">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.peakHours.slice(6,24)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#444" fontSize={9} interval={1} />
                <YAxis stroke="#444" fontSize={9} />
                <Tooltip content={<CustomTooltip CUR={CUR} />} />
                <Bar dataKey="count" name="Orders" fill="#D4AF37" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* ── Category ─────────────────────────────────────────────── */}
          <SectionCard title="Category Performance" icon={BarChart2} delay={0.4} explanation={explanations.category}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                {(data.categories.categories||[]).slice(0,6).map((cat,i) => (
                  <div key={cat.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`${T.label} font-medium`}>{cat.category}</span>
                      <span className={`${T.muted}`}>{CUR}{cat.revenue.toFixed(2)} · {cat.pct}%</span>
                    </div>
                    <div className={`h-1.5 rounded-full ${T.subCard} overflow-hidden`}>
                      <motion.div
                        initial={{ width:0 }}
                        animate={{ width:`${cat.pct}%` }}
                        transition={{ duration:0.5, delay:i*0.05 }}
                        className="h-full rounded-full"
                        style={{ background:COLORS[i%COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
                {data.categories.highest && (
                  <div className="mt-2 p-3 rounded-lg text-xs" style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)' }}>
                    🏆 <span className="text-emerald-400 font-semibold">Best:</span>
                    <span className={`${T.heading} ml-1`}>{data.categories.highest.category}</span>
                    <span className={`${T.faint} ml-1`}>— {CUR}{data.categories.highest.revenue?.toFixed(2)}</span>
                  </div>
                )}
                {data.categories.lowest && data.categories.categories?.length > 1 && (
                  <div className="p-3 rounded-lg text-xs" style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)' }}>
                    ⚠️ <span className="text-red-400 font-semibold">Needs attention:</span>
                    <span className={`${T.heading} ml-1`}>{data.categories.lowest.category}</span>
                  </div>
                )}
              </div>
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

          {/* ── Item performance ─────────────────────────────────────── */}
          <SectionCard title="Item Performance" icon={Star} delay={0.45} explanation={explanations.items}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-3`}>🏆 Top Performers</p>
                {(data.items.top||[]).slice(0,5).map((item,i) => (
                  <div key={item.name} className={`flex items-center justify-between py-2 border-b ${T.border} text-sm`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[#D4AF37] font-black w-5 text-center">{i+1}</span>
                      <div>
                        <p className={`${T.label} font-medium`}>{item.name}</p>
                        <p className={`${T.faint} text-xs`}>{item.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[#D4AF37] font-semibold">{CUR}{item.revenue.toFixed(0)}</p>
                      <p className={`${T.faint} text-xs`}>{item.qty} sold</p>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-3`}>⚠️ Needs Attention</p>
                {(data.items.bottom||[]).slice(0,5).map((item) => (
                  <div key={item.name} className={`flex items-center justify-between py-2 border-b ${T.border} text-sm`}>
                    <div>
                      <p className={`${T.label} font-medium`}>{item.name}</p>
                      <p className={`${T.faint} text-xs`}>{item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-red-400 font-semibold">{CUR}{item.revenue.toFixed(0)}</p>
                      <p className={`${T.faint} text-xs`}>{item.qty} sold</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
};

export default AdvancedAnalytics;
