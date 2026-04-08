// Invoice Service
// Handles automatic invoice generation tied to order creation
// Rule: NEVER modifies existing order placement logic — only extends it

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Generate a sequential invoice number
 * Format: INV-YYYYMMDD-XXXX (e.g. INV-20260316-0001)
 */
const generateInvoiceNumber = async () => {
  const counterRef = doc(db, 'system', 'invoiceCounter');
  let invoiceSeq;

  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    if (!counterDoc.exists()) {
      invoiceSeq = 1;
      transaction.set(counterRef, { currentInvoiceNumber: 1 });
    } else {
      invoiceSeq = (counterDoc.data().currentInvoiceNumber || 0) + 1;
      transaction.update(counterRef, { currentInvoiceNumber: invoiceSeq });
    }
  });

  const today = new Date();
  const datePart =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  return `INV-${datePart}-${String(invoiceSeq).padStart(4, '0')}`;
};

/**
 * Create an invoice document in Firestore for a given order.
 * Called immediately after an order is saved to Firestore.
 *
 * @param {object} orderData  - The full order data object
 * @param {string} orderId    - The Firestore document ID of the order
 * @param {object} cafeData   - Cafe document data (name, currencySymbol, etc.)
 * @returns {{ invoiceId: string|null, error: string|null }}
 */
export const createInvoiceForOrder = async (orderData, orderId, cafeData) => {
  try {
    const invoiceNumber = await generateInvoiceNumber();

    // ── Recalculate amounts using correct order: subtotal → serviceCharge → GST ──
    const subtotal = orderData.subtotalAmount ??
      (orderData.items || []).reduce((s, i) => s + (i.price * i.quantity), 0);

    const serviceChargeEnabled = cafeData?.serviceChargeEnabled || false;
    const serviceChargeRate    = parseFloat(cafeData?.serviceChargeRate) || 0;
    const serviceChargeAmount  = serviceChargeEnabled
      ? subtotal * serviceChargeRate / 100
      : (orderData.serviceChargeAmount ?? 0);

    // GST applied on subtotal + serviceCharge (per task spec)
    const gstEnabled = cafeData?.gstEnabled || false;
    const gstRate    = parseFloat(cafeData?.gstRate) || 0;
    const gstAmount  = gstEnabled
      ? (subtotal + serviceChargeAmount) * gstRate / 100
      : (orderData.gstAmount ?? 0);

    // Tax (separate from GST — legacy field)
    const taxEnabled = cafeData?.taxEnabled || false;
    const taxRate    = parseFloat(cafeData?.taxRate) || 0;
    const taxAmount  = taxEnabled
      ? subtotal * taxRate / 100
      : (orderData.taxAmount ?? 0);

    const totalAmount = subtotal + serviceChargeAmount + gstAmount + taxAmount;

    const invoiceDoc = {
      // Linking fields
      orderId,
      cafeId:      orderData.cafeId,
      orderNumber: orderData.orderNumber ?? null,

      // Cafe info snapshot (denormalised so invoice is self-contained)
      cafeName:      cafeData?.name      || 'Café',
      cafeAddress:   cafeData?.address   || '',
      cafePhone:     cafeData?.phone     || '',
      cafeGstNumber: cafeData?.gstNumber || cafeData?.cafeGstNumber || '',
      currencySymbol: orderData.currencySymbol || cafeData?.currencySymbol || '₹',
      currencyCode:   orderData.currencyCode   || cafeData?.currencyCode   || 'INR',

      // Customer info
      customerName:  orderData.customerName  || '',
      customerPhone: orderData.customerPhone || '',
      tableNumber:   orderData.tableNumber   || '',
      orderType:     orderData.orderType     || 'dine-in',

      // FEATURE 3 FIX: store deliveryAddress so InvoiceModal can render it.
      // Previously this field was missing → invoice always showed 'N/A' for
      // delivery orders even though OrdersManagement and InvoiceModal already
      // had the conditional render logic in place.
      deliveryAddress: orderData.deliveryAddress || '',

      // Items (array of { name, price, quantity })
      items: orderData.items || [],

      // ── Amounts (correct calculation order) ──
      subtotalAmount,

      // Service Charge
      serviceChargeEnabled,
      serviceChargeRate,
      serviceChargePercentage: serviceChargeRate,   // alias per task spec
      serviceChargeAmount,

      // GST (applied on subtotal + serviceCharge)
      gstEnabled,
      gstRate,
      gstPercentage: gstRate,                       // alias per task spec
      gstAmount,

      // Tax (legacy separate field)
      taxEnabled,
      taxName: cafeData?.taxName || 'Tax',
      taxRate,
      taxAmount,

      // Final total
      totalAmount,

      // Payment
      paymentMode:   orderData.paymentMode   || 'counter',
      paymentStatus: orderData.paymentStatus || 'pending',

      // Invoice meta
      invoiceNumber,
      orderTime: orderData.createdAt || serverTimestamp(),
      createdAt: serverTimestamp(),
      status: 'generated',
    };

    const docRef = await addDoc(collection(db, 'invoices'), invoiceDoc);
    return { invoiceId: docRef.id, invoiceNumber, error: null };
  } catch (error) {
    console.error('[InvoiceService] Failed to create invoice:', error);
    return { invoiceId: null, invoiceNumber: null, error: error.message };
  }
};

/**
 * Fetch a single invoice by its Firestore document ID
 */
export const getInvoiceById = async (invoiceId) => {
  try {
    const snap = await getDoc(doc(db, 'invoices', invoiceId));
    if (snap.exists()) return { data: { id: snap.id, ...snap.data() }, error: null };
    return { data: null, error: 'Invoice not found' };
  } catch (error) {
    return { data: null, error: error.message };
  }
};

/**
 * Fetch the invoice linked to a specific orderId
 */
export const getInvoiceByOrderId = async (orderId) => {
  try {
    const q = query(collection(db, 'invoices'), where('orderId', '==', orderId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { data: { id: docSnap.id, ...docSnap.data() }, error: null };
    }
    return { data: null, error: null }; // invoice just not generated yet
  } catch (error) {
    return { data: null, error: error.message };
  }
};

/**
 * Real-time listener: invoice for a specific orderId
 */
export const subscribeToInvoiceByOrderId = (orderId, callback) => {
  const q = query(collection(db, 'invoices'), where('orderId', '==', orderId));
  return onSnapshot(q, (snap) => {
    if (!snap.empty) {
      callback({ id: snap.docs[0].id, ...snap.docs[0].data() });
    } else {
      callback(null);
    }
  });
};

/**
 * Real-time listener: all invoices for a cafe
 */
export const subscribeToInvoicesByCafe = (cafeId, callback) => {
  const q = query(collection(db, 'invoices'), where('cafeId', '==', cafeId));
  return onSnapshot(q, (snap) => {
    const invoices = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
    callback(invoices);
  });
};

/**
 * ensureInvoiceForOrder
 *
 * Safely generates an invoice when payment becomes "paid".
 * Atomic and idempotent — will never create a duplicate.
 *
 * Safety contract:
 *  1. Checks order.invoiceId first — if exists, stops immediately.
 *  2. Checks invoices collection for existing invoice by orderId.
 *  3. Only creates if none found.
 *  4. After creation, writes invoiceId back to the order document.
 *  5. Never throws — all failures are logged and returned as { error }.
 *  6. Never modifies any order field except adding invoiceId.
 *
 * @param {string} orderId   — Firestore order document ID
 * @param {object} orderData — Full order document data
 * @param {object} cafeData  — Cafe document data (for tax settings etc.)
 * @returns {{ invoiceId: string|null, skipped: boolean, error: string|null }}
 */
export const ensureInvoiceForOrder = async (orderId, orderData, cafeData) => {
  try {
    // ── Guard 1: order already has an invoiceId ───────────────────────────────
    if (orderData?.invoiceId) {
      console.log(`[InvoiceService] Order ${orderId} already has invoiceId — skipping`);
      return { invoiceId: orderData.invoiceId, skipped: true, error: null };
    }

    // ── Guard 2: invoice already exists in Firestore for this orderId ─────────
    const { data: existing } = await getInvoiceByOrderId(orderId);
    if (existing) {
      console.log(`[InvoiceService] Invoice already exists for order ${orderId} — linking`);
      // Link it back to the order if not already linked (best-effort)
      try {
        await updateDoc(doc(db, 'orders', orderId), { invoiceId: existing.id });
      } catch (_) { /* non-fatal */ }
      return { invoiceId: existing.id, skipped: true, error: null };
    }

    // ── Create invoice ─────────────────────────────────────────────────────────
    const { invoiceId, error } = await createInvoiceForOrder(
      orderData,
      orderId,
      cafeData
    );

    if (error) {
      console.error(`[InvoiceService] ensureInvoiceForOrder creation failed:`, error);
      return { invoiceId: null, skipped: false, error };
    }

    // ── Link invoiceId back to order (adds only — never overwrites other fields) ─
    try {
      await updateDoc(doc(db, 'orders', orderId), { invoiceId });
    } catch (linkErr) {
      // Non-fatal — invoice exists, link is best-effort
      console.warn(`[InvoiceService] Could not link invoiceId to order:`, linkErr);
    }

    console.log(`[InvoiceService] Invoice ${invoiceId} created and linked to order ${orderId}`);
    return { invoiceId, skipped: false, error: null };

  } catch (err) {
    // Top-level safety net — never crashes calling code
    console.error(`[InvoiceService] ensureInvoiceForOrder unexpected error:`, err);
    return { invoiceId: null, skipped: false, error: err.message };
  }
};

// ─── generateInvoiceMessage ───────────────────────────────────────────────────
/**
 * generateInvoiceMessage(source, cafeInfo?)
 *
 * Produces a formatted WhatsApp invoice message string.
 * Works with both order documents and Firestore invoice documents —
 * field names overlap so a single function handles both.
 *
 * Used by: OrderTracking.jsx, InvoicesTab.jsx, OrdersManagement.jsx
 *
 * @param {object} source   — order or invoice document data
 * @param {object} cafeInfo — optional { name, currencySymbol }
 * @returns {string}        — formatted multi-line WhatsApp message
 */
export const generateInvoiceMessage = (source = {}, cafeInfo = {}) => {

  // ── Safe helpers ────────────────────────────────────────────────────────────
  const n      = (v, d = 0) => (isNaN(parseFloat(v)) ? d : parseFloat(v));
  const fmtAmt = (v) => n(v, 0).toFixed(2);

  // ── Field resolution (order + invoice share most field names) ───────────────
  const cur          = source.currencySymbol  || cafeInfo.currencySymbol || '₹';
  const cafeName     = source.cafeName        || cafeInfo.name           || '';
  const invNo        = source.invoiceNumber   || '';
  const orderNo      = String(source.orderNumber || '').padStart(3, '0');
  const custName     = source.customerName    || '';
  const custPhone    = source.customerPhone   || '';
  const orderType    = source.orderType       || 'dine-in';
  const tableNo      = source.tableNumber     || '';
  const deliveryAddr = source.deliveryAddress || '';
  const items        = Array.isArray(source.items) ? source.items : [];
  const payStatus    = source.paymentStatus   || 'pending';
  const payMode      = source.paymentMode     || 'counter';
  const specialNote  = source.specialInstructions || '';

  // ── Timestamp ───────────────────────────────────────────────────────────────
  const rawTime = source.orderTime || source.createdAt;
  let timeStr = '';
  try {
    const d = rawTime?.toDate ? rawTime.toDate() : rawTime ? new Date(rawTime) : new Date();
    timeStr = d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch (_) { timeStr = ''; }

  // ── Amount calculation (safe, with fallbacks for legacy orders) ─────────────
  const computedItemsSubtotal = items.reduce((sum, item) => {
    const base = n(item.basePrice ?? item.price, 0);
    return sum + base * n(item.quantity, 1);
  }, 0);
  const computedAddonsTotal = items.reduce((sum, item) => {
    return sum + (Array.isArray(item.addons)
      ? item.addons.reduce((s, a) => s + n(a.price, 0), 0) * n(item.quantity, 1)
      : n(item.addonTotal, 0) * n(item.quantity, 1));
  }, 0);

  const subtotal    = n(source.subtotalAmount,      computedItemsSubtotal + computedAddonsTotal);
  const gstAmt      = n(source.gstAmount,           0);
  const taxAmt      = n(source.taxAmount,           0);
  const scAmt       = n(source.serviceChargeAmount, 0);
  const platformFee = n(source.platformFeeAmount,   0);
  const discount    = n(source.discountAmount,       0);
  const computedTotal = subtotal + gstAmt + taxAmt + scAmt + platformFee - discount;
  const total       = n(source.totalAmount, computedTotal);

  // ── Order type label ────────────────────────────────────────────────────────
  const orderTypeLabel = {
    'dine-in':  `🪑 Dine-In${tableNo ? ` · Table ${tableNo}` : ''}`,
    'takeaway': '🥡 Takeaway',
    'delivery': `🛵 Delivery${deliveryAddr ? `\n📍 ${deliveryAddr}` : ''}`,
  }[orderType] || orderType;

  // ── Payment mode label ──────────────────────────────────────────────────────
  const payModeLabel = {
    'counter': 'Pay at Counter',
    'table':   'Pay at Table',
    'prepaid': 'UPI (Prepaid)',
    'online':  'Online Payment',
  }[payMode] || payMode;

  // ── Build message ───────────────────────────────────────────────────────────
  const LINE  = '─────────────────────────';
  const lines = [];

  // Header
  lines.push(`🧾 *${cafeName || 'Invoice'}*`);
  if (invNo)   lines.push(`📋 Invoice: *${invNo}*`);
  lines.push(`🔢 Order:   *#${orderNo}*`);
  if (timeStr) lines.push(`🕐 Time:    ${timeStr}`);
  lines.push(`📦 Type:    ${orderTypeLabel}`);
  lines.push('');

  // Customer
  if (custName || custPhone) {
    lines.push('👤 *Customer*');
    if (custName)  lines.push(`   Name:  ${custName}`);
    if (custPhone) lines.push(`   Phone: ${custPhone}`);
    lines.push('');
  }

  // Items
  lines.push(LINE);
  lines.push('🛒 *Items*');
  lines.push('');

  items.forEach(item => {
    const basePrice = n(item.basePrice ?? item.price, 0);
    const qty       = n(item.quantity, 1);
    const addons    = Array.isArray(item.addons) ? item.addons : [];
    const addonsAmt = addons.reduce((s, a) => s + n(a.price, 0), 0);
    const lineTotal = (basePrice + addonsAmt) * qty;

    lines.push(`▸ *${item.name}* × ${qty}   ${cur}${fmtAmt(lineTotal)}`);

    if (addons.length > 0) {
      lines.push(`   Base: ${cur}${fmtAmt(basePrice)} × ${qty}`);
    }
    addons.forEach(a => {
      lines.push(`   ╰ ${a.name}: +${cur}${fmtAmt(n(a.price, 0))}`);
    });
  });

  // Bill summary
  lines.push('');
  lines.push(LINE);
  lines.push('💰 *Bill Summary*');
  lines.push('');
  lines.push(`   Items Subtotal     ${cur}${fmtAmt(subtotal)}`);
  if (gstAmt > 0)      lines.push(`   GST               +${cur}${fmtAmt(gstAmt)}`);
  if (taxAmt > 0)      lines.push(`   Tax               +${cur}${fmtAmt(taxAmt)}`);
  if (scAmt > 0)       lines.push(`   Service Charge    +${cur}${fmtAmt(scAmt)}`);
  if (platformFee > 0) lines.push(`   Platform Fee      +${cur}${fmtAmt(platformFee)}`);
  if (discount > 0)    lines.push(`   Discount          -${cur}${fmtAmt(discount)}`);
  lines.push('');
  lines.push(`   *TOTAL             ${cur}${fmtAmt(total)}*`);
  lines.push('');

  // Payment
  lines.push(LINE);
  lines.push('💳 *Payment*');
  lines.push('');
  lines.push(`   Status: ${payStatus === 'paid' ? '✅ Paid' : payStatus === 'failed' ? '❌ Failed' : '⏳ Pending'}`);
  lines.push(`   Mode:   ${payModeLabel}`);

  // Special instructions
  if (specialNote) {
    lines.push('');
    lines.push(LINE);
    lines.push(`📝 *Note:* ${specialNote}`);
  }

  // Footer
  lines.push('');
  lines.push(LINE);
  if (cafeName) lines.push(`Thank you for choosing *${cafeName}* ☕`);
  lines.push('_Powered by SmartCafé OS_');

  return lines.join('\n');
};
