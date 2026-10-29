package com.neksathi.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

// Native full-screen FAMILY SOS alert, shown directly over the lock screen when a
// family member raises an SOS and this phone's app is closed / in the background
// (the web FamilyAlarm handles it when the app is already open). A loud siren plays
// (SirenPlayer) and the member can respond right here:
//   Call Police / Call Ambulance -> opens the dialer (PIN prompt as usual)
//   See location                 -> opens the map (PIN prompt as usual)
//   Mute                         -> silences the siren, alert stays
//   Mark resolved                -> tells the server it is handled and closes
// The siren also stops on any action, on a "sos_cancel" push, or after 3 minutes.
public class SosAlertActivity extends Activity {
    public static final String EXTRA_SOS_ID = "sos_id";
    public static final String EXTRA_WHO = "who";
    public static final String EXTRA_MSG = "msg";
    public static final String EXTRA_LAT = "lat";
    public static final String EXTRA_LNG = "lng";
    public static final String EXTRA_POLICE = "police";
    public static final String EXTRA_AMBULANCE = "ambulance";

    // The instance on screen, so a "resolved" push can close it from anywhere
    // (see CallMessagingService.stopSos).
    public static volatile SosAlertActivity current;

    private String sosId, lat, lng;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        current = this;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_sos_alert);

        Intent in = getIntent();
        sosId = in.getStringExtra(EXTRA_SOS_ID);
        String who = in.getStringExtra(EXTRA_WHO);
        String msg = in.getStringExtra(EXTRA_MSG);
        lat = in.getStringExtra(EXTRA_LAT);
        lng = in.getStringExtra(EXTRA_LNG);
        final String police = emptyTo(in.getStringExtra(EXTRA_POLICE), "112");
        final String ambulance = emptyTo(in.getStringExtra(EXTRA_AMBULANCE), "108");

        TextView title = (TextView) findViewById(R.id.sos_title);
        if (title != null) title.setText(((who == null || who.isEmpty()) ? "A family member" : who) + " raised an SOS");
        TextView sub = (TextView) findViewById(R.id.sos_sub);
        if (sub != null) sub.setText((msg == null || msg.isEmpty()) ? "Needs urgent help — respond now" : msg);

        Button police_b = (Button) findViewById(R.id.btn_police);
        if (police_b != null) { police_b.setText("Call Police  ·  " + police);
            police_b.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { dial(police); } }); }
        Button amb_b = (Button) findViewById(R.id.btn_ambulance);
        if (amb_b != null) { amb_b.setText("Call Ambulance  ·  " + ambulance);
            amb_b.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { dial(ambulance); } }); }

        final boolean hasLoc = lat != null && !lat.isEmpty() && lng != null && !lng.isEmpty();
        Button loc = (Button) findViewById(R.id.btn_location);
        if (loc != null) {
            if (!hasLoc) { loc.setText("Location not shared"); loc.setEnabled(false); loc.setAlpha(0.5f); }
            else loc.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openMap(); } });
        }
        Button mute = (Button) findViewById(R.id.btn_mute);
        if (mute != null) mute.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { SirenPlayer.stop(); } });
        Button resolve = (Button) findViewById(R.id.btn_resolve);
        if (resolve != null) resolve.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { resolveAndClose(); } });

        // Safety net: never leave the siren blaring forever on the lock screen.
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() { try { SirenPlayer.stop(); } catch (Exception ignored) {} }
        }, 180000);
    }

    private static String emptyTo(String v, String dflt) { return (v == null || v.isEmpty()) ? dflt : v; }

    // Any action silences the siren (the member has acknowledged); dialing an
    // emergency number / opening the map then prompts the PIN as Android requires.
    // Over the lock screen a new activity (dialer / maps) is blocked until the
    // keyguard is dismissed, so we ASK for the PIN first and launch on success —
    // otherwise the tap looks dead.
    private void dial(final String num) {
        SirenPlayer.stop();
        afterUnlock(new Runnable() {
            @Override public void run() {
                try {
                    startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + num))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) {}
            }
        });
    }

    private void openMap() {
        SirenPlayer.stop();
        afterUnlock(new Runnable() {
            @Override public void run() {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW,
                            Uri.parse("geo:" + lat + "," + lng + "?q=" + lat + "," + lng + "(SOS)"))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW,
                                Uri.parse("https://maps.google.com/?q=" + lat + "," + lng))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    } catch (Exception ignored) {}
                }
            }
        });
    }

    // Dismiss the lock screen (shows the PIN/pattern prompt) and then run the
    // action. If the phone is already unlocked, or on old Android, run it directly.
    private void afterUnlock(final Runnable action) {
        try {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                    @Override public void onDismissSucceeded() { runOnUiThread(action); }
                    @Override public void onDismissError() { runOnUiThread(action); }
                    @Override public void onDismissCancelled() { /* user backed out */ }
                });
                return;
            }
        } catch (Exception ignored) {}
        action.run();
    }

    private void resolveAndClose() {
        CallApi.resolveSos(this, sosId);   // tells the server; it clears for everyone
        CallMessagingService.stopSos(this);
        finish();
    }

    @Override protected void onDestroy() { if (current == this) current = null; super.onDestroy(); }

    @Override public void onBackPressed() { /* must act via a button, not Back */ }
}
