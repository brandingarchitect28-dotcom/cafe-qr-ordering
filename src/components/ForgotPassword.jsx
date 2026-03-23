/**
 * ForgotPassword.jsx
 *
 * Task 16: Forgot password flow using Firebase's built-in email reset.
 * - Sends Firebase password reset email (secure, no OTP needed server-side)
 * - Clean modal overlay
 * - Success + error states
 */

import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, X } from 'lucide-react';

const ForgotPassword = ({ onClose }) => {
  const [email,    setEmail  ] = useState('');
  const [loading,  setLoading] = useState(false);
  const [sent,     setSent   ] = useState(false);
  const [error,    setError  ] = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: window.location.origin + '/login',
      });
      setSent(true);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please wait a few minutes.');
      } else {
        setError(err.message || 'Failed to send reset email. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 30, opacity: 0, scale: 0.96 }}
        animate={{ y: 0,  opacity: 1, scale: 1    }}
        exit={{    y: 30, opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[#0F0F0F] border border-white/10 rounded-2xl p-6"
        style={{ fontFamily: 'Manrope, sans-serif' }}
      >
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all">
          <X className="w-4 h-4" />
        </button>

        {!sent ? (
          <>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                Reset Password
              </h2>
              <p className="text-[#A3A3A3] text-sm mt-2">
                Enter your email and we'll send you a secure reset link.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-white text-sm font-medium mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all outline-none text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm h-12 flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm"
              >
                {loading
                  ? <><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Sending…</>
                  : 'Send Reset Link'
                }
              </button>

              <button type="button" onClick={onClose}
                className="w-full flex items-center justify-center gap-2 text-[#A3A3A3] hover:text-white text-sm transition-colors py-2">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Login
              </button>
            </form>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-4"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5 }}
              className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </motion.div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Email Sent!
            </h2>
            <p className="text-[#A3A3A3] text-sm mb-2">
              A password reset link has been sent to:
            </p>
            <p className="text-[#D4AF37] font-semibold text-sm mb-4">{email}</p>
            <p className="text-[#555] text-xs mb-6">
              Check your inbox (and spam folder). The link expires in 1 hour.
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all"
            >
              Back to Login
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default ForgotPassword;
