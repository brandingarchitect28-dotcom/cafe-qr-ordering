import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { IndianRupee, ShoppingBag, TrendingUp, Clock, XCircle } from 'lucide-react';

const Overview = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const stats = useMemo(() => {
    if (!orders) return {
      todayRevenue: 0,
      ordersToday: 0,
      cancelledToday: 0,
      avgOrderValue: 0,
      activeOrders: 0,
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(order => {
      const orderDate = order.createdAt?.toDate?.() || new Date(0);
      return orderDate >= todayStart;
    });

    // FIX: Revenue — paid orders only (was already correct)
    const paidTodayOrders = todayOrders.filter(
      order => order.paymentStatus === 'paid' || order.orderStatus === 'completed' && order.paymentStatus === 'paid'
    );
    const todayRevenue = paidTodayOrders.reduce(
      (sum, order) => sum + (order.totalAmount || order.total || 0), 0
    );

    // FIX: Order count — paid only (was all today orders which inflated by pending/cancelled)
    const ordersToday = paidTodayOrders.length;

    // FIX: Cancelled count — shown separately for transparency (Rule 3)
    const cancelledToday = todayOrders.filter(
      order => order.orderStatus === 'cancelled'
    ).length;

    // FIX: AOV — paid count denominator (was total today count which caused wrong average)
    const avgOrderValue = ordersToday > 0 ? todayRevenue / ordersToday : 0;

    const activeOrders = orders.filter(
      order => order.orderStatus !== 'completed' && order.orderStatus !== 'cancelled'
    ).length;

    return { todayRevenue, ordersToday, cancelledToday, avgOrderValue, activeOrders };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Today's Revenue — paid orders only */}
        <div
          data-testid="stat-today's-revenue"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Today's Revenue</p>
            <IndianRupee className="w-5 h-5 text-[#10B981]" />
          </div>
          <p className="text-3xl font-bold text-white">{CUR}{stats.todayRevenue.toFixed(2)}</p>
          <p className="text-[#555] text-xs mt-1">Paid orders only</p>
        </div>

        {/* Orders Today — paid count + cancelled shown separately (Rule 3) */}
        <div
          data-testid="stat-orders-today"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Orders Today</p>
            <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.ordersToday}</p>
          {/* Transparent cancelled count — Rule 3 */}
          {stats.cancelledToday > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <XCircle className="w-3 h-3 text-red-400" />
              <p className="text-red-400 text-xs">{stats.cancelledToday} cancelled</p>
            </div>
          )}
          {stats.cancelledToday === 0 && (
            <p className="text-[#555] text-xs mt-1">Paid orders only</p>
          )}
        </div>

        {/* Avg Order Value — paid revenue ÷ paid count */}
        <div
          data-testid="stat-avg-order-value"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Avg Order Value</p>
            <TrendingUp className="w-5 h-5 text-[#3B82F6]" />
          </div>
          <p className="text-3xl font-bold text-white">{CUR}{stats.avgOrderValue.toFixed(2)}</p>
          <p className="text-[#555] text-xs mt-1">Paid orders only</p>
        </div>

        {/* Active Orders — in-progress (not completed, not cancelled) */}
        <div
          data-testid="stat-active-orders"
          className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Active Orders</p>
            <Clock className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.activeOrders}</p>
          <p className="text-[#555] text-xs mt-1">In progress now</p>
        </div>

      </div>

      {/* Recent Orders */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
          Recent Orders
        </h3>
        <div className="space-y-3">
          {orders?.slice(0, 5).map((order) => (
            <div key={order.id} className="flex items-center justify-between bg-black/20 p-4 rounded-sm">
              <div>
                <p className="text-white font-semibold">{order.customerName}</p>
                <p className="text-[#A3A3A3] text-sm">{order.items?.length || 0} items</p>
              </div>
              <div className="text-right">
                <p className="text-[#D4AF37] font-bold">
                  {order.currencySymbol || CUR}{(order.totalAmount || order.total || 0).toFixed(2)}
                </p>
                <p className={`text-sm ${
                  order.orderStatus === 'completed'  ? 'text-green-500'  :
                  order.orderStatus === 'preparing'  ? 'text-yellow-500' :
                  order.orderStatus === 'cancelled'  ? 'text-red-400'    :
                  'text-blue-500'
                }`}>
                  {order.orderStatus}
                </p>
              </div>
            </div>
          ))}
          {(!orders || orders.length === 0) && (
            <p className="text-center text-[#A3A3A3] py-8">No orders yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Overview;
