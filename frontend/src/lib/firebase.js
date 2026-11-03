import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const env = process.env;
export const firebaseConfig = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY,
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.REACT_APP_FIREBASE_APP_ID,
  measurementId: env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

export const firebaseApp = firebaseConfig.apiKey ? (getApps()[0] || initializeApp(firebaseConfig)) : null;

export const initFirebase = async () => {
  if (!firebaseApp || window.Capacitor?.isNativePlatform?.()) return firebaseApp;
  if (firebaseConfig.measurementId && (await isSupported())) getAnalytics(firebaseApp);
  return firebaseApp;
};

export const trackEvent = async (name, params = {}) => {
  if (!firebaseApp || window.Capacitor?.isNativePlatform?.() || !(await isSupported())) return;
  const { logEvent } = await import("firebase/analytics");
  logEvent(getAnalytics(firebaseApp), name, params);
};

export const fbAuth = async () => {
  const m = await import("firebase/auth");
  const auth = m.getAuth(firebaseApp);
  await m.setPersistence(auth, m.browserLocalPersistence);
  return { auth, ...m };
};
