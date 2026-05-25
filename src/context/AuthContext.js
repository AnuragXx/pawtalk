import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { registerForPushNotifications } from '../services/notifications';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          const data = snap.data() || {};
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, ...data });
          // Only show onboarding if not yet onboarded
          setIsNewUser(!data.isOnboarded);
          // Register push token in background
          registerForPushNotifications(firebaseUser.uid).catch(() => {});
        } catch (_) {
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
          setIsNewUser(false);
        }
      } else {
        setUser(null);
        setIsNewUser(false);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const createUserDoc = async (uid, data) => {
    await setDoc(doc(db, 'users', uid), {
      ...data,
      isOnboarded: false,
      createdAt: serverTimestamp(),
    }, { merge: true });
  };

  const signUpWithEmail = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Create user doc with isOnboarded: false BEFORE onAuthStateChanged fires
      await createUserDoc(cred.user.uid, { email });
      // Manually set isNewUser so navigator shows Onboarding immediately
      setIsNewUser(true);
      return { success: true };
    } catch (e) {
      setError(e.message);
      return { success: false, message: friendlyError(e.code) };
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (e) {
      setError(e.message);
      return { success: false, message: friendlyError(e.code) };
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async (idToken) => {
    setIsLoading(true);
    setError(null);
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const cred = await signInWithCredential(auth, credential);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!snap.exists()) {
        await createUserDoc(cred.user.uid, {
          email: cred.user.email,
          displayName: cred.user.displayName,
          photoURL: cred.user.photoURL,
        });
        setIsNewUser(true);
      }
      return { success: true };
    } catch (e) {
      setError(e.message);
      return { success: false, message: friendlyError(e.code) };
    } finally {
      setIsLoading(false);
    }
  };
  const completeOnboarding = async () => {
    setIsNewUser(false);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { isOnboarded: true }, { merge: true });
      } catch (_) {}
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsNewUser(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isNewUser,
      error,
      setError,
      signUpWithEmail,
      signInWithEmail,
      signInWithGoogle,
      completeOnboarding,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
