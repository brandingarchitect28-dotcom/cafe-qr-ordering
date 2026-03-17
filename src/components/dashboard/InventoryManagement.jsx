/**
 * InventoryManagement.jsx
 *
 * Dashboard tab: Inventory Management
 * Features:
 *   - Real-time Firestore listener via subscribeToInventory
 *   - Add / Edit / Delete inventory items
 *   - Manual stock quantity update (quick inline)
 *   - Search bar + category filter
 *   - Low Stock alert banner + red row highlight
 *   - Ingredient mapping tab per menu item (optional linkage)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection } from '../../hooks/useFirestore';
import { where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, X, Search, AlertTriangle,
  Package, RefreshCw, ChevronDown, CheckCircle2,
  BarChart2, Filter, Save, Boxes, FlaskConical,
} from 'lucide-react';
import {
  subscribeToInventory,
  addInventoryItem,
  updateInventoryItem,
  updateStockQuantity,
  deleteInventoryItem,
  UNITS,
} from '../../services/inventoryService';
import RecipeManager from './RecipeManager';

// ─── constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  itemName:          '',
  category:          '',
  quantity:          '',
  unit:              'pcs',
  lowStockThreshold: '',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const isLow = (item) =>
  typeof item.quantity === 'number' &&
  typeof item.lowStockThreshold === 'number' &&
  item.quantity <= item.lowStockThreshold;

const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── InventoryForm (add / edit modal) ────────────────────────────────────────

const InventoryForm = ({ initial, onSave, onClose, saving }) => {
  const [form, setForm] = useState(initial || EMPTY_FORM);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.itemName.trim())          { toast.error('Item name is required');         return; }
    if (!form.category.trim())          { toast.error('Category is required');           return; }
    if (form.quantity === '')           { toast.error('Quantity is required');           return; }
    if (form.lowStockThreshold === '')  { toast.error('Low stock threshold is required'); return; }
    onSave(form);
  };

  const inputCls =
    'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
    'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm';
  const labelCls = 'block text-white text-sm font-medium mb-1.5';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        exit={{    scale: 0.93, opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0F0F0F]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
              <Boxes className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <h3 className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
              {initial ? 'Edit Item' : 'Add Inventory Item'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Item Name */}
          <div>
            <label className={labelCls}>Item Name</label>
            <input
              type="text"
              value={form.itemName}
              onChange={e => set('itemName', e.target.value)}
              placeholder="e.g., Coffee Powder"
              className={inputCls}
              data-testid="inv-item-name"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className={labelCls}>Category</label>
            <input
              type="text"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              placeholder="e.g., Beverages, Dairy, Dry Goods"
              className={inputCls}
              data-testid="inv-category"
            />
          </div>

          {/* Quantity + Unit row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Current Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                placeholder="0"
                className={inputCls}
                data-testid="inv-quantity"
              />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm"
                data-testid="inv-unit"
              >
                {UNITS.map(u => (
                  <option key={u} value={u} className="bg-[#0F0F0F]">{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Low Stock Threshold */}
          <div>
            <label className={labelCls}>
              Low Stock Alert Threshold
              <span className="text-[#A3A3A3] font-normal ml-1 text-xs">
                (alert shown when quantity ≤ this value)
              </span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.lowStockThreshold}
              onChange={e => set('lowStockThreshold', e.target.value)}
              placeholder="e.g., 500"
              className={inputCls}
              data-testid="inv-threshold"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white hover:border-white/20 rounded-sm text-sm font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="inv-save-btn"
            >
              {saving
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Save className="w-4 h-4" /> {initial ? 'Update Item' : 'Add Item'}</>
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

// ─── QuickQtyEditor — inline quantity adjust cell ────────────────────────────

const QuickQtyEditor = ({ item }) => {
  const [editing, setEditing] = useState(false);
  const [val,     setVal    ] = useState(String(item.quantity ?? 0));
  const [saving,  setSaving ] = useState(false);

  const commit = async () => {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) { setVal(String(item.quantity ?? 0)); setEditing(false); return; }
    if (n === item.quantity) { setEditing(false); return; }
    setSaving(true);
    const { error } = await updateStockQuantity(item.id, n);
    setSaving(false);
    if (error) { toast.error('Failed to update stock'); }
    else        { toast.success(`${item.itemName} updated to ${n} ${item.unit}`); }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="any"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={commit}
          className="w-20 bg-black/40 border border-[#D4AF37]/50 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-[#D4AF37]"
          autoFocus
        />
        <span className="text-[#A3A3A3] text-xs">{item.unit}</span>
        {saving && <RefreshCw className="w-3 h-3 text-[#D4AF37] animate-spin" />}
      </div>
    );
  }

  return (
    <button
      onClick={() => { setVal(String(item.quantity ?? 0)); setEditing(true); }}
      className={`text-left font-semibold text-sm hover:underline underline-offset-2 transition-colors ${
        isLow(item) ? 'text-red-400' : 'text-white'
      }`}
      title="Click to edit quantity"
    >
      {item.quantity ?? 0} {item.unit}
    </button>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

const InventoryManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;

  const [inventory,  setInventory ] = useState([]);
  const [invLoading, setInvLoading] = useState(true);
  const [showForm,   setShowForm  ] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // item being edited
  const [formSaving, setFormSaving ] = useState(false);
  const [deleteId,   setDeleteId  ] = useState(null);   // confirm-delete modal
  const [deleting,   setDeleting  ] = useState(false);
  const [search,     setSearch    ] = useState('');
  const [catFilter,  setCatFilter ] = useState('all');
  const [showRecipeManager, setShowRecipeManager] = useState(false);

  // ── real-time listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!cafeId) { setInvLoading(false); return; }
    const unsub = subscribeToInventory(cafeId, (items) => {
      setInventory(items);
      setInvLoading(false);
    });
    return () => unsub();
  }, [cafeId]);

  // ── derived data ────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(inventory.map(i => i.category).filter(Boolean));
    return ['all', ...Array.from(cats).sort()];
  }, [inventory]);

  const lowStockItems = useMemo(() => inventory.filter(isLow), [inventory]);

  const filtered = useMemo(() => {
    return inventory.filter(item => {
      const matchCat    = catFilter === 'all' || item.category === catFilter;
      const matchSearch = !search.trim() ||
        item.itemName.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [inventory, catFilter, search]);

  // ── CRUD handlers ───────────────────────────────────────────────────────
  const handleSave = async (formData) => {
    setFormSaving(true);
    let result;
    if (editTarget) {
      result = await updateInventoryItem(editTarget.id, formData);
      if (!result.error) toast.success('Item updated ✓');
    } else {
      result = await addInventoryItem(cafeId, formData);
      if (!result.error) toast.success('Item added ✓');
    }
    setFormSaving(false);
    if (result.error) { toast.error(result.error); return; }
    setShowForm(false);
    setEditTarget(null);
  };

  const handleEdit = (item) => {
    setEditTarget(item);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await deleteInventoryItem(deleteId);
    setDeleting(false);
    if (error) { toast.error('Delete failed'); }
    else        { toast.success('Item deleted'); }
    setDeleteId(null);
  };

  const openAddForm = () => { setEditTarget(null); setShowForm(true); };

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Recipe Manager Modal ── */}
      <AnimatePresence>
        {showRecipeManager && (
          <RecipeManager onClose={() => setShowRecipeManager(false)} />
        )}
      </AnimatePresence>

      {/* ── Low Stock Alert Banner ─────────────────────────────────────── */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0   }}
            exit={{    opacity: 0, y: -10  }}
            className="bg-red-500/10 border border-red-500/25 rounded-sm p-4"
            data-testid="low-stock-banner"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-red-400 font-semibold text-sm mb-2">
                  ⚠ Low Stock Warning — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} below threshold
                </p>
                <div className="flex flex-wrap gap-2">
                  {lowStockItems.map(item => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/15 border border-red-500/25 rounded text-red-300 text-xs font-medium"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                      {item.itemName} — {item.quantity} {item.unit}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            Inventory Management
          </h2>
          <p className="text-[#A3A3A3] text-sm mt-0.5">
            {inventory.length} item{inventory.length !== 1 ? 's' : ''} tracked
            {lowStockItems.length > 0 && (
              <span className="text-red-400 ml-2">
                · {lowStockItems.length} low stock
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowRecipeManager(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-sm text-sm transition-all"
          >
            <FlaskConical className="w-4 h-4 text-[#D4AF37]" />
            Manage Recipes
          </button>
          <button
            onClick={openAddForm}
            data-testid="add-inventory-btn"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Search + Category filter ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3] w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items or categories…"
            data-testid="inv-search"
            className="w-full bg-[#0F0F0F] border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-10 pl-11 pr-4 text-sm transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#A3A3A3] flex-shrink-0" />
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            data-testid="inv-cat-filter"
            className="bg-[#0F0F0F] border border-white/10 text-white focus:border-[#D4AF37] rounded-sm h-10 px-3 text-sm transition-all"
          >
            {categories.map(c => (
              <option key={c} value={c} className="bg-[#0F0F0F]">
                {c === 'all' ? 'All Categories' : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Items',    value: inventory.length,         color: '#D4AF37', icon: Boxes        },
          { label: 'Categories',     value: categories.length - 1,    color: '#3B82F6', icon: Filter       },
          { label: 'Low Stock',      value: lowStockItems.length,     color: '#EF4444', icon: AlertTriangle },
          { label: 'Stock OK',       value: inventory.length - lowStockItems.length, color: '#10B981', icon: CheckCircle2 },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-[#0F0F0F] border border-white/5 rounded-sm p-4 flex items-center gap-3"
              style={{ borderLeft: `3px solid ${stat.color}` }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: stat.color + '18' }}
              >
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-xl font-bold text-white leading-none">{stat.value}</p>
                <p className="text-[#A3A3A3] text-xs mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Inventory Table ─────────────────────────────────────────────── */}
      {invLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-7 h-7 text-[#D4AF37] animate-spin" />
        </div>
      ) : inventory.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-14 text-center">
          <Package className="w-14 h-14 text-[#A3A3A3] mx-auto mb-4" />
          <p className="text-white font-semibold text-lg mb-1">No inventory items yet</p>
          <p className="text-[#A3A3A3] text-sm mb-6">Start tracking your ingredients and supplies.</p>
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Your First Item
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-10 text-center">
          <Search className="w-10 h-10 text-[#A3A3A3] mx-auto mb-3" />
          <p className="text-[#A3A3A3]">No items match your search or filter.</p>
        </div>
      ) : (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-black/30">
                  {['Item Name', 'Category', 'Stock Quantity', 'Threshold', 'Status', 'Last Updated', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3.5 text-[#D4AF37] font-semibold text-xs uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filtered.map((item, idx) => {
                    const low = isLow(item);
                    return (
                      <motion.tr
                        key={item.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{    opacity: 0 }}
                        className={`border-b border-white/5 transition-colors ${
                          low
                            ? 'bg-red-500/5 hover:bg-red-500/8'
                            : idx % 2 === 0 ? 'hover:bg-white/3' : 'bg-white/[0.015] hover:bg-white/3'
                        }`}
                        data-testid={`inv-row-${item.id}`}
                      >
                        {/* Item Name */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {low && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                            )}
                            <span className="text-white font-medium text-sm">{item.itemName}</span>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5">
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[#A3A3A3] text-xs">
                            {item.category || '—'}
                          </span>
                        </td>

                        {/* Stock Quantity — inline editable */}
                        <td className="px-4 py-3.5">
                          <QuickQtyEditor item={item} />
                        </td>

                        {/* Threshold */}
                        <td className="px-4 py-3.5 text-[#A3A3A3] text-sm">
                          {item.lowStockThreshold} {item.unit}
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3.5">
                          {low ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/15 border border-red-500/25 rounded text-red-400 text-xs font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-xs font-semibold">
                              <CheckCircle2 className="w-3 h-3" />
                              Stock OK
                            </span>
                          )}
                        </td>

                        {/* Last Updated */}
                        <td className="px-4 py-3.5 text-[#A3A3A3] text-xs whitespace-nowrap">
                          {fmtDate(item.lastUpdated || item.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleEdit(item)}
                              data-testid={`edit-inv-${item.id}`}
                              className="p-1.5 text-[#A3A3A3] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded transition-all"
                              title="Edit item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(item.id)}
                              data-testid={`delete-inv-${item.id}`}
                              className="p-1.5 text-[#A3A3A3] hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-white/5 text-[#A3A3A3] text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Showing {filtered.length} of {inventory.length} items · Real-time updates active
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <InventoryForm
            initial={editTarget
              ? {
                  itemName:          editTarget.itemName,
                  category:          editTarget.category,
                  quantity:          String(editTarget.quantity ?? ''),
                  unit:              editTarget.unit || 'pcs',
                  lowStockThreshold: String(editTarget.lowStockThreshold ?? ''),
                }
              : undefined
            }
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditTarget(null); }}
            saving={formSaving}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirm Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeleteId(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1,    y: 0  }}
              exit={{    scale: 0.92, y: 8  }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Delete Item?</p>
                  <p className="text-[#A3A3A3] text-xs">This cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-sm text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InventoryManagement;
