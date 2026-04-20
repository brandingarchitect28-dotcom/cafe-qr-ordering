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
  FolderOpen, Coffee, Utensils, Calendar, Settings,
} from 'lucide-react';
import {
  subscribeToInventory, addInventoryItem, updateInventoryItem,
  updateStockQuantity, deleteInventoryItem, UNITS,
} from '../../services/inventoryService';
import RecipeManager from './RecipeManager';
import { useTheme } from '../../hooks/useTheme';

if (typeof document !== 'undefined' && !document.getElementById('inv-mgmt-css')) {
  const el = document.createElement('style');
  el.id = 'inv-mgmt-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .imv { font-family: 'DM Sans', system-ui, sans-serif; }
    .imv-title { font-family: 'Playfair Display', serif !important; }
    .imv-card { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 16px; transition: border-color 200ms; }
    .imv-card:hover { border-color: rgba(201,162,39,0.18); }
    .imv-input { background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px; color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600; font-family: 'DM Sans', system-ui, sans-serif; outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms; }
    .imv-input:focus { border-color: rgba(201,162,39,0.55); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .imv-input::placeholder { color: #3d3020; }
    .imv-select { background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 9px; color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600; font-family: 'DM Sans', system-ui, sans-serif; outline: none; width: 100%; cursor: pointer; transition: border-color 160ms; }
    .imv-select:focus { border-color: rgba(201,162,39,0.5); }
    .imv-select option { background: #1c1509; }
    .imv-btn { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Sans', system-ui, sans-serif; font-weight: 800; font-size: 13px; padding: 8px 16px; border-radius: 12px; border: 1.5px solid transparent; cursor: pointer; transition: all 180ms; white-space: nowrap; }
    .imv-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .imv-btn:active { transform: scale(0.96); }
    .imv-btn-orange { background: linear-gradient(135deg,#C9A227,#A67C00); color:#fff; box-shadow: 0 3px 12px rgba(201,162,39,0.3); }
    .imv-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .imv-btn-ghost:hover { background: rgba(255,255,255,0.09); color: #fff; }
    .imv-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .imv-btn-red:hover { background: rgba(220,50,50,0.22); }
    .imv-row { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 150ms; }
    .imv-row:hover { background: rgba(201,162,39,0.03); }
    @keyframes imvIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .imv-in { animation: imvIn 250ms ease forwards; }
  `;
  document.head.appendChild(el);
}

const EMPTY_FORM = { itemName: '', category: '', quantity: '', unit: 'pcs', lowStockThreshold: '', costPerUnit: '' };

const isLow = (item) => typeof item.quantity === 'number' && typeof item.lowStockThreshold === 'number' && item.quantity <= item.lowStockThreshold;

const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const InventoryForm = ({ initial, onSave, onClose, saving, T }) => {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.itemName.trim()) { toast.error('Item name is required'); return; }
    if (!form.category.trim()) { toast.error('Category is required'); return; }
    if (form.quantity === '') { toast.error('Quantity is required'); return; }
    if (form.lowStockThreshold === '') { toast.error('Low stock threshold is required'); return; }
    onSave(form);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 imv" onClick={onClose}>
      <motion.div initial={{ scale: 0.93, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.93, opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg,#1e1408 0%,#150f06 100%)', border: '1.5px solid rgba(201,162,39,0.18)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(201,162,39,0.1)' }}>
          <div className="flex items-center gap-3">
            {/* 📦 → Package */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.2)' }}>
              <Package className="w-5 h-5" style={{ color: '#C9A227' }} />
            </div>
            {/* ✏️ → Pencil, ➕ → Plus */}
            <h3 className="font-black text-white imv-title text-lg flex items-center gap-1.5">
              {initial ? <><Pencil className="w-4 h-4" /> Edit Item</> : <><Plus className="w-4 h-4" /> Add Inventory Item</>}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl transition-all" style={{ color: '#7a6a55' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = '#7a6a55'}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Item Name</label>
            <input type="text" value={form.itemName} onChange={e => set('itemName', e.target.value)} placeholder="e.g., Coffee Powder" className="imv-input" data-testid="inv-item-name" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Category</label>
            <input type="text" value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g., Beverages, Dairy, Dry Goods" className="imv-input" data-testid="inv-category" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Quantity</label>
              <input type="number" min="0" step="any" value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="0" className="imv-input" data-testid="inv-quantity" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)} className="imv-select" data-testid="inv-unit">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Low Stock Threshold <span className="font-normal ml-1 normal-case" style={{ color: '#7a6a55' }}>(alert when qty ≤ this)</span></label>
            <input type="number" min="0" step="any" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', e.target.value)} placeholder="e.g., 500" className="imv-input" data-testid="inv-threshold" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#C9A227' }}>Cost Per Unit (₹) <span className="font-normal ml-1 normal-case" style={{ color: '#7a6a55' }}>(for COGS &amp; profit calc)</span></label>
            <input type="number" min="0" step="0.01" value={form.costPerUnit} onChange={e => set('costPerUnit', e.target.value)} placeholder="e.g., 5.50" className="imv-input" data-testid="inv-cost" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="imv-btn imv-btn-ghost flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="imv-btn imv-btn-orange flex-1 justify-center disabled:opacity-50" data-testid="inv-save-btn">
              {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> {initial ? 'Update Item' : 'Add Item'}</>}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

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
    if (error) toast.error('Failed to update stock');
    else toast.success(`${item.itemName} updated to ${n} ${item.unit} ✓`);
    setEditing(false);
  };

  if (editing) return (
    <div className="flex items-center gap-1.5">
      <input type="number" min="0" step="any" value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        onBlur={commit} className="w-20 rounded-lg px-2 py-1 text-sm font-bold outline-none"
        style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.5)', color: '#C9A227' }} autoFocus />
      <span className="text-xs font-bold" style={{ color: '#7a6a55' }}>{item.unit}</span>
      {saving && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: '#C9A227' }} />}
    </div>
  );

  return (
    <button onClick={() => { setVal(String(item.quantity ?? 0)); setEditing(true); }}
      className="text-left font-black text-sm hover:underline underline-offset-2 transition-colors"
      style={{ color: isLow(item) ? '#f87171' : '#fff' }} title="Click to edit quantity">
      {item.quantity ?? 0} {item.unit}
    </button>
  );
};

const InventoryManagement = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { T, isLight } = useTheme();

  const [inventory,  setInventory ] = useState([]);
  const [invLoading, setInvLoading] = useState(true);
  const [showForm,   setShowForm  ] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteId,   setDeleteId  ] = useState(null);
  const [deleting,   setDeleting  ] = useState(false);
  const [search,     setSearch    ] = useState('');
  const [catFilter,  setCatFilter ] = useState('all');
  const [showRecipeManager, setShowRecipeManager] = useState(false);

  useEffect(() => {
    if (!cafeId) { setInvLoading(false); return; }
    const unsub = subscribeToInventory(cafeId, (items) => { setInventory(items); setInvLoading(false); });
    return () => unsub();
  }, [cafeId]);

  const categories = useMemo(() => { const cats = new Set(inventory.map(i => i.category).filter(Boolean)); return ['all', ...Array.from(cats).sort()]; }, [inventory]);
  const lowStockItems = useMemo(() => inventory.filter(isLow), [inventory]);
  const filtered = useMemo(() => inventory.filter(item => {
    const matchCat = catFilter === 'all' || item.category === catFilter;
    const matchSearch = !search.trim() || item.itemName.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [inventory, catFilter, search]);

  const handleSave = async (formData) => {
    setFormSaving(true);
    let result;
    if (editTarget) { result = await updateInventoryItem(editTarget.id, formData); if (!result.error) toast.success('Item updated ✓'); }
    else { result = await addInventoryItem(cafeId, formData); if (!result.error) toast.success('Item added ✓'); }
    setFormSaving(false);
    if (result.error) { toast.error(result.error); return; }
    setShowForm(false); setEditTarget(null);
  };

  const handleEdit = (item) => { setEditTarget(item); setShowForm(true); };
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await deleteInventoryItem(deleteId);
    setDeleting(false);
    if (error) toast.error('Delete failed');
    else toast.success('Item deleted 🗑️');
    setDeleteId(null);
  };
  const openAddForm = () => { setEditTarget(null); setShowForm(true); };

  return (
    <div className="imv space-y-5">
      <AnimatePresence>{showRecipeManager && <RecipeManager onClose={() => setShowRecipeManager(false)} />}</AnimatePresence>

      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-4" style={{ background: 'rgba(220,50,50,0.08)', border: '1.5px solid rgba(220,50,50,0.22)' }} data-testid="low-stock-banner">
            <div className="flex items-start gap-3">
              {/* ⚠️ → AlertTriangle */}
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm mb-2" style={{ color: '#f87171' }}>Low Stock Warning — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} below threshold</p>
                <div className="flex flex-wrap gap-2">
                  {lowStockItems.map(item => (
                    <span key={item.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black" style={{ background: 'rgba(220,50,50,0.12)', color: '#f87171', border: '1px solid rgba(220,50,50,0.25)' }}>
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

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* 📦 → Package */}
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.2)' }}>
            <Package className="w-6 h-6" style={{ color: '#C9A227' }} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white imv-title">Inventory</h2>
            <p className="text-xs font-bold mt-0.5" style={{ color: '#7a6a55' }}>
              {inventory.length} item{inventory.length !== 1 ? 's' : ''} tracked
              {/* ⚠️ → AlertTriangle inline */}
              {lowStockItems.length > 0 && <span className="ml-2 inline-flex items-center gap-1" style={{ color: '#f87171' }}>· {lowStockItems.length} low stock <AlertTriangle className="inline w-3 h-3" /></span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowRecipeManager(true)} className="imv-btn imv-btn-ghost">
            {/* 🧪 → FlaskConical (already imported) */}
            <FlaskConical className="w-4 h-4" style={{ color: '#C9A227' }} /> Manage Recipes
          </button>
          <button onClick={openAddForm} data-testid="add-inventory-btn" className="imv-btn imv-btn-orange">
            {/* ➕ → Plus (already imported) */}
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          {/* 🔍 → Search */}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#7a6a55' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items or categories…" data-testid="inv-search" className="imv-input" style={{ paddingLeft: '2.2rem' }} />
        </div>
        <div className="flex items-center gap-2">
          {/* 🗂️ → FolderOpen */}
          <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: '#7a6a55' }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} data-testid="inv-cat-filter" className="imv-select" style={{ width: 'auto', minWidth: 140 }}>
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Items',  value: inventory.length,                        color: '#C9A227', icon: Package       },
          { label: 'Categories',   value: categories.length - 1,                   color: '#60a5fa', icon: FolderOpen    },
          { label: 'Low Stock',    value: lowStockItems.length,                    color: '#f87171', icon: AlertTriangle },
          { label: 'Stock OK',     value: inventory.length - lowStockItems.length, color: '#34d399', icon: CheckCircle2  },
        ].map(stat => (
          <div key={stat.label} className="imv-card p-4 flex items-center gap-3" style={{ borderLeft: `3px solid ${stat.color}` }}>
            {/* 📦 🗂️ ⚠️ ✅ → icon components */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: stat.color + '18' }}>
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-xl font-black text-white leading-none">{stat.value}</p>
              <p className="text-xs font-bold mt-0.5" style={{ color: '#7a6a55' }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {invLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          {/* 📦 → Package */}
          <Package className="w-10 h-10 animate-bounce" style={{ color: '#C9A227' }} />
          <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading inventory…</p>
        </div>
      ) : inventory.length === 0 ? (
        <div className="imv-card p-14 text-center">
          {/* 📦 → Package */}
          <Package className="w-12 h-12 mb-4 mx-auto" style={{ color: '#3a2e1a' }} />
          <p className="font-black text-lg text-white mb-1">No inventory items yet</p>
          <p className="text-sm mb-6 font-bold" style={{ color: '#7a6a55' }}>Start tracking your ingredients and supplies.</p>
          <button onClick={openAddForm} className="imv-btn imv-btn-orange mx-auto"><Plus className="w-4 h-4" />Add Your First Item</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="imv-card p-10 text-center">
          {/* 🔍 → Search */}
          <Search className="w-10 h-10 mb-3 mx-auto" style={{ color: '#3a2e1a' }} />
          <p className="font-bold" style={{ color: '#7a6a55' }}>No items match your search or filter.</p>
        </div>
      ) : (
        <div className="imv-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(201,162,39,0.1)', background: 'rgba(201,162,39,0.04)' }}>
                  {[
                    { label: 'Item Name',  icon: Utensils      },
                    { label: 'Category',   icon: FolderOpen    },
                    { label: 'Stock',      icon: BarChart2     },
                    { label: 'Threshold',  icon: AlertTriangle },
                    { label: 'Status',     icon: CheckCircle2  },
                    { label: 'Updated',    icon: Calendar      },
                    { label: 'Actions',    icon: Settings      },
                  ].map(h => (
                    <th key={h.label} className="text-left px-4 py-3.5 text-xs font-black uppercase tracking-wide whitespace-nowrap" style={{ color: '#C9A227' }}>
                      <span className="flex items-center gap-1"><h.icon className="w-3.5 h-3.5" /> {h.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filtered.map((item) => {
                    const low = isLow(item);
                    return (
                      <motion.tr key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="imv-row" style={{ background: low ? 'rgba(220,50,50,0.04)' : 'transparent' }} data-testid={`inv-row-${item.id}`}>
                        <td className="px-4 py-3.5"><div className="flex items-center gap-2">{low && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />}<span className="font-bold text-sm text-white">{item.itemName}</span></div></td>
                        <td className="px-4 py-3.5"><span className="px-2.5 py-1 rounded-xl text-xs font-black" style={{ background: 'rgba(201,162,39,0.08)', color: '#7a6a55', border: '1px solid rgba(201,162,39,0.15)' }}>{item.category || '—'}</span></td>
                        <td className="px-4 py-3.5"><QuickQtyEditor item={item} /></td>
                        <td className="px-4 py-3.5 text-sm font-bold" style={{ color: '#7a6a55' }}>{item.lowStockThreshold} {item.unit}</td>
                        <td className="px-4 py-3.5">
                          {low
                            /* ⚠️ → AlertTriangle, ✅ → CheckCircle2 */
                            ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black" style={{ background: 'rgba(220,50,50,0.12)', color: '#f87171', border: '1px solid rgba(220,50,50,0.25)' }}><AlertTriangle className="w-3 h-3" /> Low Stock</span>
                            : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}><CheckCircle2 className="w-3 h-3" /> Stock OK</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-bold whitespace-nowrap" style={{ color: '#4a3f35' }}>{fmtDate(item.lastUpdated || item.createdAt)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleEdit(item)} data-testid={`edit-inv-${item.id}`} className="p-1.5 rounded-lg transition-all" style={{ color: '#7a6a55' }} onMouseEnter={e => e.currentTarget.style.color = '#C9A227'} onMouseLeave={e => e.currentTarget.style.color = '#7a6a55'} title="Edit item"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteId(item.id)} data-testid={`delete-inv-${item.id}`} className="p-1.5 rounded-lg transition-all" style={{ color: '#7a6a55' }} onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = '#7a6a55'} title="Delete item"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {/* ☕ → Coffee */}
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: '#4a3f35' }}>Showing {filtered.length} of {inventory.length} items · Real-time updates active <Coffee className="inline w-3 h-3" /></span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <InventoryForm T={T}
            initial={editTarget ? { itemName: editTarget.itemName, category: editTarget.category, quantity: String(editTarget.quantity ?? ''), unit: editTarget.unit || 'pcs', lowStockThreshold: String(editTarget.lowStockThreshold ?? ''), costPerUnit: String(editTarget.costPerUnit ?? '') } : undefined}
            onSave={handleSave} onClose={() => { setShowForm(false); setEditTarget(null); }} saving={formSaving} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 imv" onClick={() => setDeleteId(null)}>
            <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 8 }}
              onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
              style={{ background: 'linear-gradient(180deg,#1e1408 0%,#150f06 100%)', border: '1.5px solid rgba(220,50,50,0.25)' }}>
              <div className="flex items-center gap-3 mb-4">
                {/* 🗑️ → Trash2 */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(220,50,50,0.1)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: '#f87171' }} />
                </div>
                <div><p className="font-black text-white">Delete Item?</p><p className="text-xs font-bold" style={{ color: '#7a6a55' }}>This cannot be undone.</p></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="imv-btn imv-btn-ghost flex-1 justify-center">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="imv-btn flex-1 justify-center disabled:opacity-50" style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
                  {/* 🗑️ → Trash2 */}
                  {deleting ? <><RefreshCw className="w-4 h-4 animate-spin" />Deleting…</> : <><Trash2 className="w-4 h-4" /> Delete</>}
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
