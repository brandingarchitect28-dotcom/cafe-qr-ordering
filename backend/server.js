'use strict';

const express = require('express');
const cors    = require('cors');
const https   = require('https');
require('dotenv').config();

// 🔥 Firebase Admin Init (REQUIRED FOR DB ACCESS)
const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      )
    });
    console.log("[Firebase] Initialized with service account");
  } catch (e) {
    console.log("[Firebase] Fallback to default init");
    admin.initializeApp();
  }
}

const db = admin.firestore();
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
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── GET / ────────────────────────────────────────────────────────────────────
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
// Creates a Cashfree payment order. Called by the frontend to initiate payment.
// Returns { payment_session_id, order_id, checkout_url } on success.
app.post('/create-order', async (req, res) => {
  const { orderId, amount, phone, cafeId, currency, customerName, returnUrl } = req.body;

  console.log('[create-order] ─── Incoming request ───────────────────────────');
  console.log('[create-order] body:', JSON.stringify(req.body));

  // ── Validate required fields ───────────────────────────────────────────────
  if (!orderId || !amount || !phone) {
    console.warn('[create-order] FAIL — missing required fields');
    return res.status(400).json({ error: 'orderId, amount and phone are required.' });
  }

  // ── Check API keys are configured ─────────────────────────────────────────
  let APP_ID = process.env.APP_ID;
let SECRET_KEY = process.env.SECRET_KEY;

try {
  if (cafeId) {
    console.log("[create-order] Fetching cafe keys for:", cafeId);

    const cafeDoc = await db.collection("cafes").doc(cafeId).get();

    if (cafeDoc.exists) {
      const cafeData = cafeDoc.data();

      const payment = cafeData?.paymentSettings;

    if (payment?.keyId && payment?.keySecret) {
      APP_ID = payment.keyId;
      SECRET_KEY = payment.keySecret;

    console.log("[create-order] Using CLIENT Cashfree keys:", APP_ID);
    } else {
    console.log("[create-order] Client keys missing, using DEFAULT keys");
  }
    } else {
      console.log("[create-order] Cafe not found, using DEFAULT keys");
    }
  } else {
    console.log("[create-order] No cafeId provided, using DEFAULT keys");
  }
} catch (err) {
  console.error("[create-order] Error fetching cafe keys:", err.message);
  console.log("[create-order] Falling back to DEFAULT keys");
}

  if (!APP_ID || !SECRET_KEY) {
    console.error('[create-order] FAIL — APP_ID or SECRET_KEY not set in Render env');
    return res.status(503).json({
      error: 'Payment service not configured. Contact the café owner.',
    });
  }

  // ── Build Cashfree order payload ───────────────────────────────────────────
  // uniqueOrderId format: {firestoreDocId}_{timestamp}
  // This lets the webhook extract the Firestore doc ID later.
  const uniqueOrderId = `${orderId}_${Date.now()}`;

  const orderPayload = {
    order_id:       uniqueOrderId,
    order_amount:   parseFloat(amount),
    order_currency: currency || 'INR',
    customer_details: {
      customer_id:    phone,
      customer_phone: phone,
      customer_name:  customerName || 'Customer',
    },
    order_meta: {
      return_url: returnUrl || `${req.headers.origin || ''}/track/${orderId}?order_id={order_id}`,
      notify_url: `https://${req.headers.host}/webhook/cashfree`,
    },
  };

  console.log('[create-order] Cashfree payload:', JSON.stringify(orderPayload));

  try {
    // ── Call Cashfree API via https.request (no browser CORS issue) ──────────
    const cfResponse = await new Promise((resolve, reject) => {
      const body = JSON.stringify(orderPayload);
      const options = {
        hostname: CF_HOST,
        path:     '/pg/orders',
        method:   'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-client-id':     APP_ID,
          'x-client-secret': SECRET_KEY,
          'x-api-version':   '2023-08-01',
          'Content-Length':  Buffer.byteLength(body),
        },
      };

      const request = https.request(options, (cfRes) => {
        let data = '';
        cfRes.on('data', chunk => { data += chunk; });
        cfRes.on('end', () => {
          try {
            resolve({ status: cfRes.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Cashfree response parse failed: ${data.slice(0, 200)}`));
          }
        });
      });

      request.on('error', reject);
      request.write(body);
      request.end();
    });

    console.log('[create-order] Cashfree response status:', cfResponse.status);
    console.log('[create-order] Cashfree response body:', JSON.stringify(cfResponse.body));

    if (cfResponse.status !== 200) {
      const errMsg = cfResponse.body?.message || cfResponse.body?.error || 'Cashfree error';
      console.error('[create-order] Cashfree error:', errMsg);
      return res.status(cfResponse.status).json({ error: errMsg });
    }

    // ── Return payment session to frontend ───────────────────────────────────
    const { payment_session_id, order_id, order_status } = cfResponse.body;

    return res.json({
      payment_session_id,
      order_id,
      order_status,
      checkout_url: `${CF_CHECKOUT_BASE}/${payment_session_id}`,
    });

  } catch (err) {
    console.error('[create-order] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Payment order creation failed. Please try again.' });
  }
});

// ─── Firebase Admin SDK ───────────────────────────────────────────────────────
// Set FIREBASE_SERVICE_ACCOUNT in Render env vars (JSON string of service account)
let firestoreDb = null;
try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountRaw) {
      console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT env var not set.');
    } else {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firestoreDb = admin.firestore();
      console.log('[Firebase] Admin SDK initialised ✓');
    }
  } else {
    firestoreDb = admin.firestore();
    console.log('[Firebase] Admin SDK already initialised ✓');
  }
} catch (e) {
  console.error('[Firebase] Check FIREBASE_SERVICE_ACCOUNT format (must be valid JSON string).');
  console.error('[Firebase] Error:', e.message);
}

// ─── uniqueOrderId helper ─────────────────────────────────────────────────────
// uniqueOrderId format: {firestoreDocId}_{timestamp}
// Example: XyZ1AbcDef9_1742803200000 → XyZ1AbcDef9
// Firebase auto-IDs are alphanumeric (no underscores), so last segment is always the timestamp.
function getFirestoreDocId(cashfreeOrderId) {
  if (!cashfreeOrderId) return null;
  const parts = String(cashfreeOrderId).split('_');
  if (parts.length < 2) return cashfreeOrderId; // no suffix — use as-is
  return parts.slice(0, -1).join('_');
}

// ─── POST /webhook/cashfree ───────────────────────────────────────────────────
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
  // Always respond 200 immediately — Cashfree retries on non-200
  res.status(200).send('OK');

  const body = req.body;
  console.log('[webhook] Webhook received');
  console.log('[webhook] Full payload:', JSON.stringify(body, null, 2));

  // ── Extract fields — support both v2 and v1 payload shapes ────────────────
  const cashfreeOrderId = body?.data?.order?.order_id    || body?.order_id    || null;
  const paymentStatus   = body?.data?.payment?.payment_status || body?.payment_status || null;
  const orderStatus     = body?.data?.order?.order_status     || body?.order_status   || null;
  const eventType       = body?.type || null;

  console.log('[webhook] cashfreeOrderId:', cashfreeOrderId);
  console.log('[webhook] paymentStatus  :', paymentStatus);
  console.log('[webhook] orderStatus    :', orderStatus);
  console.log('[webhook] eventType      :', eventType);

  // ── Determine outcome ─────────────────────────────────────────────────────
  const isSuccess = paymentStatus === 'SUCCESS'
    || orderStatus  === 'PAID'
    || eventType    === 'PAYMENT_SUCCESS_WEBHOOK';

  const isFailed  = paymentStatus === 'FAILED'
    || paymentStatus === 'USER_DROPPED'
    || eventType    === 'PAYMENT_FAILED_WEBHOOK';

  if (!cashfreeOrderId) {
    console.error('[webhook] No order_id in payload — cannot update Firestore');
    return;
  }

  // ── Derive Firestore document ID ──────────────────────────────────────────
  const firestoreDocId = getFirestoreDocId(cashfreeOrderId);
  console.log('[webhook] firestoreDocId:', firestoreDocId);

  // ── Skip if Firebase Admin not configured ─────────────────────────────────
  if (!firestoreDb) {
    console.warn('[webhook] Firestore not initialised — skipping DB update.');
    console.warn('[webhook] Add FIREBASE_SERVICE_ACCOUNT to Render env vars to enable.');
    return;
  }

  try {
    const orderRef  = firestoreDb.collection('orders').doc(firestoreDocId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.error('[webhook] Order not found in Firestore:', firestoreDocId);
      return;
    }

    console.log('[webhook] Order found:', firestoreDocId,
      '| current paymentStatus:', orderSnap.data()?.paymentStatus);

    if (isSuccess) {
      await orderRef.update({
        paymentStatus:    'paid',
        paidAt:           new Date(),
        cashfreeOrderId,
        webhookEventType: eventType,
      });
      console.log('[webhook] Order updated to PAID:', firestoreDocId);
    } else if (isFailed) {
      await orderRef.update({
        paymentStatus:    'failed',
        failedAt:         new Date(),
        cashfreeOrderId,
        webhookEventType: eventType,
      });
      console.log('[webhook] Order updated to FAILED:', firestoreDocId);
    } else {
      console.log('[webhook] Unrecognised status — no DB update. paymentStatus:', paymentStatus);
    }
  } catch (err) {
    console.error('[webhook] Firestore update error:', err.message);
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

// ─── POST /api/ai-menu-upload ─────────────────────────────────────────────────
// FIXED: Now uses OpenAI Vision (gpt-4o-mini) instead of Gemini.
//        Returns { preview: [...] } — DOES NOT write to Firebase.
//        Owner reviews preview and confirms before saving.
//
// Accepts: { cafeId, imageBase64, mimeType }
// Returns: { preview: [{ name, price, category, description, available }] }
app.post('/api/ai-menu-upload', async (req, res) => {
  try {
    const { cafeId, imageBase64, mimeType } = req.body;

    if (!cafeId)      return res.status(400).json({ error: 'cafeId is required' });
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    if (!mimeType)    return res.status(400).json({ error: 'mimeType is required' });

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(mimeType)) {
      return res.status(400).json({ error: 'Invalid file type. Use JPG, PNG, WebP, or PDF.' });
    }

    const approxBytes = (imageBase64.length * 3) / 4;
    if (approxBytes > 7 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum 5MB.' });
    }

    // ── Use OpenAI Vision (OPENAI_API_KEY from Render env) ───────────────────
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_KEY) {
      console.log(`[AI-Menu-Upload] Using OpenAI Vision for cafeId=${cafeId}`);

      const messages = [
        {
          role: 'system',
          content:
            'You are a restaurant menu extraction AI. ' +
            'Extract all menu items from the image. ' +
            'Return ONLY valid JSON array — no markdown, no explanation. ' +
            'Each item must have: name (string), price (number, strip ₹/Rs symbols), ' +
            'category (one of: Beverages, Food, Snacks, Desserts, Main Course, Starters, Other), ' +
            'description (string, may be empty), available (true). ' +
            'If price is unclear, use 0. ' +
            'Example: [{"name":"Burger","price":120,"category":"Food","description":"","available":true}]',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: 'text', text: 'Extract all menu items and return the JSON array.' },
          ],
        },
      ];

      const oaiPayload = JSON.stringify({
        model:       'gpt-4o-mini',
        messages,
        max_tokens:  2000,
        temperature: 0.1,
      });

      const rawText = await new Promise((resolve, reject) => {
        const request = https.request(
          {
            hostname: 'api.openai.com',
            path:     '/v1/chat/completions',
            method:   'POST',
            headers: {
              'Content-Type':   'application/json',
              'Authorization':  `Bearer ${OPENAI_KEY}`,
              'Content-Length': Buffer.byteLength(oaiPayload),
            },
          },
          (response) => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed.error) return reject(new Error(parsed.error.message));
                resolve((parsed.choices?.[0]?.message?.content || '').trim());
              } catch (e) {
                reject(new Error('Failed to parse OpenAI response'));
              }
            });
          }
        );
        request.on('error', reject);
        request.write(oaiPayload);
        request.end();
      });

      if (!rawText) {
        return res.status(502).json({ error: 'No response from AI. Try a clearer image.' });
      }

      let items;
      try {
        const cleaned = rawText
          .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        items = JSON.parse(cleaned);
      } catch {
        console.error('[AI-Menu-Upload] JSON parse failed. Raw:', rawText.slice(0, 300));
        return res.status(422).json({ error: 'AI returned invalid format. Try a clearer image.' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(422).json({ error: 'No menu items found in the image.' });
      }

      const VALID_CATS = ['Beverages','Food','Snacks','Desserts','Main Course','Starters','Other'];
      const preview = items
        .filter(i => i && typeof i === 'object')
        .map(i => ({
          name:        String(i.name        || '').trim().slice(0, 100),
          price:       Math.max(0, parseFloat(i.price) || 0),
          category:    VALID_CATS.includes(i.category) ? i.category : 'Other',
          description: String(i.description || '').trim().slice(0, 300),
          available:   true,
        }))
        .filter(i => i.name.length > 0);

      if (preview.length === 0) {
        return res.status(422).json({ error: 'Could not extract valid items. Try a clearer image.' });
      }

      console.log(`[AI-Menu-Upload] Preview: ${preview.length} items for cafeId=${cafeId}`);
      // IMPORTANT: Returns preview only — does NOT write to Firebase
      return res.json({ preview });
    }

    // ── Fallback: Gemini (GEMINI_API_KEY from Render env) ────────────────────
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[AI-Menu-Upload] Neither OPENAI_API_KEY nor GEMINI_API_KEY set.');
      return res.status(503).json({
        error: 'AI service not configured. Add OPENAI_API_KEY in Render → Environment.',
      });
    }

    console.log(`[AI-Menu-Upload] Using Gemini for cafeId=${cafeId}, type=${mimeType}, size≈${Math.round(approxBytes/1024)}KB`);

    const prompt = `You are a restaurant menu extraction AI.
Convert the uploaded menu into structured JSON.
Return ONLY JSON in this format:
[{ "name": "", "price": 0, "category": "", "description": "", "available": true }]
Rules:
- Remove currency symbols from prices. Price must be a number only.
- Auto detect category: Beverages, Food, Snacks, Desserts, Main Course, Starters, Other
- If price is missing or unclear, use 0
- No extra text outside the JSON array`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[AI-Menu-Upload] Gemini API error:', geminiRes.status, errText.slice(0, 300));
      return res.status(502).json({ error: 'AI service error. Check your Gemini API key.' });
    }

    const geminiData = await geminiRes.json();
    const rawText2   = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText2) {
      return res.status(502).json({ error: 'No response from AI. Try a clearer image.' });
    }

    let items2;
    try {
      const cleaned2 = rawText2
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      items2 = JSON.parse(cleaned2);
    } catch {
      console.error('[AI-Menu-Upload] JSON parse failed. Raw:', rawText2.slice(0, 300));
      return res.status(422).json({ error: 'AI returned invalid format. Try a clearer menu image.' });
    }

    if (!Array.isArray(items2) || items2.length === 0) {
      return res.status(422).json({ error: 'No menu items found in the image.' });
    }

    const VALID_CATS2 = ['Beverages','Food','Snacks','Desserts','Main Course','Starters','Other'];
    const preview2 = items2
      .filter(i => i && typeof i === 'object')
      .map(i => ({
        name:        String(i.name        || '').trim().slice(0, 100),
        price:       Math.max(0, parseFloat(i.price) || 0),
        category:    VALID_CATS2.includes(i.category) ? i.category : 'Other',
        description: String(i.description || '').trim().slice(0, 300),
        available:   true,
      }))
      .filter(i => i.name.length > 0);

    if (preview2.length === 0) {
      return res.status(422).json({ error: 'Could not extract valid items. Try a clearer image.' });
    }

    console.log(`[AI-Menu-Upload] Gemini preview: ${preview2.length} items for cafeId=${cafeId}`);
    // Returns preview only — does NOT write to Firebase
    return res.json({ preview: preview2 });

  } catch (err) {
    console.error('[AI-Menu-Upload] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// ─── GET /test-gemini ─────────────────────────────────────────────────────────
// Verifies GEMINI_API_KEY is set and the Gemini API responds.
app.get('/test-gemini', async (req, res) => {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY not set. Add it in Render → Environment Variables.',
      });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hello from SmartCafe AI' }] }],
          generationConfig: { maxOutputTokens: 64 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[test-gemini] Gemini API error:', geminiRes.status, errText.slice(0, 200));
      return res.status(502).json({
        success: false,
        error: `Gemini API returned ${geminiRes.status}. Check your API key is valid.`,
      });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '(no text)';

    console.log('[test-gemini] Success:', text.slice(0, 80));
    return res.json({ success: true, message: text });

  } catch (error) {
    console.error('[test-gemini] Unexpected error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/save-api-keys ──────────────────────────────────────────────────
// Accepts API keys from the admin panel and returns instructions.
// Keys are NOT stored here — they must be set manually in Render → Environment.
app.post('/api/save-api-keys', (req, res) => {
  const { openaiKey, geminiKey, whatsappKey } = req.body || {};

  if (!openaiKey && !geminiKey && !whatsappKey) {
    return res.status(400).json({ error: 'No keys provided.' });
  }

  // Log which key types were received (never log the actual values)
  const received = [
    openaiKey   && 'OPENAI_API_KEY',
    geminiKey   && 'GEMINI_API_KEY',
    whatsappKey && 'WHATSAPP_API_KEY',
  ].filter(Boolean);

  console.log('[save-api-keys] Keys received for:', received.join(', '));

  const instructions = [];
  if (openaiKey)   instructions.push(`OPENAI_API_KEY = ${openaiKey.slice(0, 8)}...`);
  if (geminiKey)   instructions.push(`GEMINI_API_KEY = ${geminiKey.slice(0, 8)}...`);
  if (whatsappKey) instructions.push(`WHATSAPP_API_KEY = ${whatsappKey.slice(0, 8)}...`);

  return res.json({
    success: true,
    message: `Keys received ✓ — add them in Render → Environment Variables: ${received.join(', ')}`,
    instructions,
  });
});

// ─── POST /api/ai-assistant ───────────────────────────────────────────────────
// FIXED: Proper try/catch, accepts both { question } and { query },
//        uses https.request (not fetch) with already-declared https module.
//        Never crashes the server — always returns a JSON response.
//
// Accepts: { cafeId, question } OR { cafeId, query }
// Returns: { reply: "..." }
app.post('/api/ai-assistant', async (req, res) => {
  try {
    // Accept both field names — frontend may send either
    const cafeId   = req.body?.cafeId;
    const question = (req.body?.question || req.body?.query || '').trim();

    // ── 1. Input validation ────────────────────────────────────────────────
    if (!cafeId) {
      console.warn('[AI-Assistant] Missing cafeId. Body:', JSON.stringify(req.body));
      return res.status(400).json({ error: 'cafeId is required.' });
    }
    if (!question) {
      console.warn('[AI-Assistant] Missing question. Body:', JSON.stringify(req.body));
      return res.status(400).json({ error: 'question is required.' });
    }

    // ── 2. API key guard ───────────────────────────────────────────────────
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      console.error('[AI-Assistant] OPENAI_API_KEY not set in Render environment.');
      return res.status(503).json({
        error: 'AI service not configured. Add OPENAI_API_KEY in Render → Environment.',
      });
    }

    console.log(`[AI-Assistant] cafeId=${cafeId} question="${question.slice(0, 80)}"`);

    // ── 3. Build OpenAI request ────────────────────────────────────────────
    const payload = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a café business assistant for SmartCafé OS. ' +
            'Answer questions clearly and concisely based only on what you are told. ' +
            'If you lack enough information, say so honestly. ' +
            'Keep answers under 120 words unless a detailed breakdown is explicitly requested.',
        },
        {
          role: 'user',
          content: `Café ID: ${cafeId}\n\nQuestion: ${question}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });

    // ── 4. Call OpenAI via https (already required at top of file) ─────────
    const answer = await new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: 'api.openai.com',
          path:     '/v1/chat/completions',
          method:   'POST',
          headers: {
            'Content-Type':   'application/json',
            'Authorization':  `Bearer ${OPENAI_KEY}`,
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (response) => {
          let body = '';
          response.on('data', chunk => { body += chunk; });
          response.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (parsed.error) {
                console.error('[AI-Assistant] OpenAI error:', parsed.error.message);
                return reject(new Error(parsed.error.message || 'OpenAI returned an error'));
              }
              const text = (parsed.choices?.[0]?.message?.content || '').trim();
              resolve(text || 'No response from AI.');
            } catch (e) {
              reject(new Error('Failed to parse OpenAI response'));
            }
          });
        }
      );

      request.on('error', (e) => {
        console.error('[AI-Assistant] HTTPS error:', e.message);
        reject(e);
      });

      request.write(payload);
      request.end();
    });

    console.log(`[AI-Assistant] Answered (${answer.length} chars)`);
    return res.json({ reply: answer });

  } catch (err) {
    // Outer catch: nothing can crash the server or leave the request hanging
    console.error('[AI-Assistant] Error:', err.message);
    return res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

// ─── POST /api/send-whatsapp-campaign ─────────────────────────────────────────
// Queue-based WhatsApp marketing campaign.
// Validates, deduplicates, creates a campaign doc in Firestore,
// then processes each customer sequentially with a 400ms delay.
// Uses placeholder logic — ready to swap for Meta/Twilio later.
//
// Request body: { cafeId, customers: [{ name, phone }], message }

function formatWANumber(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function sendWhatsAppMessage(phone, message) {
  const formatted = formatWANumber(phone);
  if (!formatted || formatted.length < 10) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  // PLACEHOLDER — swap with Meta or Twilio SDK call here:
  // await twilioClient.messages.create({ from: 'whatsapp:+14155238886', to: `whatsapp:+${formatted}`, body: message });
  console.log(`[WA-Campaign] Sent to +${formatted} (${message.slice(0, 40)}...)`);
  return { phone: formatted, status: 'sent' };
}

const activeCampaigns = new Set();

app.post('/api/send-whatsapp-campaign', async (req, res) => {
  const { cafeId, customers, message } = req.body || {};

  if (!cafeId)                                    return res.status(400).json({ error: 'cafeId is required.' });
  if (!message?.trim())                           return res.status(400).json({ error: 'message is required.' });
  if (!Array.isArray(customers) || customers.length === 0)
    return res.status(400).json({ error: 'customers array is required and must not be empty.' });

  if (activeCampaigns.has(cafeId)) {
    return res.status(429).json({ error: 'A campaign is already running for this café. Please wait.' });
  }

  // Deduplicate and validate phone numbers
  const seen  = new Set();
  const valid = customers
    .map(c => ({ ...c, phone: formatWANumber(c.phone) }))
    .filter(c => {
      if (!c.phone || c.phone.length < 10) return false;
      if (seen.has(c.phone)) return false;
      seen.add(c.phone);
      return true;
    })
    .slice(0, 200);

  if (valid.length === 0) {
    return res.status(400).json({ error: 'No valid phone numbers found after validation.' });
  }

  // Create campaign record in Firestore (if available)
  let campaignRef = null;
  if (firestoreDb) {
    try {
      campaignRef = await firestoreDb.collection('whatsapp_campaigns').add({
        cafeId,
        total:     valid.length,
        sent:      0,
        failed:    0,
        status:    'running',
        message:   message.slice(0, 500),
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[WA-Campaign] Firestore campaign create error:', e.message);
    }
  }

  // Respond immediately — processing continues in background
  res.json({
    success:    true,
    campaignId: campaignRef?.id || null,
    total:      valid.length,
    message:    `Campaign started for ${valid.length} customers.`,
  });

  // ── Background processing ─────────────────────────────────────────────────
  activeCampaigns.add(cafeId);
  let sent = 0; let failed = 0;

  for (const customer of valid) {
    try {
      await sendWhatsAppMessage(customer.phone, message);
      sent++;
    } catch (err) {
      console.error(`[WA-Campaign] Failed for ${customer.phone}:`, err.message);
      failed++;
    }

    // Update progress in Firestore
    if (campaignRef) {
      campaignRef.update({ sent, failed }).catch(() => {});
    }

    // 400ms delay between messages
    await new Promise(r => setTimeout(r, 400));
  }

  if (campaignRef) {
    campaignRef.update({ status: 'completed', completedAt: new Date() }).catch(() => {});
  }

  activeCampaigns.delete(cafeId);
  console.log(`[WA-Campaign] Completed for cafeId=${cafeId}: ${sent} sent, ${failed} failed`);
});

// ✅ Service Charge Total API (SAFE ADDITION)
app.get("/api/service-charge-total", async (req, res) => {
  try {
    const { cafeId, from, to } = req.query;

    if (!cafeId) {
      return res.status(400).json({ error: "cafeId required" });
    }

    const snapshot = await db.collection("orders")
      .where("cafeId", "==", cafeId)
      .get();

    let total = 0;

snapshot.forEach(doc => {
  const data = doc.data();

  console.log("ORDER:", data);

  const isPaid =
    data.paymentStatus === 'paid' ||
    data.paymentStatus === 'SUCCESS' ||
    data.status === 'paid';

  console.log("isPaid:", isPaid);
  console.log("serviceChargeAmount:", data.serviceChargeAmount);

  if (isPaid) {
    total += data.serviceChargeAmount || 0;
  }
});

    res.json({ total });

  } catch (err) {
    console.error("Service charge error:", err);
    res.status(500).json({ total: 0 });
  }
  
});
// ─── 404 — must be AFTER all routes ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global error handler — must be AFTER all routes ─────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server]   GET  /                           → health check`);
  console.log(`[Server]   POST /create-order               → Cashfree order creation`);
  console.log(`[Server]   POST /webhook/cashfree           → payment status callback`);
  console.log(`[Server]   POST /webhook                    → payment status callback (compat)`);
  console.log(`[Server]   POST /api/ai-menu-upload         → AI menu extraction (preview)`);
  console.log(`[Server]   GET  /test-gemini                → Gemini API key verification`);
  console.log(`[Server]   POST /api/save-api-keys          → API key instructions`);
  console.log(`[Server]   POST /api/ai-assistant           → AI business assistant`);
  console.log(`[Server]   POST /api/send-whatsapp-campaign → WhatsApp bulk campaign`);
});
