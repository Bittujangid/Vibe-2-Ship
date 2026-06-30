import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if configuration is populated
const isValidConfig = firebaseConfig.apiKey && firebaseConfig.projectId;

let app;
let auth;
let db;
let googleProvider;
let isFirebaseConfigured = false;

if (isValidConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    isFirebaseConfigured = true;
    console.log("[Firebase] Successfully initialized with environment credentials.");
  } catch (error) {
    console.error("[Firebase] Error during initialization:", error);
  }
} else {
  console.warn(
    "[Firebase] Setup incomplete: Configuration variables missing. Falling back to local offline mock state."
  );
}

export { auth, db, googleProvider, isFirebaseConfigured };
