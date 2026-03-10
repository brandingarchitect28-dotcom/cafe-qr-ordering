// Authentication Service
// Handles all authentication-related operations

import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Sign in with email and password
 */
export const signIn = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: getAuthErrorMessage(error.code) };
  }
};

/**
 * Sign out current user
 */
export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Create new user (admin only)
 */
export const createUser = async (email, password, userData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      email,
      ...userData,
      createdAt: new Date().toISOString()
    });
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: getAuthErrorMessage(error.code) };
  }
};

/**
 * Get user data from Firestore
 */
export const getUserData = async (uid) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return { data: userDoc.data(), error: null };
    }
    return { data: null, error: 'User not found' };
  } catch (error) {
    return { data: null, error: error.message };
  }
};

/**
 * Subscribe to auth state changes
 */
export const subscribeToAuthState = (callback) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Get user-friendly error messages
 */
const getAuthErrorMessage = (errorCode) => {
  const errorMessages = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'Email already in use.',
    'auth/weak-password': 'Password is too weak.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
  };
  return errorMessages[errorCode] || 'An error occurred. Please try again.';
};
