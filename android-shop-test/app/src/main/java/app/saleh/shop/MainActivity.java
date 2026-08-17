package app.saleh.shop;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String SHOP_URL = "https://saleh-order-ahead-production.up.railway.app/shop";
    private static final String APP_HOST = "saleh-order-ahead-production.up.railway.app";

    private WebView webView;

    private static final String DISABLE_PRINTING_JS =
            "(function(){try{" +
            "localStorage.setItem('saleh_auto_print','0');" +
            "try{autoPrint=false;}catch(e){}" +
            "window.print=function(){return false;};" +
            "window.open=function(){return null;};" +
            "try{printOrder=function(){return false;};}catch(e){}" +
            "try{testPrint=function(){return false;};}catch(e){}" +
            "try{toggleAutoPrint=function(){autoPrint=false;localStorage.setItem('saleh_auto_print','0');try{updatePrintLabels();}catch(e){}};}catch(e){}" +
            "var a=document.getElementById('autoPrintBtn');if(a){a.textContent='Printing Disabled';a.disabled=true;}" +
            "var b=document.getElementById('settingsPrint');if(b){b.textContent='Printing Disabled (Test APK)';b.disabled=true;}" +
            "var s=document.getElementById('autoPrintState');if(s){s.textContent='PRINTING DISABLED';}" +
            "var p=document.getElementById('printerModePill');if(p){p.textContent='Printer: Disabled';}" +
            "}catch(e){}})();";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SalehShopAPK/1.0-test");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(DISABLE_PRINTING_JS, null);
                CookieManager.getInstance().flush();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(SHOP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                && APP_HOST.equalsIgnoreCase(host)) {
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
