// Invoice Service
// Handles automatic invoice generation tied to order creation
// Rule: NEVER modifies existing order placement logic — only extends it

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
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

    const invoiceDoc = {
      // Linking fields
      orderId,
      cafeId: orderData.cafeId,
      orderNumber: orderData.orderNumber ?? null,

      // Cafe info snapshot (denormalised so invoice is self-contained)
      cafeName: cafeData?.name || 'Café',
      cafeAddress: cafeData?.address || '',
      cafePhone: cafeData?.phone || '',
      cafeGstNumber: cafeData?.gstNumber || '',
      currencySymbol: orderData.currencySymbol || cafeData?.currencySymbol || '₹',
      currencyCode: orderData.currencyCode || cafeData?.currencyCode || 'INR',

      // Customer info
      customerName: orderData.customerName || '',
      customerPhone: orderData.customerPhone || '',
      tableNumber: orderData.tableNumber || '',
      orderType: orderData.orderType || 'dine-in',

      // Items  (array of { name, price, quantity })
      items: orderData.items || [],

      // Amounts
      subtotalAmount: orderData.subtotalAmount ?? orderData.totalAmount ?? 0,
      taxAmount: orderData.taxAmount ?? 0,
      serviceChargeAmount: orderData.serviceChargeAmount ?? 0,
      gstAmount: orderData.gstAmount ?? 0,
      totalAmount: orderData.totalAmount ?? orderData.total ?? 0,

      // Tax meta
      taxEnabled: cafeData?.taxEnabled || false,
      taxName: cafeData?.taxName || 'Tax',
      taxRate: cafeData?.taxRate || 0,
      serviceChargeEnabled: cafeData?.serviceChargeEnabled || false,
      serviceChargeRate: cafeData?.serviceChargeRate || 0,
      gstEnabled: cafeData?.gstEnabled || false,
      gstRate: cafeData?.gstRate || 0,

      // Payment
      paymentMode: orderData.paymentMode || 'counter',
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
