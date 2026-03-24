/**
 * SalaryDashboard.jsx
 * Monthly salary calculation, bonus/advance management, and payment tracking.
 */

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IndianRupee, CheckCircle, RefreshCw, ChevronLeft,
  ChevronRight, Calculator, CreditCard, AlertCircle,
} from 'lucide-react';
import {
  calculateAndSaveSalary, markSalaryPaid, getMonthlySalaries,
} from '../../../services/staffService';
import { toast } from 'sonner';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// ─── Salary Card ──────────────────────────────────────────────────────────────
const SalaryCard = ({ record, onMarkPaid, onRecalculate }) => {
  const [showDetail, setShowDetail] = useState(false);
  const [paying,     setPaying    ] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    try {
      await markSalaryPaid(record.id);
      onMarkPaid(record.id);
      toast.success(`Salary marked as paid for ${record.staffName}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <motion.div whileHover={{ y: -2 }}
      className="bg-[#0F0F0F] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-colors">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center font-black text-[#D4AF37]">
              {record.staffName?.charAt(0)}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{record.staffName}</p>
              {record.isPaid ? (
                <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                  <CheckCircle className="w-3 h-3" />Paid
                </span>
              ) : (
                <span className="text-amber-400 text-xs font-semibold">Pending</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[#D4AF37] font-black text-xl">₹{fmt(record.netSalary)}</p>
            <p className="text-[#555] text-xs">Net salary</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Present', val: record.presentDays, color: '#10B981' },
            { label: 'Absent',  val: record.absentDays,  color: '#EF4444' },
            { label: 'Half-day',val: record.halfDays,     color: '#3B82F6' },
          ].map(s => (
            <div key={s.label} className="text-center p-2 rounded-xl bg-white/3">
              <p className="font-black text-lg" style={{ color: s.color }}>{s.val}</p>
              <p className="text-[#555] text-xs">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Breakdown toggle */}
        <button onClick={() => setShowDetail(v => !v)}
          className="w-full text-[#555] text-xs hover:text-[#A3A3A3] transition-colors mb-3 text-left">
          {showDetail ? '▲ Hide' : '▼ Show'} breakdown
        </button>

        <AnimatePresence>
          {showDetail && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-1.5 text-xs mb-4 p-3 rounded-xl bg-white/3">
                {[
                  { label: 'Base Salary',         val: `+₹${fmt(record.baseSalary)}`,         color: '#10B981' },
                  { label: 'Absent Deduction',    val: `-₹${fmt(record.absentDeduction)}`,    color: '#EF4444' },
                  { label: 'Half-day Deduction',  val: `-₹${fmt(record.halfDayDeduction)}`,   color: '#EF4444' },
                  { label: 'Bonus',               val: `+₹${fmt(record.bonus)}`,              color: '#D4AF37' },
                  { label: 'Advance',             val: `-₹${fmt(record.advance)}`,            color: '#F97316' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-[#555]">{r.label}</span>
                    <span className="font-semibold" style={{ color: r.color }}>{r.val}</span>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold">
                  <span className="text-white">Net Salary</span>
                  <span className="text-[#D4AF37]">₹{fmt(record.netSalary)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex gap-2">
          {!record.isPaid && (
            <button onClick={handlePay} disabled={paying}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
              {paying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Mark Paid
            </button>
          )}
          {record.upiId && (
            <button onClick={() => {
              const msg = `Salary for ${record.month}: ₹${fmt(record.netSalary)}`;
              window.location.href = `upi://pay?pa=${record.upiId}&pn=${record.staffName}&am=${record.netSalary}&tn=${encodeURIComponent(msg)}&cu=INR`;
            }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/20 rounded-xl text-xs font-bold transition-all">
              <CreditCard className="w-3.5 h-3.5" />Pay via UPI
            </button>
          )}
        </div>

        {record.isPaid && record.paidAt && (
          <p className="text-center text-[#555] text-xs mt-2">
            Paid on {record.paidAt?.toDate?.().toLocaleDateString('en-IN') || '—'}
          </p>
        )}
      </div>
    </motion.div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const SalaryDashboard = ({ cafeId }) => {
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), m: now.getMonth() + 1 });
  const [staffList,  setStaffList ] = useState([]);
  const [salaries,   setSalaries  ] = useState([]);
  const [loading,    setLoading   ] = useState(false);
  const [bonus,      setBonus     ] = useState({});
  const [advance,    setAdvance   ] = useState({});
  const [generating, setGenerating] = useState(false);

  const yearMonth = `${month.year}-${String(month.m).padStart(2, '0')}`;
  const monthLabel = new Date(month.year, month.m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Real-time staff
  useEffect(() => {
    if (!cafeId) return;
    return onSnapshot(
      query(collection(db, 'staff'), where('cafeId', '==', cafeId), where('isActive', '==', true)),
      snap => setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [cafeId]);

  // Load salaries for current month
  const loadSalaries = async () => {
    setLoading(true);
    const data = await getMonthlySalaries(cafeId, yearMonth);
    setSalaries(data);
    setLoading(false);
  };

  useEffect(() => { if (cafeId) loadSalaries(); }, [cafeId, yearMonth]);

  const generateAll = async () => {
    setGenerating(true);
    try {
      const results = await Promise.allSettled(
        staffList.map(s => calculateAndSaveSalary(cafeId, s.id, yearMonth, {
          bonus:   parseFloat(bonus[s.id]) || 0,
          advance: parseFloat(advance[s.id]) || 0,
        }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed) toast.error(`${failed} salary calculations failed`);
      else toast.success(`Salaries calculated for ${staffList.length} staff members`);
      await loadSalaries();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const totalPayable = salaries.filter(s => !s.isPaid).reduce((sum, s) => sum + (s.netSalary || 0), 0);
  const totalPaid    = salaries.filter(s => s.isPaid).reduce((sum, s) => sum + (s.netSalary || 0), 0);

  const prev = () => setMonth(m => m.m === 1 ? { year: m.year - 1, m: 12 } : { ...m, m: m.m - 1 });
  const next = () => setMonth(m => m.m === 12 ? { year: m.year + 1, m: 1 } : { ...m, m: m.m + 1 });

  return (
    <div className="space-y-5">
      {/* Month selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prev} className="p-2 rounded-lg hover:bg-white/10 text-[#A3A3A3] transition-all"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-white font-semibold text-sm min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={next} className="p-2 rounded-lg hover:bg-white/10 text-[#A3A3A3] transition-all"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button onClick={generateAll} disabled={generating || staffList.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-xl text-sm transition-all disabled:opacity-50">
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          {generating ? 'Calculating…' : 'Calculate All Salaries'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Payable', val: `₹${fmt(totalPayable)}`, color: '#EF4444' },
          { label: 'Total Paid',    val: `₹${fmt(totalPaid)}`,    color: '#10B981' },
          { label: 'Staff Count',   val: staffList.length,         color: '#D4AF37' },
        ].map(s => (
          <div key={s.label} className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-4">
            <p className="text-[#555] text-xs uppercase tracking-wide mb-1">{s.label}</p>
            <p className="font-black text-xl" style={{ color: s.color }}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Bonus/advance inputs */}
      {staffList.length > 0 && salaries.length === 0 && (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-4">Bonus & Advance (before calculating)</p>
          <div className="space-y-3">
            {staffList.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-white text-sm w-32 truncate">{s.name}</span>
                <div className="flex gap-2 flex-1">
                  <input type="number" min="0" placeholder="Bonus ₹"
                    value={bonus[s.id] || ''}
                    onChange={e => setBonus(b => ({ ...b, [s.id]: e.target.value }))}
                    className="flex-1 bg-black/20 border border-white/10 text-white rounded-lg h-9 px-3 text-sm outline-none focus:border-[#D4AF37] placeholder:text-neutral-600" />
                  <input type="number" min="0" placeholder="Advance ₹"
                    value={advance[s.id] || ''}
                    onChange={e => setAdvance(a => ({ ...a, [s.id]: e.target.value }))}
                    className="flex-1 bg-black/20 border border-white/10 text-white rounded-lg h-9 px-3 text-sm outline-none focus:border-[#D4AF37] placeholder:text-neutral-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salary cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-48 rounded-2xl bg-white/3 animate-pulse" style={{ animationDelay: `${i*80}ms` }} />)}
        </div>
      ) : salaries.length === 0 ? (
        <div className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-12 text-center">
          <Calculator className="w-12 h-12 text-[#333] mx-auto mb-3" />
          <p className="text-[#A3A3A3] text-sm">No salary records for {monthLabel}</p>
          <p className="text-[#555] text-xs mt-1">Click "Calculate All Salaries" to generate</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {salaries.map(rec => (
            <SalaryCard key={rec.id} record={rec}
              onMarkPaid={() => loadSalaries()}
              onRecalculate={() => loadSalaries()}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SalaryDashboard;
