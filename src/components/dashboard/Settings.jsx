import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { uploadImage } from '../../utils/uploadImage';
import { Save, Sun, Moon, ShoppingCart, Plus, Coffee } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    gstNumber: ''
  });

  // REAL-TIME: Load settings with onSnapshot
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
            gstNumber: data.gstNumber || ''
          });
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

  const handleSave = async () => {
    if (!cafeId) {
      toast.error('Cafe ID not found');
      return;
    }

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
        gstNumber: settings.gstNumber
      });
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Get computed colors based on mode
  const getPreviewColors = () => {
    const isLight = settings.mode === 'light';
    return {
      background: isLight ? '#ffffff' : '#0f0f0f',
      backgroundSecondary: isLight ? '#f5f5f5' : '#1a1a1a',
      text: isLight ? '#111111' : '#ffffff',
      textMuted: isLight ? '#666666' : '#a3a3a3',
      primary: settings.primaryColor,
      cardBg: isLight ? '#ffffff' : '#151515',
      border: isLight ? '#e5e5e5' : '#2a2a2a'
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
      {/* Cafe Information */}
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

      {/* Contact Settings */}
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

      {/* NEW: Billing Settings */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Billing Settings
        </h3>

        <div className="space-y-4">
          {/* GST Toggle */}
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
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  settings.gstEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* GST Rate and Number — only shown when GST is ON */}
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

      {/* NEW: Appearance Settings */}
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
                { color: '#D4AF37', name: 'Gold' },
                { color: '#E74C3C', name: 'Red' },
                { color: '#27AE60', name: 'Green' },
                { color: '#3498DB', name: 'Blue' },
                { color: '#9B59B6', name: 'Purple' },
                { color: '#E67E22', name: 'Orange' },
                { color: '#1ABC9C', name: 'Teal' },
                { color: '#E91E63', name: 'Pink' },
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

      {/* Live Preview */}
      <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
        <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
          Live Preview
        </h3>
        <p className="text-[#A3A3A3] text-sm mb-4">This is how your ordering page will look to customers.</p>

        {/* Preview Container */}
        <div 
          className="rounded-lg overflow-hidden border-2 border-white/10"
          style={{ backgroundColor: colors.background }}
        >
          {/* Preview Header */}
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

          {/* Preview Menu Items */}
          <div className="p-6">
            <h5 
              className="text-lg font-semibold mb-4"
              style={{ color: colors.text }}
            >
              Menu Preview
            </h5>
            <div className="grid grid-cols-2 gap-4">
              {/* Sample Menu Item 1 */}
              <div 
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
                    Cappuccino
                  </h6>
                  <div className="flex items-center justify-between">
                    <span className="font-bold" style={{ color: colors.primary }}>₹150</span>
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

              {/* Sample Menu Item 2 */}
              <div 
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
                    Latte
                  </h6>
                  <div className="flex items-center justify-between">
                    <span className="font-bold" style={{ color: colors.primary }}>₹180</span>
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
            </div>

            {/* Sample Cart Button */}
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

      {/* Save Button */}
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
