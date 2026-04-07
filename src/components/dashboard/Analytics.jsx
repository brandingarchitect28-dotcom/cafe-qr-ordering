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
  const CUR = cafe?.currencySymbol || '\u20b9';

  // Exclude soft-deleted orders before passing to any calculation or export
  const orders_ = orders?.filter(o => !o.isDeleted) ?? orders;

  // \u2500\u2500 NEW: download loading states \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  // \u2500\u2500 Existing analytics (UNCHANGED) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const analytics = useMemo(() => {
    if (!orders_ || orders_.length === 0) return null;

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

    // Best selling items
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

    // Payment status split
    const paidOrders = orders_.filter(o => o.paymentStatus === 'paid').length;
    const pendingOrders = orders_.filter(o => o.paymentStatus === 'pending').length;
    const paymentSplit = [
      { name: 'Paid', value: paidOrders },
      { name: 'Pending', value: pendingOrders }
    ];

    // Order status split
    const newOrders = orders_.filter(o => o.orderStatus === 'new').length;
    const preparingOrders = orders_.filter(o => o.orderStatus === 'preparing').length;
    const completedOrders = orders_.filter(o => o.orderStatus === 'completed').length;
    const orderStatusSplit = [
      { name: 'New', value: newOrders },
      { name: 'Preparing', value: preparingOrders },
      { name: 'Completed', value: completedOrders }
    ];

    return { revenueByDay, topItems, paymentSplit, orderStatusSplit };
  }, [orders_]);

  // \u2500\u2500 NEW: fee summary (only recalculates when orders or cafe settings change) \u2500\u2500
  const feeSummary = useMemo(() => {
    if (!orders_ || !cafe) return null;
    return calcFeeSummary(orders_, cafe);
  }, [orders_, cafe]);

  // \u2500\u2500 NEW: settings flags \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;
  const showFeeCards = (scEnabled || pfEnabled) && feeSummary;

  // \u2500\u2500 NEW: download handlers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handlePDF = () => {
    if (!orders_ || !cafe) { toast.error('No data to export'); return; }
    setPdfLoading(true);
    try {
      downloadPDFPrint(orders_, cafe);
      toast.success('PDF report opened \u2014 use Print \u2192 Save as PDF');
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
      toast.success('CSV downloaded \u2713');
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

      {/* \u2500\u2500 NEW: Download buttons row \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
          Sits above all charts. Non-intrusive \u2014 doesn't change any existing layout.
          Hidden completely if no orders/cafe loaded yet.
      \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
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

      {/* \u2500\u2500 NEW: Service Charge + Platform Fee summary cards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
          Shown ONLY when the respective setting is enabled in cafe settings.
          Uses the exact same card style as Overview's stat cards:
            bg-[#0F0F0F] border border-white/5 rounded-sm p-6
            text-[#A3A3A3] text-sm uppercase tracking-wide (label)
            text-3xl font-bold text-white (value)
          Non-breaking: if both flags are off this entire block is absent.
      \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {showFeeCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Service Charges Collected */}
          {scEnabled && (
            <div
              className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
              data-testid="stat-service-charges-collected"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">
                  Service Charges
                </p>
                <Percent className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <p className="text-3xl font-bold text-white">
                {CUR}{feeSummary.totalServiceCharge.toFixed(2)}
              </p>
              <p className="text-[#555] text-xs mt-1">
                {cafe?.serviceChargeRate || 0}% \u00b7 all paid orders
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
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">
                  Platform Fees
                </p>
                <BadgeMinus className="w-5 h-5 text-[#EF4444]" />
              </div>
              <p className="text-3xl font-bold text-white">
                {CUR}{feeSummary.totalPlatformFee.toFixed(2)}
              </p>
              <p className="text-[#555] text-xs mt-1">
                {cafe?.platformFeeType === 'fixed'
                  ? `Fixed ${CUR}${cafe?.platformFeeValue || 0} / order`
                  : `${cafe?.platformFeeValue || 0}% \u00b7 all paid orders`}
              </p>
            </div>
          )}

          {/* Final Net Amount \u2014 always shown when at least one fee is enabled */}
          <div
            className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
            data-testid="stat-final-net-amount"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">
                Final Net
              </p>
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: '#10B981' }}
              >
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>\u208c</span>
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: '#10B981' }}>
              {CUR}{feeSummary.finalNetAmount.toFixed(2)}
            </p>
            <p className="text-[#555] text-xs mt-1">
              After GST {pfEnabled ? '+ platform fees' : ''}
            </p>
          </div>
        </div>
      )}

      {/* \u2500\u2500 NEW: Payment Breakdown section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
          Only shown when fees are enabled. Non-breaking when disabled.
      \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {showFeeCards && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3
            className="text-xl font-semibold text-white mb-5"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Payment Breakdown
          </h3>

          <div className="space-y-0">
            {/* \u2500\u2500 Breakdown rows \u2500\u2500 */}
            {[
              { label: 'Total Orders',          value: feeSummary.totalOrders,          isMoney: false, color: '#E5E5E5' },
              { label: 'Gross Revenue',         value: feeSummary.grossRevenue,         isMoney: true,  color: '#E5E5E5' },
              { label: 'GST / Tax Collected',   value: feeSummary.gstCollected,         isMoney: true,  color: '#A3A3A3' },
              ...(scEnabled ? [{ label: 'Service Charges Collected', value: feeSummary.totalServiceCharge, isMoney: true, color: '#D4AF37' }] : []),
              ...(pfEnabled ? [{ label: 'Platform Fees Deducted',    value: feeSummary.totalPlatformFee,   isMoney: true, color: '#EF4444' }] : []),
              { label: 'Net Revenue',           value: feeSummary.netRevenue,           isMoney: true,  color: '#E5E5E5' },
            ].map((row, i) => (
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

            {/* \u2500\u2500 Final Net Amount \u2014 highlighted separator row \u2500\u2500 */}
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
                Gross Revenue \u2212 GST \u2212 Platform Fees
              </p>
            )}
          </div>
        </div>
      )}

      {/* \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
          EXISTING CHARTS \u2014 ZERO CHANGES BELOW THIS LINE
      \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501 */}

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
