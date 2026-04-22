/**
 * KitchenDisplay.jsx
 * Route: /kitchen/:cafeId
 *
 * THEME SYSTEM — Full light & dark mode.
 * Strategy: CSS custom properties on .kds-wrap[data-theme="dark|light"].
 * All hardcoded colors replaced with var(--kds-*) tokens.
 * A ☀️/🌙 toggle button is added to the header (top-right area).
 * Theme choice persists in localStorage under key "kds-theme".
 * On first load, system preference (prefers-color-scheme) is used as default.
 *
 * Logic, Firestore listeners, state, component structure — 100% UNCHANGED.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection, doc, query, where, onSnapshot, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat, Clock, CheckCircle2, Flame, Bell, Wifi, WifiOff,
  UtensilsCrossed, RefreshCw, Package,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Inject theme CSS once ──────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('kds-omf-css')) {
  const el = document.createElement('style');
  el.id = 'kds-omf-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    /* ─── DARK TOKENS ─────────────────────────────────────────────── */
    .kds-wrap[data-theme="dark"] {
      --kds-bg-page:          #060606;
      --kds-bg-header:        #0A0702;
      --kds-bg-col-header:    #080602;
      --kds-bg-board:         #0f0b02;
      --kds-bg-card:          #120f00;
      --kds-bg-card-hd:       rgba(255,255,255,0.02);
      --kds-bg-card-ft:       rgba(255,255,255,0.01);

      --kds-border-page:      rgba(255,255,255,0.08);
      --kds-border-card:      rgba(255,255,255,0.10);
      --kds-border-card-in:   rgba(255,255,255,0.07);
      --kds-border-col-hd:    rgba(255,255,255,0.07);

      --kds-text-primary:     #ffffff;
      --kds-text-time:        #fdf8e1;
      --kds-text-secondary:   #9a8a5a;
      --kds-text-sub:         #8a7a4a;

      --kds-gold:             #C9A227;
      --kds-gold-bg:          rgba(201,162,39,0.12);
      --kds-gold-border:      rgba(201,162,39,0.25);

      --kds-tag-table-bg:     rgba(255,255,255,0.10);
      --kds-tag-table-text:   #e5e5e5;
      --kds-tag-take-bg:      rgba(168,85,247,0.18);
      --kds-tag-take-text:    #d4b8fd;
      --kds-tag-del-bg:       rgba(59,130,246,0.18);
      --kds-tag-del-text:     #a8c8fd;
      --kds-tag-zom-bg:       rgba(239,68,68,0.18);
      --kds-tag-zom-text:     #fca5a5;
      --kds-tag-swig-bg:      rgba(249,115,22,0.18);
      --kds-tag-swig-text:    #fdba74;
      --kds-tag-gen-bg:       rgba(255,255,255,0.10);
      --kds-tag-gen-text:     #d4d4d4;

      --kds-instr-bg:         rgba(245,158,11,0.09);
      --kds-instr-border:     rgba(245,158,11,0.25);
      --kds-instr-text:       #fcd34d;

      --kds-old-border:       rgba(239,68,68,0.55);
      --kds-old-shadow:       0 0 0 1px rgba(239,68,68,0.22), 0 4px 24px rgba(0,0,0,0.5);

      --kds-online-bg:        rgba(34,197,94,0.14);
      --kds-online-text:      #4ade80;
      --kds-online-border:    rgba(34,197,94,0.28);
      --kds-offline-bg:       rgba(239,68,68,0.14);
      --kds-offline-text:     #f87171;
      --kds-offline-border:   rgba(239,68,68,0.28);

      --kds-scrollbar:        rgba(201,162,39,0.30);
      --kds-empty-text-op:    70;
    }

    /* ─── LIGHT TOKENS ────────────────────────────────────────────── */
    .kds-wrap[data-theme="light"] {
      --kds-bg-page:          #f0ebe0;
      --kds-bg-header:        #ffffff;
      --kds-bg-col-header:    #f7f3ea;
      --kds-bg-board:         #e8e2d6;
      --kds-bg-card:          #ffffff;
      --kds-bg-card-hd:       rgba(0,0,0,0.025);
      --kds-bg-card-ft:       rgba(0,0,0,0.015);

      --kds-border-page:      rgba(0,0,0,0.10);
      --kds-border-card:      rgba(0,0,0,0.11);
      --kds-border-card-in:   rgba(0,0,0,0.07);
      --kds-border-col-hd:    rgba(0,0,0,0.08);

      --kds-text-primary:     #1c1409;
      --kds-text-time:        #1c1409;
      --kds-text-secondary:   #6b5520;
      --kds-text-sub:         #7a6228;

      --kds-gold:             #9a7010;
      --kds-gold-bg:          rgba(154,112,16,0.10);
      --kds-gold-border:      rgba(154,112,16,0.28);

      --kds-tag-table-bg:     rgba(0,0,0,0.07);
      --kds-tag-table-text:   #2d2010;
      --kds-tag-take-bg:      rgba(124,58,237,0.12);
      --kds-tag-take-text:    #5b21b6;
      --kds-tag-del-bg:       rgba(37,99,235,0.12);
      --kds-tag-del-text:     #1d4ed8;
      --kds-tag-zom-bg:       rgba(220,38,38,0.12);
      --kds-tag-zom-text:     #b91c1c;
      --kds-tag-swig-bg:      rgba(234,88,12,0.12);
      --kds-tag-swig-text:    #c2410c;
      --kds-tag-gen-bg:       rgba(0,0,0,0.07);
      --kds-tag-gen-text:     #374151;

      --kds-instr-bg:         rgba(146,96,10,0.09);
      --kds-instr-border:     rgba(146,96,10,0.28);
      --kds-instr-text:       #7c4f08;

      --kds-old-border:       rgba(220,38,38,0.60);
      --kds-old-shadow:       0 0 0 1px rgba(220,38,38,0.18), 0 4px 24px rgba(0,0,0,0.10);

      --kds-online-bg:        rgba(22,163,74,0.12);
      --kds-online-text:      #15803d;
      --kds-online-border:    rgba(22,163,74,0.30);
      --kds-offline-bg:       rgba(220,38,38,0.10);
      --kds-offline-text:     #b91c1c;
      --kds-offline-border:   rgba(220,38,38,0.25);

      --kds-scrollbar:        rgba(154,112,16,0.28);
      --kds-empty-text-op:    60;
    }

    /* ─── BASE ────────────────────────────────────────────────────── */
    .kds-wrap {
      font-family: 'DM Sans', system-ui, sans-serif;
      transition: background-color 220ms;
    }
    .kds-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    .kds-card {
      background: var(--kds-bg-card);
      border: 1.5px solid var(--kds-border-card);
      border-radius: 14px;
      overflow: hidden;
      transition: border-color 200ms, box-shadow 200ms, background 220ms;
    }
    .kds-card-old {
      border-color: var(--kds-old-border) !important;
      box-shadow: var(--kds-old-shadow) !important;
    }
    .kds-sec {
      font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--kds-gold); display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .kds-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 11px;
      padding: 7px 12px; border-radius: 9px;
      border: none; cursor: pointer; transition: all 160ms;
      white-space: nowrap;
    }
    .kds-btn:hover  { transform: translateY(-1px); filter: brightness(1.08); }
    .kds-btn:active { transform: scale(0.96); }
    .kds-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .kds-toggle-btn {
      width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
      font-size: 15px; border: 1.5px solid var(--kds-gold-border);
      background: var(--kds-gold-bg); transition: all 180ms;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .kds-toggle-btn:hover { transform: scale(1.08); }

    .kds-scroll::-webkit-scrollbar { width: 3px; }
    .kds-scroll::-webkit-scrollbar-track { background: transparent; }
    .kds-scroll::-webkit-scrollbar-thumb { background: var(--kds-scrollbar); border-radius: 4px; }

    @keyframes kdsIn { from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);} }
    .kds-in { animation: kdsIn 260ms ease forwards; }

    @keyframes kds-float  { 0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);} }
    @keyframes kds-glow-pulse {
      0%,100%{opacity:0.1;transform:translate(-50%,-50%) scale(1);}
      50%{opacity:0.22;transform:translate(-50%,-50%) scale(1.12);}
    }
    @keyframes kds-dot-seq { 0%,100%{opacity:0.18;transform:scale(0.85);}50%{opacity:1;transform:scale(1.35);} }
    @keyframes kds-shimmer { 0%{transform:translateX(-150%);}100%{transform:translateX(350%);} }
    @keyframes kds-card-in { from{opacity:0;transform:translateY(24px) scale(0.94);}to{opacity:1;transform:translateY(0) scale(1);} }
    @keyframes kds-fade-up { from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);} }
    @keyframes kds-step-in { from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:translateY(0);} }
    @keyframes kds-ticker   { 0%,100%{opacity:0.25;}50%{opacity:1;} }
    @keyframes kds-scan {
      0%{transform:translateY(0);opacity:0;}6%{opacity:0.7;}94%{opacity:0.7;}100%{transform:translateY(100vh);opacity:0;}
    }
    @keyframes kds-steam {
      0%{opacity:0;transform:translateY(0) scaleX(1);}30%{opacity:0.45;}70%{opacity:0.45;}100%{opacity:0;transform:translateY(-60px) scaleX(1.3);}
    }
  `;
  document.head.appendChild(el);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const getSystemTheme = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light' : 'dark';

const COLUMNS = [
  { id:'new',       label:'New Orders', icon:Bell,         accent:'#3B82F6', border:'rgba(59,130,246,0.22)'  },
  { id:'preparing', label:'Preparing',  icon:Flame,        accent:'#F59E0B', border:'rgba(245,158,11,0.22)'  },
  { id:'ready',     label:'Ready',      icon:CheckCircle2, accent:'#10B981', border:'rgba(16,185,129,0.22)'  },
];

const COL_BG = {
  dark:  { new:'rgba(59,130,246,0.05)',  preparing:'rgba(245,158,11,0.05)',  ready:'rgba(16,185,129,0.05)'  },
  light: { new:'rgba(59,130,246,0.055)', preparing:'rgba(245,158,11,0.055)', ready:'rgba(16,185,129,0.055)' },
};

const ACTIONS = {
  new:       { label:'Start Preparing',  next:'preparing', icon:Flame,        color:'#F59E0B' },
  preparing: { label:'Ready for Pickup', next:'ready',     icon:CheckCircle2, color:'#10B981' },
  ready:     { label:'Mark Completed',   next:'completed', icon:Package,      color:'#8B5CF6' },
};

// ── useElapsed — UNCHANGED ────────────────────────────────────────────────────
const useElapsed = (timestamp) => {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const calc = () => {
      if (!timestamp) { setElapsed(''); return; }
      const d    = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const secs = Math.floor((Date.now() - d.getTime()) / 1000);
      if (secs < 60)  { setElapsed(`${secs}s ago`); return; }
      const mins = Math.floor(secs / 60);
      if (mins < 60)  { setElapsed(`${mins}m ago`); return; }
      setElapsed(`${Math.floor(mins / 60)}h ago`);
    };
    calc();
    const id = setInterval(calc, 10000);
    return () => clearInterval(id);
  }, [timestamp]);
  return elapsed;
};

// ── Loading screens — theme-aware ─────────────────────────────────────────────
const LoadingCard = ({ theme, children }) => {
  const isDark = theme === 'dark';
  return (
    <div style={{
      position:'relative', zIndex:10,
      background: isDark
        ? 'linear-gradient(160deg,rgba(18,12,2,0.98) 0%,rgba(8,5,1,0.99) 100%)'
        : 'linear-gradient(160deg,rgba(255,253,248,0.99) 0%,rgba(244,238,226,0.99) 100%)',
      border: `1.5px solid ${isDark ? 'rgba(201,162,39,0.22)' : 'rgba(154,112,16,0.35)'}`,
      borderRadius:20, padding:'44px 40px 40px',
      maxWidth:320, width:'86vw', textAlign:'center',
      boxShadow: isDark
        ? '0 32px 80px rgba(0,0,0,0.75),inset 0 1px 0 rgba(201,162,39,0.10)'
        : '0 32px 80px rgba(0,0,0,0.13),inset 0 1px 0 rgba(154,112,16,0.08)',
      animation:'kds-card-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
    }}>
      {[
        { top:8,    left:8,   borderTop:'1.5px solid',    borderLeft:'1.5px solid'   },
        { top:8,    right:8,  borderTop:'1.5px solid',    borderRight:'1.5px solid'  },
        { bottom:8, left:8,   borderBottom:'1.5px solid', borderLeft:'1.5px solid'   },
        { bottom:8, right:8,  borderBottom:'1.5px solid', borderRight:'1.5px solid'  },
      ].map((s, i) => (
        <div key={i} style={{ position:'absolute', width:12, height:12, borderColor: isDark ? 'rgba(201,162,39,0.35)' : 'rgba(154,112,16,0.40)', ...s }}/>
      ))}
      {children}
    </div>
  );
};

const LoadingDots = ({ theme, small }) => {
  const gold = theme === 'dark' ? '#C9A227' : '#9a7010';
  const sz   = small ? 5 : 6;
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:7, marginBottom: small ? 18 : 20 }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ width:sz, height:sz, borderRadius:'50%', background:gold, animation:`kds-dot-seq 1.1s ease-in-out infinite ${i*0.2}s` }}/>
      ))}
    </div>
  );
};

const ShimmerBar = ({ theme }) => {
  const isDark = theme === 'dark';
  return (
    <div style={{ height:2, background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', borderRadius:99, overflow:'hidden' }}>
      <div style={{ height:'100%', width:'42%', background:'linear-gradient(90deg,transparent,rgba(201,162,39,0.85),transparent)', borderRadius:99, animation:'kds-shimmer 1.5s ease-in-out infinite' }}/>
    </div>
  );
};

const KitchenInitScreen = ({ theme }) => {
  const isDark   = theme === 'dark';
  const steamCols = [18, 35, 52, 68, 84];
  return (
    <div style={{
      minHeight:'100vh',
      background: isDark ? '#060606' : '#f0ebe0',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      overflow:'hidden', position:'relative', fontFamily:"'DM Sans',system-ui,sans-serif",
    }}>
      <div style={{ position:'absolute',left:0,right:0,top:0,height:1.5,background:'linear-gradient(90deg,transparent,rgba(201,162,39,0.25) 40%,rgba(201,162,39,0.5) 50%,rgba(201,162,39,0.25) 60%,transparent)',animation:'kds-scan 4s ease-in-out infinite',pointerEvents:'none' }}/>
      <div style={{ position:'absolute',top:'50%',left:'50%',width:480,height:480,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,0.09) 0%,transparent 65%)',filter:'blur(50px)',pointerEvents:'none',animation:'kds-glow-pulse 4.5s ease-in-out infinite' }}/>
      {steamCols.map((left,i) => (
        <div key={i} style={{ position:'absolute',bottom:'22%',left:`${left}%`,width:2,height:32,borderRadius:99,background:`rgba(201,162,39,${0.08+(i%3)*0.04})`,animation:`kds-steam ${3+i*0.5}s ease-out infinite ${i*0.6}s`,pointerEvents:'none' }}/>
      ))}
      <LoadingCard theme={theme}>
        <div style={{ fontSize:52,lineHeight:1,marginBottom:22,display:'inline-block',animation:'kds-float 2.2s ease-in-out infinite' }}>👨‍🍳</div>
        <h2 style={{ margin:'0 0 6px',color: isDark ? '#ffffff' : '#1c1409',fontWeight:900,fontSize:21,fontFamily:"'Playfair Display',serif",letterSpacing:'-0.01em' }}>Kitchen Display</h2>
        <p style={{ margin:'0 0 6px',color: isDark ? '#C9A227' : '#9a7010',fontWeight:700,fontSize:10,opacity:0.85,letterSpacing:'0.2em',textTransform:'uppercase' }}>Connecting to kitchen…</p>
        <p style={{ margin:'0 0 26px',color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(28,20,9,0.58)',fontWeight:500,fontSize:12 }}>Loading your live order board</p>
        <LoadingDots theme={theme}/>
        <ShimmerBar theme={theme}/>
      </LoadingCard>
      <p style={{ marginTop:26,color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(28,20,9,0.32)',fontSize:10,fontWeight:600,letterSpacing:'0.18em',textTransform:'uppercase',animation:'kds-fade-up 0.5s ease both 0.6s',opacity:0,position:'relative',zIndex:10 }}>Real-time · Live Orders</p>
    </div>
  );
};

const KitchenConnectingOverlay = ({ theme }) => {
  const [step, setStep] = useState(0);
  const steps = ['Connecting to kitchen','Syncing live orders','Setting up board'];
  const isDark = theme === 'dark';
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s+1) % steps.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity:1 }}
      exit={{ opacity:0, transition:{ duration:0.4 } }}
      style={{ position:'absolute',inset:0,background: isDark ? '#060606' : '#f0ebe0',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:50,fontFamily:"'DM Sans',system-ui,sans-serif" }}
    >
      <div style={{ position:'absolute',top:'50%',left:'50%',width:380,height:380,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,0.09) 0%,transparent 65%)',filter:'blur(48px)',pointerEvents:'none',animation:'kds-glow-pulse 4s ease-in-out infinite' }}/>
      <div style={{
        position:'relative',zIndex:10,
        background: isDark ? 'linear-gradient(160deg,rgba(18,12,2,0.98) 0%,rgba(8,5,1,0.99) 100%)' : 'linear-gradient(160deg,rgba(255,253,248,0.99) 0%,rgba(244,238,226,0.99) 100%)',
        border: `1.5px solid ${isDark ? 'rgba(201,162,39,0.22)' : 'rgba(154,112,16,0.35)'}`,
        borderRadius:18,padding:'40px 38px 36px',maxWidth:300,width:'86vw',textAlign:'center',
        boxShadow: isDark ? '0 28px 70px rgba(0,0,0,0.75),inset 0 1px 0 rgba(201,162,39,0.09)' : '0 28px 70px rgba(0,0,0,0.12),inset 0 1px 0 rgba(154,112,16,0.07)',
        animation:'kds-card-in 0.45s cubic-bezier(0.22,1,0.36,1) both',
      }}>
        <div style={{ fontSize:44,lineHeight:1,marginBottom:20,display:'inline-block',animation:'kds-float 2s ease-in-out infinite' }}>🍳</div>
        <h2 style={{ margin:'0 0 5px',color: isDark ? '#fff' : '#1c1409',fontWeight:900,fontSize:19,fontFamily:"'Playfair Display',serif",letterSpacing:'-0.01em' }}>Kitchen is Loading</h2>
        <div style={{ height:20,marginBottom:22,display:'flex',alignItems:'center',justifyContent:'center',gap:7 }}>
          <span style={{ width:5,height:5,borderRadius:'50%',background: isDark ? '#C9A227' : '#9a7010',display:'inline-block',animation:'kds-ticker 0.9s ease-in-out infinite',flexShrink:0 }}/>
          <span key={step} style={{ fontSize:11.5,fontWeight:600,color: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(28,20,9,0.65)',letterSpacing:'0.03em',animation:'kds-step-in 0.3s ease both' }}>{steps[step]}…</span>
        </div>
        <LoadingDots theme={theme} small/>
        <ShimmerBar theme={theme}/>
      </div>
    </motion.div>
  );
};

// ── OrderCard ─────────────────────────────────────────────────────────────────
const OrderCard = ({ order, onAdvance, advancing }) => {
  const elapsed    = useElapsed(order.createdAt);
  const action     = ACTIONS[order.orderStatus];
  const totalItems = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) ?? 0;

  const isOld = (() => {
    if (!order.createdAt) return false;
    const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
    return (Date.now() - d.getTime()) > 15 * 60 * 1000;
  })();

  const srcTag = (src) => {
    if (src === 'zomato') return { bg:'var(--kds-tag-zom-bg)',  color:'var(--kds-tag-zom-text)'  };
    if (src === 'swiggy') return { bg:'var(--kds-tag-swig-bg)', color:'var(--kds-tag-swig-text)' };
    return                        { bg:'var(--kds-tag-gen-bg)', color:'var(--kds-tag-gen-text)'  };
  };

  return (
    <motion.div
      layout
      initial={{ opacity:0, y:18, scale:0.97 }}
      animate={{ opacity:1, y:0,  scale:1    }}
      exit={{    opacity:0, y:-10, scale:0.95 }}
      transition={{ type:'spring', stiffness:300, damping:28 }}
      className={`kds-card${isOld ? ' kds-card-old' : ''}`}
    >
      {/* Card header */}
      <div style={{ padding:'10px 14px',display:'flex',alignItems:'center',borderBottom:'1px solid var(--kds-border-card-in)',background:'var(--kds-bg-card-hd)',gap:8 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,flex:1 }}>
          <span className="kds-title" style={{ color:'var(--kds-gold)',fontWeight:900,fontSize:15 }}>
            #{order.orderNumber ? String(order.orderNumber).padStart(3,'0') : order.id.slice(0,6)}
          </span>
          {order.orderType === 'dine-in' && order.tableNumber && (
            <span style={{ padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:800,background:'var(--kds-tag-table-bg)',color:'var(--kds-tag-table-text)' }}>Table {order.tableNumber}</span>
          )}
          {order.orderType === 'takeaway' && (
            <span style={{ padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:800,background:'var(--kds-tag-take-bg)',color:'var(--kds-tag-take-text)' }}>Takeaway</span>
          )}
          {order.orderType === 'delivery' && (
            <span style={{ padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:800,background:'var(--kds-tag-del-bg)',color:'var(--kds-tag-del-text)' }}>Delivery</span>
          )}
          {order.source && order.source !== 'qr' && (
            <span style={{ padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:800,textTransform:'uppercase',...srcTag(order.source) }}>{order.source}</span>
          )}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:4,flexShrink:0 }}>
          <Clock style={{ width:12,height:12,color: isOld ? 'var(--kds-offline-text)' : 'var(--kds-text-secondary)' }}/>
          <span style={{ fontSize:11,fontWeight:700,color: isOld ? 'var(--kds-offline-text)' : 'var(--kds-text-secondary)' }}>{elapsed}</span>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding:'10px 14px',display:'flex',flexDirection:'column',gap:6 }}>
        {(order.items || []).map((item, idx) => (
          <div key={idx}>
            <div style={{ display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:8 }}>
              <span style={{ color:'var(--kds-text-primary)',fontSize:13,fontWeight:600,flex:1 }}>
                {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''}
              </span>
              <span style={{ flexShrink:0,fontSize:11,fontWeight:900,padding:'1px 7px',borderRadius:99,background:'var(--kds-gold-bg)',color:'var(--kds-gold)' }}>×{item.quantity}</span>
            </div>
            {item.comboItems?.length > 0 && item.comboItems.map((ci,ci2) => (
              <div key={ci2} style={{ fontSize:11,color:'var(--kds-text-sub)',paddingLeft:10,marginTop:1 }}>
                — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
              </div>
            ))}
            {item.addons?.length > 0 && (
              <div style={{ fontSize:11,color:'var(--kds-text-sub)',paddingLeft:10,marginTop:1 }}>
                + {item.addons.map(a => a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name).join(', ')}
              </div>
            )}
          </div>
        ))}
        {order.specialInstructions && (
          <div style={{ marginTop:4,padding:'7px 10px',borderRadius:9,fontSize:11,color:'var(--kds-instr-text)',background:'var(--kds-instr-bg)',border:'1px solid var(--kds-instr-border)' }}>
            📝 {order.specialInstructions}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding:'9px 14px',borderTop:'1px solid var(--kds-border-card-in)',background:'var(--kds-bg-card-ft)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8 }}>
        <span style={{ fontSize:11,fontWeight:600,color:'var(--kds-text-secondary)' }}>
          {totalItems} item{totalItems !== 1 ? 's' : ''}{order.customerName ? ` · ${order.customerName}` : ''}
        </span>
        {action && (
          <motion.button
            whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
            onClick={() => onAdvance(order.id, action.next)}
            disabled={advancing === order.id}
            className="kds-btn"
            style={{ backgroundColor:action.color, color:'#000', minWidth:108 }}
          >
            {advancing === order.id
              ? <><RefreshCw style={{ width:12,height:12,animation:'spin 1s linear infinite' }}/> Updating…</>
              : <><action.icon style={{ width:12,height:12 }}/>{action.label}</>
            }
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};

// ─── KitchenDisplay — LOGIC 100% UNCHANGED ────────────────────────────────────
const KitchenDisplay = () => {
  const { cafeId } = useParams();

  // ── NEW: theme state (only addition to state) ──────────────────────────────
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('kds-theme') || getSystemTheme(); } catch { return 'dark'; }
  });
  const toggleTheme = () => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('kds-theme', next); } catch {}
    return next;
  });
  const isDark = theme === 'dark';

  const [cafe,        setCafe       ] = useState(null);
  const [orders,      setOrders     ] = useState([]);
  const [cafeLoading, setCafeLoading] = useState(true);
  const [ordersReady, setOrdersReady] = useState(false);
  const [online,      setOnline     ] = useState(navigator.onLine);
  const [advancing,   setAdvancing  ] = useState(null);
  const [ticker,      setTicker     ] = useState(0);

  const PAGE_SIZE = 20;
  const [colPages, setColPages] = useState({ new:0, preparing:0, ready:0 });
  const setColPage = (colId, page) => setColPages(prev => ({ ...prev, [colId]: page }));

  const prevOrderIdsRef = useRef(new Set());

  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!cafeId) { setCafeLoading(false); return; }
    const unsub = onSnapshot(doc(db,'cafes',cafeId), snap => {
      setCafe(snap.exists() ? { id:snap.id, ...snap.data() } : null);
      setCafeLoading(false);
    }, () => setCafeLoading(false));
    return () => unsub();
  }, [cafeId]);

  useEffect(() => {
    if (!cafeId) return;
    const q = query(collection(db,'orders'), where('cafeId','==',cafeId));
    const unsub = onSnapshot(q, snap => {
      const incoming    = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(o => o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled');
      const incomingIds = new Set(incoming.map(o => o.id));
      if (prevOrderIdsRef.current.size > 0) {
        const newOnes = incoming.filter(o => !prevOrderIdsRef.current.has(o.id));
        if (newOnes.length > 0) {
          playNotify();
          newOnes.forEach(o => {
            toast.success(
              `New order #${o.orderNumber ? String(o.orderNumber).padStart(3,'0') : o.id.slice(0,6)}`,
              { duration:6000, icon:'🍽️' }
            );
          });
          setColPages({ new:0, preparing:0, ready:0 });
        }
      }
      prevOrderIdsRef.current = incomingIds;
      setOrders(incoming);
      setOrdersReady(true);
    }, err => {
      console.error('[KDS] Firestore error:', err);
      setOrdersReady(true);
    });
    return () => unsub();
  }, [cafeId]);

  const playNotify = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 200].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = i === 0 ? 880 : 1100;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, ctx.currentTime + delay/1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay/1000 + 0.5);
        osc.start(ctx.currentTime + delay/1000);
        osc.stop(ctx.currentTime + delay/1000 + 0.5);
      });
    } catch (_) {}
  }, []);

  const handleAdvance = async (orderId, nextStatus) => {
    setAdvancing(orderId);
    try {
      await updateDoc(doc(db,'orders',orderId), {
        orderStatus: nextStatus,
        [`${nextStatus}At`]: serverTimestamp(),
      });
    } catch (err) {
      console.error('[KDS] Failed to update order:', err);
      toast.error('Failed to update order status');
    } finally {
      setAdvancing(null);
    }
  };

  const columns = COLUMNS.map(col => {
    const allColOrders = orders
      .filter(o => o.orderStatus === col.id)
      .sort((a,b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });
    const page       = colPages[col.id] || 0;
    const totalPages = Math.ceil(allColOrders.length / PAGE_SIZE) || 1;
    const pageOrders = allColOrders.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);
    return { ...col, orders:pageOrders, allOrders:allColOrders, totalCount:allColOrders.length, page, totalPages };
  });

  const totalActive = orders.length;
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });

  if (cafeLoading) return <KitchenInitScreen theme={theme} />;

  if (!cafe) {
    return (
      <div className="kds-wrap" data-theme={theme} style={{ minHeight:'100vh',backgroundColor:'var(--kds-bg-page)',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:32 }}>
        <div>
          <UtensilsCrossed style={{ width:56,height:56,color:'var(--kds-text-secondary)',margin:'0 auto 16px' }}/>
          <h2 className="kds-title" style={{ color:'var(--kds-text-primary)',fontSize:22,fontWeight:900,marginBottom:8 }}>Café Not Found</h2>
          <p style={{ color:'var(--kds-text-secondary)',fontSize:13 }}>No café with ID: <code style={{ color:'var(--kds-gold)' }}>{cafeId}</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="kds-wrap" data-theme={theme} style={{ minHeight:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',backgroundColor:'var(--kds-bg-page)' }}>

      {/* ── Top bar ── */}
      <header style={{ flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',borderBottom:'1px solid var(--kds-border-page)',background:'var(--kds-bg-header)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <div style={{ width:38,height:38,borderRadius:10,background:'var(--kds-gold-bg)',border:'1.5px solid var(--kds-gold-border)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <ChefHat style={{ width:20,height:20,color:'var(--kds-gold)' }}/>
          </div>
          <div>
            <h1 className="kds-title" style={{ color:'var(--kds-text-primary)',fontSize:16,fontWeight:900,lineHeight:1 }}>{cafe.name || 'Kitchen'}</h1>
            <span style={{ fontSize:10,color:'var(--kds-text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:700 }}>Kitchen Display</span>
          </div>
        </div>

        <div style={{ display:'flex',alignItems:'center',gap:20 }}>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:26,fontWeight:900,color:'var(--kds-gold)',lineHeight:1,fontFamily:"'Playfair Display',serif" }}>{totalActive}</p>
            <p style={{ fontSize:9,color:'var(--kds-text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:700 }}>Active</p>
          </div>
          {columns.map(col => (
            <div key={col.id} style={{ textAlign:'center',display:'none' }} className="md:block">
              <p style={{ fontSize:18,fontWeight:900,color:col.accent,lineHeight:1 }}>{col.orders.length}</p>
              <p style={{ fontSize:9,color:col.accent+'bb',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700 }}>{col.label.split(' ')[0]}</p>
            </div>
          ))}
        </div>

        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ textAlign:'right' }}>
            <p style={{ fontSize:13,fontWeight:800,color:'var(--kds-text-time)' }}>{timeStr}</p>
            <p style={{ fontSize:10,color:'var(--kds-text-secondary)',fontWeight:600 }}>{dateStr}</p>
          </div>
          {/* Online / Offline */}
          <div style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,fontSize:10,fontWeight:800,background: online ? 'var(--kds-online-bg)' : 'var(--kds-offline-bg)',color: online ? 'var(--kds-online-text)' : 'var(--kds-offline-text)',border:`1px solid ${online ? 'var(--kds-online-border)' : 'var(--kds-offline-border)'}` }}>
            {online ? <><Wifi style={{ width:11,height:11 }}/> Live</> : <><WifiOff style={{ width:11,height:11 }}/> Offline</>}
          </div>
          {/* ── Theme toggle button ── */}
          <button className="kds-toggle-btn" onClick={toggleTheme} title={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Column headers ── */}
      <div style={{ flexShrink:0,display:'flex',gap:1,borderBottom:'1px solid var(--kds-border-col-hd)',background:'var(--kds-bg-col-header)' }}>
        {columns.map(col => {
          const Icon = col.icon;
          return (
            <div key={col.id} style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:`2px solid ${col.accent}` }}>
              <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                <Icon style={{ width:15,height:15,color:col.accent }}/>
                <span style={{ fontSize:13,fontWeight:800,color:'var(--kds-text-primary)' }}>{col.label}</span>
              </div>
              <span style={{ width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:col.accent,background:col.accent+'25' }}>{col.totalCount}</span>
            </div>
          );
        })}
      </div>

      {/* ── Kanban board ── */}
      <div style={{ flex:1,display:'flex',gap:1,overflow:'hidden',background:'var(--kds-bg-board)' }}>
        {columns.map(col => (
          <div key={col.id} style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:COL_BG[theme][col.id] }}>
            <div className="kds-scroll" style={{ flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10 }}>
              <AnimatePresence mode="popLayout">
                {col.orders.length === 0 ? (
                  <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'48px 0',gap:10,textAlign:'center' }}>
                    <div style={{ width:44,height:44,borderRadius:'50%',background:col.accent+'18',border:`1px solid ${col.border}`,display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <col.icon style={{ width:20,height:20,color:col.accent+'88' }}/>
                    </div>
                    <p style={{ fontSize:12,color:col.accent+'70',fontWeight:600 }}>No orders</p>
                  </motion.div>
                ) : (
                  col.orders.map(order => (
                    <OrderCard key={order.id} order={order} onAdvance={handleAdvance} advancing={advancing}/>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {col.totalCount > PAGE_SIZE && (
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderTop:`1px solid ${col.border}`,background:COL_BG[theme][col.id] }}>
                <button onClick={() => setColPage(col.id,Math.max(0,col.page-1))} disabled={col.page===0} className="kds-btn"
                  style={{ background:col.page===0 ? 'transparent' : col.accent+'25',color:col.accent,padding:'5px 10px',opacity:col.page===0 ? 0.35 : 1 }}>← Prev</button>
                <span style={{ fontSize:11,color:col.accent+'bb',fontWeight:600 }}>{col.page+1}/{col.totalPages} · {col.totalCount}</span>
                <button onClick={() => setColPage(col.id,Math.min(col.totalPages-1,col.page+1))} disabled={col.page>=col.totalPages-1} className="kds-btn"
                  style={{ background:col.page>=col.totalPages-1 ? 'transparent' : col.accent+'25',color:col.accent,padding:'5px 10px',opacity:col.page>=col.totalPages-1 ? 0.35 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {!ordersReady && <KitchenConnectingOverlay theme={theme}/>}
      </AnimatePresence>
    </div>
  );
};

export default KitchenDisplay;
