import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Percent, BadgeMinus } from 'lucide-react';

// ─── Helper: extract service charge and platform fee from one order ──────────
// Handles old orders (no fields) and new orders (with fields).
// Returns 0 if field missing — full backward compatibility.
const getOrderServiceCharge = (order) =>
  parseFloat(order.serviceChargeAmount || order.service_charge || 0) || 0;

const getOrderPlatformFee = (order) =>
  parseFloat(order.platformFeeAmount || order.platform_fee || 0) || 0;

const Analytics = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ─── Settings flags (safe defaults — if not set, behaves exactly as before) ─
  const scEnabled  = cafe?.serviceChargeEnabled  === true;
  const pfEnabled  = cafe?.platformFeeEnabled    === true;

  const analytics = useMemo(() => {
    if (!orders || orders.length === 0) return null;

    // ── Revenue by day (last 7 days) — UNCHANGED ──────────────────────────────
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
        orders: dayOrders.length,
      };
    });

    // ── Best selling items — UNCHANGED ────────────────────────────────────────
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

    // ── Payment status split — UNCHANGED ─────────────────────────────────────
    const paidOrders    = orders.filter(o => o.paymentStatus === 'paid').length;
    const pendingOrders = orders.filter(o => o.paymentStatus === 'pending').length;
    const paymentSplit  = [
      { name: 'Paid',    value: paidOrders    },
      { name: 'Pending', value: pendingOrders },
    ];

    // ── Order status split — UNCHANGED ────────────────────────────────────────
    const newOrders       = orders.filter(o => o.orderStatus === 'new').length;
    const preparingOrders = orders.filter(o => o.orderStatus === 'preparing').length;
    const completedOrders = orders.filter(o => o.orderStatus === 'completed').length;
    const orderStatusSplit = [
      { name: 'New',       value: newOrders       },
      { name: 'Preparing', value: preparingOrders },
      { name: 'Completed', value: completedOrders },
    ];

    // ── NEW: Service charge & platform fee totals (paid orders only) ──────────
    const paidOrdersList = orders.filter(o => o.paymentStatus === 'paid');

    const totalServiceCharge = paidOrdersList.reduce(
      (sum, o) => sum + getOrderServiceCharge(o), 0
    );

    const totalPlatformFee = paidOrdersList.reduce(
      (sum, o) => sum + getOrderPlatformFee(o), 0
    );

    // Gross revenue = sum of totalAmount on paid orders (includes SC if charged to customer)
    const grossRevenue = paidOrdersList.reduce(
      (sum, o) => sum + (o.totalAmount || o.total || 0), 0
    );

    // Net revenue = gross - platform fees (platform fee is a cost, not customer revenue)
    const netRevenue = grossRevenue - totalPlatformFee;

    return {
      revenueByDay,
      topItems,
      paymentSplit,
      orderStatusSplit,
      totalServiceCharge: parseFloat(totalServiceCharge.toFixed(2)),
      totalPlatformFee:   parseFloat(totalPlatformFee.toFixed(2)),
      grossRevenue:       parseFloat(grossRevenue.toFixed(2)),
      netRevenue:         parseFloat(netRevenue.toFixed(2)),
    };
  }, [orders]);

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

      {/* ── NEW: Service Charge & Platform Fee summary cards ─────────────────────
          Only shown when the respective setting is enabled.
          Uses the exact same card style as the rest of the dashboard.
          If both are disabled → this section does not render at all.
      ─────────────────────────────────────────────────────────────────────── */}
      {(scEnabled || pfEnabled) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scEnabled && (
            <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Service Charges Collected</p>
                <Percent className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <p className="text-3xl font-bold text-white">
                {CUR}{analytics.totalServiceCharge.toFixed(2)}
              </p>
              <p className="text-[#555] text-xs mt-2">
                {cafe?.serviceChargeRate}% service charge · across all paid orders
              </p>
            </div>
          )}
          {pfEnabled && (
            <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Platform Fees Deducted</p>
                <BadgeMinus className="w-5 h-5 text-[#EF4444]" />
              </div>
              <p className="text-3xl font-bold text-white">
                {CUR}{analytics.totalPlatformFee.toFixed(2)}
              </p>
              <p className="text-[#555] text-xs mt-2">
                Net revenue after fees: {CUR}{analytics.netRevenue.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Revenue Chart — UNCHANGED ─────────────────────────────────────────── */}
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

      {/* ── Orders per Day — UNCHANGED ────────────────────────────────────────── */}
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
        {/* ── Top Items — UNCHANGED ────────────────────────────────────────────── */}
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

        {/* ── Payment Status — UNCHANGED ───────────────────────────────────────── */}
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

      {/* ── Order Status — UNCHANGED ──────────────────────────────────────────── */}
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
