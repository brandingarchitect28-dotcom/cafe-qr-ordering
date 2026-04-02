/**
 * salaryEngine.js
 *
 * Pure salary calculation functions.
 * No Firebase calls, no UI — just math.
 * Import anywhere: component, Cloud Function, test.
 *
 * Firestore data model used:
 *
 *   staff/{staffId}
 *     name, role, baseSalary, shiftStartTime ('09:00'),
 *     lateGraceMinutes (15), latePenaltyPerOccurrence (50),
 *     cafeId, phone, upiId, bankDetails, joiningDate
 *
 *   attendance/{cafeId}_{staffId}_{YYYY-MM-DD}
 *     staffId, cafeId, date ('YYYY-MM-DD'),
 *     checkIn (ISO string | null), checkOut (ISO string | null),
 *     status ('present'|'absent'|'late'|'half_day'),
 *     lateMinutes (number), note (string)
 *
 *   salary/{cafeId}_{staffId}_{YYYY-MM}
 *     staffId, cafeId, month ('YYYY-MM'),
 *     baseSalary, workingDays, presentDays, absentDays,
 *     lateDays, halfDays, absentDeduction, lateDeduction,
 *     bonus, advance, finalSalary, breakdown[], status,
 *     generatedAt, paidAt
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS = {
  PRESENT:   'present',
  ABSENT:    'absent',
  LATE:      'late',
  HALF_DAY:  'half_day',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' for any Date */
export const toDateKey = (d) =>
  d.toISOString().split('T')[0];

/** Array of 'YYYY-MM-DD' strings for every day in a given month */
export const daysInMonth = (yearMonth) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${yearMonth}-${day}`;
  });
};

/** Number of working days (Mon–Sat) in a month */
export const workingDaysInMonth = (yearMonth) =>
  daysInMonth(yearMonth).filter(d => {
    const dow = new Date(d).getDay(); // 0=Sun
    return dow !== 0; // exclude Sunday
  }).length;

// ─── Attendance logic ─────────────────────────────────────────────────────────

/**
 * Derive attendance status from raw check-in time.
 * @param {string|null} checkInISO  ISO timestamp or null
 * @param {string}      shiftStart  '09:00'
 * @param {number}      graceMinutes  default 15
 * @returns {{ status, lateMinutes }}
 */
export const deriveStatus = (checkInISO, shiftStart = '09:00', graceMinutes = 15) => {
  if (!checkInISO) return { status: STATUS.ABSENT, lateMinutes: 0 };

  const checkIn   = new Date(checkInISO);
  const [sh, sm]  = shiftStart.split(':').map(Number);

  // Build shift start as same date as checkIn
  const shift = new Date(checkIn);
  shift.setHours(sh, sm + graceMinutes, 0, 0); // grace window

  if (checkIn <= shift) return { status: STATUS.PRESENT, lateMinutes: 0 };

  const lateMinutes = Math.round((checkIn - shift) / 60000);
  return { status: STATUS.LATE, lateMinutes };
};

// ─── Salary engine ────────────────────────────────────────────────────────────

/**
 * Calculate full salary for one staff member for one month.
 *
 * @param {object} staff         — staff document data
 * @param {object[]} attendances — attendance docs for this staff this month
 * @param {string} yearMonth     — 'YYYY-MM'
 * @param {object} overrides     — { bonus: 0, advance: 0 } from owner input
 * @returns {object}             — complete salary sheet
 */
export const calculateSalary = (staff, attendances, yearMonth, overrides = {}) => {
  const {
    baseSalary         = 0,
    shiftStartTime     = '09:00',
    lateGraceMinutes   = 15,
    latePenaltyPerOccurrence = 50,
  } = staff;

  const bonus   = Number(overrides.bonus   ?? 0);
  const advance = Number(overrides.advance ?? 0);

  // Build a map of date → attendance record
  const attMap = {};
  attendances.forEach(a => { attMap[a.date] = a; });

  const allDays     = daysInMonth(yearMonth);
  const workingDays = allDays.filter(d => new Date(d).getDay() !== 0); // no Sundays

  let presentDays = 0;
  let absentDays  = 0;
  let lateDays    = 0;
  let halfDays    = 0;

  workingDays.forEach(date => {
    const rec    = attMap[date];
    const status = rec?.status ?? STATUS.ABSENT;

    if (status === STATUS.PRESENT) presentDays++;
    else if (status === STATUS.ABSENT)   absentDays++;
    else if (status === STATUS.LATE)   { presentDays++; lateDays++; }
    else if (status === STATUS.HALF_DAY){ halfDays++;   absentDays += 0.5; }
  });

  // Per-day salary
  const perDay = workingDays.length > 0
    ? baseSalary / workingDays.length
    : 0;

  // Deductions
  const absentDeduction = Math.round(perDay * absentDays);
  const lateDeduction   = Math.round(latePenaltyPerOccurrence * lateDays);
  const totalDeductions = absentDeduction + lateDeduction + advance;

  const finalSalary = Math.max(0, baseSalary - totalDeductions + bonus);

  // Human-readable breakdown for "Why salary changed"
  const breakdown = [];
  if (absentDays > 0)
    breakdown.push({
      label:  `${absentDays} absent day${absentDays !== 1 ? 's' : ''}`,
      amount: -absentDeduction,
      type:   'deduction',
    });
  if (lateDays > 0)
    breakdown.push({
      label:  `${lateDays} late mark${lateDays !== 1 ? 's' : ''}`,
      amount: -lateDeduction,
      type:   'deduction',
    });
  if (advance > 0)
    breakdown.push({
      label:  'Advance deduction',
      amount: -advance,
      type:   'deduction',
    });
  if (bonus > 0)
    breakdown.push({
      label:  'Bonus',
      amount: +bonus,
      type:   'bonus',
    });

  return {
    staffId:          staff.id,
    staffName:        staff.name,
    role:             staff.role,
    month:            yearMonth,
    baseSalary,
    workingDays:      workingDays.length,
    presentDays,
    absentDays,
    lateDays,
    halfDays,
    perDay:           Math.round(perDay),
    absentDeduction,
    lateDeduction,
    bonus,
    advance,
    totalDeductions,
    finalSalary,
    breakdown,
    status:           'pending',
    generatedAt:      new Date().toISOString(),
  };
};

/**
 * Calculate salaries for ALL staff in one call.
 * @param {object[]} staffList
 * @param {object}   attendanceByStaff  { [staffId]: attendanceDoc[] }
 * @param {string}   yearMonth
 * @param {object}   overridesByStaff   { [staffId]: { bonus, advance } }
 */
export const calculateAllSalaries = (
  staffList, attendanceByStaff, yearMonth, overridesByStaff = {}
) =>
  staffList.map(staff =>
    calculateSalary(
      staff,
      attendanceByStaff[staff.id] || [],
      yearMonth,
      overridesByStaff[staff.id] || {}
    )
  );

// ─── WhatsApp salary slip ─────────────────────────────────────────────────────

/** Generate the WhatsApp salary message string */
export const buildSalarySlip = (sheet, cafeName = 'the café') => {
  const monthLabel = new Date(sheet.month + '-01')
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const deductionLines = [];
  if (sheet.absentDeduction > 0)
    deductionLines.push(`  • Absent (${sheet.absentDays} days): -₹${sheet.absentDeduction}`);
  if (sheet.lateDeduction > 0)
    deductionLines.push(`  • Late marks (${sheet.lateDays}): -₹${sheet.lateDeduction}`);
  if (sheet.advance > 0)
    deductionLines.push(`  • Advance: -₹${sheet.advance}`);

  const deductionBlock = deductionLines.length
    ? `\nDeductions:\n${deductionLines.join('\n')}`
    : '';

  const bonusLine = sheet.bonus > 0 ? `\nBonus: +₹${sheet.bonus}` : '';

  return (
    `Hi ${sheet.staffName},\n\n` +
    `Your salary for *${monthLabel}* from *${cafeName}* has been processed.\n\n` +
    `📋 *Attendance Summary*\n` +
    `  • Working days: ${sheet.workingDays}\n` +
    `  • Present: ${sheet.presentDays}\n` +
    `  • Absent: ${sheet.absentDays}\n` +
    `  • Late: ${sheet.lateDays}\n` +
    `\n💰 *Salary Details*\n` +
    `  • Base Salary: ₹${sheet.baseSalary}` +
    deductionBlock +
    bonusLine +
    `\n\n✅ *Final Salary: ₹${sheet.finalSalary}*\n\n` +
    `Thank you for your hard work! 🙏\n` +
    `— ${cafeName}`
  );
};
