/**
 * salaryEngine.js
 *
 * Pure calculation engine for staff salary computation.
 * No Firebase imports — takes plain data objects, returns plain data objects.
 * Called by SalaryDashboard after fetching attendance from Firestore.
 *
 * Exports:
 *   STATUS           — attendance status constants
 *   toDateKey        — Date → 'YYYY-MM-DD'
 *   daysInMonth      — 'YYYY-MM' → ['YYYY-MM-DD', ...]
 *   deriveStatus     — attendance record → STATUS value
 *   calculateAllSalaries — main batch calculation
 *   buildSalarySlip  — WhatsApp message string builder
 */

// ADD: salary calculation logic

// ── Status constants ───────────────────────────────────────────────────────────
export const STATUS = {
  PRESENT:  'present',
  ABSENT:   'absent',
  LATE:     'late',
  HALF_DAY: 'half-day',
};

// ── Date helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a Date (or use today) to a 'YYYY-MM-DD' string.
 * Safe for use as Firestore document key.
 */
export const toDateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

/**
 * Return an array of 'YYYY-MM-DD' strings for every calendar day in the month.
 * @param {string} yearMonth  'YYYY-MM'
 */
export const daysInMonth = (yearMonth) => {
  const [year, month] = yearMonth.split('-').map(Number);
  const count = new Date(year, month, 0).getDate(); // last day of month
  const days  = [];
  for (let d = 1; d <= count; d++) {
    days.push(`${yearMonth}-${String(d).padStart(2, '0')}`);
  }
  return days;
};

// ── Status derivation ──────────────────────────────────────────────────────────

/**
 * Given an attendance record (or null), return the canonical STATUS value.
 * Used by AttendanceCalendar to colour each calendar cell.
 *
 * @param {object|null} record  Firestore attendance doc data
 * @returns {string}  one of STATUS.*
 */
export const deriveStatus = (record) => {
  if (!record) return STATUS.ABSENT;
  if (record.status) return record.status; // trust stored status
  // Fallback derivation from raw check-in data
  if (!record.checkIn) return STATUS.ABSENT;
  if (record.lateMinutes > 30) return STATUS.LATE;
  return STATUS.PRESENT;
};

// ── Salary calculation ─────────────────────────────────────────────────────────

/**
 * Calculate the salary sheet for a single staff member.
 *
 * @param {object}   staff        Staff document { id, name, role, salaryType, salaryAmount, shiftStart, ... }
 * @param {object[]} attendance   Array of attendance records for this staff this month
 * @param {string}   yearMonth    'YYYY-MM'
 * @param {object}   overrides    { bonus?: number, advance?: number }
 *
 * @returns {object} salary sheet
 */
export const calculateSalary = (staff, attendance = [], yearMonth, overrides = {}) => {
  const safeNum = (v, fallback = 0) => {
    const n = parseFloat(v);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  };

  // ── Base salary params ──────────────────────────────────────────────────────
  const baseSalary    = safeNum(staff.salaryAmount, 0);
  const allDays       = daysInMonth(yearMonth);
  const today         = toDateKey(new Date());

  // Count working days (Mon–Sat, excluding Sundays, up to today or month end)
  const workingDays = allDays.filter(date => {
    if (date > today) return false;           // future days excluded
    return new Date(date).getDay() !== 0;     // 0 = Sunday
  }).length;

  // Per-day rate based on calendar working days (26-day month convention)
  const workingDaysInMonth = allDays.filter(
    date => new Date(date).getDay() !== 0
  ).length;
  const perDay = workingDaysInMonth > 0
    ? Math.round(baseSalary / workingDaysInMonth)
    : 0;

  // ── Build attendance map for O(1) lookup ────────────────────────────────────
  const attMap = {};
  attendance.forEach(rec => { if (rec.date) attMap[rec.date] = rec; });

  // ── Count each status ────────────────────────────────────────────────────────
  let presentDays = 0;
  let absentDays  = 0;
  let lateDays    = 0;
  let halfDays    = 0;

  allDays.forEach(date => {
    if (date > today) return;                 // skip future
    if (new Date(date).getDay() === 0) return; // skip Sundays

    const rec    = attMap[date];
    const status = rec ? deriveStatus(rec) : STATUS.ABSENT;

    switch (status) {
      case STATUS.PRESENT:  presentDays++; break;
      case STATUS.LATE:     presentDays++; lateDays++; break;  // late = present + penalty
      case STATUS.HALF_DAY: halfDays++;   break;
      case STATUS.ABSENT:   absentDays++; break;
      default: break;
    }
  });

  // ── Salary deduction / addition breakdown ───────────────────────────────────

  // Absent deduction: absent days × per-day rate
  const absentDeduction = absentDays * perDay;

  // Half-day deduction: half days × half per-day rate
  const halfDayDeduction = halfDays * Math.round(perDay / 2);

  // Late penalty: configurable per-late-occurrence penalty
  // Default: ₹50 per late occurrence; can be overridden from cafe settings
  const latePenalty     = safeNum(staff.latePenalty, 50);
  const lateDeduction   = lateDays * latePenalty;

  // Bonus and advance from overrides
  const bonus   = safeNum(overrides.bonus,   0);
  const advance = safeNum(overrides.advance, 0);

  // ── Build breakdown array (used by SalaryCard UI) ───────────────────────────
  const breakdown = [];

  if (absentDays > 0) {
    breakdown.push({
      label:  `${absentDays} absent day${absentDays !== 1 ? 's' : ''} × ₹${perDay}/day`,
      amount: -absentDeduction,
      type:   'deduction',
    });
  }
  if (halfDays > 0) {
    breakdown.push({
      label:  `${halfDays} half-day${halfDays !== 1 ? 's' : ''} × ₹${Math.round(perDay / 2)}/day`,
      amount: -halfDayDeduction,
      type:   'deduction',
    });
  }
  if (lateDays > 0) {
    breakdown.push({
      label:  `${lateDays} late arrival${lateDays !== 1 ? 's' : ''} × ₹${latePenalty} penalty`,
      amount: -lateDeduction,
      type:   'deduction',
    });
  }
  if (bonus > 0) {
    breakdown.push({
      label:  'Bonus',
      amount: bonus,
      type:   'bonus',
    });
  }
  if (advance > 0) {
    breakdown.push({
      label:  'Advance deduction',
      amount: -advance,
      type:   'deduction',
    });
  }

  // ── Final totals ─────────────────────────────────────────────────────────────
  const totalDeductions = absentDeduction + halfDayDeduction + lateDeduction + advance;
  const finalSalary     = Math.max(0, Math.round(baseSalary - totalDeductions + bonus));

  return {
    // Identity
    staffId:    staff.id,
    staffName:  staff.name || '',
    role:       staff.role || '',
    month:      yearMonth,

    // Salary params
    baseSalary,
    perDay,
    workingDays,

    // Attendance counts
    presentDays,
    absentDays,
    lateDays,
    halfDays,

    // Breakdown for UI
    breakdown,
    totalDeductions,
    bonus,
    advance,
    finalSalary,

    // Payment status — updated by SalaryCard / Firestore
    status: 'pending',
  };
};

/**
 * Batch-calculate salaries for all staff members.
 *
 * @param {object[]} staffList     Array of staff documents
 * @param {object}   attByStaff   { [staffId]: attendanceRecord[] }
 * @param {string}   yearMonth    'YYYY-MM'
 * @param {object}   overrides    { [staffId]: { bonus, advance } }
 *
 * @returns {object[]} array of salary sheets
 */
export const calculateAllSalaries = (
  staffList  = [],
  attByStaff = {},
  yearMonth,
  overrides  = {}
) =>
  staffList.map(staff =>
    calculateSalary(
      staff,
      attByStaff[staff.id] || [],
      yearMonth,
      overrides[staff.id]  || {}
    )
  );

// ── WhatsApp salary slip builder ───────────────────────────────────────────────

/**
 * Build a formatted WhatsApp salary slip message string.
 * Used by SalaryCard → "Send Slip" button.
 *
 * @param {object} sheet     Salary sheet (from calculateSalary)
 * @param {string} cafeName  Cafe display name
 * @returns {string}         Multi-line WhatsApp message
 */
export const buildSalarySlip = (sheet, cafeName = '') => {
  const LINE = '─────────────────────────';
  const cur  = '₹';
  const mo   = sheet.month
    ? new Date(sheet.month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '';

  const lines = [];

  lines.push(`💰 *Salary Slip — ${mo}*`);
  if (cafeName) lines.push(`🏪 ${cafeName}`);
  lines.push('');

  lines.push(LINE);
  lines.push(`👤 *${sheet.staffName}*`);
  lines.push(`   Role: ${sheet.role}`);
  lines.push('');

  lines.push(LINE);
  lines.push('📅 *Attendance Summary*');
  lines.push('');
  lines.push(`   Present Days:  ${sheet.presentDays}`);
  lines.push(`   Absent Days:   ${sheet.absentDays}`);
  lines.push(`   Late:          ${sheet.lateDays}`);
  lines.push(`   Half Days:     ${sheet.halfDays}`);
  lines.push('');

  lines.push(LINE);
  lines.push('💵 *Salary Calculation*');
  lines.push('');
  lines.push(`   Base Salary:   ${cur}${sheet.baseSalary.toLocaleString('en-IN')}`);
  lines.push(`   Per Day Rate:  ${cur}${sheet.perDay}`);

  if (sheet.breakdown.length > 0) {
    lines.push('');
    sheet.breakdown.forEach(b => {
      const sign = b.type === 'bonus' ? '+' : '-';
      lines.push(`   ${sign} ${b.label}: ${cur}${Math.abs(b.amount).toLocaleString('en-IN')}`);
    });
  }

  lines.push('');
  lines.push(LINE);
  lines.push(`✅ *Final Salary: ${cur}${sheet.finalSalary.toLocaleString('en-IN')}*`);
  lines.push(LINE);
  lines.push('');

  if (cafeName) {
    lines.push(`Thank you for your service at *${cafeName}* 🙏`);
  } else {
    lines.push('Thank you for your service 🙏');
  }
  lines.push('_Powered by SmartCafé OS_');

  return lines.join('\n');
};
