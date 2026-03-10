import React, { useState } from 'react';
import { useCollection } from '../hooks/useFirestore';
import { signOut, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Building2, DollarSign, Users, Plus, LogOut, X } from 'lucide-react';
import { toast } from 'sonner';

// Secondary Firebase app used ONLY for creating new Auth users.
// Calling createUserWithEmailAndPassword() on the PRIMARY auth instance
// auto-signs-in the newly created user, which logs out the admin.
// Using a separate named app instance prevents that side-effect.
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

const AdminPanel = () => {
  const navigate = useNavigate();
  const [showCafeForm, setShowCafeForm] = useState(false);
  const [cafeFormData, setCafeFormData] = useState({
    name: '',
    logo: '',
    email: '',
    password: '',
    primaryColor: '#D4AF37',
    secondaryColor: '#E5E5E5',
    layoutStyle: 'minimal'
  });

  const { data: cafes } = useCollection('cafes');
  const { data: allOrders } = useCollection('orders');
  const { data: users } = useCollection('users');

  const totalRevenue = allOrders?.reduce((sum, order) => 
    order.paymentStatus === 'paid' ? sum + (order.total || 0) : sum, 0
  ) || 0;

  const activeCafes = cafes?.filter(c => c.subscriptionStatus === 'active').length || 0;

  const handleCreateCafe = async (e) => {
    e.preventDefault();

    try {
      // Step 1: Create the cafe document first
      const cafeRef = await addDoc(collection(db, 'cafes'), {
        name: cafeFormData.name,
        logo: cafeFormData.logo,
        theme: {
          primaryColor: cafeFormData.primaryColor,
          secondaryColor: cafeFormData.secondaryColor,
          layoutStyle: cafeFormData.layoutStyle,
        },
        subscriptionStatus: 'active',
        createdAt: new Date(),
      });
      const cafeId = cafeRef.id;

      // Step 2: Create the Firebase Auth user using a SECONDARY app instance.
      // Using the primary `auth` would auto-sign-in the new user and log out
      // the currently logged-in admin. The secondary instance avoids that.
      const secondaryAuth = getSecondaryAuth();
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        cafeFormData.email,
        cafeFormData.password
      );
      // Immediately sign out from the secondary app — we only needed the UID
      await secondaryAuth.signOut();

      // Step 3: Write the user profile to Firestore.
      // IMPORTANT: never store the plaintext password in Firestore.
      // Firebase Authentication already stores credentials securely.
      const userUid = userCredential.user.uid;
      await setDoc(doc(db, 'users', userUid), {
        name: cafeFormData.name,
        email: cafeFormData.email,
        role: 'cafe',
        cafeId: cafeId,
        createdAt: new Date(),
        // password is intentionally NOT stored here
      });

      toast.success(`Cafe "${cafeFormData.name}" created! Login: ${cafeFormData.email}`);
      setCafeFormData({
        name: '',
        logo: '',
        email: '',
        password: '',
        primaryColor: '#D4AF37',
        secondaryColor: '#E5E5E5',
        layoutStyle: 'minimal',
      });
      setShowCafeForm(false);
    } catch (error) {
      console.error('Error creating cafe:', error);
      // Friendly messages for common errors
      if (error.code === 'auth/email-already-in-use') {
        toast.error('This email is already registered. Use a different email.');
      } else if (error.code === 'auth/weak-password') {
        toast.error('Password must be at least 6 characters.');
      } else if (error.code === 'auth/invalid-email') {
        toast.error('Please enter a valid email address.');
      } else {
        toast.error(error.message || 'Failed to create cafe. Try again.');
      }
    }
  };

  const toggleCafeStatus = async (cafeId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await updateDoc(doc(db, 'cafes', cafeId), { subscriptionStatus: newStatus });
      toast.success('Cafe status updated');
    } catch (error) {
      console.error('Error updating cafe:', error);
      toast.error('Failed to update cafe status');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505]" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <header className="border-b border-white/5 bg-[#050505] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-3xl font-bold text-[#D4AF37]" style={{ fontFamily: 'Playfair Display, serif' }}>
            Admin Panel
          </h1>
          <button
            data-testid="admin-logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Total Cafes</p>
              <Building2 className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <p className="text-3xl font-bold text-white">{cafes?.length || 0}</p>
            <p className="text-sm text-[#10B981] mt-1">{activeCafes} active</p>
          </div>

          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Total Revenue</p>
              <DollarSign className="w-5 h-5 text-[#10B981]" />
            </div>
            <p className="text-3xl font-bold text-white">₹{totalRevenue.toFixed(2)}</p>
          </div>

          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#A3A3A3] text-sm uppercase tracking-wide">Total Orders</p>
              <Users className="w-5 h-5 text-[#3B82F6]" />
            </div>
            <p className="text-3xl font-bold text-white">{allOrders?.length || 0}</p>
          </div>
        </div>

        {/* Create Cafe Button */}
        <button
          data-testid="create-cafe-btn"
          onClick={() => setShowCafeForm(true)}
          className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create New Cafe
        </button>

        {/* Create Cafe Form */}
        {showCafeForm && (
          <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                Create New Cafe
              </h3>
              <button onClick={() => setShowCafeForm(false)} className="text-[#A3A3A3] hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateCafe} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Cafe Name</label>
                  <input
                    type="text"
                    data-testid="admin-cafe-name"
                    value={cafeFormData.name}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                    placeholder="e.g., Downtown Coffee"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white text-sm font-medium mb-2">Logo URL</label>
                  <input
                    type="url"
                    data-testid="admin-cafe-logo"
                    value={cafeFormData.logo}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, logo: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Owner Email</label>
                  <input
                    type="email"
                    data-testid="admin-cafe-email"
                    value={cafeFormData.email}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                    placeholder="owner@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    data-testid="admin-cafe-password"
                    value={cafeFormData.password}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                    placeholder="Minimum 6 characters"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Primary Color</label>
                  <input
                    type="color"
                    data-testid="admin-cafe-primary-color"
                    value={cafeFormData.primaryColor}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 rounded-sm h-12 px-2 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-white text-sm font-medium mb-2">Secondary Color</label>
                  <input
                    type="color"
                    data-testid="admin-cafe-secondary-color"
                    value={cafeFormData.secondaryColor}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, secondaryColor: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 rounded-sm h-12 px-2 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-white text-sm font-medium mb-2">Layout Style</label>
                  <select
                    data-testid="admin-cafe-layout"
                    value={cafeFormData.layoutStyle}
                    onChange={(e) => setCafeFormData(prev => ({ ...prev, layoutStyle: e.target.value }))}
                    className="w-full bg-black/20 border border-white/10 text-white rounded-sm h-12 px-4 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
                  >
                    <option value="minimal">Minimal</option>
                    <option value="premium">Premium</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                data-testid="submit-cafe-btn"
                className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300"
              >
                Create Cafe & Owner Account
              </button>
            </form>
          </div>
        )}

        {/* Cafes List */}
        <div className="bg-[#0F0F0F] border border-white/5 rounded-sm p-6">
          <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            All Cafes
          </h3>
          <div className="space-y-4">
            {cafes?.map((cafe) => (
              <div
                key={cafe.id}
                data-testid={`cafe-${cafe.id}`}
                className="bg-black/20 p-4 rounded-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  {cafe.logo && <img src={cafe.logo} alt={cafe.name} className="w-12 h-12 rounded-sm object-cover" />}
                  <div>
                    <h4 className="text-white font-semibold text-lg">{cafe.name}</h4>
                    <p className="text-[#A3A3A3] text-sm">ID: {cafe.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-sm text-sm font-medium ${
                    cafe.subscriptionStatus === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {cafe.subscriptionStatus}
                  </span>
                  <button
                    data-testid={`toggle-cafe-${cafe.id}`}
                    onClick={() => toggleCafeStatus(cafe.id, cafe.subscriptionStatus)}
                    className="bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] rounded-sm px-4 py-2 text-sm transition-all"
                  >
                    {cafe.subscriptionStatus === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
            {(!cafes || cafes.length === 0) && (
              <p className="text-center text-[#A3A3A3] py-8">No cafes yet</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
