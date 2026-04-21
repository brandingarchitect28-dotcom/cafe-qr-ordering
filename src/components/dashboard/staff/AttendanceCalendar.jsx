/**
 * AttendanceCalendar.jsx  — THEME-FIXED
 *
 * Calendar day cell inline styles previously used rgba(255,255,255,*) values
 * which became invisible on light backgrounds.
 *
 * Now uses isLight-conditional values for:
 * - Unrecorded day cells (background + text colour)
 * - Sunday cells (background + text colour)
 * - Modal overlay and panel border
 * - Section divider borders
 * - Day detail panel backgrounds
 * - Edit mode input field
 *
 * T prop usage extended to cover all remaining hardcoded class strings.
 * Nothing structural changed — only colour/class strings.
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
  if (typeof iso === 'string' && /^\d{2}:\d{2}$/.test(iso)) return iso;
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
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
const AttendanceCalendar = ({ staff, cafeId, onClose, T, isLight: isLightProp }) => {
  // isLight may come from parent (T is always passed), but we also derive locally
  // so this component works even if parent doesn't pass isLight explicitly.
  const isLight = isLightProp !== undefined
    ? isLightProp
    : (typeof T?.page === 'string' && T.page.includes('F5F3'));

  const [yearMonth,    setYearMonth   ] = useState(todayYM());
  const [records,      setRecords     ] = useState({});
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
    const firstDOW = new Date(yearMonth + '-01').getDay();
    const blanks   = Array(firstDOW).fill(null);
    return [...blanks, ...days];
  }, [yearMonth]);

  const getStatus = (date) => {
    const rec = records[date];
    if (!rec) {
      const d   = new Date(date);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      if (d > now) return null;
      if (d.getDay() === 0) return 'off';
      return STATUS.ABSENT;
    }
    return rec.status || deriveStatus(rec);
  };

  // ── Summary counts ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const all   = daysInMonth(yearMonth);
    const today = toDateKey(new Date());
    let present = 0, absent = 0, late = 0, half = 0;
    all.forEach(date => {
      if (date > today || new Date(date).getDay() === 0) return;
      const s = getStatus(date);
      if      (s === STATUS.PRESENT)  present++;
      else if (s === STATUS.ABSENT)   absent++;
      else if (s === STATUS.LATE)   { present++; late++; }
      else if (s === STATUS.HALF_DAY) half++;
    });
    return { present, absent, late, half };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, yearMonth]);

  // ── Save manual override ─────────────────────────────────────────────────────
  const saveOverride = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const docId    = `${cafeId}_${staff.id}_${selectedDate}`;
      const ref      = doc(db, 'attendance', docId);
      const existing = records[selectedDate] || {};
      const newStatus = editStatus || existing.status || STATUS.ABSENT;

      await setDoc(ref, {
        staffId:     staff.id,
        cafeId,
        date:        selectedDate,
        month:       yearMonth,
        status:      newStatus,
        note:        editNote,
        checkIn:     existing.checkIn      || null,
        checkOut:    existing.checkOut     || null,
        lateMinutes: existing.lateMinutes  || 0,
        updatedAt:   serverTimestamp(),
      }, { merge: true });

      setRecords(prev => ({
        ...prev,
        [selectedDate]: {
          ...existing,
          status: newStatus,
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
    setEditNote(rec?.note    || '');
    setEditStatus(rec?.status || getStatus(date) || STATUS.ABSENT);
    setEditMode(false);
  };

  const selectedRec    = selectedDate ? records[selectedDate] : null;
  const selectedStatus = selectedDate ? (getStatus(selectedDate) || STATUS.ABSENT) : null;
  const SC             = selectedStatus && STATUS_CONFIG[selectedStatus];

  // ── Theme-aware inline style values ──────────────────────────────────────────
  const overlayBg       = isLight ? 'rgba(0,0,0,0.45)'          : 'rgba(0,0,0,0.75)';
  const modalBorder     = isLight ? '1px solid rgba(0,0,0,0.10)': '1px solid rgba(255,255,255,0.08)';
  const dividerColor    = isLight ? 'rgba(0,0,0,0.08)'          : 'rgba(255,255,255,0.05)';
  const unrecordedBg    = isLight ? 'rgba(0,0,0,0.04)'          : 'rgba(255,255,255,0.04)';
  const unrecordedText  = isLight ? '#888888'                    : 'rgba(255,255,255,0.3)';
  const sundayBg        = isLight ? 'rgba(0,0,0,0.025)'         : 'rgba(255,255,255,0.02)';
  const sundayText      = isLight ? '#BBBBBB'                    : 'rgba(255,255,255,0.15)';
  const detailBoxBg     = isLight ? 'rgba(0,0,0,0.04)'          : 'rgba(0,0,0,0.20)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: overlayBg, backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 20 }}
        className={`${T?.card || 'bg-[#0F0F0F]'} rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto`}
        style={{ border: modalBorder }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${T?.border || 'border-white/5'}`}>
          <div>
            <h2 className={`${T?.heading || 'text-white'} font-bold text-lg`}>{staff.name}</h2>
            <p className={`${T?.muted || 'text-[#A3A3A3]'} text-xs mt-0.5`}>
              {staff.role} · Attendance Calendar
            </p>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg ${T?.subCard || 'bg-white/5'} flex items-center justify-center ${T?.muted || 'text-[#A3A3A3]'} hover:text-black/70 transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Month nav ── */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setYearMonth(prevMonth(yearMonth)); setSelectedDate(null); }}
              className={`w-8 h-8 rounded-lg ${T?.subCard || 'bg-white/5'} flex items-center justify-center ${T?.muted || 'text-[#A3A3A3]'} hover:text-[#D4AF37] transition-colors`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className={`${T?.heading || 'text-white'} font-bold text-base`}>
              {monthLabel(yearMonth)}
            </h3>
            <button
              onClick={() => { setYearMonth(nextMonth(yearMonth)); setSelectedDate(null); }}
              disabled={yearMonth >= todayYM()}
              className={`w-8 h-8 rounded-lg ${T?.subCard || 'bg-white/5'} flex items-center justify-center ${T?.muted || 'text-[#A3A3A3]'} hover:text-[#D4AF37] transition-colors disabled:opacity-30`}
            >
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
              <div key={s.label} className={`${T?.subCard || 'bg-white/5'} rounded-xl p-3 text-center`}>
                <p className="text-xl font-black" style={{ color: s.color }}>{s.val}</p>
                <p className={`${T?.faint || 'text-[#555]'} text-xs mt-0.5`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Day header labels ── */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map(d => (
              <div key={d} className={`text-center text-xs font-semibold py-1 ${T?.faint || 'text-[#555]'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* ── Calendar grid ── */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array(35).fill(0).map((_, i) => (
                <div key={i} className={`h-10 rounded-lg ${T?.subCard || 'bg-white/5'} animate-pulse`} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, i) => {
                if (!date) return <div key={i} />;
                const dow      = new Date(date).getDay();
                const status   = getStatus(date);
                const day      = date.split('-')[2];
                const isToday  = date === toDateKey(new Date());
                const isFuture = date > toDateKey(new Date());
                const isSel    = date === selectedDate;
                const cfg      = status && status !== 'off' ? STATUS_CONFIG[status] : null;

                return (
                  <button
                    key={date}
                    onClick={() => !isFuture && dow !== 0 && openDay(date)}
                    disabled={isFuture || dow === 0}
                    className="h-10 rounded-lg flex items-center justify-center text-sm font-semibold transition-all"
                    style={{
                      background: isSel
                        ? '#D4AF37'
                        : cfg
                          ? cfg.bg
                          : dow === 0
                            ? sundayBg
                            : isToday
                              ? 'rgba(212,175,55,0.1)'
                              : unrecordedBg,
                      color: isSel
                        ? '#000'
                        : cfg
                          ? cfg.color
                          : dow === 0
                            ? sundayText
                            : isToday
                              ? '#D4AF37'
                              : unrecordedText,
                      border:  isToday && !isSel ? '1.5px solid #D4AF37' : '1px solid transparent',
                      cursor:  isFuture || dow === 0 ? 'default' : 'pointer',
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
                <span className={`${T?.faint || 'text-[#555]'} text-xs`}>{v.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: isLight ? '#CCCCCC' : 'rgba(255,255,255,0.15)' }} />
              <span className={`${T?.faint || 'text-[#555]'} text-xs`}>Sunday (Off)</span>
            </div>
          </div>

          {/* ── Day detail panel ── */}
          <AnimatePresence>
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`${T?.subCard || 'bg-white/5'} rounded-xl overflow-hidden`}
              >
                <div className="p-4 space-y-3">

                  {/* Date + status badge + Edit button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`${T?.heading || 'text-white'} font-bold text-sm`}>
                        {new Date(selectedDate).toLocaleDateString('en-IN', {
                          weekday: 'long', day: 'numeric', month: 'long',
                        })}
                      </p>
                      {SC && (
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                          style={{ color: SC.color, background: SC.bg }}
                        >
                          {SC.label}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setEditMode(e => !e)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${T?.subCard || 'bg-white/5'}`}
                      style={{ color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }}
                    >
                      <Edit3 className="w-3 h-3" /> {editMode ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {/* Check-in / check-out / late info */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Check In',  val: fmtTime(selectedRec?.checkIn)  },
                      { label: 'Check Out', val: fmtTime(selectedRec?.checkOut) },
                      { label: 'Late By',   val: selectedRec?.lateMinutes ? `${selectedRec.lateMinutes} min` : '—' },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="rounded-lg p-3"
                        style={{ background: detailBoxBg }}
                      >
                        <p className={`${T?.faint || 'text-[#555]'} text-xs mb-1`}>{item.label}</p>
                        <p className={`${T?.heading || 'text-white'} text-sm font-bold`}>{item.val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Note display (read mode) */}
                  {selectedRec?.note && !editMode && (
                    <p className={`${T?.muted || 'text-[#A3A3A3]'} text-xs italic`}>
                      📝 {selectedRec.note}
                    </p>
                  )}

                  {/* Edit mode — status override + note */}
                  {editMode && (
                    <div className="space-y-3">
                      <div>
                        <p className={`${T?.muted || 'text-[#A3A3A3]'} text-xs mb-2`}>Override status</p>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <button
                              key={k}
                              onClick={() => setEditStatus(k)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={
                                editStatus === k
                                  ? { background: v.color, color: '#fff' }
                                  : { background: v.bg,    color: v.color }
                              }
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className={`${T?.muted || 'text-[#A3A3A3]'} text-xs mb-1`}>Note / Reason</p>
                        <input
                          value={editNote}
                          onChange={e => setEditNote(e.target.value)}
                          placeholder="e.g. Medical leave, Personal emergency..."
                          className={`w-full ${T?.input || 'bg-black/20 border border-white/10 text-white'} rounded-lg px-3 py-2 text-sm outline-none`}
                        />
                      </div>
                      <button
                        onClick={saveOverride}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black transition-all disabled:opacity-50"
                        style={{ background: '#D4AF37' }}
                      >
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
