/**
 * AdminApiSettings.jsx
 *
 * Admin-only panel for configuring API keys.
 * Keys are sent to Cloud Function → encrypted → stored in Firestore.
 * Keys NEVER pass through frontend plaintext after save.
 */

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Key, Eye, EyeOff, ShieldCheck, RefreshCw, AlertTriangle, Save } from 'lucide-react';

const inputCls = 'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 text-sm transition-all font-mono';

const AdminApiSettings = () => {
  const [geminiKey,    setGeminiKey   ] = useState('');
  const [whatsappKey,  setWhatsappKey ] = useState('');
  const [showGemini,   setShowGemini  ] = useState(false);
  const [showWA,       setShowWA      ] = useState(false);
  const [saving,       setSaving      ] = useState(false);

  const handleSave = async () => {
    if (!geminiKey && !whatsappKey) {
      toast.error('Enter at least one API key');
      return;
    }
    setSaving(true);
    try {
      const fns     = getFunctions();
      const saveKeys = httpsCallable(fns, 'saveApiKeys');
      await saveKeys({
        ...(geminiKey   && { geminiKey }),
        ...(whatsappKey && { whatsappKey }),
      });
      toast.success('API keys saved securely ✓');
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
          <p className="text-emerald-400 text-xs font-semibold">End-to-End Secured</p>
          <p className="text-[#A3A3A3] text-xs mt-0.5 leading-relaxed">
            Keys are encrypted before storage. They are only decrypted inside Cloud Functions —
            never exposed to the browser or client-side code.
          </p>
        </div>
      </div>

      {/* Gemini Key */}
      <div>
        <label className="block text-white text-sm font-medium mb-1.5 flex items-center gap-2">
          <Key className="w-3.5 h-3.5 text-[#D4AF37]" />
          Gemini API Key
        </label>
        <p className="text-[#A3A3A3] text-xs mb-2">
          Get from <span className="text-[#D4AF37]">aistudio.google.com</span> · Used for AI Insights + Menu Upload
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
        disabled={saving || (!geminiKey && !whatsappKey)}
        className="flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
      >
        {saving
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Encrypting & Saving…</>
          : <><Save className="w-4 h-4" /> Save Keys Securely</>
        }
      </motion.button>
    </div>
  );
};

export default AdminApiSettings;
