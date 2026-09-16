// Capacitor platform helpers — degrade to no-op on the web.
// Everything is wrapped in try/catch so a missing plugin never crashes the app.

let _isNative = null;
export function isNativeApp() {
  if (_isNative !== null) return _isNative;
  try {
    // Capacitor exposes window.Capacitor.isNativePlatform() inside WebView.
    _isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch { _isNative = false; }
  return _isNative;
}

/** Hide the native splash (safe no-op on the web). */
export async function hideNativeSplash() {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch { /* plugin absent — ignore */ }
}

/** Trigger a light haptic tap (safe no-op on the web). */
export async function hapticTap(style = "Light") {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle[style] || ImpactStyle.Light });
  } catch { /* ignore */ }
}

export async function hapticSelection() {
  if (!isNativeApp()) return;
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch { /* ignore */ }
}

export async function hapticSuccess() {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch { /* ignore */ }
}

// ---------------- Local notifications ----------------
// Fires a system tray notification when the app is backgrounded (or a browser
// notification on the web). Perfect for long render jobs so creators don't have
// to keep staring at a spinner. Safe no-op if permission is denied.

let _permCache = null;

/** Ask the OS / browser for notification permission (once, cached). */
export async function ensureNotifyPermission() {
  if (_permCache !== null) return _permCache;
  try {
    if (isNativeApp()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const { display } = await LocalNotifications.checkPermissions();
      if (display === "granted") { _permCache = true; return true; }
      const req = await LocalNotifications.requestPermissions();
      _permCache = req.display === "granted";
      return _permCache;
    }
    // Web fallback
    if (typeof Notification === "undefined") { _permCache = false; return false; }
    if (Notification.permission === "granted") { _permCache = true; return true; }
    if (Notification.permission === "denied")  { _permCache = false; return false; }
    const p = await Notification.requestPermission();
    _permCache = p === "granted";
    return _permCache;
  } catch { _permCache = false; return false; }
}

/**
 * Show a system notification.
 *  - Native (Capacitor): tray notification, taps deep-link into the app.
 *  - Web: browser Notification API. Skipped when the page is visible & focused
 *    (there's no point pinging someone who is already looking at the screen).
 */
export async function notify({ title, body, url, tag = "cinereel-render", silentIfVisible = true }) {
  const granted = await ensureNotifyPermission();
  if (!granted) return false;
  try {
    if (isNativeApp()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 2_000_000_000),
          title, body,
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#E2FF3D",
          extra: { url },
          schedule: { at: new Date(Date.now() + 100) },
        }],
      });
      return true;
    }
    if (silentIfVisible && typeof document !== "undefined"
        && document.visibilityState === "visible" && document.hasFocus()) {
      return false;
    }
    const n = new Notification(title, {
      body, tag, icon: "/logo192.png", badge: "/logo192.png",
      silent: false,
    });
    if (url) {
      n.onclick = () => { window.focus(); window.location.href = url; n.close(); };
    }
    return true;
  } catch { return false; }
}

/** Wire notification taps → deep-link into the correct project (Capacitor). */
export async function installNotificationTapListener(onOpen) {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (evt) => {
      const url = evt?.notification?.extra?.url;
      if (url && typeof onOpen === "function") onOpen(url);
    });
  } catch { /* ignore */ }
}
