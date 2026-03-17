/**
 * RecipeManager.jsx
 *
 * Modal that lets cafe owners define the recipe (ingredients)
 * for any menu item. Links menuItem → inventory items.
 *
 * Opens from InventoryManagement page via "Manage Recipes" button.
 * Does NOT modify any existing component — purely additive.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X, Plus, Trash2, Save, RefreshCw,
  ChefHat, FlaskConical, Package,
} from 'lucide-react';
import { saveRecipe, getRecipe, deleteRecipe, UNITS } from '../../services/recipeService';
import { UNITS as INV_UNITS } from '../../services/inventoryService';

// ─── RecipeModal — edit recipe for ONE menu item ──────────────────────────

const RecipeModal = ({ menuItem, cafeId, inventory, onClose }) => {
  const [ingredients, setIngredients] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [saving,      setSaving     ] = useState(false);

  // Load existing recipe on mount
  useEffect(() => {
    if (!menuItem?.id) return;
    getRecipe(menuItem.id).then(({ data }) => {
      if (data?.ingredients?.length) {
        setIngredients(data.ingredients);
      } else {
        setIngredients([{ itemId: '', itemName: '', quantity: '', unit: 'g' }]);
      }
      setLoading(false);
    });
  }, [menuItem?.id]);

  const addRow = () =>
    setIngredients(prev => [...prev, { itemId: '', itemName: '', quantity: '', unit: 'g' }]);

  const removeRow = (idx) =>
    setIngredients(prev => prev.filter((_, i) => i !== idx));

  const updateRow = (idx, field, value) =>
    setIngredients(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      if (field === 'itemId') {
        // Auto-fill name and unit from inventory
        const invItem = inventory.find(inv => inv.id === value);
        return { ...row, itemId: value, itemName: invItem?.itemName || '', unit: invItem?.unit || 'g' };
      }
      return { ...row, [field]: value };
    }));

  const handleSave = async () => {
    const valid = ingredients.filter(i => i.itemId && parseFloat(i.quantity) > 0);
    if (valid.length === 0) {
      toast.error('Add at least one ingredient with quantity');
      return;
    }
    setSaving(true);
    const { error } = await saveRecipe(menuItem.id, {
      menuItemName: menuItem.name,
      cafeId,
      ingredients: valid.map(i => ({
        itemId:   i.itemId,
        itemName: i.itemName,
        quantity: parseFloat(i.quantity),
        unit:     i.unit,
      })),
    });
    setSaving(false);
    if (error) { toast.error('Failed to save recipe'); return; }
    toast.success(`Recipe saved for ${menuItem.name} ✓`);
    onClose();
  };

  const handleDelete = async () => {
    await deleteRecipe(menuItem.id);
    toast.success('Recipe deleted');
    onClose();
  };

  const inputCls = 'bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm px-3 h-10 text-sm transition-all w-full';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.93, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0F0F0F] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                Recipe — {menuItem.name}
              </p>
              <p className="text-[#A3A3A3] text-xs">Link ingredients to auto-deduct stock on order</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-6 h-6 text-[#D4AF37] animate-spin" />
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 px-1">
                <span className="col-span-5 text-[#A3A3A3] text-xs uppercase tracking-wide">Ingredient</span>
                <span className="col-span-3 text-[#A3A3A3] text-xs uppercase tracking-wide">Qty used</span>
                <span className="col-span-3 text-[#A3A3A3] text-xs uppercase tracking-wide">Unit</span>
                <span className="col-span-1" />
              </div>

              {ingredients.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  {/* Ingredient dropdown */}
                  <select
                    value={row.itemId}
                    onChange={e => updateRow(idx, 'itemId', e.target.value)}
                    className={`${inputCls} col-span-5`}
                  >
                    <option value="" className="bg-[#0F0F0F]">Select item…</option>
                    {inventory.map(inv => (
                      <option key={inv.id} value={inv.id} className="bg-[#0F0F0F]">
                        {inv.itemName} ({inv.unit})
                      </option>
                    ))}
                  </select>

                  {/* Quantity */}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={e => updateRow(idx, 'quantity', e.target.value)}
                    placeholder="0"
                    className={`${inputCls} col-span-3 text-center`}
                  />

                  {/* Unit */}
                  <select
                    value={row.unit}
                    onChange={e => updateRow(idx, 'unit', e.target.value)}
                    className={`${inputCls} col-span-3`}
                  >
                    {INV_UNITS.map(u => (
                      <option key={u} value={u} className="bg-[#0F0F0F]">{u}</option>
                    ))}
                  </select>

                  {/* Remove */}
                  <button
                    onClick={() => removeRow(idx)}
                    disabled={ingredients.length === 1}
                    className="col-span-1 p-2 text-[#A3A3A3] hover:text-red-400 hover:bg-red-500/10 rounded transition-all disabled:opacity-20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                onClick={addRow}
                className="flex items-center gap-1.5 text-[#D4AF37] hover:text-[#C5A059] text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Ingredient
              </button>

              {/* Preview */}
              {ingredients.some(i => i.itemId && i.quantity) && (
                <div className="p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-sm">
                  <p className="text-[#D4AF37] text-xs font-semibold mb-2 uppercase tracking-wide">
                    Per 1× {menuItem.name}
                  </p>
                  {ingredients.filter(i => i.itemId && i.quantity).map((i, idx) => (
                    <p key={idx} className="text-[#A3A3A3] text-xs">
                      • {i.itemName || 'Item'} → {i.quantity} {i.unit}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#0A0A0A] flex items-center justify-between gap-3 flex-shrink-0">
          <button
            onClick={handleDelete}
            className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
          >
            Delete Recipe
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-white/10 text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Recipe'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── RecipeManager — list of menu items with recipe status ────────────────

const RecipeManager = ({ onClose }) => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const { data: menuItems, loading: menuLoading } = useCollection(
    'menuItems', cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: inventory } = useCollection(
    'inventory', cafeId ? [where('cafeId', '==', cafeId)] : []
  );
  const { data: recipes } = useCollection(
    'recipes', cafeId ? [where('cafeId', '==', cafeId)] : []
  );

  const [editingItem, setEditingItem] = useState(null);

  const hasRecipe = (menuItemId) => recipes?.some(r => r.id === menuItemId);

  return (
    <>
      <AnimatePresence>
        {editingItem && (
          <RecipeModal
            menuItem={editingItem}
            cafeId={cafeId}
            inventory={inventory || []}
            onClose={() => setEditingItem(null)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.93, y: 10 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0F0F0F] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
                <FlaskConical className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <p className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Recipe Manager
                </p>
                <p className="text-[#A3A3A3] text-xs">
                  Link menu items to inventory ingredients
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Info strip */}
          <div className="px-6 py-3 bg-[#D4AF37]/5 border-b border-[#D4AF37]/10">
            <p className="text-[#A3A3A3] text-xs leading-relaxed">
              When a customer orders a menu item, its recipe ingredients are automatically
              deducted from inventory stock in real time.
            </p>
          </div>

          {/* Menu items list */}
          <div className="overflow-y-auto flex-1 p-4 space-y-2">
            {menuLoading ? (
              <div className="flex items-center justify-center py-10">
                <RefreshCw className="w-6 h-6 text-[#D4AF37] animate-spin" />
              </div>
            ) : !menuItems?.length ? (
              <div className="text-center py-10">
                <Package className="w-10 h-10 text-[#A3A3A3]/30 mx-auto mb-3" />
                <p className="text-[#A3A3A3] text-sm">No menu items found</p>
              </div>
            ) : (
              menuItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-[#0F0F0F] border border-white/5 rounded-sm hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-white font-medium text-sm">{item.name}</p>
                      <p className="text-[#A3A3A3] text-xs">{item.category || 'Uncategorized'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasRecipe(item.id) ? (
                      <span className="text-xs text-emerald-400 font-medium px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                        ✓ Recipe set
                      </span>
                    ) : (
                      <span className="text-xs text-[#A3A3A3] px-2 py-0.5 bg-white/5 border border-white/10 rounded">
                        No recipe
                      </span>
                    )}
                    <button
                      onClick={() => setEditingItem(item)}
                      className="px-3 py-1.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] rounded text-xs font-semibold transition-all"
                    >
                      {hasRecipe(item.id) ? 'Edit' : 'Set Recipe'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
};

export default RecipeManager;
