import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Plus, Edit, Trash2, X, RefreshCw, Search,
  Utensils, ChefHat, Tag, FolderOpen, Image, Eye, EyeOff,
  Sparkles, Star, Flame, Dumbbell, Wheat, Package,
  Pill, Ruler, CheckCircle, Leaf, Beef,
  Coffee, CupSoda, GlassWater, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import MediaUpload, { MediaPreview } from '../MediaUpload';
import AddOnEditor from './AddOnEditor';
import { motion, AnimatePresence } from 'framer-motion';

if (typeof document !== 'undefined' && !document.getElementById('mm-food-css')) {
  const el = document.createElement('style');
  el.id = 'mm-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .mm { font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }
    .mm-card { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 16px; transition: border-color 200ms, box-shadow 200ms, transform 180ms; overflow: hidden; }
    .mm-card:hover { border-color: rgba(201,162,39,0.28); box-shadow: 0 8px 32px rgba(0,0,0,0.55); transform: translateY(-2px); }
    .mm-item-card { background: linear-gradient(160deg, #1a1208 0%, #130e05 100%); border: 1.5px solid rgba(201,162,39,0.14); border-radius: 16px; overflow: hidden; transition: border-color 220ms, box-shadow 220ms, transform 200ms; position: relative; }
    .mm-item-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #C9A227, #D4A800, #C9A227); opacity: 0; transition: opacity 200ms; }
    .mm-item-card:hover { border-color: rgba(201,162,39,0.35); box-shadow: 0 10px 36px rgba(0,0,0,0.6); transform: translateY(-3px); }
    .mm-item-card:hover::before { opacity: 1; }
    .mm-item-card-unavailable { opacity: 0.58; filter: grayscale(0.35); }
    .mm-btn { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Sans', system-ui, sans-serif; font-weight: 800; font-size: 12px; padding: 7px 14px; border-radius: 10px; border: 1.5px solid transparent; cursor: pointer; transition: all 180ms; white-space: nowrap; }
    .mm-btn:hover  { transform: translateY(-1px); filter: brightness(1.1); }
    .mm-btn:active { transform: scale(0.96); }
    .mm-btn-orange { background: linear-gradient(135deg,#C9A227,#A67C00); color:#fff; box-shadow: 0 3px 12px rgba(201,162,39,0.3); }
    .mm-btn-orange:hover { box-shadow: 0 5px 18px rgba(201,162,39,0.45); }
    .mm-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .mm-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .mm-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .mm-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .mm-btn-yellow { background: rgba(255,190,11,0.12); color: #fbbf24; border-color: rgba(255,190,11,0.22); }
    .mm-btn-yellow:hover { background: rgba(255,190,11,0.22); }
    .mm-btn-green  { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.22); }
    .mm-btn-green:hover  { background: rgba(16,185,129,0.22); }
    .mm-btn-blue   { background: rgba(99,102,241,0.12); color: #818cf8; border-color: rgba(99,102,241,0.22); }
    .mm-btn-blue:hover   { background: rgba(99,102,241,0.22); }
    .mm-input { background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px; color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600; font-family: 'DM Sans', system-ui, sans-serif; outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms; }
    .mm-input:focus { border-color: rgba(201,162,39,0.55); box-shadow: 0 0 0 3px rgba(201,162,39,0.10); }
    .mm-input::placeholder { color: #3d3020; }
    .mm-input:disabled { opacity: 0.5; cursor: not-allowed; }
    .mm-label { display: block; font-size: 11px; font-weight: 900; margin-bottom: 6px; color: #a08060; text-transform: uppercase; letter-spacing: 0.07em; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; border: 1.5px solid transparent; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-tab { padding: 6px 16px; border-radius: 22px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 180ms; border: 1.5px solid transparent; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-tab-on  { background: linear-gradient(135deg,#C9A227,#A67C00); color: #fff; box-shadow: 0 3px 14px rgba(201,162,39,0.35); }
    .mm-tab-off { background: rgba(255,255,255,0.04); color: #7a6a55; border-color: rgba(255,255,255,0.07); }
    .mm-tab-off:hover { background: rgba(201,162,39,0.08); color: #C9A227; border-color: rgba(201,162,39,0.2); }
    .mm-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .mm-scroll::-webkit-scrollbar-track { background: transparent; }
    .mm-scroll::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.25); border-radius: 4px; }
    .mm-sheet { background: linear-gradient(180deg, #1e1408 0%, #150f06 100%); border: 1.5px solid rgba(201,162,39,0.18); box-shadow: 0 -20px 60px rgba(201,162,39,0.14); }
    .mm-sheet-grip { width: 36px; height: 4px; border-radius: 4px; background: rgba(201,162,39,0.28); }
    .mm-sec { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #C9A227; display: flex; align-items: center; gap: 5px; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-stat { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; transition: border-color 200ms, box-shadow 200ms; }
    .mm-stat:hover { border-color: rgba(201,162,39,0.22); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    .mm-img-wrap { overflow: hidden; position: relative; background: #0d0a05; }
    .mm-img-wrap img, .mm-img-wrap video { width: 100%; height: 100%; object-fit: cover; transition: transform 350ms; }
    .mm-item-card:hover .mm-img-wrap img, .mm-item-card:hover .mm-img-wrap video { transform: scale(1.04); }
    .mm-price { font-family: 'Playfair Display', serif; color: #C9A227; letter-spacing: 0.01em; }
    .mm-toggle-track { width: 40px; height: 22px; border-radius: 11px; display: flex; align-items: center; padding: 2px; cursor: pointer; transition: background 200ms; flex-shrink: 0; }
    .mm-toggle-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 200ms; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
    .mm-form-section { background: rgba(201,162,39,0.04); border: 1.5px solid rgba(201,162,39,0.12); border-radius: 14px; padding: 16px; }
    @keyframes mmSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .mm-in { animation: mmSlideIn 280ms ease forwards; }
    .mm-checkbox { width:18px; height:18px; border-radius:5px; border:1.5px solid rgba(201,162,39,0.35); background:#1c1509; appearance:none; cursor:pointer; transition:all 180ms; flex-shrink:0; }
    .mm-checkbox:checked { background:#C9A227; border-color:#C9A227; }
  `;
  document.head.appendChild(el);
}

const MenuManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const [showForm,     setShowForm    ] = useState(false);
  const [editingItem,  setEditingItem ] = useState(null);
  const [saving,       setSaving      ] = useState(false);
  const [formData, setFormData] = useState({
    name: '', price: '', category: '', image: '', available: true,
    addons: [], sizePricing: { enabled: false, small: '', medium: '', large: '' },
    ingredients: '', calories: '', protein: '', carbs: '', fats: '', micros: '',
    isVeg: false, isNonVeg: false, isNew: false, isBestSeller: false,
  });
  const [editingItemId, setEditingItemId] = useState(null);
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [deletingAll,   setDeletingAll  ] = useState(false);

  useEffect(() => {
    if (editingItemId) document.getElementById(`menu-item-${editingItemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editingItemId]);

  const { data: menuItems, loading } = useCollection('menuItems', cafeId ? [where('cafeId', '==', cafeId)] : []);

  const filteredItems = useMemo(() => {
    if (!menuItems) return [];
    if (!searchQuery.trim()) return menuItems;
    const q = searchQuery.toLowerCase();
    return menuItems.filter(item => item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q));
  }, [menuItems, searchQuery]);

  const stats = useMemo(() => {
    const all = menuItems || [];
    return { total: all.length, available: all.filter(i => i.available).length, hidden: all.filter(i => !i.available).length, cats: new Set(all.map(i => i.category).filter(Boolean)).size };
  }, [menuItems]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cafeId) { toast.error('Cafe ID not found — please refresh'); return; }
    setSaving(true);
    try {
      const itemData = {
        name: formData.name, price: parseFloat(formData.price), category: formData.category,
        image: formData.image, available: formData.available, addons: formData.addons || [],
        sizePricing: formData.sizePricing || null, ingredients: formData.ingredients || '',
        calories: Number(formData.calories) || 0, protein: Number(formData.protein) || 0,
        carbs: Number(formData.carbs) || 0, fats: Number(formData.fats) || 0, micros: formData.micros || '',
        isVeg: formData.isVeg || false, isNonVeg: formData.isNonVeg || false,
        isNew: formData.isNew || false, isBestSeller: formData.isBestSeller || false, cafeId,
      };
      if (editingItem) { await updateDoc(doc(db, 'menuItems', editingItem.id), itemData); toast.success('🎉 Menu item updated!'); }
      else { await addDoc(collection(db, 'menuItems'), itemData); toast.success('🚀 Menu item added!'); }
      resetForm();
    } catch (error) { console.error('Save error:', error); toast.error('Failed to save item: ' + (error.message || 'Unknown error')); }
    finally { setSaving(false); }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name, price: item.price, category: item.category || '', image: item.image || '',
      available: item.available, addons: item.addons || [],
      sizePricing: item.sizePricing || { enabled: false, small: '', medium: '', large: '' },
      ingredients: item.ingredients || '',
      calories: item.calories != null ? String(item.calories) : '', protein: item.protein != null ? String(item.protein) : '',
      carbs: item.carbs != null ? String(item.carbs) : '', fats: item.fats != null ? String(item.fats) : '',
      micros: item.micros || '', isVeg: item.isVeg || false, isNonVeg: item.isNonVeg || false,
      isNew: item.isNew || false, isBestSeller: item.isBestSeller || false,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this menu item?')) return;
    try { await deleteDoc(doc(db, 'menuItems', id)); toast.success('🗑️ Item deleted'); }
    catch (error) { toast.error('Failed to delete: ' + error.message); }
  };

  const handleDeleteAll = async () => {
    if (!menuItems || menuItems.length === 0) { toast.error('No menu items to delete'); return; }
    if (!window.confirm(`Delete ALL ${menuItems.length} menu items? This cannot be undone.`)) return;
    setDeletingAll(true);
    try { await Promise.all(menuItems.map(item => deleteDoc(doc(db, 'menuItems', item.id)))); toast.success('🗑️ All menu items deleted'); resetForm(); }
    catch (error) { toast.error('Failed to delete all items: ' + error.message); }
    finally { setDeletingAll(false); }
  };

  const toggleAvailability = async (id, currentStatus) => {
    try { await updateDoc(doc(db, 'menuItems', id), { available: !currentStatus }); toast.success(currentStatus ? '🙈 Item hidden' : '👁️ Item visible'); }
    catch (error) { toast.error('Failed to update availability'); }
  };

  const resetForm = () => {
    setFormData({ name: '', price: '', category: '', image: '', available: true, addons: [], sizePricing: { enabled: false, small: '', medium: '', large: '' }, ingredients: '', calories: '', protein: '', carbs: '', fats: '', micros: '', isVeg: false, isNonVeg: false, isNew: false, isBestSeller: false });
    setEditingItem(null); setSaving(false); setShowForm(false); setEditingItemId(null);
  };

  const handleVegToggle = (type) => {
    if (type === 'veg') setFormData(prev => ({ ...prev, isVeg: !prev.isVeg, isNonVeg: false }));
    else setFormData(prev => ({ ...prev, isNonVeg: !prev.isNonVeg, isVeg: false }));
  };

  const renderEditForm = () => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', damping: 24, stiffness: 280 }} className="mm-sheet rounded-2xl mt-3 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(201,162,39,0.14)' }}>
        <div className="flex items-center gap-3">
          {editingItem ? <Edit className="w-8 h-8" style={{ color: '#C9A227' }} /> : <Utensils className="w-8 h-8" style={{ color: '#C9A227' }} />}
          <div>
            <h3 className="mm-title text-white font-bold text-lg">{editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>{editingItem ? `Editing: ${editingItem.name}` : 'Fill in details to add to your menu'}</p>
          </div>
        </div>
        <button onClick={resetForm} disabled={saving} className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50" style={{ background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.2)' }}>
          <X className="w-4 h-4" style={{ color: '#C9A227' }} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 mm-scroll overflow-y-auto" style={{ maxHeight: '80vh' }}>
        <div>
          <label className="mm-label"><Tag className="inline w-3 h-3 mr-1" />Item Name</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className="mm-input" placeholder="e.g., Espresso, Butter Chicken…" required disabled={saving} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mm-label">Price ({CUR})</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-sm" style={{ color: '#C9A227' }}>{CUR}</span>
              <input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))} className="mm-input" style={{ paddingLeft: '2rem' }} placeholder="99" required disabled={saving} />
            </div>
          </div>
          <div>
            <label className="mm-label"><FolderOpen className="inline w-3 h-3 mr-1" />Category</label>
            <input type="text" value={formData.category} onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))} className="mm-input" placeholder="e.g., Coffee, Starters…" disabled={saving} />
          </div>
        </div>
        <div>
          <label className="mm-label"><Image className="inline w-3 h-3 mr-1" />Item Media (Image / GIF / Video)</label>
          <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(201,162,39,0.14)', background: 'rgba(201,162,39,0.03)' }}>
            <MediaUpload label="" value={formData.image} onChange={(url) => setFormData(prev => ({ ...prev, image: url }))} storagePath={`menu/${cafeId}`} maxSizeMB={20} disabled={saving} />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-white font-bold text-sm flex items-center gap-1.5"><Eye className="w-4 h-4" /> Available for Order</p>
            <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>Customers can see and order this item</p>
          </div>
          <button type="button" disabled={saving} onClick={() => setFormData(prev => ({ ...prev, available: !prev.available }))} className="mm-toggle-track disabled:opacity-50" style={{ background: formData.available ? '#C9A227' : '#2a2018' }}>
            <div className="mm-toggle-thumb" style={{ transform: formData.available ? 'translateX(18px)' : 'translateX(0)' }} />
          </button>
        </div>
        <div>
          <label className="mm-label"><Sparkles className="inline w-3 h-3 mr-1" />Add-ons &amp; Extras</label>
          <div className="mm-form-section">
            <AddOnEditor addons={formData.addons || []} onChange={(updated) => setFormData(prev => ({ ...prev, addons: updated }))} currencySymbol={CUR} disabled={saving} />
          </div>
        </div>
        <div className="mm-form-section space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm flex items-center gap-1.5"><Ruler className="w-4 h-4" /> Size Pricing (S / M / L)</p>
              <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>Enable to set different prices per size</p>
            </div>
            <button type="button" disabled={saving} onClick={() => setFormData(prev => ({ ...prev, sizePricing: { ...prev.sizePricing, enabled: !prev.sizePricing?.enabled } }))} className="mm-toggle-track disabled:opacity-50" style={{ background: formData.sizePricing?.enabled ? '#C9A227' : '#2a2018' }}>
              <div className="mm-toggle-thumb" style={{ transform: formData.sizePricing?.enabled ? 'translateX(18px)' : 'translateX(0)' }} />
            </button>
          </div>
          {formData.sizePricing?.enabled && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { key: 'small',  icon: Coffee,     label: `Small ${CUR}`  },
                { key: 'medium', icon: CupSoda,    label: `Medium ${CUR}` },
                { key: 'large',  icon: GlassWater, label: `Large ${CUR}`  },
              ].map(({ key, icon: SizeIcon, label }) => (
                <div key={key}>
                  <label className="mm-label"><SizeIcon className="inline w-3 h-3 mr-1" />{key.charAt(0).toUpperCase() + key.slice(1)}</label>
                  <input type="number" min="0" step="0.01" placeholder={label} value={formData.sizePricing?.[key] || ''} onChange={(e) => setFormData(prev => ({ ...prev, sizePricing: { ...prev.sizePricing, [key]: e.target.value } }))} disabled={saving} className="mm-input" style={{ fontSize: 13 }} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mm-form-section space-y-4">
          <div>
            <p className="mm-sec mb-1"><Utensils className="w-3.5 h-3.5" />Food Details</p>
            <p className="text-xs" style={{ color: '#7a6a55' }}>Optional — shown in customer menu</p>
          </div>
          <div>
            <label className="mm-label"><Leaf className="inline w-3 h-3 mr-1" />Ingredients (comma separated)</label>
            <input type="text" value={formData.ingredients} onChange={e => setFormData(prev => ({ ...prev, ingredients: e.target.value }))} placeholder="e.g. Espresso, Oat Milk, Cinnamon" disabled={saving} className="mm-input" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'calories', icon: Flame,    label: 'Calories (kcal)' },
              { key: 'protein',  icon: Dumbbell, label: 'Protein (g)'     },
              { key: 'carbs',    icon: Wheat,    label: 'Carbs (g)'       },
              { key: 'fats',     icon: Package,  label: 'Fats (g)'        },
            ].map(({ key, icon: NutrIcon, label }) => (
              <div key={key}>
                <label className="mm-label"><NutrIcon className="inline w-3 h-3 mr-1" />{label}</label>
                <input type="number" min="0" step="any" value={formData[key]} onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))} placeholder="0" disabled={saving} className="mm-input" style={{ fontSize: 13 }} />
              </div>
            ))}
          </div>
          <div>
            <label className="mm-label"><Pill className="inline w-3 h-3 mr-1" />Micronutrients (optional)</label>
            <input type="text" value={formData.micros} onChange={e => setFormData(prev => ({ ...prev, micros: e.target.value }))} placeholder="e.g. Vitamin C 15mg, Iron 2mg" disabled={saving} className="mm-input" />
          </div>
        </div>
        <div className="mm-form-section space-y-3">
          <div>
            <p className="mm-sec mb-1"><Tag className="w-3.5 h-3.5" />Item Tags</p>
            <p className="text-xs" style={{ color: '#7a6a55' }}>Optional — shown on customer menu. Veg &amp; Non-Veg are mutually exclusive.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'veg',    active: formData.isVeg,    color: '#16a34a', dotColor: '#16a34a', text: 'Veg',     sub: 'Green dot mark', textColor: '#4ade80' },
              { key: 'nonveg', active: formData.isNonVeg, color: '#dc2626', dotColor: '#dc2626', text: 'Non-Veg', sub: 'Red dot mark',   textColor: '#f87171' },
            ].map(({ key, active, color, dotColor, text, sub, textColor }) => (
              <button key={key} type="button" disabled={saving} onClick={() => handleVegToggle(key)}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50"
                style={{ background: active ? `rgba(${key==='veg'?'22,163,74':'220,38,38'},0.12)` : 'rgba(255,255,255,0.03)', border: `1.5px solid ${active ? `rgba(${key==='veg'?'22,163,74':'220,38,38'},0.4)` : 'rgba(255,255,255,0.08)'}` }}>
                <div className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${active ? color : '#555'}` }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: active ? dotColor : '#555' }} />
                </div>
                <div>
                  <p className="text-sm font-black leading-tight flex items-center gap-1" style={{ color: active ? textColor : '#7a6a55' }}>
                    {key === 'veg' ? <Leaf className="w-3.5 h-3.5" /> : <Beef className="w-3.5 h-3.5" />}
                    {text}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#4a3f35' }}>{sub}</p>
                </div>
              </button>
            ))}
            {[
              { field: 'isNew',        icon: Sparkles, label: 'Newly Arrived', sub: 'Shows in "New" section',  activeColor: '#fbbf24', activeBg: 'rgba(255,190,11,0.1)',  activeBorder: 'rgba(255,190,11,0.35)'  },
              { field: 'isBestSeller', icon: Star,     label: 'Best Seller',   sub: 'Shows in "Best Sellers"', activeColor: '#C9A227', activeBg: 'rgba(201,162,39,0.1)', activeBorder: 'rgba(201,162,39,0.35)'  },
            ].map(({ field, icon: TagIcon, label, sub, activeColor, activeBg, activeBorder }) => (
              <button key={field} type="button" disabled={saving} onClick={() => setFormData(prev => ({ ...prev, [field]: !prev[field] }))}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50"
                style={{ background: formData[field] ? activeBg : 'rgba(255,255,255,0.03)', border: `1.5px solid ${formData[field] ? activeBorder : 'rgba(255,255,255,0.08)'}` }}>
                <TagIcon className="w-5 h-5 flex-shrink-0" style={{ color: formData[field] ? activeColor : '#7a6a55' }} />
                <div>
                  <p className="text-sm font-black leading-tight" style={{ color: formData[field] ? activeColor : '#7a6a55' }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#4a3f35' }}>{sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2 pb-4">
          <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }} className="mm-btn mm-btn-orange flex-1 justify-center disabled:opacity-60" style={{ padding: '12px 20px', fontSize: 14, borderRadius: 12 }}>
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving…</> : editingItem ? <><Save className="w-4 h-4" /> Update Item</> : <><Plus className="w-4 h-4" /> Add to Menu</>}
          </motion.button>
          <button type="button" onClick={resetForm} disabled={saving} className="mm-btn mm-btn-ghost disabled:opacity-50" style={{ padding: '12px 20px', fontSize: 14, borderRadius: 12 }}>
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );

  return (
    <div className="mm space-y-5 relative">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <Utensils className="w-10 h-10" style={{ color: '#C9A227' }} />
          <div>
            <h2 className="mm-title text-2xl font-black text-white">Menu Management</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#7a6a55' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
              {menuItems?.length ?? 0} item{(menuItems?.length ?? 0) !== 1 ? 's' : ''} in your menu
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={() => { resetForm(); setShowForm(true); }} className="mm-btn mm-btn-orange" style={{ padding: '10px 18px', fontSize: 13, borderRadius: 12 }}>
            <Plus className="w-4 h-4" /><ChefHat className="w-4 h-4" /> Add Menu Item
          </motion.button>
          {menuItems && menuItems.length > 0 && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={handleDeleteAll} disabled={deletingAll} className="mm-btn mm-btn-red disabled:opacity-50" style={{ padding: '10px 16px', fontSize: 13, borderRadius: 12 }}>
              {deletingAll ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Deleting…</> : <><Trash2 className="w-3.5 h-3.5" /> Delete All</>}
            </motion.button>
          )}
        </div>
      </div>

      {menuItems && menuItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Utensils,    label: 'Total Items',  value: stats.total,     color: '#C9A227' },
            { icon: CheckCircle, label: 'Available',    value: stats.available, color: '#34d399' },
            { icon: EyeOff,      label: 'Hidden',       value: stats.hidden,    color: '#fbbf24' },
            { icon: FolderOpen,  label: 'Categories',   value: stats.cats,      color: '#a78bfa' },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="mm-stat">
              <s.icon className="w-6 h-6 flex-shrink-0" style={{ color: s.color }} />
              <div>
                <p className="mm-title font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>{showForm && !editingItem && renderEditForm()}</AnimatePresence>

      {menuItems && menuItems.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#7a6a55' }} />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name or category…" className="mm-input" style={{ paddingLeft: '2.4rem', height: '44px' }} />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ChefHat className="w-12 h-12 animate-bounce" style={{ color: '#C9A227' }} />
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading your menu…</p>
        </div>
      ) : menuItems && menuItems.length > 0 ? (
        filteredItems.length > 0 ? (
          <>
            {searchQuery.trim() && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#7a6a55' }}>
                  <Search className="inline w-3.5 h-3.5" /> {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
                </span>
                <button onClick={() => setSearchQuery('')} className="mm-btn mm-btn-ghost" style={{ padding: '3px 10px', fontSize: 11 }}><X className="w-3 h-3" /> Clear</button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item, idx) => (
                <motion.div key={item.id} id={`menu-item-${item.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className={`mm-item-card${!item.available ? ' mm-item-card-unavailable' : ''}`}>
                  {item.image ? (
                    <div className="mm-img-wrap" style={{ aspectRatio: '16/9' }}><MediaPreview url={item.image} alt={item.name} className="w-full h-full" /></div>
                  ) : (
                    <div className="flex items-center justify-center" style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, #1a1208, #0f0a04)' }}>
                      <Utensils className="w-12 h-12" style={{ color: '#3a2e1a' }} />
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="mm-title font-black text-white text-lg leading-tight truncate">{item.name}</h3>
                        {item.category && <p className="text-xs mt-0.5 font-bold flex items-center gap-1" style={{ color: '#7a6a55' }}><FolderOpen className="w-3 h-3" />{item.category}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {item.sizePricing?.enabled ? (
                          <div className="space-y-0.5">
                            {item.sizePricing.small  && <p className="mm-price font-black text-sm flex items-center justify-end gap-1"><Coffee className="w-3 h-3" /> S {CUR}{parseFloat(item.sizePricing.small).toFixed(2)}</p>}
                            {item.sizePricing.medium && <p className="mm-price font-black text-sm flex items-center justify-end gap-1"><CupSoda className="w-3 h-3" /> M {CUR}{parseFloat(item.sizePricing.medium).toFixed(2)}</p>}
                            {item.sizePricing.large  && <p className="mm-price font-black text-sm flex items-center justify-end gap-1"><GlassWater className="w-3 h-3" /> L {CUR}{parseFloat(item.sizePricing.large).toFixed(2)}</p>}
                          </div>
                        ) : <span className="mm-price font-black text-xl">{CUR}{item.price.toFixed(2)}</span>}
                      </div>
                    </div>
                    {(item.isVeg || item.isNonVeg || item.isNew || item.isBestSeller) && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.isVeg && <span className="mm-badge" style={{ background: 'rgba(22,163,74,0.15)', color: '#4ade80', borderColor: 'rgba(22,163,74,0.3)' }}><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /><Leaf className="w-3 h-3" /> Veg</span>}
                        {item.isNonVeg && <span className="mm-badge" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171', borderColor: 'rgba(220,38,38,0.3)' }}><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /><Beef className="w-3 h-3" /> Non-Veg</span>}
                        {item.isNew && <span className="mm-badge" style={{ background: 'rgba(255,190,11,0.15)', color: '#fbbf24', borderColor: 'rgba(255,190,11,0.3)' }}><Sparkles className="w-3 h-3" /> New</span>}
                        {item.isBestSeller && <span className="mm-badge" style={{ background: 'rgba(201,162,39,0.15)', color: '#C9A227', borderColor: 'rgba(201,162,39,0.3)' }}><Star className="w-3 h-3" /> Best Seller</span>}
                      </div>
                    )}
                    {(item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fats > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.calories > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}><Flame className="w-3 h-3" /> {item.calories}kcal</span>}
                        {item.protein > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}><Dumbbell className="w-3 h-3" /> {item.protein}g protein</span>}
                        {item.carbs > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}><Wheat className="w-3 h-3" /> {item.carbs}g carbs</span>}
                        {item.fats > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}><Package className="w-3 h-3" /> {item.fats}g fats</span>}
                      </div>
                    )}
                    <div>
                      <span className="mm-badge flex items-center gap-1" style={item.available ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.22)' } : { background: 'rgba(220,50,50,0.12)', color: '#f87171', borderColor: 'rgba(220,50,50,0.22)' }}>
                        {item.available ? <><CheckCircle className="w-3 h-3" /> Available</> : <><EyeOff className="w-3 h-3" /> Hidden</>}
                      </span>
                    </div>
                    {item.addons?.length > 0 && <p className="text-xs font-bold flex items-center gap-1" style={{ color: '#4a3f35' }}><Sparkles className="w-3 h-3" /> {item.addons.length} add-on{item.addons.length !== 1 ? 's' : ''} available</p>}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { const opening = editingItemId !== item.id; setEditingItemId(opening ? item.id : null); if (opening) handleEdit(item); else resetForm(); }}
                        className={`mm-btn flex-1 justify-center ${editingItemId === item.id ? 'mm-btn-yellow' : 'mm-btn-ghost'}`} style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10 }}>
                        <Edit className="w-3.5 h-3.5" />{editingItemId === item.id ? <><X className="w-3 h-3" /> Close</> : 'Edit'}
                      </button>
                      <button onClick={() => toggleAvailability(item.id, item.available)} className={`mm-btn ${item.available ? 'mm-btn-ghost' : 'mm-btn-green'}`} style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10 }}>
                        {item.available ? <><EyeOff className="w-3.5 h-3.5" /> Hide</> : <><Eye className="w-3.5 h-3.5" /> Show</>}
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="mm-btn mm-btn-red" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10 }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <AnimatePresence>{editingItemId === item.id && <div className="px-4 pb-4">{renderEditForm()}</div>}</AnimatePresence>
                </motion.div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 py-2">
              <Utensils className="w-4 h-4" style={{ color: '#7a6a55' }} />
              <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}{searchQuery.trim() ? ` matching "${searchQuery}"` : ' in your menu'}</p>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
            </div>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mm-card flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Package className="w-14 h-14 mb-1" style={{ color: '#3a2e1a' }} />
            <p className="mm-title font-black text-white text-lg">No items match &quot;{searchQuery}&quot;</p>
            <p className="text-sm" style={{ color: '#7a6a55' }}>Try a different name or category</p>
            <button onClick={() => setSearchQuery('')} className="mm-btn mm-btn-orange mt-2" style={{ borderRadius: 12, padding: '10px 20px' }}><X className="w-4 h-4" /> Clear Search</button>
          </motion.div>
        )
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mm-card flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Utensils className="w-16 h-16 mb-2" style={{ color: '#3a2e1a' }} />
          <p className="mm-title font-black text-white text-xl">Your menu is empty!</p>
          <p className="text-sm" style={{ color: '#7a6a55' }}>Add your first dish to start taking orders</p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => { resetForm(); setShowForm(true); }} className="mm-btn mm-btn-orange mt-3" style={{ borderRadius: 12, padding: '12px 24px', fontSize: 14 }}>
            <Plus className="w-4 h-4" /><ChefHat className="w-4 h-4" /> Add First Item
          </motion.button>
        </motion.div>
      )}
    </div>
  );
};

export default MenuManagement;
