import React, { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Percent, BadgeMinus, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { calcFeeSummary, downloadCSV, downloadPDFPrint } from '../../services/reportService';

const Analytics = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── NEW: download loading states ─────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  // ── Existing analytics (UNCHANGED) ───────────────────────────────────────────
  const analytics = useMemo(() => {
    if (!orders || orders.length === 0) return null;

    // Revenue by day (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    const revenueByDay = last7Days.map(day => {
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayOrders = orders.filter(order => {
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

    // Best selling items
    const itemCounts = {};
    orders.forEach(order => {
      order.items?.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });
    });

    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Payment status split
    const paidOrders = orders.filter(o => o.paymentStatus === 'paid').length;
    const pendingOrders = orders.filter(o => o.paymentStatus === 'pending').length;
    const paymentSplit = [
      { name: 'Paid', value: paidOrders },
      { name: 'Pending', value: pendingOrders }
    ];

    // Order status split
    const newOrders = orders.filter(o => o.orderStatus === 'new').length;
    const preparingOrders = orders.filter(o => o.orderStatus === 'preparing').length;
    const completedOrders = orders.filter(o => o.orderStatus === 'completed').length;
    const orderStatusSplit = [
      { name: 'New', value: newOrders },
      { name: 'Preparing', value: preparingOrders },
      { name: 'Completed', value: completedOrders }
    ];

    return { revenueByDay, topItems, paymentSplit, orderStatusSplit };
  }, [orders]);

  // ── NEW: fee summary ─────────────────────────────────────────────────────────
  const feeSummary = useMemo(() => {
    if (!orders || !cafe) return null;
    return calcFeeSummary(orders, cafe);
  }, [orders, cafe]);

  // ── NEW: settings flags ───────────────────────────────────────────────────────
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;
  const showFeeCards = (scEnabled || pfEnabled) && feeSummary;

  // ── NEW: download handlers ────────────────────────────────────────────────────
  const handlePDF = () => {
    if (!orders || !cafe) { toast.error('No data to export'); return; }
    setPdfLoading(true);
    try {
      downloadPDFPrint(orders, cafe);
      toast.success('PDF report opened — use Print → Save as PDF');
    } catch (err) {
      console.error('[Analytics] PDF error:', err);
      toast.error('Failed to generate report');
    } finally {
      setTimeout(() => setPdfLoading(false), 1500);
    }
  };

  const handleCSV = () => {
    if (!orders || !cafe) { toast.error('No data to export'); return; }
    setCsvLoading(true);
    try {
      downloadCSV(orders, cafe);
      toast.success('CSV downloaded ✓');
    } catch (err) {
      console.error('[Analytics] CSV error:', err);
      toast.error('Failed to download CSV');
    } finally {
      setTimeout(() => setCsvLoading(false), 800);
    }
  };

  if (!analytics) {
    return (
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
        <p className="text-[#A3A3A3] text-lg">No data available yet. Start receiving orders to see analytics!</p>
      </div>
    );
  }

  const COLORS = ['#D4AF37', '#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-6">

      {/* ── NEW: Download buttons ─────────────────────────────────────────────────
          Sits above all charts. Non-intrusive — no existing layout changed.
      ──────────────────────────────────────────────────────────────────────────── */}
      {orders && cafe && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[#A3A3A3] text-sm">
            {orders.filter(o => o.paymentStatus === 'paid').length} paid orders
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCSV}
              disabled={csvLoading}
              className="flex items-center gap-1.5 px-4 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {csvLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />
              }
              GST CSV
            </button>
            <button
              onClick={handlePDF}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-4 h-9 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pdfLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />
              }
              PDF Report
            </button>
          </div>
        </div>
      )}

      {/* ── NEW: Fee summary cards ────────────────────────────────────────────────
          Only rendered when serviceChargeEnabled OR platformFeeEnabled is true.
          Matches exact card style from Overview.jsx:
            bg-[#0F0F0F] border border-white/5 rounded-sm p-6
            text-[#A3A3A3] text-sm uppercase tracking-wide
            text-3xl font-bold text-white
      ──────────────────────────────────────────────────────────────────────────── */}
      {showFeeCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Service Charges Collected */}
          {scEnabled && (
            <div
              className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
              data-testid="stat-service-charges-collected"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Service Charges</p>
                <Percent className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <p className="text-3xl font-bold text-white">
                {CUR}{feeSummary.totalServiceCharge.toFixed(2)}
              </p>
              <p className="text-[#555] text-xs mt-1">
                {cafe?.serviceChargeRate || 0}% · paid orders
              </p>
            </div>
          )}

          {/* Platform Fees Collected */}
          {pfEnabled && (
            <div
              className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
              data-testid="stat-platform-fees-collected"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Platform Fees</p>
                <BadgeMinus className="w-5 h-5 text-[#EF4444]" />
              </div>
              <p className="text-3xl font-bold text-white">
                {CUR}{feeSummary.totalPlatformFee.toFixed(2)}
              </p>
              <p className="text-[#555] text-xs mt-1">
                {cafe?.platformFeeType === 'fixed'
                  ? `Fixed ${CUR}${cafe?.platformFeeValue || 0}/order`
                  : `${cafe?.platformFeeValue || 0}% · paid orders`}
              </p>
            </div>
          )}

          {/* Final Net Amount */}
          <div
            className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
            data-testid="stat-final-net-amount"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Final Net</p>
              <div className="w-5 h-5 rounded-full bg-[#10B981]/20 flex items-center justify-center">
                <span style={{ color: '#10B981', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>₌</span>
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: '#10B981' }}>
              {CUR}{feeSummary.finalNetAmount.toFixed(2)}
            </p>
            <p className="text-[#555] text-xs mt-1">
              After GST{pfEnabled ? ' + fees' : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── NEW: Payment Breakdown section ───────────────────────────────────────
          Only shown when at least one fee is enabled.
      ──────────────────────────────────────────────────────────────────────────── */}
      {showFeeCards && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3
            className="text-xl font-semibold text-white mb-5"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Payment Breakdown
          </h3>

          <div>
            {[
              { label: 'Total Orders',          value: feeSummary.totalOrders,          isMoney: false, color: '#E5E5E5' },
              { label: 'Gross Revenue',         value: feeSummary.grossRevenue,         isMoney: true,  color: '#E5E5E5' },
              { label: 'GST / Tax Collected',   value: feeSummary.gstCollected,         isMoney: true,  color: '#A3A3A3' },
              ...(scEnabled ? [{ label: 'Service Charges Collected', value: feeSummary.totalServiceCharge, isMoney: true, color: '#D4AF37' }] : []),
              ...(pfEnabled ? [{ label: 'Platform Fees Deducted',    value: feeSummary.totalPlatformFee,   isMoney: true, color: '#EF4444' }] : []),
              { label: 'Net Revenue',           value: feeSummary.netRevenue,           isMoney: true,  color: '#E5E5E5' },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-3 border-b border-white/5"
              >
                <span className="text-[#A3A3A3] text-sm">{row.label}</span>
                <span className="font-semibold text-sm" style={{ color: row.color }}>
                  {row.isMoney ? `${CUR}${Number(row.value).toFixed(2)}` : row.value}
                </span>
              </div>
            ))}

            {/* Final Net Amount — separator row */}
            <div
              className="flex items-center justify-between pt-4 mt-1"
              style={{ borderTop: '2px solid rgba(212,175,55,0.3)' }}
            >
              <span className="text-white font-semibold text-sm">Final Net Amount</span>
              <span
                className="text-lg font-bold"
                style={{ color: feeSummary.finalNetAmount >= 0 ? '#10B981' : '#EF4444' }}
              >
                {CUR}{feeSummary.finalNetAmount.toFixed(2)}
              </span>
            </div>
            {pfEnabled && (
              <p className="text-[#555] text-xs mt-1">
                Gross Revenue − GST − Platform Fees
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── EXISTING CHARTS — ZERO CHANGES BELOW ────────────────────────────── */}

      {/* Revenue Chart */}
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

      {/* Orders per Day */}
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
        {/* Top Items */}
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

        {/* Payment Status */}
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

      {/* Order Status */}
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

export default Analytics;
