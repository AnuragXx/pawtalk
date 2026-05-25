import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBoOjz6kDDrsT_0t9UkeDkPY8KkeZy84z4",
  authDomain: "pawtalk-8b4af.firebaseapp.com",
  projectId: "pawtalk-8b4af",
  storageBucket: "pawtalk-8b4af.firebasestorage.app",
  messagingSenderId: "443370739339",
  appId: "1:443370739339:android:ade3bb16a58c06eb17e68e",
};

export const GOOGLE_WEB_CLIENT_ID = "443370739339-qpecmi16f24tepms269estbgs0ntubs0.apps.googleusercontent.com";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
