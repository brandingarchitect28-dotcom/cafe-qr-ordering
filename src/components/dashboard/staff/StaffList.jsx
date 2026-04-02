/**
 * StaffList.jsx  (UPGRADE)
 *
 * Drop-in replacement for the existing StaffList.
 * Changes from original:
 *  - Clicking a staff card opens AttendanceCalendar modal
 *  - All existing UI, filtering, and add-staff logic preserved
 *  - No layout or theme changes
 *
 * Props expected (same as before):
 *   staffList  — array of staff docs
 *   cafeId     — string
 *   T          — theme object from useTheme()
 *   onAddStaff — callback to open add-staff form
 *   onEdit     — callback to edit a staff member
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users, Plus, Phone, Calendar, MoreVertical,
  Edit2, Trash2, Clock,
} from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';
import AttendanceCalendar from './AttendanceCalendar';
import { useTheme } from '../../../hooks/useTheme';

// ── Role badge colours ─────────────────────────────────────────────────────────
const ROLE_COLORS = {
  manager:  { color: '#D4A843', bg: 'rgba(212,168,67,0.12)'  },
  barista:  { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  waiter:   { color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  cashier:  { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  chef:     { color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
  default:  { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)'  },
};
const roleStyle = (role = '') => ROLE_COLORS[role.toLowerCase()] || ROLE_COLORS.default;

// ── Staff card ─────────────────────────────────────────────────────────────────
const StaffCard = ({ staff, cafeId, T, onEdit, onDelete, onViewAttendance, index }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const rs = roleStyle(staff.role);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`${T.card} rounded-xl overflow-hidden`}
      style={{ border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">

        {/* Avatar */}
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-black flex-shrink-0"
          style={{ background: rs.bg, color: rs.color }}>
          {staff.name?.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`${T.heading} font-bold text-sm truncate`}>{staff.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ color: rs.color, background: rs.bg }}>
              {staff.role}
            </span>
            {staff.phone && (
              <span className={`${T.faint} text-xs flex items-center gap-1`}>
                <Phone className="w-3 h-3" />{staff.phone}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Base: ₹{(staff.baseSalary || 0).toLocaleString('en-IN')} / month
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View Attendance Calendar — the key new addition */}
          <button
            onClick={() => onViewAttendance(staff)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'rgba(212,168,67,0.1)', color: '#D4A843',
                     border: '1px solid rgba(212,168,67,0.25)' }}
            title="View Attendance"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Attendance</span>
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className={`w-8 h-8 rounded-lg ${T.subCard} flex items-center justify-center ${T.muted} hover:text-white transition-colors`}>
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1,  y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  className={`absolute right-0 top-10 z-20 ${T.card} rounded-xl overflow-hidden shadow-xl min-w-[140px]`}
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <button
                    onClick={() => { onEdit(staff); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${T.muted} hover:${T.body} hover:bg-white/5 transition-colors`}>
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => { onDelete(staff); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Shift info strip */}
      {staff.shiftStartTime && (
        <div className="px-5 pb-3 flex items-center gap-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <Clock className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.25)' }} />
          <span className={`${T.faint} text-xs`}>
            Shift starts {staff.shiftStartTime} · Grace {staff.lateGraceMinutes || 15} min ·
            Late penalty ₹{staff.latePenaltyPerOccurrence || 50}/occurrence
          </span>
        </div>
      )}
    </motion.div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const StaffList = ({ staffList = [], cafeId, onAddStaff, onEdit }) => {
  const { T }             = useTheme();
  const [calendarStaff,   setCalendarStaff] = useState(null); // staff doc or null
  const [searchQuery,     setSearchQuery  ] = useState('');

  const filtered = staffList.filter(s =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (staff) => {
    if (!window.confirm(`Remove ${staff.name} from staff? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'staff', staff.id));
      toast.success(`${staff.name} removed`);
    } catch (err) {
      toast.error('Failed to remove: ' + err.message);
    }
  };

  return (
    <>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className={`${T.heading} font-bold text-2xl`}
            style={{ fontFamily: 'Playfair Display, serif' }}>
            Staff
          </h2>
          <p className={`${T.muted} text-sm mt-1`}>
            {staffList.length} team member{staffList.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search staff…"
            className={`${T.input} rounded-lg px-3 py-2 text-sm h-9 w-40`}
          />
          <button
            onClick={onAddStaff}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-black transition-all"
            style={{ background: '#D4A843' }}>
            <Plus className="w-4 h-4" /> Add Staff
          </button>
        </div>
      </div>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div className={`${T.card} rounded-xl p-12 text-center`}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(212,168,67,0.25)' }} />
          <p className={`${T.heading} font-semibold mb-1`}>
            {searchQuery ? 'No staff found' : 'No staff added yet'}
          </p>
          <p className={`${T.muted} text-sm`}>
            {searchQuery
              ? 'Try a different search term'
              : 'Click Add Staff to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((staff, i) => (
            <StaffCard
              key={staff.id}
              staff={staff}
              cafeId={cafeId}
              T={T}
              index={i}
              onEdit={onEdit}
              onDelete={handleDelete}
              onViewAttendance={setCalendarStaff}
            />
          ))}
        </div>
      )}

      {/* ── Attendance Calendar Modal ── */}
      <AnimatePresence>
        {calendarStaff && (
          <AttendanceCalendar
            staff={calendarStaff}
            cafeId={cafeId}
            T={T}
            onClose={() => setCalendarStaff(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default StaffList;
