import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const env = process.env;
const envConfig = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY,
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.REACT_APP_FIREBASE_APP_ID,
  measurementId: env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Builds without .env (e.g. local Android build) load the public web config from the backend.
let appP = null;
export const getFirebaseApp = () => {
  appP = appP || (async () => {
    const cfg = envConfig.apiKey ? envConfig
      : await fetch(`${env.REACT_APP_BACKEND_URL}/api/firebase/config`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Firebase config load nahi hua"))));
    return getApps()[0] || initializeApp(cfg);
  })().catch((e) => { appP = null; throw e; });
  return appP;
};

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

export const initFirebase = async () => {
  const app = await getFirebaseApp();
  if (!isNative() && app.options.measurementId && (await isSupported())) getAnalytics(app);
  return app;
};

export const trackEvent = async (name, params = {}) => {
  if (isNative() || !(await isSupported())) return;
  const { logEvent } = await import("firebase/analytics");
  logEvent(getAnalytics(await getFirebaseApp()), name, params);
};

export const fbAuth = async () => {
  const m = await import("firebase/auth");
  const auth = m.getAuth(await getFirebaseApp());
  await m.setPersistence(auth, m.browserLocalPersistence);
  return { auth, ...m };
};
