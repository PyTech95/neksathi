package com.neksathi.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Sends the owner's own SOS to their family: a short confirmation vibration,
// last known location, then POST /api/me/sos {source:"volume_button"} with the
// JWT the web app saved (same prefs the native call UI uses). The backend
// decides who receives it (the family members the user chose) — this only sends
// the user's own alert. Throttled so one burst of presses sends once.
class SosHelper {
    private static final String TAG = "NekVolSos";
    private static volatile long lastSent = 0;

    static void fire(final Context ctx) {
        long now = System.currentTimeMillis();
        if (now - lastSent < 15000) return;   // one SOS per 15s
        lastSent = now;

        // Short "something happened" vibration — the only feedback on the
        // sender's own phone (no sound, no popup).
        try {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O)
                    v.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(400);
            }
        } catch (Exception ignored) {}

        final Location loc = lastKnownLocation(ctx);
        new Thread(new Runnable() {
            @Override public void run() {
                boolean ok = post(ctx, loc);
                if (!ok) {
                    // Keep it and let the app flush it when it next opens.
                    ctx.getApplicationContext().getSharedPreferences(VolumeSosService.PREFS, Context.MODE_PRIVATE)
                            .edit().putBoolean("pending", true).apply();
                }
            }
        }).start();
    }

    // Re-send an SOS that couldn't go out at the time (no network on the phone).
    static void flushPending(final Context ctx) {
        final SharedPrefsPending p = new SharedPrefsPending(ctx);
        if (!p.has()) return;
        new Thread(new Runnable() {
            @Override public void run() {
                if (post(ctx, lastKnownLocation(ctx))) p.clear();
            }
        }).start();
    }

    private static class SharedPrefsPending {
        final Context c;
        SharedPrefsPending(Context c) { this.c = c.getApplicationContext(); }
        boolean has() { return c.getSharedPreferences(VolumeSosService.PREFS, Context.MODE_PRIVATE).getBoolean("pending", false); }
        void clear() { c.getSharedPreferences(VolumeSosService.PREFS, Context.MODE_PRIVATE).edit().putBoolean("pending", false).apply(); }
    }

    private static boolean hasLoc(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static Location lastKnownLocation(Context ctx) {
        if (!hasLoc(ctx)) return null;
        try {
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;
            Location best = null;
            for (String prov : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
                try {
                    Location l = lm.getLastKnownLocation(prov);
                    if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                } catch (Exception ignored) {}
            }
            return best;
        } catch (Exception e) { return null; }
    }

    private static boolean post(Context ctx, Location loc) {
        SharedPreferences auth = ctx.getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
        String api = auth.getString("api", "");
        String token = auth.getString("token", "");
        if (api.isEmpty() || token.isEmpty()) {
            Log.w(TAG, "not signed in on this phone - cannot send SOS");
            return false;
        }
        StringBuilder body = new StringBuilder("{\"source\":\"volume_button\"");
        if (loc != null) body.append(",\"latitude\":").append(loc.getLatitude()).append(",\"longitude\":").append(loc.getLongitude());
        body.append("}");
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(api + "/me/sos").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            OutputStream os = c.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.flush(); os.close();
            int code = c.getResponseCode();
            Log.i(TAG, "SOS -> HTTP " + code);
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.w(TAG, "SOS send failed: " + e);
            return false;
        } finally {
            if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
        }
    }
}
