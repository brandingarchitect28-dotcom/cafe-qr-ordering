import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useDocument } from '../hooks/useFirestore';
import {
  LayoutDashboard, ShoppingBag, Menu as MenuIcon, Gift,
  BarChart3, Settings as SettingsIcon, QrCode, LogOut, X,
  TrendingUp, MessageSquare, Bot, ChefHat, Package, Sparkles,
  FileText, Users, Heart,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useGlobalOrderNotification } from '../hooks/useGlobalOrderNotification';
import GlobalOrderPopup              from '../components/dashboard/GlobalOrderPopup';

import Overview            from '../components/dashboard/Overview';
import OrdersManagement    from '../components/dashboard/OrdersManagement';
import InvoicesTab         from '../components/dashboard/InvoicesTab';
import MenuManagement      from '../components/dashboard/MenuManagement';
import OffersManagement    from '../components/dashboard/OffersManagement';
import Analytics           from '../components/dashboard/Analytics';
import AdvancedAnalytics   from '../components/dashboard/AdvancedAnalytics';
import WhatsAppMarketing   from '../components/dashboard/WhatsAppMarketing';
import AskAI               from '../components/dashboard/AskAI';
import KitchenDashboardTab from '../components/dashboard/KitchenDashboardTab';
import InventoryManagement from '../components/dashboard/InventoryManagement';
import AIInsights          from '../components/dashboard/AIInsights';
import AIMenuUpload        from '../components/dashboard/AIMenuUpload';
import QRGenerator         from '../components/dashboard/QRGenerator';
import LoyaltyDashboard    from '../components/dashboard/LoyaltyDashboard';
import StaffManagement     from '../components/dashboard/StaffManagement';
import Settings            from '../components/dashboard/Settings';
import CafeDisabled        from './CafeDisabled';

// ─── Locked feature placeholder ───────────────────────────────────────────────
const LockedFeature = ({ label, icon: Icon }) => {
  const { T } = useTheme();
  return (
    <div className={`${T.card} rounded-xl p-16 text-center`}>
      <Icon className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(212,175,55,0.3)' }} />
      <p className={`${T.heading} font-semibold text-lg mb-2`}>{label}</p>
      <p className={`${T.muted} text-sm`}>
        This feature is not enabled for your account.
        Contact your administrator to unlock it.
      </p>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const navigate = useNavigate();
  const { T, isLight } = useTheme();

  const { newOrder, clearNewOrder } = useGlobalOrderNotification(cafeId);
  const { data: cafe } = useDocument('cafes', cafeId);

  const [activeTab,   setActiveTab  ] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const features = {
    marketing:   cafe?.features?.marketingWhatsappEnabled !== false,
    aiAssistant: cafe?.features?.aiAssistantEnabled       !== false,
    staff:       cafe?.features?.staffManagementEnabled   !== false,
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const menuItems = [
    { id: 'overview',  label: 'Overview',    icon: LayoutDashboard },
    { id: 'orders',    label: 'Orders',      icon: ShoppingBag     },
    { id: 'invoices',  label: 'Invoices',    icon: FileText        },
    { id: 'menu',      label: 'Menu',        icon: MenuIcon        },
    { id: 'offers',    label: 'Offers',      icon: Gift            },
    { id: 'analytics', label: 'Analytics',   icon: BarChart3       },
    { id: 'advanced',  label: 'Reports',     icon: TrendingUp      },
    { id: 'marketing', label: 'Marketing',   icon: MessageSquare   },
    { id: 'askai',     label: 'Ask AI',      icon: Bot             },
    { id: 'kitchen',   label: 'Kitchen',     icon: ChefHat         },
    { id: 'inventory', label: 'Inventory',   icon: Package         },
    { id: 'ai',        label: 'AI Insights', icon: Sparkles        },
    { id: 'aimenu',    label: 'AI Menu',     icon: Sparkles        },
    { id: 'qr',        label: 'QR Code',     icon: QrCode          },
    { id: 'staff',     label: 'Staff',       icon: Users           },
    { id: 'loyalty',   label: 'Loyalty',     icon: Heart           },
    { id: 'settings',  label: 'Settings',    icon: SettingsIcon    },
  ];

  const sidebarBg = isLight ? 'bg-white'      : 'bg-[#050505]';
  const headerBg  = isLight ? 'bg-white/90'   : 'bg-[#050505]/80';
  const pageBg    = isLight ? 'bg-[#F5F5F5]'  : 'bg-[#050505]';

  if (cafe && cafe.isActive === false) {
    return <CafeDisabled isAdmin={true} />;
  }

  return (
    <div className={`min-h-screen ${pageBg}`} style={{ fontFamily: 'Manrope, sans-serif' }}>

      <GlobalOrderPopup order={newOrder} onClose={clearNewOrder} />

      {/* ── Overlay — shown on ALL screen sizes when sidebar is open ─────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      {/*
        FIX — ISSUE 2 (landscape sidebar not minimizable):
        Root cause: the X close button had className="lg:hidden" so it was
        invisible at ≥1024 px wide — which includes landscape tablets and some
        phones. On those devices the sidebar had no dismiss control.

        Fix: remove "lg:hidden" from the X button so it is ALWAYS visible.
        The sidebar's own lg:translate-x-0 still pins it open on large desktops
        via CSS, but the toggle now works at every width/orientation.

        Header hamburger also had "lg:hidden" — same problem, same fix.
        Both changed to always-visible. The spacer div at the right of the
        header is kept so the title stays centred.
      */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 ${sidebarBg} border-r border-white/5 flex flex-col p-4 z-50 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Branding + close — X is always visible (was lg:hidden, now removed) */}
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-xl font-bold text-[#D4AF37]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            BRANDING ARCHITECT
          </h1>
          {/* FIX: removed lg:hidden — close button visible in ALL orientations */}
          <button
            className="text-[#A3A3A3] hover:text-white transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Nav items */}
        <nav
          className="flex-1 space-y-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {menuItems.map((item) => {
            const Icon     = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-sm transition-all text-sm ${
                  isActive
                    ? 'bg-[#D4AF37] text-black font-semibold'
                    : 'text-[#A3A3A3] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: user + logout */}
        <div className="border-t border-white/5 pt-4 flex-shrink-0">
          <div className="px-4 py-3 mb-2">
            <p className="text-[#A3A3A3] text-sm">Logged in as</p>
            <p className="text-white font-semibold truncate">{user?.email}</p>
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

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="lg:ml-64">

        {/* Sticky header */}
        <header
          className={`sticky top-0 z-30 h-16 border-b border-white/5 ${headerBg} backdrop-blur-md px-6 flex items-center justify-between`}
        >
          {/* FIX: removed lg:hidden — hamburger visible in ALL orientations */}
          <button
            className="text-[#D4AF37] hover:opacity-80 transition-opacity"
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Toggle sidebar"
          >
            <MenuIcon className="w-6 h-6" />
          </button>

          <h2
            className="text-2xl font-bold text-white"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {menuItems.find(item => item.id === activeTab)?.label}
          </h2>

          {/* Spacer keeps title centred — width matches hamburger button */}
          <div className="w-6" />
        </header>

        {/* Page content */}
        <main className="p-6">
          {activeTab === 'overview'   && <Overview />}
          {activeTab === 'orders'     && <OrdersManagement />}
          {activeTab === 'invoices'   && <InvoicesTab />}
          {activeTab === 'menu'       && <MenuManagement />}
          {activeTab === 'offers'     && <OffersManagement />}
          {activeTab === 'analytics'  && <Analytics />}
          {activeTab === 'advanced'   && <AdvancedAnalytics />}
          {activeTab === 'marketing'  && (features.marketing   ? <WhatsAppMarketing /> : <LockedFeature label="Marketing"    icon={MessageSquare} />)}
          {activeTab === 'askai'      && (features.aiAssistant ? <AskAI />             : <LockedFeature label="Ask AI"       icon={Bot}           />)}
          {activeTab === 'kitchen'    && <KitchenDashboardTab />}
          {activeTab === 'inventory'  && <InventoryManagement />}
          {activeTab === 'ai'         && <AIInsights />}
          {activeTab === 'aimenu'     && <AIMenuUpload onClose={() => setActiveTab('menu')} />}
          {activeTab === 'qr'         && <QRGenerator />}
          {activeTab === 'staff'      && (features.staff       ? <StaffManagement />   : <LockedFeature label="Staff"        icon={Users}         />)}
          {activeTab === 'loyalty'    && <LoyaltyDashboard />}
          {activeTab === 'settings'   && <Settings />}
        </main>

      </div>
    </div>
  );
};

export default Dashboard;
