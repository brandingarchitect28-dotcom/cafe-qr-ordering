import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, doc, updateDoc, collection, addDoc, runTransaction, serverTimestamp, query, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AlertCircle, Search, Download, Phone, MapPin, Clock, Bell, Volume2, X, FileText, Eye, Trash2, MessageSquare, PlusCircle, Plus, Minus, ShoppingCart, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CSVLink } from 'react-csv';
import { motion, AnimatePresence } from 'framer-motion';
import InvoiceModal from './InvoiceModal';
import { getInvoiceByOrderId, ensureInvoiceForOrder, generateInvoiceMessage, createInvoiceForOrder } from '../../services/invoiceService';
import ExternalOrderModal from './ExternalOrderModal';
import AddOnModal from '../AddOnModal';

const NOTIFICATION_SOUND = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDgAAAAAAAAAGw3X+VkgAAAAAAAAAAAAAAAAD/4xjEAAJQAVAAAAAAvYCCB4P+UBn//+D4PoGH/ygM///KAHAY////4Pg+D7/8EMOD4f/6gYf///wfB9///5QGf/lAZ//+UAcH0GH////+oGH//6gYf5QBwfD4fygDg//+D5//ygMAAAAAAA/+MYxBYCwAFYAAAAAPHjx4sePHjx5OTk5FRUVFRU9PT09PT09PT0/////////////////////////////////+MYxCMAAADSAAAAAP///////////////////////////////////////////////+MYxDAAAADSAAAAAP///////////////////////////////////////////////+MYxD4AAADSAAAAAP//////////////////////////////////////////////';

// ─── calculateOrderTotals — SINGLE SOURCE OF TRUTH ───────────────────────────
const calculateOrderTotals = (items = []) => {
  if (!Array.isArray(items)) return { itemsTotal: 0, addonsTotal: 0, grandTotal: 0 };
  const safeN = v => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };
  let itemsTotal = 0, addonsTotal = 0;
  for (const item of items) {
    if (!item) continue;
    const base = item.isFree ? 0 : safeN(item.basePrice ?? item.price);
    const qty  = safeN(item.quantity) || 1;
    const addons   = Array.isArray(item.addons) ? item.addons : [];
    const addonAmt = addons.reduce((s, a) => { if (!a) return s; return s + safeN(a.price) * (parseInt(a.quantity) || 1); }, 0);
    itemsTotal  += base * qty;
    addonsTotal += addonAmt * qty;
  }
  return { itemsTotal, addonsTotal, grandTotal: itemsTotal + addonsTotal };
};

// ─── Inject premium green-theme CSS once ─────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('om-food-css')) {
  const el = document.createElement('style');
  el.id = 'om-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .omf { font-family: 'DM Sans', system-ui, sans-serif; }
    .omf-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    /* Cards */
    .omf-card {
      background: #120f00;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .omf-card:hover { border-color: rgba(212,160,23,0.25); }

    /* Table rows */
    .omf-row { border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 150ms; cursor: pointer; }
    .omf-row:hover { background: rgba(212,160,23,0.04); }
    .omf-row-open { background: rgba(212,160,23,0.03) !important; }

    /* Buttons */
    .omf-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 6px 12px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms;
      white-space: nowrap;
    }
    .omf-btn:hover  { transform: translateY(-1px); filter: brightness(1.1); }
    .omf-btn:active { transform: scale(0.96); }

    /* PRIMARY — premium emerald green (matches store-open card) */
    .omf-btn-orange {
      background: linear-gradient(135deg, #D4A017, #A67C00);
      color: #fff;
      box-shadow: 0 3px 14px rgba(212,160,23,0.32);
    }
    .omf-btn-orange:hover { box-shadow: 0 5px 22px rgba(212,160,23,0.48); }

    .omf-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a3a; border-color: rgba(255,255,255,0.08); }
    .omf-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .omf-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .omf-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .omf-btn-blue   { background: rgba(59,130,246,0.1); color: #60a5fa; border-color: rgba(59,130,246,0.2); }
    .omf-btn-blue:hover   { background: rgba(59,130,246,0.2); }
    .omf-btn-green  { background: rgba(212,160,23,0.1); color: #D4A017; border-color: rgba(212,160,23,0.22); }
    .omf-btn-green:hover  { background: rgba(212,160,23,0.2); }
    .omf-btn-yellow { background: rgba(255,190,11,0.1); color: #fbbf24; border-color: rgba(255,190,11,0.22); }
    .omf-btn-yellow:hover { background: rgba(255,190,11,0.2); }

    /* Inputs */
    .omf-input {
      background: #1a1500; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fdf8e1; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .omf-input:focus { border-color: rgba(212,160,23,0.55); box-shadow: 0 0 0 3px rgba(212,160,23,0.1); }
    .omf-input::placeholder { color: #3d341a; }
    .omf-input[type="date"] { color-scheme: dark; }

    /* Selects */
    .omf-select {
      background: #1a1500; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 9px;
      color: #fdf8e1; padding: 6px 10px; font-size: 12px; font-weight: 700;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; cursor: pointer; transition: border-color 160ms;
    }
    .omf-select:focus { border-color: rgba(212,160,23,0.5); }
    .omf-select option { background: #1a1500; }

    /* Badges */
    .omf-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Filter tabs */
    .omf-tab {
      padding: 6px 16px; border-radius: 22px; font-size: 13px; font-weight: 800;
      cursor: pointer; transition: all 180ms; border: 1.5px solid transparent;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .omf-tab-on  {
      background: linear-gradient(135deg, #D4A017, #A67C00);
      color: #fff;
      box-shadow: 0 3px 14px rgba(212,160,23,0.35);
    }
    .omf-tab-off { background: rgba(255,255,255,0.04); color: #7a6a3a; border-color: rgba(255,255,255,0.07); }
    .omf-tab-off:hover { background: rgba(212,160,23,0.08); color: #D4A017; border-color: rgba(212,160,23,0.2); }

    /* Scrollbar */
    .omf-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .omf-scroll::-webkit-scrollbar-track { background: transparent; }
    .omf-scroll::-webkit-scrollbar-thumb { background: rgba(212,160,23,0.25); border-radius: 4px; }

    /* Fade-in */
    @keyframes omfIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .omf-in { animation: omfIn 280ms ease forwards; }

    /* Order number style — premium green */
    .omf-ordnum { font-family: 'Playfair Display', serif; color: #D4A017; }

    /* Section label */
    .omf-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #D4A017; display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    /* Sheet modal */
    .omf-sheet {
      background: linear-gradient(180deg, #1a1400 0%, #110d00 100%);
      border: 1.5px solid rgba(212,160,23,0.18);
      box-shadow: 0 -20px 60px rgba(212,160,23,0.14);
    }
    .omf-sheet-grip { width: 36px; height: 4px; border-radius: 4px; background: rgba(212,160,23,0.28); }
  `;
  document.head.appendChild(el);
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const STATUS = {
  new:       { emoji: '🆕', label: 'New',       bg: 'rgba(59,130,246,0.14)',  color: '#60a5fa', bd: 'rgba(59,130,246,0.24)' },
  preparing: { emoji: '👨‍🍳', label: 'Preparing', bg: 'rgba(255,190,11,0.14)', color: '#fbbf24', bd: 'rgba(255,190,11,0.24)' },
  completed: { emoji: '✅', label: 'Done',       bg: 'rgba(212,160,23,0.12)',    color: '#D4A017', bd: 'rgba(212,160,23,0.22)' },
  cancelled: { emoji: '❌', label: 'Cancelled',  bg: 'rgba(220,50,50,0.12)',   color: '#f87171', bd: 'rgba(220,50,50,0.22)' },
};
const PAYMENT = {
  paid:    { emoji: '💰', bg: 'rgba(212,160,23,0.12)',   color: '#D4A017', bd: 'rgba(212,160,23,0.22)' },
  pending: { emoji: '⏳', bg: 'rgba(220,50,50,0.12)',  color: '#f87171', bd: 'rgba(220,50,50,0.22)' },
};
const getSt  = s => STATUS[s]  || STATUS.new;
const getPay = s => PAYMENT[s] || PAYMENT.pending;
const fmtN   = n => (parseFloat(n) || 0).toFixed(2);
const fmtOrd = n => n ? `#${String(n).padStart(3,'0')}` : '-';
const getItemsCount = items => {
  if (!items?.length) return '0 items';
  const t = items.reduce((s, i) => s + (i.quantity || 1), 0);
  return `${t} item${t !== 1 ? 's' : ''}`;
};
const orderTypeIcon = t => t === 'dine-in' ? '🪑' : t === 'delivery' ? '🛵' : '🥡';

// ─── AddItemsToOrderModal ─────────────────────────────────────────────────────
const AddItemsToOrderModal = ({ order, cafeCurrency, onClose, setVariantModal, variantAddRef }) => {
  const CUR = order?.currencySymbol || cafeCurrency || '₹';
  const [menuItems,   setMenuItems  ] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [newCart,     setNewCart    ] = useState([]);
  const [addonModal,  setAddonModal ] = useState(null);
  const [saving,      setSaving     ] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!order?.cafeId) return;
    const q = query(collection(db,'menuItems'), where('cafeId','==',order.cafeId), where('available','==',true));
    const unsub = onSnapshot(q, snap => { setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingMenu(false); }, () => setLoadingMenu(false));
    return () => unsub();
  }, [order?.cafeId]);

  const filtered = menuItems.filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const { grandTotal: cartTotal } = calculateOrderTotals(newCart);

  const directAdd = useCallback(entry => {
    setNewCart(prev => {
      if (entry.addons?.length > 0) return [...prev, entry];
      if (entry.selectedSize) {
        const ex = prev.find(i => i.id === entry.id && i.selectedSize === entry.selectedSize);
        if (ex) return prev.map(i => i.id === entry.id && i.selectedSize === entry.selectedSize ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, entry];
      }
      const ex = prev.find(i => i.id === entry.id && !i.addons?.length && !i.selectedSize);
      if (ex) return prev.map(i => i.id === entry.id && !i.addons?.length && !i.selectedSize ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, entry];
    });
  }, []);

  const addToCart = useCallback((item, forcedVariant) => {
    if (!item) return;
    if (!forcedVariant) {
      const sp = item.sizePricing;
      if (sp?.enabled === true) {
        const spv = [sp.small != null && { name:'Small', price:parseFloat(sp.small) }, sp.medium != null && { name:'Medium', price:parseFloat(sp.medium) }, sp.large != null && { name:'Large', price:parseFloat(sp.large) }].filter(Boolean);
        if (spv.length > 0) { setVariantModal({ ...item, _resolvedVariants: spv }); return; }
      }
      const raw = item.variants || item.prices || item.sizes || item.options || item.priceVariants || item.multiPrices || null;
      const vars = Array.isArray(raw) ? raw.filter(v => v && v.price !== undefined) : null;
      if (vars?.length > 0) { setVariantModal({ ...item, _resolvedVariants: vars }); return; }
    }
    const price = forcedVariant ? (parseFloat(forcedVariant.price) || parseFloat(item.price) || 0) : (parseFloat(item.price) || 0);
    const vname = forcedVariant?.name || forcedVariant?.label || forcedVariant?.size || forcedVariant?.title || null;
    if (item.addons?.length > 0) { setAddonModal({ ...item, price, basePrice: price, selectedVariant: vname }); return; }
    directAdd({ ...item, price, basePrice: price, selectedSize: vname, selectedVariant: vname, quantity: 1, addons: [], addonTotal: 0, comboItems: Array.isArray(item.comboItems) ? item.comboItems : [] });
  }, [directAdd, setAddonModal, setVariantModal]);

  useEffect(() => { if (variantAddRef) variantAddRef.current = (item, variant) => addToCart(item, variant); });

  const removeFromCart = useCallback(id => {
    setNewCart(prev => { const ex = prev.find(i => i.id === id); if (!ex) return prev; if (ex.quantity === 1) return prev.filter(i => i.id !== id); return prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i); });
  }, []);

  const cartQty = id => newCart.find(i => i.id === id)?.quantity || 0;

  const handleSave = async () => {
    if (!newCart.length) return;
    setSaving(true);
    try {
      const safeNum = v => { const n = parseFloat(v); return isNaN(n)||!isFinite(n) ? 0 : n; };
      const newItems = newCart.map(i => ({ name: i.name, price: i.basePrice??i.price, basePrice: i.basePrice??i.price, quantity: i.quantity, addons: i.addons||[], addonTotal: i.addonTotal||0, selectedSize: i.selectedSize||null, selectedVariant: i.selectedVariant||i.selectedSize||null, comboItems: i.comboItems||[] }));
      const updatedItems = [...(order.items||[]), ...newItems];
      const { grandTotal: newSub } = calculateOrderTotals(updatedItems);
      const cs = await getDoc(doc(db,'cafes',order.cafeId));
      const cafe = cs.exists() ? cs.data() : {};
      const tax = cafe?.taxEnabled ? newSub*safeNum(cafe.taxRate)/100 : 0;
      const sc  = cafe?.serviceChargeEnabled ? newSub*safeNum(cafe.serviceChargeRate)/100 : 0;
      const gst = cafe?.gstEnabled ? newSub*safeNum(cafe.gstRate)/100 : 0;
      const pf  = cafe?.platformFeeEnabled ? safeNum(cafe.platformFeeAmount) : 0;
      await updateDoc(doc(db,'orders',order.id), { items: updatedItems, subtotalAmount: newSub, taxAmount: tax, serviceChargeAmount: sc, gstAmount: gst, totalAmount: Math.round(newSub+tax+sc+gst+pf) });
      toast.success(`🍽️ ${newItems.length} item${newItems.length!==1?'s':''} added!`);
      onClose();
    } catch(err) { console.error('[AddItemsToOrder] Failed:',err); toast.error('Failed to add items'); }
    finally { setSaving(false); }
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
        <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}/>
        <motion.div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col omf-sheet"
          style={{maxHeight:'90vh'}} initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}}
          transition={{type:'spring',damping:26,stiffness:300}} onClick={e=>e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0"><div className="omf-sheet-grip"/></div>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{borderBottom:'1px solid rgba(212,160,23,0.12)'}}>
            <div>
              <h3 className="omf-title text-white font-bold text-lg flex items-center gap-2">🛒 Add Items to Order</h3>
              <p className="text-xs mt-0.5" style={{color:'#7a6a3a'}}>#{order.orderNumber ? String(order.orderNumber).padStart(3,'0') : order.id.slice(0,6)}{order.customerName ? ` · ${order.customerName}` : ''}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:'rgba(212,160,23,0.1)',border:'1px solid rgba(212,160,23,0.2)'}}>
              <X className="w-4 h-4" style={{color:'#D4A017'}}/>
            </button>
          </div>
          {/* Search */}
          <div className="px-4 py-3 flex-shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
              <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search menu items…" className="omf-input" style={{paddingLeft:'2.2rem'}}/>
            </div>
          </div>
          {/* Menu */}
          <div className="flex-1 overflow-y-auto omf-scroll px-4 py-3 space-y-2">
            {loadingMenu ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="text-4xl animate-bounce">🍳</div>
                <p className="text-sm" style={{color:'#7a6a3a'}}>Loading menu…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10"><div className="text-4xl mb-2">🫙</div><p className="text-sm" style={{color:'#5a4a1a'}}>No items found</p></div>
            ) : filtered.map(item => {
              const qty = cartQty(item.id);
              const sp = item.sizePricing;
              const spv = (sp?.enabled===true) ? [sp.small!=null&&{name:'Small',price:parseFloat(sp.small)},sp.medium!=null&&{name:'Medium',price:parseFloat(sp.medium)},sp.large!=null&&{name:'Large',price:parseFloat(sp.large)}].filter(Boolean) : [];
              const raw = item.variants||item.prices||item.sizes||item.options||item.priceVariants||item.multiPrices||null;
              const av  = Array.isArray(raw) ? raw.filter(v=>v&&v.price!==undefined) : [];
              const iv  = spv.length>0 ? spv : av;
              const hasV = iv.length>0; const hasA = Array.isArray(item.addons)&&item.addons.length>0;
              const minP = hasV ? Math.min(...iv.map(v=>parseFloat(v.price)||0)) : null;
              const dp   = hasV ? `from ${CUR}${fmtN(minP)}` : `${CUR}${fmtN(item.price)}`;
              const lbl  = hasV ? '📏 Pick Size' : hasA ? '✨ Customize' : '➕ Add';
              return (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl transition-all"
                  style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(212,160,23,0.22)';e.currentTarget.style.background='rgba(212,160,23,0.04)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.background='rgba(255,255,255,0.03)';}}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-white text-sm font-bold truncate">{item.name}</p>
                    {item.category && <p className="text-xs mt-0.5" style={{color:'#5a4a1a'}}>{item.category}</p>}
                    {hasV ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {iv.map((v,vi)=><span key={vi} className="omf-badge" style={{background:'rgba(212,160,23,0.12)',color:'#D4A017',borderColor:'rgba(212,160,23,0.25)',fontSize:'0.65rem'}}>{v.name||`S${vi+1}`} {CUR}{fmtN(v.price)}</span>)}
                      </div>
                    ) : <p className="text-sm font-black mt-1" style={{color:'#D4A017'}}>{dp}</p>}
                  </div>
                  {!hasV && qty > 0 ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={()=>removeFromCart(item.id)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)'}}><Minus className="w-3 h-3 text-white"/></button>
                      <span className="text-white font-black text-sm min-w-[16px] text-center">{qty}</span>
                      <button onClick={()=>{const e=newCart.find(i=>i.id===item.id);if(e)directAdd({...e});else addToCart(item);}} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{background:'linear-gradient(135deg,#D4A017,#A67C00)'}}><Plus className="w-3 h-3"/></button>
                    </div>
                  ) : (
                    <motion.button whileTap={{scale:0.93}} onClick={()=>addToCart(item)} className="omf-btn omf-btn-orange flex-shrink-0">{lbl}</motion.button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Cart footer */}
          {newCart.length > 0 && (
            <div className="px-4 py-4 flex-shrink-0 space-y-3" style={{borderTop:'1px solid rgba(212,160,23,0.12)',background:'rgba(0,0,0,0.25)'}}>
              <p className="text-xs font-black" style={{color:'#D4A017'}}>🛒 Cart · {newCart.length} item{newCart.length!==1?'s':''}</p>
              <div className="space-y-1.5">
                {newCart.map((item,idx)=>{
                  const adds = Array.isArray(item.addons)?item.addons:[];
                  const at   = adds.reduce((s,a)=>s+(parseFloat(a.price)||0)*(parseInt(a.quantity)||1),0);
                  const lt   = (parseFloat(item.basePrice??item.price)+at)*(parseInt(item.quantity)||1);
                  return <div key={idx} className="flex justify-between text-xs" style={{color:'#7a6a3a'}}><span>{item.name}{item.selectedVariant?` (${item.selectedVariant})`:''} ×{item.quantity}{adds.length>0?` +${adds.length} add-on${adds.length>1?'s':''}`:''}</span><span className="text-white font-bold">{CUR}{fmtN(lt)}</span></div>;
                })}
                <div className="flex justify-between text-sm font-black pt-1" style={{borderTop:'1px solid rgba(212,160,23,0.1)'}}>
                  <span style={{color:'#7a6a3a'}}>New items total</span>
                  <span style={{color:'#D4A017'}}>{CUR}{fmtN(cartTotal)}</span>
                </div>
              </div>
              <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.97}} onClick={handleSave} disabled={saving}
                className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60 text-white"
                style={{background:'linear-gradient(135deg,#D4A017,#A67C00)',boxShadow:'0 6px 20px rgba(212,160,23,0.3)'}}
              >
                {saving?<><RefreshCw className="w-4 h-4 animate-spin"/>Sending to kitchen…</>:<><ShoppingCart className="w-4 h-4"/>Add to Order · {CUR}{fmtN(cartTotal)}</>}
              </motion.button>
            </div>
          )}
        </motion.div>
        {addonModal && <AddOnModal item={addonModal} onConfirm={entry=>{directAdd(entry);setAddonModal(null);}} onClose={()=>setAddonModal(null)} currencySymbol={CUR} primaryColor="#D4A017" theme="dark"/>}
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const OrdersManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const cafeCurrency = cafe?.currencySymbol || '₹';

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery,  setSearchQuery ] = useState('');
  const [startDate,    setStartDate   ] = useState('');
  const [endDate,      setEndDate     ] = useState('');
  const [expandedOrder,       setExpandedOrder      ] = useState(null);
  const [newOrderNotification,setNewOrderNotification] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousOrdersRef = useRef([]);
  const audioRef = useRef(null);

  const dragScrollRef = useRef(null);
  const dragState     = useRef({ active:false, startX:0, startY:0, scrollLeft:0, scrollTop:0 });

  const onDragMouseDown = useCallback(e => {
    const el = dragScrollRef.current; if (!el||e.button!==0) return;
    dragState.current = { active:true, startX:e.pageX-el.offsetLeft, startY:e.pageY-el.offsetTop, scrollLeft:el.scrollLeft, scrollTop:el.scrollTop };
    el.style.cursor='grabbing'; el.style.userSelect='none';
  },[]);
  const onDragMouseMove = useCallback(e => {
    if (!dragState.current.active) return;
    const el = dragScrollRef.current; if (!el) return; e.preventDefault();
    el.scrollLeft = dragState.current.scrollLeft-(e.pageX-el.offsetLeft-dragState.current.startX)*1.2;
    el.scrollTop  = dragState.current.scrollTop -(e.pageY-el.offsetTop -dragState.current.startY)*1.2;
  },[]);
  const onDragEnd = useCallback(()=>{
    dragState.current.active=false;
    const el=dragScrollRef.current; if(!el) return;
    el.style.cursor='grab'; el.style.userSelect='';
  },[]);

  const [viewingInvoice,    setViewingInvoice   ] = useState(null);
  const [invoiceLoading,    setInvoiceLoading   ] = useState(null);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [deleteConfirmId,   setDeleteConfirmId  ] = useState(null);
  const [deleting,          setDeleting         ] = useState(false);
  const [addItemsOrder,     setAddItemsOrder    ] = useState(null);
  const [addItemsVariantModal,setAddItemsVariantModal] = useState(null);
  const addItemsVariantAddRef = useRef(null);
  const [removingItem, setRemovingItem] = useState(null);

  useEffect(()=>{ console.log('[OrdersManagement] User cafeId:',cafeId); },[cafeId]);

  const { data: orders, loading, error: ordersError } = useCollection('orders', cafeId?[where('cafeId','==',cafeId)]:[]);

  useEffect(()=>{
    console.log('[OrdersManagement] Orders received:',orders?.length||0,'orders');
    if(orders?.length>0) console.log('[OrdersManagement] Latest order:',orders[0]?.id,orders[0]?.orderStatus);
  },[orders]);
  useEffect(()=>{ if(ordersError){ console.error('[Orders] Firestore error:',ordersError); toast.error('Error loading orders: '+ordersError); } },[ordersError]);

  const sortedOrders = useMemo(()=>{
    if(!orders?.length) return [];
    return [...orders].sort((a,b)=>{
      if(a.orderNumber&&b.orderNumber) return b.orderNumber-a.orderNumber;
      return (b.createdAt?.toDate?.()||new Date(0))-(a.createdAt?.toDate?.()||new Date(0));
    });
  },[orders]);

  const playNotificationSound = useCallback(()=>{
    if(!soundEnabled) return;
    try { if(!audioRef.current) audioRef.current=new Audio(NOTIFICATION_SOUND); audioRef.current.currentTime=0; audioRef.current.play().catch(e=>console.log('Audio play failed:',e)); }
    catch(e){ console.log('Audio error:',e); }
  },[soundEnabled]);

  useEffect(()=>{
    if(!orders?.length){ previousOrdersRef.current=orders||[]; return; }
    const prevIds=previousOrdersRef.current.map(o=>o.id);
    const newOrd=orders.filter(o=>!prevIds.includes(o.id));
    if(newOrd.length>0&&previousOrdersRef.current.length>0){ setNewOrderNotification(newOrd[0]); playNotificationSound(); setTimeout(()=>setNewOrderNotification(null),10000); }
    previousOrdersRef.current=orders;
  },[orders,playNotificationSound]);

  const updateOrderStatus = async(orderId,status)=>{
    try{ await updateDoc(doc(db,'orders',orderId),{orderStatus:status}); toast.success('Order status updated'); }
    catch(error){ console.error('Error updating order:',error); toast.error('Failed to update order'); }
  };
  const updatePaymentStatus = async(orderId,status)=>{
    try{ await updateDoc(doc(db,'orders',orderId),{paymentStatus:status}); toast.success('Payment status updated'); }
    catch(error){ console.error('Error updating payment:',error); toast.error('Failed to update payment'); }
  };
  const handleSoftDelete = async orderId=>{
    setDeleting(true);
    try{ await updateDoc(doc(db,'orders',orderId),{isDeleted:true,deletedAt:new Date().toISOString()}); toast.success('Order removed'); setDeleteConfirmId(null); if(expandedOrder===orderId) setExpandedOrder(null); }
    catch(err){ console.error('Delete error:',err); toast.error('Failed to remove order'); }
    finally{ setDeleting(false); }
  };

  const handleRemoveItem = useCallback(async(orderId,itemIndex)=>{
    setRemovingItem(null);
    try{
      const safeNum=v=>{ const n=parseFloat(v); return isNaN(n)||!isFinite(n)?0:n; };
      const orderRef=doc(db,'orders',orderId); const snap=await getDoc(orderRef);
      if(!snap.exists()){ toast.error('Order not found'); return; }
      const orderData=snap.data();
      const items=Array.isArray(orderData.items)?[...orderData.items]:[];
      if(itemIndex<0||itemIndex>=items.length){ toast.error('Item index out of range'); return; }
      const removed=items[itemIndex]; items.splice(itemIndex,1);
      if(items.length===0){
        await updateDoc(orderRef,{items:[],subtotalAmount:0,taxAmount:0,serviceChargeAmount:0,gstAmount:0,totalAmount:0,orderStatus:'cancelled',updatedAt:serverTimestamp()});
        toast.success(`Last item removed — order #${String(orderData.orderNumber||'').padStart(3,'0')} cancelled`); return;
      }
      const {grandTotal:newSub}=calculateOrderTotals(items);
      let cfe={}; if(orderData.cafeId){ const cs=await getDoc(doc(db,'cafes',orderData.cafeId)); if(cs.exists()) cfe=cs.data(); }
      const tax=cfe?.taxEnabled?newSub*safeNum(cfe.taxRate)/100:0;
      const sc =cfe?.serviceChargeEnabled?newSub*safeNum(cfe.serviceChargeRate)/100:0;
      const gst=cfe?.gstEnabled?newSub*safeNum(cfe.gstRate)/100:0;
      const pf =cfe?.platformFeeEnabled?safeNum(cfe.platformFeeAmount):0;
      await updateDoc(orderRef,{items,subtotalAmount:newSub,taxAmount:tax,serviceChargeAmount:sc,gstAmount:gst,totalAmount:Math.max(0,Math.round(newSub+tax+sc+gst+pf)),updatedAt:serverTimestamp()});
      toast.success(`"${removed?.name||'Item'}" removed from order`);
    }catch(err){ console.error('[RemoveItem] Failed:',err); toast.error('Failed to remove item from order'); }
  },[]);

  const filteredOrders = useMemo(()=>{
    let f=(sortedOrders||[]).filter(o=>!o.isDeleted);
    if(statusFilter!=='all') f=f.filter(o=>o.orderStatus===statusFilter);
    if(searchQuery.trim()){ const q=searchQuery.toLowerCase(); f=f.filter(o=>o.customerName?.toLowerCase().includes(q)||o.customerPhone?.toLowerCase().includes(q)||o.id.toLowerCase().includes(q)||String(o.orderNumber||'').includes(q)); }
    if(startDate){ const s=new Date(startDate); s.setHours(0,0,0,0); f=f.filter(o=>(o.createdAt?.toDate?.()||new Date(0))>=s); }
    if(endDate){   const e=new Date(endDate);   e.setHours(23,59,59,999); f=f.filter(o=>(o.createdAt?.toDate?.()||new Date(0))<=e); }
    return f;
  },[sortedOrders,statusFilter,searchQuery,startDate,endDate]);

  const csvData = useMemo(()=>filteredOrders.map(order=>({
    'Order #': order.orderNumber?`#${String(order.orderNumber).padStart(3,'0')}`:order.id,
    'Date': order.createdAt?.toDate?.().toLocaleDateString()||'',
    'Time': order.createdAt?.toDate?.().toLocaleTimeString()||'',
    'Customer Name': order.customerName||'', 'Phone': order.customerPhone||'',
    'Order Type': order.orderType||'', 'Table/Address': order.tableNumber||order.deliveryAddress||'',
    'Items': order.items?.map(i=>`${i.name}${i.selectedVariant?` (${i.selectedVariant})`:''} x${i.quantity}`).join(', ')||'',
    'Total': order.totalAmount||order.total||0, 'Payment Mode': order.paymentMode||'',
    'Payment Status': order.paymentStatus||'', 'Order Status': order.orderStatus||'',
    'Special Instructions': order.specialInstructions||'',
  })),[filteredOrders]);

  const isConfirmingRemove=(oId,idx)=>removingItem?.orderId===oId&&removingItem?.itemIndex===idx;

  const makeSynthetic=(orderId,orderObj,autoPrint=false)=>({
    orderId, orderNumber:orderObj.orderNumber, cafeId:orderObj.cafeId,
    cafeName:cafe?.name||'', cafeAddress:cafe?.address||'', cafePhone:cafe?.phone||'', cafeGstNumber:cafe?.gstNumber||'',
    currencySymbol:orderObj.currencySymbol||cafe?.currencySymbol||'₹',
    customerName:orderObj.customerName||'', customerPhone:orderObj.customerPhone||'',
    tableNumber:orderObj.tableNumber||'', orderType:orderObj.orderType||'dine-in',
    deliveryAddress:orderObj.deliveryAddress||'', items:orderObj.items||[],
    subtotalAmount:orderObj.subtotalAmount??orderObj.totalAmount??0,
    gstAmount:orderObj.gstAmount??orderObj.taxAmount??0, taxAmount:orderObj.taxAmount??0,
    serviceChargeAmount:orderObj.serviceChargeAmount??0,
    totalAmount:orderObj.totalAmount??orderObj.total??0,
    paymentMode:orderObj.paymentMode||'counter', paymentStatus:orderObj.paymentStatus||'pending',
    invoiceNumber:null, orderTime:orderObj.createdAt, createdAt:orderObj.createdAt,
    ...(autoPrint?{_autoPrint:true}:{}),
  });

  const handleViewInvoice = async(orderId,e)=>{
    if(e) e.stopPropagation();
    if(!orderId){ toast.error('Invalid order'); return; }
    setInvoiceLoading(orderId);
    try{
      const {data,error}=await getInvoiceByOrderId(orderId);
      if(error) console.warn('[Invoice] getInvoiceByOrderId error (will use fallback):',error);
      if(!error&&data){ setInvoiceLoading(null); setViewingInvoice(data); return; }
      const orderObj=orders?.find(o=>o.id===orderId);
      if(!orderObj){ setInvoiceLoading(null); toast.error('Order data not found'); return; }
      const {invoiceId,error:genError}=await ensureInvoiceForOrder(orderId,orderObj,cafe||{});
      if(genError||!invoiceId){ setInvoiceLoading(null); setViewingInvoice(makeSynthetic(orderId,orderObj)); return; }
      const {data:fresh}=await getInvoiceByOrderId(orderId);
      setInvoiceLoading(null); setViewingInvoice(fresh||{orderId,orderNumber:orderObj.orderNumber});
    }catch(err){ console.error('[Invoice] handleViewInvoice unexpected error:',err); setInvoiceLoading(null); toast.error('Failed to load invoice'); }
  };

  const handleDownloadInvoice = async(orderId,e)=>{
    if(e) e.stopPropagation();
    if(!orderId){ toast.error('Invalid order'); return; }
    setInvoiceLoading(orderId);
    try{
      const {data,error}=await getInvoiceByOrderId(orderId);
      if(error) console.warn('[Invoice] getInvoiceByOrderId error (will use fallback):',error);
      if(!error&&data){ setInvoiceLoading(null); setViewingInvoice({...data,_autoPrint:true}); return; }
      const orderObj=orders?.find(o=>o.id===orderId);
      if(!orderObj){ setInvoiceLoading(null); toast.error('Order data not found'); return; }
      const {invoiceId,error:genError}=await ensureInvoiceForOrder(orderId,orderObj,cafe||{});
      if(genError||!invoiceId){ setInvoiceLoading(null); setViewingInvoice(makeSynthetic(orderId,orderObj,true)); return; }
      const {data:fresh}=await getInvoiceByOrderId(orderId);
      setInvoiceLoading(null); setViewingInvoice({...(fresh||{orderId}),_autoPrint:true});
    }catch(err){ console.error('[Invoice] handleDownloadInvoice unexpected error:',err); setInvoiceLoading(null); toast.error('Failed to download invoice'); }
  };

  const formatWhatsAppNumber=raw=>{ if(!raw) return ''; const d=String(raw).replace(/\D/g,''); if(!d) return ''; return d.length===10?`91${d}`:d; };
  const handleSendInvoiceWA=(order,e)=>{
    if(e) e.stopPropagation();
    if(!order) return;
    const phone=formatWhatsAppNumber(order.customerPhone||'');
    if(!phone){ toast.error('No customer phone number on this order'); return; }
    try{ const msg=generateInvoiceMessage(order,{name:cafe?.name||'',currencySymbol:order.currencySymbol||cafeCurrency}); window.location.href=`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`; }
    catch(err){ console.error('[WA-Invoice]',err); toast.error('Failed to open WhatsApp'); }
  };

  // ─── Item list renderer ───────────────────────────────────────────────────
  const renderItemsList = (order, CUR, isMobile=false) => {
    const sN=v=>{const n=parseFloat(v);return isNaN(n)?0:n;};
    const {itemsTotal,addonsTotal,grandTotal:sub}=calculateOrderTotals(order?.items||[]);
    const fees=sN(order?.gstAmount)+sN(order?.taxAmount)+sN(order?.serviceChargeAmount)+sN(order?.platformFeeAmount);
    return (
      <div className="space-y-2">
        {order.items?.map((item,idx)=>{
          const base  = item.isFree?0:(parseFloat(item.basePrice??item.price)||0);
          const qty   = parseInt(item.quantity)||1;
          const adds  = Array.isArray(item.addons)?item.addons:[];
          const aT    = adds.reduce((s,a)=>s+(parseFloat(a.price)||0)*(parseInt(a.quantity)||1),0);
          const total = (base+aT)*qty;
          const prefix = isMobile ? 'mobile-' : '';
          return (
            <div key={idx} className="pb-2.5" style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div className="flex justify-between items-start gap-2">
                <span className="text-white font-bold text-sm flex-1">
                  🍴 {item.name}{item.selectedVariant?` (${item.selectedVariant})`:''} ×{qty}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.isFree
                    ? <span className="omf-badge" style={{background:'rgba(212,160,23,0.12)',color:'#D4A017',borderColor:'rgba(212,160,23,0.2)'}}>🎁 FREE</span>
                    : <span className="font-black text-sm" style={{color:'#D4A017'}}>{CUR}{total.toFixed(2)}</span>
                  }
                  {order.orderStatus!=='completed'&&order.orderStatus!=='cancelled'&&(
                    isConfirmingRemove(order.id,idx)?(
                      <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>handleRemoveItem(order.id,idx)} data-testid={`confirm-remove-item-${prefix}${order.id}-${idx}`} className="omf-btn omf-btn-red" style={{padding:'3px 8px',fontSize:11}}>✓ Yes</button>
                        <button onClick={()=>setRemovingItem(null)} className="omf-btn omf-btn-ghost" style={{padding:'3px 8px',fontSize:11}}>✗ No</button>
                      </div>
                    ):(
                      <button onClick={e=>{e.stopPropagation();setRemovingItem({orderId:order.id,itemIndex:idx});}} data-testid={`remove-item-${prefix}${order.id}-${idx}`} className="omf-btn omf-btn-red" style={{padding:'3px 8px',fontSize:11}}>
                        <X className="w-2.5 h-2.5"/>Remove
                      </button>
                    )
                  )}
                </div>
              </div>
              <p className="text-xs mt-0.5 ml-4" style={{color:'#555'}}>
                {item.isFree?<span style={{color:'#D4A017'}}>🎁 FREE · was {CUR}{(parseFloat(item.actualPrice)||0).toFixed(2)}</span>:<>Base: {CUR}{base.toFixed(2)}{qty>1?` ×${qty}`:''}</>}
              </p>
              {item.comboItems?.length>0&&<div className="ml-4 mt-0.5 space-y-0.5">{item.comboItems.map((ci,ci2)=><p key={ci2} className="text-xs" style={{color:'#5a4a1a'}}>🔗 {ci.name}{ci.quantity>1?` ×${ci.quantity}`:''}</p>)}</div>}
              {adds.length>0?(
                <div className="ml-4 mt-1.5 space-y-0.5">
                  <p className="text-xs font-bold" style={{color:'#777'}}>✨ Add-ons ({adds.length}):</p>
                  {adds.map((a,ai)=>{const aq=parseInt(a.quantity)||1;const ap=parseFloat(a.price)||0;return <div key={ai} className="flex justify-between text-xs" style={{color:'#666'}}><span>╰ {a.name} ×{aq}</span><span>+{CUR}{(ap*aq).toFixed(2)}</span></div>;})}
                  <div className="flex justify-between text-xs pt-0.5" style={{color:'#888'}}><span>Add-ons total</span><span>+{CUR}{(aT*qty).toFixed(2)}</span></div>
                </div>
              ):<p className="text-xs ml-4 mt-0.5 italic" style={{color:'#5a4a1a'}}>No add-ons</p>}
            </div>
          );
        })}
        {/* Totals */}
        <div className="pt-2.5 mt-1 space-y-1.5" style={{borderTop:'1px solid rgba(212,160,23,0.1)'}}>
          <div className="flex justify-between text-xs" style={{color:'#4a6a4a'}}><span>🧮 Items Total</span><span>{CUR}{itemsTotal.toFixed(2)}</span></div>
          {addonsTotal>0&&<div className="flex justify-between text-xs" style={{color:'#4a6a4a'}}><span>✨ Add-ons</span><span>+{CUR}{addonsTotal.toFixed(2)}</span></div>}
          {sN(order?.gstAmount)>0&&<div className="flex justify-between text-xs" style={{color:'#5a4a1a'}}><span>🏛️ GST</span><span>+{CUR}{sN(order.gstAmount).toFixed(2)}</span></div>}
          {sN(order?.taxAmount)>0&&<div className="flex justify-between text-xs" style={{color:'#5a4a1a'}}><span>🏛️ Tax</span><span>+{CUR}{sN(order.taxAmount).toFixed(2)}</span></div>}
          {sN(order?.serviceChargeAmount)>0&&<div className="flex justify-between text-xs" style={{color:'#5a4a1a'}}><span>🛎️ Service Charge</span><span>+{CUR}{sN(order.serviceChargeAmount).toFixed(2)}</span></div>}
          {sN(order?.platformFeeAmount)>0&&<div className="flex justify-between text-xs" style={{color:'#5a4a1a'}}><span>💻 Platform Fee</span><span>+{CUR}{sN(order.platformFeeAmount).toFixed(2)}</span></div>}
          <div className="flex justify-between font-black text-sm pt-1.5" style={{borderTop:'1px solid rgba(212,160,23,0.1)'}}>
            <span className="text-white">💵 Grand Total</span>
            <span style={{color:'#D4A017'}}>{CUR}{(sub+fees).toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="omf space-y-5 relative">

      {viewingInvoice&&<InvoiceModal invoice={viewingInvoice} onClose={()=>setViewingInvoice(null)}/>}
      {showExternalModal&&<ExternalOrderModal onClose={()=>setShowExternalModal(false)} onSuccess={(id,num)=>toast.success(`🎉 Order #${String(num).padStart(3,'0')} added to kitchen!`)}/>}

      {addItemsOrder&&(
        <div style={{visibility:addItemsVariantModal?'hidden':'visible'}}>
          <AddItemsToOrderModal order={addItemsOrder} cafeCurrency={cafeCurrency} onClose={()=>setAddItemsOrder(null)} setVariantModal={setAddItemsVariantModal} variantAddRef={addItemsVariantAddRef}/>
        </div>
      )}

      {/* Variant picker */}
      {addItemsVariantModal&&(()=>{
        const vItem=addItemsVariantModal;
        const CUR_V=addItemsOrder?.currencySymbol||cafeCurrency||'₹';
        const vars=vItem._resolvedVariants||[];
        const sizeEmoji=['☕','🥤','🧋'];
        return (
          <div className="fixed inset-0 z-[200]">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={()=>setAddItemsVariantModal(null)}/>
            <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center">
              <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden omf-sheet" onClick={e=>e.stopPropagation()}>
                <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="omf-sheet-grip mx-auto"/></div>
                <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:'1px solid rgba(212,160,23,0.12)'}}>
                  <div><h3 className="omf-title text-white font-bold text-base">📏 Select Size</h3><p className="text-xs mt-0.5" style={{color:'#7a6a3a'}}>{vItem.name}</p></div>
                  <button onClick={()=>setAddItemsVariantModal(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{background:'rgba(212,160,23,0.1)',border:'1px solid rgba(212,160,23,0.2)'}}><X className="w-4 h-4" style={{color:'#D4A017'}}/></button>
                </div>
                <div className="px-5 py-4 space-y-2.5 pb-8">
                  {vars.map((v,vi)=>(
                    <button key={vi} onClick={()=>{setAddItemsVariantModal(null);addItemsVariantAddRef.current?.(vItem,v);}}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl font-black transition-all"
                      style={{background:'rgba(212,160,23,0.1)',border:'1.5px solid rgba(212,160,23,0.25)',color:'#D4A017'}}
                      onMouseEnter={e=>{e.currentTarget.style.background='rgba(212,160,23,0.2)';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='rgba(212,160,23,0.1)';}}
                    >
                      <span className="text-sm">{sizeEmoji[vi]||'🍽️'} {v.name}</span>
                      <span className="text-sm">{CUR_V}{fmtN(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* New order notification */}
      <AnimatePresence>
        {newOrderNotification&&(
          <motion.div initial={{opacity:0,x:100,scale:0.9}} animate={{opacity:1,x:0,scale:1}} exit={{opacity:0,x:100,scale:0.9}}
            transition={{type:'spring',damping:22,stiffness:260}}
            className="fixed top-4 right-4 z-50 p-5 rounded-2xl max-w-sm"
            style={{background:'linear-gradient(135deg,#D4A017,#A67C00)',boxShadow:'0 20px 60px rgba(212,160,23,0.5),0 0 0 1px rgba(255,255,255,0.15)'}}
            data-testid="new-order-notification"
          >
            <button onClick={()=>setNewOrderNotification(null)} className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center" style={{background:'rgba(0,0,0,0.2)'}}><X className="w-3.5 h-3.5 text-white"/></button>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{background:'rgba(0,0,0,0.15)'}}>🔔</div>
              <div>
                <p className="font-black text-white/75 text-xs uppercase tracking-widest mb-0.5">New Order!</p>
                <p className="omf-title font-black text-white text-2xl mb-1">{fmtOrd(newOrderNotification.orderNumber)}</p>
                {newOrderNotification.orderType==='dine-in'&&newOrderNotification.tableNumber&&<p className="font-bold text-sm text-white/80">🪑 Table {newOrderNotification.tableNumber}</p>}
                <p className="text-sm text-white/70">🍽️ {getItemsCount(newOrderNotification.items)}</p>
                <p className="font-black text-xl text-white mt-1">💰 {newOrderNotification.currencySymbol||cafeCurrency}{(newOrderNotification.totalAmount||0).toFixed(0)}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🍽️</div>
          <div>
            <h2 className="omf-title text-2xl font-black text-white">Orders Management</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{color:'#7a6a3a'}}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'#D4A017'}}/>
              Live kitchen feed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={()=>setShowExternalModal(true)} data-testid="add-external-order-btn" className="omf-btn omf-btn-orange" style={{padding:'9px 16px',fontSize:'13px',borderRadius:'12px'}}>
            <PlusCircle className="w-4 h-4"/>➕ Add External Order
          </button>
          <button onClick={()=>setSoundEnabled(!soundEnabled)} data-testid="sound-toggle" className="omf-btn"
            style={{padding:'9px 14px',fontSize:'13px',borderRadius:'12px',background:soundEnabled?'rgba(212,160,23,0.12)':'rgba(255,255,255,0.04)',color:soundEnabled?'#D4A017':'#7a6a3a',border:`1.5px solid ${soundEnabled?'rgba(212,160,23,0.25)':'rgba(255,255,255,0.07)'}`}}
          >{soundEnabled?'🔊 Sound On':'🔇 Sound Off'}</button>
        </div>
      </div>

      {/* ── Search + Export ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">🔍</span>
          <input type="text" data-testid="order-search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="omf-input" style={{paddingLeft:'2.4rem',height:'44px'}} placeholder="Search by order #, customer name, or phone…"/>
        </div>
        <CSVLink data={csvData} filename={`orders-${new Date().toISOString().split('T')[0]}.csv`}
          className="omf-btn omf-btn-green"
          style={{borderRadius:'12px',padding:'10px 20px',fontSize:'13px',fontWeight:700,whiteSpace:'nowrap',textDecoration:'none',display:'flex',alignItems:'center',gap:'7px'}}
          data-testid="export-csv-btn"
        ><Download className="w-4 h-4"/>📊 Export CSV</CSVLink>
      </div>

      {/* ── Date Filters ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs font-bold mb-1.5" style={{color:'#7a6a3a'}}>📅 Start Date</label>
          <input type="date" data-testid="start-date-filter" value={startDate} onChange={e=>setStartDate(e.target.value)} className="omf-input" style={{height:'44px'}}/>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold mb-1.5" style={{color:'#7a6a3a'}}>📅 End Date</label>
          <input type="date" data-testid="end-date-filter" value={endDate} onChange={e=>setEndDate(e.target.value)} className="omf-input" style={{height:'44px'}}/>
        </div>
      </div>

      {/* ── Status Filters ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[['all','🍽️ All'],['new','🆕 New'],['preparing','👨‍🍳 Preparing'],['completed','✅ Done'],['cancelled','❌ Cancelled']].map(([k,l])=>(
          <button key={k} data-testid={`filter-${k}`} onClick={()=>setStatusFilter(k)} className={`omf-tab ${statusFilter===k?'omf-tab-on':'omf-tab-off'}`}>{l}</button>
        ))}
      </div>

      {/* ── Loading / Empty ─────────────────────────────────────── */}
      {loading?(
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-5xl animate-bounce">👨‍🍳</div>
          <p className="text-sm font-bold" style={{color:'#7a6a3a'}}>Fetching orders from the kitchen…</p>
        </div>
      ):filteredOrders.length===0?(
        <div className="omf-card flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="text-6xl mb-1">🫙</div>
          <p className="omf-title font-black text-white text-lg">No orders yet!</p>
          <p className="text-sm" style={{color:'#7a6a3a'}}>New orders will fly in real-time 🚀</p>
        </div>
      ):(
        <>
          {/* ── Desktop Table ─────────────────────────────────── */}
          <div className="hidden lg:block omf-card overflow-hidden">
            <div ref={dragScrollRef} className="overflow-x-auto overflow-y-auto omf-scroll" style={{scrollBehavior:'smooth',cursor:'grab'}}
              onMouseDown={onDragMouseDown} onMouseMove={onDragMouseMove} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}
            >
              <table className="w-full">
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(212,160,23,0.12)',background:'rgba(212,160,23,0.04)'}}>
                    {[['🔖','Order #'],['👤','Customer'],['📞','Phone'],['🍽️','Type'],['🪑','Table'],['📦','Items'],['💵','Total'],['💳','Payment'],['📊','Status'],['⚙️','Actions']].map(([em,h])=>(
                      <th key={h} className="text-left px-4 py-3.5 text-xs font-black uppercase tracking-wider" style={{color:'#D4A017'}}>{em} {h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order,oi)=>{
                    const sb=getSt(order.orderStatus); const pb=getPay(order.paymentStatus);
                    const CUR=order.currencySymbol||cafeCurrency;
                    return (
                      <React.Fragment key={order.id}>
                        <tr className={`omf-row omf-in ${expandedOrder===order.id?'omf-row-open':''}`}
                          style={{animationDelay:`${Math.min(oi*25,250)}ms`,animationFillMode:'both'}}
                          onClick={()=>setExpandedOrder(expandedOrder===order.id?null:order.id)}
                          data-testid={`order-row-${order.id}`}
                        >
                          <td className="px-4 py-3.5"><span className="omf-ordnum font-black text-base">{fmtOrd(order.orderNumber)}</span></td>
                          <td className="px-4 py-3.5 text-white font-bold text-sm">{order.customerName||'—'}</td>
                          <td className="px-4 py-3.5 text-sm" style={{color:'#7a6a3a'}}>{order.customerPhone||'—'}</td>
                          <td className="px-4 py-3.5"><span className="text-sm text-white capitalize font-medium">{orderTypeIcon(order.orderType)} {order.orderType||'—'}</span></td>
                          <td className="px-4 py-3.5 text-sm text-white font-medium">
                            {order.orderType==='dine-in'?(order.tableNumber?`🪑 ${order.tableNumber}`:'—'):order.orderType==='delivery'?<span style={{color:'#7a6a3a',fontSize:11}}>🛵 Delivery</span>:'—'}
                          </td>
                          <td className="px-4 py-3.5 text-sm font-medium" style={{color:'#7a6a3a'}}>🍴 {getItemsCount(order.items)}</td>
                          <td className="px-4 py-3.5"><span className="font-black text-sm" style={{color:'#D4A017'}}>💵 {CUR}{(order.totalAmount||order.total||0).toFixed(0)}</span></td>
                          <td className="px-4 py-3.5"><span className="omf-badge" style={{background:pb.bg,color:pb.color,borderColor:pb.bd}}>{pb.emoji} {order.paymentStatus||'pending'}</span></td>
                          <td className="px-4 py-3.5"><span className="omf-badge capitalize" style={{background:sb.bg,color:sb.color,borderColor:sb.bd}}>{sb.emoji} {sb.label}</span></td>
                          <td className="px-4 py-3.5" onClick={e=>e.stopPropagation()}>
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-1.5">
                                <select data-testid={`order-status-${order.id}`} value={order.orderStatus||'new'} onChange={e=>updateOrderStatus(order.id,e.target.value)} className="omf-select">
                                  <option value="new">🆕 New</option><option value="preparing">👨‍🍳 Preparing</option><option value="completed">✅ Done</option><option value="cancelled">❌ Cancelled</option>
                                </select>
                                <select data-testid={`payment-status-${order.id}`} value={order.paymentStatus||'pending'} onChange={e=>updatePaymentStatus(order.id,e.target.value)} className="omf-select">
                                  <option value="pending">⏳ Pending</option><option value="paid">💰 Paid</option>
                                </select>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                <button onClick={e=>handleViewInvoice(order.id,e)} disabled={invoiceLoading===order.id} data-testid={`view-invoice-${order.id}`} className="omf-btn omf-btn-yellow"><Eye className="w-3 h-3"/>{invoiceLoading===order.id?'…':'🧾 Bill'}</button>
                                <button onClick={e=>handleDownloadInvoice(order.id,e)} disabled={invoiceLoading===order.id} data-testid={`download-invoice-${order.id}`} className="omf-btn omf-btn-ghost"><FileText className="w-3 h-3"/>PDF</button>
                                {order.customerPhone&&<button onClick={e=>handleSendInvoiceWA(order,e)} data-testid={`wa-invoice-${order.id}`} className="omf-btn omf-btn-green"><MessageSquare className="w-3 h-3"/>WA</button>}
                                {order.orderStatus!=='completed'&&order.orderStatus!=='cancelled'&&(
                                  <button onClick={e=>{e.stopPropagation();setAddItemsOrder(order);}} data-testid={`add-items-${order.id}`} className="omf-btn omf-btn-blue"><Plus className="w-3 h-3"/>Add</button>
                                )}
                                {deleteConfirmId===order.id?(
                                  <div className="flex gap-1">
                                    <button onClick={()=>handleSoftDelete(order.id)} disabled={deleting} className="omf-btn omf-btn-red" style={{background:'#dc2626',color:'#fff',borderColor:'transparent'}}>{deleting?'…':'✓ Yes'}</button>
                                    <button onClick={()=>setDeleteConfirmId(null)} className="omf-btn omf-btn-ghost">✗ No</button>
                                  </div>
                                ):(
                                  <button onClick={e=>{e.stopPropagation();setDeleteConfirmId(order.id);}} className="omf-btn omf-btn-ghost" style={{padding:'6px 8px'}}><Trash2 className="w-3 h-3"/></button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded row */}
                        {expandedOrder===order.id&&(
                          <tr>
                            <td colSpan="10" style={{background:'rgba(212,160,23,0.025)',borderBottom:'1px solid rgba(212,160,23,0.08)'}}>
                              <div className="px-5 py-5 grid grid-cols-2 gap-8">
                                <div>
                                  <p className="omf-sec mb-3">🍴 Order Items</p>
                                  {renderItemsList(order,CUR,false)}
                                </div>
                                <div>
                                  <p className="omf-sec mb-3">📋 Details</p>
                                  <div className="space-y-2.5 text-sm">
                                    <div className="flex items-center gap-2.5" style={{color:'#7a6a3a'}}><span>🕐</span><span>{order.createdAt?.toDate?.().toLocaleString()||'N/A'}</span></div>
                                    {order.customerPhone&&<div className="flex items-center gap-2.5" style={{color:'#7a6a3a'}}><span>📞</span><span>{order.customerPhone}</span></div>}
                                    {order.orderType==='delivery'&&order.deliveryAddress&&<div className="flex items-start gap-2.5" style={{color:'#7a6a3a'}}><span>📍</span><span>{order.deliveryAddress}</span></div>}
                                    {order?.orderType==='delivery'&&(
                                      <div className="text-sm mt-1">
                                        <strong style={{color:'#D4A017'}}>🛵 Delivery Address:</strong>
                                        <div className="text-white mt-0.5">{order?.deliveryAddress||'N/A'}</div>
                                      </div>
                                    )}
                                    {order.specialInstructions&&(
                                      <div className="mt-3 p-3 rounded-xl" style={{background:'rgba(212,160,23,0.1)',border:'1px solid rgba(212,160,23,0.2)'}}>
                                        <p className="text-xs font-black mb-1" style={{color:'#D4A017'}}>📝 Special Instructions</p>
                                        <p className="text-white text-sm">{order.specialInstructions}</p>
                                      </div>
                                    )}
                                    <div className="text-xs mt-1" style={{color:'#7a6a3a'}}>
                                      {order.paymentMode==='counter'?'🏪 Pay at Counter':order.paymentMode==='table'?'🪑 Pay on Table':'📱 Prepaid (UPI)'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Mobile Cards ───────────────────────────────────── */}
          <div className="lg:hidden space-y-3">
            {filteredOrders.map((order,oi)=>{
              const sb=getSt(order.orderStatus); const pb=getPay(order.paymentStatus);
              const CUR=order.currencySymbol||cafeCurrency;
              return (
                <div key={order.id} data-testid={`order-card-${order.id}`}
                  className="omf-in" style={{animationDelay:`${Math.min(oi*35,350)}ms`,animationFillMode:'both',background:'#120f00',border:'1.5px solid rgba(255,255,255,0.07)',borderRadius:'16px',overflow:'hidden',transition:'border-color 200ms'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(212,160,23,0.22)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.07)';}}
                >
                  {/* Card top */}
                  <div className="p-4 flex items-center justify-between cursor-pointer" onClick={()=>setExpandedOrder(expandedOrder===order.id?null:order.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0" style={{background:'rgba(212,160,23,0.1)',border:'1.5px solid rgba(212,160,23,0.2)'}}>
                        {orderTypeIcon(order.orderType)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="omf-ordnum font-black text-sm">{fmtOrd(order.orderNumber)}</span>
                        </div>
                        <p className="text-white font-bold text-sm">{order.customerName||'—'}</p>
                        <p className="text-xs" style={{color:'#7a6a3a'}}>{order.customerPhone||'—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-black text-sm" style={{color:'#D4A017'}}>💵 {CUR}{(order.totalAmount||order.total||0).toFixed(0)}</span>
                      <span className="omf-badge capitalize" style={{background:sb.bg,color:sb.color,borderColor:sb.bd}}>{sb.emoji} {sb.label}</span>
                    </div>
                  </div>

                  {/* Meta strip */}
                  <div className="px-4 pb-3.5 flex flex-wrap items-center gap-2" style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                    <span className="text-xs font-medium capitalize" style={{color:'#7a6a3a'}}>{orderTypeIcon(order.orderType)} {order.orderType}</span>
                    {order.orderType==='dine-in'&&order.tableNumber&&<span className="text-xs text-white font-bold">· Table {order.tableNumber}</span>}
                    {order.orderType==='delivery'&&order.deliveryAddress&&<span className="text-xs truncate max-w-[160px]" style={{color:'#7a6a3a'}}>📍 {order.deliveryAddress}</span>}
                    <span className="text-xs font-medium" style={{color:'#7a6a3a'}}>· 🍴 {getItemsCount(order.items)}</span>
                    <span className="omf-badge" style={{background:pb.bg,color:pb.color,borderColor:pb.bd}}>{pb.emoji} {order.paymentStatus||'pending'}</span>
                  </div>

                  {/* Expanded */}
                  {expandedOrder===order.id&&(
                    <div className="px-4 pb-5 space-y-4" style={{borderTop:'1px solid rgba(212,160,23,0.08)'}}>
                      <div className="pt-4">
                        <p className="omf-sec mb-3">🍴 Items</p>
                        {renderItemsList(order,CUR,true)}
                      </div>

                      {order?.orderType==='delivery'&&(
                        <div className="p-3 rounded-xl" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
                          <strong style={{color:'#D4A017'}}>🛵 Delivery Address</strong>
                          <div className="text-white mt-1 text-sm">{order?.deliveryAddress||'N/A'}</div>
                        </div>
                      )}

                      {order.specialInstructions&&(
                        <div className="p-3 rounded-xl" style={{background:'rgba(212,160,23,0.1)',border:'1px solid rgba(212,160,23,0.2)'}}>
                          <p className="text-xs font-black mb-1" style={{color:'#D4A017'}}>📝 Special Instructions</p>
                          <p className="text-white text-sm">{order.specialInstructions}</p>
                        </div>
                      )}

                      <div className="flex gap-2" onClick={e=>e.stopPropagation()}>
                        <select value={order.orderStatus||'new'} onChange={e=>updateOrderStatus(order.id,e.target.value)} className="omf-select flex-1" style={{padding:'9px 12px',fontSize:13,borderRadius:12}}>
                          <option value="new">🆕 New</option><option value="preparing">👨‍🍳 Preparing</option><option value="completed">✅ Done</option><option value="cancelled">❌ Cancelled</option>
                        </select>
                        <select value={order.paymentStatus||'pending'} onChange={e=>updatePaymentStatus(order.id,e.target.value)} className="omf-select flex-1" style={{padding:'9px 12px',fontSize:13,borderRadius:12}}>
                          <option value="pending">⏳ Pending</option><option value="paid">💰 Paid</option>
                        </select>
                      </div>

                      <div className="flex gap-2" onClick={e=>e.stopPropagation()}>
                        <button onClick={e=>handleViewInvoice(order.id,e)} disabled={invoiceLoading===order.id} className="omf-btn omf-btn-yellow flex-1 justify-center py-2.5" style={{borderRadius:12}}>
                          <Eye className="w-4 h-4"/>{invoiceLoading===order.id?'⏳ Loading…':'🧾 View Bill'}
                        </button>
                        <button onClick={e=>handleDownloadInvoice(order.id,e)} disabled={invoiceLoading===order.id} className="omf-btn omf-btn-ghost flex-1 justify-center py-2.5" style={{borderRadius:12}}>
                          <FileText className="w-4 h-4"/>📄 PDF
                        </button>
                      </div>
                      {order.customerPhone&&(
                        <div onClick={e=>e.stopPropagation()}>
                          <button onClick={e=>handleSendInvoiceWA(order,e)} className="omf-btn omf-btn-green w-full justify-center py-2.5" style={{borderRadius:12}}>
                            <MessageSquare className="w-4 h-4"/>💬 Send via WhatsApp
                          </button>
                        </div>
                      )}
                      {order.orderStatus!=='completed'&&order.orderStatus!=='cancelled'&&(
                        <div onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>setAddItemsOrder(order)} data-testid={`add-items-mobile-${order.id}`} className="omf-btn omf-btn-blue w-full justify-center py-2.5" style={{borderRadius:12}}>
                            <Plus className="w-4 h-4"/>➕ Add Items to Order
                          </button>
                        </div>
                      )}
                      <div onClick={e=>e.stopPropagation()}>
                        {deleteConfirmId===order.id?(
                          <div className="flex gap-2">
                            <button onClick={()=>handleSoftDelete(order.id)} disabled={deleting} className="omf-btn flex-1 justify-center py-2.5" style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:12}}>{deleting?'⏳ Removing…':'🗑️ Yes, Remove'}</button>
                            <button onClick={()=>setDeleteConfirmId(null)} className="omf-btn omf-btn-ghost flex-1 justify-center py-2.5" style={{borderRadius:12}}>✗ Cancel</button>
                          </div>
                        ):(
                          <button onClick={()=>setDeleteConfirmId(order.id)} className="omf-btn omf-btn-ghost w-full justify-center py-2.5" style={{borderRadius:12,color:'#5a4a1a'}}>
                            <Trash2 className="w-3.5 h-3.5"/>🗑️ Remove Order
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 py-2">
            <span>🍽️</span>
            <p className="text-xs font-bold" style={{color:'#7a6a3a'}}>
              {filteredOrders.length} order{filteredOrders.length!==1?'s':''} · Live kitchen feed active
            </p>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'#D4A017'}}/>
          </div>
        </>
      )}
    </div>
  );
};

export default OrdersManagement;
