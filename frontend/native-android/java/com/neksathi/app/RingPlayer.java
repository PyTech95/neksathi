package com.neksathi.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

// Plays a ringtone in a loop and vibrates while an incoming call is ringing.
// Falls back across the device ringtone, notification sound, and a bundled tone
// so SOME ring is heard on every device. Static so the notification/Activity can
// stop it from anywhere.
public class RingPlayer {
    private static MediaPlayer mp;
    private static Vibrator vib;
    private static boolean sirenMode = false;   // true while a siren ringtone is playing

    public static synchronized void start(Context ctx) {
        stop();
        Context app = ctx.getApplicationContext();

        // Ringtone preference (pt 12): "default" | "siren" | "custom"<uri>.
        // Stored by NekNativePlugin.setRingtone / pickCustomRingtone.
        SharedPreferences sp = app.getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
        String mode = sp.getString("ringtone_mode", "default");

        // Siren ringtone: use the alarm-style wailing siren (it vibrates too, so
        // we don't also start RingPlayer's own vibration).
        if ("siren".equals(mode)) {
            sirenMode = true;
            try { SirenPlayer.start(app); } catch (Exception ignored) {}
            return;
        }

        // Always vibrate (even in silent/vibrate mode).
        startVibrate(app);

        // Respect full silent mode (sound off) — vibrate only.
        try {
            AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) return;
        } catch (Exception ignored) {}

        Uri bundled = Uri.parse("android.resource://" + app.getPackageName() + "/" + R.raw.ringtone);
        java.util.List<Uri> uris = new java.util.ArrayList<>();
        // A chosen custom tone is tried first, then the usual fallback chain so
        // SOME ring is always heard if the custom URI is no longer readable.
        if ("custom".equals(mode)) {
            String u = sp.getString("ringtone_uri", "");
            if (!u.isEmpty()) {
                try { uris.add(Uri.parse(u)); } catch (Exception ignored) {}
            }
        }
        uris.add(RingtoneManager.getActualDefaultRingtoneUri(app, RingtoneManager.TYPE_RINGTONE));
        uris.add(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
        uris.add(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
        uris.add(bundled);
        for (Uri uri : uris) {
            if (uri == null) continue;
            if (tryPlay(app, uri)) return;
        }
    }

    private static boolean tryPlay(Context app, Uri uri) {
        try {
            mp = new MediaPlayer();
            mp.setDataSource(app, uri);
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setLooping(true);
            mp.setVolume(1f, 1f);
            mp.prepare();
            mp.start();
            return true;
        } catch (Exception e) {
            try { if (mp != null) mp.release(); } catch (Exception ignored) {}
            mp = null;
            return false;
        }
    }

    private static void startVibrate(Context app) {
        try {
            vib = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            if (vib != null && vib.hasVibrator()) {
                long[] pattern = {0, 1000, 1000};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vib.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            vib = null;
        }
    }

    public static synchronized void stop() {
        if (sirenMode) {
            try { SirenPlayer.stop(); } catch (Exception ignored) {}
            sirenMode = false;
        }
        try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception e) { }
        mp = null;
        try { if (vib != null) { vib.cancel(); } } catch (Exception e) { }
        vib = null;
    }
}
