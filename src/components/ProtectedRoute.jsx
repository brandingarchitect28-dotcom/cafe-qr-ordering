import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ── Premium Workspace Loading — SaaS OS feel, no cafe vibe ───────────────────
const WorkspaceLoadingScreen = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress,    setProgress   ] = useState(0);

  const steps = [
    'Authenticating session',
    'Loading workspace',
    'Syncing live data',
    'Almost ready',
  ];

  // Cycle through status steps every 1.8s
  useEffect(() => {
    const t = setInterval(() => setCurrentStep(s => (s + 1) % steps.length), 1800);
    return () => clearInterval(t);
  }, []);

  // Smooth progress — climbs to 85% then holds until auth resolves
  useEffect(() => {
    const t = setInterval(() => {
      setProgress(p => p >= 85 ? p : p + (85 - p) * 0.04);
    }, 80);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#05040A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800;900&display=swap');

        @keyframes pr-grid-fade {
          0%,100% { opacity: 0.018; }
          50%      { opacity: 0.042; }
        }
        @keyframes pr-ring-cw {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }
        @keyframes pr-ring-ccw {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(-360deg); }
        }
        @keyframes pr-core-pulse {
          0%,100% { transform: translate(-50%,-50%) scale(1);    opacity:0.9; }
          50%      { transform: translate(-50%,-50%) scale(1.12); opacity:1;   }
        }
        @keyframes pr-glow-breathe {
          0%,100% { opacity:0.12; transform:translate(-50%,-50%) scale(1);    }
          50%      { opacity:0.28; transform:translate(-50%,-50%) scale(1.15); }
        }
        @keyframes pr-dot-seq {
          0%,100% { opacity:0.15; transform:scale(0.85); }
          50%      { opacity:1;    transform:scale(1.3);  }
        }
        @keyframes pr-step-in {
          from { opacity:0; transform:translateY(5px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes pr-scan {
          0%   { transform:translateY(0);     opacity:0; }
          6%   { opacity:1; }
          94%  { opacity:1; }
          100% { transform:translateY(580px); opacity:0; }
        }
        @keyframes pr-fade-up {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes pr-ticker {
          0%,100% { opacity:0.25; }
          50%      { opacity:1;    }
        }
        @keyframes pr-particle {
          0%   { opacity:0;    transform:translateY(0)     scale(0.8); }
          20%  { opacity:0.15; }
          80%  { opacity:0.15; }
          100% { opacity:0;    transform:translateY(-80px) scale(1.1); }
        }
      `}</style>

      {/* ── Animated grid ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(201,162,39,0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(201,162,39,0.055) 1px, transparent 1px)
        `,
        backgroundSize: '52px 52px',
        animation: 'pr-grid-fade 5s ease-in-out infinite',
      }}/>

      {/* ── Gold ambient glow ── */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 520, height: 520, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(201,162,39,0.1) 0%, transparent 65%)',
        filter: 'blur(48px)', pointerEvents: 'none',
        animation: 'pr-glow-breathe 4s ease-in-out infinite',
      }}/>

      {/* ── Horizontal scan line ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 1.5,
        background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.3) 35%, rgba(201,162,39,0.55) 50%, rgba(201,162,39,0.3) 65%, transparent)',
        pointerEvents: 'none',
        animation: 'pr-scan 5s cubic-bezier(0.4,0,0.6,1) infinite',
      }}/>

      {/* ── Floating geometric particles ── */}
      {['◆','▪','◇','·','◈','▸'].map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${10 + (i * 16) % 78}%`,
          bottom: `${15 + (i * 11) % 30}%`,
          fontSize: 8 + (i % 3) * 5,
          color: `rgba(201,162,39,${0.05 + (i % 3) * 0.03})`,
          fontWeight: 900, pointerEvents: 'none', userSelect: 'none',
          animation: `pr-particle ${5 + i * 0.7}s ease-out infinite ${i * 0.8}s`,
        }}>{s}</div>
      ))}

      {/* ── Main card ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        background: 'linear-gradient(160deg, rgba(14,11,4,0.97) 0%, rgba(7,5,2,0.99) 100%)',
        border: '1px solid rgba(201,162,39,0.18)',
        borderRadius: 24,
        padding: '48px 44px 44px',
        width: '88vw', maxWidth: 360,
        textAlign: 'center',
        boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,162,39,0.05), inset 0 1px 0 rgba(201,162,39,0.08)',
        animation: 'pr-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
      }}>

        {/* Corner brackets — precision engineering aesthetic */}
        {[
          { top:10, left:10,   borderTop:'1.5px solid', borderLeft:'1.5px solid'   },
          { top:10, right:10,  borderTop:'1.5px solid', borderRight:'1.5px solid'  },
          { bottom:10, left:10,  borderBottom:'1.5px solid', borderLeft:'1.5px solid'  },
          { bottom:10, right:10, borderBottom:'1.5px solid', borderRight:'1.5px solid' },
        ].map((s, i) => (
          <div key={i} style={{
            position: 'absolute', width: 14, height: 14,
            borderColor: 'rgba(201,162,39,0.3)', ...s,
          }}/>
        ))}

        {/* ── Orbital ring system with BA monogram ── */}
        <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto 34px' }}>

          {/* Outer ring — slow CW */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 106, height: 106, borderRadius: '50%',
            border: '1px solid rgba(201,162,39,0.1)',
            borderTopColor: 'rgba(201,162,39,0.65)',
            borderRightColor: 'rgba(201,162,39,0.2)',
            animation: 'pr-ring-cw 3s linear infinite',
          }}/>

          {/* Mid ring — medium CCW */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 78, height: 78, borderRadius: '50%',
            border: '1px solid rgba(201,162,39,0.07)',
            borderBottomColor: 'rgba(201,162,39,0.5)',
            borderLeftColor: 'rgba(201,162,39,0.18)',
            animation: 'pr-ring-ccw 2s linear infinite',
          }}/>

          {/* Inner ring — fast CW */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 52, height: 52, borderRadius: '50%',
            border: '1px solid rgba(201,162,39,0.05)',
            borderTopColor: 'rgba(201,162,39,0.32)',
            animation: 'pr-ring-cw 1.3s linear infinite',
          }}/>

          {/* Center — BA monogram pulsing */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            animation: 'pr-core-pulse 2.5s ease-in-out infinite',
            width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 900,
              color: '#C9A227',
              letterSpacing: '0.06em',
              fontFamily: "'DM Sans', sans-serif",
              userSelect: 'none',
            }}>BA</span>
          </div>
        </div>

        {/* Brand label */}
        <p style={{
          margin: '0 0 4px', fontSize: 10, fontWeight: 700,
          color: 'rgba(201,162,39,0.45)',
          letterSpacing: '0.24em', textTransform: 'uppercase',
        }}>Branding Architect</p>

        {/* Product name */}
        <h2 style={{
          margin: '0 0 30px', color: '#ffffff',
          fontSize: 22, fontWeight: 900,
          fontFamily: "'Playfair Display', serif",
          letterSpacing: '-0.01em', lineHeight: 1.2,
        }}>Your Smart OS</h2>

        {/* Live step text */}
        <div style={{
          height: 24, marginBottom: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
            background: '#C9A227', flexShrink: 0,
            animation: 'pr-ticker 0.9s ease-in-out infinite',
          }}/>
          <span
            key={currentStep}
            style={{
              fontSize: 11.5, fontWeight: 600,
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.04em',
              animation: 'pr-step-in 0.3s ease both',
            }}
          >{steps[currentStep]}…</span>
        </div>

        {/* Progress bar — real value driven */}
        <div style={{
          height: 2, background: 'rgba(255,255,255,0.05)',
          borderRadius: 99, overflow: 'hidden', marginBottom: 26,
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg, #7a5510, #C9A227, #E8C547)',
            borderRadius: 99, transition: 'width 0.28s ease',
            boxShadow: '0 0 10px rgba(201,162,39,0.55)',
          }}/>
        </div>

        {/* Sequential dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%', background: '#C9A227',
              animation: `pr-dot-seq 1.2s ease-in-out infinite ${i * 0.22}s`,
            }}/>
          ))}
        </div>
      </div>

      {/* Bottom tag */}
      <p style={{
        marginTop: 28, fontSize: 10, fontWeight: 600,
        color: 'rgba(255,255,255,0.1)',
        letterSpacing: '0.2em', textTransform: 'uppercase',
        zIndex: 10, position: 'relative', userSelect: 'none',
        animation: 'pr-fade-up 0.5s ease both 0.6s', opacity: 0,
      }}>Secure · Encrypted · Live</p>

    </div>
  );
};

// ── ProtectedRoute — LOGIC 100% UNCHANGED ────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return <WorkspaceLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
