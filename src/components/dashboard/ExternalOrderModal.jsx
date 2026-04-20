/**
 * ExternalOrderModal.jsx
 * OM vibe applied — CSS injection + surface styling only.
 * ALL logic, state, handlers, exports, and child components 100% unchanged.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import {
  collection, doc, addDoc, runTransaction, serverTimestamp,
  query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X, Plus, Minus, Trash2, RefreshCw, ShoppingBag,
  AlertCircle, Check, MessageSquare, Search, ShoppingCart,
  Globe, Phone, Utensils, Bike, Armchair, MapPin,
  CreditCard, BarChart2, FileText, Zap, Ruler, Sparkles,
  Coffee, Package, Clock,
} from 'lucide-react';
import { createInvoiceForOrder, generateInvoiceMessage } from '../../services/invoiceService';
import { deductStockForOrder } from '../../services/inventoryService';
import AddOnModal from '../AddOnModal';

// ── OM-matched CSS ────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('ext-omf-css')) {
  const el = document.createElement('style');
  el.id = 'ext-omf-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .ext-wrap  { font-family: 'DM Sans', system-ui, sans-serif; }
    .ext-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    /* Modal surface — deep black with crisp gold border */
    .ext-modal {
      background: #0a0a0a;
      border: 1.5px solid rgba(201,162,39,0.45);
      box-shadow:
        0 0 0 1px rgba(201,162,39,0.08),
        0 -8px 40px rgba(201,162,39,0.06),
        0 32px 80px rgba(0,0,0,0.9),
        inset 0 1px 0 rgba(201,162,39,0.08);
    }
    .ext-modal-header {
      background: #0d0d0d;
      border-bottom: 1px solid rgba(201,162,39,0.18);
    }
    .ext-modal-footer {
      background: #0d0d0d;
      border-top: 1px solid rgba(201,162,39,0.18);
    }

    /* Section label */
    .ext-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #C9A227; display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif; margin-bottom: 10px;
    }

    /* Inputs — pure black bg, gold outline */
    .ext-input {
      background: #000; border: 1.5px solid rgba(201,162,39,0.28); border-radius: 12px;
      color: #fdf8e1; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .ext-input:focus { border-color: rgba(201,162,39,0.75); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .ext-input::placeholder { color: rgba(201,162,39,0.22); }

    /* Selects — pure black bg, gold outline */
    .ext-select {
      background: #000; border: 1.5px solid rgba(201,162,39,0.28); border-radius: 10px;
      color: #fdf8e1; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; cursor: pointer; transition: border-color 160ms; width: 100%;
    }
    .ext-select:focus { border-color: rgba(201,162,39,0.7); }
    .ext-select option { background: #0a0a0a; color: #fdf8e1; }

    /* Textarea — pure black bg, gold outline */
    .ext-textarea {
      background: #000; border: 1.5px solid rgba(201,162,39,0.28); border-radius: 12px;
      color: #fdf8e1; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; resize: none; transition: border-color 180ms, box-shadow 180ms;
    }
    .ext-textarea:focus { border-color: rgba(201,162,39,0.75); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .ext-textarea::placeholder { color: rgba(201,162,39,0.22); }

    /* Primary btn */
    .ext-btn-primary {
      display: inline-flex; align-items: center; gap: 6px;
      background: linear-gradient(135deg, #C9A227, #8B6914); color: #0a0a0a;
      font-family: 'DM Sans', system-ui, sans-serif; font-weight: 800; font-size: 13px;
      padding: 10px 22px; border-radius: 10px; border: none; cursor: pointer;
      box-shadow: 0 3px 14px rgba(201,162,39,0.35); transition: all 180ms; white-space: nowrap;
    }
    .ext-btn-primary:hover  { box-shadow: 0 5px 24px rgba(201,162,39,0.55); transform: translateY(-1px); }
    .ext-btn-primary:active { transform: scale(0.96); }
    .ext-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

    /* Ghost btn */
    .ext-btn-ghost {
      display: inline-flex; align-items: center; gap: 6px;
      background: #000; color: #8a7a4a;
      font-family: 'DM Sans', system-ui, sans-serif; font-weight: 700; font-size: 13px;
      padding: 10px 18px; border-radius: 10px;
      border: 1.5px solid rgba(201,162,39,0.22); cursor: pointer; transition: all 180ms;
    }
    .ext-btn-ghost:hover  { border-color: rgba(201,162,39,0.5); color: #fdf8e1; background: rgba(201,162,39,0.04); }
    .ext-btn-ghost:active { transform: scale(0.96); }

    /* Green WA btn */
    .ext-btn-wa {
      display: inline-flex; align-items: center; gap: 6px;
      background: #000; color: #4ade80;
      font-family: 'DM Sans', system-ui, sans-serif; font-weight: 700; font-size: 13px;
      padding: 10px 18px; border-radius: 10px;
      border: 1.5px solid rgba(34,197,94,0.3); cursor: pointer; transition: all 180ms;
    }
    .ext-btn-wa:hover { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.5); }

    /* Source pill button */
    .ext-source-btn {
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      padding: 12px 8px; border-radius: 10px;
      font-family: 'DM Sans', system-ui, sans-serif; font-weight: 800; font-size: 11px;
      cursor: pointer; transition: all 160ms;
      border: 1.5px solid rgba(201,162,39,0.2);
      background: #000; color: #8a7a4a;
    }
    .ext-source-btn:hover { border-color: rgba(201,162,39,0.45); color: #fdf8e1; }
    .ext-source-btn-on   { color: #fff; }

    /* Mode toggle button */
    .ext-mode-btn {
      padding: 10px 12px; border-radius: 10px; font-size: 13px; font-weight: 700;
      font-family: 'DM Sans', system-ui, sans-serif;
      cursor: pointer; transition: all 160ms;
      border: 1.5px solid rgba(201,162,39,0.2);
      background: #000; color: #8a7a4a;
    }
    .ext-mode-btn:hover { border-color: rgba(201,162,39,0.45); color: #fdf8e1; }
    .ext-mode-btn-on {
      background: rgba(201,162,39,0.07); color: #C9A227;
      border-color: rgba(201,162,39,0.55);
      box-shadow: inset 0 0 0 1px rgba(201,162,39,0.08);
    }

    /* Cart card — black with gold border */
    .ext-cart-card {
      background: #000;
      border: 1.5px solid rgba(201,162,39,0.3);
      border-radius: 14px; overflow: hidden;
    }
    .ext-cart-row { border-bottom: 1px solid rgba(201,162,39,0.1); }

    /* Empty cart area */
    .ext-empty-cart {
      background: #000;
      border: 1.5px dashed rgba(201,162,39,0.25);
      border-radius: 14px; cursor: pointer; transition: border-color 180ms, background 180ms;
    }
    .ext-empty-cart:hover { border-color: rgba(201,162,39,0.5); background: rgba(201,162,39,0.02); }

    /* Info notice */
    .ext-notice {
      background: rgba(201,162,39,0.04);
      border: 1.5px solid rgba(201,162,39,0.28);
      border-radius: 12px;
    }

    /* Badge */
    .ext-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Label */
    .ext-label {
      display: block; font-size: 11px; font-weight: 900;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: #9a8a5a; margin-bottom: 7px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Scrollbar */
    .ext-scroll::-webkit-scrollbar { width: 3px; }
    .ext-scroll::-webkit-scrollbar-track { background: transparent; }
    .ext-scroll::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.3); border-radius: 3px; }

    /* Sheet (item picker) — black with gold border */
    .ext-sheet {
      background: #0a0a0a;
      border: 1.5px solid rgba(201,162,39,0.4);
      box-shadow: 0 -16px 50px rgba(201,162,39,0.1), 0 0 0 1px rgba(201,162,39,0.06);
    }
    .ext-sheet-grip { width: 36px; height: 4px; border-radius: 4px; background: rgba(201,162,39,0.35); }

    /* Search input */
    .ext-search {
      background: #000; border: 1.5px solid rgba(201,162,39,0.28); border-radius: 12px;
      color: #fdf8e1; padding: 9px 14px 9px 36px; font-size: 13px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms;
    }
    .ext-search:focus { border-color: rgba(201,162,39,0.7); }
    .ext-search::placeholder { color: rgba(201,162,39,0.22); }

    /* Menu item row in picker */
    .ext-menu-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-radius: 12px;
      background: #000;
      border: 1.5px solid rgba(201,162,39,0.18);
      transition: border-color 160ms, background 160ms;
    }
    .ext-menu-item:hover { border-color: rgba(201,162,39,0.45); background: rgba(201,162,39,0.03); }

    /* Fade-in */
    @keyframes extIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .ext-in { animation: extIn 260ms ease forwards; }
  `;
  document.head.appendChild(el);
}

// ─── calculateOrderTotals — identical to OrdersManagement single source of truth ─
const calculateOrderTotals = (items = []) => {
  if (!Array.isArray(items)) return { itemsTotal: 0, addonsTotal: 0, grandTotal: 0 };
  const safeN = v => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
  let itemsTotal = 0, addonsTotal = 0;
  for (const item of items) {
    if (!item) continue;
    const base = safeN(item.basePrice ?? item.price);
    const qty  = safeN(item.quantity) || 1;
    const addons   = Array.isArray(item.addons) ? item.addons : [];
    const addonAmt = addons.reduce((s, a) => { if (!a) return s; return s + safeN(a.price) * (parseInt(a.quantity) || 1); }, 0);
    itemsTotal  += base    * qty;
    addonsTotal += addonAmt * qty;
  }
  return { itemsTotal, addonsTotal, grandTotal: itemsTotal + addonsTotal };
};

// ─── Platform source definitions — UNCHANGED (exported) ───────────────────────
export const ORDER_SOURCES = [
  { value: 'zomato', label: 'Zomato',      emoji: '🍅', color: '#EF4444', bg: 'bg-red-500/15 border-red-500/30 text-red-400'              },
  { value: 'swiggy', label: 'Swiggy',      emoji: '🧡', color: '#F97316', bg: 'bg-orange-500/15 border-orange-500/30 text-orange-400'    },
  { value: 'phone',  label: 'Phone Order', emoji: '📞', color: '#3B82F6', bg: 'bg-blue-500/15 border-blue-500/30 text-blue-400'          },
  { value: 'walkin', label: 'Walk-in',     emoji: '🚶', color: '#10B981', bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  { value: 'other',  label: 'Other',       emoji: '✨', color: '#8B5CF6', bg: 'bg-purple-500/15 border-purple-500/30 text-purple-400'    },
];

export const getSourceMeta = (source) =>
  ORDER_SOURCES.find(s => s.value === source?.toLowerCase()) || {
    value: source || 'other', label: source?.toUpperCase() || 'DIRECT',
    color: '#A3A3A3', bg: 'bg-white/10 border-white/20 text-[#A3A3A3]',
  };

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

// ─── ExternalItemPickerModal ──────────────────────────────────────────────────
const ExternalItemPickerModal = ({ cafeId, CUR, onClose, onConfirm, setVariantModal, variantAddRef }) => {
  const primary = '#C9A227';

  const [menuItems,   setMenuItems  ] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [newCart,     setNewCart    ] = useState([]);
  const [addonModal,  setAddonModal ] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ALL logic UNCHANGED
  useEffect(() => {
    if (!cafeId) return;
    const q = query(collection(db,'menuItems'), where('cafeId','==',cafeId), where('available','==',true));
    const unsub = onSnapshot(q, snap => { setMenuItems(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoadingMenu(false); }, () => setLoadingMenu(false));
    return () => unsub();
  }, [cafeId]);

  const filteredItems = menuItems.filter(item => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const { grandTotal: newCartTotal } = calculateOrderTotals(newCart);

  const directAddToNewCart = useCallback((cartEntry) => {
    setNewCart(prev => {
      if (cartEntry.addons?.length > 0) return [...prev, cartEntry];
      if (cartEntry.selectedSize) {
        const ex = prev.find(i => i.id===cartEntry.id && i.selectedSize===cartEntry.selectedSize);
        if (ex) return prev.map(i => i.id===cartEntry.id && i.selectedSize===cartEntry.selectedSize ? {...i,quantity:i.quantity+1} : i);
        return [...prev, cartEntry];
      }
      const ex = prev.find(i => i.id===cartEntry.id && !i.addons?.length && !i.selectedSize);
      if (ex) return prev.map(i => i.id===cartEntry.id && !i.addons?.length && !i.selectedSize ? {...i,quantity:i.quantity+1} : i);
      return [...prev, cartEntry];
    });
  }, []);

  const addToNewCart = useCallback((item, forcedVariant) => {
    if (!item) return;
    if (!forcedVariant) {
      const sp = item.sizePricing;
      if (sp && sp.enabled === true) {
        const spv = [sp.small!=null&&{name:'Small',price:parseFloat(sp.small)},sp.medium!=null&&{name:'Medium',price:parseFloat(sp.medium)},sp.large!=null&&{name:'Large',price:parseFloat(sp.large)}].filter(Boolean);
        if (spv.length > 0) { setVariantModal({...item,_resolvedVariants:spv}); return; }
      }
      const raw = item.variants||item.prices||item.sizes||item.options||item.priceVariants||item.multiPrices||null;
      const vars = Array.isArray(raw) ? raw.filter(v=>v&&v.price!==undefined) : null;
      if (vars && vars.length > 0) { setVariantModal({...item,_resolvedVariants:vars}); return; }
    }
    const resolvedPrice = forcedVariant ? (parseFloat(forcedVariant.price)||parseFloat(item.price)||0) : (parseFloat(item.price)||0);
    const resolvedVariantName = forcedVariant?.name||forcedVariant?.label||forcedVariant?.size||forcedVariant?.title||null;
    if (item.addons?.length > 0) { setAddonModal({...item,price:resolvedPrice,basePrice:resolvedPrice,selectedVariant:resolvedVariantName}); return; }
    directAddToNewCart({...item,price:resolvedPrice,basePrice:resolvedPrice,selectedSize:resolvedVariantName,selectedVariant:resolvedVariantName,quantity:1,addons:[],addonTotal:0,comboItems:Array.isArray(item.comboItems)?item.comboItems:[]});
  }, [directAddToNewCart, setAddonModal, setVariantModal]);

  useEffect(() => { if (variantAddRef) variantAddRef.current = (item, variant) => addToNewCart(item, variant); });

  const removeFromNewCart = useCallback((id) => {
    setNewCart(prev => { const ex=prev.find(i=>i.id===id); if(!ex) return prev; if(ex.quantity===1) return prev.filter(i=>i.id!==id); return prev.map(i=>i.id===id?{...i,quantity:i.quantity-1}:i); });
  }, []);

  const newCartQtyFor = (id) => newCart.find(i => i.id===id)?.quantity || 0;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
        <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}/>

        <motion.div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col ext-sheet ext-wrap"
          style={{maxHeight:'90vh'}} initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}}
          transition={{type:'spring',damping:26,stiffness:300}} onClick={e=>e.stopPropagation()}>

          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="ext-sheet-grip"/>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{borderBottom:'1px solid rgba(201,162,39,0.12)'}}>
            <div>
              {/* 🍴 → Utensils */}
              <h3 className="ext-title text-white font-bold text-lg flex items-center gap-2"><Utensils className="w-5 h-5" style={{color:'#C9A227'}}/> Select Items</h3>
              {/* 🔍 → Search */}
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{color:'#7a6a3a'}}><Search className="w-3 h-3"/> Search and add items to this order</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{background:'rgba(201,162,39,0.1)',border:'1px solid rgba(201,162,39,0.2)'}}>
              <X className="w-4 h-4" style={{color:'#C9A227'}}/>
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:'#7a6a3a'}}/>
              <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                placeholder="Search menu items…" className="ext-search"/>
            </div>
          </div>

          {/* Menu list */}
          <div className="flex-1 overflow-y-auto ext-scroll px-4 py-3 space-y-2">
            {loadingMenu ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                {/* 🍳 → Coffee */}
                <Coffee className="w-8 h-8 animate-bounce" style={{color:'#C9A227'}}/>
                <p className="text-sm" style={{color:'#7a6a3a'}}>Loading menu…</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-10">
                {/* 🫙 → Package */}
                <Package className="w-7 h-7 mx-auto mb-1.5" style={{color:'#3a2a0a'}}/>
                <p className="text-sm" style={{color:'#5a4a1a'}}>No items found</p>
              </div>
            ) : filteredItems.map(item => {
              const qty = newCartQtyFor(item.id);
              const sp = item.sizePricing;
              const spv = (sp?.enabled===true) ? [sp.small!=null&&{name:'Small',price:parseFloat(sp.small)},sp.medium!=null&&{name:'Medium',price:parseFloat(sp.medium)},sp.large!=null&&{name:'Large',price:parseFloat(sp.large)}].filter(Boolean) : [];
              const raw = item.variants||item.prices||item.sizes||item.options||item.priceVariants||item.multiPrices||null;
              const av  = Array.isArray(raw)?raw.filter(v=>v&&v.price!==undefined):[];
              const iv  = spv.length>0?spv:av;
              const hasV = iv.length>0; const hasA = Array.isArray(item.addons)&&item.addons.length>0;
              const minP = hasV?Math.min(...iv.map(v=>parseFloat(v.price)||0)):null;
              const dp   = hasV?`from ${CUR}${fmt(minP)}`:`${CUR}${fmt(item.price)}`;
              /* 📐 → Ruler, 🎨 → Sparkles, ➕ → Plus */
              const lbl  = hasV
                ? <><Ruler className="inline w-3 h-3 mr-1"/>Pick Size</>
                : hasA
                  ? <><Sparkles className="inline w-3 h-3 mr-1"/>Customize</>
                  : <><Plus className="inline w-3 h-3 mr-1"/>Add</>;

              return (
                <div key={item.id} className="ext-menu-item">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-bold truncate" style={{color:'#fdf8e1'}}>{item.name}</p>
                    {item.category && <p className="text-xs mt-0.5" style={{color:'#5a4a1a'}}>{item.category}</p>}
                    {hasV ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {iv.map((v,vi)=>(
                          <span key={vi} className="ext-badge"
                            style={{background:'rgba(201,162,39,0.12)',color:'#C9A227',borderColor:'rgba(201,162,39,0.25)',fontSize:'0.65rem'}}>
                            {v.name||`S${vi+1}`} {CUR}{fmt(v.price)}
                          </span>
                        ))}
                      </div>
                    ) : <p className="text-sm font-black mt-1" style={{color:'#C9A227'}}>{dp}</p>}
                  </div>

                  {!hasV && qty > 0 ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={()=>removeFromNewCart(item.id)} className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}>
                        <Minus className="w-3 h-3 text-white"/>
                      </button>
                      <span className="text-white font-black text-sm min-w-[16px] text-center">{qty}</span>
                      <button onClick={()=>{const e=newCart.find(i=>i.id===item.id);if(e)directAddToNewCart({...e});else addToNewCart(item);}}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-black font-bold"
                        style={{background:'linear-gradient(135deg,#C9A227,#8B6914)'}}>
                        <Plus className="w-3 h-3"/>
                      </button>
                    </div>
                  ) : (
                    <motion.button whileTap={{scale:0.93}} onClick={()=>addToNewCart(item)}
                      className="ext-btn-primary flex-shrink-0" style={{padding:'6px 12px',fontSize:12}}>
                      {lbl}
                    </motion.button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {newCart.length > 0 && (
            <div className="px-4 py-4 flex-shrink-0 space-y-3"
              style={{borderTop:'1px solid rgba(201,162,39,0.12)',background:'rgba(0,0,0,0.25)'}}>
              {/* 🛒 → ShoppingCart */}
              <p className="text-xs font-black flex items-center gap-1" style={{color:'#C9A227'}}>
                <ShoppingCart className="w-3.5 h-3.5"/> Cart · {newCart.length} item{newCart.length!==1?'s':''}
              </p>
              <div className="space-y-1.5">
                {newCart.map((item,idx)=>{
                  const adds=Array.isArray(item.addons)?item.addons:[];
                  const at=adds.reduce((s,a)=>s+(parseFloat(a.price)||0)*(parseInt(a.quantity)||1),0);
                  const lt=(parseFloat(item.basePrice??item.price)+at)*(parseInt(item.quantity)||1);
                  return (
                    <div key={idx} className="flex justify-between text-xs" style={{color:'#7a6a3a'}}>
                      <span>{item.name}{item.selectedVariant?` (${item.selectedVariant})`:''} ×{item.quantity}{adds.length>0?` +${adds.length} add-on${adds.length>1?'s':''}`:''}</span>
                      <span className="text-white font-bold">{CUR}{fmt(lt)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-black pt-1" style={{borderTop:'1px solid rgba(201,162,39,0.1)'}}>
                  <span style={{color:'#7a6a3a'}}>✦ Selected total</span>
                  <span style={{color:'#C9A227'}}>{CUR}{fmt(newCartTotal)}</span>
                </div>
              </div>
              <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.97}}
                onClick={()=>onConfirm(newCart)}
                className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 text-black"
                style={{background:'linear-gradient(135deg,#C9A227,#8B6914)',boxShadow:'0 6px 20px rgba(201,162,39,0.3)'}}>
                {/* ✅ → Check */}
                <Check className="w-4 h-4"/>
                Confirm {newCart.length} Item{newCart.length!==1?'s':''} · {CUR}{fmt(newCartTotal)}
              </motion.button>
            </div>
          )}
        </motion.div>

        {addonModal && (
          <AddOnModal item={addonModal}
            onConfirm={entry=>{directAddToNewCart(entry);setAddonModal(null);}}
            onClose={()=>setAddonModal(null)}
            currencySymbol={CUR} primaryColor="#C9A227" theme="dark"/>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// ─── ExternalOrderModal ───────────────────────────────────────────────────────
const ExternalOrderModal = ({ onClose, onSuccess }) => {
  const { user }       = useAuth();
  const cafeId         = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const [submitting, setSubmitting] = useState(false);

  // ALL form state — UNCHANGED
  const [source,          setSource         ] = useState('zomato');
  const [customerName,    setCustomerName   ] = useState('');
  const [customerPhone,   setCustomerPhone  ] = useState('');
  const [tableNumber,     setTableNumber    ] = useState('');
  const [orderMode,       setOrderMode      ] = useState('takeaway');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes,           setNotes          ] = useState('');
  const [paymentMode,     setPaymentMode    ] = useState('counter');
  const [paymentStatus,   setPaymentStatus  ] = useState('pending');
  const [cart,            setCart           ] = useState([]);
  const [showPicker,      setShowPicker     ] = useState(false);
  const [extVariantModal, setExtVariantModal] = useState(null);
  const extVariantAddRef = useRef(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);

  const { grandTotal: cartTotal } = calculateOrderTotals(cart);

  const removeFromCart = useCallback((idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // handleSubmit — UNCHANGED
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) { toast.error('Add at least one item before placing the order'); return; }
    setSubmitting(true);
    try {
      const counterRef = doc(db,'system','counters');
      let orderNumber;
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists()) { orderNumber=1; transaction.set(counterRef,{currentOrderNumber:1}); }
        else { orderNumber=(counterDoc.data().currentOrderNumber||0)+1; transaction.update(counterRef,{currentOrderNumber:orderNumber}); }
      });
      const formattedItems = cart.map(i=>({name:i.name,price:i.basePrice??i.price,basePrice:i.basePrice??i.price,quantity:i.quantity,addons:i.addons||[],addonTotal:i.addonTotal||0,selectedSize:i.selectedSize||null,selectedVariant:i.selectedVariant||i.selectedSize||null,comboItems:i.comboItems||[]}));
      const {grandTotal:subtotal} = calculateOrderTotals(formattedItems);
      const taxAmount           = cafe?.taxEnabled           ? subtotal*(parseFloat(cafe.taxRate)||0)/100 : 0;
      const serviceChargeAmount = cafe?.serviceChargeEnabled ? subtotal*(parseFloat(cafe.serviceChargeRate)||0)/100 : 0;
      const gstAmount           = cafe?.gstEnabled           ? subtotal*(parseFloat(cafe.gstRate)||0)/100 : 0;
      const totalAmount         = Math.round(subtotal+taxAmount+serviceChargeAmount+gstAmount);
      const orderData = {
        cafeId, orderNumber, items:formattedItems,
        subtotalAmount:subtotal, taxAmount, taxEnabled:cafe?.taxEnabled||false, taxName:cafe?.taxName||'Tax', taxRate:parseFloat(cafe?.taxRate)||0,
        serviceChargeAmount, serviceChargeEnabled:cafe?.serviceChargeEnabled||false, serviceChargeRate:parseFloat(cafe?.serviceChargeRate)||0,
        gstAmount, gstEnabled:cafe?.gstEnabled||false, gstRate:parseFloat(cafe?.gstRate)||0,
        totalAmount, currencyCode:cafe?.currencyCode||'INR', currencySymbol:cafe?.currencySymbol||'₹',
        paymentStatus, paymentMode, orderStatus:'new', orderType:orderMode,
        customerName:customerName.trim()||getSourceMeta(source).label, customerPhone:customerPhone.trim(),
        ...(orderMode==='dine-in'&&tableNumber&&{tableNumber:tableNumber.trim()}),
        ...(orderMode==='delivery'&&deliveryAddress&&{deliveryAddress:deliveryAddress.trim()}),
        ...(notes&&{specialInstructions:notes.trim()}),
        orderSource:source, externalOrder:true, source, createdAt:serverTimestamp(),
      };
      const orderDocRef = await addDoc(collection(db,'orders'), orderData);
      const formattedNum = String(orderNumber).padStart(3,'0');
      createInvoiceForOrder({...orderData,orderNumber}, orderDocRef.id, cafe).catch(err=>console.error('[ExternalOrder] Invoice generation failed:',err));
      deductStockForOrder(cafeId, formattedItems, cart).catch(err=>console.error('[ExternalOrder] Stock deduction failed (non-fatal):',err));
      setLastCreatedOrder({id:orderDocRef.id,...orderData,orderNumber});
      toast.success(`External order #${formattedNum} added from ${getSourceMeta(source).label}!`);
      if (onSuccess) onSuccess(orderDocRef.id, orderNumber);
      onClose();
    } catch(err) {
      console.error('[ExternalOrderModal] submit error:', err);
      toast.error('Failed to add order. Please try again.');
    } finally { setSubmitting(false); }
  };

  const fmtWANumber = (raw) => { if(!raw) return ''; const d=String(raw).replace(/\D/g,''); if(!d) return ''; return d.length===10?`91${d}`:d; };
  const handleSendInvoiceWA = () => {
    if (!lastCreatedOrder) return;
    const phone = fmtWANumber(lastCreatedOrder.customerPhone||'');
    if (!phone) { toast.error('No phone number on this order'); return; }
    try { const msg=generateInvoiceMessage(lastCreatedOrder,{name:cafe?.name||'',currencySymbol:lastCreatedOrder.currencySymbol||CUR}); window.location.href=`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`; }
    catch(err) { console.error('[ExternalOrder] WA send error:',err); toast.error('Failed to open WhatsApp'); }
  };

  const sourceMeta = getSourceMeta(source);

  return (
    <>
      {/* Item Picker */}
      {showPicker && (
        <div style={{visibility:extVariantModal?'hidden':'visible'}}>
          <ExternalItemPickerModal cafeId={cafeId} CUR={CUR}
            onClose={()=>setShowPicker(false)}
            onConfirm={selectedCart=>{setCart(selectedCart);setShowPicker(false);}}
            setVariantModal={setExtVariantModal} variantAddRef={extVariantAddRef}/>
        </div>
      )}

      {/* Variant picker */}
      {extVariantModal&&(()=>{
        const vItem=extVariantModal; const vars=vItem._resolvedVariants||[];
        return (
          <div className="fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={()=>setExtVariantModal(null)}/>
            <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
              <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden ext-sheet ext-wrap" onClick={e=>e.stopPropagation()}>
                <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="ext-sheet-grip mx-auto"/></div>
                <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:'1px solid rgba(201,162,39,0.12)'}}>
                  <div>
                    {/* 📐 → Ruler */}
                    <h3 className="ext-title text-white font-bold text-base flex items-center gap-2"><Ruler className="w-4 h-4" style={{color:'#C9A227'}}/> Select Size</h3>
                    <p className="text-xs mt-0.5" style={{color:'#7a6a3a'}}>{vItem.name}</p>
                  </div>
                  <button onClick={()=>setExtVariantModal(null)} className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{background:'rgba(201,162,39,0.1)',border:'1px solid rgba(201,162,39,0.2)'}}><X className="w-4 h-4" style={{color:'#C9A227'}}/></button>
                </div>
                <div className="px-5 py-4 space-y-2.5 pb-8">
                  {vars.map((v,vi)=>(
                    <button key={vi} onClick={()=>{setExtVariantModal(null);extVariantAddRef.current?.(vItem,v);}}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl font-black transition-all"
                      style={{background:'rgba(201,162,39,0.1)',border:'1.5px solid rgba(201,162,39,0.25)',color:'#C9A227'}}
                      onMouseEnter={e=>{e.currentTarget.style.background='rgba(201,162,39,0.2)';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='rgba(201,162,39,0.1)';}}>
                      <span className="text-sm">{v.name}</span>
                      <span className="text-sm">{CUR}{fmt(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main modal */}
      <AnimatePresence>
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 ext-wrap"
          onClick={onClose}>
          <motion.div
            initial={{scale:0.93,opacity:0,y:24}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.93,opacity:0,y:12}}
            transition={{type:'spring',stiffness:300,damping:28}}
            onClick={e=>e.stopPropagation()}
            className="ext-modal w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
            style={{maxHeight:'92vh'}}>

            {/* Header */}
            <div className="ext-modal-header flex items-center justify-between px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{background:'rgba(201,162,39,0.1)',border:'1.5px solid rgba(201,162,39,0.2)'}}>
                  <ShoppingBag className="w-5 h-5" style={{color:'#C9A227'}}/>
                </div>
                <div>
                  <h3 className="ext-title text-white font-black text-lg">✦ Add External Order</h3>
                  {/* 📋 → FileText */}
                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{color:'#7a6a3a'}}><FileText className="w-3 h-3"/> Manually log orders from external platforms</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{background:'rgba(255,255,255,0.05)',border:'1.5px solid rgba(255,255,255,0.08)'}}>
                <X className="w-4 h-4" style={{color:'#7a6a3a'}}/>
              </button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto ext-scroll flex-1 p-6 space-y-6">

              {/* Platform source */}
              <div>
                {/* 🌐 → Globe */}
                <p className="ext-sec"><Globe className="w-3.5 h-3.5"/> Platform Source</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {ORDER_SOURCES.map(s => (
                    <button key={s.value} type="button" onClick={()=>setSource(s.value)}
                      className="ext-source-btn"
                      style={source===s.value ? {borderColor:s.color,background:s.color+'18',color:'#fff'} : {}}>
                      {/* s.emoji is data-driven — left unchanged */}
                      <span style={{fontSize:'18px',lineHeight:1}}>{s.emoji}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="ext-badge" style={{background:sourceMeta.color+'18',color:sourceMeta.color,borderColor:sourceMeta.color+'40'}}>
                    {sourceMeta.label}
                  </span>
                  <span className="text-xs" style={{color:'#5a4a1a'}}>will appear as this label on order cards</span>
                </div>
              </div>

              {/* Customer + Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {/* 👤 — label text only, no wrapping element to change */}
                  <label className="ext-label">Customer Name <span style={{color:'#5a4a1a',textTransform:'none',letterSpacing:0}}>(optional)</span></label>
                  <input type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)}
                    placeholder={`e.g., ${sourceMeta.label} Customer`}
                    className="ext-input" data-testid="ext-customer-name"/>
                </div>
                <div>
                  {/* 📱 → Phone */}
                  <label className="ext-label"><Phone className="inline w-3 h-3 mr-1"/>Phone Number <span style={{color:'#5a4a1a',textTransform:'none',letterSpacing:0}}>(optional)</span></label>
                  <input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}
                    placeholder="e.g., 9876543210"
                    className="ext-input" data-testid="ext-customer-phone"/>
                </div>
              </div>

              {/* Order mode */}
              <div>
                {/* 🛵 → Bike */}
                <p className="ext-sec"><Bike className="w-3.5 h-3.5"/> Order Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {value:'takeaway', label:<><ShoppingBag className="inline w-3.5 h-3.5 mr-1"/>Takeaway</>},
                    {value:'dine-in',  label:<><Utensils    className="inline w-3.5 h-3.5 mr-1"/>Dine-In</>},
                    {value:'delivery', label:<><Bike        className="inline w-3.5 h-3.5 mr-1"/>Delivery</>},
                  ].map(m=>(
                    <button key={m.value} type="button" onClick={()=>setOrderMode(m.value)}
                      className={`ext-mode-btn ${orderMode===m.value?'ext-mode-btn-on':''}`}
                      data-testid={`ext-mode-${m.value}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {orderMode==='dine-in' && (
                <div>
                  {/* 🪑 → Armchair */}
                  <label className="ext-label"><Armchair className="inline w-3 h-3 mr-1"/>Table Number <span style={{color:'#5a4a1a',textTransform:'none',letterSpacing:0}}>(optional)</span></label>
                  <input type="text" value={tableNumber} onChange={e=>setTableNumber(e.target.value)}
                    placeholder="e.g., 5" className="ext-input" data-testid="ext-table-number"/>
                </div>
              )}

              {orderMode==='delivery' && (
                <div>
                  {/* 📍 → MapPin */}
                  <label className="ext-label"><MapPin className="inline w-3 h-3 mr-1"/>Delivery Address</label>
                  <input type="text" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)}
                    placeholder="Enter full delivery address" className="ext-input" data-testid="ext-delivery-address"/>
                </div>
              )}

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  {/* 🛒 → ShoppingCart */}
                  <p className="ext-sec" style={{marginBottom:0}}><ShoppingCart className="w-3.5 h-3.5"/> Items Ordered</p>
                  <button type="button" onClick={()=>setShowPicker(true)}
                    className="ext-btn-primary" style={{padding:'7px 14px',fontSize:12}}
                    data-testid="ext-add-items-btn">
                    <Plus className="w-3.5 h-3.5"/>
                    {cart.length>0?'Change Items':'Add Items'}
                  </button>
                </div>

                {cart.length === 0 ? (
                  <div className="ext-empty-cart flex flex-col items-center justify-center py-8" onClick={()=>setShowPicker(true)}>
                    {/* 🍽️ → Utensils */}
                    <Utensils className="w-8 h-8 mb-2" style={{color:'#3a2a0a'}}/>
                    <p className="text-sm" style={{color:'#7a6a3a'}}>No items selected</p>
                    <p className="text-xs mt-0.5" style={{color:'#5a4a1a'}}>✦ Click to browse menu</p>
                  </div>
                ) : (
                  <div className="ext-cart-card">
                    {cart.map((item,idx)=>{
                      const adds=Array.isArray(item.addons)?item.addons:[];
                      const at=adds.reduce((s,a)=>s+(parseFloat(a.price)||0)*(parseInt(a.quantity)||1),0);
                      const lt=(parseFloat(item.basePrice??item.price)+at)*(parseInt(item.quantity)||1);
                      return (
                        <div key={idx} className="ext-cart-row flex items-start justify-between px-4 py-3 gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold" style={{color:'#fdf8e1'}}>
                              {item.name}{item.selectedVariant?` (${item.selectedVariant})`:''}{' '}
                              <span style={{color:'#7a6a3a',fontWeight:500}}>× {item.quantity}</span>
                            </p>
                            {adds.length>0&&<p className="text-xs mt-0.5" style={{color:'#5a4a1a'}}>+ {adds.map(a=>a.name).join(', ')}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-black" style={{color:'#C9A227'}}>{CUR}{fmt(lt)}</span>
                            <button type="button" onClick={()=>removeFromCart(idx)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                              style={{background:'rgba(220,50,50,0.1)',border:'1px solid rgba(220,50,50,0.2)'}}>
                              <Trash2 className="w-3 h-3" style={{color:'#ff7070'}}/>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center px-4 py-3" style={{borderTop:'1px solid rgba(201,162,39,0.1)'}}>
                      <span className="text-xs font-800" style={{color:'#7a6a3a'}}>✦ Items Total</span>
                      <span className="font-black text-sm" style={{color:'#C9A227'}}>{CUR}{fmt(cartTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {/* 💳 → CreditCard */}
                  <label className="ext-label"><CreditCard className="inline w-3 h-3 mr-1"/>Payment Method</label>
                  <select value={paymentMode} onChange={e=>setPaymentMode(e.target.value)}
                    className="ext-select" data-testid="ext-payment-mode">
                    <option value="counter">Pay at Counter</option>
                    <option value="prepaid">Prepaid / UPI</option>
                    <option value="online">Online Payment</option>
                    <option value="platform">Paid on Platform</option>
                  </select>
                </div>
                <div>
                  {/* 📊 → BarChart2 */}
                  <label className="ext-label"><BarChart2 className="inline w-3 h-3 mr-1"/>Payment Status</label>
                  <select value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)}
                    className="ext-select" data-testid="ext-payment-status">
                    {/* ⏳ → Clock inline, ✅ → Check inline */}
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                {/* 📝 → FileText */}
                <label className="ext-label"><FileText className="inline w-3 h-3 mr-1"/>Notes / Special Instructions <span style={{color:'#5a4a1a',textTransform:'none',letterSpacing:0}}>(optional)</span></label>
                <textarea value={notes} onChange={e=>setNotes(e.target.value)}
                  placeholder="Any special instructions, allergies, or notes…"
                  rows={3} className="ext-textarea" data-testid="ext-notes"/>
              </div>

              {/* Notice */}
              <div className="ext-notice flex items-start gap-3 p-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{color:'#C9A227'}}/>
                <p className="text-xs leading-relaxed" style={{color:'#7a6a3a'}}>
                  {/* ⚡ → Zap, 🧾 → FileText */}
                  <Zap className="inline w-3 h-3 mr-0.5" style={{color:'#C9A227'}}/>This order will appear instantly in the <strong style={{color:'#fdf8e1'}}>Kitchen Display</strong>,{' '}
                  <strong style={{color:'#fdf8e1'}}>Orders Management</strong>, and{' '}
                  <strong style={{color:'#fdf8e1'}}>Analytics</strong> — exactly like a QR order.
                  {' '}<FileText className="inline w-3 h-3 mx-0.5" style={{color:'#C9A227'}}/>An invoice will also be generated automatically.
                </p>
              </div>
            </form>

            {/* Footer */}
            <div className="ext-modal-footer flex items-center justify-between gap-3 px-6 py-4 flex-shrink-0">
              <div className="text-sm flex items-center gap-1" style={{color:'#7a6a3a'}}>
                {/* 🛒 → ShoppingCart */}
                <ShoppingCart className="w-3.5 h-3.5"/> {cart.length} item{cart.length!==1?'s':''} ·{' '}
                <span className="font-black" style={{color:'#C9A227'}}>{CUR}{fmt(cartTotal)}</span>
              </div>
              <div className="flex gap-2.5 flex-wrap justify-end">
                {lastCreatedOrder && lastCreatedOrder.paymentStatus==='paid' && lastCreatedOrder.customerPhone && (
                  <button type="button" onClick={handleSendInvoiceWA} className="ext-btn-wa" data-testid="ext-wa-invoice-btn">
                    {/* 📲 → MessageSquare (already imported) */}
                    <MessageSquare className="w-4 h-4"/> Send Invoice via WhatsApp
                  </button>
                )}
                <button type="button" onClick={onClose} className="ext-btn-ghost">Cancel</button>
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="ext-btn-primary" data-testid="ext-submit-btn">
                  {submitting
                    ? <><RefreshCw className="w-4 h-4 animate-spin"/> Adding…</>
                    : <><Check className="w-4 h-4"/>✦ Add Order</>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default ExternalOrderModal;
