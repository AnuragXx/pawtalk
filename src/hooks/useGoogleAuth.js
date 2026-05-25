import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, GOOGLE_WEB_CLIENT_ID } from '../config/firebase';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = "443370739339-msfvs7v08arqvdfcf4ctbv3ccj7lrjb0.apps.googleusercontent.com";

export default function useGoogleAuth({ onSuccess, onError } = {}) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
    scopes: ['profile', 'email'],
    // Use token response type — avoids code_challenge_method issue
    responseType: 'token',
    usePKCE: false,
  });

  // Log the redirect URI so you can add it to Google Cloud Console
  if (request?.redirectUri) {
    console.log('=== GOOGLE REDIRECT URI ===');
    console.log(request.redirectUri);
    console.log('Add this to Google Cloud Console → Web Client → Authorized redirect URIs');
    console.log('===========================');
  }

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const accessToken = response.authentication?.accessToken;
      if (accessToken) {
        handleAccessToken(accessToken);
      } else {
        onError?.('No token received from Google.');
      }
    } else if (response.type === 'error') {
      onError?.('Google sign-in failed. Please try again.');
    }
  }, [response]);

  const handleAccessToken = async (accessToken) => {
    try {
      const credential = GoogleAuthProvider.credential(null, accessToken);
      const cred = await signInWithCredential(auth, credential);
      await ensureUserDoc(cred.user);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      onSuccess?.({ isNew: !snap.data()?.isOnboarded });
    } catch (e) {
      onError?.(e.message || 'Google sign-in failed.');
    }
  };

  const ensureUserDoc = async (firebaseUser) => {
    const ref = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || '',
        photoURL: firebaseUser.photoURL || '',
        isOnboarded: false,
        createdAt: serverTimestamp(),
      });
    }
  };

  return {
    promptAsync: () => promptAsync({ useProxy: true }),
    isReady: !!request,
  };
}
