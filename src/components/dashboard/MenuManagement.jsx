import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, X, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import MediaUpload, { MediaPreview } from '../MediaUpload';
import AddOnEditor from './AddOnEditor';

const MenuManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  // ── Existing state — unchanged ───────────────────────────────────────────────
  const [showForm,     setShowForm    ] = useState(false);
  const [editingItem,  setEditingItem ] = useState(null);
  const [saving,       setSaving      ] = useState(false);

  const [formData, setFormData] = useState({
    name: '', price: '', category: '', image: '', available: true,
    addons: [],
    sizePricing: { enabled: false, small: '', medium: '', large: '' },
    // ── Nutrition fields ──────────────────────────────────────────────────────
    ingredients: '',
    calories:    '',
    protein:     '',
    carbs:       '',
    fats:        '',
    micros:      '',
    // ── NEW: Tag fields (additive — all optional booleans) ────────────────────
    // Existing items without these fields → undefined → treated as false.
    // No migration needed. No effect on pricing, cart, or any existing logic.
    isVeg:        false,
    isNonVeg:     false,
    isNew:        false,
    isBestSeller: false,
  });

  // ── UI-only: which item has its inline edit accordion open ───────────────────
  const [editingItemId, setEditingItemId] = useState(null);

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Delete All state ─────────────────────────────────────────────────────────
  const [deletingAll, setDeletingAll] = useState(false);

  // ── Scroll-into-view when an item's edit form opens ─────────────────────────
  useEffect(() => {
    if (editingItemId) {
      document.getElementById(`menu-item-${editingItemId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [editingItemId]);

  const { data: menuItems, loading } = useCollection(
    'menuItems',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ── Filtered items — UNCHANGED ────────────────────────────────────────────────
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

  // ── handleSubmit — existing logic UNCHANGED, new fields ride along via spread ─
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
        // ── Nutrition fields — UNCHANGED ───────────────────────────────────────
        ingredients: formData.ingredients || '',
        calories:    Number(formData.calories)  || 0,
        protein:     Number(formData.protein)   || 0,
        carbs:       Number(formData.carbs)     || 0,
        fats:        Number(formData.fats)      || 0,
        micros:      formData.micros      || '',
        // ── NEW: Tag fields (written to Firestore alongside existing fields) ───
        // All are boolean. Firestore stores them; customer UI reads them.
        // If admin never sets them they stay false — zero effect on anything.
        isVeg:        formData.isVeg        || false,
        isNonVeg:     formData.isNonVeg     || false,
        isNew:        formData.isNew        || false,
        isBestSeller: formData.isBestSeller || false,
        cafeId,
      };

      if (editingItem) {
        await updateDoc(doc(db, 'menuItems', editingItem.id), itemData);
        toast.success('Menu item updated ✓');
      } else {
        await addDoc(collection(db, 'menuItems'), itemData);
        toast.success('Menu item added ✓');
      }
      resetForm();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save item: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // ── handleEdit — existing logic UNCHANGED, new fields read from item ──────────
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
      // ── Nutrition fields — UNCHANGED ───────────────────────────────────────
      ingredients: item.ingredients || '',
      calories:    item.calories    != null ? String(item.calories) : '',
      protein:     item.protein     != null ? String(item.protein)  : '',
      carbs:       item.carbs       != null ? String(item.carbs)    : '',
      fats:        item.fats        != null ? String(item.fats)     : '',
      micros:      item.micros      || '',
      // ── NEW: Tag fields — read from Firestore, default false if missing ─────
      // item.isVeg etc. will be undefined on old items → || false → unchecked.
      // No migration needed. Existing items open in edit form with all toggles off.
      isVeg:        item.isVeg        || false,
      isNonVeg:     item.isNonVeg     || false,
      isNew:        item.isNew        || false,
      isBestSeller: item.isBestSeller || false,
    });
    setShowForm(true);
  };

  // ── handleDelete — UNCHANGED ─────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await deleteDoc(doc(db, 'menuItems', id));
      toast.success('Item deleted');
    } catch (error) {
      toast.error('Failed to delete: ' + error.message);
    }
  };

  // ── handleDeleteAll — UNCHANGED ───────────────────────────────────────────────
  const handleDeleteAll = async () => {
    if (!menuItems || menuItems.length === 0) {
      toast.error('No menu items to delete');
      return;
    }
    if (!window.confirm(`Delete ALL ${menuItems.length} menu items? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      await Promise.all(menuItems.map(item => deleteDoc(doc(db, 'menuItems', item.id))));
      toast.success('All menu items deleted');
      resetForm();
    } catch (error) {
      toast.error('Failed to delete all items: ' + error.message);
    } finally {
      setDeletingAll(false);
    }
  };

  // ── toggleAvailability — UNCHANGED ────────────────────────────────────────────
  const toggleAvailability = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'menuItems', id), { available: !currentStatus });
    } catch (error) {
      toast.error('Failed to update availability');
    }
  };

  // ── resetForm — UNCHANGED (new fields reset via initial state) ────────────────
  const resetForm = () => {
    setFormData({
      name: '', price: '', category: '', image: '', available: true,
      addons: [],
      sizePricing: { enabled: false, small: '', medium: '', large: '' },
      ingredients: '', calories: '', protein: '', carbs: '', fats: '', micros: '',
      // new fields also reset to false
      isVeg: false, isNonVeg: false, isNew: false, isBestSeller: false,
    });
    setEditingItem(null);
    setSaving(false);
    setShowForm(false);
    setEditingItemId(null);
  };

  // ── NEW: Veg / Non-Veg mutual-exclusivity toggle ──────────────────────────────
  // Selecting Veg clears NonVeg and vice versa. No other state is touched.
  const handleVegToggle = (type) => {
    if (type === 'veg') {
      setFormData(prev => ({ ...prev, isVeg: !prev.isVeg, isNonVeg: false }));
    } else {
      setFormData(prev => ({ ...prev, isNonVeg: !prev.isNonVeg, isVeg: false }));
    }
  };

  // ── renderEditForm — all existing fields UNCHANGED, Tags section appended ─────
  const renderEditForm = () => (
    <div className="bg-[#0F0F0F] border border-[#D4AF37]/30 rounded-sm p-6 mt-2">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
          {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
        </h3>
        <button onClick={resetForm} disabled={saving} className="text-[#A3A3A3] hover:text-white transition-colors disabled:opacity-50">
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Name — UNCHANGED ─────────────────────────────────────────────── */}
        <div>
          <label className="block text-white text-sm font-medium mb-2">Item Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
            placeholder="e.g., Espresso"
            required
            disabled={saving}
          />
        </div>

        {/* ── Price + Category — UNCHANGED ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">{`Price (${CUR})`}</label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              placeholder="99"
              required
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-white text-sm font-medium mb-2">Category</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              placeholder="e.g., Coffee"
              disabled={saving}
            />
          </div>
        </div>

        {/* ── Media Upload — UNCHANGED ─────────────────────────────────────── */}
        <MediaUpload
          label="Item Media (Image / GIF / Video)"
          value={formData.image}
          onChange={(url) => setFormData(prev => ({ ...prev, image: url }))}
          storagePath={`menu/${cafeId}`}
          maxSizeMB={20}
          disabled={saving}
        />

        {/* ── Available checkbox — UNCHANGED ───────────────────────────────── */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={formData.available}
            onChange={(e) => setFormData(prev => ({ ...prev, available: e.target.checked }))}
            disabled={saving}
            className="w-5 h-5 rounded border-white/10 bg-black/20 text-[#D4AF37] focus:ring-[#D4AF37]"
          />
          <label className="text-white">Available for order</label>
        </div>

        {/* ── Add-ons — UNCHANGED ──────────────────────────────────────────── */}
        <AddOnEditor
          addons={formData.addons || []}
          onChange={(updated) => setFormData(prev => ({ ...prev, addons: updated }))}
          currencySymbol={CUR}
          disabled={saving}
        />

        {/* ── Size Pricing — UNCHANGED ─────────────────────────────────────── */}
        <div className="border border-white/10 rounded-sm p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.sizePricing?.enabled || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                sizePricing: { ...prev.sizePricing, enabled: e.target.checked },
              }))}
              disabled={saving}
              className="w-4 h-4 rounded border-white/10 bg-black/20 text-[#D4AF37] focus:ring-[#D4AF37]"
            />
            <span className="text-white text-sm font-medium">Enable Size Pricing (S / M / L)</span>
          </label>
          {formData.sizePricing?.enabled && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <input
                type="number" min="0" step="0.01"
                placeholder={`Small ${CUR}`}
                value={formData.sizePricing?.small || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  sizePricing: { ...prev.sizePricing, small: e.target.value },
                }))}
                disabled={saving}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-3 text-sm transition-all"
              />
              <input
                type="number" min="0" step="0.01"
                placeholder={`Medium ${CUR}`}
                value={formData.sizePricing?.medium || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  sizePricing: { ...prev.sizePricing, medium: e.target.value },
                }))}
                disabled={saving}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-3 text-sm transition-all"
              />
              <input
                type="number" min="0" step="0.01"
                placeholder={`Large ${CUR}`}
                value={formData.sizePricing?.large || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  sizePricing: { ...prev.sizePricing, large: e.target.value },
                }))}
                disabled={saving}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-3 text-sm transition-all"
              />
            </div>
          )}
        </div>

        {/* ── Nutrition / Food Details — UNCHANGED ─────────────────────────── */}
        <div className="border border-white/10 rounded-sm p-4 space-y-3">
          <p className="text-white text-sm font-medium">
            Food Details <span className="text-[#A3A3A3] font-normal">(optional — shown in customer menu)</span>
          </p>
          <div>
            <label className="block text-[#A3A3A3] text-xs mb-1">Ingredients (comma separated)</label>
            <input
              type="text"
              value={formData.ingredients}
              onChange={e => setFormData(prev => ({ ...prev, ingredients: e.target.value }))}
              placeholder="e.g. Espresso, Oat Milk, Cinnamon"
              disabled={saving}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'calories', label: 'Calories (kcal)' },
              { key: 'protein',  label: 'Protein (g)'     },
              { key: 'carbs',    label: 'Carbs (g)'       },
              { key: 'fats',     label: 'Fats (g)'        },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-[#A3A3A3] text-xs mb-1">{label}</label>
                <input
                  type="number" min="0" step="any"
                  value={formData[key]}
                  onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="0"
                  disabled={saving}
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[#A3A3A3] text-xs mb-1">Micronutrients (optional)</label>
            <input
              type="text"
              value={formData.micros}
              onChange={e => setFormData(prev => ({ ...prev, micros: e.target.value }))}
              placeholder="e.g. Vitamin C 15mg, Iron 2mg"
              disabled={saving}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm"
            />
          </div>
        </div>

        {/* ── NEW: Item Tags ────────────────────────────────────────────────── */}
        {/* Purely additive. No required field. No effect on price/cart/logic.  */}
        {/* All 4 toggle as off by default. Veg/NonVeg are mutually exclusive.  */}
        <div className="border border-white/10 rounded-sm p-4 space-y-3">
          <p className="text-white text-sm font-medium">
            Item Tags{' '}
            <span className="text-[#A3A3A3] font-normal">(optional — shown on customer menu)</span>
          </p>

          <div className="grid grid-cols-2 gap-3">

            {/* Veg */}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleVegToggle('veg')}
              className={`flex items-center gap-3 p-3 rounded-sm border transition-all text-left disabled:opacity-50 ${
                formData.isVeg
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-white/10 bg-black/20 hover:bg-white/5'
              }`}
            >
              {/* FSSAI-style veg symbol */}
              <div
                className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                style={{ border: `1.5px solid ${formData.isVeg ? '#16a34a' : '#555'}` }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: formData.isVeg ? '#16a34a' : '#555' }}
                />
              </div>
              <div>
                <p className={`text-sm font-semibold leading-tight ${formData.isVeg ? 'text-green-400' : 'text-[#A3A3A3]'}`}>
                  Veg
                </p>
                <p className="text-xs text-[#555] mt-0.5">Green dot</p>
              </div>
            </button>

            {/* Non-Veg */}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleVegToggle('nonveg')}
              className={`flex items-center gap-3 p-3 rounded-sm border transition-all text-left disabled:opacity-50 ${
                formData.isNonVeg
                  ? 'border-red-500/50 bg-red-500/10'
                  : 'border-white/10 bg-black/20 hover:bg-white/5'
              }`}
            >
              {/* FSSAI-style non-veg symbol */}
              <div
                className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0"
                style={{ border: `1.5px solid ${formData.isNonVeg ? '#dc2626' : '#555'}` }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: formData.isNonVeg ? '#dc2626' : '#555' }}
                />
              </div>
              <div>
                <p className={`text-sm font-semibold leading-tight ${formData.isNonVeg ? 'text-red-400' : 'text-[#A3A3A3]'}`}>
                  Non-Veg
                </p>
                <p className="text-xs text-[#555] mt-0.5">Red dot</p>
              </div>
            </button>

            {/* Newly Arrived */}
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormData(prev => ({ ...prev, isNew: !prev.isNew }))}
              className={`flex items-center gap-3 p-3 rounded-sm border transition-all text-left disabled:opacity-50 ${
                formData.isNew
                  ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10'
                  : 'border-white/10 bg-black/20 hover:bg-white/5'
              }`}
            >
              <span className="text-xl leading-none flex-shrink-0">✨</span>
              <div>
                <p className={`text-sm font-semibold leading-tight ${formData.isNew ? 'text-[#D4AF37]' : 'text-[#A3A3A3]'}`}>
                  Newly Arrived
                </p>
                <p className="text-xs text-[#555] mt-0.5">Shows in "New" section</p>
              </div>
            </button>

            {/* Best Seller */}
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormData(prev => ({ ...prev, isBestSeller: !prev.isBestSeller }))}
              className={`flex items-center gap-3 p-3 rounded-sm border transition-all text-left disabled:opacity-50 ${
                formData.isBestSeller
                  ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10'
                  : 'border-white/10 bg-black/20 hover:bg-white/5'
              }`}
            >
              <span className="text-xl leading-none flex-shrink-0">⭐</span>
              <div>
                <p className={`text-sm font-semibold leading-tight ${formData.isBestSeller ? 'text-[#D4AF37]' : 'text-[#A3A3A3]'}`}>
                  Best Seller
                </p>
                <p className="text-xs text-[#555] mt-0.5">Shows in "Best Sellers"</p>
              </div>
            </button>

          </div>

          {/* Mutual exclusivity hint */}
          <p className="text-xs text-[#444]">
            Veg and Non-Veg are mutually exclusive — selecting one clears the other.
          </p>
        </div>
        {/* ── End Item Tags ─────────────────────────────────────────────────── */}

        {/* ── Submit / Cancel — UNCHANGED ──────────────────────────────────── */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="bg-transparent border border-white/10 text-white hover:bg-white/5 rounded-sm px-6 py-3 font-semibold transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

      </form>
    </div>
  );

  // ── Return — UNCHANGED ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Top toolbar: Add + Delete All — UNCHANGED ──────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Menu Item
        </button>

        {menuItems && menuItems.length > 0 && (
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deletingAll ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Deleting…</>
            ) : (
              <><Trash2 className="w-4 h-4" />Delete All</>
            )}
          </button>
        )}
      </div>

      {/* Top form — Add New Item only — UNCHANGED ────────────────────────── */}
      {showForm && !editingItem && renderEditForm()}

      {/* ── Search bar — UNCHANGED ─────────────────────────────────────────── */}
      {menuItems && menuItems.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or category…"
            className="w-full bg-[#0F0F0F] border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 pl-11 pr-4 text-sm transition-all"
          />
        </div>
      )}

      {/* ── Menu items list — UNCHANGED ──────────────────────────────────────── */}
      {loading ? (
        <div className="text-center text-[#A3A3A3] py-8">Loading menu...</div>
      ) : menuItems && menuItems.length > 0 ? (
        filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                id={`menu-item-${item.id}`}
                className="bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden hover:border-white/10 transition-colors"
              >
                {/* Item card — UNCHANGED ────────────────────────────────────── */}
                {item.image && (
                  <div className="aspect-video overflow-hidden">
                    <MediaPreview url={item.image} alt={item.name} className="w-full h-full" />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{item.name}</h3>
                      {item.category && <p className="text-[#A3A3A3] text-sm">{item.category}</p>}
                    </div>
                    <div className="text-right">
                      {item.sizePricing?.enabled ? (
                        <div className="text-xs space-y-0.5">
                          {item.sizePricing.small  && <p className="text-[#D4AF37] font-semibold">S {CUR}{parseFloat(item.sizePricing.small).toFixed(2)}</p>}
                          {item.sizePricing.medium && <p className="text-[#D4AF37] font-semibold">M {CUR}{parseFloat(item.sizePricing.medium).toFixed(2)}</p>}
                          {item.sizePricing.large  && <p className="text-[#D4AF37] font-semibold">L {CUR}{parseFloat(item.sizePricing.large).toFixed(2)}</p>}
                        </div>
                      ) : (
                        <span className="text-lg font-bold text-[#D4AF37]">{CUR}{item.price.toFixed(2)}</span>
                      )}
                    </div>
                  </div>

                  {/* ── NEW: Tag badges on item card (read-only display) ─────── */}
                  {/* Shows admin what tags are active. Visual only, no interaction. */}
                  {(item.isVeg || item.isNonVeg || item.isNew || item.isBestSeller) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {item.isVeg && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          Veg
                        </span>
                      )}
                      {item.isNonVeg && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                          Non-Veg
                        </span>
                      )}
                      {item.isNew && (
                        <span className="px-2 py-0.5 rounded-sm text-xs font-medium bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/25">
                          ✨ New
                        </span>
                      )}
                      {item.isBestSeller && (
                        <span className="px-2 py-0.5 rounded-sm text-xs font-medium bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/25">
                          ⭐ Best Seller
                        </span>
                      )}
                    </div>
                  )}
                  {/* ── End tag badges ─────────────────────────────────────── */}

                  <div className="flex items-center gap-2 mb-4">
                    <div className={`px-2 py-1 rounded-sm text-xs font-medium ${item.available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {item.available ? 'Available' : 'Unavailable'}
                    </div>
                  </div>

                  {/* Action buttons — UNCHANGED ───────────────────────────── */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const opening = editingItemId !== item.id;
                        setEditingItemId(opening ? item.id : null);
                        if (opening) {
                          handleEdit(item);
                        } else {
                          resetForm();
                        }
                      }}
                      className={`flex-1 rounded-sm px-4 py-2 transition-all flex items-center justify-center gap-2 ${
                        editingItemId === item.id
                          ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30'
                          : 'bg-white/5 hover:bg-white/10 text-white'
                      }`}
                    >
                      <Edit className="w-4 h-4" />
                      {editingItemId === item.id ? 'Close' : 'Edit'}
                    </button>
                    <button
                      onClick={() => toggleAvailability(item.id, item.available)}
                      className="bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] rounded-sm px-4 py-2 transition-all"
                    >
                      {item.available ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-sm px-4 py-2 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline edit accordion — UNCHANGED ───────────────────────── */}
                {editingItemId === item.id && renderEditForm()}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
            <p className="text-[#A3A3A3] text-lg">No items match &quot;{searchQuery}&quot;</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-3 text-[#D4AF37] text-sm hover:underline"
            >
              Clear search
            </button>
          </div>
        )
      ) : (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
          <p className="text-[#A3A3A3] text-lg">No menu items yet. Add your first item!</p>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
