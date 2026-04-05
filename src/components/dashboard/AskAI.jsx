/**
 * AskAI.jsx
 *
 * Upgraded AI Business Assistant.
 *
 * WHAT CHANGED vs the original:
 *  - Calls askAIAssistant() from aiAssistantService.js (Render backend)
 *    instead of askAI() from aiService.js (Firebase Cloud Function)
 *  - Handles 3 response types: data_answer | insight | action_intent
 *  - Shows a confirmation dialog before executing action intents
 *  - Bill image upload section (Part 5)
 *
 * WHAT IS IDENTICAL to the original:
 *  - All JSX structure and className values
 *  - Dark theme, gold (#D4AF37) accent, Playfair Display headings
 *  - Message bubble style, loading dots, suggestion chips
 *  - Clear chat button
 *  - Auto-scroll, Enter-to-send, mobile focus behaviour
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, Trash2, Upload, X, CheckCircle,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  askAIAssistant,
  uploadBillImage,
  executeActionIntent,
} from '../../services/aiAssistantService';

// ─── Suggested questions ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  'What is my revenue today?',
  'Which item sold the most this week?',
  'How much UPI vs cash collected?',
  'Which items are low on stock?',
  'What are my peak hours?',
  'How much GST did I collect?',
];

// ─── Type badge ───────────────────────────────────────────────────────────────
const TypeBadge = ({ type }) => {
  if (type === 'action_intent') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 ml-2">
        Action
      </span>
    );
  }
  if (type === 'insight') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 ml-2">
        Insight
      </span>
    );
  }
  return null;
};

// ─── Action confirmation panel ────────────────────────────────────────────────
const ActionConfirmPanel = ({ actionIntent, cafeId, onDone }) => {
  const [loading, setLoading] = useState(false);

  const ACTION_LABELS = {
    update_inventory:      'Update Inventory',
    add_menu_item:         'Add Menu Item',
    send_whatsapp_campaign: 'Send WhatsApp Campaign',
    generate_report:       'Generate Report',
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await executeActionIntent(cafeId, actionIntent.action, actionIntent.payload || {});
      toast.success(result.message || 'Action completed ✓');
      onDone(true);
    } catch (err) {
      toast.error(err.message || 'Action failed');
      onDone(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5"
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-amber-400 text-sm font-semibold">
          Action suggested: {ACTION_LABELS[actionIntent.action] || actionIntent.action}
        </p>
      </div>

      {actionIntent.payload && Object.keys(actionIntent.payload).length > 0 && (
        <pre className="text-[11px] text-[#A3A3A3] bg-black/30 rounded-lg p-3 mb-3 overflow-auto">
          {JSON.stringify(actionIntent.payload, null, 2)}
        </pre>
      )}

      <p className="text-[#A3A3A3] text-xs mb-4">
        Confidence: {Math.round((actionIntent.confidence || 0) * 100)}% — Review above details before confirming.
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-lg text-xs transition-all disabled:opacity-50"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <CheckCircle className="w-3.5 h-3.5" />
          }
          Confirm
        </button>
        <button
          onClick={() => onDone(false)}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-[#A3A3A3] hover:text-white border border-white/10 rounded-lg text-xs transition-all"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </motion.div>
  );
};

// ─── Message bubble ───────────────────────────────────────────────────────────
const Bubble = ({ msg, cafeId, onActionDone }) => {
  const isUser   = msg.role === 'user';
  const isError  = msg.role === 'error';
  const [actionDone, setActionDone] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[#D4AF37]/15 flex items-center justify-center flex-shrink-0 mt-1">
          <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? '' : 'w-full'}`}>
        {/* Text bubble */}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'rounded-br-sm text-black font-medium'
              : 'rounded-bl-sm text-white'
          }`}
          style={isUser
            ? { background: 'linear-gradient(135deg, #D4AF37, #C5A059)' }
            : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
          }
        >
          {isError
            ? <span className="text-red-400">{msg.content}</span>
            : (
              <span>
                {msg.content}
                {msg.type && <TypeBadge type={msg.type} />}
              </span>
            )
          }
        </div>

        {/* Action confirmation panel */}
        {msg.actionIntent && !actionDone && (
          <ActionConfirmPanel
            actionIntent={msg.actionIntent}
            cafeId={cafeId}
            onDone={(success) => {
              setActionDone(true);
              if (onActionDone) onActionDone(success);
            }}
          />
        )}
        {msg.actionIntent && actionDone && (
          <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Action handled
          </p>
        )}
      </div>
    </motion.div>
  );
};

// ─── Bill upload section ──────────────────────────────────────────────────────
const BillUpload = ({ cafeId, onItemsExtracted }) => {
  const [loading,  setLoading ] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const processFile = useCallback(async (file) => {
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Please use JPG, PNG, or WebP image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('File read failed'));
        reader.readAsDataURL(file);
      });

      const result = await uploadBillImage(cafeId, base64, file.type);

      if (result.items.length === 0) {
        toast.error('No items found in the bill image. Try a clearer photo.');
        return;
      }

      toast.success(`${result.items.length} items extracted from bill ✓`);
      onItemsExtracted(result);
    } catch (err) {
      toast.error(err.message || 'Bill extraction failed');
    } finally {
      setLoading(false);
    }
  }, [cafeId, onItemsExtracted]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
      className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
        dragging
          ? 'border-[#D4AF37] bg-[#D4AF37]/5'
          : 'border-white/10 hover:border-white/20'
      }`}
      onClick={() => fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => processFile(e.target.files[0])}
      />
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-[#A3A3A3] text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
          Extracting items from bill…
        </div>
      ) : (
        <>
          <Upload className="w-5 h-5 text-[#555] mx-auto mb-1.5" />
          <p className="text-[#A3A3A3] text-xs">
            Upload supplier bill photo to auto-update inventory
          </p>
          <p className="text-[#555] text-[11px] mt-0.5">JPG, PNG, WebP · max 5MB</p>
        </>
      )}
    </div>
  );
};

// ─── Extracted bill items preview ─────────────────────────────────────────────
const BillItemsPreview = ({ billResult, cafeId, onDone }) => {
  const [loading, setLoading] = useState(false);

  const handleUpdateInventory = async () => {
    setLoading(true);
    let successCount = 0;
    let failCount    = 0;

    for (const item of billResult.items) {
      try {
        await executeActionIntent(cafeId, 'update_inventory', {
          itemName: item.name,
          quantity: item.quantity,
          unit:     item.unit || '',
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setLoading(false);
    if (successCount > 0) toast.success(`${successCount} inventory items updated ✓`);
    if (failCount > 0)    toast.error(`${failCount} items failed to update`);
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 p-4 rounded-xl border border-white/10 bg-white/3"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-white text-sm font-semibold">
          Bill Extracted — {billResult.items.length} items
        </p>
        {billResult.vendorName && (
          <p className="text-[#A3A3A3] text-xs">Vendor: {billResult.vendorName}</p>
        )}
      </div>

      <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
        {billResult.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-[#D1D1D1]">{item.name}</span>
            <span className="text-[#A3A3A3] text-xs">
              {item.quantity} {item.unit || ''}
              {item.price ? ` · ₹${item.price}` : ''}
            </span>
          </div>
        ))}
      </div>

      {billResult.totalAmount && (
        <p className="text-[#A3A3A3] text-xs mb-4">
          Total: ₹{billResult.totalAmount}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleUpdateInventory}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-lg text-xs transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
          Update Inventory
        </button>
        <button
          onClick={onDone}
          className="px-4 py-2 text-[#A3A3A3] border border-white/10 rounded-lg text-xs"
        >
          Discard
        </button>
      </div>
    </motion.div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const AskAI = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);

  const hasBackendUrl = !!cafe?.paymentSettings?.backendUrl;

  const [messages,   setMessages  ] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your café AI assistant. Ask me anything about your orders, revenue, inventory, staff, or how to grow your business.",
    },
  ]);
  const [input,      setInput     ] = useState('');
  const [loading,    setLoading   ] = useState(false);
  const [showBill,   setShowBill  ] = useState(false);
  const [billResult, setBillResult] = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    if (!cafeId) { toast.error('Café not loaded'); return; }
    if (!hasBackendUrl) {
      toast.error('Set your Render backend URL in Settings → Online Payment Settings first.');
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const result = await askAIAssistant(cafeId, q);
      setMessages(prev => [
        ...prev,
        {
          role:         'assistant',
          content:      result.answer,
          type:         result.type,
          actionIntent: result.actionIntent,
        },
      ]);
    } catch (err) {
      console.error('[AskAI]', err);
      setMessages(prev => [
        ...prev,
        { role: 'error', content: err.message || 'Failed to get response. Try again.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: 'Chat cleared! Ask me anything about your café.',
    }]);
    setBillResult(null);
    setShowBill(false);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)', minHeight: '500px' }}>

      {/* ── Header (identical structure to original) ── */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h2 className="text-white font-bold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>
              AI Business Assistant
            </h2>
            <p className="text-[#555] text-xs">Revenue · Inventory · Staff · Insights</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bill upload toggle */}
          <button
            onClick={() => { setShowBill(v => !v); setBillResult(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-all ${
              showBill
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10'
                : 'text-[#555] hover:text-[#A3A3A3] border-white/5 hover:border-white/10'
            }`}
          >
            <Upload className="w-3 h-3" />
            Bill
          </button>

          {/* Clear chat */}
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#555] hover:text-[#A3A3A3] border border-white/5 hover:border-white/10 rounded-lg transition-all"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      {/* ── Backend URL warning (only shown if not configured) ── */}
      {!hasBackendUrl && (
        <div className="flex-shrink-0 mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-amber-400 text-xs">
            ⚠ Set your Render backend URL in <strong>Settings → Online Payment Settings</strong> to enable the AI assistant.
          </p>
        </div>
      )}

      {/* ── Bill upload panel ── */}
      {showBill && (
        <div className="flex-shrink-0 mb-4">
          {billResult ? (
            <BillItemsPreview
              billResult={billResult}
              cafeId={cafeId}
              onDone={() => { setBillResult(null); setShowBill(false); }}
            />
          ) : (
            <BillUpload
              cafeId={cafeId}
              onItemsExtracted={result => {
                setBillResult(result);
              }}
            />
          )}
        </div>
      )}

      {/* ── Chat window (identical structure to original) ── */}
      <div
        className="flex-1 overflow-y-auto space-y-4 px-1 pb-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <Bubble
              key={i}
              msg={msg}
              cafeId={cafeId}
              onActionDone={(success) => {
                if (success) {
                  setMessages(prev => [
                    ...prev,
                    { role: 'assistant', content: '✓ Action completed successfully.' },
                  ]);
                }
              }}
            />
          ))}
        </AnimatePresence>

        {/* Loading dots (identical to original) */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start gap-2">
            <div className="w-7 h-7 rounded-full bg-[#D4AF37]/15 flex items-center justify-center flex-shrink-0 mt-1">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-sm"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick suggestions (identical structure to original) ── */}
      {messages.length <= 2 && !loading && (
        <div className="flex-shrink-0 mt-3 mb-3">
          <p className="text-[#555] text-xs mb-2">💡 Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="text-xs px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: 'rgba(212,175,55,0.08)',
                  color:      '#D4AF37',
                  border:     '1px solid rgba(212,175,55,0.2)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input bar (identical structure to original) ── */}
      <div className="flex-shrink-0 mt-3">
        <div
          className="flex items-end gap-2 p-1 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about revenue, inventory, staff, taxes…"
            rows={1}
            disabled={loading || !hasBackendUrl}
            className="flex-1 bg-transparent text-white placeholder:text-[#444] text-sm px-3 py-2.5 resize-none outline-none"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim() || !hasBackendUrl}
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mb-1 mr-1 transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #C5A059)' }}
          >
            <Send className="w-4 h-4 text-black" />
          </button>
        </div>
        <p className="text-[#333] text-[11px] mt-1.5 text-center">
          AI uses live data from your database · Never guesses
        </p>
      </div>
    </div>
  );
};

export default AskAI;
