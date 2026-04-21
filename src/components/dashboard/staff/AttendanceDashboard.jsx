/**
 * AttendanceDashboard.jsx  — THEME-FIXED
 *
 * Previously had zero theme awareness — 100% hardcoded dark classes.
 * Now imports useTheme and uses T.* tokens throughout.
 *
 * QRScannerModal, MonthCalendar, and main component all fully themed.
 * Status badge inline styles use semantic colours (kept — correct for both modes).
 * Calendar grid day cells now use isLight-conditional inline styles.
 *
 * Nothing structural changed — only colour/class strings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QrCode, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, X, Scan,
} from 'lucide-react';
import {
  checkIn, checkOut, getDailyAttendance, getMonthlyAttendance,
  toDateKey,
} from '../../../services/staffService';
import { toast } from 'sonner';
import { useTheme } from '../../../hooks/useTheme';

// FALLBACK FIX: guarantees toDateKey always works even if import fails at runtime
const safeToDateKey = (date = new Date()) => {
  try {
    return new Date(date).toISOString().split('T')[0];
  } catch (e) {
    console.error('safeToDateKey error:', e);
    return '';
  }
};
const _dateKey = (date) =>
  (typeof toDateKey === 'function' ? toDateKey : safeToDateKey)(date);

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  present:    { label: 'Present',  color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  late:       { label: 'Late',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  'half-day': { label: 'Half Day', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  absent:     { label: 'Absent',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
};

// ── QR Scanner Modal ──────────────────────────────────────────────────────────
const QRScannerModal = ({ cafeId, staffList, onClose, T, isLight }) => {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const scannerRef = useRef(null);
  const [status,      setStatus     ] = useState('scanning');
  const [message,     setMessage    ] = useState('Point camera at staff QR code');
  const [lastScanned, setLastScanned] = useState(null);

  // Start camera
  useEffect(() => {
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setStatus('error');
        setMessage('Camera access denied. Use manual check-in.');
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(scannerRef.current);
    };
  }, []);

  // BarcodeDetector-based QR scanning
  useEffect(() => {
    if (!('BarcodeDetector' in window)) return;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    const scan = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) handleQRValue(codes[0].rawValue);
      } catch (_) {}
    };
    scannerRef.current = setInterval(scan, 500);
    return () => clearInterval(scannerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId, staffList]);

  const handleQRValue = useCallback(async (value) => {
    if (lastScanned === value) return;
    setLastScanned(value);

    const parts = value.split('|');
    if (parts[0] !== 'STAFF_ATTENDANCE' || parts[1] !== cafeId) {
      setStatus('error');
      setMessage('Invalid QR — not a staff attendance code for this café');
      setTimeout(() => { setStatus('scanning'); setMessage('Point camera at staff QR code'); setLastScanned(null); }, 2000);
      return;
    }

    const staffId     = parts[2];
    const staffMember = staffList.find(s => s.id === staffId);
    if (!staffMember) {
      setStatus('error');
      setMessage('Staff member not found');
      setTimeout(() => { setStatus('scanning'); setMessage('Point camera at staff QR code'); setLastScanned(null); }, 2000);
      return;
    }

    try {
      const today    = await getDailyAttendance(cafeId, _dateKey());
      const existing = today.find(a => a.staffId === staffId);

      if (existing && !existing.checkOut) {
        const result = await checkOut(cafeId, staffId);
        setStatus('success');
        setMessage(`✓ ${staffMember.name} checked OUT — ${result.hoursWorked.toFixed(1)}h worked`);
        toast.success(`${staffMember.name} checked out`);
      } else if (!existing) {
        const result = await checkIn(cafeId, staffId, staffMember.shiftStart);
        setStatus('success');
        setMessage(`✓ ${staffMember.name} checked IN${result.record.isLate ? ' (Late)' : ''}`);
        toast.success(`${staffMember.name} checked in${result.record.isLate ? ' — marked late' : ''}`);
      } else {
        setStatus('error');
        setMessage(`${staffMember.name} already checked out today`);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }

    setTimeout(() => { setStatus('scanning'); setMessage('Point camera at staff QR code'); setLastScanned(null); }, 3000);
  }, [cafeId, staffList, lastScanned]);

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${T.overlay} backdrop-blur-sm`}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className={`relative ${T.modal} rounded-2xl overflow-hidden w-full max-w-sm`}
        initial={{ scale: 0.9 }} animate={{ scale: 1 }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${T.border}`}>
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#D4AF37]" />
            <span className={`${T.heading} font-semibold text-sm`}>Scan Attendance QR</span>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg hover:bg-black/10 ${T.muted}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera */}
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 relative">
              {[
                { top: 0, left: 0,  borderRight: 'none', borderBottom: 'none' },
                { top: 0, right: 0, borderLeft: 'none',  borderBottom: 'none' },
                { bottom: 0, left: 0,  borderRight: 'none', borderTop: 'none' },
                { bottom: 0, right: 0, borderLeft: 'none',  borderTop: 'none' },
              ].map((style, i) => (
                <div
                  key={i}
                  className="absolute w-8 h-8"
                  style={{ border: '2px solid #D4AF37', ...style }}
                />
              ))}
              {status === 'scanning' && (
                <motion.div
                  className="absolute left-0 right-0 h-0.5 bg-[#D4AF37]/70"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Status message */}
        <div className={`p-4 text-center transition-colors ${
          status === 'success' ? 'bg-emerald-500/10' :
          status === 'error'   ? 'bg-red-500/10' : ''
        }`}>
          {status === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-1" />}
          {status === 'error'   && <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />}
          {status === 'scanning'&& <QrCode className="w-5 h-5 text-[#D4AF37] mx-auto mb-1" />}
          <p className={`text-sm ${T.heading}`}>{message}</p>
          {!('BarcodeDetector' in window) && status === 'scanning' && (
            <p className={`${T.faint} text-xs mt-1`}>
              QR scanning not supported in this browser — use manual check-in below
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Monthly calendar (per-staff mini view) ────────────────────────────────────
const MonthCalendar = ({ cafeId, staffList, T, isLight }) => {
  const now = new Date();
  const [month,         setMonth        ] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [records,       setRecords      ] = useState({});
  const [selectedStaff, setSelectedStaff] = useState(staffList[0]?.id || '');

  const yearMonth = `${month.year}-${String(month.month).padStart(2, '0')}`;

  useEffect(() => {
    if (!selectedStaff || !cafeId) return;
    getMonthlyAttendance(cafeId, selectedStaff, yearMonth).then(data => {
      const map = {};
      data.forEach(d => { map[d.date] = d; });
      setRecords(map);
    });
  }, [selectedStaff, yearMonth, cafeId]);

  useEffect(() => {
    if (!selectedStaff && staffList.length > 0) setSelectedStaff(staffList[0].id);
  }, [staffList, selectedStaff]);

  const days     = new Date(month.year, month.month, 0).getDate();
  const firstDay = new Date(month.year, month.month - 1, 1).getDay();
  const label    = new Date(month.year, month.month - 1).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });

  const prev = () => setMonth(m => m.month === 1  ? { year: m.year - 1, month: 12 } : { ...m, month: m.month - 1 });
  const next = () => setMonth(m => m.month === 12 ? { year: m.year + 1, month: 1  } : { ...m, month: m.month + 1 });

  // Theme-aware day cell colours
  const emptyCellBg    = isLight ? 'rgba(0,0,0,0.03)'  : 'transparent';
  const unrecordedBg   = isLight ? 'rgba(0,0,0,0.04)'  : 'rgba(255,255,255,0.04)';
  const unrecordedText = isLight ? '#888888'            : '#555555';
  const sundayBg       = isLight ? 'rgba(0,0,0,0.02)'  : 'rgba(255,255,255,0.02)';
  const sundayText     = isLight ? '#BBBBBB'            : 'rgba(255,255,255,0.15)';
  const todayBorder    = '1px solid rgba(212,175,55,0.3)';
  const todayBg        = 'rgba(212,175,55,0.1)';
  const todayText      = '#D4AF37';

  return (
    <div className={`${T.card} rounded-2xl p-5`}>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={prev} className={`p-2 rounded-lg hover:bg-black/10 ${T.muted} transition-all`}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className={`${T.heading} font-semibold text-sm min-w-[140px] text-center`}>{label}</span>
          <button onClick={next} className={`p-2 rounded-lg hover:bg-black/10 ${T.muted} transition-all`}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <select
          value={selectedStaff}
          onChange={e => setSelectedStaff(e.target.value)}
          className={`${T.select} rounded-lg px-3 py-2 text-sm outline-none cursor-pointer`}
        >
          {staffList.map(s => (
            <option key={s.id} value={s.id} className={T.option}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className={`text-center ${T.faint} text-xs font-semibold py-1`}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {[...Array(firstDay)].map((_, i) => <div key={`e${i}`} />)}
        {[...Array(days)].map((_, i) => {
          const day     = i + 1;
          const dateKey = `${yearMonth}-${String(day).padStart(2, '0')}`;
          const rec     = records[dateKey];
          const isToday = dateKey === toDateKey();
          const s       = rec ? STATUS[rec.status] : null;
          return (
            <div
              key={day}
              className="aspect-square rounded-lg flex items-center justify-center text-xs font-semibold relative transition-all"
              style={{
                background: s
                  ? s.bg
                  : isToday
                    ? todayBg
                    : unrecordedBg,
                color: s
                  ? s.color
                  : isToday
                    ? todayText
                    : unrecordedText,
                border: isToday && !s ? todayBorder : '1px solid transparent',
              }}
              title={rec ? `${rec.checkIn || ''}${rec.checkOut ? ` – ${rec.checkOut}` : ''} (${rec.status})` : ''}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className={`flex flex-wrap gap-3 mt-4 pt-4 border-t ${T.border}`}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: v.color }} />
            <span className={`${T.faint} text-xs`}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const AttendanceDashboard = ({ cafeId }) => {
  const { T, isLight }  = useTheme();
  const [staffList,   setStaffList  ] = useState([]);
  const [todayRecs,   setTodayRecs  ] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [manualId,    setManualId   ] = useState('');
  const today = toDateKey();

  // Real-time staff
  useEffect(() => {
    if (!cafeId) return;
    return onSnapshot(
      query(collection(db, 'staff'), where('cafeId', '==', cafeId), where('isActive', '==', true)),
      snap => setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)))
    );
  }, [cafeId]);

  // Real-time today's attendance
  useEffect(() => {
    if (!cafeId) return;
    return onSnapshot(
      query(collection(db, 'attendance'), where('cafeId', '==', cafeId), where('date', '==', today)),
      snap => setTodayRecs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [cafeId, today]);

  const present = todayRecs.filter(r => r.status !== 'absent').length;
  const absent  = staffList.length - present;

  const handleManualCheckIn = async () => {
    const staff = staffList.find(s => s.id === manualId);
    if (!staff) { toast.error('Select a staff member'); return; }
    try {
      const result = await checkIn(cafeId, manualId, staff.shiftStart);
      if (result.alreadyCheckedIn) {
        const co = await checkOut(cafeId, manualId);
        toast.success(`${staff.name} checked out — ${co.hoursWorked.toFixed(1)}h`);
      } else {
        toast.success(`${staff.name} checked in${result.record.isLate ? ' (Late)' : ''}`);
      }
      setManualId('');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <>
      <AnimatePresence>
        {showScanner && (
          <QRScannerModal
            cafeId={cafeId}
            staffList={staffList}
            onClose={() => setShowScanner(false)}
            T={T}
            isLight={isLight}
          />
        )}
      </AnimatePresence>

      <div className="space-y-5">

        {/* ── Today stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Staff',  val: staffList.length, color: '#D4AF37' },
            { label: 'Present',      val: present,           color: '#10B981' },
            { label: 'Absent',       val: absent,            color: '#EF4444' },
            { label: 'Attendance %', val: staffList.length ? `${Math.round(present / staffList.length * 100)}%` : '—', color: '#3B82F6' },
          ].map(s => (
            <motion.div
              key={s.label}
              whileHover={{ y: -2 }}
              className={`${T.card} rounded-2xl p-4`}
            >
              <p className={`${T.faint} text-xs uppercase tracking-wide mb-1`}>{s.label}</p>
              <p className="font-black text-2xl" style={{ color: s.color }}>{s.val}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Mark Attendance controls ── */}
        <div className={`${T.card} rounded-2xl p-5`}>
          <p className={`${T.heading} font-semibold text-sm mb-4`}>Mark Attendance</p>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* QR scan */}
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-xl text-sm transition-all"
            >
              <QrCode className="w-4 h-4" />Scan QR
            </button>

            {/* Manual check-in */}
            <div className="flex gap-2 flex-1">
              <select
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                className={`flex-1 ${T.select} rounded-xl px-3 py-2 text-sm outline-none cursor-pointer`}
              >
                <option value="" className={T.option}>— Manual check-in —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id} className={T.option}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleManualCheckIn}
                disabled={!manualId}
                className={`px-4 py-2 ${T.btnGhost} rounded-xl text-sm font-semibold transition-all disabled:opacity-40`}
              >
                Go
              </button>
            </div>
          </div>
        </div>

        {/* ── Today's attendance list ── */}
        <div className={`${T.card} rounded-2xl overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${T.border}`}>
            <p className={`${T.heading} font-semibold text-sm`}>
              Today — {new Date().toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          </div>
          <div className={`divide-y ${T.border}`}>
            {staffList.map(s => {
              const rec = todayRecs.find(r => r.staffId === s.id);
              const st  = rec ? (STATUS[rec.status] || STATUS.absent) : STATUS.absent;
              return (
                <div key={s.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
                      style={{ background: `${st.color}15`, color: st.color }}
                    >
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <p className={`${T.heading} text-sm font-medium`}>{s.name}</p>
                      <p className={`${T.faint} text-xs`}>{s.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                    {rec && (
                      <p className={`${T.faint} text-xs mt-0.5`}>
                        {rec.checkIn}{rec.checkOut ? ` – ${rec.checkOut}` : ' (in)'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {staffList.length === 0 && (
              <div className={`px-5 py-8 text-center ${T.faint} text-sm`}>
                No staff added yet
              </div>
            )}
          </div>
        </div>

        {/* ── Monthly calendar ── */}
        {staffList.length > 0 && (
          <MonthCalendar cafeId={cafeId} staffList={staffList} T={T} isLight={isLight} />
        )}

      </div>
    </>
  );
};

export default AttendanceDashboard;
