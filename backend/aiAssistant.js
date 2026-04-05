/**
 * aiAssistant.js
 *
 * Central AI handler for SmartCafé OS.
 * Mounted in server.js — all routes are additive; zero existing routes touched.
 *
 * New routes added to Render backend:
 *   POST /api/ai-assistant        — main chat handler
 *   POST /api/ai-bill-upload      — bill image → inventory extraction
 *   POST /api/ai-action/execute   — execute a confirmed action intent
 *
 * Architecture:
 *   AskAI.jsx  →  POST /api/ai-assistant  →  fetchRelevantData()
 *              →  OpenAI (process.env.OPENAI_API_KEY)
 *              →  { answer, type, actionIntent? }
 *
 * KEY RULES:
 *  - OpenAI called ONLY here (backend). Never from frontend.
 *  - firestoreDb is the already-initialised Admin SDK instance from server.js
 *  - Never directly writes to DB from AI response.
 *    AI returns an actionIntent; owner confirms; /ai-action/execute writes.
 */

'use strict';

const https = require('https');

// ─── System prompt (mandatory per spec) ──────────────────────────────────────
const SYSTEM_PROMPT = `You are a restaurant business AI assistant and digital manager.
You ONLY answer using the provided data.
You help the owner increase revenue, manage inventory, staff, customers, and operations.
You never guess missing information.
You give clear, actionable, and business-focused answers.
Keep responses concise (under 150 words unless a detailed breakdown is explicitly requested).
Always use ₹ for currency unless the data specifies otherwise.`;

// ─── Intent detection ─────────────────────────────────────────────────────────
// Maps a plain-text question to one of 7 intent buckets so we only fetch
// the collections that are actually needed.
function detectIntent(question) {
  const q = question.toLowerCase();

  if (/staff|employ|absent|attend|salary|wage|payroll|shift|worker/.test(q))
    return 'staff_query';
  if (/tax|gst|vat|invoice|bill.*collect|collect.*tax/.test(q))
    return 'tax_query';
  if (/invent|stock|item.*left|remain|low.*stock|restock|supply|material/.test(q))
    return 'inventory_query';
  if (/whatsapp.*send|campaign|market|promo|message.*customer|customer.*message/.test(q))
    return 'marketing_query';
  if (/add.*item|add.*menu|update.*invent|change.*price|action|do something/.test(q))
    return 'action_request';
  if (/revenue|sale|earn|income|profit|total|today|week|month|upi|cash|payment|order.*count/.test(q))
    return 'revenue_query';
  // Default — broad analytics
  return 'analytics_query';
}

// ─── Data fetchers (selective — only what the intent needs) ──────────────────

async function fetchRevenueData(db, cafeId) {
  const now       = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);

  const snap = await db.collection('orders')
    .where('cafeId', '==', cafeId)
    .get();

  const allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const paid = allOrders.filter(o => o.paymentStatus === 'paid');

  const todayOrders  = paid.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= todayStart);
  const weeklyOrders = paid.filter(o => (o.createdAt?.toDate?.() || new Date(0)) >= weekStart);

  const revenueToday  = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const revenueWeekly = weeklyOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const revenueTotal  = paid.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const avgOrderValue = paid.length > 0 ? revenueTotal / paid.length : 0;

  // Payment method breakdown
  const paymentBreakdown = {};
  allOrders.forEach(o => {
    const m = o.paymentMode || 'counter';
    paymentBreakdown[m] = (paymentBreakdown[m] || 0) + 1;
  });

  // Top and low selling items (all orders, not just paid, to show popularity)
  const itemMap = {};
  allOrders.forEach(o => {
    (o.items || []).forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0 };
      itemMap[i.name].qty     += (i.quantity || 1);
      itemMap[i.name].revenue += (i.price || 0) * (i.quantity || 1);
    });
  });
  const sorted       = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty);
  const topItems     = sorted.slice(0, 5).map(([name, s]) => ({ name, ...s }));
  const lowItems     = sorted.slice(-5).map(([name, s]) => ({ name, ...s }));

  // Peak hours
  const hourMap = {};
  allOrders.forEach(o => {
    const h = o.createdAt?.toDate?.()?.getHours?.();
    if (h !== undefined) hourMap[h] = (hourMap[h] || 0) + 1;
  });
  const peakEntry = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
  const peakHour  = peakEntry ? `${peakEntry[0]}:00–${Number(peakEntry[0]) + 1}:00 (${peakEntry[1]} orders)` : 'Unknown';

  // Tax collected (use gstAmount / taxAmount fields if present)
  const taxCollected = paid.reduce((s, o) => s + (o.gstAmount || o.taxAmount || 0), 0);

  return {
    totalOrders:      allOrders.length,
    paidOrders:       paid.length,
    todayOrders:      todayOrders.length,
    revenueToday:     +revenueToday.toFixed(2),
    revenueWeekly:    +revenueWeekly.toFixed(2),
    revenueTotal:     +revenueTotal.toFixed(2),
    avgOrderValue:    +avgOrderValue.toFixed(2),
    paymentBreakdown,
    topItems,
    lowSellingItems:  lowItems,
    peakHour,
    taxCollected:     +taxCollected.toFixed(2),
  };
}

async function fetchInventoryData(db, cafeId) {
  const snap = await db.collection('inventory')
    .where('cafeId', '==', cafeId)
    .get();

  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const lowStock = items.filter(i =>
    typeof i.quantity === 'number' &&
    typeof i.lowStockThreshold === 'number' &&
    i.quantity <= i.lowStockThreshold
  );

  return {
    totalItems: items.length,
    items: items.map(i => ({
      id:        i.id,
      name:      i.itemName || i.name,
      quantity:  i.quantity,
      unit:      i.unit,
      threshold: i.lowStockThreshold,
    })),
    lowStockItems: lowStock.map(i => ({
      id:        i.id,
      name:      i.itemName || i.name,
      quantity:  i.quantity,
      unit:      i.unit,
      threshold: i.lowStockThreshold,
    })),
    lowStockCount: lowStock.length,
  };
}

async function fetchStaffData(db, cafeId) {
  const now       = new Date();
  const todayKey  = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthKey  = now.toISOString().slice(0, 7);  // YYYY-MM

  const [staffSnap, attendSnap, salarySnap] = await Promise.all([
    db.collection('staff').where('cafeId', '==', cafeId).get(),
    db.collection('attendance').where('cafeId', '==', cafeId).where('date', '==', todayKey).get(),
    db.collection('salary').where('cafeId', '==', cafeId).where('month', '==', monthKey).get(),
  ]);

  const staff      = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attendance = attendSnap.docs.map(d => d.data());
  const salaries   = salarySnap.docs.map(d => d.data());

  const presentToday  = attendance.filter(a => a.status === 'present' || a.checkIn).map(a => a.staffId);
  const absentToday   = staff.filter(s => !presentToday.includes(s.id)).map(s => s.name || s.id);
  const totalPayroll  = salaries.reduce((s, sl) => s + (sl.finalSalary || 0), 0);

  return {
    totalStaff: staff.length,
    presentToday: presentToday.length,
    absentToday,
    staff: staff.map(s => ({ id: s.id, name: s.name, role: s.role, salary: s.baseSalary })),
    totalMonthlyPayroll: +totalPayroll.toFixed(2),
  };
}

async function fetchTaxData(db, cafeId) {
  // Re-use revenue query but focus on tax fields
  const snap = await db.collection('orders')
    .where('cafeId', '==', cafeId)
    .where('paymentStatus', '==', 'paid')
    .get();

  const orders = snap.docs.map(d => d.data());

  const gstCollected     = orders.reduce((s, o) => s + (o.gstAmount    || 0), 0);
  const taxCollected     = orders.reduce((s, o) => s + (o.taxAmount     || 0), 0);
  const serviceCharge    = orders.reduce((s, o) => s + (o.serviceChargeAmount || 0), 0);
  const grossRevenue     = orders.reduce((s, o) => s + (o.totalAmount   || 0), 0);
  const subtotalRevenue  = orders.reduce((s, o) => s + (o.subtotalAmount || 0), 0);

  return {
    paidOrderCount:  orders.length,
    grossRevenue:    +grossRevenue.toFixed(2),
    subtotal:        +subtotalRevenue.toFixed(2),
    gstCollected:    +gstCollected.toFixed(2),
    taxCollected:    +taxCollected.toFixed(2),
    serviceCharge:   +serviceCharge.toFixed(2),
    totalTax:        +(gstCollected + taxCollected).toFixed(2),
  };
}

async function fetchCustomerData(db, cafeId) {
  const snap = await db.collection('orders')
    .where('cafeId', '==', cafeId)
    .get();

  const orders = snap.docs.map(d => d.data());

  const phoneMap = {};
  orders.forEach(o => {
    const phone = o.customerPhone;
    if (!phone) return;
    if (!phoneMap[phone]) {
      phoneMap[phone] = { name: o.customerName || 'Customer', count: 0, spend: 0 };
    }
    phoneMap[phone].count++;
    phoneMap[phone].spend += (o.totalAmount || 0);
  });

  const customers     = Object.values(phoneMap);
  const repeatCustomers = customers.filter(c => c.count > 1);
  const topCustomers  = customers.sort((a, b) => b.spend - a.spend).slice(0, 5);

  return {
    uniqueCustomers:   customers.length,
    repeatCustomers:   repeatCustomers.length,
    repeatRate:        customers.length > 0
      ? +((repeatCustomers.length / customers.length) * 100).toFixed(1)
      : 0,
    topCustomersBySpend: topCustomers.map(c => ({ name: c.name, orders: c.count, spend: +c.spend.toFixed(2) })),
  };
}

// ─── Selective data fetch by intent ──────────────────────────────────────────
async function fetchRelevantData(db, cafeId, intent) {
  switch (intent) {
    case 'staff_query':
      return { staff: await fetchStaffData(db, cafeId) };

    case 'tax_query':
      return { taxes: await fetchTaxData(db, cafeId) };

    case 'inventory_query':
      return { inventory: await fetchInventoryData(db, cafeId) };

    case 'marketing_query': {
      const [revenue, customers] = await Promise.all([
        fetchRevenueData(db, cafeId),
        fetchCustomerData(db, cafeId),
      ]);
      return { revenue, customers };
    }

    case 'action_request':
      // Actions need inventory + revenue context to validate
      return {
        inventory: await fetchInventoryData(db, cafeId),
        revenue:   await fetchRevenueData(db, cafeId),
      };

    case 'revenue_query':
      return { revenue: await fetchRevenueData(db, cafeId) };

    case 'analytics_query':
    default: {
      const [revenue, inventory, customers] = await Promise.all([
        fetchRevenueData(db, cafeId),
        fetchInventoryData(db, cafeId),
        fetchCustomerData(db, cafeId),
      ]);
      return { revenue, inventory, customers };
    }
  }
}

// ─── OpenAI call (backend only, uses process.env.OPENAI_API_KEY) ──────────────
function callOpenAI(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set in Render environment variables.');

  const payload = JSON.stringify({
    model:       'gpt-4o-mini',
    messages,
    max_tokens:  500,
    temperature: 0.4,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.choices?.[0]?.message?.content || '';
          resolve(text.trim());
        } catch (e) {
          reject(new Error('OpenAI response parse failed: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Bill image → inventory items (Part 5) ───────────────────────────────────
async function extractBillItems(imageBase64, mimeType) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set.');

  const payload = JSON.stringify({
    model:      'gpt-4o-mini',
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: 'You are an inventory extraction assistant. Extract purchased items from supplier bill images. Return ONLY valid JSON, no markdown.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
          {
            type: 'text',
            text: `Extract all items from this supplier bill.
Return ONLY this JSON structure, no explanation:
{
  "items": [
    { "name": "Item Name", "quantity": 10, "unit": "kg", "price": 500 }
  ],
  "totalAmount": 1250,
  "vendorName": "Vendor if visible or null"
}
If you cannot read the bill clearly, return { "items": [], "error": "reason" }.`,
          },
        ],
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text    = parsed.choices?.[0]?.message?.content || '{}';
          const cleaned = text.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
          resolve(JSON.parse(cleaned));
        } catch (e) {
          reject(new Error('Bill parse failed: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Action executor (Part 4) ─────────────────────────────────────────────────
// Called ONLY after owner confirms. Never called automatically.
async function executeAction(db, cafeId, action, payload) {
  switch (action) {

    case 'update_inventory': {
      // payload: { itemId, quantity, unit }
      const { itemId, quantity } = payload;
      if (!itemId || typeof quantity !== 'number') {
        throw new Error('update_inventory requires itemId and quantity (number)');
      }
      await db.collection('inventory').doc(itemId).update({ quantity });
      return { success: true, message: `Inventory updated for item ${itemId}` };
    }

    case 'add_menu_item': {
      // payload: { name, price, category, description }
      const { name, price, category } = payload;
      if (!name || typeof price !== 'number') {
        throw new Error('add_menu_item requires name and price');
      }
      const ref = await db.collection('menuItems').add({
        cafeId,
        name,
        price,
        category:    category || 'Other',
        description: payload.description || '',
        available:   true,
        createdAt:   new Date(),
        source:      'ai_assistant',
      });
      return { success: true, message: `Menu item "${name}" added`, itemId: ref.id };
    }

    case 'send_whatsapp_campaign':
      // This action type is handled by the existing /api/send-whatsapp-campaign route.
      // We don't duplicate that logic here — just return a redirect instruction.
      return {
        success:  true,
        redirect: '/api/send-whatsapp-campaign',
        message:  'Use the existing WhatsApp campaign endpoint to send messages.',
      };

    case 'generate_report':
      // Report generation is a read-only operation — safe to trigger directly.
      return { success: true, message: 'Report generation noted. Use the Reports tab for PDF/CSV exports.' };

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── Main handler — registered in server.js ───────────────────────────────────

function registerAIRoutes(app, getDb) {
  /**
   * POST /api/ai-assistant
   * Body: { cafeId: string, question: string }
   * Response: { answer: string, type: 'data_answer'|'insight'|'action_intent', actionIntent?: object }
   */
  app.post('/api/ai-assistant', async (req, res) => {
    const { cafeId, question } = req.body || {};

    if (!cafeId)    return res.status(400).json({ error: 'cafeId is required' });
    if (!question?.trim()) return res.status(400).json({ error: 'question is required' });

    const db = getDb();
    if (!db) {
      return res.status(503).json({
        error: 'Database not available. Set FIREBASE_SERVICE_ACCOUNT in Render env vars.',
      });
    }

    try {
      // 1. Detect intent
      const intent = detectIntent(question);
      console.log(`[AI-Assistant] cafeId=${cafeId} intent=${intent} question="${question.slice(0, 60)}"`);

      // 2. Fetch only relevant data
      const data = await fetchRelevantData(db, cafeId, intent);

      // 3. Build prompt for OpenAI
      const userPrompt = `
CAFÉ DATA (${new Date().toLocaleDateString('en-IN')}):
${JSON.stringify(data, null, 2)}

OWNER QUESTION: ${question}

INSTRUCTIONS:
- Answer ONLY using the data above.
- If data for this question is missing, say exactly: "I don't have [specific data] available right now."
- If the question implies an action (adding item, updating stock, sending message), end your answer with:
  ACTION_INTENT: { "action": "<action_type>", "payload": { ... }, "confidence": 0.0-1.0 }
  where action_type is one of: update_inventory | add_menu_item | send_whatsapp_campaign | generate_report
- Otherwise do NOT include ACTION_INTENT.
- Keep answer under 120 words unless a detailed table is needed.
`.trim();

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ];

      // 4. Call OpenAI
      const rawAnswer = await callOpenAI(messages);

      // 5. Parse action intent if present
      let answer      = rawAnswer;
      let type        = 'data_answer';
      let actionIntent = null;

      const actionMatch = rawAnswer.match(/ACTION_INTENT:\s*(\{[\s\S]+\})/);
      if (actionMatch) {
        try {
          actionIntent = JSON.parse(actionMatch[1]);
          // Strip the ACTION_INTENT tag from the displayed answer
          answer = rawAnswer.replace(/ACTION_INTENT:[\s\S]+$/, '').trim();
          type   = 'action_intent';
        } catch {
          // If parse fails just show the full answer
        }
      } else if (/revenue|sale|order|inventory|staff|tax|payment|gst/.test(answer.toLowerCase())) {
        type = 'data_answer';
      } else {
        type = 'insight';
      }

      console.log(`[AI-Assistant] responded type=${type}`);

      return res.json({ answer, type, actionIntent, intent });

    } catch (err) {
      console.error('[AI-Assistant] Error:', err.message);
      return res.status(500).json({ error: err.message || 'AI assistant failed. Please try again.' });
    }
  });

  /**
   * POST /api/ai-bill-upload
   * Body: { cafeId: string, imageBase64: string, mimeType: string }
   * Response: { items: [...], totalAmount, vendorName }
   *
   * After returning items, the frontend shows them for owner confirmation.
   * Owner then calls /api/ai-action/execute with action: 'update_inventory'.
   */
  app.post('/api/ai-bill-upload', async (req, res) => {
    const { cafeId, imageBase64, mimeType } = req.body || {};

    if (!cafeId)      return res.status(400).json({ error: 'cafeId is required' });
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    if (!mimeType)    return res.status(400).json({ error: 'mimeType is required' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: `Unsupported image type: ${mimeType}` });
    }

    // Size guard: base64 of 5MB image ~ 6.8MB string
    if (imageBase64.length > 7_000_000) {
      return res.status(400).json({ error: 'Image too large. Please use an image under 5MB.' });
    }

    try {
      console.log(`[AI-BillUpload] cafeId=${cafeId} mimeType=${mimeType}`);
      const result = await extractBillItems(imageBase64, mimeType);

      if (result.error) {
        return res.status(422).json({ error: result.error, items: [] });
      }

      return res.json({
        success:     true,
        items:       result.items || [],
        totalAmount: result.totalAmount || null,
        vendorName:  result.vendorName  || null,
      });

    } catch (err) {
      console.error('[AI-BillUpload] Error:', err.message);
      return res.status(500).json({ error: err.message || 'Bill extraction failed.' });
    }
  });

  /**
   * POST /api/ai-action/execute
   * Body: { cafeId: string, action: string, payload: object }
   *
   * Called ONLY after the owner explicitly confirms the action in the UI.
   * The frontend shows a confirmation dialog before calling this.
   */
  app.post('/api/ai-action/execute', async (req, res) => {
    const { cafeId, action, payload } = req.body || {};

    if (!cafeId)  return res.status(400).json({ error: 'cafeId is required' });
    if (!action)  return res.status(400).json({ error: 'action is required' });

    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not available.' });
    }

    // Destructive-operation guard
    const ALLOWED_ACTIONS = ['update_inventory', 'add_menu_item', 'send_whatsapp_campaign', 'generate_report'];
    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({ error: `Action "${action}" is not permitted.` });
    }

    try {
      console.log(`[AI-Action] cafeId=${cafeId} action=${action}`);
      const result = await executeAction(db, cafeId, action, payload || {});
      return res.json(result);
    } catch (err) {
      console.error('[AI-Action] Error:', err.message);
      return res.status(500).json({ error: err.message || 'Action execution failed.' });
    }
  });
}

module.exports = { registerAIRoutes };
