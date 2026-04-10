/**
 * CafeDisabled.jsx
 *
 * Shown when a café's isActive flag is false.
 * Rendered in place of the full ordering page / dashboard.
 *
 * Add-only — zero changes to any existing component.
 * Called from:
 *  - CafeOrdering.jsx  (customer QR menu)
 *  - Dashboard.jsx     (admin dashboard)
 */

import React from 'react';
import { motion } from 'framer-motion';

const CafeDisabled = ({ isAdmin = false }) => (
  <div
    className="min-h-screen flex items-center justify-center"
    style={{ background: '#050505', fontFamily: 'Manrope, sans-serif' }}
    data-testid="cafe-disabled-screen"
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 16 }}
      animate={{ opacity: 1, scale: 1,    y: 0  }}
      transition={{ duration: 0.4 }}
      className="text-center px-8 py-12 max-w-md"
    >
      <div className="text-6xl mb-6">🔒</div>

      <h1
        className="text-2xl font-bold text-white mb-3"
        style={{ fontFamily: 'Playfair Display, serif' }}
      >
        {isAdmin ? 'Account Disabled' : 'Café Temporarily Unavailable'}
      </h1>

      <p className="text-[#A3A3A3] text-sm leading-relaxed">
        {isAdmin
          ? 'Your café account has been disabled by the administrator. Please contact support to re-enable your account.'
          : 'This café is temporarily unavailable. Please check back later or contact the café directly.'}
      </p>

      {isAdmin && (
        <p className="text-[#555] text-xs mt-6">
          Contact: support@brandingarchitect.in
        </p>
      )}
    </motion.div>
  </div>
);

export default CafeDisabled;
