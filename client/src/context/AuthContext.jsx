import React, { createContext, useState, useEffect, useContext } from "react";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, googleProvider, isFirebaseConfigured, db } from "../utils/firebase";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
          });
        } else {
          setUser(null);
        }
        setLoading(false);
      });
      return unsubscribe;
    } else {
      setUser(null);
      setLoading(false);
    }
  }, []);

  // Sign in strictly using Firebase Google Auth
  const signInWithGoogle = async () => {
    setLoading(true);
    if (isFirebaseConfigured && auth && googleProvider) {
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const firebaseUser = result.user;
        
        const userData = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        };

        // Write user profile metadata to Firestore
        if (db) {
          try {
            const userDocRef = doc(db, "users", firebaseUser.uid);
            const userSnap = await getDoc(userDocRef);
            
            const profileData = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || "",
              email: firebaseUser.email || "",
              photoURL: firebaseUser.photoURL || "",
            };

            if (!userSnap.exists()) {
              profileData.createdAt = new Date().toISOString();
            }

            await setDoc(userDocRef, profileData, { merge: true });
            console.log("[Auth] Cached user profile in Firestore.");
          } catch (fsErr) {
            console.error("[Auth] Firestore write failed:", fsErr.message);
          }
        }

        setUser(userData);
      } catch (error) {
        console.error("Firebase Sign In Error:", error);
        throw error;
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
      throw new Error("Authentication Error: Firebase Client credentials are not configured in your environment files.");
    }
  };

  // Sign up using Email and Password
  const signUpWithEmail = async (email, password) => {
    setLoading(true);
    if (isFirebaseConfigured && auth) {
      try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = result.user;
        
        const userData = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || email.split("@")[0],
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || null,
        };

        // Write user profile metadata to Firestore
        if (db) {
          try {
            const userDocRef = doc(db, "users", firebaseUser.uid);
            const profileData = {
              uid: firebaseUser.uid,
              name: userData.displayName,
              email: firebaseUser.email || "",
              photoURL: "",
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, profileData, { merge: true });
            console.log("[Auth] Cached user profile in Firestore.");
          } catch (fsErr) {
            console.error("[Auth] Firestore write failed:", fsErr.message);
          }
        }

        setUser(userData);
      } catch (error) {
        console.error("Firebase Sign Up Error:", error);
        throw error;
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
      throw new Error("Authentication Error: Firebase Client credentials are not configured in your environment files.");
    }
  };

  // Sign in using Email and Password
  const signInWithEmail = async (email, password) => {
    setLoading(true);
    if (isFirebaseConfigured && auth) {
      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const firebaseUser = result.user;
        
        const userData = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || email.split("@")[0],
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || null,
        };

        setUser(userData);
      } catch (error) {
        console.error("Firebase Sign In Error:", error);
        throw error;
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
      throw new Error("Authentication Error: Firebase Client credentials are not configured in your environment files.");
    }
  };

  const logout = async () => {
    setLoading(true);
    if (isFirebaseConfigured && auth) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Firebase Sign Out Error:", error);
      }
    }
    setUser(null);
    setLoading(false);
  };

  const value = {
    user,
    loading,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    logout,
    isFirebaseConfigured
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
