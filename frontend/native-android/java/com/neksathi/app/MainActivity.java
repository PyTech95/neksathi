package com.neksathi.app;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    // Tracked so the FCM service knows whether to raise the full-screen call UI
    // (only when the app is NOT already on screen).
    public static boolean isForeground = false;

    // Opaque native screen shown over the web view while an answered call is
    // still loading/connecting, so the user never sees the app boot / dashboard.
    private View connectingOverlay;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NekNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Launched from an incoming-call notification → show over the lock screen,
        // keep the screen awake and stop the native ringtone (the in-app call UI
        // now takes over). KEEP_SCREEN_ON is important: it keeps the web view
        // running so the WebRTC call connects immediately over the lock screen,
        // instead of only after the user unlocks the phone.
        if (getIntent() != null && getIntent().hasExtra("call_id")) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            }
            getWindow().addFlags(
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                            | android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            RingPlayer.stop();
        }

        maybeAutoAnswer(getIntent());

        requestAppPermissions();

        // Let the WebView auto-play audio (ringtone + remote call audio) without
        // requiring a prior user tap.
        try {
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        } catch (Exception e) { /* ignore */ }

        // Grant the web layer's getUserMedia (microphone for WebRTC calls, camera)
        // permission requests. The Android runtime permissions are requested above
        // in requestAppPermissions(); without this override the WebView silently
        // denies the web page's mic request and calls fail with
        // "Microphone access is needed to call". We extend Capacitor's own
        // BridgeWebChromeClient so file chooser / geolocation prompts keep working;
        // only onPermissionRequest is customised.
        try {
            final com.getcapacitor.Bridge nkBridge = getBridge();
            nkBridge.getWebView().setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(nkBridge) {
                @Override
                public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                request.grant(request.getResources());
                            } catch (Exception e) {
                                try { request.deny(); } catch (Exception ignored) {}
                            }
                        }
                    });
                }
            });
        } catch (Exception e) { /* ignore */ }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        RingPlayer.stop();
        maybeAutoAnswer(intent);
    }

    private void maybeAutoAnswer(Intent intent) {
        if (intent != null && intent.getBooleanExtra("answer", false)) {
            // Mask the web-view boot behind a clean native "Connecting…" screen.
            showConnectingOverlay();
            scheduleAutoAnswer(intent.getStringExtra("call_id"));
        }
    }

    // A full-screen dark "Nek Sathi · Connecting…" view laid over the web view.
    // It hides the app opening / dashboard flash while the answered call loads;
    // removed by hideConnectingOverlay() once the web app reports "connected"
    // (or on call end / a safety timeout).
    public void showConnectingOverlay() {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (connectingOverlay != null) return;
                LinearLayout box = new LinearLayout(MainActivity.this);
                box.setOrientation(LinearLayout.VERTICAL);
                box.setGravity(Gravity.CENTER);
                box.setBackgroundColor(Color.parseColor("#06060D"));
                box.setClickable(true); // swallow taps so the booting web view isn't touched

                TextView brand = new TextView(MainActivity.this);
                brand.setText("Nek Sathi");
                brand.setTextColor(Color.parseColor("#E92546"));
                brand.setTextSize(24);
                brand.setGravity(Gravity.CENTER);

                TextView msg = new TextView(MainActivity.this);
                msg.setText("Connecting…");
                msg.setTextColor(Color.WHITE);
                msg.setTextSize(16);
                msg.setGravity(Gravity.CENTER);
                msg.setPadding(0, 28, 0, 0);

                box.addView(brand);
                box.addView(msg);
                connectingOverlay = box;
                getWindow().addContentView(box, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                // Never let the connecting screen hang forever if the call never
                // connects (network / permission issue).
                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override public void run() { hideConnectingOverlay(); }
                }, 20000);
            }
        });
    }

    public void hideConnectingOverlay() {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (connectingOverlay == null) return;
                try {
                    ViewGroup p = (ViewGroup) connectingOverlay.getParent();
                    if (p != null) p.removeView(connectingOverlay);
                } catch (Exception e) { /* ignore */ }
                connectingOverlay = null;
            }
        });
    }

    // After the user taps Answer on the native call screen, tell the web app to
    // auto-answer that call. The localStorage flag is set repeatedly for a few
    // seconds so it lands whether the web view is already loaded or still starting.
    private void scheduleAutoAnswer(final String callId) {
        if (callId == null || callId.isEmpty()) return;
        WebView webView;
        try { webView = getBridge().getWebView(); } catch (Exception e) { webView = null; }
        if (webView == null) return;
        final WebView wv = webView;
        final Handler h = new Handler(Looper.getMainLooper());
        final int[] tries = {0};
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    wv.evaluateJavascript(
                        "try{localStorage.setItem('nk_answer_call_id','" + callId + "');"
                        + "window.dispatchEvent(new Event('nk-answer-call'));}catch(e){}", null);
                } catch (Exception e) { }
                tries[0]++;
                if (tries[0] < 20) h.postDelayed(this, 500);
            }
        }, 150);
    }

    @Override
    public void onResume() {
        super.onResume();
        isForeground = true;
        // The app is now on screen → the in-app (web) call UI owns the call, so
        // clear the native ringing notification + ringtone. This is what stops the
        // "Answer" popup lingering (or re-appearing) after the call is picked up.
        CallMessagingService.cancelCall(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        isForeground = false;
    }

    // When a call ends: if we had answered over the lock screen, stop showing
    // over the keyguard and send the app to the background so the phone returns
    // to its lock screen (instead of leaving the app open on top).
    public void onCallEnded() {
        try {
            // Make sure nothing call-related is left ringing / showing.
            CallMessagingService.cancelCall(this);
            hideConnectingOverlay();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(false);
                setTurnScreenOn(false);
            }
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                moveTaskToBack(true);
            }
        } catch (Exception e) { /* ignore */ }
    }

    // Ask up front for the runtime permissions the app needs (microphone for
    // calls, camera for SOS photos, location for live/SOS, notifications for
    // incoming-call + alert pushes).
    private void requestAppPermissions() {
        List<String> wanted = new ArrayList<>();
        wanted.add(Manifest.permission.RECORD_AUDIO);
        wanted.add(Manifest.permission.CAMERA);
        wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
        wanted.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            wanted.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        List<String> toAsk = new ArrayList<>();
        for (String p : wanted) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                toAsk.add(p);
            }
        }
        if (!toAsk.isEmpty()) {
            ActivityCompat.requestPermissions(this, toAsk.toArray(new String[0]), 1001);
        }
    }
}
