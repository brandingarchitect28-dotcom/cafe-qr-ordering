'use strict';

const express = require('express');
const cors    = require('cors');
const https   = require('https');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Warn about missing env vars but NEVER exit — server must start regardless ─
// If APP_ID / SECRET_KEY are missing, /create-order will return a clear error.
// Killing the process here causes Render to show "Application Loading" forever.
const REQUIRED_ENV = ['APP_ID', 'SECRET_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.warn('[Startup] WARNING — missing env vars:', missing.join(', '));
  console.warn('[Startup] Add them in Render → Environment. Payment routes will fail until set.');
  // DO NOT process.exit() — server must keep running so health checks pass
}

console.log('App started');

// ─── Cashfree environment detection (safe — guards APP_ID access) ─────────────
const APP_ID_VAL       = process.env.APP_ID || '';
const IS_SANDBOX       = APP_ID_VAL.startsWith('TEST_');
const CF_HOST          = IS_SANDBOX ? 'sandbox.cashfree.com' : 'api.cashfree.com';
const CF_CHECKOUT_BASE = IS_SANDBOX
  ? 'https://sandbox.cashfree.com/pg/view/sessions'
  : 'https://payments.cashfree.com/order';

console.log(`[Startup] Cashfree env : ${APP_ID_VAL ? (IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION') : 'NOT SET'}`);
console.log(`[Startup] Cashfree API : ${CF_HOST}`);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── GET / ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:      'ok',
    message:     'Backend running',
    version:     '1.1.0',
    environment: IS_SANDBOX ? 'sandbox' : 'production',
    time:        new Date().toISOString(),
  });
});

// ─── POST /create-order ───────────────────────────────────────────────────────
app.post('/create-order', async (req, res) => {
  const { orderId, amount, phone, cafeId, currency, customerName, returnUrl } = req.body;

  // ── Task 7: Log full incoming request ──────────────────────────────────────
  console.log('[create-order] ─── Incoming request ───────────────────────────');
  console.log('[create-order] orderId:     ', orderId);
  console.log('[create-order] amount:      ', amount, '(raw)');
  console.log('[create-order] phone:       ', phone);
  console.log('[create-order] cafeId:      ', cafeId);
  console.log('[create-order] customerName:', customerName);
  console.log('[create-order] returnUrl:   ', returnUrl);
  console.log('[create-order] ─────────────────────────────────────────────────');

  // ── Input validation ────────────────────────────────────────────────────────
  // Guard: keys must be set or return clear error (server still runs without them)
  if (!process.env.APP_ID || !process.env.SECRET_KEY) {
    console.error('[create-order] APP_ID or SECRET_KEY not set — add them in Render environment');
    return res.status(503).json({ error: 'Payment gateway not configured. Add APP_ID and SECRET_KEY in Render environment.' });
  }

  if (!orderId || !amount || !phone) {
    console.warn('[create-order] FAIL — missing required fields');
    return res.status(400).json({ error: 'orderId, amount and phone are required.' });
  }
  if (isNaN(amount) || Number(amount) <= 0) {
    console.warn('[create-order] FAIL — invalid amount:', amount);
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    console.warn('[create-order] FAIL — invalid phone:', phone, 'cleaned:', cleanPhone);
    return res.status(400).json({ error: 'Phone number must be at least 10 digits.' });
  }

  // ── FIX 2: Integer amount — no decimals, no precision errors ───────────────
  // Math.round eliminates 1.1500000000000001, 115.999999 etc.
  const formattedAmount = Math.round(Number(amount));
  console.log('[create-order] Amount:', amount, '->', formattedAmount, '(rounded integer)');

  if (formattedAmount <= 0) {
    return res.status(400).json({ error: 'Order amount must be greater than zero.' });
  }

  // ── FIX 1: Always unique orderId — Cashfree rejects reused IDs ─────────────
  // Reusing an orderId returns the OLD session which may be expired/invalid
  // causing "client session is invalid" on the payment page
  const uniqueOrderId = `${orderId}_${Date.now()}`;
  console.log('[create-order] uniqueOrderId:', uniqueOrderId);

  // ── Build Cashfree payload ──────────────────────────────────────────────────
  const cfPayloadObj = {
    order_id:       uniqueOrderId,
    order_amount:   formattedAmount,
    order_currency: currency || 'INR',
    customer_details: {
      customer_id:    cleanPhone,
      customer_name:  customerName || 'Customer',
      customer_phone: cleanPhone,
    },
    order_meta: {
      return_url: returnUrl || `https://your-frontend.netlify.app/track/${orderId}`,
    },
  };

  // Task 7: Log exact payload sent to Cashfree (no keys)
  console.log('[create-order] Payload to Cashfree:', JSON.stringify(cfPayloadObj, null, 2));

  // ── Call Cashfree server-side ───────────────────────────────────────────────
  try {
    const cfData = await cashfreeRequest(JSON.stringify(cfPayloadObj));

    // FIX 6: Log FULL response — essential for diagnosing any Cashfree error
    console.log('[create-order] ─── Cashfree full response ───────────────────');
    console.log(JSON.stringify(cfData, null, 2));
    console.log('[create-order] ─────────────────────────────────────────────');

    // FIX 3: Strict session validation — empty string or null are both invalid
    const session = cfData.payment_session_id;
    if (session && typeof session === 'string' && session.trim() !== '') {

      // FIX 4+5: Build correct URL for the right environment
      // Mixing sandbox session with production URL → "client session is invalid"
      const payment_link = IS_SANDBOX
        ? `${CF_CHECKOUT_BASE}/${session}`
        : `${CF_CHECKOUT_BASE}/#${session}`;

      console.log('[create-order] SUCCESS');
      console.log('[create-order]   uniqueOrderId      :', uniqueOrderId);
      console.log('[create-order]   payment_session_id :', session);
      console.log('[create-order]   payment_link       :', payment_link);
      console.log('[create-order]   environment        :', IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION');

      // FIX 4: Return fresh session — frontend must use it immediately
      return res.json({
        success:            true,
        payment_link,
        payment_session_id: session,
        order_id:           uniqueOrderId,
        environment:        IS_SANDBOX ? 'sandbox' : 'production',
      });
    }

    // ── Cashfree returned an error ────────────────────────────────────────────
    const errMsg  = cfData.message || cfData.error || cfData.type || 'Unknown Cashfree error';
    const errCode = cfData.code    || cfData.status || 'UNKNOWN';
    console.error('[create-order] Cashfree error — message:', errMsg, '| code:', errCode);

    // Targeted diagnosis for common errors
    if (errMsg.includes('order already exists')) {
      console.error('[create-order] CAUSE: Duplicate order_id — this should be fixed by uniqueOrderId suffix');
    }
    if (errMsg.includes('session') || errMsg.includes('client')) {
      console.error('[create-order] CAUSE: Session/auth issue — verify APP_ID + SECRET_KEY are',
        IS_SANDBOX ? 'SANDBOX (TEST_...)' : 'PRODUCTION (CF_...)');
    }
    if (errMsg.includes('amount')) {
      console.error('[create-order] CAUSE: Amount issue — sent:', formattedAmount);
    }

    return res.status(502).json({ error: errMsg, code: errCode });

  } catch (err) {
    console.error('[create-order] API call failed:', err.message);
    return res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ─── Firebase Admin — initialised once, used by webhook ─────────────────────
// Set FIREBASE_SERVICE_ACCOUNT in Render env vars (JSON string of service account)
let firestoreDb = null;

try {
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountRaw) {
      console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT env var not set.');
      console.warn('[Firebase] Webhook will log only — no Firestore updates until configured.');
    } else {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firestoreDb = admin.firestore();
      console.log('[Firebase] Admin SDK initialised successfully.');
    }
  } else {
    firestoreDb = admin.firestore();
  }
} catch (err) {
  console.error('[Firebase] Admin SDK init failed:', err.message);
  console.error('[Firebase] Check FIREBASE_SERVICE_ACCOUNT format (must be valid JSON string).');
}

// ─── Helper: strip timestamp suffix to get Firestore doc ID ──────────────────
// uniqueOrderId format: {firestoreDocId}_{timestamp}
// Example: XyZ1AbcDef9_1742803200000 → XyZ1AbcDef9
// Firebase auto-IDs are alphanumeric (no underscores), so last segment is always the timestamp.
function getFirestoreDocId(cashfreeOrderId) {
  if (!cashfreeOrderId) return null;
  const parts = String(cashfreeOrderId).split('_');
  if (parts.length < 2) return cashfreeOrderId; // no suffix — use as-is
  return parts.slice(0, -1).join('_');
}

// ─── POST /webhook/cashfree ────────────────────────────────────────────────────
// Register this URL in Cashfree Dashboard → Developers → Webhooks:
//   https://your-app.onrender.com/webhook/cashfree
//
// Also kept as /webhook for backward compat (old setting in Cashfree dashboard).
//
// Cashfree webhook payload (v2023-08-01):
// {
//   data: {
//     order:   { order_id, order_status }
//     payment: { payment_status, payment_amount, payment_currency }
//   }
//   event_time: "...",
//   type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK"
// }
async function handleCashfreeWebhook(req, res) {
  // Send 200 FIRST — before any processing.
  // Cashfree marks the test as failed if 200 does not arrive immediately.
  res.status(200).send('OK');

  // All remaining work is best-effort — wrapped in try/catch so no exception
  // can ever surface after the response has already been sent.
  try {
    const body = req.body || {};
    console.log('[webhook] Webhook received');
    console.log('[webhook] Full payload:', JSON.stringify(body, null, 2));

    // Extract fields — support both Cashfree v2 and v1 payload shapes
    const cashfreeOrderId = body?.data?.order?.order_id         || body?.order_id    || null;
    const paymentStatus   = body?.data?.payment?.payment_status || body?.payment_status || null;
    const orderStatus     = body?.data?.order?.order_status     || body?.order_status   || null;
    const eventType       = body?.type || null;

    console.log('[webhook] cashfreeOrderId:', cashfreeOrderId);
    console.log('[webhook] paymentStatus  :', paymentStatus);
    console.log('[webhook] orderStatus    :', orderStatus);
    console.log('[webhook] eventType      :', eventType);

    const isSuccess = paymentStatus === 'SUCCESS'
      || orderStatus === 'PAID'
      || eventType   === 'PAYMENT_SUCCESS_WEBHOOK';

    const isFailed  = paymentStatus === 'FAILED'
      || paymentStatus === 'USER_DROPPED'
      || eventType   === 'PAYMENT_FAILED_WEBHOOK';

    if (!cashfreeOrderId) {
      console.warn('[webhook] No order_id in payload — logging only, no DB update');
      return;
    }

    const firestoreDocId = getFirestoreDocId(cashfreeOrderId);
    console.log('[webhook] firestoreDocId:', firestoreDocId);

    if (!firestoreDb) {
      console.warn('[webhook] Firestore not initialised — skipping DB update.');
      console.warn('[webhook] Add FIREBASE_SERVICE_ACCOUNT to Render env vars to enable.');
      return;
    }

    const orderRef  = firestoreDb.collection('orders').doc(firestoreDocId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.error('[webhook] Order not found in Firestore:', firestoreDocId);
      return;
    }

    const existingOrder = orderSnap.data();
    console.log('[webhook] Order found:', firestoreDocId,
      '| currentPaymentStatus:', existingOrder.paymentStatus);

    // Idempotency: skip if already in final state
    if (isSuccess && existingOrder.paymentStatus === 'paid') {
      console.log('[webhook] Order already marked paid — skipping duplicate webhook');
      return;
    }
    if (isFailed && existingOrder.paymentStatus === 'failed') {
      console.log('[webhook] Order already marked failed — skipping duplicate webhook');
      return;
    }

    // Update Firestore — triggers existing onSnapshot listeners on frontend
    // (dashboard, kitchen display, order tracking) automatically
    if (isSuccess) {
      await orderRef.update({ paymentStatus: 'paid', updatedAt: new Date() });
      console.log('[webhook] Order updated to PAID:', firestoreDocId);
    } else if (isFailed) {
      await orderRef.update({ paymentStatus: 'failed', updatedAt: new Date() });
      console.log('[webhook] Order updated to FAILED:', firestoreDocId);
    } else {
      console.log('[webhook] Unhandled status — no DB update.',
        '| paymentStatus:', paymentStatus, '| orderStatus:', orderStatus);
    }

  } catch (err) {
    // Log but never re-throw — 200 was already sent
    console.error('[webhook] Processing error (200 already sent):', err.message);
  }
}

// ─── GET /webhook/cashfree — health check (Cashfree test tool hits this first) ─
app.get('/webhook/cashfree', (req, res) => {
  res.status(200).send('Webhook endpoint active');
});
app.get('/webhook', (req, res) => {
  res.status(200).send('Webhook endpoint active');
});

// Register both paths — new canonical + old for backward compat
app.post('/webhook/cashfree', handleCashfreeWebhook);
app.post('/webhook',          handleCashfreeWebhook);


// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server]   GET  /             → health check`);
  console.log(`[Server]   POST /create-order → Cashfree order creation`);
  console.log(`[Server]   POST /webhook      → payment status callback`);
});

// ─── Cashfree HTTPS helper ────────────────────────────────────────────────────
// FIX 5: Uses CF_HOST — sandbox.cashfree.com OR api.cashfree.com
function cashfreeRequest(payload) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CF_HOST,
      path:     '/pg/orders',
      method:   'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-version':   '2023-08-01',
        'x-client-id':     process.env.APP_ID,
        'x-client-secret': process.env.SECRET_KEY,
        'Content-Length':  Buffer.byteLength(payload),
      },
    };

    console.log('[cashfreeRequest] Host:', options.hostname, '| Path:', options.path);

    const req = https.request(options, (cfRes) => {
      console.log('[cashfreeRequest] HTTP status from Cashfree:', cfRes.statusCode);
      let data = '';
      cfRes.on('data', chunk => { data += chunk; });
      cfRes.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error('[cashfreeRequest] Non-JSON response:', data.slice(0, 300));
          reject(new Error(`Non-JSON from Cashfree: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[cashfreeRequest] Network error:', err.message);
      reject(err);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Cashfree API timed out after 15s'));
    });

    req.write(payload);
    req.end();
  });
}
