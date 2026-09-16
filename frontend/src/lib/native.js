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
