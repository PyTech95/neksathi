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
        } else {
            super.onMessageReceived(remoteMessage);
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
