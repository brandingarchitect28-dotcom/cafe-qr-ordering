/**
 * SalaryDashboard.jsx
 *
 * Main salary management tab.
 * - Month picker
 * - "Calculate All Salaries" — reads attendance from Firestore, runs salaryEngine
 * - SalaryCard per staff member (expandable)
 * - Bonus / advance overrides
 * - Save all sheets to Firestore
 *
 * ADD: salary calculation logic
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Calculator, RefreshCw, Save, TrendingDown,
  IndianRupee, CheckCircle2, FileDown, Search,
} from 'lucide-react';
import {
  collection, query, where, getDocs,
  doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { useDocument } from '../../../hooks/useFirestore';
import { toast } from 'sonner';
import {
  calculateAllSalaries, toDateKey,
} from '../../../services/salaryEngine';
import SalaryCard from './SalaryCard';
import { useTheme } from '../../../hooks/useTheme';

// ── Helpers ────────────────────────────────────────────────────────────────────
const todayYM = () => toDateKey(new Date()).slice(0, 7);

const monthLabel = (ym) =>
  new Date(ym + '-01').toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  });

// ── Main component ─────────────────────────────────────────────────────────────
const SalaryDashboard = ({ staffList = [] }) => {
  const { user }       = useAuth();
  const cafeId         = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T }          = useTheme();

  const [yearMonth,   setYearMonth  ] = useState(todayYM());
  const [sheets,      setSheets     ] = useState([]);
  const [calculating, setCalculating] = useState(false);
  const [saving,      setSaving     ] = useState(false);
  const [overrides,   setOverrides  ] = useState({}); // { [staffId]: { bonus, advance } }

  // ── Search ───────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const filteredSheets = sheets.filter(s =>
    s.staffName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Export CSV ───────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!sheets.length) { toast.error('Calculate salaries first.'); return; }
    const rows = [
      ['Name', 'Role', 'Base Salary', 'Final Salary', 'Deductions', 'Status'],
      ...sheets.map(s => [
        s.staffName,
        s.role,
        s.baseSalary,
        s.finalSalary,
        s.totalDeductions,
        s.status === 'paid' ? 'Paid' : 'Pending',
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `salary-${yearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Summary totals for strip ─────────────────────────────────────────────────
  const totals = sheets.reduce(
    (acc, s) => ({
      payroll:    acc.payroll    + s.finalSalary,
      deductions: acc.deductions + s.totalDeductions,
      paid:       acc.paid       + (s.status === 'paid' ? 1 : 0),
    }),
    { payroll: 0, deductions: 0, paid: 0 }
  );

  // ── Handle override change bubbled up from SalaryCard ───────────────────────
  const handleOverrideChange = useCallback((staffId, vals) => {
    setOverrides(prev => ({ ...prev, [staffId]: vals }));
  }, []);

  // ── Fetch attendance + run engine ────────────────────────────────────────────
  const runCalculation = async (currentOverrides = overrides) => {
    if (!staffList.length) {
      toast.error('No staff found. Add staff first.');
      return;
    }
    setCalculating(true);
    try {
      // Query by cafeId only, then filter by month in JS
      // (avoids requiring a cafeId+month composite index on 'attendance')
      const attSnap = await getDocs(
        query(
          collection(db, 'attendance'),
          where('cafeId', '==', cafeId)
        )
      );
      const allAtt = attSnap.docs
        .map(d => d.data())
        .filter(a => a.month === yearMonth);

      // Group by staffId
      const attByStaff = {};
      allAtt.forEach(a => {
        if (!attByStaff[a.staffId]) attByStaff[a.staffId] = [];
        attByStaff[a.staffId].push(a);
      });

      // ADD: run salary engine for all staff
      const results = calculateAllSalaries(
        staffList, attByStaff, yearMonth, currentOverrides
      );

      // Merge paid status from existing Firestore salary docs
      // Query by cafeId only, then filter by month in JS
      // (avoids requiring a cafeId+month composite index on 'salary')
      const salarySnap = await getDocs(
        query(
          collection(db, 'salary'),
          where('cafeId', '==', cafeId)
        )
      );
      const paidMap = {};
      salarySnap.docs.forEach(d => {
        const data = d.data();
        if (data.staffId && data.month === yearMonth) paidMap[data.staffId] = data.status;
      });

      const merged = results.map(r => ({
        ...r,
        status: paidMap[r.staffId] || 'pending',
      }));

      setSheets(merged);
      toast.success(`Salary calculated for ${merged.length} staff ✓`);
    } catch (err) {
      console.error('[SalaryDashboard]', err.message);
      toast.error('Calculation failed: ' + err.message);
    } finally {
      setCalculating(false);
    }
  };

  const calculateAll = () => runCalculation(overrides);

  const recalculate = async () => {
    if (!sheets.length) { await calculateAll(); return; }
    await runCalculation(overrides);
  };

  // ── Save all sheets to Firestore ─────────────────────────────────────────────
  const saveAll = async () => {
    if (!sheets.length) { toast.error('Calculate salaries first.'); return; }
    setSaving(true);
    try {
      await Promise.all(
        sheets.map(sheet => {
          const docId = `${cafeId}_${sheet.staffId}_${sheet.month}`;
          return setDoc(
            doc(db, 'salary', docId),
            { ...sheet, cafeId, savedAt: serverTimestamp() },
            { merge: true }
          );
        })
      );
      toast.success('All salary sheets saved ✓');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            className={`${T?.heading || 'text-white'} font-bold text-2xl`}
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Salary Management
          </h2>
          <p className={`${T?.muted || 'text-[#A3A3A3]'} text-sm mt-1`}>
            {staffList.length} staff · {monthLabel(yearMonth)}
          </p>
        </div>

        {/* Month picker */}
        <input
          type="month"
          value={yearMonth}
          max={todayYM()}
          onChange={e => { setYearMonth(e.target.value); setSheets([]); }}
          className="bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm h-9 outline-none focus:border-[#D4AF37]"
        />
      </div>

      {/* ── Search bar ── */}
      {sheets.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search employee..."
            className="w-full bg-black/20 border border-white/10 text-white placeholder:text-[#555] rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-[#D4AF37] transition-all"
          />
        </div>
      )}

      {/* ── Summary strip (after calculation) ── */}
      {sheets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            {
              label: 'Total Payroll',
              val:   `₹${totals.payroll.toLocaleString('en-IN')}`,
              icon:  IndianRupee,
              color: '#D4AF37',
            },
            {
              label: 'Total Deductions',
              val:   `₹${totals.deductions.toLocaleString('en-IN')}`,
              icon:  TrendingDown,
              color: '#EF4444',
            },
            {
              label: 'Paid',
              val:   `${totals.paid} / ${sheets.length}`,
              icon:  CheckCircle2,
              color: '#10B981',
            },
          ].map((s, i) => (
            <div key={i} className={`${T?.card || 'bg-[#0F0F0F]'} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`${T?.muted || 'text-[#A3A3A3]'} text-xs`}>{s.label}</p>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <p className="font-black text-lg" style={{ color: s.color }}>{s.val}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex gap-2 flex-wrap">
        {/* ADD: calculate all salaries button */}
        <button
          onClick={calculateAll}
          disabled={calculating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 text-black"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#B8902A)' }}
        >
          <Calculator className={`w-4 h-4 ${calculating ? 'animate-spin' : ''}`} />
          {calculating
            ? 'Calculating…'
            : sheets.length
              ? 'Recalculate All'
              : 'Calculate All Salaries'
          }
        </button>

        {sheets.length > 0 && (
          <>
            <button
              onClick={recalculate}
              disabled={calculating}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border ${T?.borderMd || 'border-white/10'} ${T?.subCard || 'bg-white/5'} ${T?.muted || 'text-[#A3A3A3]'} hover:text-white transition-all disabled:opacity-50`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Apply Overrides
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save All Sheets'}
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </>
        )}
      </div>

      {/* ── Empty state ── */}
      {sheets.length === 0 && !calculating && (
        <div className={`${T?.card || 'bg-[#0F0F0F]'} rounded-xl p-12 text-center`}>
          <Calculator
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: 'rgba(212,175,55,0.3)' }}
          />
          <p className={`${T?.heading || 'text-white'} font-semibold mb-1`}>
            No salary data yet
          </p>
          <p className={`${T?.muted || 'text-[#A3A3A3]'} text-sm`}>
            Click{' '}
            <strong style={{ color: '#D4AF37' }}>Calculate All Salaries</strong>{' '}
            to generate salary sheets for {monthLabel(yearMonth)}.
          </p>
          <p className={`${T?.faint || 'text-[#555]'} text-xs mt-2`}>
            Attendance data is read automatically — no manual entry needed.
          </p>
        </div>
      )}

      {/* ── Salary cards ── */}
      {sheets.length > 0 && (
        <div className="space-y-3">
          {filteredSheets.length === 0 ? (
            <p className={`${T?.muted || 'text-[#A3A3A3]'} text-sm text-center py-6`}>
              No staff match "{searchQuery}"
            </p>
          ) : filteredSheets.map(sheet => {
            const staff = staffList.find(s => s.id === sheet.staffId) || {};
            return (
              <SalaryCard
                key={sheet.staffId}
                sheet={sheet}
                staff={{ ...staff, id: sheet.staffId }}
                cafeId={cafeId}
                cafeName={cafe?.name || 'the café'}
                T={T}
                onOverrideChange={handleOverrideChange}
              />
            );
          })}
        </div>
      )}

    </div>
  );
};

export default SalaryDashboard;
