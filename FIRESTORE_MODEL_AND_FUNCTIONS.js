/**
 * FIRESTORE_MODEL.md  (inline as JS comments for easy reading)
 *
 * ════════════════════════════════════════════════════════════════════
 *  SmartCafe OS — Staff Management Firestore Data Model
 * ════════════════════════════════════════════════════════════════════
 *
 * ── Collection: staff/{staffId} ──────────────────────────────────────
 *
 * {
 *   id:                     auto (doc ID)
 *   cafeId:                 string         // owner's cafe
 *   name:                   string
 *   role:                   string         // 'manager'|'barista'|'waiter'|'chef'|'cashier'
 *   phone:                  string         // for WhatsApp salary slip
 *   baseSalary:             number         // monthly, in INR
 *   shiftStartTime:         string         // '09:00' (HH:MM 24hr)
 *   lateGraceMinutes:       number         // default 15
 *   latePenaltyPerOccurrence: number       // default 50 (₹ per late mark)
 *   upiId:                  string|null    // for payment display
 *   bankDetails: {
 *     accountNumber:        string
 *     ifsc:                 string
 *     bankName:             string
 *     accountHolder:        string
 *   } | null
 *   joiningDate:            string         // 'YYYY-MM-DD'
 *   createdAt:              Timestamp
 *   updatedAt:              Timestamp
 * }
 *
 * ── Collection: attendance/{cafeId}_{staffId}_{YYYY-MM-DD} ───────────
 *
 * Document ID is deterministic — one per staff per day, no duplicates.
 *
 * {
 *   staffId:       string
 *   cafeId:        string
 *   date:          string   // 'YYYY-MM-DD'
 *   month:         string   // 'YYYY-MM'  (for cheap monthly queries)
 *   checkIn:       string | null   // ISO timestamp
 *   checkOut:      string | null
 *   status:        'present'|'absent'|'late'|'half_day'
 *   lateMinutes:   number   // 0 if not late
 *   note:          string   // optional override reason
 *   createdAt:     Timestamp
 *   updatedAt:     Timestamp
 * }
 *
 * Firestore rule:
 *   match /attendance/{recordId} {
 *     allow read: if isAdmin() || (isAuthenticated() && isCafeOwner(resource.data.cafeId));
 *     allow create: if true;         // QR check-in from staff tablet (no auth)
 *     allow update: if true;         // check-out from same tablet
 *     allow delete: if isAdmin();
 *   }
 *
 * ── Collection: salary/{cafeId}_{staffId}_{YYYY-MM} ─────────────────
 *
 * Document ID is deterministic — one per staff per month.
 *
 * {
 *   staffId:         string
 *   cafeId:          string
 *   staffName:       string   // snapshot at time of generation
 *   role:            string
 *   month:           string   // 'YYYY-MM'
 *
 *   // Inputs
 *   baseSalary:      number
 *   perDay:          number
 *
 *   // Attendance summary
 *   workingDays:     number
 *   presentDays:     number
 *   absentDays:      number   // includes half-days as 0.5
 *   lateDays:        number
 *   halfDays:        number
 *
 *   // Deductions
 *   absentDeduction: number
 *   lateDeduction:   number
 *   advance:         number
 *   totalDeductions: number
 *
 *   // Additions
 *   bonus:           number
 *
 *   // Result
 *   finalSalary:     number
 *
 *   // Breakdown for "Why salary changed"
 *   breakdown: [
 *     { label: string, amount: number, type: 'deduction'|'bonus' }
 *   ]
 *
 *   // Status
 *   status:        'pending'|'paid'
 *   generatedAt:   string   // ISO
 *   savedAt:       Timestamp
 *   paidAt:        Timestamp | null
 * }
 *
 * ════════════════════════════════════════════════════════════════════
 *  AUTO-ATTENDANCE CLOUD FUNCTION
 *  (paste into Firebase Functions index.js)
 * ════════════════════════════════════════════════════════════════════
 *
 * Runs at 11:59 PM every day.
 * For every staff member with no attendance record for today → marks Absent.
 * So owners never need to manually mark absences.
 */

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

// Runs every day at 11:59 PM IST (UTC+5:30 = 18:29 UTC)
exports.autoMarkAbsent = functions.pubsub
  .schedule('29 18 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const db    = admin.firestore();
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const month = today.slice(0, 7);                      // 'YYYY-MM'
    const dow   = new Date(today).getDay();

    // Skip Sundays
    if (dow === 0) {
      console.log('[autoMarkAbsent] Sunday — skipping');
      return null;
    }

    // Fetch all staff across all cafes
    const staffSnap = await db.collection('staff').get();
    const batch     = db.batch();
    let   count     = 0;

    for (const staffDoc of staffSnap.docs) {
      const staff   = staffDoc.data();
      const docId   = `${staff.cafeId}_${staffDoc.id}_${today}`;
      const attRef  = db.collection('attendance').doc(docId);
      const attDoc  = await attRef.get();

      // Only write if no record exists yet
      if (!attDoc.exists) {
        batch.set(attRef, {
          staffId:     staffDoc.id,
          cafeId:      staff.cafeId,
          date:        today,
          month,
          checkIn:     null,
          checkOut:    null,
          status:      'absent',
          lateMinutes: 0,
          note:        'Auto-marked absent (no check-in recorded)',
          createdAt:   admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;
      }
    }

    await batch.commit();
    console.log(`[autoMarkAbsent] Marked ${count} staff absent for ${today}`);
    return null;
  });

/**
 * ════════════════════════════════════════════════════════════════════
 *  QR CHECK-IN FUNCTION
 *  Staff scan a QR code on their tablet → this function creates/updates
 *  the attendance record with their check-in time and derives status.
 * ════════════════════════════════════════════════════════════════════
 */

exports.staffCheckIn = functions.https.onCall(async (data) => {
  const { staffId, cafeId } = data;
  if (!staffId || !cafeId) throw new functions.https.HttpsError('invalid-argument', 'staffId and cafeId required');

  const db      = admin.firestore();
  const now     = new Date();
  const today   = now.toISOString().split('T')[0];
  const month   = today.slice(0, 7);
  const dow     = now.getDay();

  if (dow === 0) throw new functions.https.HttpsError('failed-precondition', 'No check-in on Sundays');

  // Get staff shift config
  const staffDoc = await db.collection('staff').doc(staffId).get();
  if (!staffDoc.exists) throw new functions.https.HttpsError('not-found', 'Staff not found');
  const staff = staffDoc.data();

  // Derive status from check-in time
  const shiftStart    = staff.shiftStartTime     || '09:00';
  const graceMinutes  = staff.lateGraceMinutes   || 15;
  const [sh, sm]      = shiftStart.split(':').map(Number);
  const shiftDate     = new Date(now);
  shiftDate.setHours(sh, sm + graceMinutes, 0, 0);

  const isLate     = now > shiftDate;
  const lateMinutes = isLate ? Math.round((now - shiftDate) / 60000) : 0;
  const status      = isLate ? 'late' : 'present';

  const docId  = `${cafeId}_${staffId}_${today}`;
  const attRef = db.collection('attendance').doc(docId);

  await attRef.set({
    staffId, cafeId, date: today, month,
    checkIn:     now.toISOString(),
    checkOut:    null,
    status,
    lateMinutes,
    note:        '',
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { status, lateMinutes, checkIn: now.toISOString() };
});

/**
 * ════════════════════════════════════════════════════════════════════
 *  Firestore Security Rules for new collections
 *  (add to your existing firestore.rules)
 * ════════════════════════════════════════════════════════════════════

    match /staff/{staffId} {
      allow read:   if isAdmin() || (isAuthenticated() && isCafeOwner(resource.data.cafeId));
      allow create: if isAdmin() || (isAuthenticated() && isCafeOwner(request.resource.data.cafeId));
      allow update: if isAdmin() || (isAuthenticated() && isCafeOwner(resource.data.cafeId));
      allow delete: if isAdmin();
    }

    match /attendance/{recordId} {
      allow create: if true;         // QR check-in from staff tablet
      allow read:   if isAdmin() || (isAuthenticated() && isCafeOwner(resource.data.cafeId));
      allow update: if true;         // check-out from tablet
      allow delete: if isAdmin();
    }

    match /salary/{salaryId} {
      allow read:   if isAdmin() || (isAuthenticated() && isCafeOwner(resource.data.cafeId));
      allow create: if isAdmin() || (isAuthenticated() && isCafeOwner(request.resource.data.cafeId));
      allow update: if isAdmin() || (isAuthenticated() && isCafeOwner(resource.data.cafeId));
      allow delete: if isAdmin();
    }

 */
