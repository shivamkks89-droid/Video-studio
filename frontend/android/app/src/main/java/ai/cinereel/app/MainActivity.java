package ai.cinereel.app;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup.MarginLayoutParams;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static boolean lightBars = false;

    /** Single source of truth for status/nav bar colour + icon contrast (follows app theme). */
    static void applyBars(android.app.Activity a, boolean light) {
        lightBars = light;
        android.view.Window w = a.getWindow();
        int bg = Color.parseColor(light ? "#FFFFFF" : "#0A0A0B");
        // Edge-to-edge: bars are transparent; the decor background shows behind them.
        w.getDecorView().setBackgroundColor(bg);
        // Paint the WebView parent too, so no white/splash background can ever show in a gap.
        if (a instanceof BridgeActivity && ((BridgeActivity) a).getBridge() != null) {
            View wv = ((BridgeActivity) a).getBridge().getWebView();
            wv.setBackgroundColor(bg);
            if (wv.getParent() instanceof View) ((View) wv.getParent()).setBackgroundColor(bg);
        }
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(light);
        c.setAppearanceLightNavigationBars(light);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyBars(this, lightBars);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyBars(this, lightBars);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareTargetPlugin.class);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        // Never show the native title bar ("CineReel" strip) — the web UI has its own header.
        if (getSupportActionBar() != null) getSupportActionBar().hide();
        setTitle("");
        handleShare(getIntent());
        int night = getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        applyBars(this, night != android.content.res.Configuration.UI_MODE_NIGHT_YES);

        // Edge-to-edge on every Android version: keep the WebView out of the system bars, cutout and keyboard.
        if (getBridge() != null) {
            View webView = getBridge().getWebView();
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
                Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                int bottom = Math.max(sys.bottom, ime.bottom);
                MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
                if (mlp.leftMargin != sys.left || mlp.topMargin != sys.top || mlp.rightMargin != sys.right || mlp.bottomMargin != bottom) {
                    mlp.setMargins(sys.left, sys.top, sys.right, bottom);
                    v.setLayoutParams(mlp);
                }
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(webView);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
    }

    // Copies an audio file shared via "Share -> CineReel" into cache and notifies the web layer.
    private void handleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null || type == null || !type.startsWith("audio/")) return;
        try {
            String name = "shared-audio";
            try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) name = c.getString(idx);
                }
            }
            File dir = new File(getCacheDir(), "shared");
            dir.mkdirs();
            File out = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (InputStream in = getContentResolver().openInputStream(uri);
                 FileOutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[8192];
                int n;
                while (in != null && (n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            ShareTargetPlugin p = (ShareTargetPlugin) getBridge().getPlugin("ShareTarget").getInstance();
            p.emitShared(out.getAbsolutePath(), name, type);
        } catch (Exception ignored) {
        }
    }
}
