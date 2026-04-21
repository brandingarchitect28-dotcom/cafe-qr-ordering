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
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&display=swap');
    .dash { font-family: 'DM Sans', system-ui, sans-serif; }
    .dash-title { font-family: 'Playfair Display', serif !important; }

    /* Nav items — high contrast, visible in both dark and light mode */
    .dash-nav-item {
      width: 100%;
      display: flex; align-items: center; gap: 11px;
      padding: 11px 14px; border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 500; font-size: 15px;
      cursor: pointer; transition: all 160ms;
      border: none; background: transparent;
      text-align: left;
      letter-spacing: 0.015em;
      -webkit-font-smoothing: antialiased;
    }

    /* Dark mode nav */
    .dash-dark .dash-nav-item { color: #a89880; }
    .dash-dark .dash-nav-item:hover { background: rgba(201,162,39,0.07); color: #f0e0c0; }
    .dash-dark .dash-nav-item.active {
      background: linear-gradient(135deg,#C9A227,#A67C00);
      color: #fff; font-weight: 700;
      box-shadow: 0 3px 14px rgba(201,162,39,0.32);
    }

    /* Light mode nav */
    .dash-light .dash-nav-item { color: #5a4530; }
    .dash-light .dash-nav-item:hover { background: rgba(201,162,39,0.1); color: #3a2a10; }
    .dash-light .dash-nav-item.active {
      background: linear-gradient(135deg,#C9A227,#A67C00);
      color: #fff; font-weight: 700;
      box-shadow: 0 3px 14px rgba(201,162,39,0.32);
    }

    .dash-nav-icon { opacity: 0.5; flex-shrink: 0; transition: opacity 160ms; }
    .dash-nav-item:hover .dash-nav-icon  { opacity: 0.9; }
    .dash-nav-item.active .dash-nav-icon { opacity: 1; }

    /* Sidebar */
    .dash-sidebar-dark {
      background: #0a0702;
      border-right: 1.5px solid rgba(201,162,39,0.1);
    }
    .dash-sidebar-light {
      background: #FDFAF4;
      border-right: 1.5px solid rgba(201,162,39,0.2);
    }

    .dash-nav-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .dash-nav-scroll::-webkit-scrollbar { width: 3px; }
    .dash-nav-scroll::-webkit-scrollbar-track { background: transparent; }
    .dash-nav-scroll::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.18); border-radius: 3px; }

    /* Branding */
    .dash-brand-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 24px;
      font-weight: 900;
      font-style: normal;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: #C9A227;
      line-height: 1.08;
      -webkit-font-smoothing: antialiased;
      display: block;
    }
    .dash-brand-sub {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #C9A227;
      opacity: 0.4;
      margin-top: 6px;
      -webkit-font-smoothing: antialiased;
      display: block;
    }

    /* ─── MAIN CONTENT AREA — light/dark theming ─── */

    /* Dark mode: main content */
    .dash-main-dark {
      background: #050505;
      color: #e8d9c0;
    }
    .dash-main-dark .dash-card {
      background: #0f0c07;
      border: 1.5px solid rgba(201,162,39,0.1);
      color: #e8d9c0;
    }
    .dash-main-dark .dash-card-title  { color: #f0e0c0; }
    .dash-main-dark .dash-card-value  { color: #ffffff; }
    .dash-main-dark .dash-card-label  { color: #7a6a55; }
    .dash-main-dark .dash-text-primary   { color: #f0e0c0; }
    .dash-main-dark .dash-text-secondary { color: #9a8a70; }
    .dash-main-dark .dash-text-muted     { color: #6a5a45; }
    .dash-main-dark .dash-divider  { border-color: rgba(201,162,39,0.08); }
    .dash-main-dark .dash-input {
      background: #0f0c07;
      border: 1.5px solid rgba(201,162,39,0.15);
      color: #f0e0c0;
    }
    .dash-main-dark .dash-input::placeholder { color: #5a4a35; }
    .dash-main-dark .dash-badge {
      background: rgba(201,162,39,0.12);
      color: #C9A227;
    }
    .dash-main-dark .dash-table-row:hover { background: rgba(201,162,39,0.04); }
    .dash-main-dark .dash-section-bg {
      background: #0a0702;
      border: 1.5px solid rgba(201,162,39,0.08);
    }

    /* Light mode: main content */
    .dash-main-light {
      background: #F5F5F5;
      color: #1a1208;
    }
    .dash-main-light .dash-card {
      background: #ffffff;
      border: 1.5px solid rgba(201,162,39,0.15);
      color: #1a1208;
      box-shadow: 0 1px 8px rgba(0,0,0,0.06);
    }
    .dash-main-light .dash-card-title  { color: #2a1e08; }
    .dash-main-light .dash-card-value  { color: #1a1208; }
    .dash-main-light .dash-card-label  { color: #7a6040; }
    .dash-main-light .dash-text-primary   { color: #1a1208; }
    .dash-main-light .dash-text-secondary { color: #5a4530; }
    .dash-main-light .dash-text-muted     { color: #9a7a50; }
    .dash-main-light .dash-divider  { border-color: rgba(201,162,39,0.15); }
    .dash-main-light .dash-input {
      background: #ffffff;
      border: 1.5px solid rgba(201,162,39,0.25);
      color: #1a1208;
    }
    .dash-main-light .dash-input::placeholder { color: #b0956a; }
    .dash-main-light .dash-badge {
      background: rgba(201,162,39,0.1);
      color: #8a6200;
    }
    .dash-main-light .dash-table-row:hover { background: rgba(201,162,39,0.05); }
    .dash-main-light .dash-section-bg {
      background: #fdfaf4;
      border: 1.5px solid rgba(201,162,39,0.12);
    }
  `;
  document.head.appendChild(el);
}

// Lucide icons mapped per nav id
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

const NAV_EMOJI = {
  overview:  '🏠', orders:    '🧾', invoices:  '📄', menu:      '🍽️',
  offers:    '🎁', analytics: '📊', advanced:  '📈', marketing: '💬',
  askai:     '🤖', kitchen:   '👨‍🍳', inventory: '📦', ai:        '✨',
  aimenu:    '🪄', qr:        '📱', staff:     '👥', loyalty:   '⭐', settings:  '⚙️',
};

const LockedFeature = ({ label, icon: Icon }) => {
  const { T, isLight } = useTheme();
  return (
    <div
      className="dash rounded-2xl p-16 text-center"
      style={{
        background: isLight ? '#ffffff' : '#141008',
        border: `1.5px solid ${isLight ? 'rgba(201,162,39,0.18)' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: isLight ? '0 1px 8px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <div className="text-5xl mb-4">🔒</div>
      <p className="font-black text-lg mb-2" style={{ color: isLight ? '#1a1208' : '#FFFFFF' }}>
        {label}
      </p>
      <p className="text-sm font-semibold" style={{ color: isLight ? '#5a4530' : '#7a6a55' }}>
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

  // ── Sidebar theme ──
  const sidebarClass = isLight ? 'dash-sidebar-light dash-light' : 'dash-sidebar-dark dash-dark';

  // ── Main content theme class (NEW — governs all child components) ──
  const mainClass = isLight ? 'dash-main-light' : 'dash-main-dark';

  // ── Header ──
  const headerBg     = isLight ? 'rgba(245,245,245,0.96)' : 'rgba(5,5,5,0.88)';
  const headerBorder = isLight ? '1px solid rgba(201,162,39,0.18)' : '1px solid rgba(201,162,39,0.1)';
  const headerTitleColor = isLight ? '#1a1208' : '#FFFFFF';

  // ── Sidebar footer ──
  const userEmailColor  = isLight ? '#2a1e08' : '#FFFFFF';
  const userLabelColor  = isLight ? '#7a6040' : '#7a6a55';
  const userBg          = isLight ? 'rgba(201,162,39,0.07)' : 'rgba(201,162,39,0.05)';
  const userBorderColor = isLight ? 'rgba(201,162,39,0.18)' : 'rgba(201,162,39,0.08)';
  const footerBorder    = isLight ? '1px solid rgba(201,162,39,0.15)' : '1px solid rgba(201,162,39,0.08)';

  // ── Close button ──
  const closeBtnColor      = isLight ? '#5a4530' : '#5a4a3a';
  const closeBtnHoverColor = isLight ? '#1a1208' : '#fff';
  const closeBtnHoverBg    = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';

  // ── Overlay ──
  const overlayBg = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.7)';

  if (cafe && cafe.isActive === false) return <CafeDisabled isAdmin={true} />;

  return (
    <div
      className={`min-h-screen dash ${mainClass}`}
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <GlobalOrderPopup
        order={newOrder}
        onClose={clearNewOrder}
        onNavigateToOrders={() => { setActiveTab('orders'); clearNewOrder(); }}
      />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: overlayBg, backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 flex flex-col z-50 transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarClass}`}
      >
        {/* Branding header */}
        <div className="flex items-start justify-between px-4 pt-6 pb-5 flex-shrink-0">
          <div>
            <span className="dash-brand-name">Branding<br/>Architect</span>
            <span className="dash-brand-sub">Your Smart OS</span>
          </div>
          <button
            className="transition-colors p-1.5 rounded-xl mt-1"
            style={{ color: closeBtnColor, background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            onMouseEnter={e => { e.currentTarget.style.color = closeBtnHoverColor; e.currentTarget.style.background = closeBtnHoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.color = closeBtnColor; e.currentTarget.style.background = 'transparent'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mx-4 mb-1 flex-shrink-0" />

        <nav className="dash-nav-scroll px-3 py-2 space-y-0.5">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
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

        {/* Sticky footer */}
        <div className="flex-shrink-0 px-3 pb-4 pt-2" style={{ borderTop: footerBorder }}>
          <div className="px-3 py-2 rounded-xl mb-1" style={{ background: userBg, border: `1px solid ${userBorderColor}` }}>
            <p className="text-xs font-semibold" style={{ color: userLabelColor, letterSpacing: '0.02em' }}>Logged in as</p>
            <p className="text-sm font-bold truncate" style={{ color: userEmailColor, letterSpacing: '0.01em' }}>{user?.email}</p>
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

      {/* ── Main content ── */}
      <div>
        <header
          className="sticky top-0 z-30 h-16 px-5 flex items-center justify-between"
          style={{ background: headerBg, backdropFilter: 'blur(16px)', borderBottom: headerBorder }}
        >
          <button
            className="transition-opacity hover:opacity-70"
            style={{ color: '#C9A227', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Toggle sidebar"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg">{NAV_EMOJI[activeTab] || '·'}</span>
            <h2 className="text-xl font-black dash-title" style={{ color: headerTitleColor }}>
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
