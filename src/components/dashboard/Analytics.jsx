import React, { useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Percent, BadgeMinus, Download, FileText, Loader2,
         TrendingUp, TrendingDown, AlertTriangle, Zap, Users, Clock, ChevronDown, ChevronUp,
         X, BarChart2, TrendingDown as TrendDown, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { calcFeeSummary, downloadCSV, downloadPDFPrint } from '../../services/reportService';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────────────────────
   VISUAL-ONLY HELPERS  (no business logic)
───────────────────────────────────────────────────────────────────────────── */

// Glassmorphism card base styles
const glass = (accentColor = 'rgba(212,175,55,0.12)', extra = {}) => ({
  background: 'linear-gradient(135deg, rgba(18,18,18,0.97) 0%, rgba(24,24,24,0.93) 100%)',
  border: `1px solid ${accentColor}`,
  borderRadius: 14,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
  ...extra,
});

// Animated sparkle dot
const PulseDot = ({ color = '#D4AF37' }) => (
  <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
    <span style={{
      position: 'absolute', inset: 0, borderRadius: '50%',
      background: color, opacity: 0.35,
      animation: 'ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
    }} />
    <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', width: 8, height: 8, background: color }} />
  </span>
);

// Gradient separator
const GradientRule = ({ color = '#D4AF37' }) => (
  <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${color}55, transparent)`, margin: '4px 0' }} />
);

// Section header with accent line
const SectionHeading = ({ children, badge }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
    <div style={{ width: 3, height: 22, background: 'linear-gradient(180deg, #D4AF37, rgba(212,175,55,0.2))', borderRadius: 2 }} />
    <h3 style={{
      fontSize: 17, fontWeight: 700, color: '#F0F0F0',
      fontFamily: "'Playfair Display', serif", letterSpacing: '-0.01em', margin: 0,
    }}>
      {children}
    </h3>
    {badge && (
      <span style={{
        marginLeft: 'auto', fontSize: 10, color: '#666',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 20, padding: '3px 10px', fontFamily: 'monospace',
      }}>
        {badge}
      </span>
    )}
  </div>
);

// Insight summary pill above chart
const InsightPill = ({ text, color = '#D4AF37' }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 12px', borderRadius: 20,
    background: `${color}12`,
    border: `1px solid ${color}30`,
    marginBottom: 14,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
    <span style={{ color, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>{text}</span>
  </div>
);

// Custom tooltip wrapper for recharts
const CustomTooltipStyle = {
  backgroundColor: 'rgba(14,14,14,0.97)',
  border: '1px solid rgba(212,175,55,0.2)',
  borderRadius: 10,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
};

// Modal backdrop + panel
const ChartModal = ({ isOpen, onClose, title, children }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        key="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
      >
        <motion.div
          key="modal-panel"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            ...glass('rgba(212,175,55,0.15)'),
            width: '100%', maxWidth: 680,
            maxHeight: '90vh', overflowY: 'auto',
            padding: '28px 28px 32px',
          }}
        >
          {/* Modal header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 3, height: 20, background: 'linear-gradient(180deg,#D4AF37,rgba(212,175,55,0.1))', borderRadius: 2 }} />
              <h2 style={{ color: '#F0F0F0', fontSize: 18, fontWeight: 700, fontFamily: "'Playfair Display', serif", margin: 0 }}>
                {title}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#888', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#888'; }}
            >
              <X size={15} />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Metric chip inside modal
const ModalMetric = ({ label, value, color = '#D4AF37', sub }) => (
  <div style={{
    flex: 1, minWidth: 100,
    background: `${color}0C`,
    border: `1px solid ${color}25`,
    borderRadius: 10, padding: '12px 14px',
    textAlign: 'center',
  }}>
    <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
    <p style={{ color, fontSize: 20, fontWeight: 900, fontFamily: "'Playfair Display', serif" }}>{value}</p>
    {sub && <p style={{ color: '#444', fontSize: 10, marginTop: 3 }}>{sub}</p>}
  </div>
);

// Derive chart insight text + metrics from data
const deriveChartInsights = (chartKey, data, CUR) => {
  if (!data) return null;
  switch (chartKey) {
    case 'revenue': {
      const vals = data.revenueByDay;
      if (!vals || !vals.length) return null;
      const sorted = [...vals].sort((a, b) => b.revenue - a.revenue);
      const peak = sorted[0];
      const low  = sorted[sorted.length - 1];
      const avg  = vals.reduce((s, d) => s + d.revenue, 0) / vals.length;
      const last2 = vals.slice(-2);
      const trend = last2[1]?.revenue >= last2[0]?.revenue ? 'upward' : 'downward';
      const total = vals.reduce((s, d) => s + d.revenue, 0);
      const changePct = last2[0]?.revenue > 0
        ? (((last2[1]?.revenue - last2[0]?.revenue) / last2[0]?.revenue) * 100).toFixed(1)
        : null;
      return {
        title: 'Revenue Analysis',
        insightPill: peak ? `Revenue peaked on ${peak.date}` : 'Revenue trend over 7 days',
        pillColor: trend === 'upward' ? '#10B981' : '#F59E0B',
        highest: { label: 'Peak Day', value: `${CUR}${peak?.revenue?.toFixed(0) ?? '—'}`, sub: peak?.date, color: '#10B981' },
        lowest:  { label: 'Lowest Day', value: `${CUR}${low?.revenue?.toFixed(0) ?? '—'}`,  sub: low?.date,  color: '#EF4444' },
        average: { label: '7-Day Avg',  value: `${CUR}${avg.toFixed(0)}`,  color: '#D4AF37' },
        change:  changePct !== null ? { label: 'Day-over-Day', value: `${changePct > 0 ? '+' : ''}${changePct}%`, color: parseFloat(changePct) >= 0 ? '#10B981' : '#EF4444' } : null,
        analysis: `Revenue ${trend === 'upward' ? 'shows an upward trajectory' : 'has been on a downward trend'} over the past 7 days. ${peak ? `The highest earning day was ${peak.date} with ${CUR}${peak.revenue.toFixed(0)}` : ''}. Total 7-day revenue stands at ${CUR}${total.toFixed(0)}, with a daily average of ${CUR}${avg.toFixed(0)}.`,
        suggestion: trend === 'downward'
          ? '💡 Consider a limited-time promotion or combo deal on low-revenue days to drive volume.'
          : '💡 Capitalize on peak days by ensuring full inventory and adequate staffing.',
      };
    }
    case 'orders': {
      const vals = data.revenueByDay;
      if (!vals || !vals.length) return null;
      const sorted = [...vals].sort((a, b) => b.orders - a.orders);
      const peak = sorted[0];
      const low  = sorted[sorted.length - 1];
      const avg  = vals.reduce((s, d) => s + d.orders, 0) / vals.length;
      const weekendDays = ['Sat', 'Sun'];
      const weekendOrders = vals.filter(d => weekendDays.some(w => d.date?.includes(w))).reduce((s, d) => s + d.orders, 0);
      return {
        title: 'Orders Analysis',
        insightPill: peak ? `Orders highest on ${peak.date}` : 'Order volume last 7 days',
        pillColor: '#10B981',
        highest: { label: 'Busiest Day', value: `${peak?.orders ?? '—'} orders`, sub: peak?.date, color: '#10B981' },
        lowest:  { label: 'Slowest Day', value: `${low?.orders ?? '—'} orders`,  sub: low?.date,  color: '#F59E0B' },
        average: { label: 'Daily Avg',   value: `${avg.toFixed(1)} orders`, color: '#D4AF37' },
        change:  weekendOrders > 0 ? { label: 'Weekend Orders', value: weekendOrders, color: '#3B82F6' } : null,
        analysis: `Order volume over the past 7 days peaked on ${peak?.date ?? 'an unknown day'} with ${peak?.orders ?? 0} orders. The daily average is ${avg.toFixed(1)} orders. ${weekendOrders > 0 ? `Weekend volume accounts for ${weekendOrders} orders — plan staffing accordingly.` : ''}`,
        suggestion: `💡 ${low?.orders === 0 ? `No orders on ${low?.date} — consider running a flash deal on quiet days.` : 'Identify low-traffic patterns and plan targeted promotions to boost order volume.'}`,
      };
    }
    case 'items': {
      const vals = data.topItems;
      if (!vals || !vals.length) return null;
      const top = vals[0];
      const bot = vals[vals.length - 1];
      const total = vals.reduce((s, d) => s + d.count, 0);
      const topShare = total > 0 ? ((top.count / total) * 100).toFixed(0) : 0;
      return {
        title: 'Best Selling Items Analysis',
        insightPill: top ? `"${top.name}" leads with ${top.count} units sold` : 'Top items by quantity',
        pillColor: '#D4AF37',
        highest: { label: '#1 Item',     value: top?.name,  sub: `${top?.count} units`, color: '#D4AF37' },
        lowest:  { label: 'Needs Boost', value: bot?.name,  sub: `${bot?.count} units`, color: '#F59E0B' },
        average: { label: 'Top 5 Total', value: `${total} units`, color: '#3B82F6' },
        change:  { label: 'Top Item Share', value: `${topShare}%`, color: '#10B981' },
        analysis: `"${top?.name}" dominates sales with ${top?.count} units, representing ${topShare}% of top-5 volume. The bottom performer "${bot?.name}" has only ${bot?.count} units sold.`,
        suggestion: `💡 Consider bundling "${bot?.name}" with "${top?.name}" as a combo to increase its visibility and sales.`,
      };
    }
    case 'payment': {
      const vals = data.paymentSplit;
      if (!vals || !vals.length) return null;
      const paid    = vals.find(v => v.name === 'Paid')?.value ?? 0;
      const pending = vals.find(v => v.name === 'Pending')?.value ?? 0;
      const total   = paid + pending;
      const pendPct = total > 0 ? ((pending / total) * 100).toFixed(0) : 0;
      const isHigh  = parseFloat(pendPct) > 40;
      return {
        title: 'Payment Status Analysis',
        insightPill: isHigh ? `Pending payments slightly high at ${pendPct}%` : `${100 - parseInt(pendPct)}% of orders successfully paid`,
        pillColor: isHigh ? '#F59E0B' : '#10B981',
        highest: { label: 'Paid Orders',    value: paid,    sub: 'Confirmed revenue', color: '#10B981' },
        lowest:  { label: 'Pending Orders', value: pending, sub: 'Awaiting payment',  color: isHigh ? '#F59E0B' : '#888' },
        average: { label: 'Total Orders',   value: total,   color: '#D4AF37' },
        change:  { label: 'Pending Rate', value: `${pendPct}%`, color: isHigh ? '#F59E0B' : '#10B981' },
        analysis: `${paid} out of ${total} orders (${100 - parseInt(pendPct)}%) have been paid. ${pending} orders (${pendPct}%) remain pending. ${isHigh ? 'The pending rate is above the 40% threshold — this warrants attention to improve payment collection.' : 'The payment collection rate is healthy.'}`,
        suggestion: isHigh
          ? '💡 Consider offering a small discount for upfront payment to reduce pending orders.'
          : '💡 Maintain current payment flow — collection rate is performing well.',
      };
    }
    case 'orderstatus': {
      const vals = data.orderStatusSplit;
      if (!vals || !vals.length) return null;
      const completed  = vals.find(v => v.name === 'Completed')?.value  ?? 0;
      const preparing  = vals.find(v => v.name === 'Preparing')?.value  ?? 0;
      const newOrders  = vals.find(v => v.name === 'New')?.value        ?? 0;
      const total      = completed + preparing + newOrders;
      const compPct    = total > 0 ? ((completed / total) * 100).toFixed(0) : 0;
      return {
        title: 'Order Status Analysis',
        insightPill: `${compPct}% of orders completed`,
        pillColor: parseInt(compPct) > 60 ? '#10B981' : '#F59E0B',
        highest: { label: 'Completed',  value: completed,  sub: 'Fulfilled orders', color: '#10B981' },
        lowest:  { label: 'New',        value: newOrders,  sub: 'Awaiting action',  color: '#3B82F6' },
        average: { label: 'Preparing',  value: preparing,  sub: 'In progress',      color: '#D4AF37' },
        change:  { label: 'Completion Rate', value: `${compPct}%`, color: parseInt(compPct) > 60 ? '#10B981' : '#F59E0B' },
        analysis: `Out of ${total} total orders, ${completed} (${compPct}%) are completed. ${preparing} are currently being prepared and ${newOrders} are newly placed. ${parseInt(compPct) < 50 ? 'Completion rate is below 50% — review kitchen throughput.' : 'Fulfillment is on track.'}`,
        suggestion: newOrders > preparing
          ? '💡 High number of new orders queued — consider expediting preparation flow.'
          : '💡 Preparation pipeline looks balanced. Monitor for bottlenecks during peak hours.',
      };
    }
    default: return null;
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
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

  // ── NEW: chart modal state ─────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState(null); // 'revenue' | 'orders' | 'items' | 'payment' | 'orderstatus'

  const openModal  = useCallback((key) => setActiveModal(key), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

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
  const growthData = useMemo(() => {
    if (!analytics || !orders_ || orders_.length === 0) return null;

    const safeN = (v) => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
    const pct   = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : parseFloat(((curr - prev) / prev * 100).toFixed(1));

    const days         = analytics.revenueByDay;
    const todayRev     = days[6]?.revenue     ?? 0;
    const yesterdayRev = days[5]?.revenue     ?? 0;
    const todayOrders  = days[6]?.orders      ?? 0;
    const yOrders      = days[5]?.orders      ?? 0;
    const revPct       = pct(todayRev,    yesterdayRev);
    const ordersPct    = pct(todayOrders, yOrders);

    const paidCount = orders_.filter(o => o.paymentStatus === 'paid').length;
    const grossRev  = feeSummary?.grossRevenue ?? orders_.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + safeN(o.totalAmount ?? o.total), 0);
    const aov       = paidCount > 0 ? parseFloat((grossRev / paidCount).toFixed(2)) : 0;

    const unpaidRev    = orders_.filter(o => o.paymentStatus === 'pending')
                                .reduce((s, o) => s + safeN(o.totalAmount ?? o.total), 0);
    const cancelledRev = orders_.filter(o => o.orderStatus === 'cancelled')
                                .reduce((s, o) => s + safeN(o.totalAmount ?? o.total), 0);

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

    const d4 = days[4]?.revenue ?? 0;
    const d5 = days[5]?.revenue ?? 0;
    const d6 = days[6]?.revenue ?? 0;
    const declining3 = d4 > 0 && d5 > 0 && d6 > 0 && d5 < d4 && d6 < d5;

    const totalOrderCount  = orders_.length;
    const pendingCount     = orders_.filter(o => o.paymentStatus === 'pending').length;
    const pendingPct       = totalOrderCount > 0 ? (pendingCount / totalOrderCount * 100) : 0;

    const peakDay = days.reduce((best, d) => d.orders > (best?.orders ?? -1) ? d : best, null);

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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          ...glass(),
          padding: '48px 24px', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
        <p style={{ color: '#A3A3A3', fontSize: 15, fontFamily: "'Playfair Display', serif" }}>
          No data available yet. Start receiving orders to see analytics!
        </p>
      </motion.div>
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

  // ── Chart click hint label ─────────────────────────────────────────────────
  const ClickHint = () => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, color: '#444', fontWeight: 500,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      padding: '3px 9px', borderRadius: 20, cursor: 'default',
    }}>
      <span style={{ fontSize: 9 }}>🔍</span> Click for detailed analysis
    </span>
  );

  // ── Chart wrapper with hover glow + click ──────────────────────────────────
  const ChartCard = ({ children, modalKey, insightText, insightColor, style: extraStyle }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...glass(hovered ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.06)'),
          padding: '24px',
          transition: 'all 0.25s ease',
          boxShadow: hovered
            ? '0 0 0 1px rgba(212,175,55,0.15), 0 16px 48px rgba(0,0,0,0.5), 0 0 80px rgba(212,175,55,0.04)'
            : '0 8px 32px rgba(0,0,0,0.35)',
          ...extraStyle,
        }}
      >
        {insightText && <InsightPill text={insightText} color={insightColor} />}
        {children}
        {modalKey && (
          <div
            style={{
              display: 'flex', justifyContent: 'flex-end', marginTop: 12,
              opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
            }}
          >
            <button
              onClick={() => openModal(modalKey)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)',
                color: '#D4AF37', fontSize: 11, fontWeight: 600,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.18)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
            >
              <BarChart2 size={11} /> View Detailed Analysis
            </button>
          </div>
        )}
      </motion.div>
    );
  };

  // ── Modal content builder ──────────────────────────────────────────────────
  const ModalContent = ({ chartKey }) => {
    const info = deriveChartInsights(chartKey, analytics, CUR);
    if (!info) return <p style={{ color: '#555' }}>No data available.</p>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Key metrics row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ModalMetric label={info.highest.label} value={info.highest.value} sub={info.highest.sub} color={info.highest.color} />
          <ModalMetric label={info.lowest.label}  value={info.lowest.value}  sub={info.lowest.sub}  color={info.lowest.color} />
          <ModalMetric label={info.average.label} value={info.average.value} color={info.average.color} />
          {info.change && <ModalMetric label={info.change.label} value={info.change.value} color={info.change.color} />}
        </div>

        <GradientRule />

        {/* Written analysis */}
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '16px 18px',
        }}>
          <p style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Trend Analysis
          </p>
          <p style={{ color: '#B0B0B0', fontSize: 13, lineHeight: 1.7 }}>{info.analysis}</p>
        </div>

        {/* Suggestion */}
        <div style={{
          background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)',
          borderRadius: 10, padding: '14px 16px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 14, marginTop: 1 }}>💡</span>
          <p style={{ color: '#C8A840', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            {info.suggestion.replace('💡 ', '')}
          </p>
        </div>
      </div>
    );
  };

  // ── Custom chart tooltip ───────────────────────────────────────────────────
  const RevenueTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const rev = payload.find(p => p.dataKey === 'revenue');
    const vals = analytics?.revenueByDay ?? [];
    const avg = vals.length ? vals.reduce((s, d) => s + d.revenue, 0) / vals.length : 0;
    const isHigh = rev?.value > avg * 1.2;
    const isLow  = rev?.value < avg * 0.8;
    return (
      <div style={CustomTooltipStyle}>
        <p style={{ color: '#888', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
        <p style={{ color: '#D4AF37', fontSize: 16, fontWeight: 800 }}>{CUR}{rev?.value?.toFixed(2)}</p>
        {isHigh && <p style={{ color: '#10B981', fontSize: 10, marginTop: 4 }}>▲ Above average</p>}
        {isLow  && <p style={{ color: '#EF4444', fontSize: 10, marginTop: 4 }}>▼ Below average</p>}
        {!isHigh && !isLow && <p style={{ color: '#888', fontSize: 10, marginTop: 4 }}>≈ Near average</p>}
      </div>
    );
  };

  const OrdersTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const ord = payload.find(p => p.dataKey === 'orders');
    const vals = analytics?.revenueByDay ?? [];
    const avg = vals.length ? vals.reduce((s, d) => s + d.orders, 0) / vals.length : 0;
    const isHigh = ord?.value > avg * 1.2;
    return (
      <div style={CustomTooltipStyle}>
        <p style={{ color: '#888', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
        <p style={{ color: '#10B981', fontSize: 16, fontWeight: 800 }}>{ord?.value} orders</p>
        {isHigh && <p style={{ color: '#10B981', fontSize: 10, marginTop: 4 }}>▲ High traffic day</p>}
        {!isHigh && ord?.value === 0 && <p style={{ color: '#EF4444', fontSize: 10, marginTop: 4 }}>✕ No orders</p>}
        {!isHigh && ord?.value > 0 && <p style={{ color: '#888', fontSize: 10, marginTop: 4 }}>≈ Normal volume</p>}
      </div>
    );
  };

  const ItemsTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const cnt = payload.find(p => p.dataKey === 'count');
    const allItems = analytics?.topItems ?? [];
    const maxCount = allItems.length ? Math.max(...allItems.map(i => i.count)) : 1;
    const isTop = cnt?.value === maxCount;
    return (
      <div style={CustomTooltipStyle}>
        <p style={{ color: '#888', fontSize: 10, marginBottom: 6 }}>{label}</p>
        <p style={{ color: '#D4AF37', fontSize: 16, fontWeight: 800 }}>{cnt?.value} units</p>
        {isTop && <p style={{ color: '#10B981', fontSize: 10, marginTop: 4 }}>🔥 Best seller</p>}
      </div>
    );
  };

  const PaymentTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const colorMap = { 'Paid': '#10B981', 'Pending': '#F59E0B' };
    return (
      <div style={CustomTooltipStyle}>
        <p style={{ color: colorMap[p?.name] ?? '#D4AF37', fontSize: 14, fontWeight: 800 }}>
          {p?.name}: {p?.value}
        </p>
      </div>
    );
  };

  // ── Derive insight pills for each chart ────────────────────────────────────
  const revenueInsight  = deriveChartInsights('revenue',     analytics, CUR);
  const ordersInsight   = deriveChartInsights('orders',      analytics, CUR);
  const itemsInsight    = deriveChartInsights('items',       analytics, CUR);
  const paymentInsight  = deriveChartInsights('payment',     analytics, CUR);
  const statusInsight   = deriveChartInsights('orderstatus', analytics, CUR);

  return (
    <>
      {/* ── Keyframes injected once ─────────────────────────────────────────── */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes gradientShift {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        .analytics-chart-card:hover .chart-click-hint { opacity: 1 !important; }
      `}</style>

      <div className="space-y-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
        >
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 800, color: '#F0F0F0',
              fontFamily: "'Playfair Display', serif", margin: 0, letterSpacing: '-0.02em',
            }}>
              Analytics
            </h1>
            <p style={{ color: '#444', fontSize: 12, margin: '3px 0 0' }}>
              {orders_?.filter(o => o.paymentStatus === 'paid').length ?? 0} paid orders · live data
            </p>
          </div>

          {/* Download buttons — UNCHANGED logic, improved style */}
          {orders_ && cafe && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleCSV}
                disabled={csvLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, cursor: csvLoading ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #059669, #10B981)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                  opacity: csvLoading ? 0.6 : 1, transition: 'opacity 0.2s',
                }}
              >
                {csvLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                GST CSV
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handlePDF}
                disabled={pdfLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, cursor: pdfLoading ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #C5A059, #D4AF37)',
                  border: '1px solid rgba(212,175,55,0.4)',
                  color: '#000', fontSize: 13, fontWeight: 800,
                  boxShadow: '0 4px 12px rgba(212,175,55,0.25)',
                  opacity: pdfLoading ? 0.6 : 1, transition: 'opacity 0.2s',
                }}
              >
                {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                PDF Report
              </motion.button>
            </div>
          )}
        </motion.div>

        {/* ── Fee cards — UNCHANGED data, enhanced visual ───────────────────── */}
        {showFeeCards && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {scEnabled && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                whileHover={{ y: -2 }}
                style={{ ...glass('rgba(212,175,55,0.1)'), padding: 20, position: 'relative', overflow: 'hidden' }}
                data-testid="stat-service-charges-collected"
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 70, height: 70, background: 'radial-gradient(circle at 100% 0%, rgba(212,175,55,0.08), transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Service Charges</p>
                  <div style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 6, padding: 5 }}>
                    <Percent size={13} style={{ color: '#D4AF37' }} />
                  </div>
                </div>
                <p style={{ fontSize: 26, fontWeight: 900, color: '#F0F0F0', fontFamily: "'Playfair Display', serif" }}>{CUR}{feeSummary.totalServiceCharge.toFixed(2)}</p>
                <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>{cafe?.serviceChargeRate || 0}% · all paid orders</p>
              </motion.div>
            )}
            {pfEnabled && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                whileHover={{ y: -2 }}
                style={{ ...glass('rgba(239,68,68,0.1)'), padding: 20, position: 'relative', overflow: 'hidden' }}
                data-testid="stat-platform-fees-collected"
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 70, height: 70, background: 'radial-gradient(circle at 100% 0%, rgba(239,68,68,0.06), transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Platform Fees</p>
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: 5 }}>
                    <BadgeMinus size={13} style={{ color: '#EF4444' }} />
                  </div>
                </div>
                <p style={{ fontSize: 26, fontWeight: 900, color: '#F0F0F0', fontFamily: "'Playfair Display', serif" }}>{CUR}{feeSummary.totalPlatformFee.toFixed(2)}</p>
                <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>
                  {cafe?.platformFeeType === 'fixed' ? `Fixed ${CUR}${cafe?.platformFeeValue || 0} / order` : `${cafe?.platformFeeValue || 0}% · all paid orders`}
                </p>
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              whileHover={{ y: -2 }}
              style={{ ...glass('rgba(16,185,129,0.15)'), padding: 20, position: 'relative', overflow: 'hidden' }}
              data-testid="stat-final-net-amount"
            >
              <div style={{ position: 'absolute', top: 0, right: 0, width: 70, height: 70, background: 'radial-gradient(circle at 100% 0%, rgba(16,185,129,0.08), transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Final Net</p>
                <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#10B981', fontSize: 12, fontWeight: 900 }}>₌</span>
                </div>
              </div>
              <p style={{ fontSize: 26, fontWeight: 900, color: '#10B981', fontFamily: "'Playfair Display', serif" }}>{CUR}{feeSummary.finalNetAmount.toFixed(2)}</p>
              <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>After GST {pfEnabled ? '+ platform fees' : ''}</p>
            </motion.div>
          </div>
        )}

        {/* ── Payment breakdown table — UNCHANGED data, enhanced visual ─────── */}
        {showFeeCards && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ ...glass(), padding: '24px 28px' }}
          >
            <SectionHeading>Payment Breakdown</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: 'Total Orders',        value: feeSummary.totalOrders,        isMoney: false, color: '#E5E5E5' },
                { label: 'Gross Revenue',        value: feeSummary.grossRevenue,       isMoney: true,  color: '#E5E5E5' },
                { label: 'GST / Tax Collected',  value: feeSummary.gstCollected,       isMoney: true,  color: '#A3A3A3' },
                ...(scEnabled ? [{ label: 'Service Charges Collected', value: feeSummary.totalServiceCharge, isMoney: true, color: '#D4AF37' }] : []),
                ...(pfEnabled ? [{ label: 'Platform Fees Deducted',    value: feeSummary.totalPlatformFee,   isMoney: true, color: '#EF4444' }] : []),
                { label: 'Net Revenue',          value: feeSummary.netRevenue,         isMoney: true,  color: '#E5E5E5' },
              ].map((row, idx) => (
                <div key={row.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 14px', borderRadius: 8, marginBottom: 2,
                  background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <span style={{ color: '#888', fontSize: 13 }}>{row.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: row.color }}>
                    {row.isMoney ? `${CUR}${Number(row.value).toFixed(2)}` : row.value}
                  </span>
                </div>
              ))}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 14px 0', marginTop: 6,
                borderTop: '1px solid rgba(212,175,55,0.25)',
              }}>
                <span style={{ color: '#F0F0F0', fontWeight: 700, fontSize: 14 }}>Final Net Amount</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: feeSummary.finalNetAmount >= 0 ? '#10B981' : '#EF4444', fontFamily: "'Playfair Display', serif" }}>
                  {CUR}{feeSummary.finalNetAmount.toFixed(2)}
                </span>
              </div>
              {pfEnabled && <p style={{ color: '#444', fontSize: 11, marginTop: 6, paddingLeft: 14 }}>Gross Revenue − GST − Platform Fees</p>}
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            GROWTH ANALYTICS LAYER (additive)
        ════════════════════════════════════════════════════════════════════ */}

        {growthData && (
          <>
            {/* ── Risk Alerts — enhanced styling ─────────────────────────── */}
            {growthData.alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {growthData.alerts.map((alert, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 10,
                      background: alert.level === 'high'
                        ? 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))'
                        : 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))',
                      border: `1px solid ${alert.level === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      boxShadow: alert.level === 'high'
                        ? '0 0 20px rgba(239,68,68,0.06)'
                        : '0 0 20px rgba(245,158,11,0.06)',
                    }}
                  >
                    <div style={{
                      background: alert.level === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      border: `1px solid ${alert.level === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      borderRadius: 7, padding: 7, flexShrink: 0,
                    }}>
                      <AlertTriangle size={13} style={{ color: alert.level === 'high' ? '#EF4444' : '#F59E0B' }} />
                    </div>
                    <span style={{ color: alert.level === 'high' ? '#F87171' : '#FBB740', fontSize: 13, fontWeight: 600, flex: 1 }}>
                      {alert.message}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      color: alert.level === 'high' ? '#EF4444' : '#F59E0B',
                      background: alert.level === 'high' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                      padding: '2px 8px', borderRadius: 20,
                    }}>
                      {alert.level === 'high' ? 'HIGH' : 'MED'}
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
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  whileHover={{ y: -3, transition: { duration: 0.15 } }}
                  style={{
                    ...glass(`${card.color}18`),
                    borderLeft: `3px solid ${card.color}`,
                    padding: '18px 16px',
                    cursor: 'default',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at 100% 0%, ${card.color}15, transparent 70%)`, pointerEvents: 'none' }} />
                  <p style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
                    {card.label}
                  </p>
                  <p style={{ color: card.color, fontSize: 22, fontWeight: 900, fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>
                    {card.value}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
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
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{
                    gridColumn: growthData.insights.length > 2 ? 'span 2' : 'span 1',
                    ...glass('rgba(212,175,55,0.08)'),
                    padding: '20px',
                  }}
                >
                  <SectionHeading badge={`${growthData.insights.length} active`}>
                    <Zap size={13} style={{ color: '#D4AF37', marginRight: 2 }} />
                    Insights
                  </SectionHeading>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {growthData.insights.map((ins) => (
                      <div key={ins.id}>
                        <button
                          onClick={() => setOpenInsight(openInsight === ins.id ? null : ins.id)}
                          style={{
                            width: '100%', textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 8,
                            background: openInsight === ins.id ? `${ins.color}10` : 'rgba(255,255,255,0.025)',
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
                            ? <ChevronUp size={13} style={{ color: '#555', flexShrink: 0 }} />
                            : <ChevronDown size={13} style={{ color: '#555', flexShrink: 0 }} />
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
                                <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>{ins.detail}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Right column: Missed Revenue + Peak Time + Customer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Missed Revenue */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  style={{ ...glass('rgba(239,68,68,0.1)'), padding: '16px 18px' }}
                >
                  <SectionHeading>Missed Revenue</SectionHeading>
                  {[
                    { label: 'Unpaid',    val: growthData.unpaidRev,    color: '#F59E0B' },
                    { label: 'Cancelled', val: growthData.cancelledRev, color: '#EF4444' },
                  ].map(r => (
                    <div key={r.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <span style={{ color: '#666', fontSize: 12 }}>{r.label}</span>
                      <span style={{ color: r.val > 0 ? r.color : '#333', fontWeight: 800, fontSize: 13 }}>
                        {CUR}{r.val.toFixed(0)}
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 7, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <p style={{ color: '#888', fontSize: 11 }}>
                      Total at risk: <strong style={{ color: '#EF4444' }}>{CUR}{(growthData.unpaidRev + growthData.cancelledRev).toFixed(0)}</strong>
                    </p>
                  </div>
                </motion.div>

                {/* Peak Time */}
                {growthData.peakLabel && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    style={{ ...glass('rgba(212,175,55,0.1)'), padding: '16px 18px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                      <Clock size={13} style={{ color: '#D4AF37' }} />
                      <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Playfair Display', serif" }}>Peak Time</p>
                    </div>
                    <p style={{ color: '#D4AF37', fontSize: 22, fontWeight: 900, fontFamily: "'Playfair Display', serif" }}>
                      {growthData.peakLabel}
                    </p>
                    <p style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
                      {growthData.peakCount} order{growthData.peakCount !== 1 ? 's' : ''} in peak hour
                    </p>
                    {growthData.peakCount >= 8 && (
                      <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '5px 8px' }}>
                        <p style={{ fontSize: 11, color: '#F59E0B' }}>⚡ High traffic — ensure extra staff</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Customer Behavior */}
                {growthData.uniqueCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    style={{ ...glass('rgba(59,130,246,0.1)'), padding: '16px 18px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                      <Users size={13} style={{ color: '#3B82F6' }} />
                      <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Playfair Display', serif" }}>Customers</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <p style={{ color: '#10B981', fontSize: 20, fontWeight: 900 }}>{growthData.repeatPct}%</p>
                        <p style={{ color: '#555', fontSize: 10, marginTop: 3 }}>Repeat</p>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', padding: '10px 8px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <p style={{ color: '#3B82F6', fontSize: 20, fontWeight: 900 }}>{growthData.oneTimePct}%</p>
                        <p style={{ color: '#555', fontSize: 10, marginTop: 3 }}>One-time</p>
                      </div>
                    </div>
                    <p style={{ color: '#444', fontSize: 11, marginTop: 8 }}>{growthData.uniqueCount} unique customers identified</p>
                  </motion.div>
                )}
              </div>
            </div>

            {/* ── Quick Insights Summary ───────────────────────────────────── */}
            {growthData.peakDay && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{
                  background: 'rgba(212,175,55,0.03)',
                  border: '1px solid rgba(212,175,55,0.1)',
                  borderRadius: 10, padding: '12px 16px',
                  display: 'flex', flexWrap: 'wrap', gap: '6px 20px',
                }}
              >
                <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', width: '100%', marginBottom: 3 }}>
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
              </motion.div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CHARTS — logic 100% unchanged, visual wrappers added
        ════════════════════════════════════════════════════════════════════ */}

        {/* ── Revenue Chart ──────────────────────────────────────────────────── */}
        <ChartCard
          modalKey="revenue"
          insightText={revenueInsight?.insightPill}
          insightColor={revenueInsight?.pillColor}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <SectionHeading>Revenue (Last 7 Days)</SectionHeading>
            <ClickHint />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" stroke="#444" tick={{ fill: '#666', fontSize: 11 }} />
              <YAxis stroke="#444" tick={{ fill: '#666', fontSize: 11 }} />
              <Tooltip content={<RevenueTooltip />} />
              <Legend wrapperStyle={{ color: '#666', fontSize: 12 }} />
              <Line
                type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2.5}
                dot={{ fill: '#D4AF37', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: '#D4AF37', stroke: 'rgba(212,175,55,0.3)', strokeWidth: 4 }}
                name={`Revenue (${CUR})`}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Orders per Day Chart ────────────────────────────────────────────── */}
        <ChartCard
          modalKey="orders"
          insightText={ordersInsight?.insightPill}
          insightColor={ordersInsight?.pillColor}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <SectionHeading>Orders (Last 7 Days)</SectionHeading>
            <ClickHint />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" stroke="#444" tick={{ fill: '#666', fontSize: 11 }} />
              <YAxis stroke="#444" tick={{ fill: '#666', fontSize: 11 }} />
              <Tooltip content={<OrdersTooltip />} />
              <Legend wrapperStyle={{ color: '#666', fontSize: 12 }} />
              <Bar dataKey="orders" fill="#10B981" name="Orders" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Best Selling + Payment Status ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Best Selling Items */}
          <ChartCard
            modalKey="items"
            insightText={itemsInsight?.insightPill}
            insightColor={itemsInsight?.pillColor}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <SectionHeading>Best Selling Items</SectionHeading>
              <ClickHint />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.topItems} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" stroke="#444" tick={{ fill: '#666', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" stroke="#444" width={100} tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip content={<ItemsTooltip />} />
                <Bar dataKey="count" fill="#D4AF37" name="Quantity Sold" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Payment Status Pie */}
          <ChartCard
            modalKey="payment"
            insightText={paymentInsight?.insightPill}
            insightColor={paymentInsight?.pillColor}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <SectionHeading>Payment Status</SectionHeading>
              <ClickHint />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.paymentSplit}
                  cx="50%" cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  strokeWidth={2}
                  stroke="rgba(0,0,0,0.3)"
                >
                  {analytics.paymentSplit.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PaymentTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Order Status Distribution ───────────────────────────────────────── */}
        <ChartCard
          modalKey="orderstatus"
          insightText={statusInsight?.insightPill}
          insightColor={statusInsight?.pillColor}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <SectionHeading>Order Status Distribution</SectionHeading>
            <ClickHint />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.orderStatusSplit}
                cx="50%" cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                strokeWidth={2}
                stroke="rgba(0,0,0,0.3)"
              >
                {analytics.orderStatusSplit.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={CustomTooltipStyle}
                labelStyle={{ color: '#E5E5E5' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* ── Chart Detail Modals ──────────────────────────────────────────────── */}
      {['revenue', 'orders', 'items', 'payment', 'orderstatus'].map(key => {
        const titles = {
          revenue:     'Revenue Analysis',
          orders:      'Orders Analysis',
          items:       'Best Selling Items Analysis',
          payment:     'Payment Status Analysis',
          orderstatus: 'Order Status Analysis',
        };
        return (
          <ChartModal key={key} isOpen={activeModal === key} onClose={closeModal} title={titles[key]}>
            <ModalContent chartKey={key} />
          </ChartModal>
        );
      })}
    </>
  );
};

/* ── Tiny inline icon shims — UNCHANGED ─────────────────────────────────────── */
const IndianRupeeIcon = ({ style }) => <span style={{ ...style, display: 'inline-block', fontWeight: 900, fontSize: style?.width || 14 }}>₹</span>;
const ZapIcon         = ({ style }) => <Zap   style={style} />;
const TrendingUpIcon  = ({ style }) => <TrendingUp style={style} />;
const AlertIcon       = ({ style }) => <AlertTriangle style={style} />;

export default Analytics;
