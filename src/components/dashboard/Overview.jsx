import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { IndianRupee, ShoppingBag, TrendingUp, Clock } from 'lucide-react';

const Overview = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: orders } = useCollection('orders', cafeId ? [where('cafeId', '==', cafeId)] : []);

  const stats = useMemo(() => {
    if (!orders) return { todayRevenue: 0, ordersToday: 0, avgOrderValue: 0, activeOrders: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(order => {
      const orderDate = order.createdAt?.toDate?.() || new Date(0);
      return orderDate >= today;
    });

    const completedPaidOrders = todayOrders.filter(
      order => order.orderStatus === 'completed' && order.paymentStatus === 'paid'
    );

    const todayRevenue = completedPaidOrders.reduce((sum, order) => sum + (order.totalAmount || order.total || 0), 0);
    const ordersToday = todayOrders.length;
    const avgOrderValue = ordersToday > 0 ? todayRevenue / ordersToday : 0;
    const activeOrders = orders.filter(order => order.orderStatus !== 'completed').length;

    return { todayRevenue, ordersToday, avgOrderValue, activeOrders };
  }, [orders]);

  const statCards = [
    { label: "Today's Revenue", value: `₹${stats.todayRevenue.toFixed(2)}`, icon: IndianRupee, color: 'text-[#10B981]' },
    { label: 'Orders Today', value: stats.ordersToday, icon: ShoppingBag, color: 'text-[#D4AF37]' },
    { label: 'Avg Order Value', value: `₹${stats.avgOrderValue.toFixed(2)}`, icon: TrendingUp, color: 'text-[#3B82F6]' },
    { label: 'Active Orders', value: stats.activeOrders, icon: Clock, color: 'text-[#F59E0B]' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">{stat.label}</p>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-3xl font-bold text-white">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>Recent Orders</h3>
        <div className="space-y-3">
          {orders?.slice(0, 5).map((order) => (
            <div key={order.id} className="flex items-center justify-between bg-black/20 p-4 rounded-sm">
              <div>
                <p className="text-white font-semibold">{order.customerName}</p>
                <p className="text-[#A3A3A3] text-sm">{order.items?.length || 0} items</p>
              </div>
              <div className="text-right">
                <p className="text-[#D4AF37] font-bold">₹{(order.totalAmount || order.total || 0).toFixed(2)}</p>
                <p className={`text-sm ${
                  order.orderStatus === 'completed' ? 'text-green-500' :
                  order.orderStatus === 'preparing' ? 'text-yellow-500' :
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
