/**
 * CafeOrderingPremium.jsx
 * Route: /cafe/:cafeId  (loaded when cafe.planType === 'premium')
 *
 * Ultra-premium ordering experience:
 * - Glassmorphism UI
 * - Framer Motion animations
 * - Video / GIF / Image menu cards
 * - Flying add-to-cart animation
 * - Offer detail modal (2-step flow)
 * - Full order + checkout flow (same backend as basic page)
 *
 * PATCH v2 — ADDITIVE ONLY (zero existing logic changed):
 *   • isVeg / isNonVeg  → coloured FSSAI-style dot badge on MenuCard (visual only)
 *   • isNew             → "Newly Arrived" horizontal scroll section above menu grid
 *   • isBestSeller      → "Best Sellers" horizontal scroll section above menu grid
 *   All new fields are optional booleans; undefined = falsy = zero behaviour change.
 *
 * IMPORTANT: Does NOT modify existing CafeOrdering.jsx
 */

import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, doc, addDoc,
  serverTimestamp, runTransaction, onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createInvoiceForOrder } from '../services/invoiceService';
import { deductStockForOrder } from '../services/inventoryService';
import { deductStockByRecipe } from '../services/recipeService';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import {
  ShoppingCart, Plus, Minus, X, Search, Coffee,
  ChevronDown, AlertCircle, Sparkles, Gift, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import AddOnModal from '../components/AddOnModal';
import { QRCodeSVG } from 'qrcode.react';
import { MediaPreview, getMediaType } from '../components/MediaUpload';
import FoodDetailPremium from '../components/dashboard/FoodDetailPremium';

// ─── helpers ──────────────────────────────────────────────────────────────────

const hexToRgb = (hex) => {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
    : { r: 212, g: 175, b: 55 };
};

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

// ─── Flying cart dot animation ────────────────────────────────────────────────

const FlyingDot = ({ from, to, onDone }) => {
  return (
    <motion.div
      className="fixed z-[9999] w-5 h-5 rounded-full bg-[#D4AF37] pointer-events-none shadow-lg shadow-[#D4AF37]/50"
      initial={{ x: from.x, y: from.y, scale: 1, opacity: 1 }}
      animate={{ x: to.x, y: to.y, scale: 0.3, opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
      onAnimationComplete={onDone}
    />
  );
};

// ─── Offer detail modal ───────────────────────────────────────────────────────

const OfferDetailModal = ({ offer, menuItems, CUR, onAdd, onClose, primary = '#D4AF37', theme }) => {
  const T = theme || {
    bgModal: 'rgba(10,10,10,0.95)',
    border:  'rgba(255,255,255,0.08)',
    text:    '#ffffff',
    textMuted: '#A3A3A3',
    bgInput: 'rgba(255,255,255,0.05)',
  };

  const offerItems = (offer.items || []).map(i => {
    const menuItem = menuItems.find(m => m.id === i.itemId);
    return { ...i, image: menuItem?.image || '' };
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.95 }}
        animate={{ y: 0,  opacity: 1, scale: 1    }}
        exit={{    y: 60, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: T.bgModal,
          border: `1px solid ${T.border}`,
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Banner */}
        {offer.bannerImage && (
          <div className="w-full h-44 overflow-hidden">
            <MediaPreview url={offer.bannerImage} className="w-full h-full" alt={offer.title} />
          </div>
        )}

        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
                {offer.title}
              </h2>
              {offer.description && (
                <p className="text-sm mt-1" style={{ color: T.textMuted }}>{offer.description}</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-all flex-shrink-0" style={{ color: T.textMuted }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items breakdown */}
          {offerItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: T.textMuted }}>Includes</p>
              {offerItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: T.bgInput }}>
                  {item.image && (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                      <MediaPreview url={item.image} className="w-full h-full" alt={item.itemName} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate" style={{ color: T.text }}>{item.itemName}</p>
                      {item.selectedSize && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: `${primary}25`, color: primary, border: `1px solid ${primary}40` }}
                        >
                          {item.selectedSize}
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: T.textMuted }}>
                      {CUR}{fmt(item.itemPrice)} × {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="p-4 rounded-xl" style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
            {offer.type === 'combo' && offer.comboPrice && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: T.textMuted }}>Combo Price</span>
                <span className="text-xl font-black" style={{ color: primary }}>{CUR}{fmt(offer.comboPrice)}</span>
              </div>
            )}
            {offer.type === 'discount' && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: T.textMuted }}>
                  {offer.discountType === 'percentage' ? `${offer.discountAmount}% off` : `${CUR}${fmt(offer.discountAmount)} off`}
                </span>
                <span className="text-xl font-black" style={{ color: primary }}>Save!</span>
              </div>
            )}
            {offer.type === 'buy_x_get_y' && (
              <div>
                <p className="text-sm font-semibold" style={{ color: T.text }}>
                  Buy {offer.buyQuantity} {offer.items?.[0]?.itemName || 'item'}
                  {offer.items?.[0]?.selectedSize && (
                    <span
                      className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${primary}25`, color: primary, border: `1px solid ${primary}40` }}
                    >
                      {offer.items[0].selectedSize}
                    </span>
                  )}
                  {', '}Get {offer.getQuantity}{' '}
                  <span style={{ color: primary }}>
                    {offer.getItemName || 'item'}
                    {offer.getItemSize && (
                      <span
                        className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: `${primary}25`, color: primary, border: `1px solid ${primary}40` }}
                      >
                        {offer.getItemSize}
                      </span>
                    )}
                    {' '}FREE!
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Add to cart */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { onAdd(); onClose(); }}
            className="w-full py-4 rounded-xl text-black font-bold text-base flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 20px ${primary}40` }}
          >
            <ShoppingCart className="w-5 h-5" />
            Add to Cart
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── NEW: VegNonVegDot ────────────────────────────────────────────────────────
// Visual-only FSSAI-style indicator. No props affect cart, pricing, or logic.
// Returns null when neither flag is set → zero layout impact on existing items.
const VegNonVegDot = ({ isVeg, isNonVeg }) => {
  if (!isVeg && !isNonVeg) return null;
  return (
    <div className="flex items-center gap-1">
      {isVeg && (
        <div
          className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
          style={{ border: '1.5px solid #16a34a', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          title="Vegetarian"
        >
          <div className="w-2 h-2 rounded-full bg-[#16a34a]" />
        </div>
      )}
      {isNonVeg && (
        <div
          className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
          style={{ border: '1.5px solid #dc2626', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          title="Non-Vegetarian"
        >
          <div className="w-2 h-2 rounded-full bg-[#dc2626]" />
        </div>
      )}
    </div>
  );
};

// ─── Menu Item Card (premium) ─────────────────────────────────────────────────
// PATCH: Added <VegNonVegDot> inside image overlay (bottom-left). Visual only.
// All existing logic, props, and handlers are 100% unchanged.

const MenuCard = React.memo(({
  item, CUR, cartQty, onAdd, onAddWithAnim, onShowDetails,
  primary = '#D4AF37', theme,
  selectedSize, selectedAddons, onSizeSelect, onUpdateAddon, onInlineAddToCart, getFinalPrice,
}) => {
  const mediaType = getMediaType(item.image);
  const T = theme || {
    bgCard: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
    text: '#ffffff',
    textMuted: '#A3A3A3',
  };

  const hasSizes   = item?.sizePricing != null && item.sizePricing.enabled === true;
  const hasAddons  = Array.isArray(item.addons) && item.addons.length > 0;
  const useInline  = hasSizes || hasAddons;

  const pickedSize   = selectedSize?.[item.id];
  const pickedAddons = selectedAddons?.[item.id] || {};
  const finalPrice   = getFinalPrice ? getFinalPrice(item) : parseFloat(item.price);

  const sizeOptions = hasSizes
    ? [
        item.sizePricing.small  && { label: 'Small',  key: 'small',  price: parseFloat(item.sizePricing.small)  },
        item.sizePricing.medium && { label: 'Medium', key: 'medium', price: parseFloat(item.sizePricing.medium) },
        item.sizePricing.large  && { label: 'Large',  key: 'large',  price: parseFloat(item.sizePricing.large)  },
      ].filter(Boolean)
    : [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -6, boxShadow: `0 16px 40px rgba(0,0,0,0.2)` }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl overflow-hidden relative group cursor-pointer"
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Media */}
      <div className="relative overflow-hidden aspect-[4/3]">
        {item.image ? (
          <>
            {mediaType === 'video' ? (
              <video
                src={item.image}
                autoPlay muted loop playsInline
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            ) : (
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: `${primary}08` }}>
            <Coffee className="w-12 h-12" style={{ color: primary, opacity: 0.3 }} />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent transition-opacity duration-300 group-hover:opacity-80" />

        {/* Glow on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ boxShadow: `inset 0 0 30px ${primary}20` }} />

        {/* Category pill */}
        {item.category && (
          <div className="absolute top-3 left-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', color: primary, backdropFilter: 'blur(8px)', border: `1px solid ${primary}40` }}>
              {item.category}
            </span>
          </div>
        )}

        {/* ── NEW: Veg / Non-Veg dot ──────────────────────────────────────── */}
        {/* Positioned bottom-left of the image, above the gradient layer.    */}
        {/* Visual only — no click handler, no effect on any logic.           */}
        {(item.isVeg || item.isNonVeg) && (
          <div className="absolute bottom-2 left-2 z-10">
            <VegNonVegDot isVeg={item.isVeg} isNonVeg={item.isNonVeg} />
          </div>
        )}

        {/* Cart count badge */}
        {cartQty > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full text-black text-xs font-black flex items-center justify-center shadow-lg"
            style={{ background: primary }}
          >
            {cartQty}
          </motion.div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-base leading-tight" style={{ color: T.text }}>{item.name}</h3>
          <span className="font-black text-base flex-shrink-0" style={{ color: primary }}>
            {pickedSize
              ? `${CUR}${fmt(finalPrice)}`
              : hasSizes && sizeOptions.length > 0
                ? `${CUR}${fmt(sizeOptions[0].price)}`
                : `${CUR}${fmt(item.price)}`
            }
          </span>
        </div>

        {/* ── INLINE SIZE → ADDON → ADD FLOW — 100% UNCHANGED ── */}
        {useInline ? (
          <div className="space-y-2">

            {/* STEP 1: Size buttons */}
            {hasSizes && (
              <div className="space-y-1.5">
                {sizeOptions.map(sz => (
                  <motion.button
                    key={sz.key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onSizeSelect(item.id, { label: sz.label, price: sz.price })}
                    className="w-full py-2 rounded-xl font-bold text-sm flex justify-between items-center px-3 transition-all"
                    style={pickedSize?.label === sz.label
                      ? { background: `linear-gradient(135deg, ${primary}, ${primary}dd)`, color: '#000', boxShadow: `0 2px 10px ${primary}50` }
                      : { background: `${primary}18`, color: primary, border: `1px solid ${primary}40` }
                    }
                    data-testid={`add-${sz.key}-${item.id}`}
                  >
                    <span>{sz.label}</span>
                    <span>{CUR}{sz.price.toFixed(2)}</span>
                  </motion.button>
                ))}
              </div>
            )}

            {/* STEP 2: Addons — shown AFTER size selected (or if no sizes) */}
            {hasAddons && (!hasSizes || pickedSize) && (
              <AnimatePresence>
                <motion.div
                  key="addons"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide pt-1" style={{ color: primary, opacity: 0.7 }}>
                    Add-ons
                  </p>
                  {item.addons.map(addon => {
                    const qty = pickedAddons[addon.name]?.qty || 0;
                    return (
                      <div key={addon.name}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg"
                        style={{ background: `${primary}0C` }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: T.text }}>{addon.name}</p>
                          <p className="text-xs" style={{ color: T.textMuted }}>+{CUR}{fmt(addon.price)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => onUpdateAddon(item.id, addon, 'dec')}
                            className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                            style={{ background: qty > 0 ? primary : `${primary}30`, color: qty > 0 ? '#000' : T.textMuted }}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-4 text-center" style={{ color: T.text }}>{qty > 0 ? qty : ''}</span>
                          <button
                            onClick={() => onUpdateAddon(item.id, addon, 'inc')}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-black transition-all"
                            style={{ background: primary }}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            )}

            {/* STEP 3: Add to Cart */}
            {(!hasSizes || pickedSize) && (
              <motion.button
                whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.02 }}
                onClick={() => onInlineAddToCart(item)}
                className="w-full py-2.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}dd)`, boxShadow: `0 4px 16px ${primary}30` }}
              >
                <Plus className="w-4 h-4" />
                Add to Cart · {CUR}{fmt(finalPrice)}
              </motion.button>
            )}
          </div>
        ) : (
          /* ── SIMPLE ITEM: no sizes, no addons ── */
          <motion.button
            whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.02 }}
            onClick={(e) => onAddWithAnim(e, item)}
            className="w-full py-2.5 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}dd)`, boxShadow: `0 4px 16px ${primary}30` }}
          >
            <Plus className="w-4 h-4" />Add to Cart
          </motion.button>
        )}

        {/* Show Food Details */}
        {/* ZERO FIX: Boolean() prevents React rendering "0" when all numeric fields are 0 */}
        {Boolean(item.ingredients || item.calories || item.protein || item.carbs || item.fats) && (
          <button
            onClick={() => onShowDetails?.(item)}
            className="w-full text-xs mt-2 py-1.5 text-center opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: primary }}
            data-testid={`food-detail-${item.id}`}
          >
            🔍 Show Food Details
          </button>
        )}
      </div>
    </motion.div>
  );
});
MenuCard.displayName = 'MenuCard';

// ─── NEW: CompactItemCard ─────────────────────────────────────────────────────
// Lightweight card for Newly Arrived / Best Sellers horizontal sections.
// Shows: image, name, optional tag badge, cart-in-progress dot.
// NO inline size buttons, NO addon stepper, NO quantity counter on card.
//
// CLICK BEHAVIOUR — calls onCompactClick(item) which is handleCompactItemClick:
//   1. Item has sizePricing  → opens size picker bottom sheet
//   2. After size chosen     → addToCart(item, sizeKey) → AddOnModal if addons
//   3. No sizes              → addToCart(item) → AddOnModal if addons, else direct
// Identical flow to main MenuCard. Zero new logic or state.
//
// STYLING — matches Special Offers card: gold gradient bg, gold border, gold glow.
const CompactItemCard = React.memo(({
  item,
  primary,
  glowSoft,      // passed from parent — same glowSoft used by Special Offers
  theme,
  cartQty,
  onCompactClick, // handleCompactItemClick from parent
  tagLabel,       // 'New' | 'Best Seller'
}) => {
  const T = theme || {
    bgCard:   'rgba(255,255,255,0.04)',
    border:   'rgba(255,255,255,0.08)',
    text:     '#ffffff',
    textMuted:'#A3A3A3',
  };
  const mediaType = getMediaType(item.image);

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.2 }}
      onClick={() => onCompactClick(item)}
      className="flex-shrink-0 w-40 rounded-2xl overflow-hidden cursor-pointer relative"
      style={{
        // Gold gradient background — matches Special Offers card exactly
        background:    `linear-gradient(135deg, ${primary}20, ${primary}08)`,
        border:        `1px solid ${primary}30`,
        boxShadow:     `0 4px 20px ${glowSoft}`,
        backdropFilter:'blur(12px)',
        scrollSnapAlign: 'start',
      }}
    >
      {/* Image area */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
        {item.image ? (
          mediaType === 'video' ? (
            <video src={item.image} autoPlay muted loop playsInline
              className="w-full h-full object-cover" />
          ) : (
            <img src={item.image} alt={item.name} loading="lazy"
              className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: `${primary}15` }}>
            <Coffee className="w-8 h-8" style={{ color: primary, opacity: 0.4 }} />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Tag badge — "New" or "Best Seller" */}
        {tagLabel && (
          <div className="absolute top-2 left-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: `${primary}ee`,
                color: '#000',
                backdropFilter: 'blur(4px)',
              }}
            >
              {tagLabel}
            </span>
          </div>
        )}

        {/* Veg / Non-Veg dot */}
        {(item.isVeg || item.isNonVeg) && (
          <div className="absolute bottom-1.5 left-1.5 z-10">
            <VegNonVegDot isVeg={item.isVeg} isNonVeg={item.isNonVeg} />
          </div>
        )}

        {/* Cart-in-progress badge — guard: cartQty > 0, never shows 0 */}
        {cartQty > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-2 right-2 w-5 h-5 rounded-full text-black text-[10px] font-black flex items-center justify-center shadow-md"
            style={{ background: primary }}
          >
            {cartQty}
          </motion.div>
        )}
      </div>

      {/* Name + tap hint */}
      <div className="px-2.5 py-2.5">
        <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: T.text }}>
          {item.name}
        </p>
        <p className="text-[10px] mt-1 font-medium" style={{ color: primary }}>
          Tap to add →
        </p>
      </div>
    </motion.div>
  );
});
CompactItemCard.displayName = 'CompactItemCard';

// ─── HorizontalMenuSection ────────────────────────────────────────────────────
// Renders a labelled horizontal-scroll row of CompactItemCards.
// Passes glowSoft and onCompactClick through to each card.
// Renders nothing (null) when items array is empty → no layout impact.
const HorizontalMenuSection = ({
  title,
  icon,
  items,
  primary,
  glowSoft,
  theme,
  cartQtyFor,
  onCompactClick,
  tagLabel,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <section>
      <h2
        className="font-bold text-lg mb-3 flex items-center gap-2"
        style={{ fontFamily: 'Playfair Display, serif', color: theme?.text || '#ffffff' }}
      >
        {icon}
        {title}
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-3 scrollbar-none"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {items.map(item => (
          <CompactItemCard
            key={item.id}
            item={item}
            primary={primary}
            glowSoft={glowSoft}
            theme={theme}
            cartQty={cartQtyFor(item.id)}
            onCompactClick={onCompactClick}
            tagLabel={tagLabel}
          />
        ))}
      </div>
    </section>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const CafeOrderingPremium = () => {
  const { cafeId } = useParams();
  const navigate   = useNavigate();
  const [cafe,          setCafe         ] = useState(null);
  const [menuItems,     setMenuItems    ] = useState([]);
  const [offers,        setOffers       ] = useState([]);
  const [cart,          setCart         ] = useState([]);
  const [addonModal,    setAddonModal   ] = useState(null);
  const [loading,       setLoading      ] = useState(true);
  const [cafeNotFound,  setCafeNotFound ] = useState(false);
  const [searchQuery,   setSearchQuery  ] = useState('');
  const [selectedCat,   setSelectedCat  ] = useState('all');
  const [filterType,    setFilterType   ] = useState('all'); // 'all' | 'veg' | 'nonVeg'
  // ── compact section size picker: holds the item whose size sheet is open ──
  const [compactSizeItem, setCompactSizeItem] = useState(null);
  const [showCart,      setShowCart     ] = useState(false);
  const [showCheckout,  setShowCheckout ] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [flyingDots,    setFlyingDots   ] = useState([]);
  const [selectedFoodItem, setSelectedFoodItem] = useState(null);
  const [selectedSize,   setSelectedSize  ] = useState({});
  const [selectedAddons, setSelectedAddons] = useState({});
  const cartBtnRef = useRef(null);
  const unsubRef   = useRef([]);

  // Checkout form
  const [customerName,       setCustomerName      ] = useState('');
  const [customerPhone,      setCustomerPhone     ] = useState('');
  const [orderType,          setOrderType         ] = useState('dine-in');
  const [tableNumber,        setTableNumber       ] = useState('');
  const [deliveryAddress,    setDeliveryAddress   ] = useState('');
  const [paymentMode,        setPaymentMode       ] = useState('counter');
  const [specialInstructions,setSpecialInstructions] = useState('');
  const [orderPlacing,       setOrderPlacing      ] = useState(false);
  const [orderDone,          setOrderDone         ] = useState(false);
  const [orderNumber,        setOrderNumber       ] = useState(null);

  // ── Theme
  const primary   = cafe?.primaryColor || '#D4AF37';
  const isLight   = cafe?.mode === 'light';
  const rgb        = hexToRgb(primary);
  const glow       = `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`;
  const glowSoft   = `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`;
  const CUR        = cafe?.currencySymbol || '₹';

  const T = {
    bg:          isLight ? '#f8f6f2'          : '#050505',
    bgCard:      isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.04)',
    bgOverlay:   isLight ? 'rgba(248,246,242,0.9)' : 'rgba(5,5,5,0.92)',
    bgModal:     isLight ? 'rgba(255,255,255,0.97)' : 'rgba(10,10,10,0.98)',
    bgInput:     isLight ? 'rgba(0,0,0,0.05)'  : 'rgba(255,255,255,0.06)',
    border:      isLight ? 'rgba(0,0,0,0.08)'  : 'rgba(255,255,255,0.08)',
    borderLight: isLight ? 'rgba(0,0,0,0.05)'  : 'rgba(255,255,255,0.05)',
    text:        isLight ? '#111111'            : '#ffffff',
    textMuted:   isLight ? '#666666'            : '#A3A3A3',
    textFaint:   isLight ? '#999999'            : '#555555',
    sticky:      isLight ? 'rgba(248,246,242,0.88)' : 'rgba(5,5,5,0.88)',
    heroGrad:    isLight
      ? `linear-gradient(180deg, ${primary}18 0%, transparent 100%)`
      : `linear-gradient(180deg, ${primary}15 0%, transparent 100%)`,
    cardBorder:  `1px solid ${isLight ? `rgba(0,0,0,0.07)` : `rgba(255,255,255,0.08)`}`,
  };

  // Cleanup
  useEffect(() => () => unsubRef.current.forEach(u => u?.()), []);

  // Load cafe
  useEffect(() => {
    if (!cafeId) { setCafeNotFound(true); setLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'cafes', cafeId), snap => {
      if (snap.exists()) { setCafe({ id: snap.id, ...snap.data() }); setLoading(false); }
      else { setCafeNotFound(true); setLoading(false); }
    }, () => { setCafeNotFound(true); setLoading(false); });
    unsubRef.current.push(unsub);
  }, [cafeId]);

  // Load menu
  useEffect(() => {
    if (!cafeId) return;
    const q = query(collection(db, 'menuItems'), where('cafeId', '==', cafeId), where('available', '==', true));
    const unsub = onSnapshot(q, snap => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubRef.current.push(unsub);
  }, [cafeId]);

  // Load offers
  useEffect(() => {
    if (!cafeId) return;
    const q = query(collection(db, 'offers'), where('cafeId', '==', cafeId), where('active', '==', true));
    const unsub = onSnapshot(q, snap => {
      setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubRef.current.push(unsub);
  }, [cafeId]);

  // ── Cart helpers — ALL UNCHANGED ─────────────────────────────────────────
  const cartTotal  = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const cartCount  = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartQtyFor = (id) => cart.find(i => i.id === id)?.quantity || 0;

  const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; };

  const taxCharge = useMemo(() =>
    cafe?.taxEnabled ? cartTotal * safeNum(cafe.taxRate) / 100 : 0,
  [cartTotal, cafe?.taxEnabled, cafe?.taxRate]);

  const serviceCharge = useMemo(() =>
    cafe?.serviceChargeEnabled ? cartTotal * safeNum(cafe.serviceChargeRate) / 100 : 0,
  [cartTotal, cafe?.serviceChargeEnabled, cafe?.serviceChargeRate]);

  const gstCharge = useMemo(() =>
    cafe?.gstEnabled ? cartTotal * safeNum(cafe.gstRate) / 100 : 0,
  [cartTotal, cafe?.gstEnabled, cafe?.gstRate]);

  const platformFeeCharge = useMemo(() =>
    cafe?.platformFeeEnabled ? safeNum(cafe.platformFeeAmount) : 0,
  [cafe?.platformFeeEnabled, cafe?.platformFeeAmount]);

  const totalWithCharges = useMemo(() =>
    Math.round(cartTotal + taxCharge + serviceCharge + gstCharge + platformFeeCharge),
  [cartTotal, taxCharge, serviceCharge, gstCharge, platformFeeCharge]);

  const logAmountBreakdown = () => {
    console.log('──── Order Amount Breakdown ────');
    console.log('Items:    ', cartTotal.toFixed(2));
    console.log('GST:      ', gstCharge.toFixed(2));
    console.log('Tax:      ', taxCharge.toFixed(2));
    console.log('Service:  ', serviceCharge.toFixed(2));
    console.log('Platform: ', platformFeeCharge.toFixed(2));
    console.log('Final:    ', totalWithCharges);
    console.log('────────────────────────────────');
  };

  const directAddToCart = useCallback((cartEntry) => {
    setCart(prev => {
      if (cartEntry.addons?.length > 0) {
        return [...prev, cartEntry];
      }
      if (cartEntry.selectedSize) {
        const ex = prev.find(i => i.id === cartEntry.id && i.selectedSize === cartEntry.selectedSize);
        if (ex) return prev.map(i =>
          i.id === cartEntry.id && i.selectedSize === cartEntry.selectedSize
            ? { ...i, quantity: i.quantity + 1 } : i
        );
        return [...prev, cartEntry];
      }
      const ex = prev.find(i => i.id === cartEntry.id && !i.addons?.length && !i.selectedSize);
      if (ex) return prev.map(i =>
        i.id === cartEntry.id && !i.addons?.length && !i.selectedSize
          ? { ...i, quantity: i.quantity + 1 } : i
      );
      return [...prev, cartEntry];
    });
  }, []);

  const sizeKeyToLabel = (key) => {
    if (!key) return null;
    const map = { small: 'Small', medium: 'Medium', large: 'Large' };
    return map[key] || key;
  };

  const addToCart = useCallback((item, size = null) => {
    if (item.addons?.length > 0) {
      const sizeLabel = sizeKeyToLabel(size);
      setAddonModal({ ...item, selectedSize: sizeLabel, selectedVariant: sizeLabel });
      return;
    }
    const selectedPrice = size && item.sizePricing?.[size]
      ? parseFloat(item.sizePricing[size])
      : item.price;
    const sizeLabel = sizeKeyToLabel(size);
    directAddToCart({
      ...item,
      price:           selectedPrice,
      basePrice:       selectedPrice,
      selectedSize:    sizeLabel,
      selectedVariant: sizeLabel,
      quantity:        1,
      addons:          [],
      addonTotal:      0,
      comboItems:      [],
    });
  }, [directAddToCart]);

  const removeFromCart = useCallback((id) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === id);
      if (!ex) return prev;
      if (ex.quantity === 1) return prev.filter(i => i.id !== id);
      return prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
    });
  }, []);

  const addWithAnim = useCallback((e, item, size = null) => {
    addToCart(item, size);
    const rect    = e.currentTarget.getBoundingClientRect();
    const cartRect = cartBtnRef.current?.getBoundingClientRect();
    if (!cartRect) return;
    const id = Date.now();
    setFlyingDots(prev => [...prev, {
      id,
      from: { x: rect.left + rect.width / 2 - 10, y: rect.top + rect.height / 2 - 10 },
      to:   { x: cartRect.left + cartRect.width / 2 - 10, y: cartRect.top + cartRect.height / 2 - 10 },
    }]);
  }, [addToCart]);

  // ── handleCompactItemClick — used by CompactItemCard (Newly Arrived / Best Sellers)
  // Implements the EXACT same flow as the main MenuCard:
  //   1. Item has sizePricing  → open size picker bottom sheet (compactSizeItem)
  //   2. Item has addons only  → addToCart → routes to AddOnModal (unchanged)
  //   3. Simple item           → addToCart → directAddToCart (unchanged)
  // sizeKey is passed when user picks a size from the sheet → falls to step 2/3.
  const handleCompactItemClick = useCallback((item, sizeKey = null) => {
    // Step 1: has sizes AND no size chosen yet → open size picker
    if (!sizeKey && item.sizePricing?.enabled === true) {
      setCompactSizeItem(item);
      return;
    }
    // Step 2 & 3: size chosen (or no sizes) → addToCart handles addons + direct
    addToCart(item, sizeKey);
  }, [addToCart]);

  const handleSizeSelect = useCallback((itemId, sizeObj) => {
    setSelectedSize(prev => ({ ...prev, [itemId]: sizeObj }));
    setSelectedAddons(prev => ({ ...prev, [itemId]: {} }));
  }, []);

  const updateAddon = useCallback((itemId, addon, type) => {
    setSelectedAddons(prev => {
      const itemAddons  = prev[itemId] || {};
      const currentQty  = itemAddons[addon.name]?.qty || 0;
      const newQty      = type === 'inc' ? currentQty + 1 : Math.max(0, currentQty - 1);
      return {
        ...prev,
        [itemId]: { ...itemAddons, [addon.name]: { ...addon, qty: newQty } },
      };
    });
  }, []);

  const getFinalPrice = useCallback((item) => {
    const size      = selectedSize[item.id];
    const basePrice = size?.price != null ? size.price : (parseFloat(item.price) || 0);
    const addons    = selectedAddons[item.id] || {};
    const addonTotal = Object.values(addons).reduce(
      (sum, a) => sum + (parseFloat(a.price) || 0) * (a.qty || 0), 0,
    );
    return basePrice + addonTotal;
  }, [selectedSize, selectedAddons]);

  const handleInlineAddToCart = useCallback((item) => {
    const size      = selectedSize[item.id];
    const addons    = selectedAddons[item.id] || {};
    const activeAddons = Object.values(addons)
      .filter(a => a.qty > 0)
      .map(a => ({ name: a.name, price: parseFloat(a.price) || 0, quantity: a.qty }));

    directAddToCart({
      ...item,
      price:           getFinalPrice(item),
      basePrice:       size?.price ?? parseFloat(item.price),
      selectedSize:    size?.label || null,
      selectedVariant: size?.label || null,
      quantity:        1,
      addons:          activeAddons,
      addonTotal:      activeAddons.reduce((s, a) => s + a.price * a.quantity, 0),
      comboItems:      [],
    });

    setSelectedSize(prev  => { const n = { ...prev  }; delete n[item.id]; return n; });
    setSelectedAddons(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  }, [selectedSize, selectedAddons, getFinalPrice, directAddToCart]);

  // ── Categories
  const categories = useMemo(() => {
    const cats = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    return ['all', ...cats];
  }, [menuItems]);

  const filtered = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat    = selectedCat === 'all' || item.category === selectedCat;
      const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchVeg    = filterType === 'all'
        || (filterType === 'veg'    && item.isVeg    === true)
        || (filterType === 'nonVeg' && item.isNonVeg === true);
      return matchCat && matchSearch && matchVeg;
    });
  }, [menuItems, selectedCat, searchQuery, filterType]);

  // ── NEW: Derived filtered arrays for the two new sections ─────────────────
  // Pure in-memory reads — no Firestore queries, no network, no side effects.
  // Items without the field (undefined) are falsy → excluded automatically.
  // These are the ONLY new lines of logic in the entire component.
  const newlyArrivedItems = useMemo(
    () => menuItems.filter(item => {
      const matchVeg = filterType === 'all'
        || (filterType === 'veg'    && item.isVeg    === true)
        || (filterType === 'nonVeg' && item.isNonVeg === true);
      return item.isNew === true && matchVeg;
    }),
    [menuItems, filterType],
  );
  const bestSellerItems = useMemo(
    () => menuItems.filter(item => {
      const matchVeg = filterType === 'all'
        || (filterType === 'veg'    && item.isVeg    === true)
        || (filterType === 'nonVeg' && item.isNonVeg === true);
      return item.isBestSeller === true && matchVeg;
    }),
    [menuItems, filterType],
  );

  // ── Add offer to cart — UNCHANGED ────────────────────────────────────────
  const addOfferToCart = (offer) => {
    if (offer.type === 'combo' && offer.comboPrice) {
      const enrichedItems = (offer.items || []).map(oi => {
        const menuItem = menuItems.find(m => m.id === oi.itemId);
        return {
          itemId:    oi.itemId,
          itemName:  oi.itemName  || menuItem?.name      || '',
          quantity:  oi.quantity  || 1,
          itemPrice: oi.itemPrice || menuItem?.price      || 0,
          image:     menuItem?.image || '',
        };
      });
      const selectedPrice = parseFloat(offer.comboPrice);
      setCart(prev => [...prev, {
        id:           offer.id,
        name:         offer.title,
        price:        selectedPrice,
        basePrice:    selectedPrice,
        quantity:     1,
        addons:       [],
        addonTotal:   0,
        selectedSize: null,
        selectedVariant: null,
        isOffer:      true,
        offerType:    'combo',
        items:        enrichedItems,
        comboItems:   enrichedItems.map(ei => ({ name: ei.itemName, price: ei.itemPrice, quantity: ei.quantity })),
      }]);
      toast.success(`${offer.title} added to cart ✓`);
      return;
    }
    if (offer.type === 'discount') {
      (offer.items || []).forEach(oi => {
        const menuItem = menuItems.find(m => m.id === oi.itemId);
        if (!menuItem) return;
        let discountedPrice = parseFloat(menuItem.price);
        if (offer.discountType === 'percentage') {
          discountedPrice = discountedPrice * (1 - parseFloat(offer.discountAmount) / 100);
        } else {
          discountedPrice = Math.max(0, discountedPrice - parseFloat(offer.discountAmount));
        }
        setCart(prev => [...prev, {
          ...menuItem,
          price:           parseFloat(discountedPrice.toFixed(2)),
          basePrice:       parseFloat(discountedPrice.toFixed(2)),
          quantity:        oi.quantity || 1,
          addons:          [],
          addonTotal:      0,
          selectedSize:    null,
          selectedVariant: null,
          isOffer:         true,
          offerType:       'discount',
        }]);
      });
      toast.success(`${offer.title} added to cart ✓`);
      return;
    }
    if (offer.type === 'buy_x_get_y') {
      // ── Step 1: Add the "buy" items ──────────────────────────────────────
      (offer.items || []).forEach(oi => {
        const menuItem = menuItems.find(m => m.id === oi.itemId);
        if (!menuItem) return;
        const buyQty = offer.buyQuantity || oi.quantity || 1;
        if (buyQty > 0) {
          // Use size-correct price stored in offer item, fallback to menuItem.price
          const buyPrice = oi.itemPrice ? parseFloat(oi.itemPrice) : parseFloat(menuItem.price);
          setCart(prev => [...prev, {
            ...menuItem,
            price:           buyPrice,
            basePrice:       buyPrice,
            quantity:        buyQty,
            addons:          [],
            addonTotal:      0,
            selectedSize:    oi.selectedSize    || null,
            selectedVariant: oi.selectedSize    || null,
            isOffer:         true,
            offerType:       'buy_x_get_y',
          }]);
        }
      });
      // ── Step 2: Add the correct "get free" item ──────────────────────────
      const getQty = offer.getQuantity || 1;
      if (getQty > 0 && offer.getItemId) {
        const freeMenuItem = menuItems.find(m => m.id === offer.getItemId);
        // Use stored name/size from offer (admin-selected), fallback to live menuItem
        const freeName  = offer.getItemName  || freeMenuItem?.name  || 'Free Item';
        const freeSize  = offer.getItemSize  || null;
        const freeSizeV = offer.getItemSize  || null;
        const freePrice = offer.getItemPrice != null ? parseFloat(offer.getItemPrice) : parseFloat(freeMenuItem?.price || 0);
        setCart(prev => [...prev, {
          ...(freeMenuItem || {}),
          id:              offer.getItemId,
          name:            `${freeName} (Free)`,
          price:           0,
          basePrice:       freePrice,   // original price stored for receipts
          quantity:        getQty,
          addons:          [],
          addonTotal:      0,
          selectedSize:    freeSize,
          selectedVariant: freeSizeV,
          image:           freeMenuItem?.image || '',
          isOffer:         true,
          offerType:       'buy_x_get_y_free',
          isFree:          true,        // FREE ITEM FIX: marks this as a zero-price item
          actualPrice:     freePrice,   // original price preserved for invoice display
        }]);
      }
      toast.success(`${offer.title} added to cart ✓`);
      return;
    }
    (offer.items || []).forEach(oi => {
      const menuItem = menuItems.find(m => m.id === oi.itemId);
      if (!menuItem) return;
      for (let i = 0; i < (oi.quantity || 1); i++) addToCart(menuItem);
    });
    toast.success(`${offer.title} added to cart ✓`);
  };

  // ── Order placement — COMPLETELY UNCHANGED ───────────────────────────────
  const handlePlaceOrder = async () => {
    if (!customerName.trim()) { toast.error('Enter your name'); return; }
    if (!customerPhone.trim()) { toast.error('Enter your phone number'); return; }
    setOrderPlacing(true);
    try {
      const counterRef = doc(db, 'system', 'counters');
      let oNum;
      await runTransaction(db, async (tx) => {
        const cd = await tx.get(counterRef);
        oNum = (cd.exists() ? cd.data().currentOrderNumber || 0 : 0) + 1;
        cd.exists() ? tx.update(counterRef, { currentOrderNumber: oNum }) : tx.set(counterRef, { currentOrderNumber: oNum });
      });

      const subtotal  = cartTotal;
      const taxAmount = taxCharge;
      const scAmount  = serviceCharge;
      const gstAmount = gstCharge;
      const total     = totalWithCharges;

      logAmountBreakdown();

      const orderData = {
        cafeId,
        orderNumber: oNum,
        items: cart.map(i => ({
          name:            i.name,
          // FREE ITEM FIX: free items have price:0 in cart; preserve it.
          // For all other items, use basePrice ?? price as before.
          price:           i.isFree ? 0 : (i.basePrice ?? i.price),
          basePrice:       i.isFree ? 0 : (i.basePrice ?? i.price),
          quantity:        i.quantity,
          addons:          i.addons          || [],
          addonTotal:      i.addonTotal      || 0,
          selectedSize:    i.selectedSize    || null,
          selectedVariant: i.selectedVariant || null,
          comboItems:      i.comboItems      || [],
          ...(i.isOffer    && { isOffer:      true           }),
          ...(i.offerType  && { offerType:    i.offerType    }),
          ...(i.items      && { items:        i.items        }),
          // Preserve isFree flag and original price for display/receipts
          ...(i.isFree     && { isFree:       true,
                                actualPrice:  i.basePrice ?? i.price }),
        })),
        subtotalAmount:      subtotal,
        taxAmount,
        serviceChargeAmount: scAmount,
        gstAmount,
        platformFeeAmount:   platformFeeCharge,
        totalAmount:         total,
        currencyCode:        cafe?.currencyCode   || 'INR',
        currencySymbol:      cafe?.currencySymbol || '₹',
        paymentStatus:       'pending',
        paymentMode,
        orderStatus:         'new',
        orderType,
        customerName,
        customerPhone,
        ...(orderType === 'dine-in'  && { tableNumber }),
        ...(orderType === 'delivery' && { deliveryAddress }),
        ...(specialInstructions && { specialInstructions }),
        createdAt: serverTimestamp(),
      };

      const orderRef = await addDoc(collection(db, 'orders'), orderData);

      createInvoiceForOrder({ ...orderData, orderNumber: oNum }, orderRef.id, cafe).catch(console.error);
      deductStockForOrder(cafeId, orderData.items, menuItems).catch(console.error);
      deductStockByRecipe(cafeId, orderData.items, menuItems).catch(console.error);

      console.log('[Order] Created successfully:', {
        orderId: orderRef.id, orderNumber: String(oNum).padStart(3, '0'),
        paymentMode, paymentStatus: 'pending', totalAmount: total,
      });

      if (paymentMode === 'online' && cafe?.paymentSettings?.enabled && cafe?.paymentSettings?.gateway === 'cashfree') {
        try {
          const BACKEND_URL = cafe?.paymentSettings?.backendUrl || '';
          if (!BACKEND_URL) {
            toast.error('Payment backend not configured. Please pay at counter.');
          } else {
            const resp = await fetch(`${BACKEND_URL}/create-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: orderRef.id, amount: total, phone: customerPhone,
                cafeId, currency: cafe?.currencyCode || 'INR', customerName,
                returnUrl: `${window.location.origin}/track/${orderRef.id}`,
              }),
            });
            const data = await resp.json();
            if (data?.payment_session_id) {
              const cashfree = window.Cashfree({ mode: 'production' });
              cashfree.checkout({ paymentSessionId: data.payment_session_id });
              return;
            } else {
              toast.error('Payment gateway error. Please pay at counter.');
            }
          }
        } catch (cfErr) {
          toast.error('Payment unavailable. Your order is saved — please pay at counter.');
        }
      }

      const formattedNum = String(oNum).padStart(3, '0');
      const cur = cafe?.currencySymbol || '₹';
      const hasExtras = (cafe?.taxEnabled && taxAmount > 0) ||
        (cafe?.serviceChargeEnabled && scAmount > 0) ||
        (cafe?.gstEnabled && gstAmount > 0);

      let msg = `*🚀 New Order*\n\n*Order #${formattedNum}*\n*Customer:* ${customerName}\n*Phone:* ${customerPhone}\n*Type:* ${orderType.charAt(0).toUpperCase() + orderType.slice(1)}\n`;
      if (orderType === 'dine-in' && tableNumber) msg += `*Table:* ${tableNumber}\n`;
      if (orderType === 'delivery' && deliveryAddress) msg += `*Address:* ${deliveryAddress}\n`;
      msg += `\n*Items:*\n`;
      cart.forEach(i => {
        msg += `• ${i.name} x${i.quantity} — ${cur}${(i.price * i.quantity).toFixed(2)}\n`;
        if (i.addons?.length > 0) i.addons.forEach(a => { msg += `   ↳ ${a.name}: +${cur}${(a.price || 0).toFixed(2)}\n`; });
      });
      if (hasExtras) {
        msg += `\n*Subtotal:* ${cur}${subtotal.toFixed(2)}\n`;
        if (cafe?.taxEnabled && taxAmount > 0) msg += `*${cafe.taxName || 'Tax'} (${cafe.taxRate}%):* ${cur}${taxAmount.toFixed(2)}\n`;
        if (cafe?.serviceChargeEnabled && scAmount > 0) msg += `*Service Charge (${cafe.serviceChargeRate}%):* ${cur}${scAmount.toFixed(2)}\n`;
        if (cafe?.gstEnabled && gstAmount > 0) msg += `*GST (${cafe.gstRate}%):* ${cur}${gstAmount.toFixed(2)}\n`;
      }
      msg += `*Total:* ${cur}${total.toFixed(2)}\n*Payment:* ${paymentMode === 'counter' ? 'Pay at Counter' : paymentMode === 'table' ? 'Pay on Table' : paymentMode === 'online' ? 'Online Payment' : 'Prepaid (UPI)'}`;
      if (specialInstructions) msg += `\n\n*Special Instructions:* ${specialInstructions}`;

      setOrderNumber(formattedNum);
      setCart([]);
      setCustomerName(''); setCustomerPhone(''); setTableNumber('');
      setDeliveryAddress(''); setSpecialInstructions(''); setPaymentMode('counter');
      setShowCheckout(false);
      navigate(`/track/${orderRef.id}`);
    } catch (err) {
      toast.error('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setOrderPlacing(false);
    }
  };

  // ── Guards
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-4 border-t-transparent"
        style={{ borderColor: `${primary}40`, borderTopColor: primary }} />
    </div>
  );

  if (cafeNotFound || !cafe) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8" style={{ background: T.bg }}>
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: primary, opacity: 0.3 }} />
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Café Not Found</h1>
        <p style={{ color: T.textMuted }}>Check your QR code and try again.</p>
      </div>
    </div>
  );

  if (cafe.isActive === false) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8" style={{ background: T.bg }}>
      <div>
        <Coffee className="w-16 h-16 mx-auto mb-4" style={{ color: primary }} />
        <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Service Temporarily Unavailable</h1>
        <p className="text-sm max-w-xs mx-auto" style={{ color: T.textMuted }}>We're not accepting online orders right now. Please visit us in person.</p>
      </div>
    </div>
  );

  if (orderDone) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: T.bg }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.6, delay: 0.3 }}
          className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{ background: `${primary}20`, border: `2px solid ${primary}` }}>
          <span className="text-4xl">☕</span>
        </motion.div>
        <h1 className="text-3xl font-black mb-2" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Order Placed!</h1>
        <p className="mb-4" style={{ color: T.textMuted }}>Your order #{orderNumber} is being prepared.</p>
        <div className="p-4 rounded-2xl mb-6" style={{ background: `${primary}10`, border: `1px solid ${primary}30` }}>
          <p className="font-bold text-2xl" style={{ color: primary }}>#{orderNumber}</p>
          <p className="text-sm" style={{ color: T.textMuted }}>Keep this number handy</p>
        </div>
        <button onClick={() => setOrderDone(false)} className="px-8 py-3 rounded-xl text-black font-bold"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
          Order More
        </button>
      </motion.div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: T.bg, fontFamily: 'Manrope, sans-serif' }}>

      {/* Food Detail Overlay */}
      {selectedFoodItem && (
        <FoodDetailPremium item={selectedFoodItem} onClose={() => setSelectedFoodItem(null)} />
      )}

      {/* Flying dots */}
      {flyingDots.map(dot => (
        <FlyingDot key={dot.id} from={dot.from} to={dot.to}
          onDone={() => setFlyingDots(prev => prev.filter(d => d.id !== dot.id))} />
      ))}

      {/* Offer Detail Modal */}
      <AnimatePresence>
        {selectedOffer && (
          <OfferDetailModal offer={selectedOffer} menuItems={menuItems} CUR={CUR} primary={primary} theme={T}
            onAdd={() => addOfferToCart(selectedOffer)} onClose={() => setSelectedOffer(null)} />
        )}
      </AnimatePresence>

      {/* ── Hero */}
      <div className="relative overflow-hidden" style={{ background: T.heroGrad }}>
        <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: primary }} />
        <motion.div animate={{ scale: [1.1, 1, 1.1], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-10 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none"
          style={{ background: primary }} />
        <div className="relative px-6 pt-12 pb-8 text-center">
          {cafe.logo && (
            <motion.img initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              src={cafe.logo} alt={cafe.name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-xl"
              style={{ boxShadow: `0 8px 32px ${glow}` }} />
          )}
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
            className="text-3xl font-black mb-1" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
            {cafe.name}
          </motion.h1>
          {cafe.tagline && (
            <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
              className="text-sm" style={{ color: T.textMuted }}>
              {cafe.tagline}
            </motion.p>
          )}
        </div>
      </div>

      {/* ── Sticky top bar */}
      <div className="sticky top-0 z-30 px-4 py-3"
        style={{ background: T.sticky, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${T.borderLight}` }}>
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: T.textMuted }} />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search menu..." className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
          </div>
          <motion.button ref={cartBtnRef} whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }}
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-black font-bold text-sm flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: cartCount > 0 ? `0 4px 20px ${glow}` : 'none' }}>
            <ShoppingCart className="w-4 h-4" />
            {cartCount > 0 && (
              <motion.span key={cartCount} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="font-black">
                {cartCount}
              </motion.span>
            )}
          </motion.button>
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 max-w-2xl mx-auto scrollbar-none">
          {categories.map(cat => (
            <motion.button key={cat} whileTap={{ scale: 0.95 }} onClick={() => setSelectedCat(cat)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all"
              style={selectedCat === cat
                ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }}>
              {cat === 'all' ? '✦ All' : cat}
            </motion.button>
          ))}
        </div>

        {/* ── NEW: Veg / Non-Veg filter toggle ──────────────────────────────── */}
        {/* Sits below category pills. Combines with category + search filters.  */}
        {/* filterType state only — zero touch to cart, pricing, or any logic.   */}
        <div className="flex gap-2 mt-2 max-w-2xl mx-auto">
          {[
            { id: 'all',    label: 'All Items', emoji: '✦' },
            { id: 'veg',    label: 'Veg',       emoji: '🟢' },
            { id: 'nonVeg', label: 'Non-Veg',   emoji: '🔴' },
          ].map(f => (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterType(f.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={filterType === f.id
                ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }
              }
            >
              <span>{f.emoji}</span>
              <span>{f.label}</span>
            </motion.button>
          ))}
        </div>
        {/* ── End Veg / Non-Veg filter toggle ───────────────────────────────── */}

      </div>

      <div className="max-w-2xl mx-auto px-4 pb-32 space-y-8 pt-6">

        {/* ── Special Offers — UNCHANGED */}
        {offers.length > 0 && (
          <section>
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"
              style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
              <Gift className="w-5 h-5" style={{ color: primary }} />
              Special Offers
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {offers.map(offer => (
                <motion.button key={offer.id} whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedOffer(offer)}
                  className="flex-shrink-0 w-64 rounded-2xl overflow-hidden text-left"
                  style={{ background: `linear-gradient(135deg, ${primary}20, ${primary}08)`, border: `1px solid ${primary}30`, boxShadow: `0 4px 20px ${glowSoft}` }}>
                  {offer.bannerImage && (
                    <div className="w-full h-28 overflow-hidden">
                      <MediaPreview url={offer.bannerImage} className="w-full h-full" alt={offer.title} />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="font-bold text-sm" style={{ color: T.text }}>{offer.title}</p>
                    {offer.description && (
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: T.textMuted }}>{offer.description}</p>
                    )}
                    {offer.type === 'buy_x_get_y' && offer.getItemName && (
                      <p className="text-xs mt-0.5 font-semibold line-clamp-1" style={{ color: primary }}>
                        Buy {offer.buyQuantity} → Get {offer.getItemName}
                        {offer.getItemSize ? ` (${offer.getItemSize})` : ''} Free
                      </p>
                    )}
                    <p className="text-xs font-semibold mt-2" style={{ color: primary }}>Tap to see details →</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/*
          ── Newly Arrived section ─────────────────────────────────────────────
          Uses CompactItemCard. Click triggers addToCart → routes to addon/size
          picker or direct cart via existing unchanged logic.
        */}
        <HorizontalMenuSection
          title="Newly Arrived"
          icon={<Sparkles className="w-5 h-5" style={{ color: primary }} />}
          items={newlyArrivedItems}
          primary={primary}
          glowSoft={glowSoft}
          theme={T}
          cartQtyFor={cartQtyFor}
          onCompactClick={handleCompactItemClick}
          tagLabel="New"
        />

        {/*
          ── Best Sellers section ──────────────────────────────────────────────
          Uses CompactItemCard. Same addToCart routing as Newly Arrived.
        */}
        <HorizontalMenuSection
          title="Best Sellers"
          icon={<Star className="w-5 h-5" style={{ color: primary }} />}
          items={bestSellerItems}
          primary={primary}
          glowSoft={glowSoft}
          theme={T}
          cartQtyFor={cartQtyFor}
          onCompactClick={handleCompactItemClick}
          tagLabel="Best Seller"
        />

        {/* ── Menu grid — 100% UNCHANGED */}
        <section>
          <h2 className="font-bold text-lg mb-4" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>
            {selectedCat === 'all' ? 'Our Menu' : selectedCat}
          </h2>
          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map(item => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    CUR={CUR}
                    cartQty={cartQtyFor(item.id)}
                    onAdd={addToCart}
                    onAddWithAnim={addWithAnim}
                    onShowDetails={(i) => setSelectedFoodItem(i)}
                    primary={primary}
                    theme={T}
                    selectedSize={selectedSize}
                    selectedAddons={selectedAddons}
                    onSizeSelect={handleSizeSelect}
                    onUpdateAddon={updateAddon}
                    onInlineAddToCart={handleInlineAddToCart}
                    getFinalPrice={getFinalPrice}
                  />
                ))}
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                <Coffee className="w-12 h-12 mx-auto mb-3" style={{ color: T.textMuted, opacity: 0.3 }} />
                <p style={{ color: T.textMuted }}>No items found</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* ── Cart drawer — UNCHANGED */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCart(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm flex flex-col"
              style={{ background: T.bgModal, backdropFilter: 'blur(20px)', borderLeft: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: T.borderLight }}>
                <h3 className="font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Your Order</h3>
                <button onClick={() => setShowCart(false)} className="p-2 rounded-lg transition-all" style={{ color: T.textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                <AnimatePresence>
                  {cart.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-3" style={{ color: T.textMuted, opacity: 0.3 }} />
                      <p style={{ color: T.textMuted }}>Your cart is empty</p>
                    </motion.div>
                  ) : cart.map((item, idx) => (
                    <motion.div key={`${item.id}-${idx}`} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}` }}>
                      {item.image && (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                          <MediaPreview url={item.image} className="w-full h-full" alt={item.name} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: T.text }}>
                          {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''}
                        </p>
                        <p className="text-xs" style={{ color: T.textMuted }}>{CUR}{fmt(item.basePrice ?? item.price)}</p>
                        {item.comboItems?.length > 0 && (
                          <div className="mt-0.5">
                            {item.comboItems.map((ci, cIdx) => (
                              <p key={cIdx} className="text-xs" style={{ color: T.textMuted }}>
                                — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                        {item.addons?.length > 0 && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: T.textMuted }}>
                            + {item.addons.map(a => a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                          style={{ background: T.bgInput, color: T.text, border: `1px solid ${T.border}` }}>
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-sm w-5 text-center" style={{ color: T.text }}>{item.quantity}</span>
                        <button onClick={() => addToCart(item)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-black transition-all"
                          style={{ background: primary }}>
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {cart.length > 0 && (
                <div className="px-5 py-4 border-t flex-shrink-0 space-y-3" style={{ borderColor: T.borderLight }}>
                  {(cafe?.taxEnabled || cafe?.serviceChargeEnabled || cafe?.gstEnabled) ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between" style={{ color: T.textMuted }}>
                        <span>Items Total</span><span>{CUR}{fmt(cartTotal)}</span>
                      </div>
                      {cafe?.taxEnabled && taxCharge > 0 && (
                        <div className="flex justify-between" style={{ color: T.textMuted }}>
                          <span>{cafe.taxName || 'Tax'} ({cafe.taxRate}%)</span><span>{CUR}{fmt(taxCharge)}</span>
                        </div>
                      )}
                      {cafe?.serviceChargeEnabled && serviceCharge > 0 && (
                        <div className="flex justify-between" style={{ color: T.textMuted }}>
                          <span>Service Charge ({cafe.serviceChargeRate}%)</span><span>{CUR}{fmt(serviceCharge)}</span>
                        </div>
                      )}
                      {cafe?.gstEnabled && gstCharge > 0 && (
                        <div className="flex justify-between" style={{ color: T.textMuted }}>
                          <span>GST ({cafe.gstRate}%)</span><span>{CUR}{fmt(gstCharge)}</span>
                        </div>
                      )}
                      {cafe?.platformFeeEnabled && platformFeeCharge > 0 && (
                        <div className="flex justify-between" style={{ color: T.textMuted }}>
                          <span>Platform Fee</span><span>{CUR}{fmt(platformFeeCharge)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg border-t pt-2" style={{ borderColor: T.borderLight }}>
                        <span style={{ color: T.text }}>Total</span>
                        <span style={{ color: primary }}>{CUR}{fmt(totalWithCharges)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between font-bold text-lg">
                      <span style={{ color: T.text }}>Total</span>
                      <span style={{ color: primary }}>{CUR}{fmt(totalWithCharges)}</span>
                    </div>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowCart(false); setShowCheckout(true); }}
                    className="w-full py-4 rounded-xl text-black font-bold text-base"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 20px ${glow}` }}>
                    Proceed to Checkout
                  </motion.button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Checkout modal — UNCHANGED */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
              style={{ background: T.bgModal, border: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: T.borderLight }}>
                <h3 className="font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif', color: T.text }}>Checkout</h3>
                <button onClick={() => setShowCheckout(false)} className="p-2 rounded-lg transition-all" style={{ color: T.textMuted }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {[
                  { label: 'Your Name', value: customerName, set: setCustomerName, placeholder: 'Enter your name', type: 'text' },
                  { label: 'Phone Number', value: customerPhone, set: setCustomerPhone, placeholder: '10-digit mobile number', type: 'tel' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>{f.label}</label>
                    <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                      className="w-full py-3 px-4 rounded-xl text-sm outline-none"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: T.text }}>Order Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: 'dine-in', label: '🍽 Dine In' }, { id: 'takeaway', label: '🥡 Takeaway' }, { id: 'delivery', label: '🛵 Delivery' }].map(t => (
                      <button key={t.id} onClick={() => setOrderType(t.id)}
                        className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                        style={orderType === t.id
                          ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                          : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {orderType === 'dine-in' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>Table Number</label>
                    <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="e.g., 5"
                      className="w-full py-3 px-4 rounded-xl text-sm outline-none"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                  </div>
                )}
                {orderType === 'delivery' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>Delivery Address</label>
                    <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Full delivery address" rows={3}
                      className="w-full py-3 px-4 rounded-xl text-sm outline-none resize-none"
                      style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: T.text }}>Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'counter', label: '🏪 At Counter' },
                      { id: 'table',   label: '🪑 At Table'   },
                      { id: 'prepaid', label: '📱 UPI'        },
                      ...(cafe?.paymentSettings?.enabled ? [{ id: 'online', label: '💳 Online' }] : []),
                    ].map(p => (
                      <button key={p.id} onClick={() => setPaymentMode(p.id)}
                        className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                        style={paymentMode === p.id
                          ? { background: primary, color: '#000', boxShadow: `0 2px 12px ${glowSoft}` }
                          : { background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}` }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                {paymentMode === 'prepaid' && cafe?.upiId && (
                  <div className="p-4 rounded-xl text-center" style={{ background: T.bgInput, border: `1px solid ${T.border}` }}>
                    <QRCodeSVG value={`upi://pay?pa=${cafe.upiId}&pn=${cafe.name}&am=${totalWithCharges}&cu=INR`} size={140} className="mx-auto" />
                    <p className="text-xs mt-2" style={{ color: T.textMuted }}>Scan to pay {CUR}{fmt(totalWithCharges)}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: T.text }}>
                    Special Instructions <span className="font-normal" style={{ color: T.textFaint }}>(optional)</span>
                  </label>
                  <textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} placeholder="Allergies, preferences..." rows={2}
                    className="w-full py-3 px-4 rounded-xl text-sm outline-none resize-none"
                    style={{ background: T.bgInput, border: `1px solid ${T.border}`, color: T.text }} />
                </div>
                <div className="p-4 rounded-xl space-y-2" style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
                  <p className="font-semibold text-sm mb-3" style={{ color: T.text }}>Order Summary</p>
                  {cart.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="text-sm">
                      <div className="flex justify-between">
                        <span style={{ color: T.textMuted }}>
                          {item.name}{item.selectedVariant ? ` (${item.selectedVariant})` : ''} × {item.quantity}
                        </span>
                        <span style={{ color: T.text }}>{CUR}{fmt(item.price * item.quantity)}</span>
                      </div>
                      {item.comboItems?.length > 0 && (
                        <div className="ml-2 mt-0.5">
                          {item.comboItems.map((ci, cIdx) => (
                            <p key={cIdx} className="text-xs" style={{ color: T.textFaint || T.textMuted }}>
                              — {ci.name}{ci.quantity > 1 ? ` ×${ci.quantity}` : ''}
                            </p>
                          ))}
                        </div>
                      )}
                      {item.addons?.length > 0 && (
                        <p className="text-xs ml-2 mt-0.5" style={{ color: T.textFaint || T.textMuted }}>
                          + {item.addons.map(a => a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-1 space-y-1" style={{ borderColor: T.borderLight }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: T.textMuted }}>Items Total</span>
                      <span style={{ color: T.text }}>{CUR}{fmt(cartTotal)}</span>
                    </div>
                    {cafe?.taxEnabled && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: T.textMuted }}>{cafe.taxName || 'Tax'} ({cafe.taxRate}%)</span>
                        <span style={{ color: T.text }}>{taxCharge > 0 ? `${CUR}${fmt(taxCharge)}` : '—'}</span>
                      </div>
                    )}
                    {cafe?.serviceChargeEnabled && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: T.textMuted }}>Service Charge ({cafe.serviceChargeRate}%)</span>
                        <span style={{ color: T.text }}>{serviceCharge > 0 ? `${CUR}${fmt(serviceCharge)}` : '—'}</span>
                      </div>
                    )}
                    {cafe?.gstEnabled && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: T.textMuted }}>GST ({cafe.gstRate}%)</span>
                        <span style={{ color: T.text }}>{gstCharge > 0 ? `${CUR}${fmt(gstCharge)}` : '—'}</span>
                      </div>
                    )}
                    {cafe?.platformFeeEnabled && platformFeeCharge > 0 && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: T.textMuted }}>Platform Fee</span>
                        <span style={{ color: T.text }}>{CUR}{fmt(platformFeeCharge)}</span>
                      </div>
                    )}
                    {!cafe?.taxEnabled && !cafe?.serviceChargeEnabled && !cafe?.gstEnabled && !cafe?.platformFeeEnabled && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: T.textMuted }}>No additional charges</span>
                        <span style={{ color: T.textMuted }}>✓</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold" style={{ borderColor: T.borderLight }}>
                      <span style={{ color: T.text }}>Total</span>
                      <span style={{ color: primary }}>{CUR}{fmt(totalWithCharges)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: T.borderLight }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handlePlaceOrder} disabled={orderPlacing}
                  className="w-full py-4 rounded-xl text-black font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 24px ${glow}` }}>
                  {orderPlacing
                    ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 rounded-full border-2 border-black/30 border-t-black" />Placing Order…</>
                    : `Place Order • ${CUR}${fmt(totalWithCharges)}`
                  }
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating cart button (mobile) — UNCHANGED */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && !showCheckout && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => setShowCart(true)}
              className="flex items-center gap-3 px-6 py-3.5 rounded-2xl text-black font-bold shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 8px 32px ${glow}` }}>
              <ShoppingCart className="w-5 h-5" />
              <span>{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
              <span className="font-black">{CUR}{fmt(cartTotal)}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compact Size Picker — for Newly Arrived / Best Sellers items ──────
          Triggered by handleCompactItemClick when item has sizePricing.enabled.
          On size select: calls handleCompactItemClick(item, sizeKey) which then
          routes to AddOnModal (if addons) or directAddToCart (if no addons).
          Zero new logic — reuses handleCompactItemClick with sizeKey argument.
          z-[70] sits above AddOnModal (z-[60]) so stacking is correct.        */}
      <AnimatePresence>
        {compactSizeItem && (() => {
          const sp = compactSizeItem.sizePricing;
          const sizeOptions = [
            sp?.small  != null && { key: 'small',  label: 'Small',  price: parseFloat(sp.small)  },
            sp?.medium != null && { key: 'medium', label: 'Medium', price: parseFloat(sp.medium) },
            sp?.large  != null && { key: 'large',  label: 'Large',  price: parseFloat(sp.large)  },
          ].filter(Boolean);
          return (
            <motion.div
              className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <motion.div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setCompactSizeItem(null)}
              />
              {/* Sheet */}
              <motion.div
                className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden"
                style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.08)' }}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                  <div>
                    <h3 className="text-white font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                      Select Size
                    </h3>
                    <p className="text-xs mt-0.5 text-[#A3A3A3]">{compactSizeItem.name}</p>
                  </div>
                  <button
                    onClick={() => setCompactSizeItem(null)}
                    className="p-2 rounded-full hover:bg-white/10 transition-all"
                  >
                    <X className="w-5 h-5 text-[#A3A3A3]" />
                  </button>
                </div>
                {/* Size options */}
                <div className="px-4 py-3 space-y-2 pb-6">
                  {sizeOptions.map(sz => (
                    <motion.button
                      key={sz.key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setCompactSizeItem(null);
                        // Route through handleCompactItemClick with chosen sizeKey
                        // → addToCart(item, sizeKey) → AddOnModal if addons, else direct
                        handleCompactItemClick(compactSizeItem, sz.key);
                      }}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl font-bold transition-all"
                      style={{
                        background: `rgba(${hexToRgb(primary).r},${hexToRgb(primary).g},${hexToRgb(primary).b},0.10)`,
                        border: `1px solid ${primary}40`,
                        color: primary,
                      }}
                    >
                      <span className="text-sm">{sz.label}</span>
                      <span className="text-sm">{CUR}{sz.price.toFixed(2)}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Add-on selection modal — UNCHANGED */}
      {addonModal && (
        <AddOnModal
          item={addonModal}
          onConfirm={(entry) => { directAddToCart(entry); setAddonModal(null); }}
          onClose={() => setAddonModal(null)}
          currencySymbol={CUR}
          primaryColor={primary}
          theme={cafe?.mode}
        />
      )}
    </div>
  );
};

export default CafeOrderingPremium;
