import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ── Restaurant & Café Management OS — Premium Loading Screen ─────────────────
const WorkspaceLoadingScreen = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress,    setProgress   ] = useState(0);
  const [tick,        setTick       ] = useState(0);

  const steps = [
    'Authenticating session',
    'Loading your restaurant',
    'Syncing kitchen data',
    'Preparing your workspace',
  ];

  useEffect(() => {
    const t = setInterval(() => setCurrentStep(s => (s + 1) % steps.length), 1800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setProgress(p => p >= 85 ? p : p + (85 - p) * 0.04);
    }, 80);
    return () => clearInterval(t);
  }, []);

  // Tick for steam animation
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080604',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@500;600;700&display=swap');

        /* Background texture — subtle warm noise */
        @keyframes rc-noise-drift {
          0%   { transform: translate(0,0);       }
          25%  { transform: translate(-4px, 2px); }
          50%  { transform: translate(2px, -3px); }
          75%  { transform: translate(-2px, 4px); }
          100% { transform: translate(0,0);       }
        }
        @keyframes rc-vignette-pulse {
          0%,100% { opacity: 0.72; }
          50%      { opacity: 0.88; }
        }
        @keyframes rc-fade-up {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        @keyframes rc-fade-up-sm {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes rc-step-swap {
          from { opacity:0; transform:translateY(4px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes rc-ticker {
          0%,100% { opacity: 0.3; }
          50%      { opacity: 1;   }
        }
        @keyframes rc-dot-seq {
          0%,100% { opacity:0.18; transform:scaleY(0.5); }
          50%      { opacity:1;    transform:scaleY(1);   }
        }
        @keyframes rc-bar-glow {
          0%,100% { box-shadow: 0 0 8px rgba(201,162,39,0.4); }
          50%      { box-shadow: 0 0 18px rgba(201,162,39,0.7); }
        }
        @keyframes rc-steam {
          0%   { opacity:0;    transform:translateY(0) scaleX(1); }
          15%  { opacity:0.55; }
          70%  { opacity:0.2;  }
          100% { opacity:0;    transform:translateY(-36px) scaleX(1.6); }
        }
        @keyframes rc-plate-spin {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }
        @keyframes rc-plate-ccw {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(-360deg); }
        }
        @keyframes rc-cloche-bob {
          0%,100% { transform:translate(-50%,-50%) translateY(0); }
          50%      { transform:translate(-50%,-50%) translateY(-3px); }
        }
        @keyframes rc-glow-pulse {
          0%,100% { opacity:0.08; transform:translate(-50%,-50%) scale(1); }
          50%      { opacity:0.18; transform:translate(-50%,-50%) scale(1.1); }
        }
        @keyframes rc-scan {
          0%   { top:0;     opacity:0; }
          3%   { opacity:1; }
          97%  { opacity:1; }
          100% { top:100%;  opacity:0; }
        }
        @keyframes rc-corner-in {
          from { opacity:0; transform:scale(0.6); }
          to   { opacity:1; transform:scale(1);   }
        }
        @keyframes rc-tag-in {
          from { opacity:0; }
          to   { opacity:1; }
        }
      `}</style>

      {/* ── Fine diagonal hatching background ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 28px,
          rgba(201,162,39,0.018) 28px,
          rgba(201,162,39,0.018) 29px
        )`,
      }}/>

      {/* ── Warm radial glow behind card ── */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(180,110,20,0.12) 0%, rgba(201,162,39,0.04) 40%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none',
        animation: 'rc-glow-pulse 4s ease-in-out infinite',
      }}/>

      {/* ── Top-edge scan line ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(201,162,39,0.22) 30%,rgba(201,162,39,0.5) 50%,rgba(201,162,39,0.22) 70%,transparent)',
        pointerEvents: 'none',
        animation: 'rc-scan 6s cubic-bezier(0.4,0,0.6,1) infinite',
      }}/>

      {/* ── Main card ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        background: 'linear-gradient(170deg, #110e08 0%, #0c0a05 60%, #080604 100%)',
        border: '1px solid rgba(201,162,39,0.2)',
        borderRadius: 20,
        padding: '44px 40px 40px',
        width: '88vw', maxWidth: 360,
        textAlign: 'center',
        boxShadow: [
          '0 48px 120px rgba(0,0,0,0.88)',
          '0 0 0 1px rgba(201,162,39,0.06)',
          'inset 0 1px 0 rgba(201,162,39,0.1)',
          'inset 0 -1px 0 rgba(0,0,0,0.5)',
        ].join(','),
        animation: 'rc-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both',
      }}>

        {/* Precision corner marks */}
        {[
          { top:10,    left:10,    borderTop:'1.5px solid',    borderLeft:'1.5px solid'    },
          { top:10,    right:10,   borderTop:'1.5px solid',    borderRight:'1.5px solid'   },
          { bottom:10, left:10,    borderBottom:'1.5px solid', borderLeft:'1.5px solid'    },
          { bottom:10, right:10,   borderBottom:'1.5px solid', borderRight:'1.5px solid'   },
        ].map((s, i) => (
          <div key={i} style={{
            position:'absolute', width:12, height:12,
            borderColor:'rgba(201,162,39,0.28)',
            animation:`rc-corner-in 0.4s ease both ${0.3 + i*0.07}s`,
            ...s,
          }}/>
        ))}

        {/* ────────────────────────────────────────────────────────────────────
            ICON: Plate-and-cloche with orbiting dashes — restaurant emblem
        ──────────────────────────────────────────────────────────────────── */}
        <div style={{ position:'relative', width:96, height:96, margin:'0 auto 32px' }}>

          {/* Outer orbit — slow CW dashes */}
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            width:92, height:92, borderRadius:'50%',
            border:'1px dashed rgba(201,162,39,0.15)',
            borderTopColor:'rgba(201,162,39,0.55)',
            animation:'rc-plate-spin 4s linear infinite',
          }}/>

          {/* Mid orbit — CCW solid thin */}
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            width:66, height:66, borderRadius:'50%',
            border:'1px solid rgba(201,162,39,0.07)',
            borderBottomColor:'rgba(201,162,39,0.42)',
            borderLeftColor:'rgba(201,162,39,0.18)',
            animation:'rc-plate-ccw 2.4s linear infinite',
          }}/>

          {/* Inner plate disc */}
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            transform:'translate(-50%,-50%)',
            width:44, height:44, borderRadius:'50%',
            background:'radial-gradient(circle, rgba(201,162,39,0.08) 0%, transparent 70%)',
            border:'1px solid rgba(201,162,39,0.22)',
            display:'flex', alignItems:'center', justifyContent:'center',
            animation:'rc-cloche-bob 3s ease-in-out infinite',
          }}>
            {/* Fork & knife SVG — minimal, professional */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              {/* Fork */}
              <path d="M7 2v4c0 1.1.9 2 2 2v7a1 1 0 002 0V8c1.1 0 2-.9 2-2V2" stroke="rgba(201,162,39,0.85)" strokeWidth="1.3" strokeLinecap="round"/>
              <line x1="8" y1="2" x2="8" y2="5" stroke="rgba(201,162,39,0.55)" strokeWidth="1.1" strokeLinecap="round"/>
              <line x1="10" y1="2" x2="10" y2="5" stroke="rgba(201,162,39,0.55)" strokeWidth="1.1" strokeLinecap="round"/>
              <line x1="12" y1="2" x2="12" y2="5" stroke="rgba(201,162,39,0.55)" strokeWidth="1.1" strokeLinecap="round"/>
              {/* Knife */}
              <path d="M15.5 2c0 0 1.5 2 1.5 5s-1.5 5-1.5 5v5a1 1 0 01-2 0V2" stroke="rgba(201,162,39,0.85)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Steam wisps above the icon */}
          {[0,1,2].map(i => (
            <div key={i} style={{
              position:'absolute',
              left:`${38 + i*8}%`,
              top:'4%',
              width:2,
              height:10,
              borderRadius:4,
              background:'rgba(201,162,39,0.35)',
              filter:'blur(1.5px)',
              animation:`rc-steam ${1.6 + i*0.35}s ease-out infinite ${i*0.5}s`,
            }}/>
          ))}
        </div>

        {/* Wordmark */}
        <p style={{
          margin:'0 0 3px', fontSize:9, fontWeight:700,
          color:'rgba(201,162,39,0.4)',
          letterSpacing:'0.26em', textTransform:'uppercase',
          animation:'rc-fade-up-sm 0.4s ease both 0.25s', opacity:0,
        }}>Restaurant & Café</p>

        <h2 style={{
          margin:'0 0 28px',
          color:'#f5ead4',
          fontSize:21, fontWeight:700,
          fontFamily:"'Cormorant Garamond', Georgia, serif",
          letterSpacing:'0.02em', lineHeight:1.25,
          animation:'rc-fade-up-sm 0.4s ease both 0.35s', opacity:0,
        }}>Management Suite</h2>

        {/* Live step indicator */}
        <div style={{
          height:22, marginBottom:16,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          animation:'rc-fade-up-sm 0.4s ease both 0.45s', opacity:0,
        }}>
          <span style={{
            display:'inline-block', width:4, height:4, borderRadius:'50%',
            background:'#C9A227', flexShrink:0,
            animation:'rc-ticker 0.9s ease-in-out infinite',
          }}/>
          <span
            key={currentStep}
            style={{
              fontSize:11, fontWeight:600,
              color:'rgba(255,255,255,0.35)',
              letterSpacing:'0.05em',
              animation:'rc-step-swap 0.25s ease both',
            }}
          >{steps[currentStep]}…</span>
        </div>

        {/* Progress bar */}
        <div style={{
          height:2,
          background:'rgba(255,255,255,0.06)',
          borderRadius:99, overflow:'hidden', marginBottom:24,
          animation:'rc-fade-up-sm 0.4s ease both 0.5s', opacity:0,
        }}>
          <div style={{
            height:'100%', width:`${progress}%`,
            background:'linear-gradient(90deg,#5a3a08,#C9A227,#EDD270)',
            borderRadius:99,
            transition:'width 0.28s ease',
            animation:'rc-bar-glow 2s ease-in-out infinite',
          }}/>
        </div>

        {/* Pulse bars — more refined than dots */}
        <div style={{
          display:'flex', justifyContent:'center', gap:4,
          animation:'rc-fade-up-sm 0.4s ease both 0.55s', opacity:0,
        }}>
          {[0,1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              width:3, height:14, borderRadius:2,
              background:'rgba(201,162,39,0.6)',
              animation:`rc-dot-seq ${0.9 + (i%3)*0.15}s ease-in-out infinite ${i*0.1}s`,
            }}/>
          ))}
        </div>
      </div>

      {/* Bottom system tag */}
      <p style={{
        marginTop:24, fontSize:9, fontWeight:600,
        color:'rgba(255,255,255,0.08)',
        letterSpacing:'0.22em', textTransform:'uppercase',
        zIndex:10, position:'relative', userSelect:'none',
        animation:'rc-tag-in 0.6s ease both 0.8s', opacity:0,
      }}>Secure · Real-time · Encrypted</p>
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
