/**
 * functions/index.js
 * Branding Architect – SmartCafé OS Cloud Functions
 *
 * Functions:
 *  1. generateAIInsights     — Gemini AI business insights
 *  2. extractMenuFromImage   — Gemini Vision menu extraction
 *  3. sendWhatsAppInvoice    — WhatsApp invoice via API
 *  4. getApiConfig           — Secure key delivery to authed clients
 *
 * Security: API keys NEVER exposed to frontend.
 * All Gemini / WhatsApp calls happen server-side only.
 */

const functions   = require('firebase-functions');
const admin       = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

admin.initializeApp();
const db = admin.firestore();

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the Gemini API key stored in Firestore by the admin.
 * Document: systemConfig/apiKeys  (admin-only read in rules)
 * Field: geminiKey (stored encrypted — decrypted here using XOR with a salt)
 */
const getGeminiKey = async () => {
  const snap = await db.doc('systemConfig/apiKeys').get();
  if (!snap.exists) throw new Error('Gemini API key not configured in admin panel');
  const data = snap.data();
  // Simple XOR decrypt — replace with KMS in enterprise deployments
  return xorDecrypt(data.geminiKey, process.env.ENCRYPT_SALT || 'barchitect2026');
};

const getWhatsAppKey = async () => {
  const snap = await db.doc('systemConfig/apiKeys').get();
  if (!snap.exists) throw new Error('WhatsApp API key not configured');
  const data = snap.data();
  return xorDecrypt(data.whatsappKey, process.env.ENCRYPT_SALT || 'barchitect2026');
};

// XOR cipher for API key obfuscation in Firestore
// For production, use Google Cloud Secret Manager instead
const xorEncrypt = (text, key) => {
  if (!text) return '';
  return Buffer.from(
    text.split('').map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).toString('base64');
};

const xorDecrypt = (encoded, key) => {
  if (!encoded) return '';
  try {
    const bytes = Buffer.from(encoded, 'base64');
    return Array.from(bytes)
      .map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length)))
      .join('');
  } catch {
    return encoded; // fallback — may not be encrypted yet
  }
};

// Verify caller is authenticated and owns the cafeId
const verifyAuth = async (context, cafeId) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
  const userDoc = await db.doc(`users/${context.auth.uid}`).get();
  if (!userDoc.exists) throw new functions.https.HttpsError('permission-denied', 'User not found');
  const userData = userDoc.data();
  if (userData.role !== 'admin' && userData.cafeId !== cafeId) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied');
  }
  return userData;
};

// ─── 1. AI Insights ──────────────────────────────────────────────────────────

exports.generateAIInsights = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    const { cafeId, dateRange = 7 } = data;
    await verifyAuth(context, cafeId);

    try {
      // Check feature flag
      const cafeDoc = await db.doc(`cafes/${cafeId}`).get();
      const cafe    = cafeDoc.data();
      if (!cafe?.features?.aiInsights) {
        throw new functions.https.HttpsError('failed-precondition', 'AI Insights not enabled for this café');
      }

      // ── Fetch data ────────────────────────────────────────────────────
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dateRange);

      const [ordersSnap, inventorySnap, menuSnap] = await Promise.all([
        db.collection('orders')
          .where('cafeId', '==', cafeId)
          .get(),
        db.collection('inventory')
          .where('cafeId', '==', cafeId)
          .get(),
        db.collection('menuItems')
          .where('cafeId', '==', cafeId)
          .get(),
      ]);

      const allOrders   = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const inventory   = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const menuItems   = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filter to date range
      const orders = allOrders.filter(o => {
        const t = o.createdAt?.toDate?.() || new Date(0);
        return t >= cutoff;
      });

      // ── Pre-calculate analytics ───────────────────────────────────────
      const totalRevenue    = orders.filter(o => o.paymentStatus === 'paid')
        .reduce((s, o) => s + (o.totalAmount || 0), 0);
      const totalOrders     = orders.length;
      const avgOrderValue   = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Item sales
      const itemSales = {};
      orders.forEach(o => {
        (o.items || []).forEach(item => {
          if (!itemSales[item.name]) itemSales[item.name] = { qty: 0, revenue: 0 };
          itemSales[item.name].qty     += item.quantity || 1;
          itemSales[item.name].revenue += (item.price || 0) * (item.quantity || 1);
        });
      });
      const sortedItems    = Object.entries(itemSales).sort((a, b) => b[1].qty - a[1].qty);
      const bestSelling    = sortedItems.slice(0, 5).map(([name, s]) => ({ name, ...s }));
      const leastSelling   = sortedItems.slice(-5).map(([name, s]) => ({ name, ...s }));

      // Peak hours
      const hourCounts = {};
      orders.forEach(o => {
        const h = o.createdAt?.toDate?.()?.getHours?.();
        if (h !== undefined) hourCounts[h] = (hourCounts[h] || 0) + 1;
      });
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

      // External vs in-store
      const externalOrders = orders.filter(o => o.externalOrder);
      const instoreOrders  = orders.filter(o => !o.externalOrder);
      const externalRevenue = externalOrders.filter(o => o.paymentStatus === 'paid')
        .reduce((s, o) => s + (o.totalAmount || 0), 0);

      // Low stock
      const lowStock = inventory.filter(i => i.quantity <= i.lowStockThreshold);

      // ── Build structured prompt ───────────────────────────────────────
      const analyticsPayload = {
        cafe: { name: cafe.name, currency: cafe.currencySymbol || '₹' },
        period: `Last ${dateRange} days`,
        revenue: { total: totalRevenue.toFixed(2), avgOrderValue: avgOrderValue.toFixed(2) },
        orders: {
          total: totalOrders,
          external: externalOrders.length,
          inStore: instoreOrders.length,
          externalRevenue: externalRevenue.toFixed(2),
        },
        topItems: bestSelling,
        bottomItems: leastSelling,
        peakHour: peakHour ? `${peakHour[0]}:00 (${peakHour[1]} orders)` : 'Unknown',
        lowStockItems: lowStock.map(i => ({ name: i.itemName, qty: i.quantity, unit: i.unit })),
        menuItemCount: menuItems.length,
      };

      const prompt = `
You are an expert café business consultant and revenue growth strategist.
Analyse this café's data and provide comprehensive, actionable insights in JSON format.

CAFÉ DATA:
${JSON.stringify(analyticsPayload, null, 2)}

Generate a detailed business intelligence report in this EXACT JSON structure:
{
  "summary": {
    "headline": "one powerful sentence summarising performance",
    "overallHealth": "excellent|good|average|needs_attention",
    "healthScore": 0-100
  },
  "revenue": {
    "analysis": "detailed revenue analysis (2-3 sentences)",
    "trend": "growing|stable|declining",
    "profitEstimation": "estimated profit margin reasoning",
    "targetNextWeek": "realistic revenue target"
  },
  "products": {
    "stars": ["top performing items with reason"],
    "toPromote": ["items to push more"],
    "toDrop": ["underperforming items recommendation"],
    "comboSuggestions": ["specific combo ideas with pricing"],
    "pricingOpportunities": ["specific items where price can be increased"]
  },
  "operations": {
    "peakHourStrategy": "what to do during peak hours",
    "offPeakStrategy": "how to drive sales in slow hours",
    "inventoryAlert": "inventory insights and predictions",
    "staffingHint": "staffing recommendation based on data"
  },
  "growth": {
    "upsellStrategies": ["3 specific upsell tactics"],
    "timeBasedOffers": ["3 specific time-based promotions"],
    "customerRetention": "retention strategy",
    "externalPlatformStrategy": "Zomato/Swiggy optimisation advice"
  },
  "marketing": {
    "whatsappMessage": "ready-to-send WhatsApp marketing message for customers (emoji-rich, engaging, under 200 words)",
    "topOffer": "best offer to run right now",
    "campaignIdea": "one creative campaign idea"
  },
  "actionPlan": {
    "today": ["3 things to do today"],
    "thisWeek": ["3 things to do this week"],
    "thisMonth": ["3 strategic moves this month"]
  }
}
Return ONLY valid JSON. No markdown, no explanation.`;

      const geminiKey = await getGeminiKey();
      const genAI     = new GoogleGenerativeAI(geminiKey);
      const model     = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const result   = await model.generateContent(prompt);
      const rawText  = result.response.text().trim();

      // Parse and validate JSON
      let insights;
      try {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        insights = JSON.parse(cleaned);
      } catch {
        throw new functions.https.HttpsError('internal', 'AI response parsing failed');
      }

      // Cache insights in Firestore (TTL: 1 hour)
      await db.doc(`cafes/${cafeId}/aiCache/insights`).set({
        insights,
        analyticsSnapshot: analyticsPayload,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      return { success: true, insights, analyticsSnapshot: analyticsPayload };

    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error('[generateAIInsights]', err);
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

// ─── 2. AI Menu Extraction ────────────────────────────────────────────────────

exports.extractMenuFromImage = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    const { cafeId, imageBase64, mimeType = 'image/jpeg' } = data;
    await verifyAuth(context, cafeId);

    try {
      const cafeDoc = await db.doc(`cafes/${cafeId}`).get();
      if (!cafeDoc.data()?.features?.aiMenu) {
        throw new functions.https.HttpsError('failed-precondition', 'AI Menu Upload not enabled');
      }

      const geminiKey = await getGeminiKey();
      const genAI     = new GoogleGenerativeAI(geminiKey);
      const model     = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
You are a menu digitisation expert. Extract all menu items from this image/document.

Return ONLY a JSON array with this exact structure:
[
  {
    "name": "item name",
    "price": 120,
    "category": "category name",
    "description": "brief description or empty string"
  }
]

Rules:
- price must be a number (no currency symbols)
- category should be one of: Beverages, Food, Snacks, Desserts, Main Course, Starters, Other
- If price is unclear, use 0
- Return ONLY the JSON array, no markdown, no explanation`;

      const result = await model.generateContent([
        prompt,
        { inlineData: { data: imageBase64, mimeType } },
      ]);

      const rawText = result.response.text().trim();
      let items;
      try {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        items = JSON.parse(cleaned);
        if (!Array.isArray(items)) throw new Error('Not an array');
      } catch {
        throw new functions.https.HttpsError('internal', 'Could not parse menu from image');
      }

      // Validate and sanitise
      const sanitised = items
        .filter(i => i.name && typeof i.name === 'string')
        .map(i => ({
          name:        String(i.name).trim(),
          price:       parseFloat(i.price) || 0,
          category:    String(i.category || 'Other').trim(),
          description: String(i.description || '').trim(),
        }));

      return { success: true, items: sanitised };

    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error('[extractMenuFromImage]', err);
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

// ─── 3. Send WhatsApp Invoice ─────────────────────────────────────────────────

exports.sendWhatsAppInvoice = functions.https.onCall(async (data, context) => {
  const { cafeId, orderId, phone, invoiceUrl } = data;
  await verifyAuth(context, cafeId);

  try {
    const cafeDoc  = await db.doc(`cafes/${cafeId}`).get();
    const cafe     = cafeDoc.data();
    if (!cafe?.features?.whatsapp) {
      throw new functions.https.HttpsError('failed-precondition', 'WhatsApp feature not enabled');
    }

    const waKey = await getWhatsAppKey();

    // Fetch invoice details
    const invSnap = await db.collection('invoices').where('orderId', '==', orderId).get();
    if (invSnap.empty) throw new functions.https.HttpsError('not-found', 'Invoice not found');
    const invoice  = invSnap.docs[0].data();
    const cur      = invoice.currencySymbol || '₹';

    const message =
      `Thank you for visiting *${cafe.name}* ☕\n\n` +
      `Your invoice is ready.\n` +
      `*Invoice No:* ${invoice.invoiceNumber}\n` +
      `*Amount:* ${cur}${(invoice.totalAmount || 0).toFixed(2)}\n\n` +
      `View & download: ${invoiceUrl}\n\n` +
      `_Thank you for your business!_ 🙏`;

    // Using WhatsApp Business API (Cloud API)
    const cleanPhone = phone.replace(/\D/g, '');
    const response = await fetch(
      `https://graph.facebook.com/v19.0/YOUR_PHONE_NUMBER_ID/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      console.error('[sendWhatsAppInvoice] WA API error:', result);
      throw new functions.https.HttpsError('internal', 'WhatsApp delivery failed');
    }

    return { success: true, messageId: result.messages?.[0]?.id };

  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[sendWhatsAppInvoice]', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});

// ─── 4. Save API Keys (admin only) ───────────────────────────────────────────

exports.saveApiKeys = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');

  const userDoc = await db.doc(`users/${context.auth.uid}`).get();
  if (userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const { geminiKey, whatsappKey } = data;
  const salt = process.env.ENCRYPT_SALT || 'barchitect2026';

  const toSave = {};
  if (geminiKey)    toSave.geminiKey    = xorEncrypt(geminiKey, salt);
  if (whatsappKey)  toSave.whatsappKey  = xorEncrypt(whatsappKey, salt);

  if (!Object.keys(toSave).length) {
    throw new functions.https.HttpsError('invalid-argument', 'No keys provided');
  }

  await db.doc('systemConfig/apiKeys').set(toSave, { merge: true });
  return { success: true };
});

// ─── 5. Get cached insights ───────────────────────────────────────────────────

exports.getCachedInsights = functions.https.onCall(async (data, context) => {
  const { cafeId } = data;
  await verifyAuth(context, cafeId);

  const cacheDoc = await db.doc(`cafes/${cafeId}/aiCache/insights`).get();
  if (!cacheDoc.exists) return { success: true, cached: false };

  const cache = cacheDoc.data();
  const now   = new Date();
  const exp   = cache.expiresAt?.toDate?.() || new Date(0);

  if (now > exp) return { success: true, cached: false };

  return {
    success: true,
    cached: true,
    insights: cache.insights,
    analyticsSnapshot: cache.analyticsSnapshot,
    generatedAt: cache.generatedAt?.toDate?.()?.toISOString(),
  };
});
