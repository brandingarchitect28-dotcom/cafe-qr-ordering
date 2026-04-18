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

// ── Inject café-vibe dashboard CSS once ───────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('dash-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'dash-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
    .dash { font-family: 'Nunito', system-ui, sans-serif; }
    .dash-title { font-family: 'Fredoka One', system-ui, sans-serif !important; }
    .dash-nav-item {
      width: 100%;
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; border-radius: 12px;
      font-family: 'Nunito', system-ui, sans-serif;
      font-weight: 700; font-size: 14px;
      cursor: pointer; transition: all 160ms;
      border: none; background: transparent;
      color: #7a6a55; text-align: left;
    }
    .dash-nav-item:hover { background: rgba(255,140,0,0.07); color: #fff; }
    .dash-nav-item.active {
      background: linear-gradient(135deg,#FF7A20,#E55A00);
      color: #fff; font-weight: 800;
      box-shadow: 0 3px 14px rgba(255,120,0,0.32);
    }
    .dash-nav-item.active .dash-nav-emoji { filter: brightness(1.2); }
    .dash-sidebar {
      background: #0a0702;
      border-right: 1.5px solid rgba(255,140,0,0.1);
    }
  `;
  document.head.appendChild(el);
}

// ── Nav item emoji map ─────────────────────────────────────────────────────────
const NAV_EMOJI = {
  overview:  '🏠',
  orders:    '🧾',
  invoices:  '📄',
  menu:      '🍽️',
  offers:    '🎁',
  analytics: '📊',
  advanced:  '📈',
  marketing: '💬',
  askai:     '🤖',
  kitchen:   '👨‍🍳',
  inventory: '📦',
  ai:        '✨',
  aimenu:    '🪄',
  qr:        '📱',
  staff:     '👥',
  loyalty:   '⭐',
  settings:  '⚙️',
};

// ─── Locked feature placeholder ───────────────────────────────────────────────
const LockedFeature = ({ label, icon: Icon }) => {
  const { T } = useTheme();
  return (
    <div className="dash rounded-2xl p-16 text-center" style={{ background: '#141008', border: '1.5px solid rgba(255,255,255,0.07)' }}>
      <div className="text-5xl mb-4">🔒</div>
      <p className="font-black text-lg text-white mb-2">{label}</p>
      <p className="text-sm font-semibold" style={{ color: '#7a6a55' }}>
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

  const pageBg = isLight ? 'bg-[#F5F5F5]' : 'bg-[#050505]';

  if (cafe && cafe.isActive === false) {
    return <CafeDisabled isAdmin={true} />;
  }

  return (
    <div className={`min-h-screen ${pageBg} dash`} style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>

      <GlobalOrderPopup order={newOrder} onClose={clearNewOrder} />

      {/* ── Overlay ────────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 dash-sidebar flex flex-col p-4 z-50 transform transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: 'rgba(255,140,0,0.12)', border: '1.5px solid rgba(255,140,0,0.22)' }}>
              ☕
            </div>
            <div>
              <h1 className="text-sm font-black dash-title" style={{ color: '#FF7A20', lineHeight: 1.1 }}>
                SmartCafé OS
              </h1>
              <p className="text-xs font-bold" style={{ color: '#4a3f35' }}>Branding Architect</p>
            </div>
          </div>
          <button
            className="transition-colors p-1.5 rounded-xl hover:bg-white/5"
            style={{ color: '#7a6a55' }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#7a6a55'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Divider */}
        <div className="mb-4" style={{ height: 1, background: 'rgba(255,140,0,0.1)' }} />

        {/* Nav */}
        <nav
          className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            const emoji    = NAV_EMOJI[item.id] || '·';
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`dash-nav-item${isActive ? ' active' : ''}`}
              >
                <span className="dash-nav-emoji text-base w-5 text-center flex-shrink-0">{emoji}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="my-3" style={{ height: 1, background: 'rgba(255,140,0,0.08)' }} />

        {/* User + logout */}
        <div className="flex-shrink-0 space-y-1">
          <div className="px-4 py-2 rounded-xl" style={{ background: 'rgba(255,140,0,0.05)' }}>
            <p className="text-xs font-bold" style={{ color: '#4a3f35' }}>Logged in as</p>
            <p className="text-white text-sm font-black truncate">{user?.email}</p>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="dash-nav-item"
            style={{ color: '#f87171' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.1)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#f87171'; }}
          >
            <span className="text-base w-5 text-center flex-shrink-0">🚪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div>

        {/* Sticky header */}
        <header
          className="sticky top-0 z-30 h-16 px-5 flex items-center justify-between"
          style={{
            background: 'rgba(5,5,5,0.88)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,140,0,0.1)',
          }}
        >
          <button
            className="transition-opacity hover:opacity-70"
            style={{ color: '#FF7A20' }}
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Toggle sidebar"
          >
            <MenuIcon className="w-6 h-6" />
          </button>

          {/* Active tab title */}
          <div className="flex items-center gap-2">
            <span className="text-lg">{NAV_EMOJI[activeTab] || '·'}</span>
            <h2 className="text-xl font-black text-white dash-title">
              {menuItems.find(item => item.id === activeTab)?.label}
            </h2>
          </div>

          {/* Spacer */}
          <div className="w-6" />
        </header>

        {/* Page content */}
        <main className="p-5">
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
