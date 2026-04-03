/**
 * PaymentsAnalytics.jsx
 *
 * NEW component — a dedicated financial intelligence dashboard.
 * Added as a new tab in Dashboard.jsx only.
 * Zero changes to any existing component.
 *
 * Data sources:
 *   - 'orders'    collection (useCollection, real-time)
 *   - 'cafes'     document   (useDocument, real-time)
 *   - 'menuItems' collection (useCollection — for item cost lookup)
 *
 * Financial model:
 *   PAID ORDERS ONLY — paymentStatus === 'paid'
 *
 *   grossRevenue   = Σ order.totalAmount
 *   gstCollected   = Σ (order.gstAmount + order.taxAmount)
 *   serviceCharge  = Σ order.serviceChargeAmount   [only if cafe.serviceChargeEnabled]
 *   platformFee    = Σ order.platformFeeAmount      [only if cafe.platformFeeEnabled]
 *   cogs           = Σ (item.cost ?? 0) × item.quantity  [across all items in paid orders]
 *   netRevenue     = grossRevenue − gstCollected − serviceCharge
 *   netProfit      = grossRevenue − gstCollected − platformFee − cogs
 *
 * COGS fallback: if item.cost is absent → treat as 0 (backward safe)
 * Platform fee fallback: if order.platformFeeAmount absent → compute from cafe settings
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  IndianRupee, TrendingUp, TrendingDown, ShoppingBag, Package,
  Download, Calendar, RefreshCw, AlertCircle, FileText,
  Percent, BadgeMinus, DollarSign, Target,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const todayStr  = () => new Date().toISOString().split('T')[0];
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const parseLocalDate = (str) => {
  // str = "YYYY-MM-DD" — parse in local timezone
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const endOfDay = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};

const formatDate = (str) => {
  const d = parseLocalDate(str);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ─── Financial calculation engine ────────────────────────────────────────────

/**
 * getSingleOrderPlatformFee
 * Reads stored platformFeeAmount first; falls back to computing from cafe settings.
 */
const getSingleOrderPlatformFee = (order, cafe) => {
  if (!cafe?.platformFeeEnabled) return 0;
  if (order.platformFeeAmount != null) {
    return parseFloat(order.platformFeeAmount) || 0;
  }
  // Compute from settings (orders placed before the field existed)
  const subtotal = parseFloat(order.subtotalAmount ?? order.subtotal ?? 0) || 0;
  const type  = cafe.platformFeeType  || 'percentage';
  const value = parseFloat(cafe.platformFeeValue) || 0;
  if (type === 'fixed') return value;
  return parseFloat((subtotal * value / 100).toFixed(2));
};

/**
 * calcCOGS
 * Looks up item cost from menuItems collection by item name.
 * Falls back to item.cost if stored on the order item (future-proof).
 * Falls back to 0 if not found.
 */
const calcOrderCOGS = (order, menuItemsMap) => {
  return (order.items || []).reduce((sum, item) => {
    const cost = item.cost               // stored directly on order item (future)
      ?? menuItemsMap[item.name]?.cost   // looked up from menuItems collection
      ?? 0;
    return sum + (parseFloat(cost) || 0) * (item.quantity || 1);
  }, 0);
};

/**
 * calcFinancials(paidOrders, cafe, menuItemsMap)
 * Full financial breakdown for a set of paid orders.
 */
const calcFinancials = (paidOrders, cafe, menuItemsMap = {}) => {
  let grossRevenue   = 0;
  let gstCollected   = 0;
  let serviceCharge  = 0;
  let platformFee    = 0;
  let cogs           = 0;

  paidOrders.forEach(order => {
    grossRevenue  += parseFloat(order.totalAmount  ?? order.total ?? 0) || 0;
    gstCollected  += (parseFloat(order.gstAmount   ?? 0) || 0)
                   + (parseFloat(order.taxAmount    ?? 0) || 0);

    if (cafe?.serviceChargeEnabled) {
      serviceCharge += parseFloat(order.serviceChargeAmount ?? order.service_charge ?? 0) || 0;
    }

    platformFee += getSingleOrderPlatformFee(order, cafe);
    cogs        += calcOrderCOGS(order, menuItemsMap);
  });

  // Round to 2dp throughout
  grossRevenue  = +(grossRevenue.toFixed(2));
  gstCollected  = +(gstCollected.toFixed(2));
  serviceCharge = +(serviceCharge.toFixed(2));
  platformFee   = +(platformFee.toFixed(2));
  cogs          = +(cogs.toFixed(2));

  const netRevenue = +(( grossRevenue - gstCollected ).toFixed(2));
  const netProfit  = +(( grossRevenue - gstCollected - platformFee - cogs ).toFixed(2));
  const margin     = grossRevenue > 0 ? +((netProfit / grossRevenue * 100).toFixed(1)) : 0;

  return {
    totalOrders: paidOrders.length,
    grossRevenue,
    gstCollected,
    serviceCharge,
    platformFee,
    cogs,
    netRevenue,
    netProfit,
    margin,
  };
};

/**
 * buildTrendData
 * Groups paid orders by day and computes per-day revenue + profit.
 */
const buildTrendData = (paidOrders, cafe, menuItemsMap, fromStr, toStr) => {
  // Build a map of date string → orders
  const byDay = {};
  paidOrders.forEach(order => {
    const d = order.createdAt?.toDate?.() || new Date(0);
    const key = d.toISOString().split('T')[0];
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(order);
  });

  // Walk every day in the range
  const result = [];
  const from = parseLocalDate(fromStr);
  const to   = parseLocalDate(toStr);
  const cur  = new Date(from);

  while (cur <= to) {
    const key = cur.toISOString().split('T')[0];
    const dayOrders = byDay[key] || [];
    const f = calcFinancials(dayOrders, cafe, menuItemsMap);
    result.push({
      label:    cur.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      revenue:  f.grossRevenue,
      orders:   dayOrders.length,
      profit:   f.netProfit,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
};

// ─── Custom recharts tooltip ──────────────────────────────────────────────────

const DarkTooltip = ({ active, payload, label, CUR }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#111',
      border: '1px solid rgba(212,175,55,0.25)',
      borderRadius: 6,
      padding: '10px 14px',
      fontSize: 12,
    }}>
      {label && (
        <p style={{ color: '#D4AF37', fontWeight: 700, marginBottom: 6 }}>{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: '#fff', margin: '3px 0' }}>
          <span style={{ color: p.color }}>●</span>{' '}
          {p.name}:{' '}
          <strong>
            {typeof p.value === 'number'
              ? (p.name.toLowerCase().includes('orders')
                  ? p.value
                  : `${CUR}${p.value.toFixed(2)}`)
              : p.value}
          </strong>
        </p>
      ))}
    </div>
  );
};

// ─── Stat card (matches Overview.jsx exactly) ─────────────────────────────────

const StatCard = ({ label, value, sub, icon: Icon, color, index, highlight }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05, duration: 0.3 }}
    whileHover={{ y: -2 }}
    className={`bg-[#0F0F0F] border rounded-sm p-6 hover:border-white/10 transition-colors ${
      highlight ? 'border-[#D4AF37]/30' : 'border-white/5'
    }`}
    data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
  >
    <div className="flex items-center justify-between mb-4">
      <p className="text-[#A3A3A3] text-sm uppercase tracking-wide leading-tight">{label}</p>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
    </div>
    <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
    {sub && <p className="text-[#555] text-xs mt-1.5">{sub}</p>}
  </motion.div>
);

// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section = ({ title, icon: Icon, children, delay = 0, action }) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.35 }}
    className="bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden"
  >
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-[#D4AF37]" />
        <h3
          className="text-white font-semibold text-sm"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          {title}
        </h3>
      </div>
      {action}
    </div>
    <div className="p-6">{children}</div>
  </motion.div>
);

// ─── Breakdown row ────────────────────────────────────────────────────────────

const BreakdownRow = ({ label, value, color = '#E5E5E5', isMoney = true, CUR, bold, note, indent, border = true }) => (
  <div className={`flex items-center justify-between py-3 ${border ? 'border-b border-white/[0.05]' : ''}`}>
    <div className={`flex items-center gap-2 ${indent ? 'pl-4' : ''}`}>
      {indent && <div className="w-1 h-1 rounded-full bg-[#555] flex-shrink-0" />}
      <span className={`text-sm ${bold ? 'text-white font-semibold' : 'text-[#A3A3A3]'}`}>{label}</span>
      {note && <span className="text-[#444] text-xs ml-1">({note})</span>}
    </div>
    <span
      className={`text-sm tabular-nums font-${bold ? 'bold' : 'semibold'}`}
      style={{ color }}
    >
      {isMoney ? `${CUR}${Number(value).toFixed(2)}` : value}
    </span>
  </div>
);

// ─── PDF generation (browser print-to-PDF) ───────────────────────────────────

const generatePDF = (financials, cafe, fromDate, toDate, trendData) => {
  const CUR       = cafe?.currencySymbol || '₹';
  const cafeName  = cafe?.name || 'SmartCafé';
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;
  const period    = `${formatDate(fromDate)} → ${formatDate(toDate)}`;
  const generated = new Date().toLocaleString('en-IN');

  // Build trend table rows
  const trendRows = trendData.map(d => `
    <tr>
      <td>${d.label}</td>
      <td class="num">${d.orders}</td>
      <td class="num">${CUR}${d.revenue.toFixed(2)}</td>
      <td class="num" style="color:${d.profit >= 0 ? '#10B981' : '#EF4444'}">${CUR}${d.profit.toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${cafeName} — Payment Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Inter',sans-serif; color:#111; background:#fff; padding:32px 40px; font-size:13px; line-height:1.6; }

    /* Header */
    .hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:18px; border-bottom:3px solid #C9A84C; margin-bottom:26px; }
    .hdr h1 { font-family:'Playfair Display',serif; font-size:24px; color:#0a0a0a; }
    .hdr .meta { text-align:right; color:#666; font-size:11.5px; line-height:2; }
    .badge { display:inline-block; background:#C9A84C; color:#fff; padding:2px 10px; border-radius:2px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:5px; }

    /* Summary cards */
    .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:28px; }
    .card { background:#f9f9f9; border:1px solid #eee; border-radius:6px; padding:14px 16px; }
    .card .lbl { font-size:10.5px; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
    .card .val { font-size:20px; font-weight:700; color:#0a0a0a; }
    .card.profit .val { color:#10B981; }
    .card.warn   .val { color:#EF4444; }
    .card.gold   .val { color:#C9A84C; }

    /* Section title */
    .sec { font-family:'Playfair Display',serif; font-size:15px; color:#0a0a0a; border-left:4px solid #C9A84C; padding-left:10px; margin:24px 0 12px; }

    /* Breakdown table */
    .breakdown { width:100%; border-collapse:collapse; border:1px solid #eee; border-radius:4px; overflow:hidden; }
    .breakdown thead { background:#0a0a0a; }
    .breakdown thead th { color:#C9A84C; padding:9px 14px; text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px; }
    .breakdown thead th.num { text-align:right; }
    .breakdown td { padding:9px 14px; border-bottom:1px solid #f0f0f0; font-size:12.5px; color:#222; }
    .breakdown td.num { text-align:right; font-weight:600; }
    .breakdown tr:last-child td { border-bottom:none; }
    .breakdown tr.total { background:#fdf8ec; font-weight:700; border-top:2px solid #C9A84C; }
    .breakdown tr.total td { color:#0a0a0a; font-size:13.5px; }
    .breakdown tr.indent td:first-child { padding-left:28px; color:#555; }

    /* Trend table */
    .trend { width:100%; border-collapse:collapse; }
    .trend th { background:#f5f5f5; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:#666; border-bottom:2px solid #eee; }
    .trend th.num { text-align:right; }
    .trend td { padding:8px 12px; border-bottom:1px solid #f5f5f5; font-size:12px; }
    .trend td.num { text-align:right; font-weight:600; }
    .trend tr:hover td { background:#fafafa; }

    /* Footer */
    .ftr { margin-top:36px; padding-top:14px; border-top:1px solid #eee; color:#aaa; font-size:11px; display:flex; justify-content:space-between; }
    @media print { body { padding:16px 20px; } @page { margin:8mm; } }
  </style>
</head>
<body>

  <div class="hdr">
    <div>
      <div class="badge">Payment Analytics Report</div>
      <h1>${cafeName}</h1>
      <p style="color:#666;font-size:12px;margin-top:3px">Period: ${period}</p>
      ${cafe?.gstNumber ? `<p style="color:#999;font-size:11px">GST No: ${cafe.gstNumber}</p>` : ''}
    </div>
    <div class="meta">
      <p><strong>Generated</strong></p>
      <p>${generated}</p>
      <p style="margin-top:6px">SmartCafé OS · Branding Architect</p>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card gold">
      <div class="lbl">Gross Revenue</div>
      <div class="val">${CUR}${financials.grossRevenue.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="lbl">GST Collected</div>
      <div class="val">${CUR}${financials.gstCollected.toFixed(2)}</div>
    </div>
    ${scEnabled ? `<div class="card">
      <div class="lbl">Service Charges</div>
      <div class="val">${CUR}${financials.serviceCharge.toFixed(2)}</div>
    </div>` : ''}
    ${pfEnabled ? `<div class="card warn">
      <div class="lbl">Platform Fees</div>
      <div class="val">${CUR}${financials.platformFee.toFixed(2)}</div>
    </div>` : ''}
    <div class="card warn">
      <div class="lbl">COGS</div>
      <div class="val">${CUR}${financials.cogs.toFixed(2)}</div>
    </div>
    <div class="card profit">
      <div class="lbl">Net Profit</div>
      <div class="val">${CUR}${financials.netProfit.toFixed(2)}</div>
    </div>
  </div>

  <!-- Payment Breakdown -->
  <h2 class="sec">Payment Breakdown</h2>
  <table class="breakdown">
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Amount (${CUR})</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>Total Orders (Paid)</td><td class="num">${financials.totalOrders}</td></tr>
      <tr><td>Gross Revenue</td><td class="num">${financials.grossRevenue.toFixed(2)}</td></tr>
      <tr class="indent"><td>GST / Tax Deducted</td><td class="num">− ${financials.gstCollected.toFixed(2)}</td></tr>
      ${scEnabled ? `<tr class="indent"><td>Service Charges Collected</td><td class="num">+ ${financials.serviceCharge.toFixed(2)}</td></tr>` : ''}
      ${pfEnabled ? `<tr class="indent"><td>Platform Fees Deducted</td><td class="num">− ${financials.platformFee.toFixed(2)}</td></tr>` : ''}
      <tr class="indent"><td>Cost of Goods (COGS)</td><td class="num">− ${financials.cogs.toFixed(2)}</td></tr>
      <tr><td>Net Revenue (after GST)</td><td class="num">${financials.netRevenue.toFixed(2)}</td></tr>
      <tr class="total"><td>Net Profit</td><td class="num" style="color:#10B981">${financials.netProfit.toFixed(2)}</td></tr>
    </tbody>
  </table>

  <p style="color:#999;font-size:11px;margin-top:8px">
    Net Profit = Gross Revenue − GST ${pfEnabled ? '− Platform Fees' : ''} − COGS
    &nbsp;·&nbsp; Profit Margin: ${financials.margin}%
  </p>

  <!-- Daily Trend -->
  ${trendData.length > 0 ? `
  <h2 class="sec">Daily Revenue & Profit Trend</h2>
  <table class="trend">
    <thead>
      <tr>
        <th>Date</th>
        <th class="num">Orders</th>
        <th class="num">Revenue (${CUR})</th>
        <th class="num">Profit (${CUR})</th>
      </tr>
    </thead>
    <tbody>${trendRows}</tbody>
  </table>` : ''}

  <div class="ftr">
    <span>${cafeName} · Payment Analytics Report · ${period}</span>
    <span>Generated ${generated} · SmartCafé OS</span>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=760');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    toast.error('Pop-up blocked — allow pop-ups and try again');
  }
};

// ─── PRESET CONFIG ────────────────────────────────────────────────────────────

const PRESETS = [
  { id: 'today', label: 'Today',   from: todayStr,       to: todayStr },
  { id: '7',     label: '7 Days',  from: () => daysAgoStr(6), to: todayStr },
  { id: '30',    label: '30 Days', from: () => daysAgoStr(29), to: todayStr },
  { id: '90',    label: '90 Days', from: () => daysAgoStr(89), to: todayStr },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const PaymentsAnalytics = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  // Firebase data
  const { data: allOrders } = useCollection(
    'orders',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: menuItems } = useCollection(
    'menuItems',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // Date range state
  const [preset,   setPreset  ] = useState('30');
  const [fromDate, setFromDate] = useState(daysAgoStr(29));
  const [toDate,   setToDate  ] = useState(todayStr());

  // PDF loading
  const [pdfLoading, setPdfLoading] = useState(false);

  // Preset apply
  const applyPreset = useCallback((p) => {
    const found = PRESETS.find(x => x.id === p);
    if (found) {
      setFromDate(found.from());
      setToDate(found.to());
    }
    setPreset(p);
  }, []);

  // Build menuItems lookup map by name for COGS
  const menuItemsMap = useMemo(() => {
    const map = {};
    (menuItems || []).forEach(item => {
      map[item.name] = item;
    });
    return map;
  }, [menuItems]);

  // Filter: paid orders in date range
  const paidOrders = useMemo(() => {
    if (!allOrders) return [];
    const from = parseLocalDate(fromDate);
    const to   = endOfDay(toDate);
    return allOrders.filter(o => {
      if (o.paymentStatus !== 'paid') return false;
      const t = o.createdAt?.toDate?.() || new Date(0);
      return t >= from && t <= to;
    });
  }, [allOrders, fromDate, toDate]);

  // Financials
  const financials = useMemo(() => {
    return calcFinancials(paidOrders, cafe, menuItemsMap);
  }, [paidOrders, cafe, menuItemsMap]);

  // Trend data for charts
  const trendData = useMemo(() => {
    return buildTrendData(paidOrders, cafe, menuItemsMap, fromDate, toDate);
  }, [paidOrders, cafe, menuItemsMap, fromDate, toDate]);

  // Flags
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;
  const hasCOGS   = financials.cogs > 0;

  // Loading state
  const isLoading = !allOrders || !cafe;

  // PDF handler
  const handlePDF = useCallback(() => {
    setPdfLoading(true);
    try {
      generatePDF(financials, cafe, fromDate, toDate, trendData);
      toast.success('Report opened — use Print → Save as PDF');
    } catch (err) {
      console.error('[PaymentsAnalytics] PDF error:', err);
      toast.error('Failed to generate report');
    } finally {
      setTimeout(() => setPdfLoading(false), 1500);
    }
  }, [financials, cafe, fromDate, toDate, trendData]);

  // Metric cards definition
  const statCards = useMemo(() => {
    const cards = [
      {
        label: 'Total Revenue',
        value: `${CUR}${financials.grossRevenue.toFixed(2)}`,
        sub:   `${financials.totalOrders} paid orders`,
        icon:  IndianRupee,
        color: '#10B981',
        index: 0,
      },
      {
        label: 'GST Collected',
        value: `${CUR}${financials.gstCollected.toFixed(2)}`,
        sub:   'GST + tax combined',
        icon:  FileText,
        color: '#8B5CF6',
        index: 1,
      },
    ];

    let idx = 2;

    if (scEnabled) {
      cards.push({
        label: 'Service Charges',
        value: `${CUR}${financials.serviceCharge.toFixed(2)}`,
        sub:   `${cafe?.serviceChargeRate || 0}% rate`,
        icon:  Percent,
        color: '#D4AF37',
        index: idx++,
      });
    }

    if (pfEnabled) {
      cards.push({
        label: 'Platform Fees',
        value: `${CUR}${financials.platformFee.toFixed(2)}`,
        sub:   'deducted from revenue',
        icon:  BadgeMinus,
        color: '#EF4444',
        index: idx++,
      });
    }

    cards.push({
      label: 'COGS',
      value: `${CUR}${financials.cogs.toFixed(2)}`,
      sub:   hasCOGS ? 'from recipe costs' : 'add costs in Menu',
      icon:  Package,
      color: '#F59E0B',
      index: idx++,
    });

    cards.push({
      label:     'Net Profit',
      value:     `${CUR}${financials.netProfit.toFixed(2)}`,
      sub:       `${financials.margin}% margin`,
      icon:      financials.netProfit >= 0 ? TrendingUp : TrendingDown,
      color:     financials.netProfit >= 0 ? '#10B981' : '#EF4444',
      index:     idx,
      highlight: true,
    });

    return cards;
  }, [financials, cafe, scEnabled, pfEnabled, hasCOGS, CUR]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  const noData = paidOrders.length === 0;

  return (
    <div className="space-y-6">

      {/* ── Page header + download ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h2
            className="text-2xl font-bold text-white"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Payments Analytics
          </h2>
          <p className="text-[#555] text-sm mt-1">
            Complete financial health · paid orders only
          </p>
        </div>
        <button
          onClick={handlePDF}
          disabled={pdfLoading || noData}
          className="flex items-center gap-2 px-5 h-10 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pdfLoading
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />
          }
          Download Payment Report
        </button>
      </motion.div>

      {/* ── Date range filter ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-[#0F0F0F] border border-white/5 rounded-sm p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-[#D4AF37]" />
          <span className="text-white text-sm font-semibold">Date Range</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className="px-3 py-1.5 rounded-sm text-xs font-semibold transition-all"
                style={
                  preset === p.id
                    ? { background: '#D4AF37', color: '#000' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#A3A3A3', border: '1px solid rgba(255,255,255,0.1)' }
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <span className="text-[#333] text-xs hidden sm:block">or custom</span>

          {/* Custom range */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[#A3A3A3] text-xs">From</span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={e => { setFromDate(e.target.value); setPreset('custom'); }}
                className="bg-black/30 border border-white/10 text-white text-sm rounded-sm h-9 px-3 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#A3A3A3] text-xs">To</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={todayStr()}
                onChange={e => { setToDate(e.target.value); setPreset('custom'); }}
                className="bg-black/30 border border-white/10 text-white text-sm rounded-sm h-9 px-3 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] transition-all"
              />
            </div>
          </div>

          {/* Period label */}
          <span className="text-[#444] text-xs ml-auto hidden md:block">
            {formatDate(fromDate)} → {formatDate(toDate)}
          </span>
        </div>
      </motion.div>

      {/* ── No data state ──────────────────────────────────────────────────── */}
      {noData && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-16 text-center">
          <AlertCircle className="w-10 h-10 text-[#333] mx-auto mb-4" />
          <p className="text-[#A3A3A3] text-lg mb-1">No paid orders in this period</p>
          <p className="text-[#444] text-sm">Try a wider date range</p>
        </div>
      )}

      {!noData && (
        <AnimatePresence>

          {/* ── Stat cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {statCards.map(card => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          {/* ── Payment Breakdown ──────────────────────────────────────────── */}
          <Section title="Payment Breakdown" icon={DollarSign} delay={0.12}>
            {/* Header hint */}
            <p className="text-[#444] text-xs mb-5">
              All figures from paid orders only ·{' '}
              {formatDate(fromDate)} → {formatDate(toDate)}
            </p>

            <BreakdownRow
              label="Total Paid Orders"
              value={financials.totalOrders}
              isMoney={false}
              color="#E5E5E5"
              CUR={CUR}
              bold
            />
            <BreakdownRow
              label="Gross Revenue"
              value={financials.grossRevenue}
              color="#10B981"
              CUR={CUR}
              bold
              note="sum of order totals"
            />
            <BreakdownRow
              label="GST / Tax Collected"
              value={financials.gstCollected}
              color="#8B5CF6"
              CUR={CUR}
              indent
            />
            {scEnabled && (
              <BreakdownRow
                label="Service Charges Collected"
                value={financials.serviceCharge}
                color="#D4AF37"
                CUR={CUR}
                indent
                note={`${cafe?.serviceChargeRate || 0}%`}
              />
            )}
            {pfEnabled && (
              <BreakdownRow
                label="Platform Fees Deducted"
                value={financials.platformFee}
                color="#EF4444"
                CUR={CUR}
                indent
                note={
                  cafe?.platformFeeType === 'fixed'
                    ? `fixed ${CUR}${cafe?.platformFeeValue}/order`
                    : `${cafe?.platformFeeValue || 0}%`
                }
              />
            )}
            <BreakdownRow
              label="Cost of Goods Sold (COGS)"
              value={financials.cogs}
              color="#F59E0B"
              CUR={CUR}
              indent
              note={hasCOGS ? 'from item costs' : 'no costs set'}
            />
            <BreakdownRow
              label="Net Revenue"
              value={financials.netRevenue}
              color="#E5E5E5"
              CUR={CUR}
              note="after GST"
              bold
            />

            {/* Separator + Final row */}
            <div className="mt-3 pt-3" style={{ borderTop: '2px solid rgba(212,175,55,0.25)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-bold text-base">Net Profit</span>
                  <p className="text-[#555] text-xs mt-0.5">
                    Revenue − GST{pfEnabled ? ' − Platform Fees' : ''} − COGS
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className="text-2xl font-black tabular-nums"
                    style={{ color: financials.netProfit >= 0 ? '#10B981' : '#EF4444' }}
                  >
                    {CUR}{financials.netProfit.toFixed(2)}
                  </span>
                  <p className="text-[#555] text-xs mt-0.5">
                    {financials.margin}% margin
                  </p>
                </div>
              </div>
            </div>

            {/* COGS notice if no costs */}
            {!hasCOGS && (
              <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/15 rounded-sm">
                <p className="text-amber-400 text-xs">
                  💡 Profit accuracy improves when item costs are set. Add a{' '}
                  <span className="font-semibold">cost</span> field to your menu items to see real COGS.
                </p>
              </div>
            )}
          </Section>

          {/* ── Charts ─────────────────────────────────────────────────────── */}

          {/* Revenue Trend */}
          <Section
            title="Revenue Trend"
            icon={TrendingUp}
            delay={0.18}
          >
            <p className="text-[#444] text-xs mb-4">Daily gross revenue across selected period</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <YAxis stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <Tooltip content={<DarkTooltip CUR={CUR} />} />
                <Legend wrapperStyle={{ color: '#666', fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={`Revenue (${CUR})`}
                  stroke="#D4AF37"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#D4AF37' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          {/* Orders vs Revenue */}
          <Section
            title="Orders vs Revenue"
            icon={ShoppingBag}
            delay={0.22}
          >
            <p className="text-[#444] text-xs mb-4">Daily order count alongside revenue</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <YAxis yAxisId="left"  stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <Tooltip content={<DarkTooltip CUR={CUR} />} />
                <Legend wrapperStyle={{ color: '#666', fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="revenue"
                  name={`Revenue (${CUR})`}
                  fill="#D4AF37"
                  fillOpacity={0.85}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="orders"
                  name="Orders"
                  fill="#10B981"
                  fillOpacity={0.7}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Profit Trend */}
          <Section
            title="Profit Trend"
            icon={Target}
            delay={0.26}
          >
            <p className="text-[#444] text-xs mb-4">
              Net profit per day (Revenue − GST{pfEnabled ? ' − Platform Fees' : ''} − COGS)
              {!hasCOGS && (
                <span className="text-amber-500 ml-2">· COGS = 0 (no item costs set)</span>
              )}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <YAxis stroke="#333" fontSize={10} tick={{ fill: '#666' }} />
                <Tooltip content={<DarkTooltip CUR={CUR} />} />
                <Legend wrapperStyle={{ color: '#666', fontSize: 11 }} />
                <ReferenceLine y={0} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name={`Net Profit (${CUR})`}
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Section>

        </AnimatePresence>
      )}
    </div>
  );
};

export default PaymentsAnalytics;
