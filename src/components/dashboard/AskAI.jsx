/**
 * AskAI.jsx
 *
 * Task 1: AI Text Assistant UI component.
 * - Clean chat interface inside dashboard
 * - Loads café data and sends to AI
 * - Shows streaming-style answer
 * - Keeps chat history for the session
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, RefreshCw, Coffee, AlertCircle, Trash2 } from 'lucide-react';
import { askAI } from '../../services/aiService';
import { toast } from 'sonner';

// ─── Suggested quick questions ────────────────────────────────────────────────
const SUGGESTIONS = [
  'What is my best selling item this week?',
  'Which payment method do most customers use?',
  'How can I increase my average order value?',
  'What time of day gets the most orders?',
  'Which category should I promote more?',
];

// ─── Single message bubble ────────────────────────────────────────────────────
const Bubble = ({ msg }) => {
  const isUser = msg.role === 'user';
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
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm text-black font-medium'
            : 'rounded-bl-sm text-white'
        }`}
        style={isUser
          ? { background: 'linear-gradient(135deg, #D4AF37, #C5A059)' }
          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
        }
      >
        {msg.role === 'error'
          ? <span className="text-red-400">{msg.content}</span>
          : msg.content
        }
      </div>
    </motion.div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const AskAI = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;

  const [messages,  setMessages ] = useState([
    { role: 'assistant', content: "Hi! I'm your café AI assistant. Ask me anything about your orders, revenue, menu performance, or how to grow your business." }
  ]);
  const [input,    setInput    ] = useState('');
  const [loading,  setLoading  ] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    if (!cafeId) { toast.error('Café not loaded'); return; }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const answer = await askAI(cafeId, q);
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      console.error('[AskAI]', err);
      const errMsg = err.message?.includes('not found') || err.message?.includes('deployed')
        ? 'AI service not available. Deploy Cloud Functions with the aiQuery function first.'
        : err.message || 'Failed to get response. Try again.';
      setMessages(prev => [...prev, { role: 'error', content: errMsg }]);
    } finally {
      setLoading(false);
      // Refocus input (keep keyboard open on mobile)
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
    setMessages([{ role: 'assistant', content: "Chat cleared! Ask me anything about your café." }]);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)', minHeight: '500px' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h2 className="text-white font-bold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>
              AI Business Assistant
            </h2>
            <p className="text-[#555] text-xs">Ask about your orders, revenue, and growth</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#555] hover:text-[#A3A3A3] border border-white/5 hover:border-white/10 rounded-lg transition-all"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>

      {/* Chat window */}
      <div
        className="flex-1 overflow-y-auto space-y-4 px-1 pb-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
        </AnimatePresence>

        {/* Loading indicator */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start gap-2">
            <div className="w-7 h-7 rounded-full bg-[#D4AF37]/15 flex items-center justify-center flex-shrink-0 mt-1">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
                    animate={{ y: [0,-4,0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i*0.15 }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && !loading && (
        <div className="flex-shrink-0 mt-3 mb-3">
          <p className="text-[#555] text-xs mb-2">💡 Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => handleSend(s)}
                className="text-xs px-3 py-1.5 rounded-full transition-all"
                style={{ background: 'rgba(212,175,55,0.08)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 mt-3">
        <div className="flex items-end gap-2 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your business…"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-white placeholder:text-[#444] text-sm resize-none outline-none px-3 py-3 leading-relaxed"
            style={{ maxHeight: '120px', minHeight: '44px' }}
            onInput={e => {
              // Auto-resize textarea
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mb-1 mr-1 transition-all disabled:opacity-40"
            style={{ background: input.trim() && !loading ? 'linear-gradient(135deg,#D4AF37,#C5A059)' : 'rgba(255,255,255,0.06)' }}
          >
            {loading
              ? <RefreshCw className="w-4 h-4 text-[#A3A3A3] animate-spin" />
              : <Send className="w-4 h-4 text-black" />
            }
          </motion.button>
        </div>
        <p className="text-[#333] text-xs text-center mt-2">
          Powered by AI · Analyses your real café data
        </p>
      </div>
    </div>
  );
};

export default AskAI;
