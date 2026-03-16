import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadImage } from '../../utils/uploadImage';
import { Plus, Edit, Trash2, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MenuManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);

  const [formData, setFormData] = useState({
    name: '', price: '', category: '', image: '', available: true
  });

  const { data: menuItems, loading } = useCollection(
    'menuItems',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // ─── File selection (does NOT upload yet) ─────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WebP)');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  // ─── Upload + Save ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cafeId) { toast.error('Cafe ID not found — please refresh'); return; }

    setUploading(true);
    setUploadProgress(0);
    let imageUrl = formData.image; // keep existing URL if no new file chosen

    try {
      // Step 1: Upload image if a new file was selected
      if (selectedFile) {
        const toastId = toast.loading('Uploading image... 0%');
        try {
          const path = `menu/${cafeId}/${Date.now()}_${selectedFile.name}`;
          imageUrl = await uploadImage(selectedFile, path, (pct) => {
            setUploadProgress(pct);
            if (pct < 30) toast.loading('Starting upload...', { id: toastId });
            else if (pct < 50) toast.loading('Uploading image...', { id: toastId });
            else if (pct < 90) toast.loading(`Uploading... ${pct}%`, { id: toastId });
            else toast.loading('Finalizing upload...', { id: toastId });
          });
          toast.success('Image uploaded!', { id: toastId });
        } catch (uploadError) {
          toast.error(`Image upload failed: ${uploadError.message}`, { id: toastId });
          setUploading(false);
          setUploadProgress(0);
          return; // Stop — don't save item without image if one was selected
        }
      }

      // Step 2: Save to Firestore
      const itemData = {
        name: formData.name,
        price: parseFloat(formData.price),
        category: formData.category,
        image: imageUrl,
        available: formData.available,
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
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setSelectedFile(null);
    setFormData({
      name: item.name,
      price: item.price,
      category: item.category || '',
      image: item.image || '',
      available: item.available,
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
    setSelectedFile(null);
    setUploadProgress(0);
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
            <button onClick={resetForm} disabled={uploading} className="text-[#A3A3A3] hover:text-white transition-colors disabled:opacity-50">
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
                disabled={uploading}
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
                  disabled={uploading}
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
                  disabled={uploading}
                />
              </div>
            </div>

            {/* Image */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                disabled={uploading}
                className="w-full bg-black/20 border border-white/10 text-white rounded-sm px-4 py-3 file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:bg-[#D4AF37] file:text-black file:font-semibold hover:file:bg-[#C5A059] transition-all disabled:opacity-50"
              />
              {/* Show selected file name */}
              {selectedFile && (
                <p className="text-sm text-[#D4AF37] mt-1">Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
              )}
              {/* Show existing image preview */}
              {formData.image && !selectedFile && (
                <div className="mt-2">
                  <p className="text-xs text-[#A3A3A3] mb-1">Current image:</p>
                  <img src={formData.image} alt="Current" className="w-24 h-24 object-cover rounded-sm border border-white/10" />
                </div>
              )}
              {/* Upload progress bar */}
              {uploading && uploadProgress > 0 && (
                <div className="mt-2">
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className="bg-[#D4AF37] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#A3A3A3] mt-1">{uploadProgress}% uploaded</p>
                </div>
              )}
            </div>

            {/* Available checkbox */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.available}
                onChange={(e) => setFormData(prev => ({ ...prev, available: e.target.checked }))}
                disabled={uploading}
                className="w-5 h-5 rounded border-white/10 bg-black/20 text-[#D4AF37] focus:ring-[#D4AF37]"
              />
              <label className="text-white">Available for order</label>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={uploading}
                className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                {buttonLabel()}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={uploading}
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
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
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
