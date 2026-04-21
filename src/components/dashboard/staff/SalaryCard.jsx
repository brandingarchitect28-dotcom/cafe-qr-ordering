/**
 * SalaryCard.jsx  — THEME-FIXED
 *
 * Every inline style that used rgba(255,255,255,*) — invisible in light mode —
 * is now replaced with isLight-conditional values so text, dividers, borders,
 * and backgrounds are readable in both themes.
 *
 * T prop usage expanded throughout. Nothing structural changed.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Send, CreditCard,
  Smartphone, CheckCircle2, MessageSquare, Copy,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';
import { buildSalarySlip } from '../../../services/salaryEngine';
import { formatWhatsAppNumber } from '../../../utils/whatsapp';
import { useTheme } from '../../../hooks/useTheme';

// ── Stat pill ──────────────────────────────────────────────────────────────────
const Pill = ({ label, value, color, isLight }) => (
  <div className="text-center">
    <p className="text-xl font-black" style={{ color }}>{value}</p>
    <p style={{ color: isLight ? '#666666' : 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</p>
  </div>
);

// ── Breakdown row ──────────────────────────────────────────────────────────────
const BRow = ({ label, amount, type, isLight }) => (
  <div
    className="flex justify-between items-center py-2"
    style={{ borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'}` }}
  >
    <span style={{ color: isLight ? '#444444' : 'rgba(255,255,255,0.6)', fontSize: 13 }}>{label}</span>
    <span
      className="font-bold text-sm"
      style={{ color: type === 'bonus' ? '#10B981' : '#EF4444' }}
    >
      {amount > 0 ? '+' : ''}₹{Math.abs(amount).toLocaleString('en-IN')}
    </span>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
const SalaryCard = ({ sheet, staff, cafeId, cafeName, T, onOverrideChange }) => {
  const { isLight } = useTheme();

  const [open,    setOpen   ] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [bonus,   setBonus  ] = useState(String(sheet.bonus   || 0));
  const [advance, setAdvance] = useState(String(sheet.advance || 0));
  const [marking, setMarking] = useState(false);

  const isPaid = sheet.status === 'paid';

  // ── Mark salary as paid in Firestore ────────────────────────────────────────
  const markPaid = async () => {
    setMarking(true);
    try {
      const salaryDocId = `${cafeId}_${staff.id}_${sheet.month}`;
      await updateDoc(doc(db, 'salary', salaryDocId), {
        status: 'paid',
        paidAt: serverTimestamp(),
      });
      toast.success(`Salary marked as paid for ${sheet.staffName} ✓`);
    } catch (err) {
      toast.error('Failed to mark paid: ' + err.message);
    } finally {
      setMarking(false);
    }
  };

  // ── WhatsApp salary slip ─────────────────────────────────────────────────────
  const sendSlip = () => {
    const msg   = buildSalarySlip(sheet, cafeName);
    const phone = formatWhatsAppNumber(staff.phone || '');
    if (!phone) {
      toast.error('No phone number for this staff member');
      return;
    }
    window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  // ── Copy UPI ID ──────────────────────────────────────────────────────────────
  const copyUPI = () => {
    if (staff.upiId) {
      navigator.clipboard.writeText(staff.upiId).catch(() => {});
      toast.success('UPI ID copied ✓');
    }
  };

  const salaryColor  = sheet.finalSalary >= sheet.baseSalary ? '#10B981' : '#F59E0B';
  const changeAmount = sheet.finalSalary - sheet.baseSalary;

  // Theme-aware inline style helpers
  const dividerColor  = isLight ? 'rgba(0,0,0,0.08)'  : 'rgba(255,255,255,0.05)';
  const detailBg      = isLight ? 'rgba(0,0,0,0.04)'  : 'rgba(255,255,255,0.04)';
  const detailBorder  = isLight ? 'rgba(0,0,0,0.09)'  : 'rgba(255,255,255,0.08)';
  const perDayColor   = isLight ? '#888888'            : 'rgba(255,255,255,0.35)';
  const reasonColor   = isLight ? '#555555'            : 'rgba(255,255,255,0.5)';
  const whyBoxBg      = isLight ? 'rgba(212,175,55,0.06)' : 'rgba(212,175,55,0.05)';
  const whyBoxBorder  = isLight ? 'rgba(212,175,55,0.25)' : 'rgba(212,175,55,0.15)';
  const cardBorder    = isPaid
    ? '1px solid rgba(16,185,129,0.25)'
    : `1px solid ${isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.05)'}`;

  return (
    <div
      className={`${T.card} rounded-xl overflow-hidden`}
      style={{ border: cardBorder }}
    >
      {/* ── Collapsed header (always visible) ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-all hover:bg-black/5`}
      >
        {/* Avatar + name + role */}
        <div className="flex items-center gap-3 text-left">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
            style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}
          >
            {(sheet.staffName || 'S').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className={`${T.heading} font-bold text-sm`}>{sheet.staffName}</p>
            <p className={`${T.faint} text-xs`}>{sheet.role}</p>
          </div>
        </div>

        {/* Final salary + status badge + chevron */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-black text-lg" style={{ color: salaryColor }}>
              ₹{sheet.finalSalary.toLocaleString('en-IN')}
            </p>
            {changeAmount !== 0 && (
              <p
                className="text-xs font-semibold"
                style={{ color: changeAmount > 0 ? '#10B981' : '#EF4444' }}
              >
                {changeAmount > 0 ? '+' : ''}₹{Math.abs(changeAmount).toLocaleString('en-IN')} vs base
              </p>
            )}
          </div>
          <span
            className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
            style={
              isPaid
                ? { color: '#10B981', background: 'rgba(16,185,129,0.12)' }
                : { color: '#F59E0B', background: 'rgba(245,158,11,0.12)' }
            }
          >
            {isPaid ? '✓ Paid' : 'Pending'}
          </span>
          {open
            ? <ChevronUp  className={`w-4 h-4 flex-shrink-0 ${T.faint}`} />
            : <ChevronDown className={`w-4 h-4 flex-shrink-0 ${T.faint}`} />
          }
        </div>
      </button>

      {/* ── Expanded detail ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div
              className="px-5 pb-5 space-y-5"
              style={{ borderTop: `1px solid ${dividerColor}` }}
            >

              {/* ── Attendance summary ── */}
              <div className={`${T.subCard} rounded-xl p-4 mt-4`}>
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-3`}>
                  Attendance
                </p>
                <div className="flex justify-between">
                  <Pill label="Working"  value={sheet.workingDays} color="#6B7280" isLight={isLight} />
                  <Pill label="Present"  value={sheet.presentDays} color="#10B981" isLight={isLight} />
                  <Pill label="Absent"   value={sheet.absentDays}  color="#EF4444" isLight={isLight} />
                  <Pill label="Late"     value={sheet.lateDays}    color="#F59E0B" isLight={isLight} />
                  <Pill label="Half Day" value={sheet.halfDays}    color="#F97316" isLight={isLight} />
                </div>
              </div>

              {/* ── Salary breakdown ── */}
              <div>
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-3`}>
                  Salary Calculation
                </p>
                {/* Base salary row */}
                <div
                  className="flex justify-between py-2"
                  style={{ borderBottom: `1px solid ${dividerColor}` }}
                >
                  <span className={`${T.muted} text-sm`}>Base Salary</span>
                  <span className={`${T.heading} font-bold text-sm`}>
                    ₹{sheet.baseSalary.toLocaleString('en-IN')}
                  </span>
                </div>
                {/* Per-day rate */}
                <div
                  className="flex justify-between py-2 text-xs"
                  style={{
                    borderBottom: `1px solid ${dividerColor}`,
                    color: perDayColor,
                  }}
                >
                  <span>Per day rate</span>
                  <span>₹{sheet.perDay}</span>
                </div>
                {/* Breakdown items */}
                {sheet.breakdown.map((b, i) => (
                  <BRow key={i} {...b} isLight={isLight} />
                ))}
              </div>

              {/* ── Why salary changed ── */}
              {sheet.breakdown.length > 0 && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: whyBoxBg,
                    border:     `1px solid ${whyBoxBorder}`,
                  }}
                >
                  <p className="text-xs font-bold mb-2" style={{ color: '#D4AF37' }}>
                    💡 Why your salary changed this month
                  </p>
                  {sheet.breakdown.map((b, i) => (
                    <p
                      key={i}
                      className="text-xs"
                      style={{ color: reasonColor, lineHeight: '1.8' }}
                    >
                      {b.type === 'deduction' ? '▼' : '▲'} {b.label}{' '}
                      <span
                        style={{
                          color:      b.type === 'bonus' ? '#10B981' : '#EF4444',
                          fontWeight: 700,
                        }}
                      >
                        {b.amount > 0 ? '+' : ''}₹{Math.abs(b.amount).toLocaleString('en-IN')}{' '}
                        {b.type === 'deduction' ? 'deducted' : 'added'}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {/* ── Bonus / Advance overrides ── */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Bonus (₹)',             key: 'bonus',   val: bonus,   set: setBonus,   color: '#10B981' },
                  { label: 'Advance Deduction (₹)', key: 'advance', val: advance, set: setAdvance, color: '#EF4444' },
                ].map(f => (
                  <div key={f.key}>
                    <p className={`${T.muted} text-xs mb-1`}>{f.label}</p>
                    <input
                      type="number"
                      value={f.val}
                      onChange={e => {
                        f.set(e.target.value);
                        onOverrideChange?.(staff.id, {
                          bonus:   f.key === 'bonus'   ? Number(e.target.value) : Number(bonus),
                          advance: f.key === 'advance' ? Number(e.target.value) : Number(advance),
                        });
                      }}
                      className={`w-full ${T.input} rounded-lg px-3 py-2 text-sm outline-none`}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                ))}
              </div>

              {/* ── Final salary banner ── */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{
                  background: 'rgba(212,175,55,0.08)',
                  border:     '1px solid rgba(212,175,55,0.2)',
                }}
              >
                <span className={`${T.heading} font-bold`}>Final Salary</span>
                <span className="text-2xl font-black" style={{ color: '#D4AF37' }}>
                  ₹{sheet.finalSalary.toLocaleString('en-IN')}
                </span>
              </div>

              {/* ── Pay salary button (only if unpaid) ── */}
              {!isPaid && (
                <button
                  onClick={() => setPayOpen(o => !o)}
                  className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff' }}
                >
                  <CreditCard className="w-4 h-4" />
                  Pay Salary — ₹{sheet.finalSalary.toLocaleString('en-IN')}
                </button>
              )}

              {/* ── Payment modal — UPI/bank details inline ── */}
              <AnimatePresence>
                {payOpen && !isPaid && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`${T.subCard} rounded-xl overflow-hidden`}
                  >
                    <div className="p-4 space-y-4">
                      <p className={`${T.heading} font-bold text-sm`}>
                        Payment Details
                      </p>

                      {/* UPI */}
                      {staff.upiId && (
                        <div
                          className="rounded-lg p-3 flex items-center justify-between"
                          style={{
                            background: detailBg,
                            border:     `1px solid ${detailBorder}`,
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Smartphone className="w-5 h-5" style={{ color: '#D4AF37' }} />
                            <div>
                              <p className={`${T.muted} text-xs`}>UPI ID</p>
                              <p className={`${T.heading} font-bold text-sm`}>
                                {staff.upiId}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={copyUPI}
                            className="p-2 rounded-lg transition-all hover:bg-black/10"
                          >
                            <Copy className="w-4 h-4" style={{ color: '#D4AF37' }} />
                          </button>
                        </div>
                      )}

                      {/* Bank details */}
                      {staff.bankDetails && (
                        <div
                          className="rounded-lg p-3 space-y-1"
                          style={{
                            background: detailBg,
                            border:     `1px solid ${detailBorder}`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <CreditCard className="w-4 h-4" style={{ color: '#D4AF37' }} />
                            <p className={`${T.muted} text-xs`}>Bank Transfer</p>
                          </div>
                          {['accountNumber', 'ifsc', 'bankName', 'accountHolder'].map(k =>
                            staff.bankDetails[k] ? (
                              <div key={k} className="flex justify-between text-xs">
                                <span className={T.faint}>
                                  {k.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                <span className={`${T.heading} font-semibold`}>
                                  {staff.bankDetails[k]}
                                </span>
                              </div>
                            ) : null
                          )}
                        </div>
                      )}

                      {!staff.upiId && !staff.bankDetails && (
                        <p className={`${T.faint} text-sm text-center py-2`}>
                          No payment details saved. Add UPI / bank in Staff profile.
                        </p>
                      )}

                      {/* Mark paid + send slip */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={markPaid}
                          disabled={marking}
                          className="py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                          style={{ background: '#10B981', color: '#fff' }}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {marking ? 'Marking…' : 'Mark Paid'}
                        </button>
                        <button
                          onClick={sendSlip}
                          className="py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                          style={{ background: '#25D366', color: '#fff' }}
                        >
                          <MessageSquare className="w-4 h-4" />
                          Send Slip
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Already paid — show resend slip */}
              {isPaid && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={{ color: '#10B981' }}>
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-semibold">Salary Paid</span>
                  </div>
                  <button
                    onClick={sendSlip}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                    style={{ background: '#25D366', color: '#fff' }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Resend Slip
                  </button>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SalaryCard;
