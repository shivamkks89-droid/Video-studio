package ai.cinereel.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives audio shared from other apps (e.g. AI Awaaz downloads) and hands it to the web layer. */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {
    private static JSObject pending;

    void emitShared(String path, String name, String mime) {
        JSObject r = new JSObject();
        r.put("path", path);
        r.put("name", name);
        r.put("mime", mime);
        pending = r;
        notifyListeners("audioShared", r, true);
    }

    @PluginMethod
    public void setSystemBars(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            android.view.Window w = getActivity().getWindow();
            int bg = android.graphics.Color.parseColor(light ? "#E4E4DF" : "#000000");
            w.getDecorView().setBackgroundColor(bg);
            w.setStatusBarColor(bg);
            w.setNavigationBarColor(bg);
            androidx.core.view.WindowInsetsControllerCompat c =
                androidx.core.view.WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(light);
            c.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }
}
