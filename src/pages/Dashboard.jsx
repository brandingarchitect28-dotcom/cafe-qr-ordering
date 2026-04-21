import React, { useState, useEffect } from 'react';
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

// ── Theme-aware CSS injection (mirrors QRGenerator pattern exactly) ───────────
function injectDashCSS(isLight) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('dash-cafe-css');
  if (existing) existing.remove();

  // Sidebar palette
  const S = isLight ? {
    sidebarBg:      '#FDFAF4',
    sidebarBorder:  'rgba(201,162,39,0.2)',
    navItemColor:   '#5a4530',
    navItemHoverBg: 'rgba(201,162,39,0.1)',
    navItemHoverC:  '#3a2a10',
    scrollThumb:    'rgba(201,162,39,0.25)',
  } : {
    sidebarBg:      '#0a0702',
    sidebarBorder:  'rgba(201,162,39,0.1)',
    navItemColor:   '#a89880',
    navItemHoverBg: 'rgba(201,162,39,0.07)',
    navItemHoverC:  '#f0e0c0',
    scrollThumb:    'rgba(201,162,39,0.18)',
  };

  // Main content palette
  const M = isLight ? {
    pageBg:       '#F5F3EE',
    cardBg:       '#FFFFFF',
    cardBorder:   'rgba(201,162,39,0.15)',
    cardShadow:   '0 1px 8px rgba(0,0,0,0.07)',
    textPrimary:  '#111111',
    textSecond:   '#444444',
    textMuted:    '#666666',
    divider:      'rgba(0,0,0,0.08)',
    inputBg:      '#FFFFFF',
    inputBorder:  'rgba(0,0,0,0.15)',
    inputColor:   '#111111',
    inputPH:      '#999999',
    badgeBg:      'rgba(201,162,39,0.10)',
    badgeColor:   '#7a5500',
    rowHover:     'rgba(201,162,39,0.05)',
    sectionBg:    '#F5F3EE',
    sectionBd:    'rgba(0,0,0,0.08)',
    tableBorder:  'rgba(0,0,0,0.07)',
    tableHeadBg:  'rgba(0,0,0,0.04)',
    tableHeadC:   '#555555',
    emptyIconC:   '#c9a865',
    emptyTextC:   '#555555',
  } : {
    pageBg:       '#050505',
    cardBg:       '#0f0c07',
    cardBorder:   'rgba(201,162,39,0.10)',
    cardShadow:   'none',
    textPrimary:  '#f0e0c0',
    textSecond:   '#9a8a70',
    textMuted:    '#6a5a45',
    divider:      'rgba(201,162,39,0.08)',
    inputBg:      '#0f0c07',
    inputBorder:  'rgba(201,162,39,0.15)',
    inputColor:   '#f0e0c0',
    inputPH:      '#5a4a35',
    badgeBg:      'rgba(201,162,39,0.12)',
    badgeColor:   '#C9A227',
    rowHover:     'rgba(201,162,39,0.04)',
    sectionBg:    '#0a0702',
    sectionBd:    'rgba(201,162,39,0.08)',
    tableBorder:  'rgba(255,255,255,0.05)',
    tableHeadBg:  'rgba(201,162,39,0.06)',
    tableHeadC:   '#a89060',
    emptyIconC:   '#4a3a20',
    emptyTextC:   '#6a5a45',
  };

  const el = document.createElement('style');
  el.id = 'dash-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&display=swap');

    .dash       { font-family: 'DM Sans', system-ui, sans-serif; }
    .dash-title { font-family: 'Playfair Display', serif !important; }

    /* ── Page background ── */
    .dash-page { background: ${M.pageBg} !important; color: ${M.textPrimary} !important; }

    /* ── Sidebar — must beat index.css aside { !important } ── */
    .dash-sidebar {
      background: ${S.sidebarBg} !important;
      background-image: none !important;
      border-right: 1.5px solid ${S.sidebarBorder} !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      box-shadow: ${isLight ? '2px 0 12px rgba(0,0,0,0.06)' : '4px 0 24px rgba(0,0,0,0.3)'} !important;
    }
    /* Remove the gold stripe pseudo-element in light mode */
    ${isLight ? '.dash-sidebar::before { display: none !important; }' : ''}

    /* ── Nav items ── */
    .dash-nav-item {
      width: 100%; display: flex; align-items: center; gap: 11px;
      padding: 11px 14px; border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 500; font-size: 15px;
      cursor: pointer; transition: all 160ms;
      border: none; background: transparent;
      text-align: left; letter-spacing: 0.015em;
      -webkit-font-smoothing: antialiased;
      color: ${S.navItemColor} !important;
    }
    .dash-nav-item:hover  { background: ${S.navItemHoverBg} !important; color: ${S.navItemHoverC} !important; }
    .dash-nav-item.active {
      background: linear-gradient(135deg,#C9A227,#A67C00) !important;
      color: #fff !important; font-weight: 700 !important;
      box-shadow: 0 3px 14px rgba(201,162,39,0.32) !important;
    }
    .dash-nav-icon { opacity: 0.5; flex-shrink: 0; transition: opacity 160ms; }
    .dash-nav-item:hover .dash-nav-icon  { opacity: 0.9; }
    .dash-nav-item.active .dash-nav-icon { opacity: 1; }

    /* ── Scrollbar ── */
    .dash-nav-scroll {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
    }
    .dash-nav-scroll::-webkit-scrollbar { width: 3px; }
    .dash-nav-scroll::-webkit-scrollbar-track { background: transparent; }
    .dash-nav-scroll::-webkit-scrollbar-thumb { background: ${S.scrollThumb}; border-radius: 3px; }

    /* ── Branding ── */
    .dash-brand-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 24px; font-weight: 900; letter-spacing: 0.02em;
      text-transform: uppercase; color: #C9A227; line-height: 1.08;
      -webkit-font-smoothing: antialiased; display: block;
    }
    .dash-brand-sub {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 9px; font-weight: 700; letter-spacing: 0.2em;
      text-transform: uppercase; color: #C9A227; opacity: 0.4;
      margin-top: 6px; -webkit-font-smoothing: antialiased; display: block;
    }

    /* ── Cards ── */
    .dash-card {
      background: ${M.cardBg} !important;
      border: 1.5px solid ${M.cardBorder} !important;
      border-radius: 16px;
      box-shadow: ${M.cardShadow} !important;
      color: ${M.textPrimary} !important;
    }
    .dash-card-title { color: ${M.textPrimary} !important; }
    .dash-card-value { color: ${M.textPrimary} !important; }
    .dash-card-label { color: ${M.textMuted}   !important; }

    /* ── Typography ── */
    .dash-text-primary   { color: ${M.textPrimary} !important; }
    .dash-text-secondary { color: ${M.textSecond}  !important; }
    .dash-text-muted     { color: ${M.textMuted}   !important; }

    /* ── Divider ── */
    .dash-divider { border-color: ${M.divider} !important; background: ${M.divider} !important; height: 1px; }

    /* ── Inputs ── */
    .dash-input {
      background: ${M.inputBg}    !important;
      border: 1.5px solid ${M.inputBorder} !important;
      color: ${M.inputColor}      !important;
      border-radius: 10px;
    }
    .dash-input::placeholder { color: ${M.inputPH} !important; }
    .dash-input:focus { border-color: rgba(201,162,39,0.55) !important; outline: none; }

    /* ── Badges ── */
    .dash-badge {
      background: ${M.badgeBg} !important; color: ${M.badgeColor} !important;
      border-radius: 6px; padding: 2px 8px;
      font-size: 11px; font-weight: 700;
    }

    /* ── Tables ── */
    .dash-table-row:hover { background: ${M.rowHover} !important; }
    .dash-table-border    { border-color: ${M.tableBorder} !important; }
    .dash-table-head      { background: ${M.tableHeadBg} !important; color: ${M.tableHeadC} !important; }

    /* ── Section containers ── */
    .dash-section-bg {
      background: ${M.sectionBg} !important;
      border: 1.5px solid ${M.sectionBd} !important;
      border-radius: 14px;
    }

    /* ── Empty states ── */
    .dash-empty-icon { color: ${M.emptyIconC} !important; }
    .dash-empty-text { color: ${M.emptyTextC} !important; }
  `;
  document.head.appendChild(el);
}
// ─────────────────────────────────────────────────────────────────────────────

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
  const { isLight } = useTheme();
  return (
    <div className="dash-card p-16 text-center" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="text-5xl mb-4">🔒</div>
      <p className="font-black text-lg mb-2 dash-text-primary">{label}</p>
      <p className="text-sm font-semibold dash-text-secondary">
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

  // ── THE KEY FIX ──────────────────────────────────────────────────────────
  // 1. Toggles  html.light-mode  class → activates ALL of index.css light rules
  // 2. Re-injects dash CSS          → updates sidebar + dash-* classes
  // 3. Cleanup on unmount           → removes class when leaving dashboard
  useEffect(() => {
    // Bridge the JS boolean → CSS class that index.css listens to
    document.documentElement.classList.toggle('light-mode', isLight);
    // Re-inject component-level CSS with correct palette
    injectDashCSS(isLight);
    // Cleanup: remove light-mode class when component unmounts
    return () => {
      document.documentElement.classList.remove('light-mode');
    };
  }, [isLight]);
  // ─────────────────────────────────────────────────────────────────────────

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

  // ── Inline styles (JS-driven, beat index.css where needed) ─────────────
  const headerBg         = isLight ? 'rgba(245,243,238,0.96)' : 'rgba(5,5,5,0.88)';
  const headerBorder     = isLight ? '1px solid rgba(0,0,0,0.07)'        : '1px solid rgba(201,162,39,0.1)';
  const headerTitleColor = isLight ? '#111111'                            : '#FFFFFF';

  const userEmailColor  = isLight ? '#111111'               : '#FFFFFF';
  const userLabelColor  = isLight ? '#666666'               : '#7a6a55';
  const userBg          = isLight ? 'rgba(0,0,0,0.04)'      : 'rgba(201,162,39,0.05)';
  const userBorderColor = isLight ? 'rgba(0,0,0,0.09)'      : 'rgba(201,162,39,0.08)';
  const footerBorder    = isLight ? '1px solid rgba(0,0,0,0.08)'         : '1px solid rgba(201,162,39,0.08)';

  const closeBtnColor      = isLight ? '#555555'          : '#5a4a3a';
  const closeBtnHoverColor = isLight ? '#111111'          : '#fff';
  const closeBtnHoverBg    = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
  const overlayBg          = isLight ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.7)';

  // Sidebar bg as inline style — beats index.css `aside { !important }`
  // because inline styles have higher specificity than any stylesheet rule
  const sidebarBg = isLight ? '#FDFAF4' : '#0a0702';
  const sidebarBorderColor = isLight ? 'rgba(201,162,39,0.2)' : 'rgba(201,162,39,0.1)';
  // ─────────────────────────────────────────────────────────────────────────

  if (cafe && cafe.isActive === false) return <CafeDisabled isAdmin={true} />;

  return (
    <div
      className="min-h-screen dash dash-page"
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

      {/* ── Sidebar ──
          inline style background beats index.css `aside { background: !important }`
          because inline styles always win over stylesheet rules regardless of !important
      ── */}
      <aside
        className={`dash-sidebar fixed top-0 left-0 h-screen w-64 flex flex-col z-50 transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background:   sidebarBg,
          borderRight:  `1.5px solid ${sidebarBorderColor}`,
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
        {/* Branding */}
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

        {/* Footer */}
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
        {/* Header inline style beats index.css `header { background: !important }` */}
        <header
          className="sticky top-0 z-30 h-16 px-5 flex items-center justify-between"
          style={{
            background:     headerBg,
            backdropFilter: 'blur(16px)',
            borderBottom:   headerBorder,
            boxShadow:      isLight
              ? '0 1px 0 rgba(212,175,55,0.08), 0 4px 16px rgba(0,0,0,0.05)'
              : '0 1px 0 rgba(212,175,55,0.06), 0 4px 16px rgba(0,0,0,0.2)',
          }}
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
