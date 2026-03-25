import React, { useState } from 'react';
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
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '', price: '', category: '', image: '', available: true, addons: []
  });

  const { data: menuItems, loading } = useCollection(
    'menuItems',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ─── Upload + Save ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cafeId) { toast.error('Cafe ID not found — please refresh'); return; }

    setSaving(true);
    try {
      const itemData = {
        name:      formData.name,
        price:     parseFloat(formData.price),
        category:  formData.category,
        image:     formData.image,
        available: formData.available,
        addons:    formData.addons || [],   // [] = no add-ons; backward-compatible
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

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name:      item.name,
      price:     item.price,
      category:  item.category || '',
      image:     item.image || '',
      available: item.available,
      addons:    item.addons || [],
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
    setFormData({ name: '', price: '', category: '', image: '', available: true, addons: [] });
    setEditingItem(null);
    setSaving(false);
    setShowForm(false);
  };

  // Button label logic
  const buttonLabel = () => {
    if (uploading && uploadProgress > 0 && uploadProgress < 100) return `Uploading... ${uploadProgress}%`;
    if (uploading && uploadProgress === 100) return 'Saving to database...';
    if (uploading) return 'Please wait...';
    return editingItem ? 'Update Item' : 'Add Item';
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowForm(true)}
        className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Add Menu Item
      </button>

      {showForm && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
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

            {/* Add-ons / Customisations */}
            <AddOnEditor
              addons={formData.addons}
              onChange={(addons) => setFormData(prev => ({ ...prev, addons }))}
              currencySymbol={CUR}
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
      )}

      {/* Menu items list */}
      {loading ? (
        <div className="text-center text-[#A3A3A3] py-8">Loading menu...</div>
      ) : menuItems && menuItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item) => (
            <div key={item.id} className="bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden hover:border-white/10 transition-colors">
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
                  <span className="text-lg font-bold text-[#D4AF37]">{CUR}{item.price.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`px-2 py-1 rounded-sm text-xs font-medium ${item.available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {item.available ? 'Available' : 'Unavailable'}
                  </div>
                  {item.addons?.length > 0 && (
                    <div className="px-2 py-1 rounded-sm text-xs font-medium bg-[#D4AF37]/15 text-[#D4AF37]">
                      {item.addons.length} add-on{item.addons.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(item)} className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-sm px-4 py-2 transition-all flex items-center justify-center gap-2">
                    <Edit className="w-4 h-4" /> Edit
                  </button>
                  <button onClick={() => toggleAvailability(item.id, item.available)} className="bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] rounded-sm px-4 py-2 transition-all">
                    {item.available ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-sm px-4 py-2 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
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
