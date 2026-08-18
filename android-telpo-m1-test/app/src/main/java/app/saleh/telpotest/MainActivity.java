package app.saleh.telpotest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

public class MainActivity extends Activity {
    private static final String SHOP_URL = "https://saleh-order-ahead-production.up.railway.app/shop";
    private static final String APP_HOST = "saleh-order-ahead-production.up.railway.app";
    private static final String TELPO_PRINTER_CLASS = "com.common.apiutil.printer.UsbThermalPrinter";
    private WebView webView;

    private static final String TELPO_NATIVE_JS =
        "(function(){try{" +
        "localStorage.setItem('saleh_auto_print','1');try{autoPrint=true;}catch(e){}" +
        "var originalBeep=window.beep;" +
        "if(originalBeep&&!window.__salehTripleBeep){window.__salehTripleBeep=true;window.beep=function(){[0,650,1300].forEach(function(d){setTimeout(function(){try{originalBeep();}catch(e){}},d);});};}" +
        "var browserPrint=window.printOrder;" +
        "window.printOrder=function(id){" +
        " if(window.AndroidTelpo){" +
        "  fetch('/api/orders?branch_id='+BID+'&limit=300').then(function(r){return r.json();}).then(function(list){" +
        "   var o=list.find(function(x){return Number(x.id)===Number(id);});" +
        "   if(o){AndroidTelpo.printOrder(JSON.stringify(o));}else if(browserPrint){browserPrint(id);}" +
        "  }).catch(function(){if(browserPrint){browserPrint(id);}});" +
        " }else if(browserPrint){browserPrint(id);}" +
        "};" +
        "window.testPrint=function(){if(window.AndroidTelpo){AndroidTelpo.printTestTicket();}};" +
        "var mode=document.getElementById('printerModePill');if(mode){mode.textContent='Printer: Telpo Native';}" +
        "var sm=document.getElementById('settingsPrinterMode');if(sm){sm.textContent='Telpo M1 58mm Native';}" +
        "var bridge=document.getElementById('nativeBridgeLabel');if(bridge){bridge.textContent='Native Telpo bridge';}" +
        "var ap=document.getElementById('autoPrintBtn');if(ap){ap.textContent='Auto Print: On';}" +
        "var aps=document.getElementById('autoPrintState');if(aps){aps.textContent='AUTO PRINT ON';}" +
        "var sp=document.getElementById('settingsPrint');if(sp){sp.textContent='Auto Print ON';}" +
        "}catch(e){}})();";

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " SalehTelpoM1/1.4");
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new AndroidTelpoBridge(), "AndroidTelpo");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                v.evaluateJavascript(TELPO_NATIVE_JS, null);
                CookieManager.getInstance().flush();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return handle(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) { return handle(Uri.parse(url)); }
        });
        if (b == null) webView.loadUrl(SHOP_URL); else webView.restoreState(b);
    }

    public class AndroidTelpoBridge {
        @JavascriptInterface public void printTestTicket() {
            printAsync("          SALEH SHOP\n================================\nTELPO M1 PRINTER TEST\nOfficial Telpo SDK v2.28\nAuto Print: ON\nOrder alert: 3 times\n================================\nTEST OK\n\n\n");
        }
        @JavascriptInterface public void printOrder(String json) {
            try { printAsync(buildReceipt(new JSONObject(json))); }
            catch (Exception e) { showToast("Receipt error: " + e.getMessage()); }
        }
    }

    private String buildReceipt(JSONObject o) {
        StringBuilder r = new StringBuilder();
        String orderNo = o.optString("order_no", String.valueOf(o.optInt("id")));
        r.append("          SALEH SHOP\n");
        r.append("================================\n");
        r.append("ORDER #").append(orderNo).append("\n");
        r.append("Customer: ").append(o.optString("customer_name", "-")).append("\n");
        if (!o.optString("mobile", "").isEmpty()) r.append("Mobile: ").append(o.optString("mobile")).append("\n");
        r.append("Pickup: ").append(o.optString("pickup_type", "Pickup")).append("\n");
        if (!o.optString("scheduled_for", "").isEmpty()) r.append("Time: ").append(o.optString("scheduled_for")).append("\n");
        r.append("--------------------------------\n");
        JSONArray items = o.optJSONArray("items");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                r.append(item.optInt("qty", 1)).append(" x ").append(item.optString("product_name", "Item")).append("\n");
                String size = item.optString("size", "");
                String milk = item.optString("milk", "");
                if (!size.isEmpty() || (!milk.isEmpty() && !"N/A".equalsIgnoreCase(milk))) {
                    r.append("   ");
                    if (!size.isEmpty()) r.append(size);
                    if (!milk.isEmpty() && !"N/A".equalsIgnoreCase(milk)) r.append(size.isEmpty() ? "" : " / ").append(milk);
                    r.append("\n");
                }
            }
        }
        String note = o.optString("note", "");
        if (!note.isEmpty()) { r.append("--------------------------------\nNOTE: ").append(note).append("\n"); }
        r.append("================================\n");
        r.append("TOTAL: ").append(String.format(java.util.Locale.US, "%.2f", o.optDouble("total", 0))).append(" AED\n");
        r.append("================================\n        PREPARE ORDER\n\n\n");
        return r.toString();
    }

    private void printAsync(final String text) {
        new Thread(() -> {
            Object printer = null;
            try {
                Class<?> printerClass = Class.forName(TELPO_PRINTER_CLASS);
                Constructor<?> ctor = printerClass.getConstructor(android.content.Context.class);
                printer = ctor.newInstance(MainActivity.this);
                invoke(printerClass, printer, "start", new Class[]{int.class}, new Object[]{0});
                tryInvoke(printerClass, printer, "checkStatus", new Class[]{}, new Object[]{});
                invoke(printerClass, printer, "reset", new Class[]{}, new Object[]{});
                tryInvoke(printerClass, printer, "setGray", new Class[]{int.class}, new Object[]{5});
                tryInvoke(printerClass, printer, "setAlgin", new Class[]{int.class}, new Object[]{0});
                tryInvoke(printerClass, printer, "setLeftIndent", new Class[]{int.class}, new Object[]{0});
                tryInvoke(printerClass, printer, "setLineSpace", new Class[]{int.class}, new Object[]{0});
                invoke(printerClass, printer, "addString", new Class[]{String.class}, new Object[]{text});
                invoke(printerClass, printer, "printString", new Class[]{}, new Object[]{});
                tryInvoke(printerClass, printer, "walkPaper", new Class[]{int.class}, new Object[]{3});
                showToast("Printed");
            } catch (Throwable e) {
                Throwable cause = e.getCause() != null ? e.getCause() : e;
                showToast("Telpo print error: " + cause.getClass().getSimpleName() + " - " + String.valueOf(cause.getMessage()));
            } finally {
                if (printer != null) try { tryInvoke(printer.getClass(), printer, "stop", new Class[]{}, new Object[]{}); } catch (Throwable ignored) {}
            }
        }).start();
    }

    private Object invoke(Class<?> c, Object target, String name, Class<?>[] types, Object[] args) throws Exception { return c.getMethod(name, types).invoke(target, args); }
    private void tryInvoke(Class<?> c, Object target, String name, Class<?>[] types, Object[] args) { try { c.getMethod(name, types).invoke(target, args); } catch (Throwable ignored) {} }
    private void showToast(final String text) { runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show()); }
    private boolean handle(Uri u) {
        String scheme = u.getScheme(), host = u.getHost();
        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && APP_HOST.equalsIgnoreCase(host)) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
        return true;
    }
    @Override protected void onSaveInstanceState(Bundle out) { webView.saveState(out); super.onSaveInstanceState(out); }
    @Override public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (webView != null) { webView.stopLoading(); webView.destroy(); } super.onDestroy(); }
}
