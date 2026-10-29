package com.neksathi.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

// Intercepts "incoming_call" data pushes and shows a full-screen, ringing call
// notification even when the app is backgrounded or killed. A "call_cancel"
// push (another family member answered first, or the caller hung up) silences
// this phone. Every other push is passed through to Capacitor's normal handling.
public class CallMessagingService extends MessagingService {
    public static final String CHANNEL_ID = "incoming_calls";
    public static final int CALL_NOTIF_ID = 42424;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;
        if ("incoming_call".equals(type)) {
            // When the app is already on screen, the in-app call UI handles it.
            if (!MainActivity.isForeground) {
                showIncomingCall(data.get("call_id"), data.get("number_plate"));
            }
        } else if ("call_cancel".equals(type)) {
            // Simul-ring: someone else in the family picked up → stop ringing
            // here and close the native call screen if it is showing.
            cancelCall(this);
        } else if ("sos".equals(type)) {
            // A family member raised an SOS → sound a loud siren on THIS phone's
            // lock screen (not just a quiet notification). When the app is open
            // the in-app FamilyAlarm handles the siren instead (so we don't
            // double-ring); here we only cover the locked / app-closed case.
            if (!MainActivity.isForeground) {
                showSosAlert(data.get("title"), data.get("message"));
            }
        } else if ("sos_cancel".equals(type)) {
            // Someone marked the SOS handled ("I'm safe" / "Mark resolved") →
            // stop the siren on every family phone that is ringing for it.
            stopSos(this);
        } else {
            super.onMessageReceived(remoteMessage);
        }
    }

    public static final String SOS_CHANNEL_ID = "sos_siren";
    public static final int SOS_NOTIF_ID = 42425;
    // Safety cap so a siren never runs forever if the "resolved" push is missed
    // (poor network). Normal stop is the sos_cancel push or the app opening.
    private static final long SOS_MAX_MS = 180000;   // 3 minutes
    // True only while an SOS siren is actually ringing — so a stray sos_cancel
    // (or MainActivity.onResume) can never stop an unrelated incoming-call ring.
    private static volatile boolean sosActive = false;

    // Loud SOS alert for the lock screen / app-closed case: wake the screen, play
    // a looping siren + vibration, and post a high-priority, CATEGORY_ALARM
    // notification that opens the Family page. It keeps ringing until the SOS is
    // marked handled (a "sos_cancel" push -> stopSos), the user opens the app
    // (MainActivity.onResume -> stopSos), or the 3-minute safety cap.
    private void showSosAlert(String title, String message) {
        createSosChannel();
        sosActive = true;

        // Light up the screen so the lock-screen alert is actually seen
        // (auto-released after 10s; FLAG_KEEP_SCREEN_ON is not needed here).
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE, "neksathi:sos");
                wl.acquire(10000);
            }
        } catch (Exception ignored) {}

        RingPlayer.start(this);   // looping loud alert + vibration

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;

        // Tapping opens the app on the Family page. We deliberately do NOT auto-
        // launch an activity / use a full-screen intent here: launching
        // MainActivity would fire its onResume -> stopSos and silence the siren
        // instantly. The wake-lock + heads-up notification + loud siren are what
        // raise the alert over the lock screen.
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("sos_open", true);
        PendingIntent openPI = PendingIntent.getActivity(this, 7, open, piFlags);

        String t = (title == null || title.isEmpty()) ? "🆘 Family SOS" : title;
        String m = (message == null || message.isEmpty()) ? "A family member needs help — tap to see their location" : message;

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, SOS_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(t)
                .setContentText(m)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)
                .setAutoCancel(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openPI);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(SOS_NOTIF_ID, b.build());

        // Safety cap — stop even if the "resolved" push never arrives.
        final Context appCtx = getApplicationContext();
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() { stopSos(appCtx); }
        }, SOS_MAX_MS);
    }

    // Stop the SOS siren + clear its notification. Guarded by sosActive so it is
    // a no-op (and never touches an incoming-call ring) when no SOS is ringing.
    public static void stopSos(Context ctx) {
        if (!sosActive) return;
        sosActive = false;
        RingPlayer.stop();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(SOS_NOTIF_ID);
    }

    private void createSosChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(SOS_CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        SOS_CHANNEL_ID, "Family SOS siren", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Loud siren when a family member raises an SOS");
                ch.enableVibration(true);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                ch.setSound(null, null);   // the siren is the looping RingPlayer
                ch.setBypassDnd(true);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private void showIncomingCall(String callId, String plate) {
        createChannel();
        RingPlayer.start(this);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;

        Intent callUi = new Intent(this, IncomingCallActivity.class);
        callUi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        callUi.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId == null ? "" : callId);
        callUi.putExtra(IncomingCallActivity.EXTRA_PLATE, plate == null ? "" : plate);
        PendingIntent callUiPI = PendingIntent.getActivity(this, 0, callUi, piFlags);

        Intent declineIntent = new Intent(this, CallActionReceiver.class);
        declineIntent.setAction("DECLINE");
        declineIntent.putExtra("call_id", callId == null ? "" : callId);
        PendingIntent declinePI = PendingIntent.getBroadcast(this, 1, declineIntent, piFlags);

        Intent answerIntent = new Intent(this, MainActivity.class);
        answerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        answerIntent.putExtra("call_id", callId == null ? "" : callId);
        answerIntent.putExtra("answer", true);
        PendingIntent answerPI = PendingIntent.getActivity(this, 2, answerIntent, piFlags);

        String who = (plate == null || plate.isEmpty()) ? "your vehicle" : plate;

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Incoming call")
                .setContentText("Someone is calling about " + who)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(callUiPI, true)
                .setContentIntent(callUiPI)
                .addAction(R.mipmap.ic_launcher, "Answer", answerPI)
                .addAction(R.mipmap.ic_launcher, "Decline", declinePI);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(CALL_NOTIF_ID, b.build());

        // Also try to open the full-screen call UI directly (works when the screen
        // is on and "Display over other apps" is allowed; the full-screen intent
        // covers the locked / screen-off case).
        try { startActivity(callUi); } catch (Exception e) { /* fall back to full-screen intent */ }

        // Auto-dismiss + stop ring after the call ring window (45s), matching the
        // backend's CALL_RING_TIMEOUT_SEC.
        final Context appCtx = getApplicationContext();
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                // Ring window over: stop ringing AND close the full-screen call UI
                // (not just the notification), so nothing lingers on the lock screen.
                cancelCall(appCtx);
            }
        }, 45000);
    }

    // Stop the ringtone, clear the incoming-call notification, and close the
    // native full-screen call screen if it is open — from anywhere. Called when
    // the in-app (web) call UI takes over, when the user acts on the call, or
    // when a "call_cancel" push says another family member already answered.
    public static void cancelCall(Context ctx) {
        RingPlayer.stop();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CALL_NOTIF_ID);
        final IncomingCallActivity showing = IncomingCallActivity.current;
        if (showing != null) {
            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override public void run() {
                    try { showing.finish(); } catch (Exception ignored) {}
                }
            });
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Nek Sathi incoming voice calls");
                ch.enableVibration(true);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                ch.setSound(null, null); // ring is handled by RingPlayer's looping player
                ch.setBypassDnd(true);
                nm.createNotificationChannel(ch);
            }
        }
    }
}
