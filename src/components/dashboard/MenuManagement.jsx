import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, X, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import MediaUpload, { MediaPreview } from '../MediaUpload';
import AddOnEditor from './AddOnEditor';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Inject food-theme CSS once (matches Orders + Offers design language) ─────
if (typeof document !== 'undefined' && !document.getElementById('mm-food-css')) {
  const el = document.createElement('style');
  el.id = 'mm-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');

    .mm { font-family: 'Nunito', system-ui, sans-serif; }
    .mm-title { font-family: 'Fredoka One', system-ui, sans-serif !important; letter-spacing: 0.01em; }

    /* ── Cards ── */
    .mm-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      transition: border-color 200ms, box-shadow 200ms, transform 180ms;
      overflow: hidden;
    }
    .mm-card:hover {
      border-color: rgba(255,140,0,0.28);
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      transform: translateY(-2px);
    }

    /* ── Menu item card specific ── */
    .mm-item-card {
      background: linear-gradient(160deg, #1a1208 0%, #130e05 100%);
      border: 1.5px solid rgba(255,140,0,0.14);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 220ms, box-shadow 220ms, transform 200ms;
      position: relative;
    }
    .mm-item-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, #FF7A20, #FFBE0B, #FF7A20);
      opacity: 0;
      transition: opacity 200ms;
    }
    .mm-item-card:hover { border-color: rgba(255,140,0,0.35); box-shadow: 0 10px 36px rgba(0,0,0,0.6); transform: translateY(-3px); }
    .mm-item-card:hover::before { opacity: 1; }
    .mm-item-card-unavailable { opacity: 0.58; filter: grayscale(0.35); }

    /* ── Buttons ── */
    .mm-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'Nunito', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 7px 14px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms;
      white-space: nowrap;
    }
    .mm-btn:hover  { transform: translateY(-1px); filter: brightness(1.1); }
    .mm-btn:active { transform: scale(0.96); }

    .mm-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.3); }
    .mm-btn-orange:hover { box-shadow: 0 5px 18px rgba(255,120,0,0.45); }
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

    /* ── Inputs ── */
    .mm-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'Nunito', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .mm-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.10); }
    .mm-input::placeholder { color: #3d3020; }
    .mm-input:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Labels ── */
    .mm-label {
      display: block; font-size: 11px; font-weight: 900; margin-bottom: 6px;
      color: #a08060; text-transform: uppercase; letter-spacing: 0.07em;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    /* ── Badges ── */
    .mm-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    /* ── Filter tabs ── */
    .mm-tab {
      padding: 6px 16px; border-radius: 22px; font-size: 13px; font-weight: 800;
      cursor: pointer; transition: all 180ms; border: 1.5px solid transparent;
      font-family: 'Nunito', system-ui, sans-serif;
    }
    .mm-tab-on  { background: linear-gradient(135deg,#FF7A20,#E55A00); color: #fff; box-shadow: 0 3px 14px rgba(255,120,0,0.35); }
    .mm-tab-off { background: rgba(255,255,255,0.04); color: #7a6a55; border-color: rgba(255,255,255,0.07); }
    .mm-tab-off:hover { background: rgba(255,140,0,0.08); color: #FF7A20; border-color: rgba(255,140,0,0.2); }

    /* ── Scrollbar ── */
    .mm-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .mm-scroll::-webkit-scrollbar-track { background: transparent; }
    .mm-scroll::-webkit-scrollbar-thumb { background: rgba(255,140,0,0.25); border-radius: 4px; }

    /* ── Bottom-sheet modal ── */
    .mm-sheet {
      background: linear-gradient(180deg, #1e1408 0%, #150f06 100%);
      border: 1.5px solid rgba(255,140,0,0.18);
      box-shadow: 0 -20px 60px rgba(255,120,0,0.14);
    }
    .mm-sheet-grip { width: 36px; height: 4px; border-radius: 4px; background: rgba(255,140,0,0.28); }

    /* ── Section divider label ── */
    .mm-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #FF7A20; display: flex; align-items: center; gap: 5px;
      font-family: 'Nunito', system-ui, sans-serif;
    }

    /* ── Stat cards ── */
    .mm-stat {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      padding: 14px 16px;
      display: flex; align-items: center; gap: 12px;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .mm-stat:hover { border-color: rgba(255,140,0,0.22); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }

    /* ── Image container ── */
    .mm-img-wrap { overflow: hidden; position: relative; background: #0d0a05; }
    .mm-img-wrap img, .mm-img-wrap video { width: 100%; height: 100%; object-fit: cover; transition: transform 350ms; }
    .mm-item-card:hover .mm-img-wrap img,
    .mm-item-card:hover .mm-img-wrap video { transform: scale(1.04); }

    /* ── Price tag ── */
    .mm-price { font-family: 'Fredoka One', system-ui, sans-serif; color: #FF7A20; letter-spacing: 0.01em; }

    /* ── Toggle switch ── */
    .mm-toggle-track {
      width: 40px; height: 22px; border-radius: 11px;
      display: flex; align-items: center; padding: 2px;
      cursor: pointer; transition: background 200ms; flex-shrink: 0;
    }
    .mm-toggle-thumb {
      width: 18px; height: 18px; border-radius: 50%; background: #fff;
      transition: transform 200ms; box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    }

    /* ── Form section box ── */
    .mm-form-section {
      background: rgba(255,140,0,0.04);
      border: 1.5px solid rgba(255,140,0,0.12);
      border-radius: 14px;
      padding: 16px;
    }

    /* ── Entrance animation ── */
    @keyframes mmSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .mm-in { animation: mmSlideIn 280ms ease forwards; }

    /* ── Checkbox ── */
    .mm-checkbox { width:18px; height:18px; border-radius:5px; border:1.5px solid rgba(255,140,0,0.35); background:#1c1509; appearance:none; cursor:pointer; transition:all 180ms; flex-shrink:0; }
    .mm-checkbox:checked { background:#FF7A20; border-color:#FF7A20; }
    .mm-checkbox:checked::after { content:'✓'; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#fff; font-size:11px; font-weight:900; }
  `;
  document.head.appendChild(el);
}

// ─── MenuManagement ───────────────────────────────────────────────────────────
const MenuManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── Existing state — UNCHANGED ────────────────────────────────────────────
  const [showForm,     setShowForm    ] = useState(false);
  const [editingItem,  setEditingItem ] = useState(null);
  const [saving,       setSaving      ] = useState(false);

  const [formData, setFormData] = useState({
    name: '', price: '', category: '', image: '', available: true,
    addons: [],
    sizePricing: { enabled: false, small: '', medium: '', large: '' },
    ingredients: '',
    calories:    '',
    protein:     '',
    carbs:       '',
    fats:        '',
    micros:      '',
    isVeg:        false,
    isNonVeg:     false,
    isNew:        false,
    isBestSeller: false,
  });

  const [editingItemId, setEditingItemId] = useState(null);
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [deletingAll,   setDeletingAll  ] = useState(false);

  // ── Scroll-into-view — UNCHANGED ─────────────────────────────────────────
  useEffect(() => {
    if (editingItemId) {
      document.getElementById(`menu-item-${editingItemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingItemId]);

  const { data: menuItems, loading } = useCollection(
    'menuItems',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ── filteredItems — UNCHANGED ─────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!menuItems) return [];
    if (!searchQuery.trim()) return menuItems;
    const q = searchQuery.toLowerCase();
    return menuItems.filter(
      item =>
        item.name?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
    );
  }, [menuItems, searchQuery]);

  // ── Stats computed from menuItems ─────────────────────────────────────────
  const stats = useMemo(() => {
    const all       = menuItems || [];
    const total     = all.length;
    const available = all.filter(i => i.available).length;
    const hidden    = all.filter(i => !i.available).length;
    const cats      = new Set(all.map(i => i.category).filter(Boolean)).size;
    return { total, available, hidden, cats };
  }, [menuItems]);

  // ── handleSubmit — UNCHANGED ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cafeId) { toast.error('Cafe ID not found — please refresh'); return; }
    setSaving(true);
    try {
      const itemData = {
        name:        formData.name,
        price:       parseFloat(formData.price),
        category:    formData.category,
        image:       formData.image,
        available:   formData.available,
        addons:      formData.addons      || [],
        sizePricing: formData.sizePricing || null,
        ingredients: formData.ingredients || '',
        calories:    Number(formData.calories)  || 0,
        protein:     Number(formData.protein)   || 0,
        carbs:       Number(formData.carbs)     || 0,
        fats:        Number(formData.fats)      || 0,
        micros:      formData.micros      || '',
        isVeg:        formData.isVeg        || false,
        isNonVeg:     formData.isNonVeg     || false,
        isNew:        formData.isNew        || false,
        isBestSeller: formData.isBestSeller || false,
        cafeId,
      };
      if (editingItem) {
        await updateDoc(doc(db, 'menuItems', editingItem.id), itemData);
        toast.success('🎉 Menu item updated!');
      } else {
        await addDoc(collection(db, 'menuItems'), itemData);
        toast.success('🚀 Menu item added!');
      }
      resetForm();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save item: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // ── handleEdit — UNCHANGED ────────────────────────────────────────────────
  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name:        item.name,
      price:       item.price,
      category:    item.category    || '',
      image:       item.image       || '',
      available:   item.available,
      addons:      item.addons      || [],
      sizePricing: item.sizePricing || { enabled: false, small: '', medium: '', large: '' },
      ingredients: item.ingredients || '',
      calories:    item.calories    != null ? String(item.calories) : '',
      protein:     item.protein     != null ? String(item.protein)  : '',
      carbs:       item.carbs       != null ? String(item.carbs)    : '',
      fats:        item.fats        != null ? String(item.fats)     : '',
      micros:      item.micros      || '',
      isVeg:        item.isVeg        || false,
      isNonVeg:     item.isNonVeg     || false,
      isNew:        item.isNew        || false,
      isBestSeller: item.isBestSeller || false,
    });
    setShowForm(true);
  };

  // ── handleDelete — UNCHANGED ──────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await deleteDoc(doc(db, 'menuItems', id));
      toast.success('🗑️ Item deleted');
    } catch (error) {
      toast.error('Failed to delete: ' + error.message);
    }
  };

  // ── handleDeleteAll — UNCHANGED ───────────────────────────────────────────
  const handleDeleteAll = async () => {
    if (!menuItems || menuItems.length === 0) { toast.error('No menu items to delete'); return; }
    if (!window.confirm(`Delete ALL ${menuItems.length} menu items? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      await Promise.all(menuItems.map(item => deleteDoc(doc(db, 'menuItems', item.id))));
      toast.success('🗑️ All menu items deleted');
      resetForm();
    } catch (error) {
      toast.error('Failed to delete all items: ' + error.message);
    } finally {
      setDeletingAll(false);
    }
  };

  // ── toggleAvailability — UNCHANGED ────────────────────────────────────────
  const toggleAvailability = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'menuItems', id), { available: !currentStatus });
      toast.success(currentStatus ? '🙈 Item hidden' : '👁️ Item visible');
    } catch (error) {
      toast.error('Failed to update availability');
    }
  };

  // ── resetForm — UNCHANGED ─────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({
      name: '', price: '', category: '', image: '', available: true,
      addons: [],
      sizePricing: { enabled: false, small: '', medium: '', large: '' },
      ingredients: '', calories: '', protein: '', carbs: '', fats: '', micros: '',
      isVeg: false, isNonVeg: false, isNew: false, isBestSeller: false,
    });
    setEditingItem(null);
    setSaving(false);
    setShowForm(false);
    setEditingItemId(null);
  };

  // ── handleVegToggle — UNCHANGED ───────────────────────────────────────────
  const handleVegToggle = (type) => {
    if (type === 'veg') {
      setFormData(prev => ({ ...prev, isVeg: !prev.isVeg, isNonVeg: false }));
    } else {
      setFormData(prev => ({ ...prev, isNonVeg: !prev.isNonVeg, isVeg: false }));
    }
  };

  // ── renderEditForm — same fields + logic, premium styling ────────────────
  const renderEditForm = () => (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', damping: 24, stiffness: 280 }}
      className="mm-sheet rounded-2xl mt-3 overflow-hidden"
    >
      {/* Form header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,140,0,0.14)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{editingItem ? '✏️' : '🍽️'}</span>
          <div>
            <h3 className="mm-title text-white font-bold text-lg">
              {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>
              {editingItem ? `Editing: ${editingItem.name}` : 'Fill in details to add to your menu'}
            </p>
          </div>
        </div>
        <button
          onClick={resetForm}
          disabled={saving}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50"
          style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.2)' }}
        >
          <X className="w-4 h-4" style={{ color: '#FF7A20' }} />
        </button>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 mm-scroll overflow-y-auto" style={{ maxHeight: '80vh' }}>

        {/* ── Item Name ── */}
        <div>
          <label className="mm-label">🏷️ Item Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="mm-input"
            placeholder="e.g., Espresso, Butter Chicken…"
            required
            disabled={saving}
          />
        </div>

        {/* ── Price + Category ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mm-label">💰 Price ({CUR})</label>
            <div className="relative">
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-sm"
                style={{ color: '#FF7A20' }}
              >{CUR}</span>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                className="mm-input"
                style={{ paddingLeft: '2rem' }}
                placeholder="99"
                required
                disabled={saving}
              />
            </div>
          </div>
          <div>
            <label className="mm-label">🗂️ Category</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="mm-input"
              placeholder="e.g., Coffee, Starters…"
              disabled={saving}
            />
          </div>
        </div>

        {/* ── Media Upload — logic UNCHANGED ── */}
        <div>
          <label className="mm-label">🖼️ Item Media (Image / GIF / Video)</label>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1.5px solid rgba(255,140,0,0.14)', background: 'rgba(255,140,0,0.03)' }}
          >
            <MediaUpload
              label=""
              value={formData.image}
              onChange={(url) => setFormData(prev => ({ ...prev, image: url }))}
              storagePath={`menu/${cafeId}`}
              maxSizeMB={20}
              disabled={saving}
            />
          </div>
        </div>

        {/* ── Available toggle ── */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <p className="text-white font-bold text-sm">👁️ Available for Order</p>
            <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>Customers can see and order this item</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setFormData(prev => ({ ...prev, available: !prev.available }))}
            className="mm-toggle-track disabled:opacity-50"
            style={{ background: formData.available ? '#FF7A20' : '#2a2018' }}
          >
            <div
              className="mm-toggle-thumb"
              style={{ transform: formData.available ? 'translateX(18px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {/* ── Add-ons — logic UNCHANGED ── */}
        <div>
          <label className="mm-label">✨ Add-ons & Extras</label>
          <div className="mm-form-section">
            <AddOnEditor
              addons={formData.addons || []}
              onChange={(updated) => setFormData(prev => ({ ...prev, addons: updated }))}
              currencySymbol={CUR}
              disabled={saving}
            />
          </div>
        </div>

        {/* ── Size Pricing — logic UNCHANGED ── */}
        <div className="mm-form-section space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm">📏 Size Pricing (S / M / L)</p>
              <p className="text-xs mt-0.5" style={{ color: '#7a6a55' }}>Enable to set different prices per size</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormData(prev => ({
                ...prev,
                sizePricing: { ...prev.sizePricing, enabled: !prev.sizePricing?.enabled },
              }))}
              className="mm-toggle-track disabled:opacity-50"
              style={{ background: formData.sizePricing?.enabled ? '#FF7A20' : '#2a2018' }}
            >
              <div
                className="mm-toggle-thumb"
                style={{ transform: formData.sizePricing?.enabled ? 'translateX(18px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          {formData.sizePricing?.enabled && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { key: 'small',  emoji: '☕', label: `Small ${CUR}` },
                { key: 'medium', emoji: '🥤', label: `Medium ${CUR}` },
                { key: 'large',  emoji: '🧋', label: `Large ${CUR}` },
              ].map(({ key, emoji, label }) => (
                <div key={key}>
                  <label className="mm-label">{emoji} {key.charAt(0).toUpperCase() + key.slice(1)}</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder={label}
                    value={formData.sizePricing?.[key] || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      sizePricing: { ...prev.sizePricing, [key]: e.target.value },
                    }))}
                    disabled={saving}
                    className="mm-input"
                    style={{ fontSize: 13 }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Nutrition / Food Details — logic UNCHANGED ── */}
        <div className="mm-form-section space-y-4">
          <div>
            <p className="mm-sec mb-1">🥗 Food Details</p>
            <p className="text-xs" style={{ color: '#7a6a55' }}>Optional — shown in customer menu</p>
          </div>
          <div>
            <label className="mm-label">🌿 Ingredients (comma separated)</label>
            <input
              type="text"
              value={formData.ingredients}
              onChange={e => setFormData(prev => ({ ...prev, ingredients: e.target.value }))}
              placeholder="e.g. Espresso, Oat Milk, Cinnamon"
              disabled={saving}
              className="mm-input"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'calories', emoji: '🔥', label: 'Calories (kcal)' },
              { key: 'protein',  emoji: '💪', label: 'Protein (g)'     },
              { key: 'carbs',    emoji: '🌾', label: 'Carbs (g)'       },
              { key: 'fats',     emoji: '🫙', label: 'Fats (g)'        },
            ].map(({ key, emoji, label }) => (
              <div key={key}>
                <label className="mm-label">{emoji} {label}</label>
                <input
                  type="number" min="0" step="any"
                  value={formData[key]}
                  onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="0"
                  disabled={saving}
                  className="mm-input"
                  style={{ fontSize: 13 }}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="mm-label">💊 Micronutrients (optional)</label>
            <input
              type="text"
              value={formData.micros}
              onChange={e => setFormData(prev => ({ ...prev, micros: e.target.value }))}
              placeholder="e.g. Vitamin C 15mg, Iron 2mg"
              disabled={saving}
              className="mm-input"
            />
          </div>
        </div>

        {/* ── Item Tags — logic UNCHANGED ── */}
        <div className="mm-form-section space-y-3">
          <div>
            <p className="mm-sec mb-1">🏷️ Item Tags</p>
            <p className="text-xs" style={{ color: '#7a6a55' }}>Optional — shown on customer menu. Veg &amp; Non-Veg are mutually exclusive.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">

            {/* Veg — logic UNCHANGED */}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleVegToggle('veg')}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50"
              style={{
                background: formData.isVeg ? 'rgba(22,163,74,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${formData.isVeg ? 'rgba(22,163,74,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <div
                className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                style={{ border: `1.5px solid ${formData.isVeg ? '#16a34a' : '#555'}` }}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: formData.isVeg ? '#16a34a' : '#555' }} />
              </div>
              <div>
                <p className="text-sm font-black leading-tight" style={{ color: formData.isVeg ? '#4ade80' : '#7a6a55' }}>Veg 🌱</p>
                <p className="text-xs mt-0.5" style={{ color: '#4a3f35' }}>Green dot mark</p>
              </div>
            </button>

            {/* Non-Veg — logic UNCHANGED */}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleVegToggle('nonveg')}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50"
              style={{
                background: formData.isNonVeg ? 'rgba(220,38,38,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${formData.isNonVeg ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <div
                className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                style={{ border: `1.5px solid ${formData.isNonVeg ? '#dc2626' : '#555'}` }}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: formData.isNonVeg ? '#dc2626' : '#555' }} />
              </div>
              <div>
                <p className="text-sm font-black leading-tight" style={{ color: formData.isNonVeg ? '#f87171' : '#7a6a55' }}>Non-Veg 🍗</p>
                <p className="text-xs mt-0.5" style={{ color: '#4a3f35' }}>Red dot mark</p>
              </div>
            </button>

            {/* Newly Arrived — logic UNCHANGED */}
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormData(prev => ({ ...prev, isNew: !prev.isNew }))}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50"
              style={{
                background: formData.isNew ? 'rgba(255,190,11,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${formData.isNew ? 'rgba(255,190,11,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="text-xl leading-none flex-shrink-0">✨</span>
              <div>
                <p className="text-sm font-black leading-tight" style={{ color: formData.isNew ? '#fbbf24' : '#7a6a55' }}>Newly Arrived</p>
                <p className="text-xs mt-0.5" style={{ color: '#4a3f35' }}>Shows in "New" section</p>
              </div>
            </button>

            {/* Best Seller — logic UNCHANGED */}
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormData(prev => ({ ...prev, isBestSeller: !prev.isBestSeller }))}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50"
              style={{
                background: formData.isBestSeller ? 'rgba(255,140,0,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${formData.isBestSeller ? 'rgba(255,140,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="text-xl leading-none flex-shrink-0">⭐</span>
              <div>
                <p className="text-sm font-black leading-tight" style={{ color: formData.isBestSeller ? '#FF7A20' : '#7a6a55' }}>Best Seller</p>
                <p className="text-xs mt-0.5" style={{ color: '#4a3f35' }}>Shows in "Best Sellers"</p>
              </div>
            </button>

          </div>
        </div>

        {/* ── Submit / Cancel ── */}
        <div className="flex gap-3 pt-2 pb-4">
          <motion.button
            type="submit"
            disabled={saving}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            className="mm-btn mm-btn-orange flex-1 justify-center disabled:opacity-60"
            style={{ padding: '12px 20px', fontSize: 14, borderRadius: 12 }}
          >
            {saving
              ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving…</>
              : editingItem
                ? <>💾 Update Item</>
                : <>🚀 Add to Menu</>
            }
          </motion.button>
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="mm-btn mm-btn-ghost disabled:opacity-50"
            style={{ padding: '12px 20px', fontSize: 14, borderRadius: 12 }}
          >
            ✗ Cancel
          </button>
        </div>

      </form>
    </motion.div>
  );

  // ─── Return ───────────────────────────────────────────────────────────────
  return (
    <div className="mm space-y-5 relative">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🍽️</div>
          <div>
            <h2 className="mm-title text-2xl font-black text-white">Menu Management</h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: '#7a6a55' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
              {menuItems?.length ?? 0} item{(menuItems?.length ?? 0) !== 1 ? 's' : ''} in your menu
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mm-btn mm-btn-orange"
            style={{ padding: '10px 18px', fontSize: 13, borderRadius: 12 }}
          >
            <Plus className="w-4 h-4" />🍳 Add Menu Item
          </motion.button>
          {menuItems && menuItems.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="mm-btn mm-btn-red disabled:opacity-50"
              style={{ padding: '10px 16px', fontSize: 13, borderRadius: 12 }}
            >
              {deletingAll
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Deleting…</>
                : <><Trash2 className="w-3.5 h-3.5" />🗑️ Delete All</>
              }
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      {menuItems && menuItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { emoji: '🍽️', label: 'Total Items',   value: stats.total,     color: '#FF7A20' },
            { emoji: '✅', label: 'Available',      value: stats.available, color: '#34d399' },
            { emoji: '🙈', label: 'Hidden',         value: stats.hidden,    color: '#fbbf24' },
            { emoji: '🗂️', label: 'Categories',    value: stats.cats,      color: '#a78bfa' },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="mm-stat"
            >
              <div className="text-2xl">{s.emoji}</div>
              <div>
                <p className="mm-title font-black text-2xl" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Add new item form (top-level, no editing item) ─────────────────── */}
      <AnimatePresence>
        {showForm && !editingItem && renderEditForm()}
      </AnimatePresence>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      {menuItems && menuItems.length > 0 && (
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or category…"
            className="mm-input"
            style={{ paddingLeft: '2.4rem', height: '44px' }}
          />
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
        /* Loading state */
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="text-5xl animate-bounce">👨‍🍳</div>
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading your menu…</p>
        </div>

      ) : menuItems && menuItems.length > 0 ? (

        filteredItems.length > 0 ? (
          <>
            {/* Filter hint */}
            {searchQuery.trim() && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: '#7a6a55' }}>
                  🔎 {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mm-btn mm-btn-ghost"
                  style={{ padding: '3px 10px', fontSize: 11 }}
                >
                  ✗ Clear
                </button>
              </div>
            )}

            {/* Grid of menu item cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item, idx) => (
                <motion.div
                  key={item.id}
                  id={`menu-item-${item.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className={`mm-item-card${!item.available ? ' mm-item-card-unavailable' : ''}`}
                >
                  {/* Item image */}
                  {item.image && (
                    <div className="mm-img-wrap" style={{ aspectRatio: '16/9' }}>
                      <MediaPreview url={item.image} alt={item.name} className="w-full h-full" />
                    </div>
                  )}

                  {/* No-image placeholder with emoji */}
                  {!item.image && (
                    <div
                      className="flex items-center justify-center"
                      style={{
                        aspectRatio: '16/9',
                        background: 'linear-gradient(135deg, #1a1208, #0f0a04)',
                        fontSize: 48,
                      }}
                    >
                      🍽️
                    </div>
                  )}

                  <div className="p-5 space-y-3">

                    {/* Name + Price row */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="mm-title font-black text-white text-lg leading-tight truncate"
                        >{item.name}</h3>
                        {item.category && (
                          <p className="text-xs mt-0.5 font-bold" style={{ color: '#7a6a55' }}>
                            🗂️ {item.category}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {item.sizePricing?.enabled ? (
                          <div className="space-y-0.5">
                            {item.sizePricing.small  && <p className="mm-price font-black text-sm">☕ S {CUR}{parseFloat(item.sizePricing.small).toFixed(2)}</p>}
                            {item.sizePricing.medium && <p className="mm-price font-black text-sm">🥤 M {CUR}{parseFloat(item.sizePricing.medium).toFixed(2)}</p>}
                            {item.sizePricing.large  && <p className="mm-price font-black text-sm">🧋 L {CUR}{parseFloat(item.sizePricing.large).toFixed(2)}</p>}
                          </div>
                        ) : (
                          <span className="mm-price font-black text-xl">{CUR}{item.price.toFixed(2)}</span>
                        )}
                      </div>
                    </div>

                    {/* Tag badges — UNCHANGED logic, styled */}
                    {(item.isVeg || item.isNonVeg || item.isNew || item.isBestSeller) && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.isVeg && (
                          <span className="mm-badge" style={{ background: 'rgba(22,163,74,0.15)', color: '#4ade80', borderColor: 'rgba(22,163,74,0.3)' }}>
                            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />🌱 Veg
                          </span>
                        )}
                        {item.isNonVeg && (
                          <span className="mm-badge" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171', borderColor: 'rgba(220,38,38,0.3)' }}>
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />🍗 Non-Veg
                          </span>
                        )}
                        {item.isNew && (
                          <span className="mm-badge" style={{ background: 'rgba(255,190,11,0.15)', color: '#fbbf24', borderColor: 'rgba(255,190,11,0.3)' }}>
                            ✨ New
                          </span>
                        )}
                        {item.isBestSeller && (
                          <span className="mm-badge" style={{ background: 'rgba(255,140,0,0.15)', color: '#FF7A20', borderColor: 'rgba(255,140,0,0.3)' }}>
                            ⭐ Best Seller
                          </span>
                        )}
                      </div>
                    )}

                    {/* Nutrition pills (if any set) */}
                    {(item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fats > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.calories > 0 && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}>
                            🔥 {item.calories}kcal
                          </span>
                        )}
                        {item.protein > 0 && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}>
                            💪 {item.protein}g protein
                          </span>
                        )}
                        {item.carbs > 0 && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}>
                            🌾 {item.carbs}g carbs
                          </span>
                        )}
                        {item.fats > 0 && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: '#7a6a55', border: '1px solid rgba(255,255,255,0.07)' }}>
                            🫙 {item.fats}g fats
                          </span>
                        )}
                      </div>
                    )}

                    {/* Availability badge */}
                    <div>
                      <span
                        className="mm-badge"
                        style={item.available
                          ? { background: 'rgba(16,185,129,0.12)', color: '#34d399', borderColor: 'rgba(16,185,129,0.22)' }
                          : { background: 'rgba(220,50,50,0.12)',  color: '#f87171', borderColor: 'rgba(220,50,50,0.22)' }
                        }
                      >
                        {item.available ? '✅ Available' : '🙈 Hidden'}
                      </span>
                    </div>

                    {/* Add-ons count hint */}
                    {item.addons?.length > 0 && (
                      <p className="text-xs font-bold" style={{ color: '#4a3f35' }}>
                        ✨ {item.addons.length} add-on{item.addons.length !== 1 ? 's' : ''} available
                      </p>
                    )}

                    {/* Action buttons — UNCHANGED logic */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          const opening = editingItemId !== item.id;
                          setEditingItemId(opening ? item.id : null);
                          if (opening) handleEdit(item);
                          else resetForm();
                        }}
                        className={`mm-btn flex-1 justify-center ${editingItemId === item.id ? 'mm-btn-yellow' : 'mm-btn-ghost'}`}
                        style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10 }}
                      >
                        <Edit className="w-3.5 h-3.5" />
                        {editingItemId === item.id ? '✗ Close' : '✏️ Edit'}
                      </button>
                      <button
                        onClick={() => toggleAvailability(item.id, item.available)}
                        className={`mm-btn ${item.available ? 'mm-btn-ghost' : 'mm-btn-green'}`}
                        style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10 }}
                      >
                        {item.available ? '🙈 Hide' : '👁️ Show'}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="mm-btn mm-btn-red"
                        style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10 }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline edit accordion — UNCHANGED logic */}
                  <AnimatePresence>
                    {editingItemId === item.id && (
                      <div className="px-4 pb-4">
                        {renderEditForm()}
                      </div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            {/* Footer count */}
            <div className="flex items-center justify-center gap-2 py-2">
              <span>🍽️</span>
              <p className="text-xs font-bold" style={{ color: '#7a6a55' }}>
                {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
                {searchQuery.trim() ? ` matching "${searchQuery}"` : ' in your menu'}
              </p>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
            </div>
          </>
        ) : (
          /* No search results */
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="mm-card flex flex-col items-center justify-center py-16 gap-3 text-center"
          >
            <div className="text-6xl mb-1">🫙</div>
            <p className="mm-title font-black text-white text-lg">No items match &quot;{searchQuery}&quot;</p>
            <p className="text-sm" style={{ color: '#7a6a55' }}>Try a different name or category</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mm-btn mm-btn-orange mt-2"
              style={{ borderRadius: 12, padding: '10px 20px' }}
            >
              ✗ Clear Search
            </button>
          </motion.div>
        )

      ) : (
        /* Empty state — no items at all */
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mm-card flex flex-col items-center justify-center py-20 gap-3 text-center"
        >
          <div className="text-7xl mb-2">🍽️</div>
          <p className="mm-title font-black text-white text-xl">Your menu is empty!</p>
          <p className="text-sm" style={{ color: '#7a6a55' }}>
            Add your first dish to start taking orders 🚀
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mm-btn mm-btn-orange mt-3"
            style={{ borderRadius: 12, padding: '12px 24px', fontSize: 14 }}
          >
            <Plus className="w-4 h-4" />🍳 Add First Item
          </motion.button>
        </motion.div>
      )}
    </div>
  );
};

export default MenuManagement;
