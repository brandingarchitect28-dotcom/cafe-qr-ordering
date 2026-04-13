/**
 * utils/whatsapp.js
 *
 * Shared WhatsApp utility helpers.
 * Used by SalaryCard, OrdersManagement, and anywhere a WA link is generated.
 *
 * ADD: WhatsApp integration utility
 */

/**
 * Normalise a raw phone number string into a format suitable for wa.me links.
 *
 * Rules:
 *  - Strip all non-digit characters
 *  - 10-digit Indian numbers → prefix '91'
 *  - Numbers already starting with country code → use as-is
 *  - Empty / invalid → return ''
 *
 * @param {string} raw  Raw phone number (e.g. '+91 98765 43210', '9876543210')
 * @returns {string}    Digits-only string ready for https://wa.me/{result}
 */
export const formatWhatsAppNumber = (raw = '') => {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  // 10-digit Indian mobile number — prepend country code
  if (digits.length === 10) return `91${digits}`;
  // Already has country code or non-standard length — use as-is
  return digits;
};

/**
 * Open WhatsApp with a pre-filled message.
 * Uses window.location.href for iOS compatibility (deep-link redirect).
 *
 * @param {string} phone    Raw phone number (passed through formatWhatsAppNumber)
 * @param {string} message  Plain text message (will be URI-encoded)
 */
export const openWhatsApp = (phone, message) => {
  const formatted = formatWhatsAppNumber(phone);
  if (!formatted) return;
  window.location.href = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
};
