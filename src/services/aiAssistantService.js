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
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Get backend URL for this cafe ───────────────────────────────────────────
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

// ─── Main: ask the AI assistant ──────────────────────────────────────────────
/**
 * askAIAssistant(cafeId, question)
 *
 * Returns: {
 *   answer:       string,
 *   type:         'data_answer' | 'insight' | 'action_intent',
 *   actionIntent: { action, payload, confidence } | null,
 *   intent:       string   // detected intent for logging
 * }
 */
export const askAIAssistant = async (cafeId, question) => {
  if (!cafeId)         throw new Error('cafeId required');
  if (!question?.trim()) throw new Error('question required');

  const backendUrl = await getBackendUrl(cafeId);

  const res = await fetch(`${backendUrl}/api/ai-assistant`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ cafeId, question: question.trim() }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `AI request failed (${res.status})`);
  }

  return {
    answer:       data.answer       || 'No response received.',
    type:         data.type         || 'data_answer',
    actionIntent: data.actionIntent || null,
    intent:       data.intent       || 'unknown',
  };
};

// ─── Bill image upload ────────────────────────────────────────────────────────
/**
 * uploadBillImage(cafeId, imageBase64, mimeType)
 *
 * Returns: {
 *   items:       [{ name, quantity, unit, price }],
 *   totalAmount: number | null,
 *   vendorName:  string | null,
 * }
 */
export const uploadBillImage = async (cafeId, imageBase64, mimeType) => {
  if (!cafeId)      throw new Error('cafeId required');
  if (!imageBase64) throw new Error('imageBase64 required');
  if (!mimeType)    throw new Error('mimeType required');

  const backendUrl = await getBackendUrl(cafeId);

  const res = await fetch(`${backendUrl}/api/ai-bill-upload`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ cafeId, imageBase64, mimeType }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Bill upload failed (${res.status})`);
  }

  return {
    items:       data.items       || [],
    totalAmount: data.totalAmount || null,
    vendorName:  data.vendorName  || null,
  };
};

// ─── Execute a confirmed action intent ───────────────────────────────────────
/**
 * executeActionIntent(cafeId, action, payload)
 *
 * Called ONLY after the owner clicks "Confirm" in the UI.
 * Returns: { success: boolean, message: string }
 */
export const executeActionIntent = async (cafeId, action, payload = {}) => {
  if (!cafeId) throw new Error('cafeId required');
  if (!action) throw new Error('action required');

  const backendUrl = await getBackendUrl(cafeId);

  const res = await fetch(`${backendUrl}/api/ai-action/execute`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ cafeId, action, payload }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Action failed (${res.status})`);
  }

  return { success: data.success || false, message: data.message || 'Done.' };
};
