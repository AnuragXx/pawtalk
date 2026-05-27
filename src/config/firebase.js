import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDy0EDAYMX1TPp8O8yT04UJTH7wfC6zS8k",
  authDomain: "pawtalk-5bb6f.firebaseapp.com",
  projectId: "pawtalk-5bb6f",
  storageBucket: "pawtalk-5bb6f.firebasestorage.app",
  messagingSenderId: "197534087158",
  appId: "1:197534087158:android:0b07e14113ebcf39ecf9d7",
};

export const GOOGLE_WEB_CLIENT_ID = "197534087158-o29590e8lqpliv94upik9mussa3urh8f.apps.googleusercontent.com";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
