import React, { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Percent, BadgeMinus, Download, FileText, Loader2,
         TrendingUp, TrendingDown, AlertTriangle, Zap, Users, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { calcFeeSummary, downloadCSV, downloadPDFPrint } from '../../services/reportService';
import { motion, AnimatePresence } from 'framer-motion';

const Analytics = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // Exclude soft-deleted orders — UNCHANGED
  const orders_ = orders?.filter(o => !o.isDeleted) ?? orders;

  // ── download loading states — UNCHANGED ───────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  // ── NEW: which insight card is expanded ───────────────────────────────────
  const [openInsight, setOpenInsight] = useState(null);

  // ── Existing analytics — UNCHANGED ────────────────────────────────────────
  const analytics = useMemo(() => {
    if (!orders_ || orders_.length === 0) return null;

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    const revenueByDay = last7Days.map(day => {
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayOrders = orders_.filter(order => {
        const orderDate = order.createdAt?.toDate?.() || new Date(0);
        return orderDate >= day && orderDate < nextDay && order.paymentStatus === 'paid';
      });
      const revenue = dayOrders.reduce((sum, order) => sum + (order.totalAmount || order.total || 0), 0);
      return {
        date: day.toLocaleDateString('en-US', { weekday: 'short' }),
        revenue: parseFloat(revenue.toFixed(2)),
        orders: dayOrders.length
      };
    });

    const itemCounts = {};
    orders_.forEach(order => {
      order.items?.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });
    });
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const paidOrders    = orders_.filter(o => o.paymentStatus === 'paid').length;
    const pendingOrders = orders_.filter(o => o.paymentStatus === 'pending').length;
    const paymentSplit  = [
      { name: 'Paid',    value: paidOrders    },
      { name: 'Pending', value: pendingOrders },
    ];

    const newOrders       = orders_.filter(o => o.orderStatus === 'new').length;
    const preparingOrders = orders_.filter(o => o.orderStatus === 'preparing').length;
    const completedOrders = orders_.filter(o => o.orderStatus === 'completed').length;
    const orderStatusSplit = [
      { name: 'New',       value: newOrders       },
      { name: 'Preparing', value: preparingOrders },
      { name: 'Completed', value: completedOrders },
    ];

    return { revenueByDay, topItems, paymentSplit, orderStatusSplit };
  }, [orders_]);

  // ── fee summary — UNCHANGED ────────────────────────────────────────────────
  const feeSummary = useMemo(() => {
    if (!orders_ || !cafe) return null;
    return calcFeeSummary(orders_, cafe);
  }, [orders_, cafe]);

  // ── settings flags — UNCHANGED ─────────────────────────────────────────────
  const scEnabled  = cafe?.serviceChargeEnabled === true;
  const pfEnabled  = cafe?.platformFeeEnabled   === true;
  const showFeeCards = (scEnabled || pfEnabled) && feeSummary;

  // ── download handlers — UNCHANGED ─────────────────────────────────────────
  const handlePDF = () => {
    if (!orders_ || !cafe) { toast.error('No data to export'); return; }
    setPdfLoading(true);
    try {
      downloadPDFPrint(orders_, cafe);
      toast.success('PDF report opened — use Print → Save as PDF');
    } catch (err) {
      console.error('[Analytics] PDF error:', err);
      toast.error('Failed to generate report');
    } finally {
      setTimeout(() => setPdfLoading(false), 1500);
    }
  };

  const handleCSV = () => {
    if (!orders_ || !cafe) { toast.error('No data to export'); return; }
    setCsvLoading(true);
    try {
      downloadCSV(orders_, cafe);
      toast.success('CSV downloaded ✓');
    } catch (err) {
      console.error('[Analytics] CSV error:', err);
      toast.error('Failed to download CSV');
    } finally {
      setTimeout(() => setCsvLoading(false), 800);
    }
  };

  // ── NEW: growthData — additive only, zero impact on analytics/feeSummary ──
  // All guards: null-safe, division-safe, min-orders guard for insights.
  const growthData = useMemo(() => {
    if (!analytics || !orders_ || orders_.length === 0) return null;

    const safeN = (v) => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
    const pct   = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : parseFloat(((curr - prev) / prev * 100).toFixed(1));

    // ── Today vs yesterday (from already-computed revenueByDay) ─────────────
    const days         = analytics.revenueByDay;
    const todayRev     = days[6]?.revenue     ?? 0;
    const yesterdayRev = days[5]?.revenue     ?? 0;
    const todayOrders  = days[6]?.orders      ?? 0;
    const yOrders      = days[5]?.orders      ?? 0;
    const revPct       = pct(todayRev,    yesterdayRev);
    const ordersPct    = pct(todayOrders, yOrders);

    // ── AOV (uses feeSummary if available, else computed) ───────────────────
    const paidCount = orders_.filter(o => o.paymentStatus === 'paid').length;
    const grossRev  = feeSummary?.grossRevenue ?? orders_.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + safeN(o.totalAmount ?? o.total), 0);
    const aov       = paidCount > 0 ? parseFloat((grossRev / paidCount).toFixed(2)) : 0;

    // ── Missed revenue ───────────────────────────────────────────────────────
    const unpaidRev    = orders_.filter(o => o.paymentStatus === 'pending')
                                .reduce((s, o) => s + safeN(o.totalAmount ?? o.total), 0);
    const cancelledRev = orders_.filter(o => o.orderStatus === 'cancelled')
                                .reduce((s, o) => s + safeN(o.totalAmount ?? o.total), 0);

    // ── Peak hour ────────────────────────────────────────────────────────────
    const hourCounts = new Map();
    orders_.forEach(o => {
      const d = o.createdAt?.toDate?.();
      if (!d) return;
      const h = d.getHours();
      hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
    });
    let peakHour = null;
    let peakCount = 0;
    hourCounts.forEach((count, hour) => {
      if (count > peakCount) { peakCount = count; peakHour = hour; }
    });
    const fmtHour = (h) => {
      if (h === null) return '—';
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12  = h % 12 || 12;
      return `${h12} ${ampm}`;
    };
    const peakLabel = peakHour !== null ? `${fmtHour(peakHour)} – ${fmtHour((peakHour + 1) % 24)}` : null;

    // ── Customer behavior ────────────────────────────────────────────────────
    const phoneMap = new Map();
    orders_.forEach(o => {
      const ph = o.customerPhone?.replace(/\D/g, '');
      if (!ph || ph.length < 6) return;
      phoneMap.set(ph, (phoneMap.get(ph) || 0) + 1);
    });
    const uniqueCount = phoneMap.size;
    const repeatCount = uniqueCount > 0 ? [...phoneMap.values()].filter(c => c > 1).length : 0;
    const repeatPct   = uniqueCount > 0 ? parseFloat((repeatCount / uniqueCount * 100).toFixed(1)) : 0;
    const oneTimePct  = uniqueCount > 0 ? parseFloat(((uniqueCount - repeatCount) / uniqueCount * 100).toFixed(1)) : 0;

    // ── 3-day revenue trend ──────────────────────────────────────────────────
    const d4 = days[4]?.revenue ?? 0;
    const d5 = days[5]?.revenue ?? 0;
    const d6 = days[6]?.revenue ?? 0;
    const declining3 = d4 > 0 && d5 > 0 && d6 > 0 && d5 < d4 && d6 < d5;

    // ── Pending payment % ────────────────────────────────────────────────────
    const totalOrderCount  = orders_.length;
    const pendingCount     = orders_.filter(o => o.paymentStatus === 'pending').length;
    const pendingPct       = totalOrderCount > 0 ? (pendingCount / totalOrderCount * 100) : 0;

    // ── Most active day ──────────────────────────────────────────────────────
    const peakDay = days.reduce((best, d) => d.orders > (best?.orders ?? -1) ? d : best, null);

    // ── Insights (only if enough data) ──────────────────────────────────────
    const insights = [];
    if (orders_.length >= 5) {
      if (pendingPct > 40) {
        insights.push({
          id: 'PENDING_HIGH',
          icon: '⚠️',
          color: '#F59E0B',
          title: 'High Pending Payments',
          summary: `${pendingPct.toFixed(0)}% of orders unpaid`,
          detail: `${pendingCount} orders are still pending payment. Consider offering a small prepaid discount to nudge customers towards upfront payment and reduce collection friction.`,
        });
      }
      if (revPct < -20) {
        insights.push({
          id: 'REVENUE_DROP',
          icon: '📉',
          color: '#EF4444',
          title: "Today's Revenue Down",
          summary: `${revPct}% vs yesterday`,
          detail: `Today's revenue (${CUR}${todayRev.toFixed(0)}) is down ${Math.abs(revPct)}% from yesterday (${CUR}${yesterdayRev.toFixed(0)}). Check if staffing levels, menu availability, or external factors are impacting volume.`,
        });
      }
      if (declining3) {
        insights.push({
          id: 'DECLINING_TREND',
          icon: '📉',
          color: '#EF4444',
          title: '3-Day Revenue Decline',
          summary: 'Consistent downward trend',
          detail: `Revenue has declined on each of the last 3 tracked days. This pattern warrants attention — consider a limited-time offer, combo deal, or social media push to re-engage customers.`,
        });
      }
      const topItem    = analytics.topItems[0];
      const bottomItem = analytics.topItems[analytics.topItems.length - 1];
      if (topItem && analytics.topItems.length >= 4 && topItem.count > (analytics.topItems[3]?.count ?? 0) * 3) {
        insights.push({
          id: 'TOP_ITEM_STRONG',
          icon: '🔥',
          color: '#10B981',
          title: `"${topItem.name}" is Dominating`,
          summary: `${topItem.count} units sold — top seller`,
          detail: `"${topItem.name}" is outselling other items by 3×+. High demand suggests customers love it at the current price — a modest ${CUR}5–${CUR}10 price adjustment is unlikely to affect volume and would improve margin.`,
        });
      }
      if (bottomItem && bottomItem.count <= 2 && analytics.topItems.length >= 3) {
        insights.push({
          id: 'LOW_PERFORMER',
          icon: '📦',
          color: '#8B5CF6',
          title: `"${bottomItem.name}" Needs Review`,
          summary: `Only ${bottomItem.count} unit${bottomItem.count !== 1 ? 's' : ''} sold`,
          detail: `"${bottomItem.name}" has very low sales. Consider bundling it with a bestseller as a combo offer, repositioning it on the menu, or temporarily removing it to simplify the menu for staff and customers.`,
        });
      }
      if (aov > 0 && aov < 150) {
        insights.push({
          id: 'LOW_AOV',
          icon: '💰',
          color: '#3B82F6',
          title: 'Average Order Value is Low',
          summary: `${CUR}${aov} avg per order`,
          detail: `The average order value of ${CUR}${aov} is below typical café benchmarks. Introducing combo bundles (e.g. coffee + snack at a slight discount) or a "add-on" prompt at checkout could meaningfully raise this.`,
        });
      }
    }

    // ── Risk alerts ──────────────────────────────────────────────────────────
    const alerts = [];
    if (revPct < -20 && yesterdayRev > 0) {
      alerts.push({ level: 'high', message: `Revenue down ${Math.abs(revPct)}% vs yesterday (${CUR}${todayRev.toFixed(0)} vs ${CUR}${yesterdayRev.toFixed(0)})` });
    }
    if (declining3) {
      alerts.push({ level: 'high', message: 'Revenue has declined for 3 consecutive days' });
    }
    if (pendingPct > 40) {
      alerts.push({ level: 'med', message: `${pendingPct.toFixed(0)}% of orders have pending payments` });
    }

    return {
      todayRev, yesterdayRev, revPct,
      todayOrders, yOrders, ordersPct,
      aov,
      unpaidRev, cancelledRev,
      peakLabel, peakCount,
      uniqueCount, repeatCount, repeatPct, oneTimePct,
      declining3, pendingPct,
      peakDay,
      insights,
      alerts,
    };
  }, [analytics, orders_, feeSummary, CUR]);

  // ── empty state — UNCHANGED ────────────────────────────────────────────────
  if (!analytics) {
    return (
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
        <p className="text-[#A3A3A3] text-lg">No data available yet. Start receiving orders to see analytics!</p>
      </div>
    );
  }

  const COLORS = ['#D4AF37', '#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

  // ── small presentational helpers (pure, no side effects) ──────────────────
  const PctBadge = ({ val }) => {
    if (val === null || val === undefined) return null;
    const pos = val >= 0;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
        background: pos ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
        color: pos ? '#10B981' : '#EF4444',
        border: `1px solid ${pos ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
      }}>
        {pos ? '▲' : '▼'} {Math.abs(val)}%
      </span>
    );
  };

  return (
    <div className="space-y-6">

      {/* ── download buttons row — UNCHANGED ───────────────────────────────── */}
      {orders_ && cafe && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[#A3A3A3] text-sm">
            {orders_.filter(o => o.paymentStatus === 'paid').length} paid orders in total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCSV}
              disabled={csvLoading}
              className="flex items-center gap-1.5 px-4 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {csvLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              GST CSV
            </button>
            <button
              onClick={handlePDF}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-4 h-9 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF Report
            </button>
          </div>
        </div>
      )}

      {/* ── fee cards — UNCHANGED ──────────────────────────────────────────── */}
      {showFeeCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {scEnabled && (
            <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors" data-testid="stat-service-charges-collected">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Service Charges</p>
                <Percent className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <p className="text-3xl font-bold text-white">{CUR}{feeSummary.totalServiceCharge.toFixed(2)}</p>
              <p className="text-[#555] text-xs mt-1">{cafe?.serviceChargeRate || 0}% · all paid orders</p>
            </div>
          )}
          {pfEnabled && (
            <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors" data-testid="stat-platform-fees-collected">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Platform Fees</p>
                <BadgeMinus className="w-5 h-5 text-[#EF4444]" />
              </div>
              <p className="text-3xl font-bold text-white">{CUR}{feeSummary.totalPlatformFee.toFixed(2)}</p>
              <p className="text-[#555] text-xs mt-1">
                {cafe?.platformFeeType === 'fixed' ? `Fixed ${CUR}${cafe?.platformFeeValue || 0} / order` : `${cafe?.platformFeeValue || 0}% · all paid orders`}
              </p>
            </div>
          )}
          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors" data-testid="stat-final-net-amount">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Final Net</p>
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#10B981' }}>
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>₌</span>
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: '#10B981' }}>{CUR}{feeSummary.finalNetAmount.toFixed(2)}</p>
            <p className="text-[#555] text-xs mt-1">After GST {pfEnabled ? '+ platform fees' : ''}</p>
          </div>
        </div>
      )}

      {/* ── payment breakdown table — UNCHANGED ───────────────────────────── */}
      {showFeeCards && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3 className="text-xl font-semibold text-white mb-5" style={{ fontFamily: 'Playfair Display, serif' }}>
            Payment Breakdown
          </h3>
          <div className="space-y-0">
            {[
              { label: 'Total Orders',        value: feeSummary.totalOrders,        isMoney: false, color: '#E5E5E5' },
              { label: 'Gross Revenue',        value: feeSummary.grossRevenue,       isMoney: true,  color: '#E5E5E5' },
              { label: 'GST / Tax Collected',  value: feeSummary.gstCollected,       isMoney: true,  color: '#A3A3A3' },
              ...(scEnabled ? [{ label: 'Service Charges Collected', value: feeSummary.totalServiceCharge, isMoney: true, color: '#D4AF37' }] : []),
              ...(pfEnabled ? [{ label: 'Platform Fees Deducted',    value: feeSummary.totalPlatformFee,   isMoney: true, color: '#EF4444' }] : []),
              { label: 'Net Revenue',          value: feeSummary.netRevenue,         isMoney: true,  color: '#E5E5E5' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-3 border-b border-white/5">
                <span className="text-[#A3A3A3] text-sm">{row.label}</span>
                <span className="font-semibold text-sm" style={{ color: row.color }}>
                  {row.isMoney ? `${CUR}${Number(row.value).toFixed(2)}` : row.value}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-4 mt-1" style={{ borderTop: '2px solid rgba(212,175,55,0.3)' }}>
              <span className="text-white font-semibold text-sm">Final Net Amount</span>
              <span className="text-lg font-bold" style={{ color: feeSummary.finalNetAmount >= 0 ? '#10B981' : '#EF4444' }}>
                {CUR}{feeSummary.finalNetAmount.toFixed(2)}
              </span>
            </div>
            {pfEnabled && <p className="text-[#555] text-xs mt-1">Gross Revenue − GST − Platform Fees</p>}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          NEW: GROWTH ANALYTICS LAYER
          All sections below are additive. Zero impact on charts above/below.
      ══════════════════════════════════════════════════════════════════════ */}

      {growthData && (
        <>
          {/* ── Risk Alerts ──────────────────────────────────────────────── */}
          {growthData.alerts.length > 0 && (
            <div className="space-y-2">
              {growthData.alerts.map((alert, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 8,
                    background: alert.level === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${alert.level === 'high' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  }}
                >
                  <AlertTriangle style={{ width: 14, height: 14, color: alert.level === 'high' ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                  <span style={{ color: alert.level === 'high' ? '#EF4444' : '#F59E0B', fontSize: 13, fontWeight: 600 }}>
                    {alert.message}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Growth Summary Cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Today's Revenue",
                value: `${CUR}${growthData.todayRev.toFixed(0)}`,
                pct: growthData.revPct,
                sub: `Yesterday: ${CUR}${growthData.yesterdayRev.toFixed(0)}`,
                icon: IndianRupeeIcon,
                color: '#D4AF37',
              },
              {
                label: "Today's Orders",
                value: growthData.todayOrders,
                pct: growthData.ordersPct,
                sub: `Yesterday: ${growthData.yOrders}`,
                icon: ZapIcon,
                color: '#10B981',
              },
              {
                label: 'Avg Order Value',
                value: `${CUR}${growthData.aov}`,
                pct: null,
                sub: 'Per paid order',
                icon: TrendingUpIcon,
                color: '#3B82F6',
              },
              {
                label: 'Unpaid Revenue',
                value: `${CUR}${growthData.unpaidRev.toFixed(0)}`,
                pct: null,
                sub: 'Pending payments',
                icon: AlertIcon,
                color: growthData.unpaidRev > 0 ? '#F59E0B' : '#555',
              },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
                style={{
                  background: 'linear-gradient(135deg, rgba(15,15,15,0.98), rgba(20,20,20,0.95))',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderLeft: `3px solid ${card.color}`,
                  borderRadius: 10, padding: '16px',
                  cursor: 'default',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* ambient glow */}
                <div style={{
                  position: 'absolute', top: 0, right: 0, width: 60, height: 60,
                  background: `radial-gradient(circle at 100% 0%, ${card.color}15, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
                  {card.label}
                </p>
                <p style={{ color: card.color, fontSize: 22, fontWeight: 900, fontFamily: 'Playfair Display, serif', lineHeight: 1 }}>
                  {card.value}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  {card.pct !== null && <PctBadge val={card.pct} />}
                  <span style={{ color: '#444', fontSize: 11 }}>{card.sub}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Insight Cards + Missed Revenue + Peak + Customer ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Insights Panel */}
            {growthData.insights.length > 0 && (
              <div style={{
                gridColumn: growthData.insights.length > 2 ? 'span 2' : 'span 1',
                background: 'rgba(12,12,12,0.98)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '18px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Zap style={{ width: 14, height: 14, color: '#D4AF37' }} />
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'Playfair Display, serif' }}>
                    Insights
                  </p>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, color: '#555',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 20, padding: '2px 8px',
                  }}>
                    {growthData.insights.length} active
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {growthData.insights.map((ins) => (
                    <div key={ins.id}>
                      <button
                        onClick={() => setOpenInsight(openInsight === ins.id ? null : ins.id)}
                        style={{
                          width: '100%', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8,
                          background: openInsight === ins.id ? `${ins.color}10` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${openInsight === ins.id ? `${ins.color}30` : 'rgba(255,255,255,0.06)'}`,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{ins.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: '#ddd', fontSize: 12, fontWeight: 700 }}>{ins.title}</p>
                          <p style={{ color: '#555', fontSize: 11, marginTop: 1 }}>{ins.summary}</p>
                        </div>
                        {openInsight === ins.id
                          ? <ChevronUp style={{ width: 14, height: 14, color: '#555', flexShrink: 0 }} />
                          : <ChevronDown style={{ width: 14, height: 14, color: '#555', flexShrink: 0 }} />
                        }
                      </button>
                      <AnimatePresence>
                        {openInsight === ins.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{
                              padding: '10px 14px',
                              borderLeft: `3px solid ${ins.color}`,
                              marginTop: 4, borderRadius: '0 0 6px 6px',
                              background: 'rgba(255,255,255,0.02)',
                            }}>
                              <p style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>{ins.detail}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Right column: Missed Revenue + Peak Time + Customer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Missed Revenue */}
              <div style={{
                background: 'rgba(12,12,12,0.98)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '16px 18px',
              }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'Playfair Display, serif', marginBottom: 12 }}>
                  Missed Revenue
                </p>
                {[
                  { label: 'Unpaid',    val: growthData.unpaidRev,    color: '#F59E0B' },
                  { label: 'Cancelled', val: growthData.cancelledRev, color: '#EF4444' },
                ].map(r => (
                  <div key={r.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{ color: '#666', fontSize: 12 }}>{r.label}</span>
                    <span style={{ color: r.val > 0 ? r.color : '#333', fontWeight: 700, fontSize: 13 }}>
                      {CUR}{r.val.toFixed(0)}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <p style={{ color: '#888', fontSize: 11 }}>
                    Total at risk: <strong style={{ color: '#EF4444' }}>{CUR}{(growthData.unpaidRev + growthData.cancelledRev).toFixed(0)}</strong>
                  </p>
                </div>
              </div>

              {/* Peak Time */}
              {growthData.peakLabel && (
                <div style={{
                  background: 'rgba(12,12,12,0.98)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Clock style={{ width: 13, height: 13, color: '#D4AF37' }} />
                    <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'Playfair Display, serif' }}>
                      Peak Time
                    </p>
                  </div>
                  <p style={{ color: '#D4AF37', fontSize: 20, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>
                    {growthData.peakLabel}
                  </p>
                  <p style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
                    {growthData.peakCount} order{growthData.peakCount !== 1 ? 's' : ''} in peak hour
                  </p>
                  {growthData.peakCount >= 8 && (
                    <p style={{ marginTop: 6, fontSize: 11, color: '#F59E0B' }}>
                      ⚡ High traffic — ensure extra staff
                    </p>
                  )}
                </div>
              )}

              {/* Customer Behavior */}
              {growthData.uniqueCount > 0 && (
                <div style={{
                  background: 'rgba(12,12,12,0.98)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Users style={{ width: 13, height: 13, color: '#3B82F6' }} />
                    <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'Playfair Display, serif' }}>
                      Customers
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 6, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                      <p style={{ color: '#10B981', fontSize: 18, fontWeight: 900 }}>{growthData.repeatPct}%</p>
                      <p style={{ color: '#555', fontSize: 10, marginTop: 2 }}>Repeat</p>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 6, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
                      <p style={{ color: '#3B82F6', fontSize: 18, fontWeight: 900 }}>{growthData.oneTimePct}%</p>
                      <p style={{ color: '#555', fontSize: 10, marginTop: 2 }}>One-time</p>
                    </div>
                  </div>
                  <p style={{ color: '#444', fontSize: 11, marginTop: 8 }}>{growthData.uniqueCount} unique customers identified</p>
                </div>
              )}

            </div>
          </div>

          {/* ── Quick Insights Summary ────────────────────────────────────── */}
          {growthData.peakDay && (
            <div style={{
              background: 'rgba(212,175,55,0.04)',
              border: '1px solid rgba(212,175,55,0.12)',
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', flexWrap: 'wrap', gap: '6px 20px',
            }}>
              <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', width: '100%', marginBottom: 2 }}>
                📊 Quick Summary
              </span>
              {analytics.topItems[0] && (
                <span style={{ color: '#888', fontSize: 12 }}>
                  🔥 Best item: <strong style={{ color: '#ccc' }}>{analytics.topItems[0].name}</strong> ({analytics.topItems[0].count} sold)
                </span>
              )}
              {growthData.peakDay.orders > 0 && (
                <span style={{ color: '#888', fontSize: 12 }}>
                  📅 Most active day: <strong style={{ color: '#ccc' }}>{growthData.peakDay.date}</strong> ({growthData.peakDay.orders} orders)
                </span>
              )}
              {growthData.pendingPct > 0 && (
                <span style={{ color: '#888', fontSize: 12 }}>
                  ⏳ Pending: <strong style={{ color: growthData.pendingPct > 40 ? '#F59E0B' : '#ccc' }}>{growthData.pendingPct.toFixed(0)}%</strong> of orders
                </span>
              )}
              {growthData.aov > 0 && (
                <span style={{ color: '#888', fontSize: 12 }}>
                  💰 AOV: <strong style={{ color: '#ccc' }}>{CUR}{growthData.aov}</strong>
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EXISTING CHARTS — ZERO CHANGES BELOW THIS LINE
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Revenue Chart — UNCHANGED */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Revenue (Last 7 Days)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analytics.revenueByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#A3A3A3" />
            <YAxis stroke="#A3A3A3" />
            <Tooltip
              contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              labelStyle={{ color: '#E5E5E5' }}
              formatter={(value) => [`${CUR}${value}`, `Revenue (${CUR})`]}
            />
            <Legend wrapperStyle={{ color: '#E5E5E5' }} />
            <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} {...{ name: `Revenue (${CUR})` }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Orders per Day — UNCHANGED */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Orders (Last 7 Days)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.revenueByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#A3A3A3" />
            <YAxis stroke="#A3A3A3" />
            <Tooltip
              contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              labelStyle={{ color: '#E5E5E5' }}
            />
            <Legend wrapperStyle={{ color: '#E5E5E5' }} />
            <Bar dataKey="orders" fill="#10B981" name="Orders" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Selling Items — UNCHANGED */}
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Best Selling Items
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis type="number" stroke="#A3A3A3" />
              <YAxis type="category" dataKey="name" stroke="#A3A3A3" width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                labelStyle={{ color: '#E5E5E5' }}
              />
              <Bar dataKey="count" fill="#D4AF37" name="Quantity Sold" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Status — UNCHANGED */}
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Payment Status
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.paymentSplit}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {analytics.paymentSplit.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                labelStyle={{ color: '#E5E5E5' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Order Status — UNCHANGED */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Order Status Distribution
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={analytics.orderStatusSplit}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {analytics.orderStatusSplit.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              labelStyle={{ color: '#E5E5E5' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

// ── Tiny inline icon shims (avoid import name conflicts) ─────────────────────
const IndianRupeeIcon = ({ style }) => <span style={{ ...style, display: 'inline-block', fontWeight: 900, fontSize: style?.width || 14 }}>₹</span>;
const ZapIcon         = ({ style }) => <Zap   style={style} />;
const TrendingUpIcon  = ({ style }) => <TrendingUp style={style} />;
const AlertIcon       = ({ style }) => <AlertTriangle style={style} />;

export default Analytics;
