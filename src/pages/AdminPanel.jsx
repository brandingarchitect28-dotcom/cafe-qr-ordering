import React, { useState } from 'react';
import { useCollection } from '../hooks/useFirestore';
import { signOut, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building2, DollarSign, Plus, LogOut, X,
  Key, Power, PowerOff, ChevronDown, ChevronUp,
  Sparkles, Shield, Crown, Star,
} from 'lucide-react';
import FeatureToggles from '../components/dashboard/FeatureToggles';
import AdminApiSettings from '../components/dashboard/AdminApiSettings';

// ── Secondary Firebase app (prevents admin logout on user creation) ──────────
const SECONDARY_APP_NAME = 'admin-user-creator';
const getSecondaryAuth = () => {
  const existing = getApps().find(a => a.name === SECONDARY_APP_NAME);
  const app = existing ?? initializeApp(
    {
      apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    },
    SECONDARY_APP_NAME
  );
  return getAuth(app);
};

const inputCls = 'w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-11 px-4 transition-all text-sm';
const labelCls = 'block text-white text-sm font-medium mb-1.5';

// ── CafeRow ──────────────────────────────────────────────────────────────────
const CafeRow = ({ cafe, allOrders }) => {
  const [expanded,    setExpanded ] = useState(false);
  const [toggling,    setToggling ] = useState(false);
  const [activePanel, setPanel    ] = useState('features');

  const cafeOrders  = allOrders?.filter(o => o.cafeId === cafe.id) || [];
  const cafeRevenue = cafeOrders
    .filter(o => o.paymentStatus === 'paid')
    .reduce((s, o) => s + (o.totalAmount || o.total || 0), 0);

  const isActive = cafe.isActive !== false;
  const planColor = cafe.planType === 'premium' ? '#D4AF37' : '#A3A3A3';

  const handleToggle = async (e) => {
    e.stopPropagation();
    setToggling(true);
    try {
      await updateDoc(doc(db, 'cafes', cafe.id), { isActive: !isActive });
      toast.success(`${cafe.name} ${!isActive ? 'enabled' : 'disabled'}`);
    } catch { toast.error('Failed to update'); }
    finally { setToggling(false); }
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${isActive ? 'border-white/8 bg-[#0A0A0A]' : 'border-red-500/15 bg-red-500/3'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/2 transition-colors" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-4 min-w-0">
          {cafe.logo
            ? <img src={cafe.logo} alt={cafe.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            : <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5 text-[#D4AF37]" /></div>
          }
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-white font-semibold truncate">{cafe.name}</h4>
              <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ color: planColor, background: `${planColor}15`, border: `1px solid ${planColor}30` }}>
                {cafe.planType === 'premium' ? 'Premium' : 'Basic'}
              </span>
              {!isActive && <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">DISABLED</span>}
            </div>
            <p className="text-[#555] text-xs mt-0.5 font-mono truncate">{cafe.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="hidden sm:block text-[#10B981] text-sm font-semibold">₹{cafeRevenue.toFixed(0)}</span>
          <span className="hidden sm:block text-[#A3A3A3] text-xs">{cafeOrders.length} orders</span>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold transition-all disabled:opacity-50 ${isActive ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'}`}
          >
            {toggling
              ? <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : isActive ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />
            }
            {isActive ? 'Disable' : 'Enable'}
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-[#A3A3A3]" /> : <ChevronDown className="w-4 h-4 text-[#A3A3A3]" />}
        </div>
      </div>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="border-t border-white/5">
              <div className="flex border-b border-white/5">
                {[{ id: 'features', label: 'Feature Toggles', icon: Sparkles }, { id: 'api', label: 'API Keys', icon: Key }].map(tab => (
                  <button key={tab.id} onClick={() => setPanel(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${activePanel === tab.id ? 'text-[#D4AF37] border-[#D4AF37]' : 'text-[#A3A3A3] border-transparent hover:text-white'}`}>
                    <tab.icon className="w-3.5 h-3.5" />{tab.label}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {activePanel === 'features' && <FeatureToggles cafeId={cafe.id} />}
                {activePanel === 'api'      && <AdminApiSettings />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main AdminPanel ───────────────────────────────────────────────────────────
const AdminPanel = () => {
  const navigate = useNavigate();
  const [showCafeForm, setShowCafeForm] = useState(false);
  const [creating,     setCreating    ] = useState(false);
  const [activeTab,    setActiveTab   ] = useState('cafes');
  const [cafeFormData, setForm        ] = useState({
    name: '', logo: '', email: '', password: '',
    primaryColor: '#D4AF37', secondaryColor: '#E5E5E5',
    layoutStyle: 'minimal', planType: 'basic',
  });

  const { data: cafes     } = useCollection('cafes');
  const { data: allOrders } = useCollection('orders');

  const totalRevenue = allOrders?.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (o.totalAmount || o.total || 0), 0) || 0;
  const activeCafes  = cafes?.filter(c => c.isActive !== false).length || 0;
  const premiumCafes = cafes?.filter(c => c.planType === 'premium').length || 0;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreateCafe = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const cafeRef = await addDoc(collection(db, 'cafes'), {
        name: cafeFormData.name,
        logo: cafeFormData.logo,
        theme: { primaryColor: cafeFormData.primaryColor, secondaryColor: cafeFormData.secondaryColor, layoutStyle: cafeFormData.layoutStyle },
        planType:           cafeFormData.planType,
        isActive:           true,
        subscriptionStatus: 'active',
        features: {
          aiInsights: cafeFormData.planType === 'premium',
          aiMenu:     cafeFormData.planType === 'premium',
          videoMenu:  cafeFormData.planType === 'premium',
          whatsapp:   true,
        },
        createdAt: new Date(),
      });
      const secondaryAuth  = getSecondaryAuth();
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cafeFormData.email, cafeFormData.password);
      await secondaryAuth.signOut();
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: cafeFormData.name, email: cafeFormData.email,
        role: 'cafe', cafeId: cafeRef.id, planType: cafeFormData.planType, createdAt: new Date(),
      });
      toast.success(`Café "${cafeFormData.name}" created!`);
      setForm({ name: '', logo: '', email: '', password: '', primaryColor: '#D4AF37', secondaryColor: '#E5E5E5', layoutStyle: 'minimal', planType: 'basic' });
      setShowCafeForm(false);
    } catch (error) {
      if      (error.code === 'auth/email-already-in-use') toast.error('Email already registered.');
      else if (error.code === 'auth/weak-password')        toast.error('Password must be at least 6 characters.');
      else if (error.code === 'auth/invalid-email')        toast.error('Invalid email address.');
      else                                                 toast.error(error.message || 'Failed to create café.');
    } finally { setCreating(false); }
  };

  return (
    <div className="min-h-screen bg-[#050505]" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <header className="border-b border-white/5 bg-[#050505]/90 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <h1 className="text-2xl font-bold text-[#D4AF37]" style={{ fontFamily: 'Playfair Display, serif' }}>Admin Panel</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1 bg-white/5 rounded-lg p-1">
              {[{ id: 'cafes', label: 'Cafés', icon: Building2 }, { id: 'api', label: 'API Keys', icon: Key }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-[#D4AF37] text-black' : 'text-[#A3A3A3] hover:text-white'}`}>
                  <tab.icon className="w-3.5 h-3.5" />{tab.label}
                </button>
              ))}
            </div>
            <button onClick={async () => { await signOut(auth); navigate('/login'); }} className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm transition-colors">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">

        {/* CAFÉS TAB */}
        {activeTab === 'cafes' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Cafés',   value: cafes?.length || 0,       color: '#D4AF37', Icon: Building2  },
                { label: 'Active',        value: activeCafes,               color: '#10B981', Icon: Power      },
                { label: 'Premium',       value: premiumCafes,              color: '#8B5CF6', Icon: Crown      },
                { label: 'Revenue',       value: `₹${totalRevenue.toFixed(0)}`, color: '#3B82F6', Icon: DollarSign },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-[#0F0F0F] border border-white/5 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">{s.label}</p>
                    <s.Icon className="w-4 h-4" style={{ color: s.color }} />
                  </div>
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Create btn */}
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>All Cafés</h2>
              <button onClick={() => setShowCafeForm(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all">
                <Plus className="w-4 h-4" />Create New Café
              </button>
            </div>

            {/* Create form */}
            <AnimatePresence>
              {showCafeForm && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="bg-[#0F0F0F] border border-white/8 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>Create New Café</h3>
                    <button onClick={() => setShowCafeForm(false)} className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all"><X className="w-5 h-5" /></button>
                  </div>
                  <form onSubmit={handleCreateCafe} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className={labelCls}>Café Name</label><input type="text" value={cafeFormData.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="e.g., Downtown Coffee" required /></div>
                      <div><label className={labelCls}>Logo URL <span className="text-[#555] font-normal">(optional)</span></label><input type="url" value={cafeFormData.logo} onChange={e => set('logo', e.target.value)} className={inputCls} placeholder="https://..." /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className={labelCls}>Owner Email</label><input type="email" value={cafeFormData.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="owner@example.com" required /></div>
                      <div><label className={labelCls}>Password</label><input type="password" value={cafeFormData.password} onChange={e => set('password', e.target.value)} className={inputCls} placeholder="Min 6 characters" required minLength={6} /></div>
                    </div>

                    {/* Plan selection */}
                    <div>
                      <label className={labelCls}>Plan Type</label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: 'basic',   label: 'Basic Plan',   desc: 'QR ordering, menus, orders, invoices, inventory', Icon: Star,  color: '#A3A3A3' },
                          { value: 'premium', label: 'Premium Plan', desc: 'Basic + AI Insights, AI Menu Upload, Video Menu',  Icon: Crown, color: '#D4AF37' },
                        ].map(plan => (
                          <button key={plan.value} type="button" onClick={() => set('planType', plan.value)}
                            className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${cafeFormData.planType === plan.value ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-white/10 hover:border-white/20'}`}>
                            <plan.Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                            <div>
                              <p className="text-white font-semibold text-sm">{plan.label}</p>
                              <p className="text-[#A3A3A3] text-xs mt-0.5 leading-relaxed">{plan.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div><label className={labelCls}>Primary Color</label><input type="color" value={cafeFormData.primaryColor} onChange={e => set('primaryColor', e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-sm h-11 px-2 transition-all" /></div>
                      <div><label className={labelCls}>Secondary Color</label><input type="color" value={cafeFormData.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-sm h-11 px-2 transition-all" /></div>
                      <div><label className={labelCls}>Layout</label>
                        <select value={cafeFormData.layoutStyle} onChange={e => set('layoutStyle', e.target.value)} className={inputCls}>
                          <option value="minimal" className="bg-[#0F0F0F]">Minimal</option>
                          <option value="premium" className="bg-[#0F0F0F]">Premium</option>
                          <option value="luxury"  className="bg-[#0F0F0F]">Luxury</option>
                        </select>
                      </div>
                    </div>

                    <button type="submit" disabled={creating}
                      className="flex items-center gap-2 px-6 py-3 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-60">
                      {creating ? <><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Creating…</> : <><Plus className="w-4 h-4" />Create Café & Owner Account</>}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cafés list */}
            <div className="space-y-3">
              {cafes?.map((cafe, i) => (
                <motion.div key={cafe.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <CafeRow cafe={cafe} allOrders={allOrders} />
                </motion.div>
              ))}
              {(!cafes || cafes.length === 0) && (
                <div className="bg-[#0F0F0F] border border-white/5 rounded-xl p-12 text-center">
                  <Building2 className="w-10 h-10 text-[#A3A3A3]/30 mx-auto mb-3" />
                  <p className="text-[#A3A3A3]">No cafés yet. Create your first one above.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* API KEYS TAB */}
        {activeTab === 'api' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl">
            <div className="mb-6">
              <h2 className="text-white font-bold text-lg mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>Global API Settings</h2>
              <p className="text-[#A3A3A3] text-sm">Keys are encrypted server-side. Never exposed in browser.</p>
            </div>
            <div className="bg-[#0F0F0F] border border-white/5 rounded-xl p-6">
              <AdminApiSettings />
            </div>
          </motion.div>
        )}

      </main>
    </div>
  );
};

export default AdminPanel;
