import type { FirebaseApp } from 'firebase/app';
import { initializeApp } from 'firebase/app';
import type { Database } from 'firebase/database';
import { getDatabase } from 'firebase/database';
import type { Auth } from 'firebase/auth';
import { getAuth, signInAnonymously } from 'firebase/auth';

let app: FirebaseApp | null = null;
let db: Database | null = null;
let auth: Auth | null = null;

// These are the production Firebase project values for whist---elyakim.
// Firebase client config is intentionally public — security is enforced by
// Realtime Database rules (auth != null), not by keeping these hidden.
// Env vars (from .env) override these for local dev against a different project.
const PROD_CONFIG = {
  apiKey: 'AIzaSyAZybhheJVjAEdmVlOplXNhOYU0Hjrqxlc',
  authDomain: 'whist---elyakim.firebaseapp.com',
  databaseURL: 'https://whist---elyakim-default-rtdb.firebaseio.com',
  projectId: 'whist---elyakim',
  storageBucket: 'whist---elyakim.firebasestorage.app',
  messagingSenderId: '804651555177',
  appId: '1:804651555177:web:4bb8a0a4fc5057d16445f8',
} as const;

export function getFirebaseConfig() {
  return {
    apiKey:             import.meta.env.VITE_FIREBASE_API_KEY             ?? PROD_CONFIG.apiKey,
    authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         ?? PROD_CONFIG.authDomain,
    databaseURL:        import.meta.env.VITE_FIREBASE_DATABASE_URL        ?? PROD_CONFIG.databaseURL,
    projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID          ?? PROD_CONFIG.projectId,
    storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      ?? PROD_CONFIG.storageBucket,
    messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? PROD_CONFIG.messagingSenderId,
    appId:              import.meta.env.VITE_FIREBASE_APP_ID               ?? PROD_CONFIG.appId,
  };
}

export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return !!(config.apiKey && config.databaseURL && config.projectId);
}

export function initFirebase(): { app: FirebaseApp; db: Database; auth: Auth } {
  if (app && db && auth) return { app, db, auth };

  const config = getFirebaseConfig();
  if (!config.apiKey || !config.databaseURL) {
    throw new Error(
      'Firebase is not configured. Create a .env file with VITE_FIREBASE_* variables. See FIREBASE_SETUP.md for instructions.'
    );
  }

  app = initializeApp(config);
  db = getDatabase(app);
  auth = getAuth(app);

  return { app, db, auth };
}

export async function signInAnon(): Promise<string> {
  const { auth } = initFirebase();
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export function getDb(): Database {
  if (!db) throw new Error('Firebase not initialized');
  return db;
}

export function getUid(): string | null {
  if (!auth) return null;
  return auth.currentUser?.uid ?? null;
}
