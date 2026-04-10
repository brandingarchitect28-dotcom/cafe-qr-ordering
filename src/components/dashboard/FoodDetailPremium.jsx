/**
 * FoodDetailPremium.jsx
 *
 * Full-screen premium food detail overlay.
 * Shows blurred food image/video as background,
 * then macros (calories, protein, carbs, fats),
 * ingredients, and optional micros in the centre.
 *
 * Props:
 *  item    — menu item object (must have name; all nutrition fields optional)
 *  onClose — called when user taps Close or the backdrop
 *
 * Fully add-only — no changes to any existing component.
 * Items that have no nutrition data simply show nothing for those fields.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Dumbbell, Wheat, Droplets } from 'lucide-react';

export default function FoodDetailPremium({ item, onClose }) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!item) return null;

  const hasMedia   = item.image || item.video;
  const hasMacros  = item.calories || item.protein || item.carbs || item.fats;
  const hasIngreds = item.ingredients?.trim();
  const hasMicros  = item.micros?.trim();

  const macros = [
    { label: 'Calories', value: item.calories ? `${item.calories}` : '—', unit: 'kcal', icon: <Flame  className="w-4 h-4" />, color: '#FF6B35' },
    { label: 'Protein',  value: item.protein  ? `${item.protein}`  : '—', unit: 'g',    icon: <Dumbbell className="w-4 h-4" />, color: '#4FC3F7' },
    { label: 'Carbs',    value: item.carbs    ? `${item.carbs}`    : '—', unit: 'g',    icon: <Wheat    className="w-4 h-4" />, color: '#FFD54F' },
    { label: 'Fats',     value: item.fats     ? `${item.fats}`     : '—', unit: 'g',    icon: <Droplets className="w-4 h-4" />, color: '#A5D6A7' },
  ];

  const ingredients = hasIngreds
    ? item.ingredients.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <AnimatePresence>
      <motion.div
        key="food-detail-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] overflow-hidden"
        onClick={onClose}
        data-testid="food-detail-overlay"
      >
        {/* ── Blurred background ──────────────────────────────────────────── */}
        {item.video ? (
          <video
            src={item.video}
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-50"
          />
        ) : hasMedia ? (
          <img
            src={item.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-50"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]" />
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-full font-semibold text-sm transition-all"
          data-testid="food-detail-close"
        >
          <X className="w-4 h-4" />
          Close
        </button>

        {/* ── Centre content ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 260, damping: 24 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-white px-5 py-12 overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Food image / video */}
          {item.video ? (
            <video
              src={item.video}
              autoPlay loop muted playsInline
              className="w-64 h-64 object-cover rounded-2xl shadow-2xl"
            />
          ) : item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-64 h-64 object-cover rounded-2xl shadow-2xl"
            />
          ) : (
            <div className="w-64 h-64 rounded-2xl bg-white/10 flex items-center justify-center">
              <span className="text-6xl">🍽️</span>
            </div>
          )}

          {/* Name */}
          <h2 className="text-2xl font-bold mt-5 text-center" style={{ fontFamily: 'Playfair Display, serif' }}>
            {item.name}
          </h2>

          {/* Description */}
          {item.description && (
            <p className="text-sm text-white/70 mt-1 text-center max-w-xs leading-relaxed">
              {item.description}
            </p>
          )}

          {/* ── Macros ────────────────────────────────────────────────────── */}
          {hasMacros && (
            <div className="flex gap-4 mt-6 flex-wrap justify-center">
              {macros.map(m => (
                <div
                  key={m.label}
                  className="flex flex-col items-center gap-1 bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 min-w-[70px]"
                >
                  <div style={{ color: m.color }}>{m.icon}</div>
                  <div className="text-lg font-black leading-none">{m.value}</div>
                  <div className="text-[10px] text-white/60 leading-none">{m.unit}</div>
                  <div className="text-xs font-medium text-white/80">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Ingredients ───────────────────────────────────────────────── */}
          {ingredients.length > 0 && (
            <div className="mt-6 text-center max-w-sm">
              <h3 className="font-semibold text-white/90 mb-2 text-sm uppercase tracking-widest">
                Ingredients
              </h3>
              <div className="flex flex-wrap justify-center gap-2">
                {ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="bg-white/15 backdrop-blur-sm text-white text-xs font-medium px-3 py-1 rounded-full border border-white/20"
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Micros ────────────────────────────────────────────────────── */}
          {hasMicros && (
            <div className="mt-5 max-w-xs text-center">
              <h3 className="font-semibold text-white/90 mb-1 text-sm uppercase tracking-widest">
                Micronutrients
              </h3>
              <p className="text-sm text-white/70 leading-relaxed">{item.micros}</p>
            </div>
          )}

          {/* Spacer so content isn't hidden behind the close button */}
          <div className="h-8" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
