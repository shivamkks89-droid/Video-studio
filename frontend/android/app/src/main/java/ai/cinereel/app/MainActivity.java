package ai.cinereel.app;

import android.graphics.Color;
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
        super.onCreate(savedInstanceState);
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
}
