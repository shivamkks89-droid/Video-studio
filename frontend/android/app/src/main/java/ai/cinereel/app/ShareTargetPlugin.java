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
    public void getPending(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }
}
