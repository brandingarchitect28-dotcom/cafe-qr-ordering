import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Menu as MenuIcon, Gift, BarChart3, Settings as SettingsIcon, QrCode, LogOut, X, UtensilsCrossed, ExternalLink, Boxes } from 'lucide-react';
import Overview from '../components/dashboard/Overview';
import OrdersManagement from '../components/dashboard/OrdersManagement';
import MenuManagement from '../components/dashboard/MenuManagement';
import OffersManagement from '../components/dashboard/OffersManagement';
import Analytics from '../components/dashboard/Analytics';
import Settings from '../components/dashboard/Settings';
import QRGenerator from '../components/dashboard/QRGenerator';
import KitchenDashboardTab from '../components/dashboard/KitchenDashboardTab';
import InventoryManagement from '../components/dashboard/InventoryManagement';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const menuItems = [
    { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
    { id: 'orders',     label: 'Orders',     icon: ShoppingBag     },
    { id: 'menu',       label: 'Menu',       icon: MenuIcon        },
    { id: 'offers',     label: 'Offers',     icon: Gift            },
    { id: 'analytics',  label: 'Analytics',  icon: BarChart3       },
    { id: 'kitchen',    label: 'Kitchen',    icon: UtensilsCrossed },
    { id: 'inventory',  label: 'Inventory',  icon: Boxes           },
    { id: 'qr',         label: 'QR Code',    icon: QrCode          },
    { id: 'settings',   label: 'Settings',   icon: SettingsIcon    },
  ];

  return (
    <div className="min-h-screen bg-[#050505]" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-screen w-64 bg-[#050505] border-r border-white/5 flex flex-col p-4 z-50 transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-[#D4AF37]" style={{ fontFamily: 'Playfair Display, serif' }}>BRANDING ARCHITECT</h1>
          <button 
            className="lg:hidden text-[#A3A3A3] hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-sm transition-all ${
                  activeTab === item.id
                    ? 'bg-[#D4AF37] text-black font-semibold'
                    : 'text-[#A3A3A3] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/5 pt-4">
          <div className="px-4 py-3 mb-2">
            <p className="text-[#A3A3A3] text-sm">Logged in as</p>
            <p className="text-white font-semibold">{user?.email}</p>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-sm transition-all"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md px-6 flex items-center justify-between">
          <button
            className="lg:hidden text-[#D4AF37]"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            {menuItems.find(item => item.id === activeTab)?.label}
          </h2>
          <div className="w-8 lg:hidden" />
        </header>

        {/* Content */}
        <main className="p-6">
          {activeTab === 'overview'   && <Overview />}
          {activeTab === 'orders'     && <OrdersManagement />}
          {activeTab === 'menu'       && <MenuManagement />}
          {activeTab === 'offers'     && <OffersManagement />}
          {activeTab === 'analytics'  && <Analytics />}
          {activeTab === 'kitchen'    && <KitchenDashboardTab />}
          {activeTab === 'inventory'  && <InventoryManagement />}
          {activeTab === 'qr'         && <QRGenerator />}
          {activeTab === 'settings'   && <Settings />}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
