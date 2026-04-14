/**
 * StaffList.jsx
 *
 * Displays all active staff for a cafe.
 * Features: Add, Edit, Delete staff; view attendance QR code.
 * Clicking a staff card opens their full profile (AttendanceCalendar).
 *
 * ADD: staff profile page
 */

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  UserPlus, Edit2, Trash2, X, Save, QrCode,
  Phone, CreditCard, Clock, RefreshCw, User,
  CalendarDays,
} from 'lucide-react';
import {
  addStaff, updateStaff, deleteStaff, ROLES, SALARY_TYPES,
} from '../../../services/staffService';
import { toast } from 'sonner';
import { useTheme } from '../../../hooks/useTheme';
import AttendanceCalendar from './AttendanceCalendar';
import { useAuth } from '../../../contexts/AuthContext';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMPTY = {
  name: '', role: 'Waiter', phone: '', upiId: '',
  salaryType: 'monthly', salaryAmount: '', shiftStart: '09:00',
  shiftEnd: '', latePenalty: '50',
};

const inputCls =
  'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 ' +
  'focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-lg h-11 px-4 text-sm outline-none transition-all';

const labelCls =
  'block text-[#A3A3A3] text-xs font-semibold uppercase tracking-wide mb-1.5';

const ROLE_COLORS = {
  Manager:  '#D4AF37',
  Chef:     '#EF4444',
  Waiter:   '#3B82F6',
  Cashier:  '#10B981',
  Cleaner:  '#8B5CF6',
  Delivery: '#F97316',
  Other:    '#A3A3A3',
};

// ── Staff Form Modal ───────────────────────────────────────────────────────────

const StaffFormModal = ({ initial, onSave, onClose, saving }) => {
  const [form, setForm] = useState(initial || EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim())                      { toast.error('Name is required');              return; }
    if (!form.salaryAmount || isNaN(form.salaryAmount)) { toast.error('Valid salary amount required'); return; }
    onSave(form);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-5 overflow-y-auto max-h-[90vh]"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
            {initial?.id ? 'Edit Staff' : 'Add Staff Member'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-[#A3A3A3] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="col-span-2">
              <label className={labelCls}>Full Name *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Rahul Kumar"
              />
            </div>

            {/* Role */}
            <div>
              <label className={labelCls}>Role</label>
              <select
                className={inputCls + ' cursor-pointer'}
                value={form.role}
                onChange={e => set('role', e.target.value)}
              >
                {ROLES.map(r => (
                  <option key={r} value={r} className="bg-[#0F0F0F]">{r}</option>
                ))}
              </select>
            </div>

            {/* Shift Start */}
            <div>
              <label className={labelCls}>Shift Start</label>
              <input
                type="time"
                className={inputCls}
                value={form.shiftStart}
                onChange={e => set('shiftStart', e.target.value)}
              />
            </div>

            {/* Shift End */}
            <div>
              <label className={labelCls}>Shift End</label>
              <input
                type="time"
                className={inputCls}
                value={form.shiftEnd || ''}
                onChange={e => set('shiftEnd', e.target.value)}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={labelCls}>Phone</label>
              <input
                className={inputCls}
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="10-digit number"
                type="tel"
              />
            </div>

            {/* UPI ID */}
            <div>
              <label className={labelCls}>UPI ID</label>
              <input
                className={inputCls}
                value={form.upiId}
                onChange={e => set('upiId', e.target.value)}
                placeholder="name@upi"
              />
            </div>

            {/* Salary Type */}
            <div>
              <label className={labelCls}>Salary Type</label>
              <select
                className={inputCls + ' cursor-pointer'}
                value={form.salaryType}
                onChange={e => set('salaryType', e.target.value)}
              >
                {SALARY_TYPES.map(t => (
                  <option key={t} value={t} className="bg-[#0F0F0F]">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Salary Amount */}
            <div>
              <label className={labelCls}>Salary Amount (₹) *</label>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.salaryAmount}
                onChange={e => set('salaryAmount', e.target.value)}
                placeholder="e.g. 15000"
              />
            </div>

            {/* Late Penalty */}
            <div className="col-span-2">
              <label className={labelCls}>Late Penalty per occurrence (₹)</label>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.latePenalty}
                onChange={e => set('latePenalty', e.target.value)}
                placeholder="e.g. 50"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-[#A3A3A3] hover:text-white rounded-lg text-sm font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving…</>
                : <><Save className="w-4 h-4" />{initial?.id ? 'Update' : 'Add Staff'}</>
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

// ── QR Code Modal ──────────────────────────────────────────────────────────────

const QRModal = ({ staff, cafeId, onClose }) => {
  const qrValue = `STAFF_ATTENDANCE|${cafeId}|${staff.id}`;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative bg-[#0F0F0F] border border-white/10 rounded-2xl p-8 text-center space-y-5"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-[#A3A3A3]">
          <X className="w-4 h-4" />
        </button>
        <div>
          <h3 className="text-white font-bold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>
            {staff.name}
          </h3>
          <p className="text-[#A3A3A3] text-sm">{staff.role} · Attendance QR</p>
        </div>
        <div className="bg-white p-5 rounded-2xl inline-block">
          <QRCodeSVG value={qrValue} size={200} />
        </div>
        <p className="text-[#555] text-xs">Staff scans this QR to mark attendance</p>
      </motion.div>
    </motion.div>
  );
};

// ── Main StaffList component ───────────────────────────────────────────────────

const StaffList = ({ cafeId }) => {
  const { T }              = useTheme();
  const [staff,       setStaff      ] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [showForm,    setShowForm   ] = useState(false);
  const [editTarget,  setEditTarget ] = useState(null);
  const [saving,      setSaving     ] = useState(false);
  const [qrTarget,    setQrTarget   ] = useState(null);
  const [deleteId,    setDeleteId   ] = useState(null);
  // ADD: staff profile — holds staff object whose calendar is open
  const [profileStaff, setProfileStaff] = useState(null);

  // Real-time staff list
  useEffect(() => {
    if (!cafeId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'staff'),
        where('cafeId',   '==', cafeId),
        where('isActive', '==', true)
      ),
      snap => {
        setStaff(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setLoading(false);
      },
      err => {
        console.error('[StaffList]', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [cafeId]);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (editTarget?.id) {
        await updateStaff(editTarget.id, formData);
        toast.success('Staff updated ✓');
      } else {
        await addStaff(cafeId, formData);
        toast.success('Staff member added ✓');
      }
      setShowForm(false);
      setEditTarget(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteStaff(id);
      toast.success('Staff removed');
      setDeleteId(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editTarget) && (
          <StaffFormModal
            initial={editTarget}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditTarget(null); }}
            saving={saving}
          />
        )}
        {qrTarget && (
          <QRModal
            staff={qrTarget}
            cafeId={cafeId}
            onClose={() => setQrTarget(null)}
          />
        )}
        {/* ADD: staff profile — attendance calendar overlay */}
        {profileStaff && (
          <AttendanceCalendar
            staff={profileStaff}
            cafeId={cafeId}
            onClose={() => setProfileStaff(null)}
            T={T}
          />
        )}
      </AnimatePresence>

      {/* ── List header ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[#555] text-sm">{staff.length} team member{staff.length !== 1 ? 's' : ''}</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-xl text-sm transition-all"
        >
          <UserPlus className="w-4 h-4" />Add Staff
        </motion.button>
      </div>

      {/* ── Loading skeleton ── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-white/3 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-12 text-center">
          <User className="w-12 h-12 text-[#333] mx-auto mb-3" />
          <p className="text-[#A3A3A3]">No staff added yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-[#D4AF37] text-sm underline underline-offset-2"
          >
            Add your first team member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {staff.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors"
              >
                {/* Card top: avatar + name + action buttons */}
                <div className="flex items-start justify-between mb-3">
                  {/* ADD: clicking avatar/name opens attendance calendar profile */}
                  <button
                    className="flex items-center gap-3 text-left flex-1 min-w-0 mr-2"
                    onClick={() => setProfileStaff(s)}
                    title="View attendance calendar"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0"
                      style={{
                        background: `${ROLE_COLORS[s.role] || '#A3A3A3'}18`,
                        color: ROLE_COLORS[s.role] || '#A3A3A3',
                      }}
                    >
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{s.name}</p>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: `${ROLE_COLORS[s.role] || '#A3A3A3'}18`,
                          color: ROLE_COLORS[s.role] || '#A3A3A3',
                        }}
                      >
                        {s.role}
                      </span>
                    </div>
                  </button>

                  {/* Action buttons */}
                  <div className="flex gap-1 flex-shrink-0">
                    {/* ADD: calendar icon opens attendance profile */}
                    <button
                      onClick={() => setProfileStaff(s)}
                      className="p-2 rounded-lg hover:bg-white/10 text-[#555] hover:text-[#D4AF37] transition-all"
                      title="View attendance calendar"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setQrTarget(s)}
                      className="p-2 rounded-lg hover:bg-white/10 text-[#555] hover:text-[#D4AF37] transition-all"
                      title="View QR"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditTarget(s)}
                      className="p-2 rounded-lg hover:bg-white/10 text-[#555] hover:text-white transition-all"
                      title="Edit staff"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(s.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-[#555] hover:text-red-400 transition-all"
                      title="Remove staff"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Staff details */}
                <div className="space-y-1.5 text-xs text-[#555]">
                  {s.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />{s.phone}
                    </div>
                  )}
                  {s.upiId && (
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" />{s.upiId}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />Shift: {s.shiftStart}{s.shiftEnd ? ` – ${s.shiftEnd}` : ''}
                  </div>
                </div>

                {/* Salary summary */}
                <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[#555] text-xs capitalize">{s.salaryType} salary</span>
                  <span className="text-[#D4AF37] font-black text-sm">
                    ₹{(s.salaryAmount || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Delete confirmation inline */}
                <AnimatePresence>
                  {deleteId === s.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                      <p className="text-red-400 text-xs mb-2">Remove {s.name} from staff?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeleteId(null)}
                          className="flex-1 py-1.5 border border-white/10 text-[#A3A3A3] rounded-lg text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="flex-1 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold"
                        >
                          Remove
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
};

export default StaffList;
