import type { FirebaseApp } from 'firebase/app';
import { initializeApp } from 'firebase/app';
import type { Database } from 'firebase/database';
import { getDatabase } from 'firebase/database';
import type { Auth } from 'firebase/auth';
import { getAuth, signInAnonymously } from 'firebase/auth';

let app: FirebaseApp | null = null;
let db: Database | null = null;
let auth: Auth | null = null;

export function getFirebaseConfig() {
  // Read config from environment variables (set in .env)
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
