/**
 * AIMenuUpload.jsx
 *
 * Allows café owners to upload a menu image or PDF.
 * Sends to Render backend → OpenAI Vision → returns structured items.
 * User can preview, edit, and confirm before saving to Firestore.
 *
 * FIXES applied (2026-04-06):
 *  1. useDocument now destructures `loading` so processFile can guard
 *     against reading backendUrl before Firestore has responded.
 *  2. `cafe` added to useCallback dependency array so processFile always
 *     sees the current cafe value (was stale closure on [cafeId] only).
 *  3. Response shape updated: server returns { preview: [...] } not
 *     { success, items } — check and setItems corrected accordingly.
 *  Everything else (UI, handleSave, handleChange, JSX) is unchanged.
 *
 * ADDED (Part 3 — category inference):
 *  4. inferCategory() helper — maps item name keywords to category strings.
 *     Applied to every extracted item that has no category set.
 *     Does NOT touch items that already have a category from the AI response.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Upload, Sparkles, Check, X, Pencil, RefreshCw,
  FileImage, Plus, Trash2, Save, Lock, ChevronRight,
  Video, Image as ImageIcon, Wand2, Zap,
} from 'lucide-react';

// ── NEW: enrichment + media services (add-only, never affect existing flow) ───
import { enrichItems }          from '../../services/aiEnrichmentService';
import { resolveMedia }         from '../../services/mediaService';
import { processMediaForStorage } from '../../services/compressionService';

const CATEGORIES = ['Beverages', 'Food', 'Snacks', 'Desserts', 'Main Course', 'Starters', 'Other'];

const inputCls = 'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm px-3 h-9 text-sm transition-all';

// ─── NEW: Category inference helper (Part 3) ──────────────────────────────────
// Applied ONLY when the AI response leaves category empty/missing.
// Keyword list is additive — expand without touching anything else.
const inferCategory = (name = '') => {
  const n = name.toLowerCase();

  if (
    n.includes('coffee') || n.includes('tea') || n.includes('juice') ||
    n.includes('latte')  || n.includes('cappuccino') || n.includes('chai') ||
    n.includes('smoothie')|| n.includes('shake') || n.includes('soda') ||
    n.includes('water')  || n.includes('lassi') || n.includes('mojito')
  ) return 'Beverages';

  if (
    n.includes('pizza')  || n.includes('burger') || n.includes('pasta') ||
    n.includes('rice')   || n.includes('noodle') || n.includes('sandwich') ||
    n.includes('biryani')|| n.includes('curry')  || n.includes('wrap') ||
    n.includes('roll')   || n.includes('thali')  || n.includes('roti') ||
    n.includes('dosa')   || n.includes('idli')   || n.includes('uttapam')
  ) return 'Main Course';

  if (
    n.includes('cake')   || n.includes('ice cream') || n.includes('dessert') ||
    n.includes('brownie')|| n.includes('pastry')    || n.includes('pudding') ||
    n.includes('mousse') || n.includes('gulab')     || n.includes('kheer') ||
    n.includes('halwa')  || n.includes('mithai')
  ) return 'Desserts';

  if (
    n.includes('fries')  || n.includes('nugget')    || n.includes('spring roll') ||
    n.includes('samosa') || n.includes('pakora')    || n.includes('tikka') ||
    n.includes('soup')   || n.includes('salad')     || n.includes('bruschetta') ||
    n.includes('nachos') || n.includes('wings')
  ) return 'Starters';

  if (
    n.includes('snack')  || n.includes('biscuit')   || n.includes('cookie') ||
    n.includes('chips')  || n.includes('popcorn')   || n.includes('toast')
  ) return 'Snacks';

  return 'Other';
};

// ─── Item edit row ────────────────────────────────────────────────────────────

const ItemRow = ({ item, index, onChange, onRemove, currency }) => {
  const [editing, setEditing] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ delay: index * 0.03 }}
      className="bg-[#0A0A0A] border border-white/5 rounded-lg p-3"
    >
      {editing ? (
        <div className="grid grid-cols-12 gap-2 items-center">
          <input
            className={`${inputCls} col-span-4`}
            value={item.name}
            onChange={e => onChange(index, 'name', e.target.value)}
            placeholder="Item name"
          />
          <input
            className={`${inputCls} col-span-2`}
            type="number"
            value={item.price}
            onChange={e => onChange(index, 'price', e.target.value)}
            placeholder="Price"
          />
          <select
            className={`${inputCls} col-span-3`}
            value={item.category}
            onChange={e => onChange(index, 'category', e.target.value)}
          >
            {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#0F0F0F]">{c}</option>)}
          </select>
          <input
            className={`${inputCls} col-span-2`}
            value={item.description}
            onChange={e => onChange(index, 'description', e.target.value)}
            placeholder="Description"
          />
          <button
            onClick={() => setEditing(false)}
            className="col-span-1 p-2 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded transition-all"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[#D4AF37] text-xs font-bold">{index + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-medium text-sm truncate">{item.name || 'Unnamed item'}</p>
              <p className="text-[#A3A3A3] text-xs">{item.category}</p>
            </div>
            <span className="text-[#D4AF37] font-bold text-sm flex-shrink-0">
              {currency}{parseFloat(item.price || 0).toFixed(0)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRemove(index)}
              className="p-1.5 text-[#A3A3A3] hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const AIMenuUpload = ({ onClose }) => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;

  // FIX 1: Destructure `loading` so processFile can guard against reading
  // backendUrl before Firestore has responded (cafe is null during load).
  const { data: cafe, loading: cafeLoading } = useDocument('cafes', cafeId);
  const CUR = cafe?.currencySymbol || '₹';

  const fileInputRef = useRef(null);

  const [step,      setStep     ] = useState('upload'); // upload | preview | options | saving | done
  const [file,      setFile     ] = useState(null);
  const [preview,   setPreview  ] = useState(null);
  const [items,     setItems    ] = useState([]);
  const [loading,   setLoading  ] = useState(false);
  const [saving,    setSaving   ] = useState(false);
  const [dragOver,  setDragOver ] = useState(false);

  // ── NEW: user preference state (add-only) ────────────────────────────────────
  const [mediaPreference,  setMediaPreference ] = useState('auto');    // 'auto'|'image'|'none'
  const [wantAIDetails,    setWantAIDetails   ] = useState(true);
  const [enrichProgress,   setEnrichProgress  ] = useState(0);         // 0-100
  const [enrichTotal,      setEnrichTotal     ] = useState(0);

  // ── Platform-wide Pexels key — fetched from appSettings/global ───────────────
  // Stored once by platform owner, used by ALL café owners automatically.
  // Falls back to '' gracefully — media step just skips Pexels if missing.
  const [pexelsKey, setPexelsKey] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'global'))
      .then(snap => {
        if (snap.exists()) {
          setPexelsKey(snap.data()?.pexelsApiKey || '');
        }
      })
      .catch(() => {}); // silent fail — Pexels simply won't be used
  }, []);

  const isEnabled = cafe?.features?.aiMenu;

  // FIX 2: Add `cafe` and `cafeLoading` to dependency array so processFile
  // always sees the current value, not a stale closure from initial render.
  const processFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(selectedFile.type)) {
      toast.error('Please upload a JPG, PNG, WebP, or PDF file');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB');
      return;
    }

    setFile(selectedFile);
    if (selectedFile.type !== 'application/pdf') {
      setPreview(URL.createObjectURL(selectedFile));
    } else {
      setPreview(null);
    }

    // Convert to base64 and send to Render backend
    setLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('File read failed'));
        reader.readAsDataURL(selectedFile);
      });

      // FIX 1 continued: only check backendUrl after Firestore has loaded.
      if (cafeLoading) {
        toast.error('Loading café settings, please try again in a moment.');
        setLoading(false);
        return;
      }

      const backendUrl = cafe?.paymentSettings?.backendUrl?.replace(/\/$/, '');
      if (!backendUrl) {
        toast.error('Backend URL not set. Go to Settings → Payment to add your Render URL.');
        setLoading(false);
        return;
      }

      const response = await fetch(`${backendUrl}/api/ai-menu-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cafeId,
          imageBase64: base64,
          mimeType: selectedFile.type,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Extraction failed');
      }

      // FIX 3: Server returns { preview: [...] } not { success, items }.
      if (result.preview?.length > 0) {
        // PART 3 — Category inference: apply inferCategory() to every item
        // that has no category assigned by the AI response.
        // Items that already have a category are left untouched.
        const itemsWithCategory = result.preview.map(item => ({
          ...item,
          category: item.category && item.category !== 'Other' && item.category !== ''
            ? item.category
            : inferCategory(item.name),
        }));

        setItems(itemsWithCategory);
        setStep('preview');
        toast.success(`${result.preview.length} items extracted ✨`);
      } else {
        toast.error('No menu items found. Try a clearer image.');
      }
    } catch (err) {
      toast.error(err.message || 'Extraction failed. Try again.');
    } finally {
      setLoading(false);
    }
  }, [cafeId, cafe, cafeLoading]); // FIX 2: cafe + cafeLoading in deps

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleChange = (index, field, value) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const handleRemove = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, { name: '', price: 0, category: 'Other', description: '' }]);
  };

  const handleSave = async () => {
    const valid = items.filter(i => i.name.trim());
    if (valid.length === 0) { toast.error('Add at least one item'); return; }

    setSaving(true);
    setEnrichTotal(valid.length);
    setEnrichProgress(0);

    try {
      // ── ENRICHMENT PHASE (add-only new fields) ──────────────────────────────
      // Step A: AI food details + smart addons (if user opted in)
      let enriched = valid;
      if (wantAIDetails) {
        try {
          enriched = await enrichItems(
            valid,
            { generateDetails: true, generateAddons: true },
            (done, total) => setEnrichProgress(Math.round((done / total) * 50)) // 0-50%
          );
        } catch (enrichErr) {
          console.warn('[AIMenuUpload] Enrichment error (non-fatal):', enrichErr.message);
          enriched = valid; // Failsafe — continue with original items
        }
      }

      // Step B: Media resolution per item (if user wants media)
      // pexelsKey is fetched from appSettings/global — platform-wide, works for all cafés
      const withMedia = await Promise.all(
        enriched.map(async (item, idx) => {
          if (mediaPreference === 'none') return item;
          try {
            const raw = await resolveMedia(item.name, pexelsKey, mediaPreference);
            if (!raw) return item;
            const processed = await processMediaForStorage(raw);
            if (!processed) return item;
            return { ...item, mediaUrl: processed.url, mediaType: processed.type };
          } catch {
            return item; // Failsafe — never block
          } finally {
            setEnrichProgress(50 + Math.round(((idx + 1) / enriched.length) * 50)); // 50-100%
          }
        })
      );

      // ── SAVE PHASE — SAME as before + new optional fields ──────────────────
      // Existing fields: name, price, category, description, image, available, createdAt, source
      // New optional fields added only if present on the item: mediaUrl, mediaType,
      //   ingredients, calories, protein, carbs, fat, addons
      const batch = withMedia.map(item =>
        addDoc(collection(db, 'menuItems'), {
          cafeId,
          name:        item.name.trim(),
          price:       parseFloat(item.price) || 0,
          category:    item.category || 'Other',
          description: item.description || '',
          image:       '',
          available:   true,
          createdAt:   serverTimestamp(),
          source:      'ai_upload',
          // ── New optional fields (undefined = not stored, backward compatible) ──
          ...(item.mediaUrl  && { mediaUrl:  item.mediaUrl  }),
          ...(item.mediaType && { mediaType: item.mediaType }),
          ...(item.ingredients && { ingredients: item.ingredients }),
          ...(item.calories    && { calories:    item.calories    }),
          ...(item.protein     && { protein:     item.protein     }),
          ...(item.carbs       && { carbs:       item.carbs       }),
          ...(item.fat         && { fat:         item.fat         }),
          ...(item.addons      && { addons:      item.addons      }),
        })
      );
      await Promise.all(batch);
      setStep('done');
      toast.success(`${valid.length} items added to menu ✓`);
    } catch (err) {
      toast.error('Failed to save menu items');
    } finally {
      setSaving(false);
      setEnrichProgress(0);
    }
  };

  // ── Locked state ───────────────────────────────────────────────────────────
  if (isEnabled === false) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-[#555]" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">AI Menu Upload</h3>
        <p className="text-[#A3A3A3] text-sm max-w-xs">
          This feature is not enabled for your plan. Contact support to upgrade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
              AI Menu Upload
            </h3>
            <p className="text-[#A3A3A3] text-xs">Upload your physical menu — AI extracts items automatically</p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-[#A3A3A3]">
          {['Upload', 'Preview', 'Options', 'Done'].map((s, i) => (
            <React.Fragment key={s}>
              <span className={
                (step === 'upload'  && i === 0) ||
                (step === 'preview' && i === 1) ||
                (step === 'options' && i === 2) ||
                (step === 'done'    && i === 3)
                  ? 'text-[#D4AF37] font-semibold'
                  : 'text-[#555]'
              }>{s}</span>
              {i < 3 && <ChevronRight className="w-3 h-3 text-[#333]" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* Upload step */}
        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-[#D4AF37] bg-[#D4AF37]/5'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/3'
              }`}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-10 h-10 text-[#D4AF37] animate-spin" />
                  <p className="text-white font-semibold">Extracting menu items…</p>
                  <p className="text-[#A3A3A3] text-sm">AI is reading your menu</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center">
                    <FileImage className="w-7 h-7 text-[#D4AF37]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">Drop your menu here</p>
                    <p className="text-[#A3A3A3] text-sm mt-1">JPG, PNG, WebP, or PDF · Max 10MB</p>
                  </div>
                  <span className="text-[#D4AF37] text-sm font-semibold border border-[#D4AF37]/30 px-4 py-1.5 rounded-sm hover:bg-[#D4AF37]/10 transition-colors">
                    Browse Files
                  </span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => processFile(e.target.files[0])}
            />
          </motion.div>
        )}

        {/* Preview step */}
        {step === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-[#A3A3A3] text-sm">
                <span className="text-white font-semibold">{items.length} items</span> extracted — review and edit before saving
              </p>
              <button
                onClick={() => { setStep('upload'); setFile(null); setItems([]); }}
                className="text-[#A3A3A3] hover:text-white text-xs transition-colors"
              >
                ← Upload different file
              </button>
            </div>

            {/* Image preview */}
            {preview && (
              <img
                src={preview}
                alt="Menu preview"
                className="w-full max-h-48 object-contain rounded-lg border border-white/10 bg-black/20"
              />
            )}

            {/* Item list */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              <AnimatePresence>
                {items.map((item, i) => (
                  <ItemRow
                    key={i}
                    item={item}
                    index={i}
                    onChange={handleChange}
                    onRemove={handleRemove}
                    currency={CUR}
                  />
                ))}
              </AnimatePresence>
            </div>

            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 text-[#D4AF37] hover:text-[#C5A059] text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item Manually
            </button>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep('upload'); setFile(null); setItems([]); }}
                className="flex-1 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all"
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep('options')}
                disabled={items.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" />
                Continue → {items.length} Items
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Options step — new interactive workflow ────────────────────── */}
        {step === 'options' && (
          <motion.div
            key="options"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-6"
          >
            <p className="text-[#A3A3A3] text-sm">
              Customise how your <span className="text-white font-semibold">{items.length} items</span> are enriched before saving.
            </p>

            {/* Media preference */}
            <div className="bg-[#0A0A0A] border border-white/5 rounded-xl p-5 space-y-3">
              <p className="text-white font-semibold text-sm flex items-center gap-2">
                <Video className="w-4 h-4 text-[#D4AF37]" />
                Media (Pexels photos &amp; videos)
              </p>
              <p className="text-[#555] text-xs">
                Auto-fetch food photos or videos for each item.
                {!pexelsKey && (
                  <span className="text-amber-400"> Pexels key not configured — will use AI image fallback.</span>
                )}
                {pexelsKey && (
                  <span className="text-emerald-400"> ✓ Pexels connected — photos &amp; videos ready.</span>
                )}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'auto',  label: 'Auto Best',    icon: Zap       },
                  { val: 'image', label: 'Images Only',  icon: ImageIcon  },
                  { val: 'none',  label: 'Skip Media',   icon: X          },
                ].map(({ val, label, icon: Icon }) => (
                  <button
                    key={val}
                    onClick={() => setMediaPreference(val)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-semibold transition-all ${
                      mediaPreference === val
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]'
                        : 'border-white/10 text-[#A3A3A3] hover:border-white/20'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI food details */}
            <div className="bg-[#0A0A0A] border border-white/5 rounded-xl p-5 space-y-3">
              <p className="text-white font-semibold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                AI Food Details (ingredients + nutrition + addons)
              </p>
              <p className="text-[#555] text-xs">
                Generates calories, protein, carbs, fat and auto-suggests addons per item.
                Adds ~5s per item.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: true,  label: 'Yes, enrich items' },
                  { val: false, label: 'Skip, save as-is'  },
                ].map(({ val, label }) => (
                  <button
                    key={String(val)}
                    onClick={() => setWantAIDetails(val)}
                    className={`py-3 rounded-lg border text-xs font-semibold transition-all ${
                      wantAIDetails === val
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]'
                        : 'border-white/10 text-[#A3A3A3] hover:border-white/20'
                    }`}
                  >
                    {val ? '✦ ' : ''}{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress bar — shown during save */}
            {saving && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#A3A3A3]">
                  <span>
                    {enrichProgress < 50 ? 'Generating food details…' : 'Fetching media…'}
                  </span>
                  <span>{enrichProgress}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#D4AF37] rounded-full"
                    animate={{ width: `${enrichProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setStep('preview')}
                disabled={saving}
                className="flex-1 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white rounded-sm text-sm transition-all disabled:opacity-40"
              >
                ← Back
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
              >
                {saving
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
                  : <><Save className="w-4 h-4" /> Save {items.length} Items to Menu</>
                }
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Done step */}
        {step === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2">Menu Items Added!</h3>
            <p className="text-[#A3A3A3] text-sm mb-6">
              All items are now live in your menu and visible to customers.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setStep('upload'); setFile(null); setItems([]); setPreview(null); }}
                className="px-5 py-2 border border-white/10 text-white rounded-sm text-sm hover:bg-white/5 transition-all"
              >
                Upload Another
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-[#D4AF37] text-black font-bold rounded-sm text-sm"
                >
                  Go to Menu
                </button>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

export default AIMenuUpload;
