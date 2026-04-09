import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, X, RefreshCw } from 'lucide-react';
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
  });

  // ── UI-only: which item has its inline edit accordion open ───────────────────
  // Keeps track purely for rendering — no effect on save/update logic.
  const [editingItemId, setEditingItemId] = useState(null);

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

  // ── Upload + Save — UNCHANGED ────────────────────────────────────────────────
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
        addons:      formData.addons      || [],   // [] = no add-ons; backward-compatible
        sizePricing: formData.sizePricing || null, // null = no size pricing; backward-compatible
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

  // ── handleEdit — UNCHANGED (sets editingItem + formData + showForm) ──────────
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
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await deleteDoc(doc(db, 'menuItems', id));
      toast.success('Item deleted');
    } catch (error) {
      toast.error('Failed to delete: ' + error.message);
    }
  };

  const toggleAvailability = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'menuItems', id), { available: !currentStatus });
    } catch (error) {
      toast.error('Failed to update availability');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', price: '', category: '', image: '', available: true });
    setEditingItem(null);
    setSaving(false);
    setShowForm(false);
    setEditingItemId(null); // also close any open inline accordion
  };

  // ── Inline edit form JSX — identical markup to the top form ──────────────────
  // Extracted so it can be rendered both at the top (Add New) and inline (Edit).
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
        {/* Name */}
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

        {/* Price + Category */}
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

        {/* Media Upload — supports image, gif, mp4 */}
        <MediaUpload
          label="Item Media (Image / GIF / Video)"
          value={formData.image}
          onChange={(url) => setFormData(prev => ({ ...prev, image: url }))}
          storagePath={`menu/${cafeId}`}
          maxSizeMB={20}
          disabled={saving}
        />

        {/* Available checkbox */}
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

        {/* Add-ons / Customisations — restored from original build */}
        <AddOnEditor
          addons={formData.addons || []}
          onChange={(updated) => setFormData(prev => ({ ...prev, addons: updated }))}
          currencySymbol={CUR}
          disabled={saving}
        />

        {/* Size-based pricing — new feature */}
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
                type="number"
                min="0"
                step="0.01"
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
                type="number"
                min="0"
                step="0.01"
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
                type="number"
                min="0"
                step="0.01"
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

        {/* Buttons */}
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

  return (
    <div className="space-y-6">
      {/* Add New Item button — unchanged */}
      <button
        onClick={() => {
          resetForm();           // clear any editing state
          setShowForm(true);     // open the top form for new items
        }}
        className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Add Menu Item
      </button>

      {/* Top form — shown only for "Add New Item" (editingItem is null) ─────── */}
      {/* When editing an existing item the inline accordion below is used instead */}
      {showForm && !editingItem && renderEditForm()}

      {/* Menu items list */}
      {loading ? (
        <div className="text-center text-[#A3A3A3] py-8">Loading menu...</div>
      ) : menuItems && menuItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item) => (
            <div
              key={item.id}
              id={`menu-item-${item.id}`}
              className="bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden hover:border-white/10 transition-colors"
            >
              {/* Item card — identical to original ──────────────────────────── */}
              {item.image && (
                <div className="aspect-video overflow-hidden">
                  <MediaPreview
                    url={item.image}
                    alt={item.name}
                    className="w-full h-full"
                  />
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
                <div className="flex items-center gap-2 mb-4">
                  <div className={`px-2 py-1 rounded-sm text-xs font-medium ${item.available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {item.available ? 'Available' : 'Unavailable'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {/* Edit button — calls handleEdit (unchanged) AND toggles accordion */}
                  <button
                    onClick={() => {
                      const opening = editingItemId !== item.id;
                      setEditingItemId(opening ? item.id : null);
                      if (opening) {
                        handleEdit(item); // populate formData + set editingItem — unchanged
                      } else {
                        resetForm();      // close accordion + clear state
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

              {/* Inline edit accordion — opens below this card only ─────────── */}
              {/* All form fields and save logic are identical to the top form */}
              {editingItemId === item.id && renderEditForm()}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-12 text-center">
          <p className="text-[#A3A3A3] text-lg">No menu items yet. Add your first item!</p>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
