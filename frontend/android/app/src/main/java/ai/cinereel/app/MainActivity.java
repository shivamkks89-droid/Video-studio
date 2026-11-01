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
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int APP_BG = Color.parseColor("#0A0A0B");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);
        handleShare(getIntent());
        // Area behind the system bars = app dark colour; bar icons stay light (gesture pill + 3-button).
        getWindow().getDecorView().setBackgroundColor(APP_BG);
        getWindow().setNavigationBarColor(APP_BG);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightNavigationBars(false);
        bars.setAppearanceLightStatusBars(false);

        // Android 15+ forces edge-to-edge: keep the WebView out of the system bars and above the keyboard.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM && getBridge() != null) {
            View webView = getBridge().getWebView();
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
                Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
                mlp.leftMargin = sys.left;
                mlp.topMargin = sys.top;
                mlp.rightMargin = sys.right;
                mlp.bottomMargin = Math.max(sys.bottom, ime.bottom);
                v.setLayoutParams(mlp);
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
