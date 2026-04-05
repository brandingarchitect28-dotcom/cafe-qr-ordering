/**
 * server.patch.js
 *
 * INSTRUCTIONS — add these 3 lines to your existing server.js.
 * Nothing else in server.js changes.
 *
 * ─── WHERE TO ADD ────────────────────────────────────────────────────────────
 *
 * STEP 1 — Add near the top of server.js, after the other require() lines:
 *
 *   const { registerAIRoutes } = require('./aiAssistant');
 *
 * STEP 2 — Add ONE line after the firestoreDb initialisation block
 *   (around line 215 in the existing file, right after the try/catch that sets firestoreDb):
 *
 *   registerAIRoutes(app, () => firestoreDb);
 *
 * That is ALL. No other changes to server.js.
 *
 * ─── WHY THIS WORKS ──────────────────────────────────────────────────────────
 *
 * registerAIRoutes receives a getter function (() => firestoreDb) so it always
 * gets the live firestoreDb reference, even if Firebase Admin initialises
 * asynchronously. The existing routes at lines 50, 61, 331, 339, 347, 465, 517
 * are completely untouched.
 *
 * ─── NEW ROUTES ADDED ────────────────────────────────────────────────────────
 *
 *   POST /api/ai-assistant        ← main chat (replaces Cloud Function aiQuery)
 *   POST /api/ai-bill-upload      ← bill image → inventory items
 *   POST /api/ai-action/execute   ← confirmed action execution
 *
 * ─── REQUIRED ENV VAR ────────────────────────────────────────────────────────
 *
 *   OPENAI_API_KEY   (already should be in Render — used by /api/ai-menu-upload)
 *
 *   If not set, the assistant returns a clear error message instead of crashing.
 *
 * ─── COPY OF THE TWO LINES TO ADD ────────────────────────────────────────────
 */

// ── Line 1: paste after your other require() calls ──
const { registerAIRoutes } = require('./aiAssistant');

// ── Line 2: paste after the Firebase Admin try/catch block ──
registerAIRoutes(app, () => firestoreDb);
