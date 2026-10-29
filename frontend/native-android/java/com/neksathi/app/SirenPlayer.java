package com.neksathi.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

// A loud, continuous two-tone SIREN for FAMILY SOS alerts — deliberately distinct
// from the call ringtone (RingPlayer) so a family member knows instantly it is an
// SOS, not a call. Synthesized in code (no audio asset) and played on the ALARM
// stream so it is heard even in ring/vibrate mode. Static so the notification or
// the SOS screen can stop it from anywhere.
public class SirenPlayer {
    private static AudioTrack track;
    private static Vibrator vib;
    private static final int SAMPLE_RATE = 44100;

    public static synchronized void start(Context ctx) {
        stop();
        startVibrate(ctx);
        try {
            byte[] pcm = buildSiren();        // ~2s wail, looped forever
            int frames = pcm.length / 2;      // 16-bit mono
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            AudioFormat fmt = new AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();
            track = new AudioTrack(attrs, fmt, pcm.length, AudioTrack.MODE_STATIC,
                    AudioManager.AUDIO_SESSION_ID_GENERATE);
            track.write(pcm, 0, pcm.length);
            track.setLoopPoints(0, frames, -1);   // -1 = loop forever
            track.setVolume(AudioTrack.getMaxVolume());
            track.play();
        } catch (Exception e) {
            try { if (track != null) track.release(); } catch (Exception ignored) {}
            track = null;
        }
    }

    // 16-bit mono PCM: a carrier wailing between ~600 and ~1300 Hz at 2 Hz.
    private static byte[] buildSiren() {
        int n = SAMPLE_RATE * 2;   // 2 seconds
        short[] s = new short[n];
        double phase = 0;
        double wailHz = 2.0;       // sweeps per second
        for (int i = 0; i < n; i++) {
            double t = (double) i / SAMPLE_RATE;
            double f = 950 + 350 * Math.sin(2 * Math.PI * wailHz * t);
            phase += 2 * Math.PI * f / SAMPLE_RATE;
            s[i] = (short) (Math.sin(phase) * 31000);
        }
        byte[] out = new byte[n * 2];
        for (int i = 0; i < n; i++) {
            out[i * 2] = (byte) (s[i] & 0xff);
            out[i * 2 + 1] = (byte) ((s[i] >> 8) & 0xff);
        }
        return out;
    }

    private static void startVibrate(Context ctx) {
        try {
            vib = (Vibrator) ctx.getApplicationContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (vib != null && vib.hasVibrator()) {
                long[] pattern = {0, 700, 400};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    vib.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else vib.vibrate(pattern, 0);
            }
        } catch (Exception e) { vib = null; }
    }

    public static synchronized void stop() {
        try { if (track != null) { track.stop(); track.release(); } } catch (Exception ignored) {}
        track = null;
        try { if (vib != null) vib.cancel(); } catch (Exception ignored) {}
        vib = null;
    }
}
