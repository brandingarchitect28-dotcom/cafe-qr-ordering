/**
 * staffService.js
 *
 * Firestore data layer for Staff Management.
 * Handles: staff CRUD, attendance check-in/out, daily/monthly queries.
 *
 * Collections used (additive — no existing collections touched):
 *   staff       — staff member documents
 *   attendance  — one doc per staff per day: {cafeId}_{staffId}_{YYYY-MM-DD}
 *
 * ADD: staff CRUD service
 * ADD: attendance check-in/out logic
 */

import {
  collection, doc,
  addDoc, setDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
export const toDateKey = (date = new Date()) => {
  try {
    return new Date(date).toISOString().split('T')[0];
  } catch (e) {
    console.error('toDateKey error:', e);
    return '';
  }
};

// ── Constants ──────────────────────────────────────────────────────────────────

export const ROLES = [
  'Manager', 'Chef', 'Waiter', 'Cashier',
  'Cleaner', 'Delivery', 'Other',
];

export const SALARY_TYPES = ['monthly', 'daily', 'hourly'];

// ── Staff CRUD ─────────────────────────────────────────────────────────────────

/**
 * Add a new staff member to Firestore.
 * @param {string} cafeId
 * @param {object} formData  { name, role, phone, upiId, salaryType, salaryAmount, shiftStart, ... }
 * @returns {string} new document ID
 */
export const addStaff = async (cafeId, formData) => {
  const docRef = await addDoc(collection(db, 'staff'), {
    cafeId,
    name:         formData.name.trim(),
    role:         formData.role         || 'Waiter',
    phone:        formData.phone        || '',
    upiId:        formData.upiId        || '',
    salaryType:   formData.salaryType   || 'monthly',
    salaryAmount: parseFloat(formData.salaryAmount) || 0,
    shiftStart:   formData.shiftStart   || '09:00',
    latePenalty:  parseFloat(formData.latePenalty)  || 50,
    bankDetails:  formData.bankDetails  || null,
    isActive:     true,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  });
  return docRef.id;
};

/**
 * Update an existing staff member.
 * @param {string} staffId  Firestore doc ID
 * @param {object} formData Partial update data
 */
export const updateStaff = async (staffId, formData) => {
  await updateDoc(doc(db, 'staff', staffId), {
    name:         formData.name?.trim()             ?? undefined,
    role:         formData.role                     ?? undefined,
    phone:        formData.phone                    ?? undefined,
    upiId:        formData.upiId                    ?? undefined,
    salaryType:   formData.salaryType               ?? undefined,
    salaryAmount: formData.salaryAmount !== undefined
                    ? parseFloat(formData.salaryAmount) || 0
                    : undefined,
    shiftStart:   formData.shiftStart               ?? undefined,
    latePenalty:  formData.latePenalty !== undefined
                    ? parseFloat(formData.latePenalty) || 50
                    : undefined,
    bankDetails:  formData.bankDetails              ?? undefined,
    updatedAt:    serverTimestamp(),
  });
};

/**
 * Soft-delete a staff member (sets isActive: false).
 * Does NOT delete attendance records — keeps history intact.
 * @param {string} staffId
 */
export const deleteStaff = async (staffId) => {
  await updateDoc(doc(db, 'staff', staffId), {
    isActive:  false,
    deletedAt: serverTimestamp(),
  });
};

// ── Attendance helpers ─────────────────────────────────────────────────────────

/**
 * Derive the attendance document ID — deterministic, prevents duplicates.
 */
const attDocId = (cafeId, staffId, dateKey) =>
  `${cafeId}_${staffId}_${dateKey}`;

/**
 * Parse "HH:MM" time string into a comparable number (minutes since midnight).
 */
const parseTimeMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Check in a staff member.
 * Creates an attendance record; marks late if checkIn > shiftStart + 10 min.
 *
 * @param {string} cafeId
 * @param {string} staffId
 * @param {string} shiftStart  'HH:MM' e.g. '09:00'
 * @returns {{ record: object, alreadyCheckedIn: boolean }}
 */
export const checkIn = async (cafeId, staffId, shiftStart = '09:00') => {
  const dateKey  = toDateKey(new Date());
  const month    = dateKey.slice(0, 7);
  const now      = new Date();
  const checkInStr = now.toTimeString().slice(0, 5); // 'HH:MM'

  const ref = doc(db, 'attendance', attDocId(cafeId, staffId, dateKey));
  const existing = await getDoc(ref);

  // Already checked in today
  if (existing.exists() && existing.data().checkIn) {
    return { record: { id: existing.id, ...existing.data() }, alreadyCheckedIn: true };
  }

  // Calculate lateness
  const shiftMinutes  = parseTimeMinutes(shiftStart);
  const checkInMinutes = parseTimeMinutes(checkInStr);
  const gracePeriod   = 10; // minutes
  const lateMinutes   = Math.max(0, checkInMinutes - shiftMinutes - gracePeriod);
  const isLate        = lateMinutes > 0;

  const record = {
    cafeId,
    staffId,
    date:        dateKey,
    month,
    checkIn:     checkInStr,
    checkOut:    null,
    lateMinutes,
    status:      isLate ? 'late' : 'present',
    note:        '',
    updatedAt:   serverTimestamp(),
  };

  await setDoc(ref, record, { merge: true });
  return { record: { id: ref.id, ...record }, alreadyCheckedIn: false };
};

/**
 * Check out a staff member.
 * Updates the attendance record with checkOut time and hours worked.
 *
 * @param {string} cafeId
 * @param {string} staffId
 * @returns {{ hoursWorked: number, record: object }}
 */
export const checkOut = async (cafeId, staffId) => {
  const dateKey    = toDateKey(new Date());
  const now        = new Date();
  const checkOutStr = now.toTimeString().slice(0, 5);

  const ref      = doc(db, 'attendance', attDocId(cafeId, staffId, dateKey));
  const existing = await getDoc(ref);

  if (!existing.exists()) {
    throw new Error('No check-in record found for today');
  }

  const data = existing.data();

  // Calculate hours worked
  const inMinutes  = parseTimeMinutes(data.checkIn  || '09:00');
  const outMinutes = parseTimeMinutes(checkOutStr);
  const totalMins  = Math.max(0, outMinutes - inMinutes);
  const hoursWorked = +(totalMins / 60).toFixed(2);

  // Half-day if worked < 5 hours
  const updatedStatus = hoursWorked < 5 ? 'half-day' : (data.status || 'present');

  await updateDoc(ref, {
    checkOut:     checkOutStr,
    hoursWorked,
    status:       updatedStatus,
    updatedAt:    serverTimestamp(),
  });

  const updated = { ...data, checkOut: checkOutStr, hoursWorked, status: updatedStatus };
  return { hoursWorked, record: { id: ref.id, ...updated } };
};

// ── Attendance queries ─────────────────────────────────────────────────────────

/**
 * Fetch all attendance records for a cafe on a specific date.
 * @param {string} cafeId
 * @param {string} dateKey  'YYYY-MM-DD'  (defaults to today)
 * @returns {object[]}
 */
export const getDailyAttendance = async (cafeId, dateKey = toDateKey()) => {
  const snap = await getDocs(
    query(
      collection(db, 'attendance'),
      where('cafeId', '==', cafeId),
      where('date',   '==', dateKey)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/**
 * Fetch all attendance records for one staff member in a given month.
 * @param {string} cafeId
 * @param {string} staffId
 * @param {string} yearMonth  'YYYY-MM'
 * @returns {object[]}
 */
export const getMonthlyAttendance = async (cafeId, staffId, yearMonth) => {
  const snap = await getDocs(
    query(
      collection(db, 'attendance'),
      where('cafeId',  '==', cafeId),
      where('staffId', '==', staffId),
      where('month',   '==', yearMonth)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
