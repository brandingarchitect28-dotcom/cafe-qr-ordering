/**
 * AdvancedAnalytics.jsx
 *
 * Tasks 1, 2, 3, 4, 5, 13: Full analytics dashboard.
 * - Revenue, GST, Profit, Category, Source, Peak Hours
 * - PDF Download + WhatsApp Share
 * - 60s auto-refresh, manual refresh button
 * - NO real-time listeners (Task 15)
 */

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
  TrendingUp, ShoppingBag, IndianRupee, Download,
  MessageSquare, RefreshCw, Clock, Package,
  Star, BarChart2, FileText, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadPDFReport, downloadGSTCSV, buildWhatsAppReport } from '../../services/pdfReportService';

// ─── constants ────────────────────────────────────────────────────────────────

const COLORS = ['#D4AF37', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

const CARD_VARIANTS = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35 } }),
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Skeleton = ({ h = 'h-4', w = 'w-full' }) => (
  <div className={`${h} ${w} rounded bg-white/5 animate-pulse`} />
);

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, icon: Icon, color, index }) => (
  <motion.div
    custom={index}
    variants={CARD_VARIANTS}
    initial="hidden"
    animate="visible"
    whileHover={{ y: -3, transition: { duration: 0.2 } }}
    className="bg-[#0F0F0F] border border-white/5 rounded-xl p-5"
  >
    <div className="flex items-center justify-between mb-3">
      <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">{label}</p>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
    </div>
    <p className="text-2xl font-black" style={{ color }}>{value}</p>
    {sub && <p className="text-[#555] text-xs mt-1">{sub}</p>}
  </motion.div>
);

// ─── Section card ─────────────────────────────────────────────────────────────

const SectionCard = ({ title, icon: Icon, children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-[#0F0F0F] border border-white/5 rounded-xl overflow-hidden"
  >
    <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
      <Icon className="w-4 h-4 text-[#D4AF37]" />
      <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
        {title}
      </h3>
    </div>
    <div className="p-5">{children}</div>
  </motion.div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const AdvancedAnalytics = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const [dateRange, setDateRange] = useState(30);
  const { data, loading, error, lastFetch, refresh } = useAdvancedAnalytics(cafeId, dateRange);

  const handleDownloadPDF = () => {
    if (!data) { toast.error('No data to export'); return; }
    downloadPDFReport(data, cafe, dateRange);
    toast.success('Report opened — use browser print to save as PDF');
  };

  const handleDownloadGST = () => {
    if (!data) { toast.error('No data to export'); return; }
    downloadGSTCSV(data, cafe, dateRange === 30 ? 'monthly' : 'weekly');
    toast.success('GST CSV downloaded ✓');
  };

  const handleWhatsApp = () => {
    if (!data) { toast.error('No data to share'); return; }
    const msg = buildWhatsAppReport(data, cafe, dateRange);
    const phone = cafe?.whatsappNumber || '';
    const url = phone
      ? `https://wa.me/${phone.replace(/\D/g,'')  }?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-white font-bold text-2xl" style={{ fontFamily: 'Playfair Display, serif' }}>
            Advanced Analytics
          </h2>
          {lastFetch && (
            <p className="text-[#555] text-xs mt-1">
              Last updated {lastFetch.toLocaleTimeString()} · auto-refreshes every 60s
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={dateRange}
            onChange={e => setDateRange(Number(e.target.value))}
            className="bg-black/20 border border-white/10 text-white text-sm rounded-sm px-3 h-9 focus:border-[#D4AF37]"
          >
            <option value={7}  className="bg-[#0F0F0F]">Last 7 days</option>
            <option value={30} className="bg-[#0F0F0F]">Last 30 days</option>
            <option value={90} className="bg-[#0F0F0F]">Last 90 days</option>
          </select>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-3 h-9 bg-white/5 hover:bg-white/10 border border-white/10 text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={handleDownloadGST}
            className="flex items-center gap-2 px-3 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-sm transition-all">
            <FileText className="w-3.5 h-3.5" />
            GST CSV
          </button>
          <button onClick={handleWhatsApp}
            className="flex items-center gap-2 px-3 h-9 bg-green-600 hover:bg-green-700 text-white rounded-sm text-sm transition-all">
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp
          </button>
          <button onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 h-9 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all">
            <Download className="w-3.5 h-3.5" />
            PDF Report
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#0F0F0F] border border-white/5 rounded-xl p-5 space-y-3">
              <Skeleton h="h-3" w="w-1/2" />
              <Skeleton h="h-7" w="w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* No data */}
      {!loading && !data && !error && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-xl p-12 text-center">
          <BarChart2 className="w-12 h-12 text-[#A3A3A3]/30 mx-auto mb-3" />
          <p className="text-[#A3A3A3]">No analytics data yet. Start receiving orders to see insights.</p>
        </div>
      )}

      {data && (
        <>
          {/* ── Revenue stat cards ────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Gross Revenue',  value: `${CUR}${data.revenue.gross.toFixed(2)}`,      sub: `${data.revenue.paidOrders} paid orders`, icon: IndianRupee, color: '#10B981', index: 0 },
              { label: 'Net Revenue',    value: `${CUR}${data.revenue.netRevenue.toFixed(2)}`,  sub: `After discounts`,                         icon: TrendingUp,  color: '#D4AF37', index: 1 },
              { label: 'Avg Order',      value: `${CUR}${data.revenue.aov.toFixed(2)}`,         sub: `Per paid order`,                          icon: ShoppingBag, color: '#3B82F6', index: 2 },
              { label: 'Total Orders',   value: data.revenue.totalOrders,                        sub: `Last ${dateRange} days`,                  icon: Package,     color: '#F59E0B', index: 3 },
              { label: 'GST Collected',  value: `${CUR}${data.gst.totalGST.toFixed(2)}`,        sub: `Across all slabs`,                        icon: FileText,    color: '#8B5CF6', index: 4 },
              { label: 'Net Profit',     value: `${CUR}${data.profit.netProfit.toFixed(2)}`,     sub: `Margin: ${data.profit.margin}%`,          icon: Star,        color: data.profit.netProfit >= 0 ? '#10B981' : '#EF4444', index: 5 },
            ].map(stat => <StatCard key={stat.label} {...stat} />)}
          </div>

          {/* ── Revenue chart ─────────────────────────────────────────── */}
          <SectionCard title="Revenue Trend" icon={TrendingUp} delay={0.1}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="#555" fontSize={10} />
                <YAxis stroke="#555" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} labelStyle={{ color: '#E5E5E5' }} formatter={v => [`${CUR}${v}`, 'Revenue']} />
                <Legend wrapperStyle={{ color: '#A3A3A3', fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name={`Revenue (${CUR})`} stroke="#D4AF37" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders" name="Orders" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── GST Summary ─────────────────────────────────────────── */}
            <SectionCard title="GST Summary" icon={FileText} delay={0.15}>
              <div className="space-y-3 mb-4">
                {(data.gst.byRate || []).map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                    <span className="text-[#A3A3A3]">GST {g.rate}%</span>
                    <div className="text-right">
                      <p className="text-white font-semibold">{CUR}{g.gst.toFixed(2)}</p>
                      <p className="text-[#555] text-xs">on {CUR}{g.taxable.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {(data.gst.byRate || []).length === 0 && (
                  <p className="text-[#555] text-sm text-center py-4">No GST data for this period</p>
                )}
              </div>
              <div className="flex justify-between items-center p-3 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-lg">
                <span className="text-white font-semibold text-sm">Total GST</span>
                <span className="text-[#D4AF37] font-black text-lg">{CUR}{data.gst.totalGST.toFixed(2)}</span>
              </div>
            </SectionCard>

            {/* ── Profit breakdown ─────────────────────────────────────── */}
            <SectionCard title="Profit Analysis" icon={IndianRupee} delay={0.2}>
              {!data.profit.hasCostData && (
                <p className="text-[#555] text-xs mb-3 italic">Add recipe costs in Inventory to see full profit analysis</p>
              )}
              {[
                { label: 'Total Revenue',  val: data.profit.totalRevenue,  color: '#10B981' },
                { label: 'Cost of Goods',  val: -data.profit.totalCost,    color: '#EF4444' },
                { label: 'GST Paid',       val: -data.profit.totalGST,     color: '#F59E0B' },
              ].map(row => (
                <div key={row.label} className="flex justify-between py-2.5 border-b border-white/5 text-sm">
                  <span className="text-[#A3A3A3]">{row.label}</span>
                  <span className="font-semibold" style={{ color: row.color }}>
                    {row.val >= 0 ? '+' : ''}{CUR}{Math.abs(row.val).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-3 font-bold text-base">
                <span className="text-white">Net Profit</span>
                <span style={{ color: data.profit.netProfit >= 0 ? '#10B981' : '#EF4444' }}>
                  {CUR}{data.profit.netProfit.toFixed(2)}
                  <span className="text-sm font-normal ml-1">({data.profit.margin}%)</span>
                </span>
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Payment breakdown ──────────────────────────────────── */}
            <SectionCard title="Payment Methods" icon={IndianRupee} delay={0.25}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.payment} cx="50%" cy="50%" outerRadius={80} dataKey="count"
                    label={({ method, pct }) => `${method}: ${pct}%`} labelLine={false}>
                    {data.payment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v, _, p) => [v, p.payload.method]} />
                </PieChart>
              </ResponsiveContainer>
            </SectionCard>

            {/* ── Order sources ─────────────────────────────────────── */}
            <SectionCard title="Order Sources" icon={ShoppingBag} delay={0.3}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.source} cx="50%" cy="50%" outerRadius={80} dataKey="count"
                    label={({ source, pct }) => `${source}: ${pct}%`} labelLine={false}>
                    {data.source.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* ── Peak hours ────────────────────────────────────────────── */}
          <SectionCard title="Peak Hours" icon={Clock} delay={0.35}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.peakHours.filter(h => h.count > 0 || true).slice(6, 24)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="#555" fontSize={9} interval={1} />
                <YAxis stroke="#555" fontSize={9} />
                <Tooltip contentStyle={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} labelStyle={{ color: '#E5E5E5' }} />
                <Bar dataKey="count" name="Orders" fill="#D4AF37" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* ── Category analytics ────────────────────────────────────── */}
          <SectionCard title="Category Performance" icon={BarChart2} delay={0.4}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                {(data.categories.categories || []).slice(0, 6).map((cat, i) => (
                  <div key={cat.category} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white font-medium">{cat.category}</span>
                      <span className="text-[#A3A3A3]">{CUR}{cat.revenue.toFixed(2)} · {cat.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${cat.pct}%` }}
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                        className="h-full rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
                {data.categories.highest && (
                  <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs">
                    🏆 <span className="text-emerald-400 font-semibold">Best:</span>
                    <span className="text-white ml-1">{data.categories.highest.category}</span>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.categories.categories.slice(0, 6)} cx="50%" cy="50%" outerRadius={75}
                    dataKey="revenue" nameKey="category" labelLine={false}
                    label={({ category, pct }) => pct > 8 ? `${category.slice(0, 8)}: ${pct}%` : ''}>
                    {data.categories.categories.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v) => [`${CUR}${v.toFixed(2)}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* ── Top items ─────────────────────────────────────────────── */}
          <SectionCard title="Item Performance" icon={Star} delay={0.45}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-[#A3A3A3] text-xs uppercase tracking-wide mb-3">Top Performers</p>
                {(data.items.top || []).slice(0, 5).map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[#D4AF37] font-black w-5 text-center">{i + 1}</span>
                      <div>
                        <p className="text-white font-medium">{item.name}</p>
                        <p className="text-[#555] text-xs">{item.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[#D4AF37] font-semibold">{CUR}{item.revenue.toFixed(0)}</p>
                      <p className="text-[#555] text-xs">{item.qty} sold</p>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[#A3A3A3] text-xs uppercase tracking-wide mb-3">Needs Attention</p>
                {(data.items.bottom || []).slice(0, 5).map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                    <div>
                      <p className="text-white font-medium">{item.name}</p>
                      <p className="text-[#555] text-xs">{item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-red-400 font-semibold">{CUR}{item.revenue.toFixed(0)}</p>
                      <p className="text-[#555] text-xs">{item.qty} sold</p>
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
