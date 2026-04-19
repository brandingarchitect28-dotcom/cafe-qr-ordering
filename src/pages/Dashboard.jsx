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

if (typeof document !== 'undefined' && !document.getElementById('dash-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'dash-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .dash { font-family: 'DM Sans', system-ui, sans-serif; }
    .dash-title { font-family: 'Playfair Display', serif !important; }

    /* Nav items — larger, bolder, more visible like reference screenshot */
    .dash-nav-item {
      width: 100%;
      display: flex; align-items: center; gap: 11px;
      padding: 11px 14px; border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 600; font-size: 15px;
      cursor: pointer; transition: all 160ms;
      border: none; background: transparent;
      color: #8a7a65; text-align: left;
      letter-spacing: 0.01em;
      -webkit-font-smoothing: antialiased;
    }
    .dash-nav-item:hover { background: rgba(201,162,39,0.07); color: #e5d5b5; }
    .dash-nav-item.active {
      background: linear-gradient(135deg,#C9A227,#A67C00);
      color: #fff; font-weight: 700;
      box-shadow: 0 3px 14px rgba(201,162,39,0.32);
    }
    .dash-nav-icon { opacity: 0.55; flex-shrink: 0; transition: opacity 160ms; }
    .dash-nav-item:hover .dash-nav-icon  { opacity: 0.85; }
    .dash-nav-item.active .dash-nav-icon { opacity: 1; }

    /* TASK 5 & 6: Sidebar scroll + sticky footer */
    .dash-sidebar {
      background: #0a0702;
      border-right: 1.5px solid rgba(201,162,39,0.1);
    }
    .dash-nav-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      /* leave room for sticky footer — handled by flex column */
    }
    .dash-nav-scroll::-webkit-scrollbar { width: 3px; }
    .dash-nav-scroll::-webkit-scrollbar-track { background: transparent; }
    .dash-nav-scroll::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.18); border-radius: 3px; }

    /* Branding header — large bold all-caps stacked like reference screenshot */
    .dash-brand-name {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #C9A227;
      line-height: 1.15;
      -webkit-font-smoothing: antialiased;
    }
    .dash-brand-sub {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #C9A227;
      opacity: 0.5;
      margin-top: 3px;
      -webkit-font-smoothing: antialiased;
    }
  `;
  document.head.appendChild(el);
}

// TASK 4: Lucide icons mapped per nav id — replaces all emojis
const NAV_ICON = {
  overview:  LayoutDashboard,
  orders:    ShoppingBag,
  invoices:  FileText,
  menu:      MenuIcon,
  offers:    Gift,
  analytics: BarChart3,
  advanced:  TrendingUp,
  marketing: MessageSquare,
  askai:     Bot,
  kitchen:   ChefHat,
  inventory: Package,
  ai:        Sparkles,
  aimenu:    Sparkles,
  qr:        QrCode,
  staff:     Users,
  loyalty:   Heart,
  settings:  SettingsIcon,
};

// Keep NAV_EMOJI for the header label emoji (used in <header> activeTab display only)
const NAV_EMOJI = {
  overview:  '🏠', orders:    '🧾', invoices:  '📄', menu:      '🍽️',
  offers:    '🎁', analytics: '📊', advanced:  '📈', marketing: '💬',
  askai:     '🤖', kitchen:   '👨‍🍳', inventory: '📦', ai:        '✨',
  aimenu:    '🪄', qr:        '📱', staff:     '👥', loyalty:   '⭐', settings:  '⚙️',
};

const LockedFeature = ({ label, icon: Icon }) => {
  const { T } = useTheme();
  return (
    <div className="dash rounded-2xl p-16 text-center" style={{ background: '#141008', border: '1.5px solid rgba(255,255,255,0.07)' }}>
      <div className="text-5xl mb-4">🔒</div>
      <p className="font-black text-lg text-white mb-2">{label}</p>
      <p className="text-sm font-semibold" style={{ color: '#7a6a55' }}>
        This feature is not enabled for your account. Contact your administrator to unlock it.
      </p>
    </div>
  );
};

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
    try { await signOut(auth); navigate('/login'); }
    catch (error) { console.error('Logout error:', error); }
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
  if (cafe && cafe.isActive === false) return <CafeDisabled isAdmin={true} />;

  return (
    <div className={`min-h-screen ${pageBg} dash`} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <GlobalOrderPopup order={newOrder} onClose={clearNewOrder} />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`fixed top-0 left-0 h-screen w-64 dash-sidebar flex flex-col z-50 transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Branding header — "BRANDING ARCHITECT" large bold, "SmartCafé OS" small gold below */}
        <div className="flex items-start justify-between px-4 pt-5 pb-4 flex-shrink-0">
          <div className="flex flex-col">
            <span className="dash-brand-name">Branding<br/>Architect</span>
            <span className="dash-brand-sub">SmartCafé OS</span>
          </div>
          <button
            className="transition-colors p-1.5 rounded-xl hover:bg-white/5 mt-1"
            style={{ color: '#7a6a55' }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#7a6a55'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mx-4 flex-shrink-0" style={{ height: 1, background: 'rgba(201,162,39,0.1)' }} />

        {/*
          TASK 5 & 6: Nav scroll container is flex-1 with overflow-y auto.
          Footer is flex-shrink-0 OUTSIDE the scroll container,
          so it always stays visible at the bottom regardless of scroll position.
        */}
        <nav className="dash-nav-scroll px-3 py-2 space-y-0.5">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            // TASK 3 & 4: Use Lucide icon component — no emojis in nav
            const IconComponent = NAV_ICON[item.id] || LayoutDashboard;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`dash-nav-item${isActive ? ' active' : ''}`}
              >
                <IconComponent className="dash-nav-icon w-4 h-4" strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* TASK 5: Sticky footer — always visible, outside scroll area */}
        <div className="flex-shrink-0 px-3 pb-4 pt-2" style={{ borderTop: '1px solid rgba(201,162,39,0.08)' }}>
          <div className="px-3 py-2 rounded-xl mb-1" style={{ background: 'rgba(201,162,39,0.05)' }}>
            <p className="text-xs font-semibold" style={{ color: '#4a3f35', letterSpacing: '0.02em' }}>Logged in as</p>
            <p className="text-white text-sm font-bold truncate" style={{ letterSpacing: '0.01em' }}>{user?.email}</p>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="dash-nav-item"
            style={{ color: '#f87171' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.1)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#f87171'; }}
          >
            <LogOut className="dash-nav-icon w-4 h-4" strokeWidth={1.8} style={{ opacity: 0.7 }} />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content — UNCHANGED ── */}
      <div>
        <header className="sticky top-0 z-30 h-16 px-5 flex items-center justify-between"
          style={{ background: 'rgba(5,5,5,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(201,162,39,0.1)' }}>
          <button className="transition-opacity hover:opacity-70" style={{ color: '#C9A227' }}
            onClick={() => setSidebarOpen(prev => !prev)} aria-label="Toggle sidebar">
            <MenuIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg">{NAV_EMOJI[activeTab] || '·'}</span>
            <h2 className="text-xl font-black text-white dash-title">
              {menuItems.find(item => item.id === activeTab)?.label}
            </h2>
          </div>
          <div className="w-6" />
        </header>
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
