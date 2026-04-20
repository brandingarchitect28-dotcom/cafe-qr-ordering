/**
 * Settings.jsx
 *
 * FIX (2026-04-06): Restored Platform Fee option.
 * UI UPGRADE: Café-vibe premium aesthetic. Zero logic changes.
 * All Firestore reads/writes, state, handlers, toggles — 100% identical.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadImage } from '../../utils/uploadImage';
import { Save, Sun, Moon, ShoppingCart, Plus, Coffee, CreditCard, Eye, EyeOff, ShieldCheck, Settings as SettingsIcon, Phone, Receipt, ArrowLeftRight, Landmark, BellRing, Monitor, Palette, ScanEye, Lock, Smartphone, Loader, Upload } from 'lucide-react';
import { toast } from 'sonner';
import ChangePassword from './ChangePassword';

// ── Inject café-vibe CSS once ─────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('set-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'set-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .set { font-family: 'DM Sans', system-ui, sans-serif; }
    .set-title { font-family: 'Playfair Display', serif !important; }
    .set-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 24px;
      transition: border-color 200ms;
    }
    .set-card:hover { border-color: rgba(201,162,39,0.14); }
    .set-section-title {
      font-family: 'Playfair Display', serif;
      font-size: 1.2rem; color: #fff;
      margin-bottom: 20px;
      display: flex; align-items: center; gap: 8px;
    }
    .set-input {
      width: 100%;
      background: #1c1509;
      border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      color: #fff8ee;
      padding: 12px 16px;
      font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none;
      transition: border-color 180ms, box-shadow 180ms;
      height: 48px;
    }
    .set-input:focus { border-color: rgba(201,162,39,0.55); box-shadow: 0 0 0 3px rgba(201,162,39,0.1); }
    .set-input::placeholder { color: #3d3020; }
    .set-select {
      width: 100%;
      background: #1c1509;
      border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      color: #fff8ee;
      padding: 12px 16px;
      font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; cursor: pointer;
      transition: border-color 160ms;
      height: 48px;
    }
    .set-select:focus { border-color: rgba(201,162,39,0.5); }
    .set-select option { background: #1c1509; }
    .set-label {
      display: block;
      color: #C9A227;
      font-size: 11px; font-weight: 900;
      text-transform: uppercase; letter-spacing: 0.08em;
      margin-bottom: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .set-hint { color: #7a6a55; font-size: 11px; font-weight: 600; margin-top: 5px; }
    .set-toggle-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
    }
    .set-toggle-row:hover { border-color: rgba(201,162,39,0.15); }
    .set-save-btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: linear-gradient(135deg,#C9A227,#A67C00);
      color: #fff; font-weight: 900; font-size: 15px;
      font-family: 'DM Sans', system-ui, sans-serif;
      padding: 14px 32px; border-radius: 14px; border: none;
      cursor: pointer; transition: all 200ms;
      box-shadow: 0 4px 18px rgba(201,162,39,0.35);
    }
    .set-save-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(201,162,39,0.45); }
    .set-save-btn:active { transform: scale(0.97); }
    .set-save-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
  `;
  document.head.appendChild(el);
}

const Settings = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [showKeySecret, setShowKeySecret] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState({
    enabled:      false,
    gateway:      'cashfree',
    keyId:        '',
    keySecret:    '',
    merchantName: '',
    backendUrl:   '',
    currency:     'INR',
  });

  // FIX: platformFeeEnabled + platformFeeRate restored
  const [settings, setSettings] = useState({
    name: '',
    logo: '',
    tagline: '',
    whatsappNumber: '',
    upiId: '',
    primaryColor: '#D4AF37',
    mode: 'light',
    gstEnabled: false,
    gstRate: 5,
    gstNumber: '',
    currencyCode: 'INR',
    currencySymbol: '₹',
    taxEnabled: false,
    taxName: 'GST',
    taxRate: 5,
    serviceChargeEnabled: false,
    serviceChargeRate: 10,
    platformFeeEnabled: false,  // ← FIX
    platformFeeRate: 2,         // ← FIX
  });

  // ── Real-time load — UNCHANGED ────────────────────────────────────────────
  useEffect(() => {
    if (!cafeId) return;
    const unsubscribe = onSnapshot(
      doc(db, 'cafes', cafeId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            name: data.name || '',
            logo: data.logo || '',
            tagline: data.tagline || '',
            whatsappNumber: data.whatsappNumber || '',
            upiId: data.upiId || '',
            primaryColor: data.primaryColor || '#D4AF37',
            mode: data.mode || 'light',
            gstEnabled: data.gstEnabled || false,
            gstRate: data.gstRate ?? 5,
            gstNumber: data.gstNumber || '',
            currencyCode: data.currencyCode || 'INR',
            currencySymbol: data.currencySymbol || '₹',
            taxEnabled: data.taxEnabled || false,
            taxName: data.taxName || 'GST',
            taxRate: data.taxRate ?? 5,
            serviceChargeEnabled: data.serviceChargeEnabled || false,
            serviceChargeRate: data.serviceChargeRate ?? 10,
            platformFeeEnabled: data.platformFeeEnabled || false,  // ← FIX
            platformFeeRate: data.platformFeeRate ?? 2,            // ← FIX
          });
          if (data.paymentSettings) {
            setPaymentSettings({
              enabled:      data.paymentSettings.enabled      ?? false,
              gateway:      data.paymentSettings.gateway      || 'cashfree',
              keyId:        data.paymentSettings.keyId        || '',
              keySecret:    data.paymentSettings.keySecret    || '',
              merchantName: data.paymentSettings.merchantName || '',
              backendUrl:   data.paymentSettings.backendUrl   || '',
              currency:     data.paymentSettings.currency     || 'INR',
            });
          }
        }
        setLoading(false);
      },
      (error) => {
        toast.error('Failed to load settings');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [cafeId]);

  // ── Logo upload — UNCHANGED ───────────────────────────────────────────────
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file (JPG, PNG, WebP)'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploading(true);
    const toastId = toast.loading('Uploading logo...');
    try {
      const path = `logos/${cafeId}/${Date.now()}_${file.name}`;
      const url = await uploadImage(file, path, (pct) => {
        toast.loading(`Uploading... ${pct}%`, { id: toastId });
      });
      setSettings(prev => ({ ...prev, logo: url }));
      toast.success('Logo uploaded!', { id: toastId });
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error(error.message || 'Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  // ── Save — UNCHANGED (FIX: platformFee fields included) ──────────────────
  const handleSave = async () => {
    if (!cafeId) { toast.error('Cafe ID not found'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'cafes', cafeId), {
        name: settings.name,
        logo: settings.logo,
        tagline: settings.tagline,
        whatsappNumber: settings.whatsappNumber,
        upiId: settings.upiId,
        primaryColor: settings.primaryColor,
        mode: settings.mode,
        gstEnabled: settings.gstEnabled,
        gstRate: parseFloat(settings.gstRate) || 0,
        gstNumber: settings.gstNumber,
        currencyCode: settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        taxEnabled: settings.taxEnabled,
        taxName: settings.taxName || 'GST',
        taxRate: parseFloat(settings.taxRate) || 0,
        serviceChargeEnabled: settings.serviceChargeEnabled,
        serviceChargeRate: parseFloat(settings.serviceChargeRate) || 0,
        platformFeeEnabled: settings.platformFeeEnabled,              // ← FIX
        platformFeeRate: parseFloat(settings.platformFeeRate) || 0,  // ← FIX
        paymentSettings: {
          enabled:      paymentSettings.enabled,
          gateway:      paymentSettings.gateway,
          keyId:        paymentSettings.keyId.trim(),
          keySecret:    paymentSettings.keySecret.trim(),
          merchantName: paymentSettings.merchantName.trim(),
          backendUrl:   paymentSettings.backendUrl.trim(),
          currency:     paymentSettings.currency,
        },
      });
      toast.success('Settings saved! ✓');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getPreviewColors = () => {
    const isLight = settings.mode === 'light';
    return {
      background: isLight ? '#ffffff' : '#0f0f0f',
      backgroundSecondary: isLight ? '#f5f5f5' : '#1a1a1a',
      text: isLight ? '#111111' : '#ffffff',
      textMuted: isLight ? '#666666' : '#a3a3a3',
      primary: settings.primaryColor,
      cardBg: isLight ? '#ffffff' : '#151515',
      border: isLight ? '#e5e5e5' : '#2a2a2a',
    };
  };
  const colors = getPreviewColors();

  // ── Toggle component ──────────────────────────────────────────────────────
  const Toggle = ({ enabled, onToggle }) => (
    <button type="button" onClick={onToggle}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${enabled ? 'bg-[#C9A227]' : 'bg-white/10'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  if (loading) {
    return (
      <div className="set flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-4xl animate-bounce"><SettingsIcon className="w-9 h-9" style={{ color: '#7a6a55' }} /></div>
        <p className="text-sm font-bold" style={{ color: '#7a6a55' }}>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="set space-y-5">

      {/* ── Café Information ──────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><Coffee className="w-5 h-5" /> Café Information</h3>
        <div className="space-y-4">
          <div>
            <label className="set-label">Café Name</label>
            <input type="text" data-testid="settings-cafe-name" value={settings.name}
              onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))}
              className="set-input" placeholder="e.g., Downtown Coffee" />
          </div>
          <div>
            <label className="set-label">Tagline (Optional)</label>
            <input type="text" data-testid="settings-tagline" value={settings.tagline}
              onChange={e => setSettings(prev => ({ ...prev, tagline: e.target.value }))}
              className="set-input" placeholder="e.g., Crafted with love, served with joy" />
          </div>
          <div>
            <label className="set-label">Logo</label>
            <div className="space-y-3">
              {settings.logo && (
                <div className="w-24 h-24 rounded-2xl overflow-hidden" style={{ border: '1.5px solid rgba(201,162,39,0.25)' }}>
                  <img src={settings.logo} alt="Logo" className="w-full h-full object-cover" />
                </div>
              )}
              <input type="file" accept="image/*" data-testid="settings-logo-upload"
                onChange={handleLogoUpload}
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-black file:text-black file:cursor-pointer"
                style={{ background: '#1c1509', border: '1.5px solid rgba(255,255,255,0.08)', color: '#7a6a55', '--tw-file-bg': '#C9A227' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact & Payment ─────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><Phone className="w-5 h-5" /> Contact & Payment</h3>
        <div className="space-y-4">
          <div>
            <label className="set-label">WhatsApp Number</label>
            <input type="tel" data-testid="settings-whatsapp" value={settings.whatsappNumber}
              onChange={e => setSettings(prev => ({ ...prev, whatsappNumber: e.target.value }))}
              className="set-input" placeholder="+919876543210 (with country code)" />
            <p className="set-hint"><Smartphone className="inline w-3 h-3 mr-1" />Orders will be sent to this WhatsApp number</p>
          </div>
          <div>
            <label className="set-label">UPI ID (for prepaid orders)</label>
            <input type="text" data-testid="settings-upi" value={settings.upiId}
              onChange={e => setSettings(prev => ({ ...prev, upiId: e.target.value }))}
              className="set-input" placeholder="merchant@upi" />
          </div>
        </div>
      </div>

      {/* ── Billing / GST ─────────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><Receipt className="w-5 h-5" /> Billing Settings</h3>
        <div className="space-y-4">
          <div className="set-toggle-row">
            <div>
              <p className="font-black text-sm text-white">Enable GST Billing</p>
              <p className="set-hint mt-0.5">Apply GST tax to all customer orders</p>
            </div>
            <Toggle enabled={settings.gstEnabled} onToggle={() => setSettings(prev => ({ ...prev, gstEnabled: !prev.gstEnabled }))} />
          </div>
          {settings.gstEnabled && (
            <>
              <div>
                <label className="set-label">GST Rate (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={settings.gstRate}
                  onChange={e => setSettings(prev => ({ ...prev, gstRate: e.target.value }))}
                  className="set-input" placeholder="e.g., 5" />
                <p className="set-hint">Common GST rates: 5%, 12%, 18%</p>
              </div>
              <div>
                <label className="set-label">GST Number (Optional)</label>
                <input type="text" value={settings.gstNumber}
                  onChange={e => setSettings(prev => ({ ...prev, gstNumber: e.target.value }))}
                  className="set-input" placeholder="e.g., 27AAPFU0939F1ZV" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Currency ──────────────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><ArrowLeftRight className="w-5 h-5" /> Currency Settings</h3>
        <div>
          <label className="set-label">Currency</label>
          <select value={settings.currencyCode}
            onChange={e => {
              const options = { INR:'₹', USD:'$', EUR:'€', GBP:'£', AED:'د.إ', AUD:'$' };
              setSettings(prev => ({ ...prev, currencyCode: e.target.value, currencySymbol: options[e.target.value] || '₹' }));
            }}
            className="set-select">
            <option value="INR">INR (₹) — Indian Rupee</option>
            <option value="USD">USD ($) — US Dollar</option>
            <option value="EUR">EUR (€) — Euro</option>
            <option value="GBP">GBP (£) — British Pound</option>
            <option value="AED">AED (د.إ) — UAE Dirham</option>
            <option value="AUD">AUD ($) — Australian Dollar</option>
          </select>
          <p className="set-hint">Selected: {settings.currencyCode} — Symbol: {settings.currencySymbol}</p>
        </div>
      </div>

      {/* ── Tax Settings ──────────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><Landmark className="w-5 h-5" /> Tax Settings</h3>
        <div className="space-y-4">
          <div className="set-toggle-row">
            <div>
              <p className="font-black text-sm text-white">Enable Tax</p>
              <p className="set-hint mt-0.5">Apply tax to all customer orders</p>
            </div>
            <Toggle enabled={settings.taxEnabled} onToggle={() => setSettings(prev => ({ ...prev, taxEnabled: !prev.taxEnabled }))} />
          </div>
          {settings.taxEnabled && (
            <>
              <div>
                <label className="set-label">Tax Name</label>
                <input type="text" value={settings.taxName}
                  onChange={e => setSettings(prev => ({ ...prev, taxName: e.target.value }))}
                  className="set-input" placeholder="e.g., GST, VAT, Sales Tax" />
              </div>
              <div>
                <label className="set-label">Tax Percentage (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={settings.taxRate}
                  onChange={e => setSettings(prev => ({ ...prev, taxRate: e.target.value }))}
                  className="set-input" placeholder="e.g., 10" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Service Charge ────────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><BellRing className="w-5 h-5" /> Service Charge</h3>
        <div className="space-y-4">
          <div className="set-toggle-row">
            <div>
              <p className="font-black text-sm text-white">Enable Service Charge</p>
              <p className="set-hint mt-0.5">Add a service charge to all orders</p>
            </div>
            <Toggle enabled={settings.serviceChargeEnabled} onToggle={() => setSettings(prev => ({ ...prev, serviceChargeEnabled: !prev.serviceChargeEnabled }))} />
          </div>
          {settings.serviceChargeEnabled && (
            <div>
              <label className="set-label">Service Charge Percentage (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={settings.serviceChargeRate}
                onChange={e => setSettings(prev => ({ ...prev, serviceChargeRate: e.target.value }))}
                className="set-input" placeholder="e.g., 10" />
            </div>
          )}
        </div>
      </div>

      {/* ── Platform Fee — FIX: restored ─────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><Monitor className="w-5 h-5" /> Platform Fee</h3>
        <div className="space-y-4">
          <div className="set-toggle-row">
            <div>
              <p className="font-black text-sm text-white">Enable Platform Fee</p>
              <p className="set-hint mt-0.5">Add a platform fee to all orders</p>
            </div>
            <Toggle enabled={settings.platformFeeEnabled} onToggle={() => setSettings(prev => ({ ...prev, platformFeeEnabled: !prev.platformFeeEnabled }))} />
          </div>
          {settings.platformFeeEnabled && (
            <div>
              <label className="set-label">Platform Fee Percentage (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={settings.platformFeeRate}
                onChange={e => setSettings(prev => ({ ...prev, platformFeeRate: e.target.value }))}
                className="set-input" placeholder="e.g., 2" />
            </div>
          )}
        </div>
      </div>

      {/* ── Appearance ────────────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><Palette className="w-5 h-5" /> Appearance Settings</h3>
        <div className="space-y-6">

          {/* Mode */}
          <div>
            <label className="set-label">Mode</label>
            <div className="flex gap-3">
              <button type="button" data-testid="mode-light"
                onClick={() => setSettings(prev => ({ ...prev, mode: 'light' }))}
                className="flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-xl border-2 font-black text-sm transition-all"
                style={settings.mode === 'light'
                  ? { borderColor: '#C9A227', background: 'rgba(201,162,39,0.1)', color: '#C9A227' }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                <Sun className="w-5 h-5" /> Light Mode
              </button>
              <button type="button" data-testid="mode-dark"
                onClick={() => setSettings(prev => ({ ...prev, mode: 'dark' }))}
                className="flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-xl border-2 font-black text-sm transition-all"
                style={settings.mode === 'dark'
                  ? { borderColor: '#C9A227', background: 'rgba(201,162,39,0.1)', color: '#C9A227' }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                <Moon className="w-5 h-5" /> Dark Mode
              </button>
            </div>
          </div>

          {/* Primary Color */}
          <div>
            <label className="set-label">Primary Brand Color</label>
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.15)' }}>
                <input type="color" id="primaryColorPicker" data-testid="settings-primary-color"
                  value={settings.primaryColor}
                  onChange={e => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ backgroundColor: settings.primaryColor }} />
              </div>
              <input type="text" value={settings.primaryColor}
                onChange={e => { const val = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setSettings(prev => ({ ...prev, primaryColor: val })); }}
                className="set-input flex-1 font-mono uppercase" placeholder="#C9A227" maxLength={7} />
            </div>
            <p className="set-hint mt-2">Used for buttons, highlights, and accents on your ordering page</p>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="set-label">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {[
                { color:'#D4AF37', name:'Gold'   }, { color:'#C9A227', name:'Orange' },
                { color:'#E74C3C', name:'Red'    }, { color:'#27AE60', name:'Green'  },
                { color:'#3498DB', name:'Blue'   }, { color:'#9B59B6', name:'Purple' },
                { color:'#1ABC9C', name:'Teal'   }, { color:'#E91E63', name:'Pink'   },
              ].map(preset => (
                <button key={preset.color} type="button"
                  onClick={() => setSettings(prev => ({ ...prev, primaryColor: preset.color }))}
                  className="w-11 h-11 rounded-xl border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: preset.color,
                    borderColor: settings.primaryColor.toUpperCase() === preset.color.toUpperCase() ? '#fff' : 'transparent',
                    boxShadow: settings.primaryColor.toUpperCase() === preset.color.toUpperCase() ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
                  }}
                  title={preset.name} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Preview ──────────────────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><ScanEye className="w-5 h-5" /> Live Preview</h3>
        <p className="set-hint mb-4">This is how your ordering page will look to customers.</p>
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.background, border: `2px solid ${colors.border}` }}>
          <div className="p-6 text-center border-b" style={{ borderColor: colors.border, backgroundColor: colors.backgroundSecondary }}>
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" className="w-16 h-16 mx-auto rounded-full object-cover mb-3" />
            ) : (
              <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: colors.primary }}>
                <Coffee className="w-8 h-8 text-white" />
              </div>
            )}
            <h4 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Playfair Display, serif', color: colors.text }}>
              {settings.name || 'Your Café Name'}
            </h4>
            <p style={{ color: colors.textMuted }}>{settings.tagline || 'Your tagline here'}</p>
          </div>
          <div className="p-6">
            <h5 className="text-lg font-semibold mb-4" style={{ color: colors.text }}>Menu Preview</h5>
            <div className="grid grid-cols-2 gap-4">
              {[{ name:'Cappuccino', price:'₹150' }, { name:'Latte', price:'₹180' }].map(item => (
                <div key={item.name} className="rounded-xl overflow-hidden shadow-sm" style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}` }}>
                  <div className="h-24 flex items-center justify-center" style={{ backgroundColor: colors.backgroundSecondary }}>
                    <Coffee className="w-10 h-10" style={{ color: colors.textMuted }} />
                  </div>
                  <div className="p-3">
                    <h6 className="font-semibold text-sm mb-1" style={{ color: colors.text }}>{item.name}</h6>
                    <div className="flex items-center justify-between">
                      <span className="font-bold" style={{ color: colors.primary }}>{item.price}</span>
                      <button className="px-3 py-1 rounded-full text-white text-xs font-bold flex items-center gap-1" style={{ backgroundColor: colors.primary }}>
                        <Plus className="w-3 h-3" />Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <button className="w-full py-3 rounded-xl text-white font-black flex items-center justify-center gap-2" style={{ backgroundColor: colors.primary }}>
                <ShoppingCart className="w-5 h-5" />View Cart — ₹330
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Online Payment Settings ───────────────────────────────────────── */}
      <div className="set-card">
        <h3 className="set-section-title"><CreditCard className="w-5 h-5" /> Online Payment Settings</h3>
        <div className="space-y-5">

          {/* Enable toggle */}
          <div className="set-toggle-row">
            <div>
              <p className="font-black text-sm text-white">Enable Online Payments</p>
              <p className="set-hint mt-0.5">Allow customers to pay online at checkout</p>
            </div>
            <Toggle enabled={paymentSettings.enabled} onToggle={() => setPaymentSettings(prev => ({ ...prev, enabled: !prev.enabled }))} />
          </div>

          <div className="space-y-4">
            {/* Gateway */}
            <div>
              <label className="set-label">Payment Gateway</label>
              <select value={paymentSettings.gateway}
                onChange={e => setPaymentSettings(prev => ({ ...prev, gateway: e.target.value }))}
                className="set-select">
                <option value="cashfree">Cashfree</option>
                <option value="razorpay">Razorpay</option>
              </select>
            </div>

            {/* Key ID */}
            <div>
              <label className="set-label">
                {paymentSettings.gateway === 'cashfree' ? 'Cashfree App ID' : 'Razorpay Key ID'}
              </label>
              <input type="text" value={paymentSettings.keyId}
                onChange={e => setPaymentSettings(prev => ({ ...prev, keyId: e.target.value }))}
                placeholder={paymentSettings.gateway === 'cashfree' ? 'Your Cashfree App ID' : 'rzp_live_xxxxxxxxxxxx'}
                className="set-input font-mono" />
            </div>

            {/* Secret */}
            <div>
              <label className="set-label">
                {paymentSettings.gateway === 'cashfree' ? 'Cashfree Secret Key' : 'Razorpay Key Secret'}
              </label>
              <div className="relative">
                <input type={showKeySecret ? 'text' : 'password'} value={paymentSettings.keySecret}
                  onChange={e => setPaymentSettings(prev => ({ ...prev, keySecret: e.target.value }))}
                  placeholder="••••••••••••••••"
                  className="set-input font-mono" style={{ paddingRight: '44px' }} />
                <button type="button" onClick={() => setShowKeySecret(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#4a3f35' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#C9A227'}
                  onMouseLeave={e => e.currentTarget.style.color = '#4a3f35'}>
                  {showKeySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Merchant Name */}
            <div>
              <label className="set-label">Merchant Name</label>
              <input type="text" value={paymentSettings.merchantName}
                onChange={e => setPaymentSettings(prev => ({ ...prev, merchantName: e.target.value }))}
                placeholder="Your café name as shown to customers"
                className="set-input" />
            </div>

            {/* Backend URL */}
            <div>
              <label className="set-label">Render Backend URL</label>
              <input type="url" value={paymentSettings.backendUrl}
                onChange={e => setPaymentSettings(prev => ({ ...prev, backendUrl: e.target.value }))}
                placeholder="https://your-app.onrender.com"
                className="set-input font-mono" />
              <p className="set-hint">Required for Cashfree payments and AI Menu Upload</p>
            </div>

            {/* Currency */}
            <div>
              <label className="set-label">Payment Currency</label>
              <select value={paymentSettings.currency}
                onChange={e => setPaymentSettings(prev => ({ ...prev, currency: e.target.value }))}
                className="set-select">
                <option value="INR">INR — Indian Rupee</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </div>

            {/* Security notice */}
            <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
              <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#34d399' }} />
              <div>
                <p className="text-xs font-black flex items-center gap-1" style={{ color: '#34d399' }}><Lock className="inline w-3 h-3" /> Secured via Render Backend</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#7a6a55' }}>
                  Payment processing happens server-side on your Render backend. API keys are used by the server — never exposed to customers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <ChangePassword />

      {/* ── Save Button ───────────────────────────────────────────────────── */}
      <div>
        <button onClick={handleSave} disabled={saving || uploading}
          data-testid="save-settings-btn"
          className="set-save-btn">
          <Save className="w-5 h-5" />
          {saving ? <><Loader className="w-4 h-4 animate-spin" /> Saving…</> : uploading ? <><Upload className="w-4 h-4" /> Uploading…</> : 'Save Settings'}
        </button>
      </div>

    </div>
  );
};

export default Settings;
