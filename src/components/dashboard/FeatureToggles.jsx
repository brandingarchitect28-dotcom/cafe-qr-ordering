/**
 * FeatureToggles.jsx
 *
 * Admin-facing feature flag controls per café.
 * Stores in cafes/{cafeId}.features map.
 * Only renders if current user is admin.
 *
 * Features:
 *  - aiInsights   — AI Business Insights tab
 *  - aiMenu       — AI Menu Upload
 *  - videoMenu    — Video/GIF support in ordering page
 *  - whatsapp     — WhatsApp integrations
 */

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useDocument } from '../../hooks/useFirestore';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Sparkles, Video, MessageSquare, Cpu, Users, Bot } from 'lucide-react';

const FEATURES = [
  {
    key:         'aiInsights',
    label:       'AI Business Insights',
    description: 'Gemini-powered revenue analysis, product insights, and action plans',
    icon:        Sparkles,
    color:       '#D4AF37',
  },
  {
    key:         'aiMenu',
    label:       'AI Menu Upload',
    description: 'Upload physical menu photos — AI extracts items automatically',
    icon:        Cpu,
    color:       '#8B5CF6',
  },
  {
    key:         'videoMenu',
    label:       'Video Menu (Premium)',
    description: 'Support for MP4/GIF menu item media in the ordering page',
    icon:        Video,
    color:       '#3B82F6',
  },
  {
    key:         'whatsapp',
    label:       'WhatsApp Integration',
    description: 'Send invoices and daily reports via WhatsApp API',
    icon:        MessageSquare,
    color:       '#25D366',
  },
  // ── New toggles (Feature 3) ────────────────────────────────────────────────
  {
    key:         'marketingWhatsappEnabled',
    label:       'WhatsApp Marketing',
    description: 'Bulk promotional messages and campaign tools for customers',
    icon:        MessageSquare,
    color:       '#F97316',
  },
  {
    key:         'staffManagementEnabled',
    label:       'Staff Management',
    description: 'Attendance, salary, and QR check-in system for café staff',
    icon:        Users,
    color:       '#10B981',
  },
  {
    key:         'aiAssistantEnabled',
    label:       'AI Text Assistant',
    description: 'Natural language Q&A powered by Gemini / OpenAI',
    icon:        Bot,
    color:       '#A855F7',
  },
];

const FeatureToggles = ({ cafeId }) => {
  const { data: cafe } = useDocument('cafes', cafeId);
  const [saving, setSaving] = useState(null);

  const features = cafe?.features || {};

  const handleToggle = async (key, currentValue) => {
    setSaving(key);
    try {
      await updateDoc(doc(db, 'cafes', cafeId), {
        [`features.${key}`]: !currentValue,
      });
      toast.success(`${key} ${!currentValue ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error('Failed to update feature');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[#A3A3A3] text-xs uppercase tracking-wide font-semibold mb-4">
        Feature Access Control
      </p>
      {FEATURES.map((feature, i) => {
        const Icon    = feature.icon;
        const enabled = !!features[feature.key];
        const isSaving = saving === feature.key;

        return (
          <motion.div
            key={feature.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
              enabled
                ? 'border-white/10 bg-white/3'
                : 'border-white/5 bg-transparent opacity-70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${feature.color}15` }}
              >
                <Icon className="w-4 h-4" style={{ color: enabled ? feature.color : '#555' }} />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{feature.label}</p>
                <p className="text-[#A3A3A3] text-xs mt-0.5">{feature.description}</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(feature.key, enabled)}
              disabled={isSaving}
              className="flex-shrink-0 ml-4 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-10 h-6 rounded-full bg-white/10 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                </div>
              ) : enabled ? (
                <div
                  className="w-10 h-6 rounded-full flex items-center px-1 transition-all"
                  style={{ background: feature.color }}
                >
                  <div className="w-4 h-4 rounded-full bg-black ml-auto shadow-sm" />
                </div>
              ) : (
                <div className="w-10 h-6 rounded-full bg-white/10 flex items-center px-1 transition-all">
                  <div className="w-4 h-4 rounded-full bg-white/30 shadow-sm" />
                </div>
              )}
            </button>
          </motion.div>
        );
      })}
    </div>
  );
};

export default FeatureToggles;
