/**
 * AttendanceCalendar.jsx
 *
 * Opens when owner clicks any staff member.
 * Shows a monthly calendar with colour-coded attendance status per day.
 * Clicking a day shows check-in time, late minutes, and note.
 * No redesign of existing UI — uses same dark card theme.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, Clock, AlertCircle,
  CheckCircle2, XCircle, Minus, Edit3, Save,
} from 'lucide-react';
import {
  collection, query, where, getDocs,
  doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';
import {
  toDateKey, daysInMonth, deriveStatus, STATUS,
} from '../../../services/salaryEngine';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  [STATUS.PRESENT]:  { label: 'Present',  color: '#10B981', bg: 'rgba(16,185,129,0.15)',  icon: CheckCircle2 },
  [STATUS.ABSENT]:   { label: 'Absent',   color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   icon: XCircle      },
  [STATUS.LATE]:     { label: 'Late',     color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  icon: Clock        },
  [STATUS.HALF_DAY]: { label: 'Half Day', color: '#F97316', bg: 'rgba(249,115,22,0.15)', icon: Minus        },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const monthLabel = (ym) =>
  new Date(ym + '-01').toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });

const prevMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const nextMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const todayYM = () => toDateKey(new Date()).slice(0, 7);

// ── Main component ─────────────────────────────────────────────────────────────
const AttendanceCalendar = ({ staff, cafeId, onClose, T }) => {
  const [yearMonth,    setYearMonth   ] = useState(todayYM());
  const [records,      setRecords     ] = useState({}); // { 'YYYY-MM-DD': doc }
  const [loading,      setLoading     ] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editMode,     setEditMode    ] = useState(false);
  const [editNote,     setEditNote    ] = useState('');
  const [editStatus,   setEditStatus  ] = useState('');
  const [saving,       setSaving      ] = useState(false);

  // ── Fetch attendance for this staff + month ──────────────────────────────────
  useEffect(() => {
    if (!staff?.id || !cafeId) return;
    const load = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'attendance'),
          where('staffId', '==', staff.id),
          where('cafeId',  '==', cafeId),
          where('month',   '==', yearMonth)
        );
        const snap = await getDocs(q);
        const map  = {};
        snap.forEach(d => { map[d.data().date] = { id: d.id, ...d.data() }; });
        setRecords(map);
      } catch (err) {
        console.error('[AttendanceCalendar]', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staff?.id, cafeId, yearMonth]);

  // ── Build calendar grid ──────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const days     = daysInMonth(yearMonth);
    const firstDOW = new Date(yearMonth + '-01').getDay(); // 0=Sun
    const blanks   = Array(firstDOW).fill(null);
    return [...blanks, ...days];
  }, [yearMonth]);

  const getStatus = (date) => {
    const rec = records[date];
    if (!rec) {
      // Future dates show nothing; past dates auto-absent
      const d   = new Date(date);
      const now = new Date(); now.setHours(0,0,0,0);
      if (d > now) return null;
      // Sunday = off
      if (d.getDay() === 0) return 'off';
      return STATUS.ABSENT;
    }
    return rec.status;
  };

  // ── Summary counts ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const all   = daysInMonth(yearMonth);
    const today = toDateKey(new Date());
    let present = 0, absent = 0, late = 0, half = 0;
    all.forEach(date => {
      if (date > today || new Date(date).getDay() === 0) return;
      const s = getStatus(date);
      if (s === STATUS.PRESENT)  present++;
      else if (s === STATUS.ABSENT)   absent++;
      else if (s === STATUS.LATE)   { present++; late++; }
      else if (s === STATUS.HALF_DAY)  half++;
    });
    return { present, absent, late, half };
  }, [records, yearMonth]);

  // ── Save manual override ─────────────────────────────────────────────────────
  const saveOverride = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const docId  = `${cafeId}_${staff.id}_${selectedDate}`;
      const ref    = doc(db, 'attendance', docId);
      const existing = records[selectedDate] || {};
      await setDoc(ref, {
        staffId:   staff.id,
        cafeId,
        date:      selectedDate,
        month:     yearMonth,
        status:    editStatus || existing.status || STATUS.ABSENT,
        note:      editNote,
        checkIn:   existing.checkIn   || null,
        checkOut:  existing.checkOut  || null,
        lateMinutes: existing.lateMinutes || 0,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setRecords(prev => ({
        ...prev,
        [selectedDate]: {
          ...existing,
          status: editStatus || existing.status || STATUS.ABSENT,
          note:   editNote,
        },
      }));
      toast.success('Attendance updated');
      setEditMode(false);
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDay = (date) => {
    setSelectedDate(date);
    const rec = records[date];
    setEditNote(rec?.note   || '');
    setEditStatus(rec?.status || getStatus(date) || STATUS.ABSENT);
    setEditMode(false);
  };

  const selectedRec    = selectedDate ? records[selectedDate] : null;
  const selectedStatus = selectedDate ? (getStatus(selectedDate) || STATUS.ABSENT) : null;
  const SC             = selectedStatus && STATUS_CONFIG[selectedStatus];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 20 }}
        className={`${T.card} rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto`}
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${T.border}`}>
          <div>
            <h2 className={`${T.heading} font-bold text-lg`}>{staff.name}</h2>
            <p className={`${T.muted} text-xs mt-0.5`}>{staff.role} · Attendance Calendar</p>
          </div>
          <button onClick={onClose}
            className={`w-8 h-8 rounded-lg ${T.subCard} flex items-center justify-center ${T.muted} hover:text-white transition-colors`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Month nav ── */}
          <div className="flex items-center justify-between">
            <button onClick={() => setYearMonth(prevMonth(yearMonth))}
              className={`w-8 h-8 rounded-lg ${T.subCard} flex items-center justify-center ${T.muted} hover:text-white transition-colors`}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className={`${T.heading} font-bold text-base`}>{monthLabel(yearMonth)}</h3>
            <button onClick={() => setYearMonth(nextMonth(yearMonth))}
              disabled={yearMonth >= todayYM()}
              className={`w-8 h-8 rounded-lg ${T.subCard} flex items-center justify-center ${T.muted} hover:text-white transition-colors disabled:opacity-30`}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* ── Summary strip ── */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Present', val: summary.present, color: '#10B981' },
              { label: 'Absent',  val: summary.absent,  color: '#EF4444' },
              { label: 'Late',    val: summary.late,    color: '#F59E0B' },
              { label: 'Half',    val: summary.half,    color: '#F97316' },
            ].map(s => (
              <div key={s.label} className={`${T.subCard} rounded-xl p-3 text-center`}>
                <p className="text-xl font-black" style={{ color: s.color }}>{s.val}</p>
                <p className={`${T.faint} text-xs mt-0.5`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Day labels ── */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map(d => (
              <div key={d} className={`text-center text-xs font-semibold py-1 ${T.faint}`}>{d}</div>
            ))}
          </div>

          {/* ── Calendar grid ── */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array(35).fill(0).map((_, i) => (
                <div key={i} className={`h-10 rounded-lg ${T.subCard} animate-pulse`} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, i) => {
                if (!date) return <div key={i} />;
                const dow    = new Date(date).getDay();
                const status = getStatus(date);
                const day    = date.split('-')[2];
                const isToday = date === toDateKey(new Date());
                const isFuture = date > toDateKey(new Date());
                const isSel  = date === selectedDate;
                const cfg    = status && status !== 'off' ? STATUS_CONFIG[status] : null;

                return (
                  <button
                    key={date}
                    onClick={() => !isFuture && dow !== 0 && openDay(date)}
                    disabled={isFuture || dow === 0}
                    className="h-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all relative"
                    style={{
                      background: isSel
                        ? '#D4A843'
                        : cfg
                          ? cfg.bg
                          : dow === 0
                            ? 'rgba(255,255,255,0.02)'
                            : 'rgba(255,255,255,0.04)',
                      color: isSel
                        ? '#000'
                        : cfg
                          ? cfg.color
                          : dow === 0
                            ? 'rgba(255,255,255,0.15)'
                            : 'rgba(255,255,255,0.3)',
                      border: isToday ? '1.5px solid #D4A843' : '1px solid transparent',
                      cursor: isFuture || dow === 0 ? 'default' : 'pointer',
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Legend ── */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: v.color }} />
                <span className={`${T.faint} text-xs`}>{v.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
              <span className={`${T.faint} text-xs`}>Sunday (Off)</span>
            </div>
          </div>

          {/* ── Day detail panel ── */}
          <AnimatePresence>
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`${T.subCard} rounded-xl overflow-hidden`}
              >
                <div className="p-4 space-y-3">
                  {/* Date + status */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`${T.heading} font-bold text-sm`}>
                        {new Date(selectedDate).toLocaleDateString('en-IN', {
                          weekday: 'long', day: 'numeric', month: 'long',
                        })}
                      </p>
                      {SC && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                          style={{ color: SC.color, background: SC.bg }}>
                          {SC.label}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setEditMode(e => !e)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${T.subCard}`}
                      style={{ color: '#D4A843', border: '1px solid rgba(212,168,67,0.3)' }}
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                  </div>

                  {/* Check-in / late info */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Check In',  val: fmtTime(selectedRec?.checkIn) },
                      { label: 'Check Out', val: fmtTime(selectedRec?.checkOut) },
                      { label: 'Late By',   val: selectedRec?.lateMinutes ? `${selectedRec.lateMinutes} min` : '—' },
                    ].map(item => (
                      <div key={item.label} className={`${T.innerCard} rounded-lg p-3`}>
                        <p className={`${T.faint} text-xs mb-1`}>{item.label}</p>
                        <p className={`${T.heading} text-sm font-bold`}>{item.val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Note */}
                  {selectedRec?.note && !editMode && (
                    <p className={`${T.muted} text-xs italic`}>📝 {selectedRec.note}</p>
                  )}

                  {/* Edit mode */}
                  {editMode && (
                    <div className="space-y-3">
                      <div>
                        <p className={`${T.muted} text-xs mb-2`}>Override status</p>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <button key={k}
                              onClick={() => setEditStatus(k)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={editStatus === k
                                ? { background: v.color, color: '#fff' }
                                : { background: v.bg, color: v.color }}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className={`${T.muted} text-xs mb-1`}>Note / Reason</p>
                        <input
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          placeholder="e.g. Medical leave, Personal emergency..."
                          className={`w-full ${T.input} rounded-lg px-3 py-2 text-sm`}
                        />
                      </div>
                      <button
                        onClick={saveOverride}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black transition-all disabled:opacity-50"
                        style={{ background: '#D4A843' }}>
                        <Save className="w-3.5 h-3.5" />
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </motion.div>
  );
};

export default AttendanceCalendar;
