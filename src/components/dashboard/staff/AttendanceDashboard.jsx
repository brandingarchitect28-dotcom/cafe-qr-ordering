/**
 * AttendanceDashboard.jsx
 *
 * Shows today's attendance summary, QR scanner for check-in/out,
 * manual check-in selector, and a per-staff monthly calendar.
 *
 * ADD: attendance check-in/out logic
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
// Uses device camera via getUserMedia + BarcodeDetector API.
// QR value format: STAFF_ATTENDANCE|cafeId|staffId
const QRScannerModal = ({ cafeId, staffList, onClose }) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden w-full max-w-sm"
        initial={{ scale: 0.9 }} animate={{ scale: 1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-white font-semibold text-sm">Scan Attendance QR</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-[#A3A3A3]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera */}
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 relative">
              {/* Corner markers */}
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
              {/* Scanning line */}
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
          <p className="text-sm text-white">{message}</p>
          {!('BarcodeDetector' in window) && status === 'scanning' && (
            <p className="text-[#555] text-xs mt-1">
              QR scanning not supported in this browser — use manual check-in below
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Monthly calendar (per-staff mini view) ─────────────────────────────────────
const MonthCalendar = ({ cafeId, staffList }) => {
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

  return (
    <div className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={prev} className="p-2 rounded-lg hover:bg-white/10 text-[#A3A3A3] transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-white font-semibold text-sm min-w-[140px] text-center">{label}</span>
          <button onClick={next} className="p-2 rounded-lg hover:bg-white/10 text-[#A3A3A3] transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <select
          value={selectedStaff}
          onChange={e => setSelectedStaff(e.target.value)}
          className="bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-[#D4AF37] cursor-pointer"
        >
          {staffList.map(s => (
            <option key={s.id} value={s.id} className="bg-[#0F0F0F]">{s.name}</option>
          ))}
        </select>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[#555] text-xs font-semibold py-1">{d}</div>
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
                background: s     ? s.bg
                          : isToday ? 'rgba(212,175,55,0.1)'
                          : 'transparent',
                color:      s     ? s.color
                          : isToday ? '#D4AF37'
                          : '#555',
                border:     isToday && !s ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
              }}
              title={rec ? `${rec.checkIn || ''}${rec.checkOut ? ` – ${rec.checkOut}` : ''} (${rec.status})` : ''}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/5">
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: v.color }} />
            <span className="text-[#555] text-xs">{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const AttendanceDashboard = ({ cafeId }) => {
  const [staffList,   setStaffList  ] = useState([]);
  const [todayRecs,   setTodayRecs  ] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [manualId,    setManualId   ] = useState('');
  const today = toDateKey();

  // Real-time staff — own listener so component is self-contained
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
              className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-4"
            >
              <p className="text-[#555] text-xs uppercase tracking-wide mb-1">{s.label}</p>
              <p className="font-black text-2xl" style={{ color: s.color }}>{s.val}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Mark Attendance controls ── */}
        <div className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-4">Mark Attendance</p>
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
                className="flex-1 bg-black/20 border border-white/10 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                <option value="" className="bg-[#0F0F0F]">— Manual check-in —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id} className="bg-[#0F0F0F]">{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleManualCheckIn}
                disabled={!manualId}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              >
                Go
              </button>
            </div>
          </div>
        </div>

        {/* ── Today's attendance list ── */}
        <div className="bg-[#0F0F0F] border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="text-white font-semibold text-sm">
              Today — {new Date().toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          </div>
          <div className="divide-y divide-white/5">
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
                      <p className="text-white text-sm font-medium">{s.name}</p>
                      <p className="text-[#555] text-xs">{s.role}</p>
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
                      <p className="text-[#555] text-xs mt-0.5">
                        {rec.checkIn}{rec.checkOut ? ` – ${rec.checkOut}` : ' (in)'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {staffList.length === 0 && (
              <div className="px-5 py-8 text-center text-[#555] text-sm">
                No staff added yet
              </div>
            )}
          </div>
        </div>

        {/* ── Monthly calendar ── */}
        {staffList.length > 0 && (
          <MonthCalendar cafeId={cafeId} staffList={staffList} />
        )}

      </div>
    </>
  );
};

export default AttendanceDashboard;
