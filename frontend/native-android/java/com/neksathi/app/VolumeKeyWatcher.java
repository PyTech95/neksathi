package com.neksathi.app;

import android.content.Context;
import android.media.AudioManager;
import android.os.SystemClock;
import android.util.Log;

import androidx.media.VolumeProviderCompat;

import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

// Counts volume-up presses for the opt-in volume-button SOS. While active it
// holds a MediaSession that owns the volume stream, so the volume-up key routes
// here (onAdjustVolume) even over the lock screen / with the app closed. Three
// up-presses within five seconds triggers SosHelper.fire(); every press is also
// passed straight through to the normal media volume, so the user still controls
// their volume as usual. No audio is recorded or played.
class VolumeKeyWatcher {
    private static final String TAG = "NekVolSos";
    private static final int NEEDED = 3;
    private static final long WINDOW_MS = 5000;

    private final Context app;
    private MediaSessionCompat session;
    private AudioManager audio;
    private long[] ups = new long[NEEDED];
    private int idx = 0;

    VolumeKeyWatcher(Context ctx) { this.app = ctx.getApplicationContext(); }

    void start() {
        if (session != null) return;
        audio = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        int max = audio != null ? audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC) : 15;
        int cur = audio != null ? audio.getStreamVolume(AudioManager.STREAM_MUSIC) : 7;
        try {
            session = new MediaSessionCompat(app, "NekVolumeSos");
            session.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                    | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
            // Mark the session "playing" so the system routes volume keys to our
            // VolumeProvider (nothing is actually played).
            session.setPlaybackState(new PlaybackStateCompat.Builder()
                    .setState(PlaybackStateCompat.STATE_PLAYING, 0, 0f)
                    .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE)
                    .build());
            VolumeProviderCompat vp = new VolumeProviderCompat(
                    VolumeProviderCompat.VOLUME_CONTROL_RELATIVE, max, cur) {
                @Override
                public void onAdjustVolume(int direction) {
                    // Keep the real volume behaving normally for the user.
                    try {
                        if (audio != null && direction != 0) {
                            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,
                                    direction > 0 ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, 0);
                            setCurrentVolume(audio.getStreamVolume(AudioManager.STREAM_MUSIC));
                        }
                    } catch (Exception ignored) {}
                    if (direction > 0) onVolumeUp();
                }
            };
            session.setPlaybackToRemote(vp);
            session.setActive(true);
            Log.i(TAG, "volume SOS watcher active");
        } catch (Exception e) {
            Log.w(TAG, "watcher start failed: " + e);
        }
    }

    private void onVolumeUp() {
        long now = SystemClock.elapsedRealtime();
        ups[idx % NEEDED] = now;
        idx++;
        // Count how many of the last NEEDED presses fall inside the window.
        int within = 0;
        for (long t : ups) if (t != 0 && now - t <= WINDOW_MS) within++;
        if (within >= NEEDED) {
            ups = new long[NEEDED]; idx = 0;      // reset so one burst fires once
            Log.i(TAG, "3 volume-up presses -> firing SOS");
            SosHelper.fire(app);
        }
    }

    void stop() {
        try {
            if (session != null) {
                session.setActive(false);
                session.release();
            }
        } catch (Exception ignored) {}
        session = null;
    }
}
