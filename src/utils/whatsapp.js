/**
 * whatsapp.js — shared WhatsApp number formatter
 *
 * formatWhatsAppNumber(raw)
 *   • Strips all non-numeric characters (removes +, spaces, dashes, brackets)
 *   • If the cleaned number is exactly 10 digits → Indian mobile → prepends "91"
 *   • Otherwise keeps the number as-is (already has country code)
 *   • Returns empty string if input is falsy
 *
 * waLink(phone, message)
 *   • Returns a ready-to-use https://wa.me/{number}?text=... URL
 *   • If phone is empty/invalid → returns link without a number (open WA chat picker)
 *
 * No side-effects. Pure functions. Safe to import anywhere.
 */

export const formatWhatsAppNumber = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');   // strip everything except 0-9
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;  // 10-digit Indian mobile
  return digits;                                    // already has country code
};

export const waLink = (phone, message) => {
  const number = formatWhatsAppNumber(phone);
  const text   = message ? `?text=${encodeURIComponent(message)}` : '';
  return number
    ? `https://wa.me/${number}${text}`
    : `https://wa.me/${text}`;
};
