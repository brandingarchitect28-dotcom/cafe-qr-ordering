/**
 * AddOnEditor.jsx
 * Admin component embedded inside MenuManagement form.
 * Lets owner add/remove add-ons per menu item.
 *
 * Add-on schema (stored inside menuItems/{id}.addons[]):
 * {
 *   id:       string  — client-generated UUID
 *   name:     string  — "Extra Shot", "Oat Milk"
 *   price:    number  — 0 = free
 *   group:    string  — optional group label
 *   type:     "multi" | "single" — default "multi"
 * }
 *
 * No new collection — addons live inside the menu item document.
 * Fully backward-compatible: items with no addons array behave exactly as before.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, ChevronDown, ChevronUp, Layers } from 'lucide-react';

const uid = () => Math.random().toString(36).slice(2, 10);

const inputCls =
  'bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-10 px-3 text-sm outline-none transition-all';

const EMPTY_ADDON = { id: '', name: '', price: '', group: '', type: 'multi' };

const AddOnEditor = ({ addons = [], onChange, currencySymbol = '₹', disabled = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_ADDON, id: uid() });
  const [error, setError] = useState('');

  const handleAdd = () => {
    if (!draft.name.trim()) { setError('Add-on name is required'); return; }
    if (draft.price !== '' && isNaN(parseFloat(draft.price))) {
      setError('Price must be a number'); return;
    }
    const newAddon = {
      id:    draft.id || uid(),
      name:  draft.name.trim(),
      price: draft.price === '' ? 0 : parseFloat(draft.price),
      group: draft.group.trim(),
      type:  draft.type,
    };
    onChange([...addons, newAddon]);
    setDraft({ ...EMPTY_ADDON, id: uid() });
    setError('');
  };

  const handleRemove = (id) => {
    onChange(addons.filter(a => a.id !== id));
  };

  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="border border-white/10 rounded-sm overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#D4AF37]" />
          <span className="text-white text-sm font-semibold">
            Add-ons / Customisations
          </span>
          {addons.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37]">
              {addons.length} added
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[#A3A3A3]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#A3A3A3]" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">

              {/* Existing add-ons */}
              {addons.length > 0 && (
                <div className="space-y-2">
                  {addons.map((addon) => (
                    <div key={addon.id}
                      className="flex items-center justify-between px-3 py-2 rounded-sm bg-white/3 border border-white/5">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm font-medium truncate block">{addon.name}</span>
                          {addon.group && (
                            <span className="text-[#555] text-xs">{addon.group}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[#D4AF37] text-sm font-semibold">
                            {addon.price > 0 ? `+${currencySymbol}${addon.price.toFixed(2)}` : 'Free'}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-sm ${
                            addon.type === 'single'
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}>
                            {addon.type === 'single' ? 'Single' : 'Multi'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(addon.id)}
                        disabled={disabled}
                        className="ml-3 p-1.5 rounded hover:bg-red-500/20 text-[#555] hover:text-red-400 transition-all shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* New add-on form */}
              <div className="space-y-3">
                <p className="text-[#A3A3A3] text-xs font-semibold uppercase tracking-wide">Add new option</p>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    className={inputCls + ' col-span-2 sm:col-span-1'}
                    placeholder="Name  e.g. Extra Shot"
                    value={draft.name}
                    onChange={e => setDraftField('name', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                    disabled={disabled}
                  />
                  <input
                    className={inputCls}
                    placeholder={`Price (${currencySymbol}) — 0 = free`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.price}
                    onChange={e => setDraftField('price', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                    disabled={disabled}
                  />
                  <input
                    className={inputCls}
                    placeholder="Group label (optional)  e.g. Milk"
                    value={draft.group}
                    onChange={e => setDraftField('group', e.target.value)}
                    disabled={disabled}
                  />
                  <select
                    className={inputCls + ' cursor-pointer'}
                    value={draft.type}
                    onChange={e => setDraftField('type', e.target.value)}
                    disabled={disabled}
                  >
                    <option value="multi" className="bg-[#0F0F0F]">Multi-select (tick ✓)</option>
                    <option value="single" className="bg-[#0F0F0F]">Single-select (radio ○)</option>
                  </select>
                </div>

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={disabled}
                  className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border border-[#D4AF37]/20 rounded-sm text-sm font-semibold transition-all disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />Add Option
                </button>
              </div>

              {addons.length === 0 && (
                <p className="text-[#555] text-xs">
                  No add-ons yet. Items without add-ons work exactly as before.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AddOnEditor;
