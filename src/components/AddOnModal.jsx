/**
 * AddOnModal.jsx
 * Customer-facing modal for selecting add-ons before adding item to cart.
 *
 * Features:
 * - Multi-select add-ons (checkboxes)
 * - Single-select add-on groups (radio buttons)
 * - Live price preview
 * - Grouped display if group label set
 *
 * Used by CafeOrdering.jsx and CafeOrderingPremium.jsx.
 * Items without addons never trigger this — no UX change for them.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Plus, Minus, Check } from 'lucide-react';

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

const AddOnModal = ({
  item,           // full menu item object — item.addons[]
  onConfirm,      // (cartEntry) => void — called with enriched cart item
  onClose,        // () => void
  currencySymbol, // '₹'
  primaryColor,   // hex — for theming
  theme,          // light | dark
}) => {
  const CUR     = currencySymbol || '₹';
  const primary = primaryColor   || '#D4AF37';
  const isDark  = theme !== 'light';

  const [selected,  setSelected ] = useState({});  // addonId → true/false
  const [quantity,  setQuantity ] = useState(1);

  const addons = item?.addons || [];

  // Group add-ons by their group label
  const grouped = useMemo(() => {
    const map = {};
    addons.forEach(a => {
      const key = a.group || '__ungrouped__';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [addons]);

  const toggleAddon = (addon) => {
    if (addon.type === 'single') {
      // For single-select groups: deselect others in same group
      const sameGroup = addons.filter(a => a.group === addon.group && a.type === 'single');
      setSelected(prev => {
        const next = { ...prev };
        sameGroup.forEach(a => { next[a.id] = false; });
        next[addon.id] = !prev[addon.id];
        return next;
      });
    } else {
      setSelected(prev => ({ ...prev, [addon.id]: !prev[addon.id] }));
    }
  };

  const selectedAddons = addons.filter(a => selected[a.id]);
  const addonTotal     = selectedAddons.reduce((sum, a) => sum + (a.price || 0), 0);
  const itemTotal      = (parseFloat(item.price) + addonTotal) * quantity;

  const handleConfirm = () => {
    // Cart entry structure — fully backward compatible
    // Items without addons use the same fields, addons/addonTotal just default to []
    onConfirm({
      ...item,
      selectedSize: item.selectedSize || null, // 
      quantity,
      addons:     selectedAddons.map(a => ({ id: a.id, name: a.name, price: a.price })),
      addonTotal, // extra amount from addons only
      // effectivePrice = base + addonTotal so pricing system works without changes
      price:      parseFloat(item.price) + addonTotal,
      basePrice:  parseFloat(item.price), // keep original for display
    });
  };

  const bg        = isDark ? '#0F0F0F' : '#FFFFFF';
  const text      = isDark ? '#FFFFFF' : '#111111';
  const muted     = isDark ? '#A3A3A3' : '#666666';
  const surface   = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const border    = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[88vh]"
          style={{ background: bg }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-5 pb-3">
            <div className="flex-1 min-w-0 pr-3">
              <h3 className="font-bold text-lg leading-tight truncate" style={{ color: text, fontFamily: 'Playfair Display, serif' }}>
                {item.name}
              </h3>
              <p className="text-sm mt-0.5" style={{ color: primary }}>
                {CUR}{fmt(item.price)} base price
              </p>
            </div>
            <button onClick={onClose}
              className="p-2 rounded-full flex-shrink-0 transition-colors hover:opacity-70"
              style={{ background: surface }}>
              <X className="w-4 h-4" style={{ color: muted }} />
            </button>
          </div>

          {/* Add-ons scroll area */}
          <div className="overflow-y-auto flex-1 px-5 pb-3 space-y-5">
            {Object.entries(grouped).map(([groupKey, groupAddons]) => {
              const isUngrouped = groupKey === '__ungrouped__';
              const isSingle    = groupAddons[0]?.type === 'single';
              return (
                <div key={groupKey}>
                  {!isUngrouped && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: muted }}>
                        {groupKey}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: isSingle ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)',
                          color: isSingle ? '#60A5FA' : '#34D399' }}>
                        {isSingle ? 'Choose one' : 'Choose any'}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {groupAddons.map(addon => {
                      const isOn = !!selected[addon.id];
                      return (
                        <motion.button
                          key={addon.id}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => toggleAddon(addon)}
                          className="w-full flex items-center justify-between p-3 rounded-xl text-left transition-all"
                          style={{
                            background: isOn ? `${primary}14` : surface,
                            border: `1.5px solid ${isOn ? primary : border}`,
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {/* Checkbox / Radio indicator */}
                            <div className="w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center transition-all"
                              style={{
                                background: isOn ? primary : 'transparent',
                                border: `2px solid ${isOn ? primary : border}`,
                                borderRadius: addon.type === 'single' ? '50%' : '4px',
                              }}>
                              {isOn && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                            </div>
                            <span className="text-sm font-medium" style={{ color: text }}>{addon.name}</span>
                          </div>
                          <span className="text-sm font-bold flex-shrink-0" style={{ color: addon.price > 0 ? primary : muted }}>
                            {addon.price > 0 ? `+${CUR}${fmt(addon.price)}` : 'Free'}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-5 pt-3 space-y-3" style={{ borderTop: `1px solid ${border}` }}>
            {/* Add-on summary */}
            {selectedAddons.length > 0 && (
              <div className="text-xs space-y-0.5" style={{ color: muted }}>
                {selectedAddons.map(a => (
                  <div key={a.id} className="flex justify-between">
                    <span>{a.name}</span>
                    <span style={{ color: primary }}>+{CUR}{fmt(a.price)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity + total */}
            <div className="flex items-center justify-between">
              {/* Quantity */}
              <div className="flex items-center gap-3">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                  style={{ background: surface, border: `1px solid ${border}` }}>
                  <Minus className="w-4 h-4" style={{ color: muted }} />
                </button>
                <span className="font-bold text-lg min-w-[24px] text-center" style={{ color: text }}>{quantity}</span>
                <button onClick={() => setQuantity(q => q + 1)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                  style={{ background: primary }}>
                  <Plus className="w-4 h-4 text-black" />
                </button>
              </div>

              {/* Confirm */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleConfirm}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-black"
                style={{ background: primary }}>
                <ShoppingCart className="w-4 h-4" />
                Add  {CUR}{fmt(itemTotal)}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddOnModal;
