const admin = require("firebase-admin");

let dbAdmin = null;
let isFirebaseAdminConfigured = false;

try {
  // 1. Initializing using stringified JSON service account in environmental variables
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    dbAdmin = admin.firestore();
    isFirebaseAdminConfigured = true;
    console.log("[Firebase Admin] Successfully initialized Firestore using Service Account Key.");
  } 
  // 2. Initializing using GOOGLE_APPLICATION_CREDENTIALS or Google Cloud environment (where ADC is default)
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    dbAdmin = admin.firestore();
    isFirebaseAdminConfigured = true;
    console.log("[Firebase Admin] Successfully initialized Firestore using Application Default Credentials.");
  } 
  // 3. Disabled fallback
  else {
    console.warn(
      "[Firestore Admin] Disabled - running without server-side caching."
    );
  }
} catch (error) {
  console.error("[Firebase Admin] SDK failed to initialize:", error.message);
  dbAdmin = null;
  isFirebaseAdminConfigured = false;
}

module.exports = { dbAdmin, isFirebaseAdminConfigured };