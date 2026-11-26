package com.neksathi.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Opt-in background location sharing. A foreground service (persistent quiet
// notification) that periodically reads the phone's location and POSTs it to
// {api}/me/status using the same auth the calls/theft features already store
// (CallApi.PREFS). The backend fills the family timeline, fires real-time
// overspeed alerts and evaluates safe-zones. The user turns this on/off from
// the app; it survives the app being backgrounded or closed.
public class LocationService extends Service implements LocationListener {
    public static final String PREFS = "nek_bgloc";
    private static final String CHANNEL_ID = "location_sharing_v1";
    private static final int NOTIF_ID = 42460;
    private static final long MIN_INTERVAL_MS = 20000; // post at most ~every 20s
    private static final float MIN_MOVE_M = 25f;
    private static final int TIMEOUT_MS = 8000;

    private LocationManager lm;
    private long lastPostAt = 0;

    public static boolean isEnabled(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean("enabled", false);
    }

    public static void setEnabled(Context ctx, boolean on) {
        ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean("enabled", on).apply();
        Intent i = new Intent(ctx.getApplicationContext(), LocationService.class);
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
        startUpdates();
        return START_STICKY; // Android restarts it after the process is reclaimed.
    }

    private boolean hasLocationPermission() {
        return ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startUpdates() {
        if (!hasLocationPermission()) { stopSelf(); return; }
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) { stopSelf(); return; }
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER))
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_INTERVAL_MS, MIN_MOVE_M, this, Looper.getMainLooper());
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, MIN_INTERVAL_MS, MIN_MOVE_M, this, Looper.getMainLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (loc == null) return;
        long now = System.currentTimeMillis();
        if (now - lastPostAt < MIN_INTERVAL_MS) return;
        lastPostAt = now;
        final double lat = loc.getLatitude();
        final double lng = loc.getLongitude();
        final double speedKmh = loc.hasSpeed() ? loc.getSpeed() * 3.6 : -1;
        final int batt = batteryPct();
        new Thread(new Runnable() {
            @Override public void run() { post(lat, lng, speedKmh, batt); }
        }).start();
    }

    // Older LocationListener signatures (needed on API < 29).
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}

    private int batteryPct() {
        try {
            BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        } catch (Exception ignored) {}
        return -1;
    }

    private void post(double lat, double lng, double speedKmh, int batt) {
        SharedPreferences auth = getApplicationContext().getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
        String api = auth.getString("api", "");
        String token = auth.getString("token", "");
        if (api.isEmpty() || token.isEmpty()) return;
        HttpURLConnection c = null;
        try {
            JSONObject body = new JSONObject();
            body.put("latitude", lat);
            body.put("longitude", lng);
            if (speedKmh >= 0) body.put("speed_kmh", speedKmh);
            if (batt >= 0) body.put("battery", batt);
            c = (HttpURLConnection) new URL(api + "/me/status").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            OutputStream os = c.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();
            c.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
    }

    @Override
    public void onDestroy() {
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignored) {}
        lm = null;
        super.onDestroy();
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Location sharing", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shown while you share your live location with your family circle");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.enableLights(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Nek Sathi")
                .setContentText("Sharing your location with family")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setShowWhen(false)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(pi)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            try { startForeground(NOTIF_ID, n); } catch (Exception ignored) {}
        }
    }
}
