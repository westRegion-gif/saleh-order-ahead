package ae.lmtd.pos;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.Html;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.telpo.tps550.api.printer.UsbThermalPrinter;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(246, 242, 234));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " LMTD-POS/0.1 Telpo-M1");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.addJavascriptInterface(new TelpoPrinterBridge(), "LMTDPrinter");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectNativeMarker();
            }
        });
        webView.loadUrl(BuildConfig.POS_URL);
    }

    private void injectNativeMarker() {
        String js = "window.__LMTD_NATIVE_POS__=true;" +
                "document.documentElement.dataset.lmtdNative='telpo';";
        webView.evaluateJavascript(js, null);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("LMTDPrinter");
            webView.destroy();
        }
        super.onDestroy();
    }

    public class TelpoPrinterBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public String deviceModel() {
            return Build.MANUFACTURER + " " + Build.MODEL;
        }

        @JavascriptInterface
        public String printHtml(String html) {
            String text;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                text = Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString();
            } else {
                //noinspection deprecation
                text = Html.fromHtml(html).toString();
            }
            return printText(text.replaceAll("\\n{3,}", "\\n\\n"));
        }

        @JavascriptInterface
        public String printText(String text) {
            UsbThermalPrinter printer = null;
            try {
                printer = new UsbThermalPrinter(MainActivity.this);
                printer.start(0);
                printer.reset();
                int status = printer.checkStatus();
                if (status != 0) {
                    return "ERROR:PRINTER_STATUS_" + status;
                }
                printer.setGray(5);
                printer.setLeftIndent(0);
                printer.setLineSpace(4);
                printer.setAlgin(UsbThermalPrinter.ALGIN_LEFT);
                printer.setTextSize(24);
                printer.addString(text == null ? "" : text);
                printer.printString();
                printer.walkPaper(5);
                return "OK";
            } catch (Throwable error) {
                String message = error.getMessage();
                return "ERROR:" + error.getClass().getSimpleName() + (message == null ? "" : ":" + message);
            } finally {
                if (printer != null) {
                    try { printer.stop(); } catch (Throwable ignored) { }
                }
            }
        }
    }
}
