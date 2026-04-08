/**
 * aiAssistantService.js
 *
 * Frontend service for the upgraded AI Assistant.
 * Replaces the Firebase Cloud Function call in aiService.js with a direct
 * call to the Render backend — keeping API keys 100% server-side.
 *
 * IMPORTANT:
 *  - This is a NEW file. The existing aiService.js is NOT modified.
 *  - AskAI.jsx imports from this file instead of aiService.js.
 *  - The existing generateAIInsights / extractMenuFromImage Cloud Functions
 *    continue working exactly as before via AIInsights.jsx and AIMenuUpload.jsx.
 *
 * Backend URL is read from cafe.paymentSettings.backendUrl in Firestore
 * (same pattern used by WhatsAppMarketing.jsx and AdminApiSettings.jsx).
 *
 * UPGRADE (context parameter):
 *  - askAIAssistant() now accepts an optional `context` argument.
 *  - When provided it is forwarded to the backend alongside the question.
 *  - The backend uses this rich snapshot to answer data-heavy questions
 *    (revenue, inventory, staff) without making its own Firestore reads.
 *  - Backward compatible: callers that omit context still work exactly as before.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Get backend URL for this cafe ────────────────────────────────────────────
async function getBackendUrl(cafeId) {
  const cafeSnap = await getDoc(doc(db, 'cafes', cafeId));
  if (!cafeSnap.exists()) throw new Error('Café not found.');
  const url = cafeSnap.data()?.paymentSettings?.backendUrl;
  if (!url?.trim()) {
    throw new Error(
      'Backend URL not configured. Go to Settings → Online Payment Settings and enter your Render backend URL.'
    );
  }
  return url.trim().replace(/\/$/, ''); // strip trailing slash
}

// ─── Main: ask the AI assistant ───────────────────────────────────────────────
/**
 * askAIAssistant(cafeId, question, context?)
 *
 * @param {string} cafeId   — café document ID
 * @param {string} question — owner's question
 * @param {object} context  — optional: pre-built system snapshot from buildSystemContext()
 *                           Contains revenue, topItems, inventory, menu, staff summaries.
 *                           Passed to the backend so it can answer without re-fetching Firestore.
 *
 * Returns: {
 *   answer:       string,
 *   type:         'data_answer' | 'insight' | 'action_intent',
 *   actionIntent: { action, payload, confidence } | null,
 *   intent:       string   // detected intent for logging
 * }
 */
export const askAIAssistant = async (cafeId, question, context = null) => {
  if (!cafeId)           throw new Error('cafeId required');
  if (!question?.trim()) throw new Error('question required');

  const backendUrl = await getBackendUrl(cafeId);

  const body = { cafeId, question: question.trim() };

  // Attach context snapshot when available — backend merges with its own data
  if (context && typeof context === 'object') {
    body.context = context;
  }

  const res = await fetch(`${backendUrl}/api/ai-assistant`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `AI request failed (${res.status})`);
  }

  // FIX: backend returns { reply: "..." } — also accept data.answer and data.message
  // for forward-compatibility with future backend upgrades.
  console.log('[AI-Response] raw data:', JSON.stringify(data).slice(0, 200));

  const answerText =
    data.reply        ||   // ← current backend field (server.js → res.json({ reply }))
    data.answer       ||   // ← future-proof alias
    data.message      ||   // ← fallback alias
    "I'm having trouble responding right now. Please try again.";

  if (!data.reply && !data.answer && !data.message) {
    console.warn('[AI-Response] Unexpected response shape — no reply/answer/message field:', data);
  }

  return {
    answer:       answerText,
    type:         data.type         || 'data_answer',
    actionIntent: data.actionIntent || null,
    intent:       data.intent       || '',
  };
};

// ─── Upload a supplier bill image for inventory extraction ────────────────────
/**
 * uploadBillImage(cafeId, base64, mimeType)
 *
 * Returns: { items: Array<{ name, quantity, unit, price? }>, vendorName?, totalAmount? }
 */
export const uploadBillImage = async (cafeId, base64, mimeType) => {
  if (!cafeId) throw new Error('cafeId required');

  const backendUrl = await getBackendUrl(cafeId);

  const res = await fetch(`${backendUrl}/api/ai-bill-scan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ cafeId, imageBase64: base64, mimeType }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Bill scan failed (${res.status})`);
  }

  return {
    items:       data.items       || [],
    vendorName:  data.vendorName  || null,
    totalAmount: data.totalAmount || null,
  };
};

// ─── Execute an action intent confirmed by the owner ──────────────────────────
/**
 * executeActionIntent(cafeId, action, payload)
 *
 * Allowed actions (from backend):
 *   update_inventory   — { itemName, quantity, unit }
 *   add_menu_item      — { name, price, category, description }
 *   update_menu_item   — { itemId, name?, price?, category? }
 *   update_staff_details — { staffId, name?, role?, phone? }
 *   generate_report    — { reportType }
 *
 * Returns: { success: true, message: string }
 */
export const executeActionIntent = async (cafeId, action, payload = {}) => {
  if (!cafeId) throw new Error('cafeId required');
  if (!action) throw new Error('action required');

  const backendUrl = await getBackendUrl(cafeId);

  const res = await fetch(`${backendUrl}/api/ai-action`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ cafeId, action, payload }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Action failed (${res.status})`);
  }

  return {
    success: true,
    message: data.message || 'Action completed successfully.',
  };
};
