package com.neksathi.app;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

// Anti-theft: Android tells this receiver every time the lock-screen PIN /
// pattern / password is entered wrong (policy <watch-login/> in
// res/xml/device_admin.xml). After `threshold` wrong attempts in a row we start
// IntruderCaptureService, which takes a front-camera photo + location and posts
// it to the backend, which alerts the owner, the family circle and the admin.
//
// Config (written by the web app through NekNativePlugin.setTheftConfig):
//   enabled    - protection on/off for this phone
//   device_id  - the backend `devices` record that represents this phone
//   threshold  - wrong attempts before a capture (2..5)
// State: failed (consecutive wrong attempts), last_capture (throttle).
public class TheftAdminReceiver extends DeviceAdminReceiver {
    public static final String PREFS = "nek_theft";
    private static final String TAG = "NekTheft";

    public static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Override
    public void onEnabled(Context ctx, Intent intent) {
        prefs(ctx).edit().putBoolean("admin", true).apply();
        Log.i(TAG, "device admin enabled");
    }

    @Override
    public CharSequence onDisableRequested(Context ctx, Intent intent) {
        return "Nek Sathi will no longer photograph intruders or alert your family on failed unlocks.";
    }

    @Override
    public void onDisabled(Context ctx, Intent intent) {
        prefs(ctx).edit().putBoolean("admin", false).apply();
        Log.i(TAG, "device admin disabled");
    }

    // Called for the current user on every wrong unlock attempt. (On API 26+ the
    // 3-argument overload is invoked first and forwards here for our own user.)
    @Override
    public void onPasswordFailed(Context ctx, Intent intent) {
        SharedPreferences sp = prefs(ctx);
        int n = sp.getInt("failed", 0) + 1;
        sp.edit().putInt("failed", n).apply();
        if (!sp.getBoolean("enabled", false)) return;
        int threshold = Math.max(1, sp.getInt("threshold", 2));
        Log.i(TAG, "wrong unlock #" + n + " (threshold " + threshold + ")");
        if (n < threshold) return;
        // Throttle: one capture per 20 s so a burst of wrong attempts does not
        // fire the camera repeatedly; every attempt beyond the threshold still
        // reports its count.
        long now = System.currentTimeMillis();
        if (now - sp.getLong("last_capture", 0) < 20000) return;
        sp.edit().putLong("last_capture", now).apply();
        IntruderCaptureService.start(ctx, n);
    }

    @Override
    public void onPasswordSucceeded(Context ctx, Intent intent) {
        prefs(ctx).edit().putInt("failed", 0).apply();
    }
}
