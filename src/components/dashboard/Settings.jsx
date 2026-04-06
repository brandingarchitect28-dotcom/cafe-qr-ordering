/**
 * Settings.jsx
 *
 * FIX (2026-04-06): Restored Platform Fee option.
 *
 * ROOT CAUSE: `platformFeeEnabled` and `platformFeeRate` were never added
 * to this file after being referenced in CafeOrdering.jsx. They were missing
 * from four places: (1) the useState initializer, (2) the onSnapshot loader,
 * (3) the handleSave updateDoc call, and (4) the JSX — so the toggle simply
 * had no UI and the field was never read from or written to Firestore.
 *
 * WHAT CHANGED: Added `platformFeeEnabled: false` and `platformFeeRate: 2`
 * to all four locations. Everything else is byte-for-byte identical to the
 * version currently deployed.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadImage } from '../../utils/uploadImage';
import { Save, Sun, Moon, ShoppingCart, Plus, Coffee, CreditCard, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import ChangePassword from './ChangePassword';

const Settings = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ─── Online Payment Settings state ─────────────────────────────────────────
  // Stored as paymentSettings nested map in the cafes/{cafeId} Firestore doc.
  // backendUrl is the Render backend URL used by AI Menu Upload + Cashfree payments.
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

  // ─── State ─────────────────────────────────────────────────────────────────
  // FIX: Added platformFeeEnabled + platformFeeRate (were missing)
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
    // Feature: Currency
    currencyCode: 'INR',
    currencySymbol: '₹',
    // Feature: Tax
    taxEnabled: false,
    taxName: 'GST',
    taxRate: 5,
    // Feature: Service Charge
    serviceChargeEnabled: false,
    serviceChargeRate: 10,
    // Feature: Platform Fee  ← FIX: restored
    platformFeeEnabled: false,
    platformFeeRate: 2,
  });

  // ─── Real-time load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cafeId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'cafes', cafeId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // FIX: platformFeeEnabled + platformFeeRate added to loader
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
          // Online Payment Settings (nested map)
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

  // ─── Logo upload ────────────────────────────────────────────────────────────
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

  // ─── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!cafeId) {
      toast.error('Cafe ID not found');
      return;
    }

    setSaving(true);
    try {
      // FIX: platformFeeEnabled + platformFeeRate added to updateDoc
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
        platformFeeEnabled: settings.platformFeeEnabled,                    // ← FIX
        platformFeeRate: parseFloat(settings.platformFeeRate) || 0,        // ← FIX
        // Online Payment Settings — nested map saved as paymentSettings
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
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ─── Preview colors ─────────────────────────────────────────────────────────
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[#A3A3A3]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Café Information ─────────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Café Information
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">Café Name</label>
            <input
              type="text"
              data-testid="settings-cafe-name"
              value={settings.name}
              onChange={(e) => setSettings(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              placeholder="e.g., Downtown Coffee"
            />
          </div>

          <div>
            <label className="block text-white text-sm font-medium mb-2">Tagline (Optional)</label>
            <input
              type="text"
              data-testid="settings-tagline"
              value={settings.tagline}
              onChange={(e) => setSettings(prev => ({ ...prev, tagline: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              placeholder="e.g., Crafted with love, served with joy"
            />
          </div>

          <div>
            <label className="block text-white text-sm font-medium mb-2">Logo</label>
            <div className="space-y-3">
              {settings.logo && (
                <div className="w-24 h-24 rounded-sm overflow-hidden border border-white/10">
                  <img src={settings.logo} alt="Logo" className="w-full h-full object-cover" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                data-testid="settings-logo-upload"
                onChange={handleLogoUpload}
                className="w-full bg-black/20 border border-white/10 text-white rounded-sm px-4 py-3 file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:bg-[#D4AF37] file:text-black file:font-semibold hover:file:bg-[#C5A059] transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact & Payment Settings ────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Contact & Payment Settings
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-white text-sm font-medium mb-2">WhatsApp Number</label>
            <input
              type="tel"
              data-testid="settings-whatsapp"
              value={settings.whatsappNumber}
              onChange={(e) => setSettings(prev => ({ ...prev, whatsappNumber: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              placeholder="+919876543210 (with country code)"
            />
            <p className="text-[#A3A3A3] text-xs mt-2">Orders will be sent to this WhatsApp number</p>
          </div>

          <div>
            <label className="block text-white text-sm font-medium mb-2">UPI ID (for prepaid orders)</label>
            <input
              type="text"
              data-testid="settings-upi"
              value={settings.upiId}
              onChange={(e) => setSettings(prev => ({ ...prev, upiId: e.target.value }))}
              className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              placeholder="merchant@upi"
            />
          </div>
        </div>
      </div>

      {/* ── Billing Settings (GST) ────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Billing Settings
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-white text-sm font-medium">Enable GST Billing</label>
              <p className="text-[#A3A3A3] text-xs mt-1">Apply GST tax to all customer orders</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, gstEnabled: !prev.gstEnabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                settings.gstEnabled ? 'bg-[#D4AF37]' : 'bg-white/10'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                settings.gstEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {settings.gstEnabled && (
            <>
              <div>
                <label className="block text-white text-sm font-medium mb-2">GST Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.gstRate}
                  onChange={(e) => setSettings(prev => ({ ...prev, gstRate: e.target.value }))}
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                  placeholder="e.g., 5"
                />
                <p className="text-[#A3A3A3] text-xs mt-2">Common GST rates: 5%, 12%, 18%</p>
              </div>

              <div>
                <label className="block text-white text-sm font-medium mb-2">GST Number (Optional)</label>
                <input
                  type="text"
                  value={settings.gstNumber}
                  onChange={(e) => setSettings(prev => ({ ...prev, gstNumber: e.target.value }))}
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                  placeholder="e.g., 27AAPFU0939F1ZV"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Currency Settings ─────────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Currency Settings
        </h3>
        <div>
          <label className="block text-white text-sm font-medium mb-2">Currency</label>
          <select
            value={settings.currencyCode}
            onChange={(e) => {
              const options = {
                INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', AUD: '$',
              };
              setSettings(prev => ({
                ...prev,
                currencyCode: e.target.value,
                currencySymbol: options[e.target.value] || '₹',
              }));
            }}
            className="w-full bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
          >
            <option value="INR" className="bg-[#0F0F0F]">INR (₹) — Indian Rupee</option>
            <option value="USD" className="bg-[#0F0F0F]">USD ($) — US Dollar</option>
            <option value="EUR" className="bg-[#0F0F0F]">EUR (€) — Euro</option>
            <option value="GBP" className="bg-[#0F0F0F]">GBP (£) — British Pound</option>
            <option value="AED" className="bg-[#0F0F0F]">AED (د.إ) — UAE Dirham</option>
            <option value="AUD" className="bg-[#0F0F0F]">AUD ($) — Australian Dollar</option>
          </select>
          <p className="text-[#A3A3A3] text-xs mt-2">
            Selected: {settings.currencyCode} — Symbol: {settings.currencySymbol}
          </p>
        </div>
      </div>

      {/* ── Tax Settings ──────────────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Tax Settings
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-white text-sm font-medium">Enable Tax</label>
              <p className="text-[#A3A3A3] text-xs mt-1">Apply tax to all customer orders</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, taxEnabled: !prev.taxEnabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                settings.taxEnabled ? 'bg-[#D4AF37]' : 'bg-white/10'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                settings.taxEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {settings.taxEnabled && (
            <>
              <div>
                <label className="block text-white text-sm font-medium mb-2">Tax Name</label>
                <input
                  type="text"
                  value={settings.taxName}
                  onChange={(e) => setSettings(prev => ({ ...prev, taxName: e.target.value }))}
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                  placeholder="e.g., GST, VAT, Sales Tax"
                />
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">Tax Percentage (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.taxRate}
                  onChange={(e) => setSettings(prev => ({ ...prev, taxRate: e.target.value }))}
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                  placeholder="e.g., 10"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Service Charge ────────────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Service Charge
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-white text-sm font-medium">Enable Service Charge</label>
              <p className="text-[#A3A3A3] text-xs mt-1">Add a service charge to all orders</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, serviceChargeEnabled: !prev.serviceChargeEnabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                settings.serviceChargeEnabled ? 'bg-[#D4AF37]' : 'bg-white/10'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                settings.serviceChargeEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {settings.serviceChargeEnabled && (
            <div>
              <label className="block text-white text-sm font-medium mb-2">Service Charge Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.serviceChargeRate}
                onChange={(e) => setSettings(prev => ({ ...prev, serviceChargeRate: e.target.value }))}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                placeholder="e.g., 10"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Platform Fee — FIX: restored section ─────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Platform Fee
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-white text-sm font-medium">Enable Platform Fee</label>
              <p className="text-[#A3A3A3] text-xs mt-1">Add a platform fee to all orders</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, platformFeeEnabled: !prev.platformFeeEnabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                settings.platformFeeEnabled ? 'bg-[#D4AF37]' : 'bg-white/10'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                settings.platformFeeEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {settings.platformFeeEnabled && (
            <div>
              <label className="block text-white text-sm font-medium mb-2">Platform Fee Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.platformFeeRate}
                onChange={(e) => setSettings(prev => ({ ...prev, platformFeeRate: e.target.value }))}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                placeholder="e.g., 2"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Appearance Settings ───────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Appearance Settings
        </h3>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-white text-sm font-medium mb-3">Mode</label>
            <div className="flex gap-3">
              <button
                type="button"
                data-testid="mode-light"
                onClick={() => setSettings(prev => ({ ...prev, mode: 'light' }))}
                className={`flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-sm border-2 transition-all ${
                  settings.mode === 'light'
                    ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]'
                    : 'border-white/10 text-white/70 hover:border-white/20'
                }`}
              >
                <Sun className="w-5 h-5" />
                <span className="font-medium">Light Mode</span>
              </button>
              <button
                type="button"
                data-testid="mode-dark"
                onClick={() => setSettings(prev => ({ ...prev, mode: 'dark' }))}
                className={`flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-sm border-2 transition-all ${
                  settings.mode === 'dark'
                    ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]'
                    : 'border-white/10 text-white/70 hover:border-white/20'
                }`}
              >
                <Moon className="w-5 h-5" />
                <span className="font-medium">Dark Mode</span>
              </button>
            </div>
          </div>

          {/* Primary Brand Color */}
          <div>
            <label className="block text-white text-sm font-medium mb-3">Primary Brand Color</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <input
                  type="color"
                  id="primaryColorPicker"
                  data-testid="settings-primary-color"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                  className="w-20 h-14 bg-transparent border-0 cursor-pointer rounded-sm"
                  style={{ padding: 0 }}
                />
                <div
                  className="absolute inset-0 rounded-sm border-2 border-white/20 pointer-events-none"
                  style={{ backgroundColor: settings.primaryColor }}
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                      setSettings(prev => ({ ...prev, primaryColor: val }));
                    }
                  }}
                  className="w-full bg-black/20 border border-white/10 text-white rounded-sm h-12 px-4 font-mono uppercase"
                  placeholder="#D4AF37"
                  maxLength={7}
                />
              </div>
            </div>
            <p className="text-[#A3A3A3] text-xs mt-2">This color will be used for buttons, highlights, and accents on your ordering page.</p>
          </div>

          {/* Quick Color Presets */}
          <div>
            <label className="block text-white text-sm font-medium mb-3">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {[
                { color: '#D4AF37', name: 'Gold'   },
                { color: '#E74C3C', name: 'Red'    },
                { color: '#27AE60', name: 'Green'  },
                { color: '#3498DB', name: 'Blue'   },
                { color: '#9B59B6', name: 'Purple' },
                { color: '#E67E22', name: 'Orange' },
                { color: '#1ABC9C', name: 'Teal'   },
                { color: '#E91E63', name: 'Pink'   },
              ].map((preset) => (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, primaryColor: preset.color }))}
                  className={`w-10 h-10 rounded-sm border-2 transition-all hover:scale-110 ${
                    settings.primaryColor.toUpperCase() === preset.color.toUpperCase()
                      ? 'border-white ring-2 ring-white/50'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.name}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Preview ──────────────────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Live Preview
        </h3>
        <p className="text-[#A3A3A3] text-sm mb-4">This is how your ordering page will look to customers.</p>

        <div
          className="rounded-lg overflow-hidden border-2 border-white/10"
          style={{ backgroundColor: colors.background }}
        >
          <div
            className="p-6 text-center border-b"
            style={{ borderColor: colors.border, backgroundColor: colors.backgroundSecondary }}
          >
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" className="w-16 h-16 mx-auto rounded-full object-cover mb-3" />
            ) : (
              <div
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3"
                style={{ backgroundColor: colors.primary }}
              >
                <Coffee className="w-8 h-8 text-white" />
              </div>
            )}
            <h4
              className="text-2xl font-bold mb-1"
              style={{ fontFamily: 'Playfair Display, serif', color: colors.text }}
            >
              {settings.name || 'Your Café Name'}
            </h4>
            <p style={{ color: colors.textMuted }}>
              {settings.tagline || 'Your tagline here'}
            </p>
          </div>

          <div className="p-6">
            <h5 className="text-lg font-semibold mb-4" style={{ color: colors.text }}>
              Menu Preview
            </h5>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'Cappuccino', price: '₹150' },
                { name: 'Latte',      price: '₹180' },
              ].map((item) => (
                <div
                  key={item.name}
                  className="rounded-lg overflow-hidden shadow-sm"
                  style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}` }}
                >
                  <div
                    className="h-24 flex items-center justify-center"
                    style={{ backgroundColor: colors.backgroundSecondary }}
                  >
                    <Coffee className="w-10 h-10" style={{ color: colors.textMuted }} />
                  </div>
                  <div className="p-3">
                    <h6 className="font-semibold text-sm mb-1" style={{ color: colors.text }}>
                      {item.name}
                    </h6>
                    <div className="flex items-center justify-between">
                      <span className="font-bold" style={{ color: colors.primary }}>{item.price}</span>
                      <button
                        className="px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-1"
                        style={{ backgroundColor: colors.primary }}
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <button
                className="w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.primary }}
              >
                <ShoppingCart className="w-5 h-5" />
                View Cart — ₹330
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Online Payment Settings ───────────────────────────────────────── */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Online Payment Settings
        </h3>

        <div className="space-y-5">

          {/* Enable Online Payments toggle */}
          <div className="flex items-center justify-between p-4 bg-black/20 rounded-sm border border-white/5">
            <div>
              <p className="font-medium text-white text-sm">Enable Online Payments</p>
              <p className="text-[#A3A3A3] text-xs mt-0.5">
                Allow customers to pay online at checkout
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                paymentSettings.enabled ? 'bg-[#D4AF37]' : 'bg-white/10'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                paymentSettings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Payment fields — always visible so owners can configure before enabling */}
          <div className="space-y-4">

            {/* Payment Gateway */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">Payment Gateway</label>
              <select
                value={paymentSettings.gateway}
                onChange={(e) => setPaymentSettings(prev => ({ ...prev, gateway: e.target.value }))}
                className="w-full bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              >
                <option value="cashfree" className="bg-[#0F0F0F]">Cashfree</option>
                <option value="razorpay" className="bg-[#0F0F0F]">Razorpay</option>
              </select>
            </div>

            {/* App ID / Key ID */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                {paymentSettings.gateway === 'cashfree' ? 'Cashfree App ID' : 'Razorpay Key ID'}
              </label>
              <input
                type="text"
                value={paymentSettings.keyId}
                onChange={(e) => setPaymentSettings(prev => ({ ...prev, keyId: e.target.value }))}
                placeholder={paymentSettings.gateway === 'cashfree' ? 'Your Cashfree App ID' : 'rzp_live_xxxxxxxxxxxx'}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 font-mono transition-all"
              />
            </div>

            {/* Secret Key */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                {paymentSettings.gateway === 'cashfree' ? 'Cashfree Secret Key' : 'Razorpay Key Secret'}
              </label>
              <div className="relative">
                <input
                  type={showKeySecret ? 'text' : 'password'}
                  value={paymentSettings.keySecret}
                  onChange={(e) => setPaymentSettings(prev => ({ ...prev, keySecret: e.target.value }))}
                  placeholder="••••••••••••••••"
                  className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 pr-12 font-mono transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKeySecret(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A3A3A3] transition-colors"
                >
                  {showKeySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Merchant Name */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">Merchant Name</label>
              <input
                type="text"
                value={paymentSettings.merchantName}
                onChange={(e) => setPaymentSettings(prev => ({ ...prev, merchantName: e.target.value }))}
                placeholder="Your café name as shown to customers"
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              />
            </div>

            {/* Backend URL — critical for AI Menu Upload + Cashfree server-side calls */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Render Backend URL
              </label>
              <input
                type="url"
                value={paymentSettings.backendUrl}
                onChange={(e) => setPaymentSettings(prev => ({ ...prev, backendUrl: e.target.value }))}
                placeholder="https://your-app.onrender.com"
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 font-mono transition-all"
              />
              <p className="text-[#A3A3A3] text-xs mt-2">
                Your Render backend URL. Required for Cashfree payments and AI Menu Upload.
              </p>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">Payment Currency</label>
              <select
                value={paymentSettings.currency}
                onChange={(e) => setPaymentSettings(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full bg-black/20 border border-white/10 text-white focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
              >
                <option value="INR" className="bg-[#0F0F0F]">INR — Indian Rupee</option>
                <option value="USD" className="bg-[#0F0F0F]">USD — US Dollar</option>
                <option value="EUR" className="bg-[#0F0F0F]">EUR — Euro</option>
                <option value="GBP" className="bg-[#0F0F0F]">GBP — British Pound</option>
              </select>
            </div>

            {/* Security notice */}
            <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-400 text-xs font-semibold">Secured via Render Backend</p>
                <p className="text-[#A3A3A3] text-xs mt-0.5 leading-relaxed">
                  Payment processing happens server-side on your Render backend. API keys are used
                  by the server — never exposed to customers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <ChangePassword />

      {/* ── Save Button ───────────────────────────────────────────────────── */}
      <button
        onClick={handleSave}
        disabled={saving || uploading}
        data-testid="save-settings-btn"
        className="w-full md:w-auto bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-8 py-3 font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Saving...' : uploading ? 'Uploading...' : 'Save Settings'}
      </button>
    </div>
  );
};

export default Settings;
