import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
// UI: Mail + Lock icons added for input decoration; Eye/EyeOff already present
import { AlertCircle, Eye, EyeOff, Mail, Lock } from 'lucide-react';
// UI: motion imported for fade-in, hover, press micro-interactions (framer-motion already in project)
import { motion, AnimatePresence } from 'framer-motion';
import ForgotPassword from '../components/ForgotPassword';

// ─── UI-ONLY: CSS injected once for input glow + shimmer animation ────────────
// No JS logic — pure CSS. Scoped class names avoid collisions.
const PREMIUM_STYLES = `
  .ba-input {
    transition: border-color 220ms ease, box-shadow 220ms ease, transform 180ms ease;
  }
  .ba-input:focus {
    outline: none;
    border-color: #D4AF37;
    box-shadow: 0 0 0 1px #D4AF3755, 0 0 18px #D4AF3720;
    transform: scaleX(1.004);
  }
  .ba-input::placeholder {
    transition: opacity 180ms ease;
  }
  .ba-input:focus::placeholder {
    opacity: 0.35;
  }
  @keyframes ba-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  @keyframes ba-pulse-glow {
    0%, 100% { opacity: 0.55; transform: scale(1);    }
    50%       { opacity: 0.80; transform: scale(1.06); }
  }
  .ba-glow-orb {
    animation: ba-pulse-glow 4s ease-in-out infinite;
  }
`;

const Login = () => {
  // ── ALL STATE BELOW IS 100% ORIGINAL — NOTHING REMOVED OR CHANGED ───────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── ALL EFFECTS & HANDLERS BELOW ARE 100% ORIGINAL ──────────────────────────
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

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* UI: inject scoped CSS once — no JS, no runtime cost */}
      <style>{PREMIUM_STYLES}</style>

      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">

        {/* ── BACKGROUND: original image — opacity unchanged ────────────────── */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1738489787992-963b6852a97f)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />

        {/* UI: richer gradient overlay — top dark + bottom solid, same as before but deeper */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.82) 50%, #050505 100%)' }}
        />

        {/* UI: radial gold ambient glow behind the card — purely decorative */}
        <div
          className="absolute ba-glow-orb pointer-events-none"
          style={{
            width: 520, height: 520,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,175,55,0.09) 0%, transparent 70%)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            filter: 'blur(40px)',
          }}
        />
        {/* UI: secondary smaller warm glow — depth layer */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 260, height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)',
            top: '38%', left: '52%',
            transform: 'translate(-50%, -50%)',
            filter: 'blur(24px)',
          }}
        />

        {/* UI: card fade-in + slight rise on mount — lightweight spring animation */}
        <motion.div
          className="relative z-10 w-full max-w-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* UI: glassmorphism card — deeper blur, layered shadows, gold border glow */}
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(212,175,55,0.18), inset 0 1px 0 rgba(255,255,255,0.06)' }}
            transition={{ duration: 0.3 }}
            style={{
              background: 'rgba(10,10,10,0.82)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(212,175,55,0.14)',
              borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.50), 0 0 0 1px rgba(212,175,55,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
              padding: '44px 40px 40px',
            }}
          >
            {/* ── HEADER ──────────────────────────────────────────────────── */}
            <div className="text-center mb-10">
              {/* UI: gold dot accent above title */}
              <div className="flex items-center justify-center gap-1.5 mb-5">
                <div style={{ width: 28, height: 1, background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.5))' }} />
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#D4AF37', boxShadow: '0 0 8px #D4AF37' }} />
                <div style={{ width: 28, height: 1, background: 'linear-gradient(to left, transparent, rgba(212,175,55,0.5))' }} />
              </div>

              {/* UI: title — wider letter-spacing, gradient text shimmer */}
              <h1
                className="font-bold mb-2"
                style={{
                  fontFamily: 'Playfair Display, serif',
                  fontSize: '1.85rem',
                  letterSpacing: '0.08em',
                  background: 'linear-gradient(135deg, #D4AF37 0%, #F0D060 40%, #C8961E 70%, #D4AF37 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                BRANDING ARCHITECT
              </h1>

              {/* UI: divider line under title */}
              <div style={{ width: 48, height: 1, background: 'rgba(212,175,55,0.30)', margin: '10px auto 10px' }} />

              {/* UI: subtitle — softer weight, wider tracking */}
              <p
                className="text-sm"
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  color: '#6B6B6B',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontSize: '0.68rem',
                  fontWeight: 500,
                }}
              >
                Lightweight Café Operating System
              </p>
            </div>

            {/* ── ERROR BLOCK — logic unchanged, UI slightly polished ──────── */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-7 p-4 flex items-start gap-3"
                style={{
                  background: 'rgba(239,68,68,0.07)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderLeft: '3px solid rgba(239,68,68,0.60)',
                  borderRadius: 10,
                }}
              >
                <AlertCircle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm leading-snug">{error}</p>
              </motion.div>
            )}

            {/* ── FORM — onSubmit, all handlers, all inputs: 100% ORIGINAL ── */}
            <form onSubmit={handleLogin} className="space-y-5">

              {/* Email field */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ fontFamily: 'Manrope, sans-serif', color: '#C8C8C8', letterSpacing: '0.02em' }}
                >
                  Email Address
                </label>
                {/* UI: icon wrapper — icon is purely decorative, no effect on input */}
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ width: 15, height: 15, color: '#444' }}
                  />
                  <input
                    type="email"
                    data-testid="login-email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="ba-input w-full text-white placeholder:text-neutral-700"
                    placeholder="you@example.com"
                    required
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: 10,
                      height: 48,
                      paddingLeft: 40,
                      paddingRight: 16,
                      fontSize: '0.9rem',
                      fontFamily: 'Manrope, sans-serif',
                      color: '#fff',
                    }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    className="block text-sm font-medium"
                    style={{ fontFamily: 'Manrope, sans-serif', color: '#C8C8C8', letterSpacing: '0.02em' }}
                  >
                    Password
                  </label>
                  {/* Forgot password — handler unchanged */}
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs transition-colors"
                    style={{ color: '#D4AF37', fontFamily: 'Manrope, sans-serif', letterSpacing: '0.02em' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#F0D060'}
                    onMouseLeave={e => e.currentTarget.style.color = '#D4AF37'}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ width: 15, height: 15, color: '#444' }}
                  />
                  {/* Password input — type, data-testid, value, onChange, placeholder, required: ALL UNCHANGED */}
                  <input
                    type={showPassword ? 'text' : 'password'}
                    data-testid="login-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ba-input w-full text-white placeholder:text-neutral-700"
                    placeholder="••••••••"
                    required
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: 10,
                      height: 48,
                      paddingLeft: 40,
                      paddingRight: 44,
                      fontSize: '0.9rem',
                      fontFamily: 'Manrope, sans-serif',
                      color: '#fff',
                    }}
                  />
                  {/* Show/hide toggle — type="button", tabIndex=-1: unchanged */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                    style={{ color: '#444' }}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                    onMouseLeave={e => e.currentTarget.style.color = '#444'}
                  >
                    {showPassword
                      ? <EyeOff style={{ width: 15, height: 15 }} />
                      : <Eye    style={{ width: 15, height: 15 }} />
                    }
                  </button>
                </div>
              </div>

              {/* ── SUBMIT BUTTON — type, data-testid, disabled, onClick: ALL UNCHANGED ── */}
              <div className="pt-2">
                <motion.button
                  type="submit"
                  data-testid="login-submit-btn"
                  disabled={loading}
                  whileHover={!loading ? { y: -2, boxShadow: '0 8px 32px rgba(212,175,55,0.38), 0 2px 8px rgba(0,0,0,0.4)' } : {}}
                  whileTap={!loading ? { scale: 0.985, y: 0 } : {}}
                  transition={{ duration: 0.18 }}
                  className="w-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    fontFamily: 'Manrope, sans-serif',
                    letterSpacing: '0.06em',
                    fontSize: '0.85rem',
                    background: loading
                      ? 'rgba(212,175,55,0.5)'
                      : 'linear-gradient(135deg, #D4AF37 0%, #F0D060 50%, #C8961E 100%)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 10,
                    height: 50,
                    boxShadow: '0 4px 20px rgba(212,175,55,0.22), 0 1px 3px rgba(0,0,0,0.3)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      {/* UI: loading spinner — purely visual, no logic */}
                      <svg className="animate-spin" style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Signing in…
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </motion.button>
              </div>

            </form>

            {/* UI: footer caption */}
            <p className="text-center mt-8" style={{ color: '#333', fontSize: '0.68rem', letterSpacing: '0.08em', fontFamily: 'Manrope, sans-serif' }}>
              SECURED · ENCRYPTED · PRIVATE
            </p>

          </motion.div>
        </motion.div>

        {/* Forgot Password Modal — handler and component unchanged */}
        <AnimatePresence>
          {showForgot && <ForgotPassword onClose={() => setShowForgot(false)} />}
        </AnimatePresence>
      </div>
    </>
  );
};

export default Login;
