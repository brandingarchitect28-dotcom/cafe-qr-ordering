import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, X, Package, Percent, Gift, Check } from 'lucide-react';
import { toast } from 'sonner';
import MediaUpload from '../MediaUpload';
import { useTheme } from '../../hooks/useTheme';

const OFFER_TYPES = [
  { id: 'combo', label: 'Combo Deal', icon: Package, description: 'Bundle items at special price' },
  { id: 'discount', label: 'Discount', icon: Percent, description: 'Percentage or flat discount' },
  { id: 'buy_x_get_y', label: 'Buy X Get Y', icon: Gift, description: 'Buy items, get free items' },
];

const OffersManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'combo',
    items: [], // { itemId, itemName, itemPrice, quantity }
    comboPrice: '',
    discountAmount: '',
    discountType: 'percentage', // 'percentage' or 'flat'
    buyQuantity: 1,
    getQuantity: 1,
    getItemId: '',
    bannerImage: '',
    active: true
  });

  const { data: offers, loading } = useCollection(
    'offers',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  const { data: menuItems } = useCollection(
    'menuItems',
    cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  // Calculate original price of selected items
  const originalPrice = useMemo(() => {
    return formData.items.reduce((sum, item) => {
      return sum + (item.itemPrice * item.quantity);
    }, 0);
  }, [formData.items]);

  // Calculate savings
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

  const handleBannerChange = (url) => {
    setFormData(prev => ({ ...prev, bannerImage: url }));
  };

  const addItemToOffer = (menuItem) => {
    const existing = formData.items.find(i => i.itemId === menuItem.id);
    if (existing) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(i => 
          i.itemId === menuItem.id 
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        items: [...prev.items, {
          itemId: menuItem.id,
          itemName: menuItem.name,
          itemPrice: menuItem.price,
          quantity: 1
        }]
      }));
    }
  };

  const removeItemFromOffer = (itemId) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.itemId !== itemId)
    }));
  };

  const updateItemQuantity = (itemId, quantity) => {
    if (quantity < 1) {
      removeItemFromOffer(itemId);
      return;
    }
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(i => 
        i.itemId === itemId ? { ...i, quantity } : i
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cafeId) {
      toast.error('Cafe ID not found');
      return;
    }

    if (formData.items.length === 0) {
      toast.error('Please add at least one menu item to the offer');
      return;
    }

    try {
      const offerData = {
        cafeId,
        title: formData.title,
        description: formData.description,
        type: formData.type,
        items: formData.items,
        bannerImage: formData.bannerImage,
        active: formData.active,
        originalPrice,
      };

      // Add type-specific fields
      if (formData.type === 'combo') {
        offerData.comboPrice = parseFloat(formData.comboPrice) || originalPrice;
        offerData.savings = savings;
      } else if (formData.type === 'discount') {
        offerData.discountAmount = parseFloat(formData.discountAmount) || 0;
        offerData.discountType = formData.discountType;
        offerData.savings = savings;
      } else if (formData.type === 'buy_x_get_y') {
        offerData.buyQuantity = parseInt(formData.buyQuantity) || 1;
        offerData.getQuantity = parseInt(formData.getQuantity) || 1;
        offerData.getItemId = formData.getItemId;
        const freeItem = menuItems?.find(m => m.id === formData.getItemId);
        offerData.getItemName = freeItem?.name || '';
        offerData.getItemPrice = freeItem?.price || 0;
      }

      if (editingOffer) {
        await updateDoc(doc(db, 'offers', editingOffer.id), offerData);
        toast.success('Offer updated');
      } else {
        await addDoc(collection(db, 'offers'), offerData);
        toast.success('Offer created');
      }

      resetForm();
    } catch (error) {
      console.error('Error saving offer:', error);
      toast.error('Failed to save offer');
    }
  };

  const handleEdit = (offer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title || '',
      description: offer.description || '',
      type: offer.type || 'combo',
      items: offer.items || [],
      comboPrice: offer.comboPrice?.toString() || '',
      discountAmount: offer.discountAmount?.toString() || '',
      discountType: offer.discountType || 'percentage',
      buyQuantity: offer.buyQuantity || 1,
      getQuantity: offer.getQuantity || 1,
      getItemId: offer.getItemId || '',
      bannerImage: offer.bannerImage || '',
      active: offer.active !== false
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this offer?')) return;

    try {
      await deleteDoc(doc(db, 'offers', id));
      toast.success('Offer deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete offer');
    }
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'offers', id), { active: !currentStatus });
      toast.success('Offer status updated');
    } catch (error) {
      console.error('Error updating offer:', error);
      toast.error('Failed to update offer');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'combo',
      items: [],
      comboPrice: '',
      discountAmount: '',
      discountType: 'percentage',
      buyQuantity: 1,
      getQuantity: 1,
      getItemId: '',
      bannerImage: '',
      active: true
    });
    setEditingOffer(null);
    setShowForm(false);
  };

  const getOfferTypeLabel = (type) => {
    const offerType = OFFER_TYPES.find(t => t.id === type);
    return offerType?.label || type;
  };

  const getOfferTypeIcon = (type) => {
    const offerType = OFFER_TYPES.find(t => t.id === type);
    return offerType?.icon || Package;
  };

  return (
    <div className="space-y-6">
      <button
        data-testid="add-offer-btn"
        onClick={() => setShowForm(true)}
        className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Create Offer
      </button>

      {showForm && (
        <div className={`${T.card} rounded-sm p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-xl font-semibold ${T.heading}`} style={{ fontFamily: 'Playfair Display, serif' }}>
              {editingOffer ? 'Edit Offer' : 'Create New Offer'}
            </h3>
            <button onClick={resetForm} className={`text-[#A3A3A3] hover:${T.heading} transition-colors`}>
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Offer Type Selection */}
            <div>
              <label className={`block ${T.label} text-sm font-medium mb-3`}>Offer Type</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {OFFER_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type: type.id }))}
                      className={`p-4 rounded-sm border transition-all text-left ${
                        formData.type === type.id
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                          : '${T.borderMd} hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${formData.type === type.id ? 'text-[#D4AF37]' : 'text-[#A3A3A3]'}`} />
                        <span className={`font-semibold ${formData.type === type.id ? 'text-[#D4AF37]' : 'text-white'}`}>
                          {type.label}
                        </span>
                      </div>
                      <p className={`${T.muted} text-sm`}>{type.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block ${T.label} text-sm font-medium mb-2`}>Offer Title</label>
                <input
                  type="text"
                  data-testid="offer-title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className={`w-full ${T.innerCard} border ${T.borderMd} text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                  placeholder="e.g., Breakfast Combo"
                  required
                />
              </div>
              <div>
                <label className={`block ${T.label} text-sm font-medium mb-2`}>Description</label>
                <input
                  type="text"
                  data-testid="offer-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className={`w-full ${T.innerCard} border ${T.borderMd} text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                  placeholder="Coffee + Sandwich at special price"
                  required
                />
              </div>
            </div>

            {/* Menu Item Selection */}
            <div>
              <label className={`block ${T.label} text-sm font-medium mb-3`}>Select Menu Items</label>
              <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 ${T.innerCard} rounded-sm border ${T.borderMd}`}>
                {menuItems?.map((item) => {
                  const isSelected = formData.items.some(i => i.itemId === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItemToOffer(item)}
                      className={`p-3 rounded-sm border text-left transition-all ${
                        isSelected
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                          : '${T.borderMd} hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`${T.label} text-sm font-medium truncate`}>{item.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />}
                      </div>
                      <span className="text-[#D4AF37] text-sm">{CUR}{item.price}</span>
                    </button>
                  );
                })}
                {(!menuItems || menuItems.length === 0) && (
                  <p className={`col-span-full text-center ${T.muted} py-4`}>No menu items available</p>
                )}
              </div>
            </div>

            {/* Selected Items */}
            {formData.items.length > 0 && (
              <div>
                <label className={`block ${T.label} text-sm font-medium mb-3`}>
                  Selected Items ({formData.items.length})
                </label>
                <div className={`space-y-2 ${T.innerCard} rounded-sm border ${T.borderMd} p-3`}>
                  {formData.items.map((item) => (
                    <div key={item.itemId} className={`flex items-center justify-between ${T.subCard} p-3 rounded`}>
                      <div>
                        <span className={`${T.label} font-medium`}>{item.itemName}</span>
                        <span className={`${T.muted} ml-2`}>{CUR}{item.itemPrice}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.itemId, item.quantity - 1)}
                            className={`w-8 h-8 bg-white/10 hover:bg-white/20 rounded flex items-center justify-center ${T.heading}`}
                          >
                            -
                          </button>
                          <span className={`${T.heading} w-8 text-center`}>{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.itemId, item.quantity + 1)}
                            className={`w-8 h-8 bg-white/10 hover:bg-white/20 rounded flex items-center justify-center ${T.heading}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItemFromOffer(item.itemId)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className={`border-t ${T.borderMd} pt-3 mt-3 flex justify-between`}>
                    <span className={`${T.muted}`}>Original Price:</span>
                    <span className={`${T.heading} font-bold`}>{CUR}{originalPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Type-specific fields */}
            {formData.type === 'combo' && formData.items.length > 0 && (
              <div>
                <label className={`block ${T.label} text-sm font-medium mb-2`}>Combo Price</label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={formData.comboPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, comboPrice: e.target.value }))}
                    className={`w-40 ${T.innerCard} border ${T.borderMd} text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                    placeholder={CUR}
                    min="0"
                    step="0.01"
                  />
                  {savings > 0 && (
                    <span className="text-green-400 font-semibold">
                      Customer saves {CUR}{savings.toFixed(2)}!
                    </span>
                  )}
                </div>
              </div>
            )}

            {formData.type === 'discount' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block ${T.label} text-sm font-medium mb-2`}>Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData(prev => ({ ...prev, discountType: e.target.value }))}
                    className={`w-full ${T.innerCard} border ${T.borderMd} text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">{`Flat Amount (${CUR})`}</option>
                  </select>
                </div>
                <div>
                  <label className={`block ${T.label} text-sm font-medium mb-2`}>
                    {formData.discountType === 'percentage' ? 'Discount (%)' : `Discount Amount (${CUR})`}
                  </label>
                  <input
                    type="number"
                    value={formData.discountAmount}
                    onChange={(e) => setFormData(prev => ({ ...prev, discountAmount: e.target.value }))}
                    className={`w-full ${T.innerCard} border ${T.borderMd} text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                    placeholder={formData.discountType === 'percentage' ? '10' : '50'}
                    min="0"
                    max={formData.discountType === 'percentage' ? '100' : undefined}
                  />
                </div>
              </div>
            )}

            {formData.type === 'buy_x_get_y' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={`block ${T.label} text-sm font-medium mb-2`}>Buy Quantity</label>
                  <input
                    type="number"
                    value={formData.buyQuantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, buyQuantity: e.target.value }))}
                    className={`w-full ${T.innerCard} border ${T.borderMd} text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                    min="1"
                  />
                </div>
                <div>
                  <label className={`block ${T.label} text-sm font-medium mb-2`}>Get Free Item</label>
                  <select
                    value={formData.getItemId}
                    onChange={(e) => setFormData(prev => ({ ...prev, getItemId: e.target.value }))}
                    className={`w-full ${T.innerCard} border ${T.borderMd} text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                  >
                    <option value="">Select item...</option>
                    {menuItems?.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({CUR}{item.price})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block ${T.label} text-sm font-medium mb-2`}>Free Quantity</label>
                  <input
                    type="number"
                    value={formData.getQuantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, getQuantity: e.target.value }))}
                    className={`w-full ${T.innerCard} border ${T.borderMd} text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                    min="1"
                  />
                </div>
              </div>
            )}

            {/* Banner Image / Media */}
            <MediaUpload
              label="Banner Image / GIF / Video (Optional)"
              value={formData.bannerImage}
              onChange={handleBannerChange}
              storagePath={`offers/${cafeId}`}
              maxSizeMB={20}
              disabled={uploading}
            />

            {/* Active Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                data-testid="offer-active"
                checked={formData.active}
                onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                className={`w-5 h-5 rounded ${T.borderMd} ${T.innerCard} text-[#D4AF37] focus:ring-[#D4AF37]`}
              />
              <label className={`${T.heading}`}>Active (visible to customers)</label>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                data-testid="save-offer-btn"
                disabled={uploading || formData.items.length === 0}
                className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : editingOffer ? 'Update Offer' : 'Create Offer'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className={`bg-transparent border ${T.borderMd} text-white hover:${T.subCard} rounded-sm px-6 py-3 font-semibold transition-all`}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Offers List */}
      {loading ? (
        <div className={`text-center ${T.muted} py-8`}>Loading offers...</div>
      ) : offers && offers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {offers.map((offer) => {
            const TypeIcon = getOfferTypeIcon(offer.type);
            return (
              <div
                key={offer.id}
                data-testid={`offer-${offer.id}`}
                className={`${T.card} rounded-sm overflow-hidden hover:${T.borderMd} transition-colors`}
              >
                {offer.bannerImage && (
                  <div className="aspect-video overflow-hidden">
                    <img src={offer.bannerImage} alt={offer.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <TypeIcon className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-[#D4AF37] text-xs font-medium uppercase">
                          {getOfferTypeLabel(offer.type)}
                        </span>
                      </div>
                      <h3 className={`text-xl font-semibold ${T.heading}`}>{offer.title}</h3>
                    </div>
                    <div
                      className={`px-2 py-1 rounded-sm text-xs font-medium ${
                        offer.active
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {offer.active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                  <p className={`${T.muted} mb-3`}>{offer.description}</p>
                  
                  {/* Items in offer */}
                  {offer.items && offer.items.length > 0 && (
                    <div className={`mb-3 p-3 ${T.innerCard} rounded`}>
                      <p className={`${T.muted} text-xs mb-2`}>Includes:</p>
                      <div className="flex flex-wrap gap-2">
                        {offer.items.map((item, idx) => (
                          <span key={idx} className={`${T.body} text-sm bg-white/10 px-2 py-1 rounded`}>
                            {item.itemName} x{item.quantity}
                          </span>
                        ))}
                      </div>
                      {offer.type === 'combo' && offer.comboPrice && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`${T.muted} line-through`}>{CUR}{offer.originalPrice}</span>
                          <span className="text-[#D4AF37] font-bold text-lg">{CUR}{offer.comboPrice}</span>
                          {offer.savings > 0 && (
                            <span className="text-green-400 text-sm">Save {CUR}{offer.savings.toFixed(0)}</span>
                          )}
                        </div>
                      )}
                      {offer.type === 'discount' && (
                        <div className="mt-2">
                          <span className="text-[#D4AF37] font-bold">
                            {offer.discountType === 'percentage' 
                              ? `${offer.discountAmount}% OFF` 
                              : `${CUR}${offer.discountAmount} OFF`}
                          </span>
                        </div>
                      )}
                      {offer.type === 'buy_x_get_y' && offer.getItemName && (
                        <div className="mt-2">
                          <span className="text-[#D4AF37] font-bold">
                            Buy {offer.buyQuantity}, Get {offer.getQuantity} {offer.getItemName} FREE!
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      data-testid={`edit-offer-${offer.id}`}
                      onClick={() => handleEdit(offer)}
                      className={`flex-1 ${T.subCard} hover:bg-white/10 text-white rounded-sm px-4 py-2 transition-all flex items-center justify-center gap-2`}
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      data-testid={`toggle-offer-${offer.id}`}
                      onClick={() => toggleActive(offer.id, offer.active)}
                      className="bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] rounded-sm px-4 py-2 transition-all"
                    >
                      {offer.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      data-testid={`delete-offer-${offer.id}`}
                      onClick={() => handleDelete(offer.id)}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-sm px-4 py-2 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`${T.card} rounded-sm p-12 text-center`}>
          <Package className={`w-12 h-12 ${T.muted} mx-auto mb-4`} />
          <p className={`${T.muted} text-lg`}>No offers yet. Create your first offer!</p>
          <p className="text-[#666] text-sm mt-2">Link menu items to create combos, discounts, or buy-one-get-one deals</p>
        </div>
      )}
    </div>
  );
};

export default OffersManagement;
