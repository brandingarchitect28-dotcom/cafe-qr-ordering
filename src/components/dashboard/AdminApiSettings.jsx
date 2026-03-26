/**
 * AdminApiSettings.jsx
 *
 * Admin-only panel for configuring API keys.
 * Keys are sent to the Render backend → stored as environment variables.
 * NOTE: Keys saved here are sent to your Render backend securely over HTTPS.
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Key, Eye, EyeOff, ShieldCheck, RefreshCw, AlertTriangle, Save } from 'lucide-react';

const inputCls = 'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 text-sm transition-all font-mono';

const AdminApiSettings = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);

  const [openaiKey,    setOpenaiKey   ] = useState('');
  const [geminiKey,    setGeminiKey   ] = useState('');
  const [whatsappKey,  setWhatsappKey ] = useState('');
  const [showOpenai,   setShowOpenai  ] = useState(false);
  const [showGemini,   setShowGemini  ] = useState(false);
  const [showWA,       setShowWA      ] = useState(false);
  const [saving,       setSaving      ] = useState(false);

  const handleSave = async () => {
    if (!openaiKey && !geminiKey && !whatsappKey) {
      toast.error('Enter at least one API key');
      return;
    }

    const backendUrl = cafe?.paymentSettings?.backendUrl?.replace(/\/$/, '');
    if (!backendUrl) {
      toast.error('Backend URL not set. Go to Settings → Payment to add your Render URL first.');
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${backendUrl}/api/save-api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(openaiKey   && { openaiKey   }),
          ...(geminiKey   && { geminiKey   }),
          ...(whatsappKey && { whatsappKey }),
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `Request failed (${resp.status})`);
      }

      toast.success(data.message || 'API keys saved ✓');
      setOpenaiKey('');
      setGeminiKey('');
      setWhatsappKey('');
    } catch (err) {
      toast.error(err.message || 'Failed to save keys');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
        <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-emerald-400 text-xs font-semibold">Secured via Render Backend</p>
          <p className="text-[#A3A3A3] text-xs mt-0.5 leading-relaxed">
            Keys are sent directly to your Render backend over HTTPS and stored as environment variables —
            never exposed to the browser after saving.
          </p>
        </div>
      </div>

      {/* OpenAI Key */}
      <div>
        <label className="block text-white text-sm font-medium mb-1.5 flex items-center gap-2">
          <Key className="w-3.5 h-3.5 text-[#D4AF37]" />
          OpenAI API Key
        </label>
        <p className="text-[#A3A3A3] text-xs mb-2">
          Get from <span className="text-[#D4AF37]">platform.openai.com/api-keys</span> · Used for AI Menu Upload
        </p>
        <div className="relative">
          <input
            type={showOpenai ? 'text' : 'password'}
            value={openaiKey}
            onChange={e => setOpenaiKey(e.target.value)}
            placeholder="sk-..."
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => setShowOpenai(!showOpenai)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-white transition-colors"
          >
            {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {openaiKey && !openaiKey.startsWith('sk-') && (
          <p className="text-yellow-400 text-xs mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            OpenAI keys usually start with "sk-"
          </p>
        )}
      </div>

      {/* Gemini Key */}
      <div>
        <label className="block text-white text-sm font-medium mb-1.5 flex items-center gap-2">
          <Key className="w-3.5 h-3.5 text-[#D4AF37]" />
          Gemini API Key
        </label>
        <p className="text-[#A3A3A3] text-xs mb-2">
          Get from <span className="text-[#D4AF37]">aistudio.google.com</span> · Used for AI Insights
        </p>
        <div className="relative">
          <input
            type={showGemini ? 'text' : 'password'}
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => setShowGemini(!showGemini)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-white transition-colors"
          >
            {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {geminiKey && !geminiKey.startsWith('AIza') && (
          <p className="text-yellow-400 text-xs mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Gemini keys usually start with "AIza"
          </p>
        )}
      </div>

      {/* WhatsApp Key */}
      <div>
        <label className="block text-white text-sm font-medium mb-1.5 flex items-center gap-2">
          <Key className="w-3.5 h-3.5 text-[#25D366]" />
          WhatsApp Business API Key
        </label>
        <p className="text-[#A3A3A3] text-xs mb-2">
          From Meta Business → WhatsApp API · Used for invoice and report sending
        </p>
        <div className="relative">
          <input
            type={showWA ? 'text' : 'password'}
            value={whatsappKey}
            onChange={e => setWhatsappKey(e.target.value)}
            placeholder="EAA..."
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => setShowWA(!showWA)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-white transition-colors"
          >
            {showWA ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleSave}
        disabled={saving || (!openaiKey && !geminiKey && !whatsappKey)}
        className="flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
      >
        {saving
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
          : <><Save className="w-4 h-4" /> Save Keys</>
        }
      </motion.button>
    </div>
  );
};

export default AdminApiSettings;
