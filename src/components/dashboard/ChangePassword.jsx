/**
 * ChangePassword.jsx
 *
 * Task 16: Secure password change for café owners in Settings.
 * - Re-authenticates with current password first
 * - Validates new password rules
 * - Shows success message
 */

import React, { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const ChangePassword = () => {
  const [oldPass,  setOldPass ] = useState('');
  const [newPass,  setNewPass ] = useState('');
  const [confirm,  setConfirm ] = useState('');
  const [loading,  setLoading ] = useState(false);
  const [success,  setSuccess ] = useState(false);
  const [errors,   setErrors  ] = useState({});
  const [show,     setShow    ] = useState({ old: false, new: false, confirm: false });

  const validate = () => {
    const e = {};
    if (!oldPass)                   e.old     = 'Current password is required';
    if (newPass.length < 6)         e.new     = 'New password must be at least 6 characters';
    if (newPass === oldPass)        e.new     = 'New password must be different from current';
    if (newPass !== confirm)        e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = async () => {
    if (!validate()) return;
    setLoading(true);
    setErrors({});

    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error('Not authenticated');

      // Re-authenticate first (security requirement)
      const credential = EmailAuthProvider.credential(user.email, oldPass);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPass);

      setSuccess(true);
      setOldPass(''); setNewPass(''); setConfirm('');
      toast.success('Password updated successfully ✓');

      // Reset success banner after 5s
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrors({ old: 'Current password is incorrect' });
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please wait before trying again.');
      } else {
        toast.error(err.message || 'Failed to update password');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (err) =>
    `w-full bg-black/20 border ${err ? 'border-red-500/50' : 'border-white/10'} text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 pr-12 transition-all outline-none text-sm`;

  const PasswordField = ({ label, value, onChange, error, showKey }) => (
    <div>
      <label className="block text-white text-sm font-medium mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show[showKey] ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          className={inputCls(error)}
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A3A3A3] transition-colors"
        >
          {show[showKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
          <AlertCircle className="w-3 h-3" />{error}
        </p>
      )}
    </div>
  );

  return (
    <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
          <Lock className="w-4 h-4 text-[#D4AF37]" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>
            Change Password
          </h3>
          <p className="text-[#555] text-xs">Re-enter your current password to confirm</p>
        </div>
      </div>

      {/* Success banner */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-sm text-emerald-400 text-sm"
          >
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Password updated successfully!
          </motion.div>
        )}
      </AnimatePresence>

      <PasswordField
        label="Current Password"
        value={oldPass}
        onChange={setOldPass}
        error={errors.old}
        showKey="old"
      />
      <PasswordField
        label="New Password"
        value={newPass}
        onChange={setNewPass}
        error={errors.new}
        showKey="new"
      />
      <PasswordField
        label="Confirm New Password"
        value={confirm}
        onChange={setConfirm}
        error={errors.confirm}
        showKey="confirm"
      />

      {/* Strength hints */}
      {newPass.length > 0 && (
        <div className="space-y-1">
          {[
            { ok: newPass.length >= 6,                              label: 'At least 6 characters'       },
            { ok: /[A-Z]/.test(newPass),                           label: 'Contains uppercase letter'    },
            { ok: /[0-9]/.test(newPass),                           label: 'Contains a number'            },
            { ok: newPass !== oldPass && oldPass.length > 0,       label: 'Different from current'       },
          ].map(rule => (
            <p key={rule.label} className="flex items-center gap-1.5 text-xs"
              style={{ color: rule.ok ? '#10B981' : '#555' }}>
              <span>{rule.ok ? '✓' : '·'}</span>
              {rule.label}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={handleChange}
        disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
      >
        {loading
          ? <><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Updating…</>
          : <><Lock className="w-4 h-4" />Update Password</>
        }
      </button>
    </div>
  );
};

export default ChangePassword;
