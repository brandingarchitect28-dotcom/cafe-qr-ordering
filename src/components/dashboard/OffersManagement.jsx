import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, X, Package, Percent, Gift, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import MediaUpload from '../MediaUpload';
import { useTheme } from '../../hooks/useTheme';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Inject premium food-theme CSS once ───────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('ofm2-food-css')) {
  const el = document.createElement('style');
  el.id = 'ofm2-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');

    .ofm2 { font-family: 'Nunito', system-ui, sans-serif; }
    .ofm2-title { font-family: 'Fredoka One', system-ui, sans-serif !important; letter-spacing: 0.01em; }

    /* ── Main cards ── */
    .ofm2-card {
      background: linear-gradient(160deg, #1a1208 0%, #130e05 100%);
      border: 1.5px solid rgba(255,140,0,0.14);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 220ms, box-shadow 220ms, transform 200ms;
      position: relative;
    }
    .ofm2-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, #FF7A20, #FFBE0B, #FF7A20);
      opacity: 0; transition: opacity 200ms;
    }
    .ofm2-card:hover { border-color: rgba(255,140,0,0.32); box-shadow: 0 10px 36px rgba(0,0,0,0.6); transform: translateY(-3px); }
    .ofm2-card:hover::before { opacity: 1; }

    /* ── Flat utility card ── */
    .ofm2-flat {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 14px;
    }

    /* ── Inner section boxes ── */
    .ofm2-section {
      background: rgba(255,140,0,0.04);
      border: 1.5px solid rgba(255,140,0,0.12);
      border-radius: 13px;
      padding: 16px;
    }

    /* ── Sub-card (item rows etc.) ── */
    .ofm2-subcard {
      background: rgba(255,255,255,0.03);
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 10px;
    }

    /* ── Buttons ── */
    .ofm2-btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-family: 'Nunito', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 7px 14px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .ofm2-btn:hover  { transform: translateY(-1px); filter: brightness(1.10); }
    .ofm2-btn:active { transform: scale(0.96); }

    .ofm2-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.30); }
    .ofm2-btn-orange:hover { box-shadow: 0 5px 18px rgba(255,120,0,0.45); }
    .ofm2-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .ofm2-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .ofm2-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .ofm2-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .ofm2-btn-green  { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.22); }
    .ofm2-btn-green:hover  { background: rgba(16,185,129,0.22); }
    .ofm2-btn-yellow { background: rgba(255,190,11,0.12); color: #fbbf24; border-color: rgba(255,190,11,0.22); }
    .ofm2-btn-yellow:hover { background: rgba(255,190,11,0.22); }

    /* ── Inputs ── */
    .ofm2-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 11px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'Nunito', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .ofm2-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.10); }
    .ofm2-input::placeholder { color: #3d3020; }
    .ofm2-input:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Select ── */
    .ofm2-select {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 11px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'Nunito', system-ui, sans-serif;
      outline: none; width: 100%; cursor: pointer; transition: border-color 180ms;
    }
    .ofm2-select:focus { border-color: rgba(255,140,0,0.55); }
    .ofm2-select option { background: #1c1509; }

    /* ── Labels ── */
    .ofm2-label {
      display: block; font-size: 11px; font-weight: 900; margin-bottom: 6px;
      color: #a08060; text-transform: uppercase; letter-spacing: 0.07em;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    /* ── Section heading ── */
    .ofm2-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #FF7A20; display: flex; align-items: center; gap: 5px;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    /* ── Badges ── */
    .ofm2-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    /* ── Stat cards ── */
    .ofm2-stat {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 13px;
      padding: 14px 16px;
      display: flex; align-items: center; gap: 12px;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .ofm2-stat:hover { border-color: rgba(255,140,0,0.22); box-shadow: 0 4px 18px rgba(0,0,0,0.4); }

    /* ── Bottom sheet ── */
    .ofm2-sheet {
      background: linear-gradient(180deg, #1e1408 0%, #150f06 100%);
      border: 1.5px solid rgba(255,140,0,0.18);
      box-shadow: 0 -20px 60px rgba(255,120,0,0.14);
    }
    .ofm2-sheet-grip { width:36px; height:4px; border-radius:4px; background:rgba(255,140,0,0.28); }

    /* ── Toggle ── */
    .ofm2-toggle-track {
      width:40px; height:22px; border-radius:11px;
      display:flex; align-items:center; padding:2px;
      cursor:pointer; transition:background 200ms; flex-shrink:0;
    }
    .ofm2-toggle-thumb {
      width:18px; height:18px; border-radius:50%; background:#fff;
      transition:transform 200ms; box-shadow:0 1px 4px rgba(0,0,0,0.35);
    }

    /* ── Menu item picker grid buttons ── */
    .ofm2-picker-item {
      padding: 10px 12px; border-radius: 10px;
      border: 1.5px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      text-align: left; cursor: pointer;
      transition: all 180ms; font-family: 'Nunito', system-ui, sans-serif;
    }
    .ofm2-picker-item:hover { border-color: rgba(255,140,0,0.3); background: rgba(255,140,0,0.06); }
    .ofm2-picker-item-selected { border-color: rgba(255,140,0,0.45) !important; background: rgba(255,140,0,0.10) !important; }

    /* ── Offer type selector buttons ── */
    .ofm2-type-btn {
      padding: 16px; border-radius: 13px;
      border: 1.5px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      text-align: left; cursor: pointer;
      transition: all 200ms; font-family: 'Nunito', system-ui, sans-serif;
    }
    .ofm2-type-btn:hover { border-color: rgba(255,140,0,0.28); background: rgba(255,140,0,0.06); transform: translateY(-1px); }
    .ofm2-type-btn-active { border-color: rgba(255,140,0,0.50) !important; background: rgba(255,140,0,0.12) !important; box-shadow: 0 0 0 3px rgba(255,140,0,0.08); }

    /* ── Scrollbar ── */
    .ofm2-scroll::-webkit-scrollbar { width:4px; height:4px; }
    .ofm2-scroll::-webkit-scrollbar-track { background:transparent; }
    .ofm2-scroll::-webkit-scrollbar-thumb { background:rgba(255,140,0,0.25); border-radius:4px; }

    /* ── Entrance anim ── */
    @keyframes ofm2In { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .ofm2-in { animation: ofm2In 260ms ease forwards; }

    /* ── Size picker highlight ── */
    .ofm2-size-btn {
      padding: 9px 18px; border-radius: 10px;
      border: 1.5px solid rgba(255,140,0,0.35);
      background: rgba(255,140,0,0.08);
      color: #FF7A20; font-weight: 800; font-size: 13px;
      cursor: pointer; transition: all 180ms;
      font-family: 'Nunito', system-ui, sans-serif;
    }
    .ofm2-size-btn:hover { background: rgba(255,140,0,0.20); transform: translateY(-1px); }
  `;
  document.head.appendChild(el);
}

// ─── OFFER_TYPES — UNCHANGED ──────────────────────────────────────────────────
const OFFER_TYPES = [
  { id: 'combo',       label: 'Combo Deal',  icon: Package, description: 'Bundle items at special price', emoji: '🍱' },
  { id: 'discount',    label: 'Discount',     icon: Percent, description: 'Percentage or flat discount',   emoji: '🏷️' },
  { id: 'buy_x_get_y', label: 'Buy X Get Y', icon: Gift,    description: 'Buy items, get free items',     emoji: '🎁' },
];

// ─── getSizeOptions — UNCHANGED ───────────────────────────────────────────────
const getSizeOptions = (item) => {
  if (!item?.sizePricing?.enabled) return [];
  const sp = item.sizePricing;
  return [
    sp.small  != null && sp.small  !== '' && { key: 'small',  label: 'Small',  price: parseFloat(sp.small)  },
    sp.medium != null && sp.medium !== '' && { key: 'medium', label: 'Medium', price: parseFloat(sp.medium) },
    sp.large  != null && sp.large  !== '' && { key: 'large',  label: 'Large',  price: parseFloat(sp.large)  },
  ].filter(Boolean);
};

// ─── itemKey — UNCHANGED ──────────────────────────────────────────────────────
const itemKey = (itemId, sizeKey) => sizeKey ? `${itemId}_${sizeKey}` : itemId;

// ─── fmtP — UNCHANGED ────────────────────────────────────────────────────────
const fmtP = (n) => (parseFloat(n) || 0).toFixed(2);

// ─── Main Component ───────────────────────────────────────────────────────────
const OffersManagement = () => {
  const { user }  = useAuth();
  const cafeId    = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();                   // UNCHANGED — useTheme kept
  const CUR = cafe?.currencySymbol || '₹';

  // ── State — ALL UNCHANGED ─────────────────────────────────────────────────
  const [showForm,      setShowForm     ] = useState(false);
  const [editingOffer,  setEditingOffer ] = useState(null);
  const [uploading,     setUploading    ] = useState(false);
  const [pendingSizeItem, setPendingSizeItem] = useState(null);

  const [formData, setFormData] = useState({
    title:          '',
    description:    '',
    type:           'combo',
    items:          [],
    comboPrice:     '',
    discountAmount: '',
    discountType:   'percentage',
    buyQuantity:    1,
    getQuantity:    1,
    getItemId:      '',
    getItemName:    '',
    getItemPrice:   0,
    getItemSize:    null,
    getItemSizeKey: null,
    bannerImage:    '',
    active:         true,
  });

  const { data: offers,    loading } = useCollection('offers',    cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: menuItems          } = useCollection('menuItems', cafeId ? [where('cafeId', '==', cafeId)] : []);

  // ── originalPrice — UNCHANGED ─────────────────────────────────────────────
  const originalPrice = useMemo(() =>
    formData.items.reduce((sum, i) => sum + (i.itemPrice * i.quantity), 0),
  [formData.items]);

  // ── savings — UNCHANGED ───────────────────────────────────────────────────
  const savings = useMemo(() => {
    if (formData.type === 'combo' && formData.comboPrice) {
      return originalPrice - parseFloat(formData.comboPrice);
    }
    if (formData.type === 'discount' && formData.discountAmount) {
      if (formData.discountType === 'percentage') {
        return originalPrice * (parseFloat(formData.discountAmount) / 100);
      }
      return parseFloat(formData.discountAmount);
    }
    return 0;
  }, [formData, originalPrice]);

  // ── handleBannerChange — UNCHANGED ────────────────────────────────────────
  const handleBannerChange = (url) => setFormData(prev => ({ ...prev, bannerImage: url }));

  // ── addItemToOffer — UNCHANGED ────────────────────────────────────────────
  const addItemToOffer = (menuItem, forFreeSlot = false) => {
    const sizeOptions = getSizeOptions(menuItem);
    if (sizeOptions.length > 0) {
      setPendingSizeItem({ item: menuItem, forFreeSlot });
      return;
    }
    if (forFreeSlot) {
      setFormData(prev => ({
        ...prev,
        getItemId:      menuItem.id,
        getItemName:    menuItem.name,
        getItemPrice:   parseFloat(menuItem.price) || 0,
        getItemSize:    null,
        getItemSizeKey: null,
      }));
      return;
    }
    _addOfferItem(menuItem, null, null, parseFloat(menuItem.price) || 0);
  };

  // ── confirmSizeSelection — UNCHANGED ─────────────────────────────────────
  const confirmSizeSelection = (sizeOpt) => {
    if (!pendingSizeItem) return;
    const { item, forFreeSlot } = pendingSizeItem;
    setPendingSizeItem(null);
    if (forFreeSlot) {
      setFormData(prev => ({
        ...prev,
        getItemId:      item.id,
        getItemName:    item.name,
        getItemPrice:   sizeOpt.price,
        getItemSize:    sizeOpt.label,
        getItemSizeKey: sizeOpt.key,
      }));
      return;
    }
    _addOfferItem(item, sizeOpt.label, sizeOpt.key, sizeOpt.price);
  };

  // ── _addOfferItem — UNCHANGED ─────────────────────────────────────────────
  const _addOfferItem = (menuItem, sizeLabel, sizeKey, resolvedPrice) => {
    const key = itemKey(menuItem.id, sizeKey);
    setFormData(prev => {
      const existing = prev.items.find(i => itemKey(i.itemId, i.selectedSizeKey) === key);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map(i =>
            itemKey(i.itemId, i.selectedSizeKey) === key
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        ...prev,
        items: [...prev.items, {
          itemId:          menuItem.id,
          itemName:        menuItem.name,
          itemPrice:       resolvedPrice,
          quantity:        1,
          selectedSize:    sizeLabel,
          selectedSizeKey: sizeKey,
          hasSizes:        !!sizeKey,
        }],
      };
    });
  };

  // ── removeItemFromOffer — UNCHANGED ──────────────────────────────────────
  const removeItemFromOffer = (itemId, sizeKey) => {
    const key = itemKey(itemId, sizeKey);
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => itemKey(i.itemId, i.selectedSizeKey) !== key),
    }));
  };

  // ── updateItemQuantity — UNCHANGED ────────────────────────────────────────
  const updateItemQuantity = (itemId, sizeKey, quantity) => {
    if (quantity < 1) { removeItemFromOffer(itemId, sizeKey); return; }
    const key = itemKey(itemId, sizeKey);
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(i =>
        itemKey(i.itemId, i.selectedSizeKey) === key ? { ...i, quantity } : i
      ),
    }));
  };

  // ── handleSubmit — UNCHANGED ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cafeId) { toast.error('Cafe ID not found'); return; }
    if (formData.items.length === 0) { toast.error('Please add at least one menu item to the offer'); return; }
    try {
      const offerData = {
        cafeId,
        title:        formData.title,
        description:  formData.description,
        type:         formData.type,
        items:        formData.items,
        bannerImage:  formData.bannerImage,
        active:       formData.active,
        originalPrice,
      };
      if (formData.type === 'combo') {
        offerData.comboPrice = parseFloat(formData.comboPrice) || originalPrice;
        offerData.savings    = savings;
      } else if (formData.type === 'discount') {
        offerData.discountAmount = parseFloat(formData.discountAmount) || 0;
        offerData.discountType   = formData.discountType;
        offerData.savings        = savings;
      } else if (formData.type === 'buy_x_get_y') {
        offerData.buyQuantity   = parseInt(formData.buyQuantity)  || 1;
        offerData.getQuantity   = parseInt(formData.getQuantity)  || 1;
        offerData.getItemId      = formData.getItemId;
        offerData.getItemName    = formData.getItemName;
        offerData.getItemPrice   = formData.getItemPrice;
        offerData.getItemSize    = formData.getItemSize    || null;
        offerData.getItemSizeKey = formData.getItemSizeKey || null;
      }
      if (editingOffer) {
        await updateDoc(doc(db, 'offers', editingOffer.id), offerData);
        toast.success('🎉 Offer updated!');
      } else {
        await addDoc(collection(db, 'offers'), offerData);
        toast.success('🚀 Offer created!');
      }
      resetForm();
    } catch (error) {
      console.error('Error saving offer:', error);
      toast.error('Failed to save offer');
    }
  };

  // ── handleEdit — UNCHANGED ────────────────────────────────────────────────
  const handleEdit = (offer) => {
    setEditingOffer(offer);
    setFormData({
      title:          offer.title          || '',
      description:    offer.description    || '',
      type:           offer.type           || 'combo',
      items:          offer.items          || [],
      comboPrice:     offer.comboPrice?.toString()     || '',
      discountAmount: offer.discountAmount?.toString() || '',
      discountType:   offer.discountType   || 'percentage',
      buyQuantity:    offer.buyQuantity    || 1,
      getQuantity:    offer.getQuantity    || 1,
      getItemId:      offer.getItemId      || '',
      getItemName:    offer.getItemName    || '',
      getItemPrice:   offer.getItemPrice   || 0,
      getItemSize:    offer.getItemSize    || null,
      getItemSizeKey: offer.getItemSizeKey || null,
      bannerImage:    offer.bannerImage    || '',
      active:         offer.active !== false,
    });
    setShowForm(true);
  };

  // ── handleDelete — UNCHANGED ──────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this offer?')) return;
    try {
      await deleteDoc(doc(db, 'offers', id));
      toast.success('🗑️ Offer deleted');
    } catch (error) {
      toast.error('Failed to delete offer');
    }
  };

  // ── toggleActive — UNCHANGED ──────────────────────────────────────────────
  const toggleActive = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'offers', id), { active: !currentStatus });
      toast.success('Offer status updated');
    } catch (error) {
      toast.error('Failed to update offer');
    }
  };

  // ── resetForm — UNCHANGED ─────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({
      title: '', description: '', type: 'combo', items: [],
      comboPrice: '', discountAmount: '', discountType: 'percentage',
      buyQuantity: 1, getQuantity: 1,
      getItemId: '', getItemName: '', getItemPrice: 0,
      getItemSize: null, getItemSizeKey: null,
      bannerImage: '', active: true,
    });
    setEditingOffer(null);
    setShowForm(false);
    setPendingSizeItem(null);
  };

  // ── helpers — UNCHANGED ───────────────────────────────────────────────────
  const getOfferTypeLabel = (type) => OFFER_TYPES.find(t => t.id === type)?.label || type;
  const getOfferTypeIcon  = (type) => OFFER_TYPES.find(t => t.id === type)?.icon  || Package;
  const getOfferTypeEmoji = (type) => OFFER_TYPES.find(t => t.id === type)?.emoji || '🏷️';

  // ── stats (visual-only) ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all    = offers || [];
    const total  = all.length;
    const active = all.filter(o => o.active).length;
    const combos = all.filter(o => o.type === 'combo').length;
    const bogo   = all.filter(o => o.type === 'buy_x_get_y').length;
    return { total, active, combos, bogo };
  }, [offers]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="ofm2 space-y-5 relative">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🏷️</div>
          <div>
            <h2 className="ofm2-title text-2xl font-black text-white">Offers & Deals</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#7a6a55' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
              {offers?.length ?? 0} offer{(offers?.length ?? 0) !== 1 ? 's' : ''} · delight your customers
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
          data-testid="add-offer-btn"
          onClick={() => setShowForm(true)}
          className="ofm2-btn ofm2-btn-orange"
          style={{ padding: '10px 18px', fontSize: 13, borderRadius: 12 }}
        >
          <Plus className="w-4 h-4" />🎊 Create Offer
        </motion.button>
      </div>

      {/* ── Stats row (visual-only, no logic) ──────────────────────────────── */}
      {offers && offers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { emoji: '🏷️', label: 'Total Offers',  value: stats.total,  color: '#FF7A20' },
            { emoji: '✅', label: 'Active Now',     value: stats.active, color: '#34d399' },
            { emoji: '🍱', label: 'Combo Deals',    value: stats.combos, color: '#fbbf24' },
            { emoji: '🎁', label: 'Buy X Get Y',    value: stats.bogo,   color: '#a78bfa' },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="ofm2-stat"
            >
              <div className="text-2xl">{s.emoji}</div>
              <div>
                <p className="ofm2-title font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Form panel ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            className="ofm2-sheet rounded-2xl overflow-hidden"
          >
            {/* Form header */}
            <div
              className="flex items-center justify-between px-6 py-5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,140,0,0.14)' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{editingOffer ? '✏️' : '🎊'}</span>
                <div>
                  <h3 className="ofm2-title text-white font-bold text-xl">
                    {editingOffer ? 'Edit Offer' : 'Create New Offer'}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>
                    {editingOffer ? `Editing: ${editingOffer.title}` : 'Set up a new deal for your customers 🚀'}
                  </p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.2)' }}
              >
                <X className="w-4 h-4" style={{ color: '#FF7A20' }} />
              </button>
            </div>

            {/* ── Form body ─────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6 ofm2-scroll overflow-y-auto" style={{ maxHeight: '82vh' }}>

              {/* ── Offer Type ── */}
              <div>
                <label className="ofm2-label">🎯 Offer Type</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {OFFER_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isActive = formData.type === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, type: type.id }))}
                        className={`ofm2-type-btn${isActive ? ' ofm2-type-btn-active' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="text-2xl">{type.emoji}</span>
                          <Icon className="w-4 h-4" style={{ color: isActive ? '#FF7A20' : '#7a6a55' }} />
                          <span className="font-black text-sm" style={{ color: isActive ? '#FF7A20' : '#fff8ee' }}>
                            {type.label}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: '#7a6a55' }}>{type.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Basic Info ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="ofm2-label">🏷️ Offer Title</label>
                  <input
                    type="text"
                    data-testid="offer-title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="ofm2-input"
                    placeholder="e.g., Breakfast Combo Deal"
                    required
                  />
                </div>
                <div>
                  <label className="ofm2-label">📝 Description</label>
                  <input
                    type="text"
                    data-testid="offer-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="ofm2-input"
                    placeholder="Coffee + Sandwich at special price"
                    required
                  />
                </div>
              </div>

              {/* ── Menu Item Picker ── */}
              <div>
                <label className="ofm2-label">
                  🍽️ {formData.type === 'buy_x_get_y' ? 'Items Customer Must Buy' : 'Select Menu Items'}
                </label>
                <p className="text-xs mb-3" style={{ color: '#7a6a55' }}>
                  {formData.type === 'buy_x_get_y'
                    ? 'Tap to add. Items with sizes will ask for size. 📏'
                    : 'Tap to add items. Items with S/M/L sizes will ask for size. 📏'}
                </p>

                {/* ── Inline size picker for bought items ── */}
                <AnimatePresence>
                  {pendingSizeItem && !pendingSizeItem.forFreeSlot && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      className="mb-3 p-4 rounded-xl"
                      style={{ background: 'rgba(255,140,0,0.07)', border: '1.5px solid rgba(255,140,0,0.3)' }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white text-sm font-black">
                          📏 Select size for:{' '}
                          <span style={{ color: '#FF7A20' }}>{pendingSizeItem.item.name}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setPendingSizeItem(null)}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.2)' }}
                        >
                          <X className="w-3.5 h-3.5" style={{ color: '#FF7A20' }} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {getSizeOptions(pendingSizeItem.item).map(sz => (
                          <button
                            key={sz.key}
                            type="button"
                            onClick={() => confirmSizeSelection(sz)}
                            className="ofm2-size-btn"
                          >
                            {sz.key === 'small' ? '☕' : sz.key === 'medium' ? '🥤' : '🧋'} {sz.label} — {CUR}{fmtP(sz.price)}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Item grid */}
                <div
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 ofm2-scroll rounded-xl"
                  style={{ background: '#1c1509', border: '1.5px solid rgba(255,255,255,0.07)' }}
                >
                  {menuItems?.map((item) => {
                    const hasSizes   = getSizeOptions(item).length > 0;
                    const isSelected = formData.items.some(i => i.itemId === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addItemToOffer(item, false)}
                        className={`ofm2-picker-item${isSelected ? ' ofm2-picker-item-selected' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-sm font-bold truncate" style={{ color: isSelected ? '#FF7A20' : '#fff8ee' }}>
                            {item.name}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#FF7A20' }} />}
                        </div>
                        {hasSizes ? (
                          <span className="text-xs flex items-center gap-1" style={{ color: '#7a6a55' }}>
                            <ChevronDown className="w-3 h-3" />📏 Sizes available
                          </span>
                        ) : (
                          <span className="text-sm font-black" style={{ color: '#FF7A20' }}>{CUR}{fmtP(item.price)}</span>
                        )}
                      </button>
                    );
                  })}
                  {(!menuItems || menuItems.length === 0) && (
                    <p className="col-span-full text-center py-6 text-sm" style={{ color: '#7a6a55' }}>
                      🍽️ No menu items available yet
                    </p>
                  )}
                </div>
              </div>

              {/* ── Selected Items list ── */}
              <AnimatePresence>
                {formData.items.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <label className="ofm2-label">🧺 Selected Items ({formData.items.length})</label>
                    <div className="ofm2-section space-y-2">
                      {formData.items.map((item) => {
                        const key = itemKey(item.itemId, item.selectedSizeKey);
                        return (
                          <div
                            key={key}
                            className="ofm2-subcard flex items-center justify-between p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-sm" style={{ color: '#fff8ee' }}>{item.itemName}</span>
                                {item.selectedSize && (
                                  <span
                                    className="text-xs px-2 py-0.5 rounded-lg font-bold"
                                    style={{ background: 'rgba(255,140,0,0.15)', color: '#FF7A20', border: '1px solid rgba(255,140,0,0.3)' }}
                                  >
                                    {item.selectedSize === 'Small' ? '☕' : item.selectedSize === 'Medium' ? '🥤' : '🧋'} {item.selectedSize}
                                  </span>
                                )}
                                <span className="text-xs" style={{ color: '#7a6a55' }}>{CUR}{fmtP(item.itemPrice)} each</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {/* Qty controls */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(item.itemId, item.selectedSizeKey, item.quantity - 1)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white transition-all"
                                  style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.12)' }}
                                >−</button>
                                <span className="font-black text-sm text-white w-5 text-center">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(item.itemId, item.selectedSizeKey, item.quantity + 1)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center font-black text-black transition-all"
                                  style={{ background: '#FF7A20' }}
                                >+</button>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItemFromOffer(item.itemId, item.selectedSizeKey)}
                                className="ofm2-btn ofm2-btn-red"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {/* Original price total */}
                      <div
                        className="flex justify-between items-center pt-3 mt-1"
                        style={{ borderTop: '1px solid rgba(255,140,0,0.12)' }}
                      >
                        <span className="text-sm font-bold" style={{ color: '#7a6a55' }}>🧮 Original Price</span>
                        <span className="ofm2-title font-black text-lg" style={{ color: '#FF7A20' }}>{CUR}{fmtP(originalPrice)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Type-specific fields ── */}

              {/* Combo Price */}
              {formData.type === 'combo' && formData.items.length > 0 && (
                <div>
                  <label className="ofm2-label">💰 Combo Price</label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-44">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-sm" style={{ color: '#FF7A20' }}>{CUR}</span>
                      <input
                        type="number"
                        value={formData.comboPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, comboPrice: e.target.value }))}
                        className="ofm2-input"
                        style={{ paddingLeft: '1.8rem' }}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    {savings > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-sm"
                        style={{ background: 'rgba(16,185,129,0.14)', color: '#34d399', border: '1.5px solid rgba(16,185,129,0.25)' }}
                      >
                        🎉 Customer saves {CUR}{fmtP(savings)}!
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {/* Discount fields */}
              {formData.type === 'discount' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="ofm2-label">📊 Discount Type</label>
                    <select
                      value={formData.discountType}
                      onChange={(e) => setFormData(prev => ({ ...prev, discountType: e.target.value }))}
                      className="ofm2-select"
                    >
                      <option value="percentage">📊 Percentage (%)</option>
                      <option value="flat">💰 Flat Amount ({CUR})</option>
                    </select>
                  </div>
                  <div>
                    <label className="ofm2-label">
                      {formData.discountType === 'percentage' ? '📊 Discount (%)' : `💰 Discount Amount (${CUR})`}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-sm" style={{ color: '#FF7A20' }}>
                        {formData.discountType === 'percentage' ? '%' : CUR}
                      </span>
                      <input
                        type="number"
                        value={formData.discountAmount}
                        onChange={(e) => setFormData(prev => ({ ...prev, discountAmount: e.target.value }))}
                        className="ofm2-input"
                        style={{ paddingLeft: '1.8rem' }}
                        placeholder={formData.discountType === 'percentage' ? '10' : '50'}
                        min="0"
                        max={formData.discountType === 'percentage' ? '100' : undefined}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Buy X Get Y fields */}
              {formData.type === 'buy_x_get_y' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ofm2-label">🛒 Buy Quantity</label>
                      <input
                        type="number"
                        value={formData.buyQuantity}
                        onChange={(e) => setFormData(prev => ({ ...prev, buyQuantity: e.target.value }))}
                        className="ofm2-input"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="ofm2-label">🎁 Get Free Quantity</label>
                      <input
                        type="number"
                        value={formData.getQuantity}
                        onChange={(e) => setFormData(prev => ({ ...prev, getQuantity: e.target.value }))}
                        className="ofm2-input"
                        min="1"
                      />
                    </div>
                  </div>

                  {/* Free item picker */}
                  <div>
                    <label className="ofm2-label">🎁 Get Free Item</label>
                    <p className="text-xs mb-2" style={{ color: '#7a6a55' }}>Select the item the customer receives for free.</p>

                    {/* Current free item */}
                    {formData.getItemId && (
                      <div
                        className="mb-2 flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'rgba(255,140,0,0.07)', border: '1.5px solid rgba(255,140,0,0.28)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-black text-sm">🎁 {formData.getItemName}</span>
                            {formData.getItemSize && (
                              <span className="text-xs px-2 py-0.5 rounded-lg font-bold" style={{ background: 'rgba(255,140,0,0.15)', color: '#FF7A20', border: '1px solid rgba(255,140,0,0.3)' }}>
                                {formData.getItemSize}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: '#7a6a55' }}>({CUR}{fmtP(formData.getItemPrice)} — given free)</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            getItemId: '', getItemName: '', getItemPrice: 0,
                            getItemSize: null, getItemSizeKey: null,
                          }))}
                          className="ofm2-btn ofm2-btn-red"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Inline size picker for free item */}
                    <AnimatePresence>
                      {pendingSizeItem && pendingSizeItem.forFreeSlot && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                          className="mb-2 p-4 rounded-xl"
                          style={{ background: 'rgba(255,140,0,0.07)', border: '1.5px solid rgba(255,140,0,0.3)' }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-white text-sm font-black">
                              📏 Select size for free item:{' '}
                              <span style={{ color: '#FF7A20' }}>{pendingSizeItem.item.name}</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => setPendingSizeItem(null)}
                              className="w-6 h-6 rounded-full flex items-center justify-center"
                              style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.2)' }}
                            >
                              <X className="w-3.5 h-3.5" style={{ color: '#FF7A20' }} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getSizeOptions(pendingSizeItem.item).map(sz => (
                              <button
                                key={sz.key}
                                type="button"
                                onClick={() => confirmSizeSelection(sz)}
                                className="ofm2-size-btn"
                              >
                                {sz.key === 'small' ? '☕' : sz.key === 'medium' ? '🥤' : '🧋'} {sz.label} — {CUR}{fmtP(sz.price)}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Free item grid */}
                    {!formData.getItemId && (
                      <div
                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 ofm2-scroll rounded-xl"
                        style={{ background: '#1c1509', border: '1.5px solid rgba(255,255,255,0.07)' }}
                      >
                        {menuItems?.map(item => {
                          const hasSizes = getSizeOptions(item).length > 0;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => addItemToOffer(item, true)}
                              className="ofm2-picker-item"
                            >
                              <p className="text-sm font-bold truncate" style={{ color: '#fff8ee' }}>{item.name}</p>
                              {hasSizes ? (
                                <span className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#7a6a55' }}>
                                  <ChevronDown className="w-3 h-3" />📏 Sizes available
                                </span>
                              ) : (
                                <span className="text-sm font-black mt-0.5 block" style={{ color: '#FF7A20' }}>{CUR}{fmtP(item.price)}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Banner Image ── */}
              <div>
                <label className="ofm2-label">🖼️ Banner Image / GIF / Video (Optional)</label>
                <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(255,140,0,0.14)', background: 'rgba(255,140,0,0.03)' }}>
                  <MediaUpload
                    label=""
                    value={formData.bannerImage}
                    onChange={handleBannerChange}
                    storagePath={`offers/${cafeId}`}
                    maxSizeMB={20}
                    disabled={uploading}
                  />
                </div>
              </div>

              {/* ── Active Toggle ── */}
              <div
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)' }}
              >
                <div>
                  <p className="text-white font-black text-sm">⚡ Active Offer</p>
                  <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>Visible to customers right now</p>
                </div>
                {/* The original used a checkbox — we keep it but also add a toggle visual */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid="offer-active"
                    checked={formData.active}
                    onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                    className="sr-only"
                    id="ofm2-active-toggle"
                  />
                  <label
                    htmlFor="ofm2-active-toggle"
                    className="ofm2-toggle-track"
                    style={{ background: formData.active ? '#FF7A20' : '#2a2018', cursor: 'pointer' }}
                  >
                    <div className="ofm2-toggle-thumb" style={{ transform: formData.active ? 'translateX(18px)' : 'translateX(0)' }} />
                  </label>
                </div>
              </div>

              {/* ── Submit / Cancel ── */}
              <div className="flex gap-3 pt-1 pb-4">
                <motion.button
                  type="submit"
                  data-testid="save-offer-btn"
                  disabled={uploading || formData.items.length === 0}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
                  className="ofm2-btn ofm2-btn-orange flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ padding: '12px 20px', fontSize: 14, borderRadius: 12 }}
                >
                  {uploading
                    ? '⏳ Uploading…'
                    : editingOffer
                      ? '💾 Update Offer'
                      : '🚀 Create Offer'
                  }
                </motion.button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="ofm2-btn ofm2-btn-ghost"
                  style={{ padding: '12px 20px', fontSize: 14, borderRadius: 12 }}
                >
                  ✗ Cancel
                </button>
              </div>

            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Offers List ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-5xl animate-bounce">🏷️</div>
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading your offers…</p>
        </div>

      ) : offers && offers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {offers.map((offer, idx) => {
            const TypeIcon = getOfferTypeIcon(offer.type);
            const typeEmoji = getOfferTypeEmoji(offer.type);
            return (
              <motion.div
                key={offer.id}
                data-testid={`offer-${offer.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="ofm2-card"
              >
                {/* Banner image */}
                {offer.bannerImage && (
                  <div className="overflow-hidden" style={{ aspectRatio: '16/7' }}>
                    <img
                      src={offer.bannerImage}
                      alt={offer.title}
                      className="w-full h-full object-cover transition-transform duration-300"
                      style={{ transition: 'transform 350ms' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                  </div>
                )}

                {/* No banner placeholder */}
                {!offer.bannerImage && (
                  <div
                    className="flex items-center justify-center"
                    style={{ aspectRatio: '16/5', background: 'linear-gradient(135deg, #1a1208, #0f0a04)', fontSize: 40 }}
                  >
                    {typeEmoji}
                  </div>
                )}

                <div className="p-5 space-y-3">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-lg">{typeEmoji}</span>
                        <TypeIcon className="w-4 h-4" style={{ color: '#FF7A20' }} />
                        <span className="ofm2-sec text-xs">{getOfferTypeLabel(offer.type)}</span>
                      </div>
                      <h3 className="ofm2-title font-black text-white text-lg leading-tight">{offer.title}</h3>
                    </div>
                    <span
                      className="ofm2-badge flex-shrink-0"
                      style={offer.active
                        ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.22)' }
                        : { background: 'rgba(100,100,100,0.12)', color: '#888', borderColor: 'rgba(100,100,100,0.22)' }
                      }
                    >
                      {offer.active ? '✅ Active' : '⏸️ Inactive'}
                    </span>
                  </div>

                  {/* Description */}
                  {offer.description && (
                    <p className="text-sm" style={{ color: '#7a6a55' }}>{offer.description}</p>
                  )}

                  {/* Items included */}
                  {offer.items && offer.items.length > 0 && (
                    <div className="ofm2-section space-y-2">
                      <p className="ofm2-sec text-xs mb-2">🧺 Includes</p>
                      <div className="flex flex-wrap gap-2">
                        {offer.items.map((item, i) => (
                          <span
                            key={i}
                            className="ofm2-badge"
                            style={{ background: 'rgba(255,140,0,0.10)', color: '#FF7A20', borderColor: 'rgba(255,140,0,0.22)' }}
                          >
                            🍽️ {item.itemName}
                            {item.selectedSize && (
                              <span style={{ color: '#fbbf24' }}> ({item.selectedSize})</span>
                            )}
                            {' '}×{item.quantity}
                            <span style={{ color: '#7a6a55', fontSize: 10 }}> {CUR}{fmtP(item.itemPrice)}</span>
                          </span>
                        ))}
                      </div>

                      {/* Combo price display */}
                      {offer.type === 'combo' && offer.comboPrice && (
                        <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid rgba(255,140,0,0.12)' }}>
                          <span className="text-sm line-through" style={{ color: '#4a3f35' }}>{CUR}{fmtP(offer.originalPrice)}</span>
                          <span className="ofm2-title font-black text-xl" style={{ color: '#FF7A20' }}>{CUR}{fmtP(offer.comboPrice)}</span>
                          {offer.savings > 0 && (
                            <span className="ofm2-badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.22)' }}>
                              🎉 Save {CUR}{fmtP(offer.savings)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Discount display */}
                      {offer.type === 'discount' && (
                        <div className="pt-2" style={{ borderTop: '1px solid rgba(255,140,0,0.12)' }}>
                          <span className="ofm2-title font-black text-lg" style={{ color: '#FF7A20' }}>
                            🏷️ {offer.discountType === 'percentage'
                              ? `${offer.discountAmount}% OFF`
                              : `${CUR}${fmtP(offer.discountAmount)} OFF`}
                          </span>
                        </div>
                      )}

                      {/* BOGO display */}
                      {offer.type === 'buy_x_get_y' && offer.getItemName && (
                        <div className="pt-2" style={{ borderTop: '1px solid rgba(255,140,0,0.12)' }}>
                          <span className="ofm2-title font-black text-base" style={{ color: '#FF7A20' }}>
                            🎁 Buy {offer.buyQuantity}, Get {offer.getQuantity}{' '}
                            {offer.getItemName}
                            {offer.getItemSize ? ` (${offer.getItemSize})` : ''} FREE!
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      data-testid={`edit-offer-${offer.id}`}
                      onClick={() => handleEdit(offer)}
                      className="ofm2-btn ofm2-btn-ghost flex-1 justify-center"
                      style={{ padding: '8px 12px', fontSize: 12, borderRadius: 10 }}
                    >
                      <Edit className="w-3.5 h-3.5" />✏️ Edit
                    </button>
                    <button
                      data-testid={`toggle-offer-${offer.id}`}
                      onClick={() => toggleActive(offer.id, offer.active)}
                      className={`ofm2-btn ${offer.active ? 'ofm2-btn-yellow' : 'ofm2-btn-green'}`}
                      style={{ padding: '8px 12px', fontSize: 12, borderRadius: 10 }}
                    >
                      {offer.active ? '⏸️ Pause' : '▶️ Activate'}
                    </button>
                    <button
                      data-testid={`delete-offer-${offer.id}`}
                      onClick={() => handleDelete(offer.id)}
                      className="ofm2-btn ofm2-btn-red"
                      style={{ padding: '8px 12px', fontSize: 12, borderRadius: 10 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

      ) : (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="ofm2-flat flex flex-col items-center justify-center py-20 gap-3 text-center"
        >
          <div className="text-7xl mb-2">🏷️</div>
          <p className="ofm2-title font-black text-white text-xl">No offers yet!</p>
          <p className="text-sm" style={{ color: '#7a6a55' }}>
            Create your first combo, discount, or Buy X Get Y deal 🚀
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
            onClick={() => setShowForm(true)}
            className="ofm2-btn ofm2-btn-orange mt-3"
            style={{ borderRadius: 12, padding: '12px 24px', fontSize: 14 }}
          >
            <Plus className="w-4 h-4" />🎊 Create First Offer
          </motion.button>
        </motion.div>
      )}
    </div>
  );
};

export default OffersManagement;
