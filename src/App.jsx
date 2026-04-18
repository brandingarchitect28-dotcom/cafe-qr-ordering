import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'sonner';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import CafeOrdering from './pages/CafeOrdering';
import CafeOrderingPremium from './pages/CafeOrderingPremium';
import KitchenDisplay from './pages/KitchenDisplay';
import InvoicePage from './pages/InvoicePage';
import OrderTracking from './pages/OrderTracking';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import './App.css';

// ── Inject premium fonts once (shared across both loading screens) ─────────────
if (typeof document !== 'undefined' && !document.getElementById('app-premium-css')) {
  const el = document.createElement('style');
  el.id = 'app-premium-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Playfair+Display:wght@700;800;900&display=swap');
    @keyframes app-spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes app-spin-rev  { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
    @keyframes app-pulse-glow {
      0%, 100% { opacity: 0.08; transform: scale(1); }
      50%       { opacity: 0.22; transform: scale(1.3); }
    }
    @keyframes app-pulse-glow2 {
      0%, 100% { opacity: 0.04; transform: scale(1.2); }
      50%       { opacity: 0.12; transform: scale(1); }
    }
    @keyframes app-float-up {
      0%   { opacity: 0;    transform: translateY(0px); }
      20%  { opacity: 0.45; }
      80%  { opacity: 0.45; }
      100% { opacity: 0;    transform: translateY(-210px); }
    }
    @keyframes app-dot-pulse {
      0%, 100% { transform: scale(1);   opacity: 0.28; }
      50%       { transform: scale(1.8); opacity: 1;    }
    }
    @keyframes app-shimmer {
      0%   { transform: translateX(-150%); }
      100% { transform: translateX(350%);  }
    }
    @keyframes app-card-in {
      from { opacity: 0; transform: translateY(28px) scale(0.93); }
      to   { opacity: 1; transform: translateY(0px)  scale(1);    }
    }
    @keyframes app-chef-bounce {
      0%, 100% { transform: translateX(-50%) translateY(0px)    rotate(-5deg); }
      50%       { transform: translateX(-50%) translateY(-10px)  rotate(5deg);  }
    }
    @keyframes app-plate-pulse {
      0%, 100% { transform: translateX(-50%) scale(1); }
      50%       { transform: translateX(-50%) scale(1.06); }
    }
    @keyframes app-plate-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes app-whisper-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes app-ring-spin {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to   { transform: translate(-50%, -50%) rotate(360deg); }
    }
    @keyframes app-ring-spin-rev {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to   { transform: translate(-50%, -50%) rotate(-360deg); }
    }
    @keyframes app-orb-drift {
      0%,100% { transform: translate(0px, 0px) scale(1); opacity:0.06; }
      33%      { transform: translate(12px, -18px) scale(1.1); opacity:0.13; }
      66%      { transform: translate(-8px, 10px)  scale(0.95); opacity:0.08; }
    }
    @keyframes app-symbol-glow {
      0%, 100% { text-shadow: 0 0 20px rgba(212,175,55,0.4); }
      50%       { text-shadow: 0 0 48px rgba(212,175,55,0.9), 0 0 80px rgba(212,175,55,0.3); }
    }
    @keyframes app-particle-drift {
      0%   { opacity:0; transform:translateY(0px) scale(0.8); }
      25%  { opacity:0.18; }
      75%  { opacity:0.18; }
      100% { opacity:0; transform:translateY(-90px) scale(1.1); }
    }
  `;
  document.head.appendChild(el);
}

// ── SCREEN 1: Customer Chef Loading (for CafeOrderingRouter) ──────────────────
const ChefLoadingScreen = () => {
  const floatingFoods = ['🍕','🍔','☕','🍜','🧁','🥗','🍣','🌮','🍰','🥐'];
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: "'Nunito', system-ui, sans-serif",
    }}>
      {/* Ambient gold glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%',
        transform: 'translateX(-50%)',
        width: 340, height: 340, borderRadius: '50%',
        background: '#D4AF37', filter: 'blur(90px)',
        pointerEvents: 'none',
        animation: 'app-pulse-glow 4s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', right: '8%',
        width: 200, height: 200, borderRadius: '50%',
        background: '#ff6b35', filter: 'blur(70px)',
        pointerEvents: 'none',
        animation: 'app-pulse-glow2 6s ease-in-out infinite 2s',
      }} />

      {/* Floating food emojis */}
      {floatingFoods.map((food, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${8 + (i * 9) % 82}%`,
            bottom: `${8 + (i * 13) % 28}%`,
            fontSize: 18 + (i % 3) * 7,
            pointerEvents: 'none',
            userSelect: 'none',
            animation: `app-float-up ${4 + i * 0.45}s ease-out infinite ${i * 0.65}s`,
          }}
        >
          {food}
        </div>
      ))}

      {/* Main card */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: 'linear-gradient(160deg, rgba(32,22,6,0.97) 0%, rgba(10,8,3,0.99) 100%)',
        border: '1px solid rgba(212,175,55,0.28)',
        borderRadius: 32,
        padding: '44px 40px 38px',
        maxWidth: 310,
        width: '86vw',
        textAlign: 'center',
        boxShadow: '0 28px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(212,175,55,0.12)',
        animation: 'app-card-in 0.55s cubic-bezier(0.22,1,0.36,1) both',
      }}>
        {/* Chef + spinning plate */}
        <div style={{ position: 'relative', width: 112, height: 112, margin: '0 auto 26px' }}>
          {/* Plate */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%',
            width: 86, height: 86, borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 38%, rgba(212,175,55,0.2), rgba(212,175,55,0.04))',
            border: '2px solid rgba(212,175,55,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'app-plate-pulse 2.2s ease-in-out infinite',
          }}>
            <span style={{
              fontSize: 28, display: 'block', lineHeight: 1,
              animation: 'app-plate-spin 9s linear infinite',
            }}>🍽️</span>
          </div>
          {/* Chef hat bouncing */}
          <span style={{
            position: 'absolute', top: 0, left: '50%',
            fontSize: 40, lineHeight: 1, display: 'block',
            animation: 'app-chef-bounce 1.9s ease-in-out infinite',
          }}>👨‍🍳</span>
        </div>

        {/* Heading */}
        <h2 style={{
          margin: '0 0 7px', color: '#ffffff', fontWeight: 900,
          fontSize: 22, fontFamily: "'Playfair Display', serif",
          letterSpacing: '-0.01em',
        }}>
          Hold tight!
        </h2>
        <p style={{ margin: '0 0 28px', color: '#D4AF37', fontWeight: 700, fontSize: 13, opacity: 0.88 }}>
          Chef is preparing your menu…
        </p>

        {/* Bouncing gold dots */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#D4AF37', flexShrink: 0,
                animation: `app-dot-pulse 1.1s ease-in-out infinite ${i * 0.19}s`,
              }}
            />
          ))}
        </div>

        {/* Shimmer progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: '38%',
            background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
            borderRadius: 99,
            animation: 'app-shimmer 1.4s ease-in-out infinite',
          }} />
        </div>
      </div>

      {/* Bottom whisper */}
      <p style={{
        marginTop: 30,
        color: 'rgba(255,255,255,0.16)',
        fontSize: 11, fontWeight: 600,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        zIndex: 10, position: 'relative',
        userSelect: 'none',
        animation: 'app-whisper-in 0.6s ease both 0.7s',
        opacity: 0,
      }}>
        Crafting your experience
      </p>
    </div>
  );
};

// ── SCREEN 2: Staff/Admin Workspace Loading (for RoleBasedRedirect) ───────────
const WorkspaceLoadingScreen = () => {
  const particles = ['◆','◇','○','◈','▪','◉','▸','◦'];
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: "'Nunito', system-ui, sans-serif",
    }}>
      {/* Background ambient orbs */}
      <div style={{
        position: 'absolute', top: '18%', left: '50%',
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 70%)',
        filter: 'blur(60px)',
        pointerEvents: 'none',
        animation: 'app-orb-drift 7s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '12%', right: '10%',
        width: 260, height: 260, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212,175,55,0.09) 0%, transparent 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
        animation: 'app-orb-drift 9s ease-in-out infinite 3s',
      }} />
      <div style={{
        position: 'absolute', top: '60%', left: '5%',
        width: 180, height: 180, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(180,140,30,0.07) 0%, transparent 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
        animation: 'app-orb-drift 11s ease-in-out infinite 1.5s',
      }} />

      {/* Floating abstract particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${6 + (i * 12) % 86}%`,
            bottom: `${10 + (i * 11) % 35}%`,
            fontSize: 10 + (i % 4) * 4,
            color: `rgba(212,175,55,${0.06 + (i % 3) * 0.04})`,
            pointerEvents: 'none',
            userSelect: 'none',
            fontWeight: 900,
            animation: `app-particle-drift ${5 + i * 0.6}s ease-out infinite ${i * 0.7}s`,
          }}
        >
          {p}
        </div>
      ))}

      {/* Main card */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: 'linear-gradient(160deg, rgba(18,14,6,0.98) 0%, rgba(8,6,2,0.99) 100%)',
        border: '1px solid rgba(212,175,55,0.22)',
        borderRadius: 32,
        padding: '48px 44px 42px',
        maxWidth: 320,
        width: '86vw',
        textAlign: 'center',
        boxShadow: '0 32px 90px rgba(0,0,0,0.7), inset 0 1px 0 rgba(212,175,55,0.1)',
        animation: 'app-card-in 0.55s cubic-bezier(0.22,1,0.36,1) both',
      }}>

        {/* Geometric symbol with rotating rings */}
        <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 28px' }}>
          {/* Outer ring */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 96, height: 96, borderRadius: '50%',
            border: '1.5px solid rgba(212,175,55,0.2)',
            borderTopColor: 'rgba(212,175,55,0.7)',
            animation: 'app-ring-spin 3s linear infinite',
          }} />
          {/* Middle ring */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 74, height: 74, borderRadius: '50%',
            border: '1px solid rgba(212,175,55,0.12)',
            borderBottomColor: 'rgba(212,175,55,0.5)',
            borderRightColor: 'rgba(212,175,55,0.5)',
            animation: 'app-ring-spin-rev 2.2s linear infinite',
          }} />
          {/* Inner ring */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 52, height: 52, borderRadius: '50%',
            border: '1px solid rgba(212,175,55,0.08)',
            borderTopColor: 'rgba(212,175,55,0.35)',
            animation: 'app-ring-spin 1.6s linear infinite',
          }} />
          {/* Center symbol */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 20,
              color: '#D4AF37',
              fontWeight: 900,
              lineHeight: 1,
              animation: 'app-symbol-glow 2.5s ease-in-out infinite',
            }}>◈</span>
          </div>
        </div>

        {/* Brand name */}
        <h2 style={{
          margin: '0 0 6px',
          color: '#ffffff',
          fontWeight: 900,
          fontSize: 21,
          fontFamily: "'Playfair Display', serif",
          letterSpacing: '-0.01em',
        }}>
          SmartCafé OS
        </h2>

        {/* Subtitle */}
        <p style={{
          margin: '0 0 8px',
          color: '#D4AF37',
          fontWeight: 700,
          fontSize: 11,
          opacity: 0.75,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}>
          by Branding Architect
        </p>

        <p style={{
          margin: '0 0 28px',
          color: 'rgba(255,255,255,0.38)',
          fontWeight: 600,
          fontSize: 12,
        }}>
          Initializing your workspace…
        </p>

        {/* Bouncing gold dots */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#D4AF37', flexShrink: 0,
                animation: `app-dot-pulse 1.1s ease-in-out infinite ${i * 0.19}s`,
              }}
            />
          ))}
        </div>

        {/* Shimmer progress bar */}
        <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.9), transparent)',
            borderRadius: 99,
            animation: 'app-shimmer 1.6s ease-in-out infinite',
          }} />
        </div>

        {/* Bottom divider + version tag */}
        <div style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: '1px solid rgba(212,175,55,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(212,175,55,0.35)' }} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: 'rgba(212,175,55,0.35)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}>Secure Session</span>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(212,175,55,0.35)' }} />
        </div>
      </div>

      {/* Bottom whisper */}
      <p style={{
        marginTop: 28,
        color: 'rgba(255,255,255,0.12)',
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        zIndex: 10, position: 'relative',
        userSelect: 'none',
        animation: 'app-whisper-in 0.6s ease both 0.8s',
        opacity: 0,
      }}>
        Powered by Branding Architect
      </p>
    </div>
  );
};

// ── Smart router — loads Basic or Premium page based on cafe.planType ─────────
const CafeOrderingRouter = () => {
  const { cafeId } = useParams();
  const [planType, setPlanType] = useState(null);
  const [checked,  setChecked ] = useState(false);

  useEffect(() => {
    if (!cafeId) { setChecked(true); return; }
    const unsub = onSnapshot(
      doc(db, 'cafes', cafeId),
      (snap) => {
        setPlanType(snap.exists() ? (snap.data().planType || 'basic') : 'basic');
        setChecked(true);
      },
      () => { setPlanType('basic'); setChecked(true); }
    );
    return () => unsub();
  }, [cafeId]);

  // ── REPLACED: plain spinner → premium chef loading card ──────────────────
  if (!checked) return <ChefLoadingScreen />;

  return planType === 'premium' ? <CafeOrderingPremium /> : <CafeOrdering />;
};

const RoleBasedRedirect = () => {
  const { userRole, loading } = useAuth();

  // ── REPLACED: plain "Loading..." text → premium workspace loading card ───
  if (loading) return <WorkspaceLoadingScreen />;

  if (userRole === 'admin') return <Navigate to="/admin" replace />;
  if (userRole === 'cafe') return <Navigate to="/dashboard" replace />;
  if (userRole === 'partner') return <Navigate to="/partner" replace />;
  
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RoleBasedRedirect />} />
            
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['cafe']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            
            <Route path="/cafe/:cafeId" element={<CafeOrderingRouter />} />

            {/* Feature 4: Kitchen Display System — public URL, staff open on tablet */}
            <Route path="/kitchen/:cafeId" element={<KitchenDisplay />} />

            {/* Feature 3: Public Invoice Page — no auth required */}
            <Route path="/invoice/:invoiceId" element={<InvoicePage />} />

            {/* Task 7: Customer order tracking — real-time status */}
            <Route path="/track/:orderId" element={<OrderTracking />} />
            
            <Route
              path="/unauthorized"
              element={
                <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-red-500 mb-4">Unauthorized</h1>
                    <p className="text-[#A3A3A3]">You don't have permission to access this page.</p>
                  </div>
                </div>
              }
            />
            
            <Route
              path="*"
              element={
                <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-[#D4AF37] mb-4">404 - Not Found</h1>
                    <p className="text-[#A3A3A3]">The page you're looking for doesn't exist.</p>
                  </div>
                </div>
              }
            />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#0F0F0F',
                color: '#E5E5E5',
                border: '1px solid rgba(255,255,255,0.1)',
              },
            }}
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
