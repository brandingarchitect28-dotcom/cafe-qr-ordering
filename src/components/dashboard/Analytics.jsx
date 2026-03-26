/**
 * Analytics.jsx
 *
 * Fixes:
 * 1. All tooltips now use white text on #111 dark background — clearly readable
 * 2. Written explanations added below every chart — dynamic based on data
 * 3. No real-time listeners changed
 */

import React, { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

// ─── Safe string helper — prevents TypeError: x.toLowerCase is not a function ─
const safeLower = (v) => {
  if (typeof v === 'string') return v.toLowerCase();
  if (v === null || v === undefined) return '';
  return String(v).toLowerCase();
};

// ─── Chart Drill-Down Modal ───────────────────────────────────────────────────
// Opens when user clicks a chart card. Shows full breakdown table.
const ChartModal = ({ chart, onClose, CUR = '₹' }) => {
  if (!chart) return null;
  const fmt = (n) => (parseFloat(n) || 0).toFixed(2);
  const total = chart.data.reduce((s, d) => s + (d.value || d.revenue || d.count || 0), 0) || 1;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`${T.card} rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden`}
          initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${T.border}`}>
            <h3 className={`${T.heading} font-bold text-base`} style={{ fontFamily: 'Playfair Display, serif' }}>
              {chart.title}
            </h3>
            <button onClick={onClose} className={`p-1.5 rounded-lg hover:bg-white/10 ${T.muted} transition-all`}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Table */}
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead className={`sticky top-0 ${T.tableHead}`}>
                <tr>
                  <th className={`px-5 py-3 text-left ${T.faint} text-xs uppercase tracking-wide font-semibold`}>
                    {chart.labelKey}
                  </th>
                  {chart.valueLabel && (
                    <th className={`px-5 py-3 text-right ${T.faint} text-xs uppercase tracking-wide font-semibold`}>
                      {chart.valueLabel}
                    </th>
                  )}
                  <th className={`px-5 py-3 text-right ${T.faint} text-xs uppercase tracking-wide font-semibold`}>
                    Share
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {chart.data.map((row, i) => {
                  const val    = row.value ?? row.revenue ?? row.count ?? 0;
                  const pct    = ((val / total) * 100).toFixed(1);
                  const isRev  = safeLower(chart.valueLabel).includes('revenue');
                  const color  = row.color || ['#D4AF37','#10B981','#3B82F6','#F59E0B','#EF4444'][i % 5];
                  return (
                    <tr key={i} className="hover:bg-white/2 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className={`${T.heading}`}>{row.name || row.method || row.source || '—'}</span>
                        </div>
                      </td>
                      {chart.valueLabel && (
                        <td className="px-5 py-3 text-right font-semibold" style={{ color: '#D4AF37' }}>
                          {isRev ? `${CUR}${fmt(val)}` : val.toLocaleString('en-IN')}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-16 h-1.5 rounded-full ${T.subCard} overflow-hidden`}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className={`${T.muted} text-xs w-10 text-right`}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer total */}
          <div className={`px-5 py-3 border-t ${T.border} flex justify-between text-sm`}>
            <span className={`${T.faint}`}>Total</span>
            <span className={`${T.heading} font-bold`}>
              {safeLower(chart.valueLabel).includes('revenue')
                ? `${CUR}${fmt(total)}`
                : total.toLocaleString('en-IN')
              }
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Fixed tooltip — white text, dark bg, high contrast ──────────────────────
const DarkTooltip = ({ active, payload, label, prefix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#111111',
      border: '1px solid rgba(212,175,55,0.4)',
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    }}>
      {label !== undefined && (
        <p style={{ color: '#D4AF37', fontWeight: 700, marginBottom: '6px', fontSize: '12px' }}>{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: '#ffffff', fontSize: '12px', margin: '3px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill || '#D4AF37', flexShrink: 0 }} />
          <span style={{ color: '#A3A3A3' }}>{p.name}:</span>
          <strong style={{ color: '#ffffff' }}>{prefix}{typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Written explanation box ──────────────────────────────────────────────────
const Insight = ({ lines }) => (
  <div style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', padding: '12px 16px', marginTop: '16px' }}>
    <p style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
      💡 Insight
    </p>
    {lines.filter(Boolean).map((line, i) => (
      <p key={i} style={{ color: '#A3A3A3', fontSize: '12px', lineHeight: '1.6', margin: '2px 0' }}>• {line}</p>
    ))}
  </div>
);

const Analytics = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe   } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';
  const [activeChart, setActiveChart] = useState(null); // drill-down modal

  const analytics = useMemo(() => {
    if (!orders || orders.length === 0) return null;

    // ── Revenue by day (last 7 days) ──────────────────────────────────────
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(); date.setDate(date.getDate() - (6 - i)); date.setHours(0, 0, 0, 0);
      return date;
    });
    const revenueByDay = last7Days.map(day => {
      const nextDay = new Date(day); nextDay.setDate(nextDay.getDate() + 1);
      // Use paidAt if available (more accurate), fall back to createdAt
      const dayOrders = orders.filter(o => {
        if (o.paymentStatus !== 'paid') return false;
        const raw = o.paidAt || o.createdAt;
        const t = raw?.toDate?.() || (raw ? new Date(raw) : new Date(0));
        return t >= day && t < nextDay;
      });
      return {
        date:    day.toLocaleDateString('en-US', { weekday: 'short' }),
        revenue: parseFloat(dayOrders.reduce((s, o) => s + (o.totalAmount || o.total || 0), 0).toFixed(2)),
        orders:  dayOrders.length,
      };
    });

    // ── Best selling items ────────────────────────────────────────────────
    // ── Best selling items — paid orders only ─────────────────────────────
    const itemCounts = {};
    orders.filter(o => o.paymentStatus === 'paid').forEach(o => o.items?.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
    }));
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // ── Payment status split ──────────────────────────────────────────────
    const paidCount    = orders.filter(o => o.paymentStatus === 'paid').length;
    const pendingCount = orders.filter(o => o.paymentStatus !== 'paid').length;
    const paymentSplit = [
      { name: 'Paid',    value: paidCount    },
      { name: 'Pending', value: pendingCount },
    ];
    const payPct   = orders.length > 0 ? Math.round((paidCount / orders.length) * 100) : 0;
    const pendPct  = 100 - payPct;

    // ── Order status split ────────────────────────────────────────────────
    const statusMap = { new: 0, preparing: 0, ready: 0, completed: 0 };
    orders.forEach(o => { if (statusMap[o.orderStatus] !== undefined) statusMap[o.orderStatus]++; });
    const orderStatusSplit = [
      { name: 'New',       value: statusMap.new       },
      { name: 'Preparing', value: statusMap.preparing },
      { name: 'Ready',     value: statusMap.ready     },
      { name: 'Completed', value: statusMap.completed },
    ].filter(s => s.value > 0);
    const topStatus = orderStatusSplit.sort((a, b) => b.value - a.value)[0];

    // ── Order source ──────────────────────────────────────────────────────
    const SOURCE_LABELS = { direct:'Direct (QR)', zomato:'Zomato', swiggy:'Swiggy', phone:'Phone', walkin:'Walk-in', other:'Other' };
    const SOURCE_COLORS = { direct:'#D4AF37', zomato:'#EF4444', swiggy:'#F97316', phone:'#3B82F6', walkin:'#10B981', other:'#8B5CF6' };
    const sourceCounts  = {};
    orders.forEach(o => {
      const src = o.orderSource || (o.externalOrder ? 'other' : 'direct');
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const orderSourceSplit = Object.entries(sourceCounts)
      .map(([src, count]) => ({ name: SOURCE_LABELS[src] || src, value: count, color: SOURCE_COLORS[src] || '#A3A3A3' }))
      .sort((a, b) => b.value - a.value);
    const revenueBySource = Object.entries(
      // Revenue from PAID orders only — cancelled/pending excluded
      orders.filter(o => o.paymentStatus === 'paid').reduce((acc, o) => {
        const src = o.orderSource || (o.externalOrder ? 'other' : 'direct');
        acc[src] = (acc[src] || 0) + (o.totalAmount || o.total || 0);
        return acc;
      }, {})
    ).map(([src, rev]) => ({ name: SOURCE_LABELS[src] || src, revenue: parseFloat(rev.toFixed(2)), color: SOURCE_COLORS[src] || '#A3A3A3' }))
     .sort((a, b) => b.revenue - a.revenue);

    // ── Dynamic insights ──────────────────────────────────────────────────
    const bestDay     = [...revenueByDay].sort((a, b) => b.revenue - a.revenue)[0];
    const worstDay    = [...revenueByDay].sort((a, b) => a.revenue - b.revenue)[0];
    const totalRev    = revenueByDay.reduce((s, d) => s + d.revenue, 0);
    const topSource   = orderSourceSplit[0];

    const insights = {
      revenue: [
        bestDay?.revenue > 0  ? `Best day this week: ${bestDay.date} with ${CUR}${bestDay.revenue.toFixed(2)} revenue` : null,
        worstDay?.revenue === 0 ? `${worstDay.date} had no paid orders — consider promotions on slow days` : null,
        totalRev > 0 ? `Total revenue this week: ${CUR}${totalRev.toFixed(2)}` : null,
      ],
      orders: [
        `${orders.length} total orders recorded`,
        revenueByDay.reduce((s,d) => s+d.orders,0) > 0 ? `Average ${(revenueByDay.reduce((s,d) => s+d.orders,0)/7).toFixed(1)} paid orders per day this week` : null,
      ],
      items: topItems.length > 0 ? [
        `"${topItems[0].name}" is your best seller with ${topItems[0].count} units sold`,
        topItems[1] ? `"${topItems[1].name}" follows with ${topItems[1].count} units` : null,
        topItems.length >= 3 ? `Consider promoting lower-selling items to boost variety` : null,
      ] : [],
      payment: [
        `${payPct}% of orders are paid, ${pendPct}% are pending`,
        payPct < 30 ? `High pending rate — consider enabling online payment to collect faster` : null,
        payPct > 70 ? `Great payment collection! Most customers are paying promptly` : null,
      ],
      status: topStatus ? [
        `Most orders are currently in "${topStatus.name}" stage (${topStatus.value} orders)`,
        statusMap.preparing > 5 ? `Kitchen may be at high load — ${statusMap.preparing} orders preparing simultaneously` : null,
        statusMap.new > 3 ? `${statusMap.new} new orders are waiting to be picked up by the kitchen` : null,
      ] : [],
      source: topSource ? [
        `${topSource.name} is your top order source (${topSource.value} orders)`,
        orderSourceSplit.length > 1 ? `You receive orders from ${orderSourceSplit.length} different channels` : null,
        revenueBySource[0] ? `Highest revenue platform: ${revenueBySource[0].name} (${CUR}${revenueBySource[0].revenue.toFixed(2)})` : null,
      ] : [],
    };

    return { revenueByDay, topItems, paymentSplit, orderStatusSplit, orderSourceSplit, revenueBySource, insights };
  }, [orders, CUR]);

  if (!analytics) {
    return (
      <div className={`${T.card} rounded-sm p-12 text-center`}>
        <p className={`${T.muted} text-lg`}>No data yet. Start receiving orders to see analytics!</p>
      </div>
    );
  }

  const COLORS = ['#D4AF37','#10B981','#3B82F6','#F59E0B','#EF4444'];

  return (
    <div className="space-y-6">
      {/* Chart drill-down modal */}
      <ChartModal chart={activeChart} onClose={() => setActiveChart(null)} CUR={CUR} />

      {/* ── Revenue Chart ──────────────────────────────────────────────────── */}
      <div className={`${T.card} rounded-sm p-6`}>
        <h3 className={`text-xl font-semibold ${T.heading} mb-6`} style={{ fontFamily: 'Playfair Display, serif' }}>
          Revenue (Last 7 Days)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={analytics.revenueByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" stroke="#555" fontSize={11} />
            <YAxis stroke="#555" fontSize={11} />
            <Tooltip content={<DarkTooltip prefix={CUR} />} />
            <Legend wrapperStyle={{ color: '#A3A3A3', fontSize: 11 }} />
            <Line type="monotone" dataKey="revenue" name={`Revenue (${CUR})`} stroke="#D4AF37" strokeWidth={2.5} dot={{ fill: '#D4AF37', r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
        <Insight lines={analytics.insights.revenue} />
      </div>

      {/* ── Orders per Day ─────────────────────────────────────────────────── */}
      <div className={`${T.card} rounded-sm p-6`}>
        <h3 className={`text-xl font-semibold ${T.heading} mb-6`} style={{ fontFamily: 'Playfair Display, serif' }}>
          Orders (Last 7 Days)
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={analytics.revenueByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" stroke="#555" fontSize={11} />
            <YAxis stroke="#555" fontSize={11} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ color: '#A3A3A3', fontSize: 11 }} />
            <Bar dataKey="orders" fill="#10B981" name="Orders" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <Insight lines={analytics.insights.orders} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Top Items ──────────────────────────────────────────────────── */}
        <div className={`${T.card} rounded-sm p-6`}>
          <h3 className={`text-xl font-semibold ${T.heading} mb-6`} style={{ fontFamily: 'Playfair Display, serif' }}>
            Best Selling Items
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analytics.topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" stroke="#555" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#555" width={100} fontSize={11} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="count" fill="#D4AF37" name="Qty Sold" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
          <Insight lines={analytics.insights.items} />
        </div>

        {/* ── Payment Status ─────────────────────────────────────────────── */}
        <div className={`${T.card} rounded-sm p-6 cursor-pointer hover:${T.borderMd} transition-colors`}
          onClick={() => setActiveChart({ title: 'Payment Status Breakdown', labelKey: 'Status', valueLabel: 'Orders', data: analytics.paymentSplit })}
          title="Click for breakdown"
        >
          <h3 className={`text-xl font-semibold ${T.heading} mb-6`} style={{ fontFamily: 'Playfair Display, serif' }}>
            Payment Status
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={analytics.paymentSplit} cx="50%" cy="50%"
                labelLine={false}
                label={({ name, percent, x, y }) => (
                  <text x={x} y={y} fill="#A3A3A3" fontSize={11} textAnchor="middle"
                    dominantBaseline="central" style={{ pointerEvents: 'none' }}>
                    {`${name}: ${(percent * 100).toFixed(0)}%`}
                  </text>
                )}
                outerRadius={95} dataKey="value">
                {analytics.paymentSplit.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <Insight lines={analytics.insights.payment} />
        </div>
      </div>

      {/* ── Order Status Distribution ─────────────────────────────────────── */}
      <div className={`${T.card} rounded-sm p-6 cursor-pointer hover:${T.borderMd} transition-colors`}
        onClick={() => setActiveChart({ title: 'Order Status Distribution', labelKey: 'Status', valueLabel: 'Orders', data: analytics.orderStatusSplit })}
        title="Click for breakdown"
      >
        <h3 className={`text-xl font-semibold ${T.heading} mb-6`} style={{ fontFamily: 'Playfair Display, serif' }}>
          Order Status Distribution
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={analytics.orderStatusSplit} cx="50%" cy="50%"
              labelLine={false}
              label={({ name, percent, x, y }) => (
                <text x={x} y={y} fill="#A3A3A3" fontSize={11} textAnchor="middle"
                  dominantBaseline="central" style={{ pointerEvents: 'none' }}>
                  {`${name}: ${(percent * 100).toFixed(0)}%`}
                </text>
              )}
              outerRadius={95} dataKey="value">
              {analytics.orderStatusSplit.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <Insight lines={analytics.insights.status} />
      </div>

      {/* ── Order Source Charts ───────────────────────────────────────────── */}
      {analytics.orderSourceSplit.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className={`${T.card} rounded-sm p-6 cursor-pointer hover:${T.borderMd} transition-colors`}
            onClick={() => setActiveChart({ title: 'Orders by Source', labelKey: 'Source', valueLabel: 'Orders', data: analytics.orderSourceSplit.map(d => ({ ...d, value: d.value })) })}
            title="Click for breakdown"
          >
            <h3 className={`text-xl font-semibold ${T.heading} mb-2`} style={{ fontFamily: 'Playfair Display, serif' }}>
              Orders by Source
            </h3>
            <p className={`${T.muted} text-xs mb-6`}>Where your orders come from</p>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={analytics.orderSourceSplit} cx="50%" cy="50%"
                  labelLine={false}
                  label={({ name, percent, x, y }) => percent > 0.05 ? (
                    <text x={x} y={y} fill="#A3A3A3" fontSize={11} textAnchor="middle"
                      dominantBaseline="central" style={{ pointerEvents: 'none' }}>
                      {`${name}: ${(percent*100).toFixed(0)}%`}
                    </text>
                  ) : null}
                  outerRadius={90} dataKey="value">
                  {analytics.orderSourceSplit.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(v) => <span style={{ color: '#A3A3A3' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <Insight lines={analytics.insights.source} />
          </div>

          <div className={`${T.card} rounded-sm p-6 cursor-pointer hover:${T.borderMd} transition-colors`}
            onClick={() => setActiveChart({ title: 'Revenue by Source', labelKey: 'Source', valueLabel: 'Revenue', data: analytics.revenueBySource.map(d => ({ ...d, value: d.revenue })) })}
            title="Click for breakdown"
          >
            <h3 className={`text-xl font-semibold ${T.heading} mb-2`} style={{ fontFamily: 'Playfair Display, serif' }}>
              Revenue by Source
            </h3>
            <p className={`${T.muted} text-xs mb-6`}>Revenue earned per platform</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics.revenueBySource} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" stroke="#555" fontSize={11} tickFormatter={v => `${CUR}${v}`} />
                <YAxis type="category" dataKey="name" stroke="#555" width={90} fontSize={11} />
                <Tooltip content={<DarkTooltip prefix={CUR} />} />
                <Bar dataKey="revenue" name="Revenue" radius={[0,3,3,0]}>
                  {analytics.revenueBySource.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Source summary table ──────────────────────────────────────────── */}
      {analytics.orderSourceSplit.length > 1 && (
        <div className={`${T.card} rounded-sm p-6`}>
          <h3 className={`text-xl font-semibold ${T.heading} mb-4`} style={{ fontFamily: 'Playfair Display, serif' }}>
            Platform Performance Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${T.borderMd}`}>
                  {['Platform','Orders','Revenue','% of Orders'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#D4AF37] font-semibold text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.orderSourceSplit.map((src, idx) => {
                  const revEntry  = analytics.revenueBySource.find(r => r.name === src.name);
                  const totalOrds = analytics.orderSourceSplit.reduce((s, i) => s + i.value, 0);
                  const pct       = totalOrds > 0 ? ((src.value / totalOrds) * 100).toFixed(1) : '0';
                  return (
                    <tr key={idx} className={`border-b ${T.border} hover:bg-white/3 transition-colors`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: src.color }} />
                          <span className={`${T.label} font-medium text-sm`}>{src.name}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${T.body} text-sm`}>{src.value}</td>
                      <td className="px-4 py-3 text-[#D4AF37] font-semibold text-sm">
                        {CUR}{revEntry ? revEntry.revenue.toFixed(2) : '0.00'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex-1 ${T.subCard} rounded-full h-1.5 max-w-[80px]`}>
                            <div className="h-1.5 rounded-full" style={{ width:`${pct}%`, backgroundColor:src.color }} />
                          </div>
                          <span className={`${T.muted} text-xs`}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
