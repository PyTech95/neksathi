package com.neksathi.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

// Native full-screen incoming-call screen shown the instant a call arrives —
// directly over the lock screen / home screen, without loading the web app.
// Accept opens the app into the call (auto-answers); Decline just dismisses
// (returns to the lock/home screen — the app is NOT opened).
public class IncomingCallActivity extends Activity {
    public static final String EXTRA_CALL_ID = "call_id";
    public static final String EXTRA_PLATE = "number_plate";

    // The instance currently on screen, so a "call answered by another family
    // member" push can close it (see CallMessagingService.cancelCall).
    public static volatile IncomingCallActivity current;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            // Show the call screen directly OVER the lock screen (Answer/Decline
            // visible) without prompting for the PIN. The PIN is only needed
            // after the user accepts and wants to use the rest of the app.
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_incoming_call);

        // Safety net: if no answer/decline/cancel arrives within the ring window
        // (push lost, app killed), close this screen on our own so it never
        // stays stuck on the lock screen.
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() {
                try { if (!isFinishing()) { RingPlayer.stop(); finish(); } } catch (Exception ignored) {}
            }
        }, 50000);

        final String callId = getIntent().getStringExtra(EXTRA_CALL_ID);
        String plate = getIntent().getStringExtra(EXTRA_PLATE);

        TextView sub = (TextView) findViewById(R.id.call_sub);
        if (sub != null) {
            sub.setText((plate == null || plate.isEmpty())
                    ? "Someone scanned your vehicle" : "About " + plate);
        }

        Button accept = (Button) findViewById(R.id.btn_accept);
        Button decline = (Button) findViewById(R.id.btn_decline);
        if (accept != null) {
            accept.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { doAccept(callId); }
            });
        }
        if (decline != null) {
            decline.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { doDecline(callId); }
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        super.onDestroy();
    }

    private void doAccept(String callId) {
        RingPlayer.stop();
        clearNotif();
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("call_id", callId == null ? "" : callId);
        i.putExtra("answer", true);
        startActivity(i);
        finish();
    }

    private void doDecline(String callId) {
        RingPlayer.stop();
        clearNotif();
        // Tell the backend this member declined (others keep ringing).
        CallApi.reject(this, callId);
        finish();
    }

    private void clearNotif() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CallMessagingService.CALL_NOTIF_ID);
    }

    @Override
    public void onBackPressed() {
        // Ignore back while ringing — the user must Accept or Decline.
    }
}
