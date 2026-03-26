/**
 * useTheme.js
 *
 * Reads cafe.mode from Firestore and returns a T (theme) object with
 * pre-built Tailwind class strings for light and dark mode.
 *
 * Every dashboard component imports this hook and uses T.* classes.
 * This is the single source of truth — changing here fixes everywhere.
 *
 * Usage:
 *   import { useTheme } from '../../hooks/useTheme';
 *   const { T, isLight } = useTheme();
 */

import { useAuth }     from '../contexts/AuthContext';
import { useDocument } from './useFirestore';

export const useTheme = () => {
  const { user }          = useAuth();
  const cafeId            = user?.cafeId;
  const { data: cafe }    = useDocument('cafes', cafeId);
  const isLight           = cafe?.mode === 'light';

  const T = {
    // ── Page / section backgrounds ─────────────────────────────────────────
    page:       isLight ? 'bg-[#F5F3EE]'                              : 'bg-[#050505]',

    // ── Cards / panels ─────────────────────────────────────────────────────
    card:       isLight ? 'bg-white border border-[#E5E5E5]'          : 'bg-[#0F0F0F] border border-white/5',
    cardHover:  isLight ? 'hover:border-[#D4AF37]/40'                 : 'hover:border-white/10',
    subCard:    isLight ? 'bg-[#F5F3EE] border border-[#E5E5E5]'      : 'bg-white/5 border border-white/5',
    innerCard:  isLight ? 'bg-[#F0EDE8]'                              : 'bg-black/20',

    // ── Text ───────────────────────────────────────────────────────────────
    heading:    isLight ? 'text-[#111111]'                            : 'text-white',
    label:      isLight ? 'text-[#1A1A1A]'                           : 'text-white',
    body:       isLight ? 'text-[#222222]'                            : 'text-[#E5E5E5]',
    muted:      isLight ? 'text-[#555555]'                            : 'text-[#A3A3A3]',
    faint:      isLight ? 'text-[#888888]'                            : 'text-[#555]',

    // ── Inputs ─────────────────────────────────────────────────────────────
    input:      isLight
      ? 'bg-white border border-[#CCCCCC] text-[#111111] placeholder:text-[#999999] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]'
      : 'bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]',

    select:     isLight
      ? 'bg-white border border-[#CCCCCC] text-[#111111] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]'
      : 'bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]',

    option:     isLight ? 'bg-white text-[#111111]'                   : 'bg-[#0F0F0F] text-white',

    // ── Borders / dividers ─────────────────────────────────────────────────
    border:     isLight ? 'border-[#E5E5E5]'                          : 'border-white/5',
    borderMd:   isLight ? 'border-[#CCCCCC]'                          : 'border-white/10',

    // ── Buttons (non-gold) ─────────────────────────────────────────────────
    btnGhost:   isLight
      ? 'bg-[#F0EDE8] border border-[#DDDDDD] text-[#333333] hover:bg-[#E8E5E0]'
      : 'bg-white/5 border border-white/10 text-[#A3A3A3] hover:text-white hover:bg-white/10',

    btnDanger:  isLight
      ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
      : 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20',

    // ── Table ──────────────────────────────────────────────────────────────
    tableHead:  isLight ? 'bg-[#F0EDE8] text-[#555555]'               : 'bg-black/20 text-[#A3A3A3]',
    tableRow:   isLight ? 'bg-white hover:bg-[#FAFAF8]'               : 'hover:bg-white/2',
    tableRowAlt:isLight ? 'bg-[#FAFAF8]'                              : 'bg-black/10',
    tableCell:  isLight ? 'text-[#111111]'                            : 'text-white',
    tableCellM: isLight ? 'text-[#555555]'                            : 'text-[#A3A3A3]',
    tableBorder:isLight ? 'border-b border-[#EEEEEE]'                 : 'border-b border-white/5',

    // ── Toggle switch ──────────────────────────────────────────────────────
    toggleOff:  isLight ? 'bg-[#CCCCCC]'                              : 'bg-white/10',

    // ── Badge/chip ─────────────────────────────────────────────────────────
    badge:      isLight ? 'bg-[#F0EDE8] text-[#333333]'               : 'bg-white/10 text-[#A3A3A3]',

    // ── Modal backdrop ─────────────────────────────────────────────────────
    overlay:    isLight ? 'bg-black/40'                               : 'bg-black/70',
    modal:      isLight ? 'bg-white border border-[#E5E5E5]'          : 'bg-[#0F0F0F] border border-white/10',

    // ── Empty state ────────────────────────────────────────────────────────
    empty:      isLight ? 'bg-white border border-[#E5E5E5] text-[#555555]' : 'bg-[#0F0F0F] border border-white/5 text-[#A3A3A3]',

    // ── Search bar ────────────────────────────────────────────────────────
    search:     isLight
      ? 'bg-white border border-[#CCCCCC] text-[#111111] placeholder:text-[#999999]'
      : 'bg-[#0F0F0F] border border-white/10 text-white placeholder:text-neutral-600',
  };

  return { T, isLight, cafe };
};
