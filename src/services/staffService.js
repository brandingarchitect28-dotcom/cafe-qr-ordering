/**
 * staffService.js
 * Firebase service layer for Staff Management System.
 * Handles staff, attendance, and salary collections.
 * Fully isolated — does not touch any existing collections.
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROLES = ['Manager', 'Chef', 'Waiter', 'Cashier', 'Cleaner', 'Delivery', 'Other'];
export const SALARY_TYPES = ['monthly', 'daily', 'hourly'];

// Late threshold: minutes after shift start
export const LATE_THRESHOLD_MINUTES = 15;
// Half-day threshold: hours worked
export const HALF_DAY_HOURS = 4;
// Full-day hours expected
export const FULL_DAY_HOURS = 8;

// ─── Staff CRUD ───────────────────────────────────────────────────────────────

export const addStaff = async (cafeId, staffData) => {
  const doc_ = await addDoc(collection(db, 'staff'), {
    cafeId,
    name:         staffData.name.trim(),
    role:         staffData.role,
    phone:        staffData.phone?.trim() || '',
    upiId:        staffData.upiId?.trim() || '',
    salaryType:   staffData.salaryType || 'monthly',
    salaryAmount: parseFloat(staffData.salaryAmount) || 0,
    shiftStart:   staffData.shiftStart || '09:00',  // HH:MM
    isActive:     true,
    createdAt:    serverTimestamp(),
  });
  return doc_.id;
};

export const updateStaff = async (staffId, staffData) => {
  await updateDoc(doc(db, 'staff', staffId), {
    name:         staffData.name.trim(),
    role:         staffData.role,
    phone:        staffData.phone?.trim() || '',
    upiId:        staffData.upiId?.trim() || '',
    salaryType:   staffData.salaryType,
    salaryAmount: parseFloat(staffData.salaryAmount) || 0,
    shiftStart:   staffData.shiftStart || '09:00',
    updatedAt:    serverTimestamp(),
  });
};

export const deleteStaff = async (staffId) => {
  await updateDoc(doc(db, 'staff', staffId), {
    isActive: false,
    deletedAt: serverTimestamp(),
  });
};

export const getStaff = async (cafeId) => {
  const snap = await getDocs(
    query(collection(db, 'staff'), where('cafeId', '==', cafeId), where('isActive', '==', true))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── Attendance ───────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for a given Date */
export const toDateKey = (date = new Date()) =>
  date.toISOString().split('T')[0];

/** Returns HH:MM string for a given Date */
export const toTimeStr = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Minutes since midnight for a HH:MM string */
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Mark check-in for a staff member.
 * Idempotent — returns existing record if already checked in today.
 */
export const checkIn = async (cafeId, staffId, staffShiftStart = '09:00') => {
  const dateKey = toDateKey();
  const now     = new Date();
  const timeStr = toTimeStr(now);

  // Duplicate prevention
  const existing = await getDocs(query(
    collection(db, 'attendance'),
    where('cafeId',  '==', cafeId),
    where('staffId', '==', staffId),
    where('date',    '==', dateKey),
  ));
  if (!existing.empty) {
    return { alreadyCheckedIn: true, record: { id: existing.docs[0].id, ...existing.docs[0].data() } };
  }

  const shiftStartMins = toMinutes(staffShiftStart);
  const checkInMins    = toMinutes(timeStr);
  const isLate         = checkInMins > shiftStartMins + LATE_THRESHOLD_MINUTES;

  const docRef = await addDoc(collection(db, 'attendance'), {
    cafeId,
    staffId,
    date:      dateKey,
    checkIn:   timeStr,
    checkOut:  null,
    status:    'present',       // present | absent | half-day | late
    isLate,
    hoursWorked: 0,
    createdAt: serverTimestamp(),
  });

  return { alreadyCheckedIn: false, record: { id: docRef.id, staffId, date: dateKey, checkIn: timeStr, isLate } };
};

/**
 * Mark check-out and compute hours worked + status.
 */
export const checkOut = async (cafeId, staffId) => {
  const dateKey = toDateKey();
  const now     = new Date();
  const timeStr = toTimeStr(now);

  const snap = await getDocs(query(
    collection(db, 'attendance'),
    where('cafeId',  '==', cafeId),
    where('staffId', '==', staffId),
    where('date',    '==', dateKey),
  ));

  if (snap.empty) throw new Error('No check-in found for today');

  const record     = snap.docs[0];
  const checkInStr = record.data().checkIn;
  const hoursWorked = (toMinutes(timeStr) - toMinutes(checkInStr)) / 60;

  let status = 'present';
  if (hoursWorked < HALF_DAY_HOURS) status = 'half-day';
  else if (record.data().isLate)     status = 'late';

  await updateDoc(doc(db, 'attendance', record.id), {
    checkOut:   timeStr,
    hoursWorked: parseFloat(hoursWorked.toFixed(2)),
    status,
    updatedAt:  serverTimestamp(),
  });

  return { checkOut: timeStr, hoursWorked, status };
};

/** Get attendance for a staff member in a month (YYYY-MM) */
export const getMonthlyAttendance = async (cafeId, staffId, yearMonth) => {
  const snap = await getDocs(query(
    collection(db, 'attendance'),
    where('cafeId',  '==', cafeId),
    where('staffId', '==', staffId),
    where('date', '>=', `${yearMonth}-01`),
    where('date', '<=', `${yearMonth}-31`),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/** Get all attendance for a café on a specific date */
export const getDailyAttendance = async (cafeId, dateKey) => {
  const snap = await getDocs(query(
    collection(db, 'attendance'),
    where('cafeId', '==', cafeId),
    where('date',   '==', dateKey),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── Salary Calculation ───────────────────────────────────────────────────────

const daysInMonth = (yearMonth) => {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * Calculate and save monthly salary for a staff member.
 * Formula: baseSalary - (absentDeduction) - advance + bonus
 */
export const calculateAndSaveSalary = async (cafeId, staffId, yearMonth, opts = {}) => {
  const staff       = await getDoc(doc(db, 'staff', staffId));
  const staffData   = staff.data();
  const attendance  = await getMonthlyAttendance(cafeId, staffId, yearMonth);

  const workingDays = daysInMonth(yearMonth);
  const presentDays = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const halfDays    = attendance.filter(a => a.status === 'half-day').length;
  const absentDays  = workingDays - presentDays - halfDays;

  const perDay          = staffData.salaryAmount / workingDays;
  const absentDeduction = absentDays * perDay;
  const halfDayDeduction = halfDays * (perDay / 2);
  const bonus           = parseFloat(opts.bonus)   || 0;
  const advance         = parseFloat(opts.advance)  || 0;
  const netSalary       = Math.max(0,
    staffData.salaryAmount - absentDeduction - halfDayDeduction + bonus - advance
  );

  // Check if salary record already exists
  const existing = await getDocs(query(
    collection(db, 'salary'),
    where('cafeId',  '==', cafeId),
    where('staffId', '==', staffId),
    where('month',   '==', yearMonth),
  ));

  const salaryDoc = {
    cafeId,
    staffId,
    staffName:        staffData.name,
    month:            yearMonth,
    baseSalary:       staffData.salaryAmount,
    workingDays,
    presentDays,
    halfDays,
    absentDays,
    absentDeduction:  parseFloat(absentDeduction.toFixed(2)),
    halfDayDeduction: parseFloat(halfDayDeduction.toFixed(2)),
    bonus,
    advance,
    netSalary:        parseFloat(netSalary.toFixed(2)),
    isPaid:           false,
    paidAt:           null,
    upiId:            staffData.upiId || '',
    createdAt:        serverTimestamp(),
  };

  if (!existing.empty) {
    await updateDoc(doc(db, 'salary', existing.docs[0].id), { ...salaryDoc, updatedAt: serverTimestamp() });
    return { id: existing.docs[0].id, ...salaryDoc };
  }

  const ref = await addDoc(collection(db, 'salary'), salaryDoc);
  return { id: ref.id, ...salaryDoc };
};

/** Mark salary as paid */
export const markSalaryPaid = async (salaryId) => {
  await updateDoc(doc(db, 'salary', salaryId), {
    isPaid:    true,
    paidAt:    serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/** Get salary records for a café month */
export const getMonthlySalaries = async (cafeId, yearMonth) => {
  const snap = await getDocs(query(
    collection(db, 'salary'),
    where('cafeId', '==', cafeId),
    where('month',  '==', yearMonth),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
