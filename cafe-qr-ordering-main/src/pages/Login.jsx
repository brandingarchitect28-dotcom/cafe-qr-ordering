import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { userRole } = useAuth();

  React.useEffect(() => {
    if (userRole === 'admin') navigate('/admin');
    else if (userRole === 'cafe') navigate('/dashboard');
    else if (userRole === 'partner') navigate('/partner');
  }, [userRole, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('🔐 Attempting login for:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('✅ Firebase auth successful, UID:', user.uid);
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      console.log('📄 User document exists:', userDoc.exists());
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('👤 User data:', userData);
        console.log('🎭 User role:', userData.role);
        
        if (userData.role === 'admin') {
          console.log('➡️ Redirecting to /admin');
          navigate('/admin');
        } else if (userData.role === 'cafe') {
          console.log('➡️ Redirecting to /dashboard');
          navigate('/dashboard');
        } else if (userData.role === 'partner') {
          console.log('➡️ Redirecting to /partner');
          navigate('/partner');
        } else {
          console.error('❌ Unknown role:', userData.role);
          setError('Unknown user role: ' + userData.role);
        }
      } else {
        console.error('❌ User document not found for UID:', user.uid);
        setError('User profile not found. Please contact administrator.');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      console.error('❌ Error code:', err.code);
      
      // Provide user-friendly error messages
      let errorMessage = 'Failed to login';
      
      if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again. If using a VPN or ad-blocker, try disabling it temporarily.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password. Please check your credentials.';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1738489787992-963b6852a97f)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]"></div>
      
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-[#0F0F0F]/80 backdrop-blur-xl border border-white/10 rounded-sm p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-[#D4AF37] mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              BRANDING ARCHITECT
            </h1>
            <p className="text-[#A3A3A3] text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Lightweight Café Operating System
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-sm flex items-start gap-3">
              <AlertCircle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[#E5E5E5] text-sm font-medium mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Email Address
              </label>
              <input
                type="email"
                data-testid="login-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-[#E5E5E5] text-sm font-medium mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Password
              </label>
              <input
                type="password"
                data-testid="login-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/20 border border-white/10 text-white placeholder:text-neutral-600 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-sm h-12 px-4 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              data-testid="login-submit-btn"
              disabled={loading}
              className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-8 py-3 font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
