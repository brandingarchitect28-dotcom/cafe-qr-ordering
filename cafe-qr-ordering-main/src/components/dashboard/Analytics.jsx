import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Analytics = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

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
    const newOrders       = orders.filter(o => o.orderStatus === 'new').length;
    const preparingOrders = orders.filter(o => o.orderStatus === 'preparing').length;
    const readyOrders     = orders.filter(o => o.orderStatus === 'ready').length;
    const completedOrders = orders.filter(o => o.orderStatus === 'completed').length;
    const orderStatusSplit = [
      { name: 'New',       value: newOrders       },
      { name: 'Preparing', value: preparingOrders },
      { name: 'Ready',     value: readyOrders     },
      { name: 'Completed', value: completedOrders },
    ];

    // Order source breakdown (Feature 7 — External Orders)
    const sourceCounts = {};
    orders.forEach(o => {
      const src = o.orderSource || (o.externalOrder ? 'other' : 'direct');
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const SOURCE_LABELS = {
      direct: 'Direct (QR)',
      zomato: 'Zomato',
      swiggy: 'Swiggy',
      phone:  'Phone Order',
      walkin: 'Walk-in',
      other:  'Other',
    };
    const SOURCE_COLORS = {
      direct: '#D4AF37',
      zomato: '#EF4444',
      swiggy: '#F97316',
      phone:  '#3B82F6',
      walkin: '#10B981',
      other:  '#8B5CF6',
    };
    const orderSourceSplit = Object.entries(sourceCounts)
      .map(([src, count]) => ({
        name:  SOURCE_LABELS[src] || src,
        value: count,
        color: SOURCE_COLORS[src] || '#A3A3A3',
      }))
      .sort((a, b) => b.value - a.value);

    // Revenue by source
    const revenueBySource = Object.entries(
      orders.reduce((acc, o) => {
        const src = o.orderSource || (o.externalOrder ? 'other' : 'direct');
        acc[src] = (acc[src] || 0) + (o.totalAmount || o.total || 0);
        return acc;
      }, {})
    ).map(([src, revenue]) => ({
      name:    SOURCE_LABELS[src] || src,
      revenue: parseFloat(revenue.toFixed(2)),
      color:   SOURCE_COLORS[src] || '#A3A3A3',
    })).sort((a, b) => b.revenue - a.revenue);

    return { revenueByDay, topItems, paymentSplit, orderStatusSplit, orderSourceSplit, revenueBySource, SOURCE_COLORS, SOURCE_LABELS };
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

      {/* ── External Orders: Source Breakdown ───────────────────────────── */}
      {analytics.orderSourceSplit && analytics.orderSourceSplit.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Orders by Source — Pie */}
          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
            <h3 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Orders by Source
            </h3>
            <p className="text-[#A3A3A3] text-xs mb-6">Breakdown of where orders come from</p>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={analytics.orderSourceSplit}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => percent > 0.05 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                  outerRadius={95}
                  dataKey="value"
                >
                  {analytics.orderSourceSplit.map((entry, index) => (
                    <Cell key={`src-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                  labelStyle={{ color: '#E5E5E5' }}
                  formatter={(value, name) => [value + ' orders', name]}
                />
                <Legend
                  wrapperStyle={{ color: '#E5E5E5', fontSize: '12px' }}
                  formatter={(value) => <span style={{ color: '#E5E5E5' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by Source — Bar */}
          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
            <h3 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Revenue by Source
            </h3>
            <p className="text-[#A3A3A3] text-xs mb-6">Total revenue earned per platform</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.revenueBySource} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#A3A3A3" fontSize={11}
                  tickFormatter={v => `${CUR}${v}`} />
                <YAxis type="category" dataKey="name" stroke="#A3A3A3" width={90} fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                  labelStyle={{ color: '#E5E5E5' }}
                  formatter={(value) => [`${CUR}${value.toFixed(2)}`, 'Revenue']}
                />
                <Bar dataKey="revenue" radius={[0, 3, 3, 0]}>
                  {analytics.revenueBySource.map((entry, index) => (
                    <Cell key={`rev-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Source summary table */}
      {analytics.orderSourceSplit && analytics.orderSourceSplit.length > 1 && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3 className="text-xl font-semibold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Platform Performance Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Platform', 'Orders', 'Revenue', '% of Orders'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#D4AF37] font-semibold text-xs uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.orderSourceSplit.map((src, idx) => {
                  const revEntry = analytics.revenueBySource.find(r => r.name === src.name);
                  const totalOrders = analytics.orderSourceSplit.reduce((s, i) => s + i.value, 0);
                  const pct = totalOrders > 0 ? ((src.value / totalOrders) * 100).toFixed(1) : '0';
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: src.color }} />
                          <span className="text-white font-medium text-sm">{src.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white text-sm">{src.value}</td>
                      <td className="px-4 py-3 text-[#D4AF37] font-semibold text-sm">
                        {CUR}{revEntry ? revEntry.revenue.toFixed(2) : '0.00'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/5 rounded-full h-1.5 max-w-[80px]">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: src.color }}
                            />
                          </div>
                          <span className="text-[#A3A3A3] text-xs">{pct}%</span>
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
