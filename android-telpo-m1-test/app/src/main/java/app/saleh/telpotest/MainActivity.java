package app.saleh.telpotest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String SHOP_URL = "https://saleh-order-ahead-production.up.railway.app/shop";
    private static final String APP_HOST = "saleh-order-ahead-production.up.railway.app";
    private WebView webView;

    private static final String TELPO_PROBE_JS =
        "(function(){try{" +
        "window.SalehTelpo=window.SalehTelpo||{};" +
        "window.SalehTelpo.systemPrintTest=function(){if(window.AndroidTelpo){AndroidTelpo.printTestTicket();}};" +
        "var oldTest=window.testPrint;" +
        "window.testPrint=function(){if(window.AndroidTelpo){AndroidTelpo.printTestTicket();}else if(oldTest){oldTest();}};" +
        "var mode=document.getElementById('printerModePill');if(mode){mode.textContent='Printer: Telpo Probe';}" +
        "var sm=document.getElementById('settingsPrinterMode');if(sm){sm.textContent='Android Print Probe';}" +
        "var hint=document.querySelector('.machine-hint');if(hint){hint.textContent='TELPO M1 TEST: order flow + sound + Android system printer probe. Native Telpo SDK bridge will be added after device SDK access is confirmed.';}" +
        "}catch(e){}})();";

    @SuppressLint({"SetJavaScriptEnabled","JavascriptInterface"})
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView=new WebView(this);
        setContentView(webView);
        WebSettings s=webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); s.setSupportZoom(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString()+" SalehTelpoM1Test/1.0");
        CookieManager cm=CookieManager.getInstance(); cm.setAcceptCookie(true); cm.setAcceptThirdPartyCookies(webView,true);
        webView.addJavascriptInterface(new AndroidTelpoBridge(),"AndroidTelpo");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView v,String url){ super.onPageFinished(v,url); v.evaluateJavascript(TELPO_PROBE_JS,null); CookieManager.getInstance().flush(); }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){ return handle(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v,String url){ return handle(Uri.parse(url)); }
        });
        if(b==null) webView.loadUrl(SHOP_URL); else webView.restoreState(b);
    }

    public class AndroidTelpoBridge {
        @JavascriptInterface public void printTestTicket(){ runOnUiThread(() -> systemPrintTest()); }
        @JavascriptInterface public String deviceProbe(){ return android.os.Build.MANUFACTURER+" | "+android.os.Build.MODEL+" | Android "+android.os.Build.VERSION.RELEASE; }
    }

    private void systemPrintTest(){
        final WebView ticket=new WebView(this);
        String html="<html><body style='font-family:monospace;color:#000;background:#fff;padding:18px;text-align:center'>"+
                "<h2>SALEH SHOP</h2><b>TELPO M1 PRINT PROBE</b><hr>"+
                "<p>Android: "+android.os.Build.VERSION.RELEASE+"</p>"+
                "<p>Device: "+android.os.Build.MANUFACTURER+" "+android.os.Build.MODEL+"</p>"+
                "<p>If the internal 58mm printer appears in the next screen, select it.</p><hr><b>TEST OK</b></body></html>";
        ticket.loadDataWithBaseURL(null,html,"text/html","UTF-8",null);
        ticket.setWebViewClient(new WebViewClient(){ @Override public void onPageFinished(WebView v,String url){
            try{
                PrintManager pm=(PrintManager)getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter=v.createPrintDocumentAdapter("Saleh Telpo M1 Test");
                pm.print("Saleh Telpo M1 Test",adapter,new PrintAttributes.Builder().build());
            }catch(Exception e){ Toast.makeText(MainActivity.this,"Android print service unavailable: "+e.getMessage(),Toast.LENGTH_LONG).show(); }
        }});
    }

    private boolean handle(Uri u){
        String scheme=u.getScheme(),host=u.getHost();
        if(("https".equalsIgnoreCase(scheme)||"http".equalsIgnoreCase(scheme))&&APP_HOST.equalsIgnoreCase(host)) return false;
        try{ startActivity(new Intent(Intent.ACTION_VIEW,u)); }catch(Exception ignored){}
        return true;
    }
    @Override protected void onSaveInstanceState(Bundle out){ webView.saveState(out); super.onSaveInstanceState(out); }
    @Override public void onBackPressed(){ if(webView!=null&&webView.canGoBack())webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy(){ if(webView!=null){webView.stopLoading();webView.destroy();} super.onDestroy(); }
}
