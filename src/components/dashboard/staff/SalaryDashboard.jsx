/**
 * SalaryDashboard.jsx
 *
 * Main salary management tab.
 * - Month picker
 * - "Calculate All Salaries" button — one click, full salary sheet for everyone
 * - SalaryCard per staff member (expandable)
 * - Bonus / advance overrides per staff
 * - Save all sheets to Firestore
 *
 * Drop-in upgrade: replaces the existing SalaryDashboard.jsx.
 * Same props interface, same T theme object.
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Calculator, RefreshCw, Save, TrendingDown,
  Users, IndianRupee, CheckCircle2,
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

const prevMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

// ── Main component ─────────────────────────────────────────────────────────────
const SalaryDashboard = ({ staffList = [] }) => {
  const { user }          = useAuth();
  const cafeId            = user?.cafeId;
  const { data: cafe }    = useDocument('cafes', cafeId);
  const { T }             = useTheme();

  const [yearMonth,    setYearMonth   ] = useState(todayYM());
  const [sheets,       setSheets      ] = useState([]);
  const [calculating,  setCalculating ] = useState(false);
  const [saving,       setSaving      ] = useState(false);
  const [overrides,    setOverrides   ] = useState({}); // { [staffId]: { bonus, advance } }

  // ── Totals for summary strip ─────────────────────────────────────────────────
  const totals = sheets.reduce(
    (acc, s) => ({
      payroll:     acc.payroll     + s.finalSalary,
      deductions:  acc.deductions  + s.totalDeductions,
      paid:        acc.paid        + (s.status === 'paid' ? 1 : 0),
    }),
    { payroll: 0, deductions: 0, paid: 0 }
  );

  // ── Handle override change from SalaryCard ───────────────────────────────────
  const handleOverrideChange = useCallback((staffId, vals) => {
    setOverrides(prev => ({ ...prev, [staffId]: vals }));
  }, []);

  // ── Calculate All Salaries ───────────────────────────────────────────────────
  const calculateAll = async () => {
    if (!staffList.length) {
      toast.error('No staff found. Add staff first.');
      return;
    }
    setCalculating(true);
    try {
      // Fetch all attendance for this cafe + month in one query
      const attSnap = await getDocs(
        query(
          collection(db, 'attendance'),
          where('cafeId', '==', cafeId),
          where('month',  '==', yearMonth)
        )
      );
      const allAtt = attSnap.docs.map(d => d.data());

      // Group attendance by staffId
      const attByStaff = {};
      allAtt.forEach(a => {
        if (!attByStaff[a.staffId]) attByStaff[a.staffId] = [];
        attByStaff[a.staffId].push(a);
      });

      // Run engine
      const results = calculateAllSalaries(
        staffList, attByStaff, yearMonth, overrides
      );

      setSheets(results);
      toast.success(`Salary calculated for ${results.length} staff ✓`);
    } catch (err) {
      console.error('[SalaryDashboard]', err.message);
      toast.error('Calculation failed: ' + err.message);
    } finally {
      setCalculating(false);
    }
  };

  // ── Recalculate with new overrides ───────────────────────────────────────────
  const recalculate = async () => {
    if (!sheets.length) { await calculateAll(); return; }
    setCalculating(true);
    try {
      const attSnap = await getDocs(
        query(
          collection(db, 'attendance'),
          where('cafeId', '==', cafeId),
          where('month',  '==', yearMonth)
        )
      );
      const allAtt = attSnap.docs.map(d => d.data());
      const attByStaff = {};
      allAtt.forEach(a => {
        if (!attByStaff[a.staffId]) attByStaff[a.staffId] = [];
        attByStaff[a.staffId].push(a);
      });
      const results = calculateAllSalaries(staffList, attByStaff, yearMonth, overrides);
      setSheets(results);
      toast.success('Salaries recalculated ✓');
    } catch (err) {
      toast.error('Recalculation failed: ' + err.message);
    } finally {
      setCalculating(false);
    }
  };

  // ── Save all sheets to Firestore ─────────────────────────────────────────────
  const saveAll = async () => {
    if (!sheets.length) {
      toast.error('Calculate salaries first.');
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        sheets.map(sheet => {
          const docId = `${cafeId}_${sheet.staffId}_${sheet.month}`;
          return setDoc(doc(db, 'salary', docId), {
            ...sheet,
            cafeId,
            savedAt: serverTimestamp(),
          }, { merge: true });
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
          <h2 className={`${T.heading} font-bold text-2xl`}
            style={{ fontFamily: 'Playfair Display, serif' }}>
            Salary Management
          </h2>
          <p className={`${T.muted} text-sm mt-1`}>
            {staffList.length} staff · {monthLabel(yearMonth)}
          </p>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            max={todayYM()}
            onChange={e => { setYearMonth(e.target.value); setSheets([]); }}
            className={`${T.input} rounded-lg px-3 py-2 text-sm h-9`}
          />
        </div>
      </div>

      {/* ── Summary strip (only after calculation) ── */}
      {sheets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: 'Total Payroll',  val: `₹${totals.payroll.toLocaleString('en-IN')}`,     icon: IndianRupee, color: '#D4A843' },
            { label: 'Total Deductions', val: `₹${totals.deductions.toLocaleString('en-IN')}`, icon: TrendingDown, color: '#EF4444' },
            { label: 'Paid',           val: `${totals.paid} / ${sheets.length}`,              icon: CheckCircle2, color: '#10B981' },
          ].map((s, i) => (
            <div key={i} className={`${T.card} rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`${T.muted} text-xs`}>{s.label}</p>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <p className="font-black text-lg" style={{ color: s.color }}>{s.val}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={calculateAll}
          disabled={calculating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 text-black"
          style={{ background: 'linear-gradient(135deg, #D4A843, #B8902A)' }}
        >
          <Calculator className={`w-4 h-4 ${calculating ? 'animate-spin' : ''}`} />
          {calculating ? 'Calculating…' : sheets.length ? 'Recalculate All' : 'Calculate All Salaries'}
        </button>

        {sheets.length > 0 && (
          <>
            <button
              onClick={recalculate}
              disabled={calculating}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border ${T.borderMd} ${T.subCard} ${T.muted} hover:text-white transition-all disabled:opacity-50`}
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
          </>
        )}
      </div>

      {/* ── Empty state ── */}
      {sheets.length === 0 && !calculating && (
        <div className={`${T.card} rounded-xl p-12 text-center`}>
          <Calculator className={`w-12 h-12 mx-auto mb-4`} style={{ color: 'rgba(212,168,67,0.3)' }} />
          <p className={`${T.heading} font-semibold mb-1`}>No salary data yet</p>
          <p className={`${T.muted} text-sm`}>
            Click <strong style={{ color: '#D4A843' }}>Calculate All Salaries</strong> to generate
            salary sheets for {monthLabel(yearMonth)}.
          </p>
          <p className={`${T.faint} text-xs mt-2`}>
            Attendance data is read automatically — no manual entry needed.
          </p>
        </div>
      )}

      {/* ── Salary cards ── */}
      {sheets.length > 0 && (
        <div className="space-y-3">
          {sheets.map((sheet) => {
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
