import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { where, addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Plus, Edit, Trash2, X, Package, Percent, Gift, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import MediaUpload from '../MediaUpload';
import { useTheme } from '../../hooks/useTheme';

const OFFER_TYPES = [
  { id: 'combo',       label: 'Combo Deal',   icon: Package, description: 'Bundle items at special price' },
  { id: 'discount',    label: 'Discount',      icon: Percent, description: 'Percentage or flat discount'  },
  { id: 'buy_x_get_y', label: 'Buy X Get Y',  icon: Gift,    description: 'Buy items, get free items'    },
];

// ─── Helper: build size options from a menu item's sizePricing ────────────────
const getSizeOptions = (item) => {
  if (!item?.sizePricing?.enabled) return [];
  const sp = item.sizePricing;
  return [
    sp.small  != null && sp.small  !== '' && { key: 'small',  label: 'Small',  price: parseFloat(sp.small)  },
    sp.medium != null && sp.medium !== '' && { key: 'medium', label: 'Medium', price: parseFloat(sp.medium) },
    sp.large  != null && sp.large  !== '' && { key: 'large',  label: 'Large',  price: parseFloat(sp.large)  },
  ].filter(Boolean);
};

// ─── Helper: composite key so same item in different sizes = separate entries ─
const itemKey = (itemId, sizeKey) => sizeKey ? `${itemId}_${sizeKey}` : itemId;

const OffersManagement = () => {
  const { user }  = useAuth();
  const cafeId    = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();
  const CUR = cafe?.currencySymbol || '₹';

  const [showForm,      setShowForm     ] = useState(false);
  const [editingOffer,  setEditingOffer ] = useState(null);
  const [uploading,     setUploading    ] = useState(false);

  // ── NEW: tracks which item in the picker is awaiting size selection ───────────
  // null = no size picker open
  // { item, forFreeSlot: bool } = size picker open for this item
  const [pendingSizeItem, setPendingSizeItem] = useState(null);

  const [formData, setFormData] = useState({
    title:          '',
    description:    '',
    type:           'combo',
    // ── IMPROVED items[] shape ────────────────────────────────────────────────
    // Each entry: { itemId, itemName, itemPrice, quantity,
    //               selectedSize, selectedSizeKey, hasSizes }
    // selectedSize / selectedSizeKey are null for non-size items — backward compat.
    items:          [],
    comboPrice:     '',
    discountAmount: '',
    discountType:   'percentage',
    buyQuantity:    1,
    getQuantity:    1,
    // ── IMPROVED free-item fields for Buy X Get Y ─────────────────────────────
    getItemId:      '',
    getItemName:    '',
    getItemPrice:   0,       // correct price (size-aware)
    getItemSize:    null,    // human label e.g. 'Small'
    getItemSizeKey: null,    // Firestore key e.g. 'small'
    bannerImage:    '',
    active:         true,
  });

  const { data: offers,    loading } = useCollection('offers',    cafeId ? [where('cafeId', '==', cafeId)] : []);
  const { data: menuItems          } = useCollection('menuItems', cafeId ? [where('cafeId', '==', cafeId)] : []);

  // ── originalPrice — uses size-corrected itemPrice ─────────────────────────────
  const originalPrice = useMemo(() =>
    formData.items.reduce((sum, i) => sum + (i.itemPrice * i.quantity), 0),
  [formData.items]);

  // ── savings — unchanged logic; now correct because originalPrice is correct ───
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

  const handleBannerChange = (url) => setFormData(prev => ({ ...prev, bannerImage: url }));

  // ── addItemToOffer — IMPROVED ─────────────────────────────────────────────────
  // If item has sizePricing.enabled → open size picker (pendingSizeItem).
  // If no sizes → add directly at item.price (backward compatible).
  const addItemToOffer = (menuItem, forFreeSlot = false) => {
    const sizeOptions = getSizeOptions(menuItem);
    if (sizeOptions.length > 0) {
      // Has sizes — open inline picker; resolved in confirmSizeSelection()
      setPendingSizeItem({ item: menuItem, forFreeSlot });
      return;
    }
    // No sizes — add directly (same as before)
    if (forFreeSlot) {
      // For Buy X Get Y free item without sizes
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

  // ── confirmSizeSelection — called when admin picks S/M/L in inline picker ─────
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

  // ── _addOfferItem — internal: adds/increments an item in formData.items[] ─────
  // Composite key = itemId + '_' + sizeKey so S and L of same item are separate.
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
          // ── IMPROVED: size-correct price stored here ──────────────────────
          itemPrice:       resolvedPrice,
          quantity:        1,
          // ── NEW: size fields (null for non-size items — backward compat) ──
          selectedSize:    sizeLabel,    // e.g. 'Small' | null
          selectedSizeKey: sizeKey,      // e.g. 'small' | null
          hasSizes:        !!sizeKey,
        }],
      };
    });
  };

  // ── removeItemFromOffer — uses composite key ──────────────────────────────────
  const removeItemFromOffer = (itemId, sizeKey) => {
    const key = itemKey(itemId, sizeKey);
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => itemKey(i.itemId, i.selectedSizeKey) !== key),
    }));
  };

  // ── updateItemQuantity — uses composite key ───────────────────────────────────
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

  // ── handleSubmit — UNCHANGED structure, new fields written to Firestore ────────
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
        // ── items[] now carries selectedSize + selectedSizeKey + hasSizes ───────
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
        // ── IMPROVED: full free-item data stored (size-aware) ─────────────────
        offerData.getItemId      = formData.getItemId;
        offerData.getItemName    = formData.getItemName;
        offerData.getItemPrice   = formData.getItemPrice;
        offerData.getItemSize    = formData.getItemSize    || null;
        offerData.getItemSizeKey = formData.getItemSizeKey || null;
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

  // ── handleEdit — reads new fields from Firestore, defaults if missing ─────────
  const handleEdit = (offer) => {
    setEditingOffer(offer);
    setFormData({
      title:          offer.title          || '',
      description:    offer.description    || '',
      type:           offer.type           || 'combo',
      // items[] already has selectedSize/selectedSizeKey if saved with new code;
      // old offers without these fields still load correctly — they'll have null.
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this offer?')) return;
    try {
      await deleteDoc(doc(db, 'offers', id));
      toast.success('Offer deleted');
    } catch (error) {
      toast.error('Failed to delete offer');
    }
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'offers', id), { active: !currentStatus });
      toast.success('Offer status updated');
    } catch (error) {
      toast.error('Failed to update offer');
    }
  };

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

  const getOfferTypeLabel = (type) => OFFER_TYPES.find(t => t.id === type)?.label || type;
  const getOfferTypeIcon  = (type) => OFFER_TYPES.find(t => t.id === type)?.icon  || Package;

  // ── fmtP: safe price formatter ───────────────────────────────────────────────
  const fmtP = (n) => (parseFloat(n) || 0).toFixed(2);

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
            <button onClick={resetForm} className="text-[#A3A3A3] hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Offer Type Selection — unchanged */}
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
                          : 'border-white/10 hover:border-white/20'
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

            {/* Basic Info — unchanged */}
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

            {/* ── Menu Item Picker — IMPROVED ─────────────────────────────────── */}
            {/* For Buy X Get Y, this section selects the BOUGHT items only.      */}
            {/* The free item is selected separately below.                        */}
            <div>
              <label className={`block ${T.label} text-sm font-medium mb-1`}>
                {formData.type === 'buy_x_get_y' ? 'Items Customer Must Buy' : 'Select Menu Items'}
              </label>
              <p className="text-xs text-[#A3A3A3] mb-3">
                {formData.type === 'buy_x_get_y'
                  ? 'Tap to add. Items with sizes will ask for size.'
                  : 'Tap to add. Items with sizes (S/M/L) will ask for size.'}
              </p>

              {/* ── Inline size picker — appears when pendingSizeItem is set ─── */}
              {pendingSizeItem && !pendingSizeItem.forFreeSlot && (
                <div className="mb-3 p-4 rounded-sm border border-[#D4AF37]/40 bg-[#D4AF37]/08">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-white text-sm font-semibold">
                      Select size for: <span className="text-[#D4AF37]">{pendingSizeItem.item.name}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setPendingSizeItem(null)}
                      className="text-[#A3A3A3] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {getSizeOptions(pendingSizeItem.item).map(sz => (
                      <button
                        key={sz.key}
                        type="button"
                        onClick={() => confirmSizeSelection(sz)}
                        className="px-4 py-2 rounded-sm border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] font-semibold text-sm hover:bg-[#D4AF37]/20 transition-all"
                      >
                        {sz.label} — {CUR}{fmtP(sz.price)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 ${T.innerCard} rounded-sm border ${T.borderMd}`}>
                {menuItems?.map((item) => {
                  const hasSizes   = getSizeOptions(item).length > 0;
                  // An item is "selected" if any size/variant of it is in items[]
                  const isSelected = formData.items.some(i => i.itemId === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItemToOffer(item, false)}
                      className={`p-3 rounded-sm border text-left transition-all ${
                        isSelected
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`${T.label} text-sm font-medium truncate`}>{item.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />}
                      </div>
                      {/* Show size hint or base price */}
                      {hasSizes ? (
                        <span className="text-[#A3A3A3] text-xs flex items-center gap-1 mt-0.5">
                          <ChevronDown className="w-3 h-3" /> Sizes available
                        </span>
                      ) : (
                        <span className="text-[#D4AF37] text-sm">{CUR}{fmtP(item.price)}</span>
                      )}
                    </button>
                  );
                })}
                {(!menuItems || menuItems.length === 0) && (
                  <p className={`col-span-full text-center ${T.muted} py-4`}>No menu items available</p>
                )}
              </div>
            </div>

            {/* ── Selected Items list — IMPROVED ──────────────────────────────── */}
            {formData.items.length > 0 && (
              <div>
                <label className={`block ${T.label} text-sm font-medium mb-3`}>
                  Selected Items ({formData.items.length})
                </label>
                <div className={`space-y-2 ${T.innerCard} rounded-sm border ${T.borderMd} p-3`}>
                  {formData.items.map((item) => {
                    const key = itemKey(item.itemId, item.selectedSizeKey);
                    return (
                      <div key={key} className={`flex items-center justify-between ${T.subCard} p-3 rounded`}>
                        <div>
                          <span className={`${T.label} font-medium`}>{item.itemName}</span>
                          {/* Show size label if set */}
                          {item.selectedSize && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] font-semibold">
                              {item.selectedSize}
                            </span>
                          )}
                          {/* Show size-correct price */}
                          <span className={`${T.muted} ml-2 text-sm`}>
                            {CUR}{fmtP(item.itemPrice)} each
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateItemQuantity(item.itemId, item.selectedSizeKey, item.quantity - 1)}
                              className={`w-8 h-8 bg-white/10 hover:bg-white/20 rounded flex items-center justify-center ${T.heading}`}
                            >
                              -
                            </button>
                            <span className={`${T.heading} w-8 text-center`}>{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateItemQuantity(item.itemId, item.selectedSizeKey, item.quantity + 1)}
                              className={`w-8 h-8 bg-white/10 hover:bg-white/20 rounded flex items-center justify-center ${T.heading}`}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItemFromOffer(item.itemId, item.selectedSizeKey)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* ── Original price — now size-correct ─────────────────────── */}
                  <div className={`border-t ${T.borderMd} pt-3 mt-3 flex justify-between`}>
                    <span className={`${T.muted}`}>Original Price:</span>
                    <span className={`${T.heading} font-bold`}>{CUR}{fmtP(originalPrice)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Type-specific fields ────────────────────────────────────────── */}

            {/* Combo — unchanged except savings is now correct */}
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
                      Customer saves {CUR}{fmtP(savings)}!
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Discount — unchanged */}
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

            {/* ── Buy X Get Y — IMPROVED ──────────────────────────────────────── */}
            {formData.type === 'buy_x_get_y' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <label className={`block ${T.label} text-sm font-medium mb-2`}>Get Free Quantity</label>
                    <input
                      type="number"
                      value={formData.getQuantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, getQuantity: e.target.value }))}
                      className={`w-full ${T.innerCard} border ${T.borderMd} text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all`}
                      min="1"
                    />
                  </div>
                </div>

                {/* ── Free item picker — IMPROVED: size-aware ─────────────────── */}
                <div>
                  <label className={`block ${T.label} text-sm font-medium mb-1`}>Get Free Item</label>
                  <p className="text-xs text-[#A3A3A3] mb-2">Select the item customer receives for free.</p>

                  {/* Current free item display */}
                  {formData.getItemId && (
                    <div className="mb-2 flex items-center gap-3 p-3 rounded-sm border border-[#D4AF37]/30 bg-[#D4AF37]/08">
                      <div className="flex-1">
                        <span className="text-white text-sm font-semibold">{formData.getItemName}</span>
                        {formData.getItemSize && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] font-semibold">
                            {formData.getItemSize}
                          </span>
                        )}
                        <span className="ml-2 text-[#A3A3A3] text-xs">
                          ({CUR}{fmtP(formData.getItemPrice)} — given free)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          getItemId: '', getItemName: '', getItemPrice: 0,
                          getItemSize: null, getItemSizeKey: null,
                        }))}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Inline size picker for free item */}
                  {pendingSizeItem && pendingSizeItem.forFreeSlot && (
                    <div className="mb-2 p-4 rounded-sm border border-[#D4AF37]/40 bg-[#D4AF37]/08">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white text-sm font-semibold">
                          Select size for free item: <span className="text-[#D4AF37]">{pendingSizeItem.item.name}</span>
                        </p>
                        <button type="button" onClick={() => setPendingSizeItem(null)} className="text-[#A3A3A3] hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {getSizeOptions(pendingSizeItem.item).map(sz => (
                          <button
                            key={sz.key}
                            type="button"
                            onClick={() => confirmSizeSelection(sz)}
                            className="px-4 py-2 rounded-sm border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] font-semibold text-sm hover:bg-[#D4AF37]/20 transition-all"
                          >
                            {sz.label} — {CUR}{fmtP(sz.price)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Free item menu picker */}
                  {!formData.getItemId && (
                    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 ${T.innerCard} rounded-sm border ${T.borderMd}`}>
                      {menuItems?.map(item => {
                        const hasSizes = getSizeOptions(item).length > 0;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => addItemToOffer(item, true)}
                            className="p-3 rounded-sm border border-white/10 hover:border-[#D4AF37]/40 text-left transition-all"
                          >
                            <p className={`${T.label} text-sm font-medium truncate`}>{item.name}</p>
                            {hasSizes ? (
                              <span className="text-[#A3A3A3] text-xs flex items-center gap-1 mt-0.5">
                                <ChevronDown className="w-3 h-3" /> Sizes available
                              </span>
                            ) : (
                              <span className="text-[#D4AF37] text-sm">{CUR}{fmtP(item.price)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Banner Image — unchanged */}
            <MediaUpload
              label="Banner Image / GIF / Video (Optional)"
              value={formData.bannerImage}
              onChange={handleBannerChange}
              storagePath={`offers/${cafeId}`}
              maxSizeMB={20}
              disabled={uploading}
            />

            {/* Active Toggle — unchanged */}
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

            {/* Submit — unchanged */}
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

      {/* ── Offers List — IMPROVED: shows size + corrected price display ───────── */}
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
                    <div className={`px-2 py-1 rounded-sm text-xs font-medium ${
                      offer.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {offer.active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                  <p className={`${T.muted} mb-3`}>{offer.description}</p>

                  {offer.items && offer.items.length > 0 && (
                    <div className={`mb-3 p-3 ${T.innerCard} rounded`}>
                      <p className={`${T.muted} text-xs mb-2`}>Includes:</p>
                      <div className="flex flex-wrap gap-2">
                        {offer.items.map((item, idx) => (
                          <span key={idx} className={`${T.body} text-sm bg-white/10 px-2 py-1 rounded`}>
                            {item.itemName}
                            {/* Show size badge on card if size is set */}
                            {item.selectedSize && (
                              <span className="ml-1 text-[#D4AF37] font-semibold">({item.selectedSize})</span>
                            )}
                            {' '}x{item.quantity}
                            {' '}<span className="text-[#D4AF37] text-xs">{CUR}{fmtP(item.itemPrice)}</span>
                          </span>
                        ))}
                      </div>
                      {offer.type === 'combo' && offer.comboPrice && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`${T.muted} line-through`}>{CUR}{fmtP(offer.originalPrice)}</span>
                          <span className="text-[#D4AF37] font-bold text-lg">{CUR}{fmtP(offer.comboPrice)}</span>
                          {offer.savings > 0 && (
                            <span className="text-green-400 text-sm">Save {CUR}{fmtP(offer.savings)}</span>
                          )}
                        </div>
                      )}
                      {offer.type === 'discount' && (
                        <div className="mt-2">
                          <span className="text-[#D4AF37] font-bold">
                            {offer.discountType === 'percentage'
                              ? `${offer.discountAmount}% OFF`
                              : `${CUR}${fmtP(offer.discountAmount)} OFF`}
                          </span>
                        </div>
                      )}
                      {offer.type === 'buy_x_get_y' && offer.getItemName && (
                        <div className="mt-2">
                          <span className="text-[#D4AF37] font-bold">
                            Buy {offer.buyQuantity}, Get {offer.getQuantity}{' '}
                            {offer.getItemName}
                            {offer.getItemSize ? ` (${offer.getItemSize})` : ''} FREE!
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
