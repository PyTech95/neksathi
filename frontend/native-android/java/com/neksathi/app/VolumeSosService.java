package com.neksathi.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

// Personal-safety feature the user switches on for THEIR OWN phone: pressing the
// volume-up key three times within five seconds sends an SOS (with location) to
// the family members they chose. It is opt-in, shows an ongoing "SOS protection
// on" notification while active, and only ever sends the owner's own alert to
// their own family — see SosHelper for the actual send.
//
// Android only delivers hardware volume keys to whatever currently owns the
// media button / volume stream, so this runs as a foreground service holding a
// silent MediaSession; the key handling itself lives in VolumeKeyWatcher, which
// this service starts and stops.
public class VolumeSosService extends Service {
    public static final String PREFS = "nek_volsos";
    // v2: a channel's importance is fixed once the phone first creates it, so an
    // earlier build that made "sos_protection" at a higher importance would keep
    // popping this from the top. A new id lets the phone apply IMPORTANCE_MIN
    // (silent, collapsed at the very bottom of the shade) — same fix used for
    // the "nek_alerts_v2" alert channel.
    private static final String CHANNEL_ID = "sos_protection_v2";
    private static final int NOTIF_ID = 42441;

    private VolumeKeyWatcher watcher;

    public static boolean isEnabled(Context ctx) {
        return ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean("enabled", false);
    }

    public static void setEnabled(Context ctx, boolean on) {
        ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean("enabled", on).apply();
        Intent i = new Intent(ctx.getApplicationContext(), VolumeSosService.class);
        if (on) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.getApplicationContext().startForegroundService(i);
            else ctx.getApplicationContext().startService(i);
        } else {
            ctx.getApplicationContext().stopService(i);
        }
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        goForeground();
        if (watcher == null) watcher = new VolumeKeyWatcher(getApplicationContext());
        watcher.start();
        return START_STICKY;   // Android restarts it after the process is reclaimed.
    }

    @Override
    public void onDestroy() {
        try { if (watcher != null) watcher.stop(); } catch (Exception ignored) {}
        watcher = null;
        super.onDestroy();
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "SOS protection", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("A quiet status line shown while volume-button SOS is switched on");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.enableLights(false);
            nm.createNotificationChannel(ch);
            // Clean up the old higher-importance channel so only the quiet one remains.
            try { nm.deleteNotificationChannel("sos_protection"); } catch (Exception ignored) {}
        }
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Nek Sathi")
                .setContentText("Volume SOS is on")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setShowWhen(false)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(pi)
                .build();
        try { startForeground(NOTIF_ID, n); } catch (Exception ignored) {}
    }
}
