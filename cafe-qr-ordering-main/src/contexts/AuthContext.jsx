import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  // Track Firebase init errors so we can surface them instead of black screen
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let unsubscribe;

    try {
      unsubscribe = onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          if (firebaseUser) {
            try {
              const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                setUser({ ...firebaseUser, ...userData });
                setUserRole(userData.role);
              } else {
                setUser(firebaseUser);
                setUserRole(null);
              }
            } catch (error) {
              console.error('Error fetching user data:', error);
              setUser(firebaseUser);
              setUserRole(null);
            }
          } else {
            setUser(null);
            setUserRole(null);
          }
          setLoading(false);
        },
        (error) => {
          // Auth observer error (e.g. bad API key)
          console.error('Auth state error:', error);
          setAuthError(error.message);
          setLoading(false);
        }
      );
    } catch (err) {
      console.error('Failed to initialise auth listener:', err);
      setAuthError(err.message);
      setLoading(false);
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Surface auth errors visibly instead of black screen
  if (authError) {
    return (
      <div style={{
        fontFamily: 'monospace',
        padding: '2rem',
        background: '#050505',
        color: '#E5E5E5',
        minHeight: '100vh',
      }}>
        <h2 style={{ color: '#D4AF37', marginBottom: '1rem' }}>⚠️ Firebase Auth Error</h2>
        <p style={{ color: '#ff6b6b', marginBottom: '1rem' }}>{authError}</p>
        <p style={{ color: '#A3A3A3', fontSize: '0.85rem' }}>
          Check that all <code>VITE_FIREBASE_*</code> environment variables are set
          in <strong>Netlify → Site Settings → Environment Variables</strong>, then
          trigger a new deploy.
        </p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, userRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
