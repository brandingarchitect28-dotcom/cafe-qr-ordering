'use strict';

const express = require('express');
const cors    = require('cors');
const https   = require('https');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Validate required env vars on startup ────────────────────────────────────
const REQUIRED_ENV = ['APP_ID', 'SECRET_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('[Startup] Missing required environment variables:', missing.join(', '));
  console.error('[Startup] Check your .env file or Render environment settings.');
  process.exit(1);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',   // Tighten in production: set to your Netlify domain
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── GET / — Health check ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:  'ok',
    message: 'Backend running',
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

// ─── POST /create-order — Cashfree order creation ────────────────────────────
// Called by frontend (CafeOrdering.jsx) with:
//   orderId, amount, phone, cafeId, currency, customerName, returnUrl
// Returns: { payment_link } or { error }
// Keys live HERE — never in the browser.
app.post('/create-order', async (req, res) => {
  const { orderId, amount, phone, cafeId, currency, customerName, returnUrl } = req.body;

  // ── Input validation ────────────────────────────────────────────────────────
  if (!orderId || !amount || !phone) {
    console.warn('[create-order] Missing required fields:', { orderId, amount, phone });
    return res.status(400).json({ error: 'orderId, amount and phone are required.' });
  }

  if (isNaN(amount) || Number(amount) <= 0) {
    console.warn('[create-order] Invalid amount:', amount);
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    console.warn('[create-order] Invalid phone:', phone);
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  console.log('[create-order] Initiating Cashfree order:', {
    orderId,
    amount,
    cafeId,
    // No keys logged — ever
  });

  // ── Build Cashfree request body ─────────────────────────────────────────────
  const cfPayload = JSON.stringify({
    order_id:       orderId,
    order_amount:   Number(amount),
    order_currency: currency || 'INR',
    customer_details: {
      customer_id:    cleanPhone,
      customer_name:  customerName || 'Customer',
      customer_phone: cleanPhone,
    },
    order_meta: {
      return_url: returnUrl || `https://your-frontend.netlify.app/track/${orderId}`,
    },
  });

  // ── Cashfree API call — server-side only ────────────────────────────────────
  try {
    const cfData = await cashfreeRequest(cfPayload);

    console.log('[create-order] Cashfree response status:', cfData.cf_order_id ? 'success' : 'no order id');

    if (cfData.payment_session_id) {
      const payment_link = `https://payments.cashfree.com/order/#${cfData.payment_session_id}`;
      console.log('[create-order] Payment link generated for order:', orderId);
      return res.json({ payment_link, payment_session_id: cfData.payment_session_id });
    }

    if (cfData.message) {
      console.error('[create-order] Cashfree error:', cfData.message);
      return res.status(502).json({ error: cfData.message });
    }

    console.error('[create-order] Unexpected Cashfree response:', JSON.stringify(cfData));
    return res.status(502).json({ error: 'Unexpected response from payment gateway.' });

  } catch (err) {
    console.error('[create-order] Cashfree API call failed:', err.message);
    return res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ─── POST /webhook — Cashfree payment status webhook ─────────────────────────
// Cashfree sends this when payment is completed/failed.
// Set this URL in Cashfree Dashboard → Webhooks:
//   https://your-app.onrender.com/webhook
app.post('/webhook', (req, res) => {
  const body = req.body;

  console.log('[webhook] Received payload:', JSON.stringify(body, null, 2));

  // Cashfree webhook payload shape (v2023-08-01):
  // { data: { order: { order_id, order_status }, payment: { payment_status } } }
  const orderStatus   = body?.data?.order?.order_status   || body?.order_status;
  const paymentStatus = body?.data?.payment?.payment_status || body?.payment_status;
  const orderId       = body?.data?.order?.order_id        || body?.order_id;

  if (orderStatus === 'PAID' || paymentStatus === 'SUCCESS') {
    console.log('[webhook] ✅ Payment success for order:', orderId);
    // TODO: Call Firebase Admin SDK here to update
    // orders/{orderId}.paymentStatus = 'paid'
    // Example (once Firebase Admin is wired up):
    // await db.collection('orders').doc(orderId).update({ paymentStatus: 'paid' });
  } else if (orderStatus === 'ACTIVE') {
    console.log('[webhook] ⏳ Payment pending for order:', orderId);
  } else if (paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED') {
    console.log('[webhook] ❌ Payment failed/dropped for order:', orderId, '| Status:', paymentStatus);
  } else {
    console.log('[webhook] ℹ️ Unhandled status — orderStatus:', orderStatus, '| paymentStatus:', paymentStatus);
  }

  // Always return 200 to acknowledge receipt — Cashfree retries on non-200
  res.status(200).json({ received: true });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Health check: GET /`);
  console.log(`[Server] Create order: POST /create-order`);
  console.log(`[Server] Webhook:      POST /webhook`);
});

// ─── Cashfree API helper — native https (no extra deps) ──────────────────────
function cashfreeRequest(payload) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cashfree.com',
      path:     '/pg/orders',
      method:   'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-version':   '2023-08-01',
        'x-client-id':     process.env.APP_ID,      // from .env — never sent to browser
        'x-client-secret': process.env.SECRET_KEY,  // from .env — never sent to browser
        'Content-Length':  Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (cfRes) => {
      let data = '';
      cfRes.on('data', chunk => { data += chunk; });
      cfRes.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Cashfree response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Cashfree API request timed out after 10s'));
    });

    req.write(payload);
    req.end();
  });
}
