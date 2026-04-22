/**
 * GoogleReviewSettings.jsx
 *
 * Small admin panel for saving the café's Google Review link.
 * Writes to Firestore: appSettings/global { googleReviewLink }
 *
 * This link is read by OrderTracking.jsx (customer-facing) to show
 * the "Leave a Google Review — get 10% OFF" loyalty promo button.
 *
 * Add-only — zero changes to any existing component.
 * Can be embedded in Settings tab or LoyaltyDashboard.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';
import { RefreshCw, Link, CheckCircle } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const GoogleReviewSettings = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { T, isLight } = useTheme();

  const [link,    setLink   ] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving ] = useState(false);

  // ── Load per-café link on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!cafeId) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'cafes', cafeId));
        if (snap.exists()) {
          setLink(snap.data()?.googleReviewLink || '');
        }
      } catch (err) {
        console.warn('[GoogleReviewSettings] load error:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [cafeId]);

  // ── Save link to Firestore ────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = link.trim();
    // ── DEBUG: confirm db + value ─────────────────────────────────────────
    console.log('[GoogleReviewSettings] DB instance:', db);
    console.log('[GoogleReviewSettings] Saving link:', trimmed || '(empty)');

    if (trimmed && !trimmed.startsWith('http')) {
      toast.error('Please enter a valid URL starting with http');
      return;
    }

    setSaving(true);
    try {
      // Save per-café — merge: true so no other cafe document fields are overwritten
      await setDoc(
        doc(db, 'cafes', cafeId),
        { googleReviewLink: trimmed },
        { merge: true }
      );
      console.log('[GoogleReviewSettings] ✅ Saved to cafes/' + cafeId);
      toast.success('Google Review link saved ✓');
    } catch (err) {
      console.error('[GoogleReviewSettings] ❌ setDoc failed:', err.code, err.message, err);
      toast.error(`Failed to save link: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`${T.card} rounded-sm p-5`}
      data-testid="google-review-settings"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
          <Link className="w-4 h-4 text-[#D4AF37]" />
        </div>
        <div>
          <h3
            className={`${T.heading} font-semibold`}
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Google Review Link
          </h3>
          <p className={`${T.muted} text-xs mt-0.5`}>
            Customers see a "Leave a Google Review — get 10% OFF" prompt on their
            order tracking page. Paste your Google review URL below.
          </p>
        </div>
      </div>

      {loading ? (
        <div className={`flex items-center gap-2 ${T.muted} text-sm py-2`}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <input
            type="url"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="https://g.page/r/YOUR_REVIEW_ID/review"
            disabled={saving}
            className={`w-full ${T.input} rounded-sm h-11 px-4 transition-all text-sm`}
            data-testid="review-link-input"
          />

          {link.trim() && (
            <p className={`${T.muted} text-xs flex items-center gap-1.5`}>
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              Preview:{' '}
              <a
                href={link.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4AF37] underline truncate max-w-xs"
              >
                {link.trim()}
              </a>
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-50"
            data-testid="save-review-link-btn"
          >
            {saving
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
              : <><CheckCircle className="w-4 h-4" /> Save Link</>}
          </button>
        </form>
      )}
    </div>
  );
};

export default GoogleReviewSettings;
