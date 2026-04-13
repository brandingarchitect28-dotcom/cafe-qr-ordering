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
import { X, ShoppingCart, Plus, Minus } from 'lucide-react';

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

  // CHANGE 1 — Replace bool-map `selected` with qty-map `addonQtys`.
  // addonQtys[addonId] = 0 means not selected; > 0 means selected with that qty.
  // This is the only state needed — the bool selected state is removed entirely.
  const [addonQtys, setAddonQtys] = useState({});  // addonId → number (0 = off)
  const [quantity,  setQuantity ] = useState(1);

  const addons = item?.addons || [];

  // Group add-ons by their group label — unchanged
  const grouped = useMemo(() => {
    const map = {};
    addons.forEach(a => {
      const key = a.group || '__ungrouped__';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [addons]);

  // CHANGE 2 — increment / decrement helpers replace toggleAddon.
  // incrementAddon: for single-type groups, zero all siblings first (radio
  // behaviour preserved — only one option in the group can be > 0 at a time).
  const incrementAddon = (addon) => {
    setAddonQtys(prev => {
      const next = { ...prev };
      if (addon.type === 'single') {
        // Zero every sibling in this radio group before setting this one to 1
        addons
          .filter(a => a.group === addon.group && a.type === 'single')
          .forEach(a => { next[a.id] = 0; });
        next[addon.id] = 1; // radio: max 1
      } else {
        next[addon.id] = (prev[addon.id] || 0) + 1;
      }
      return next;
    });
  };

  const decrementAddon = (addon) => {
    setAddonQtys(prev => {
      const current = prev[addon.id] || 0;
      if (current <= 1) {
        const next = { ...prev };
        next[addon.id] = 0; // drop to 0 = deselected
        return next;
      }
      return { ...prev, [addon.id]: current - 1 };
    });
  };

  // CHANGE 3 — selectedAddons and addonTotal now use qty.
  // selectedAddons: only addons whose qty > 0.
  // addonTotal: sum(price × qty) instead of sum(price × 1).
  const selectedAddons = addons.filter(a => (addonQtys[a.id] || 0) > 0);
  const addonTotal     = addons.reduce(
    (sum, a) => sum + (a.price || 0) * (addonQtys[a.id] || 0), 0
  );
  const itemTotal = (parseFloat(item.price) + addonTotal) * quantity;

  // CHANGE 4 — handleConfirm now includes quantity on each addon entry.
  // Structure: { id, name, price, quantity }
  // addonTotal is sum(price × qty) — already computed correctly above.
  const handleConfirm = () => {
    onConfirm({
      ...item,
      selectedSize:    item.selectedSize    || null,
      selectedVariant: item.selectedVariant || null,
      quantity,
      addons: selectedAddons.map(a => ({
        id:       a.id,
        name:     a.name,
        price:    a.price,
        quantity: addonQtys[a.id] || 1,  // always ≥ 1 since selectedAddons filters qty > 0
      })),
      addonTotal,
      // finalPrice = variantPrice (or basePrice) + addonTotal
      price:     parseFloat(item.price) + addonTotal,
      basePrice: parseFloat(item.price),
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
                      const qty  = addonQtys[addon.id] || 0;
                      const isOn = qty > 0;
                      // CHANGE 5 — Row is now a plain div, not a button.
                      // Interaction via [-] / [+] buttons inside the row.
                      // Active state (isOn) styling is identical to the old
                      // checked state — no visual design changes.
                      return (
                        <motion.div
                          key={addon.id}
                          layout
                          className="w-full flex items-center justify-between p-3 rounded-xl"
                          style={{
                            background: isOn ? `${primary}14` : surface,
                            border: `1.5px solid ${isOn ? primary : border}`,
                            transition: 'background 0.15s, border-color 0.15s',
                          }}
                        >
                          {/* Left — addon name + per-unit price */}
                          <div className="flex-1 min-w-0 pr-3">
                            <span className="text-sm font-medium" style={{ color: text }}>
                              {addon.name}
                            </span>
                            <span className="text-xs ml-2" style={{ color: addon.price > 0 ? primary : muted }}>
                              {addon.price > 0 ? `+${CUR}${fmt(addon.price)} each` : 'Free'}
                            </span>
                          </div>

                          {/* Right — [-] qty [+] controls */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => decrementAddon(addon)}
                              // Visually disabled at qty=0 but still tappable (no-op via decrement logic)
                              className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                              style={{
                                background: isOn ? `${primary}22` : surface,
                                border: `1px solid ${isOn ? primary : border}`,
                                opacity: isOn ? 1 : 0.45,
                              }}
                            >
                              <Minus className="w-3 h-3" style={{ color: isOn ? primary : muted }} />
                            </button>

                            <span
                              className="text-sm font-bold min-w-[18px] text-center"
                              style={{ color: isOn ? primary : muted }}
                            >
                              {qty}
                            </span>

                            <button
                              type="button"
                              onClick={() => incrementAddon(addon)}
                              className="w-7 h-7 rounded-full flex items-center justify-center transition-all text-black"
                              style={{ background: primary }}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-5 pt-3 space-y-3" style={{ borderTop: `1px solid ${border}` }}>
            {/* CHANGE 6 — Addon summary shows qty and total per addon */}
            {selectedAddons.length > 0 && (
              <div className="text-xs space-y-0.5" style={{ color: muted }}>
                {selectedAddons.map(a => {
                  const qty      = addonQtys[a.id] || 1;
                  const lineAmt  = (a.price || 0) * qty;
                  return (
                    <div key={a.id} className="flex justify-between">
                      <span>{a.name}{qty > 1 ? ` ×${qty}` : ''}</span>
                      <span style={{ color: primary }}>
                        {lineAmt > 0 ? `+${CUR}${fmt(lineAmt)}` : 'Free'}
                      </span>
                    </div>
                  );
                })}
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
