package com.neksathi.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bridge between the web app and the native pieces: the "Call setup" screen,
// call-state hints, the auth hand-off for native HTTP calls, and the anti-theft
// (Device Admin + intruder capture) configuration.
@CapacitorPlugin(name = "NekNative")
public class NekNativePlugin extends Plugin {

    // ------------------------------------------------------------------ calls --

    @PluginMethod
    public void openCallSetup(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), CallSetupActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            call.reject("could not open call setup");
            return;
        }
        call.resolve();
    }

    // Called by the web app when a call ends — if we answered over the lock
    // screen, go back to the lock screen instead of lingering on the app.
    @PluginMethod
    public void callEnded(PluginCall call) {
        try {
            final Activity a = getActivity();
            if (a instanceof MainActivity) {
                a.runOnUiThread(new Runnable() {
                    @Override public void run() { ((MainActivity) a).onCallEnded(); }
                });
            }
        } catch (Exception e) { /* ignore */ }
        call.resolve();
    }

    // Called by the web app the moment the WebRTC call is connected — remove the
    // native "Connecting…" screen that was masking the web-view boot.
    @PluginMethod
    public void callConnected(PluginCall call) {
        try {
            final Activity a = getActivity();
            if (a instanceof MainActivity) {
                a.runOnUiThread(new Runnable() {
                    @Override public void run() { ((MainActivity) a).hideConnectingOverlay(); }
                });
            }
        } catch (Exception e) { /* ignore */ }
        call.resolve();
    }

    // Web pushes its API base + bearer token so native code (lock-screen Decline,
    // intruder report) can call the backend directly.
    @PluginMethod
    public void setCallAuth(PluginCall call) {
        try {
            CallApi.saveAuth(getContext(), call.getString("api", ""), call.getString("token", ""));
        } catch (Exception e) { /* ignore */ }
        call.resolve();
    }

    // ------------------------------------------------------------- anti-theft --

    private ComponentName adminComponent() {
        return new ComponentName(getContext(), TheftAdminReceiver.class);
    }

    // {device_id, threshold, enabled}: which backend device record is this phone
    // and after how many wrong unlocks to capture.
    @PluginMethod
    public void setTheftConfig(PluginCall call) {
        try {
            SharedPreferences sp = TheftAdminReceiver.prefs(getContext());
            SharedPreferences.Editor ed = sp.edit();
            if (call.getData().has("device_id")) ed.putString("device_id", call.getString("device_id", ""));
            if (call.getData().has("threshold")) ed.putInt("threshold", Math.max(1, Math.min(10, call.getInt("threshold", 2))));
            if (call.getData().has("enabled")) ed.putBoolean("enabled", call.getBoolean("enabled", true));
            ed.apply();
        } catch (Exception e) { /* ignore */ }
        getTheftStatus(call);
    }

    // Everything the settings screen needs to show what is still missing.
    @PluginMethod
    public void getTheftStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject o = new JSObject();
        try {
            SharedPreferences sp = TheftAdminReceiver.prefs(ctx);
            DevicePolicyManager dpm = (DevicePolicyManager) ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);
            boolean admin = dpm != null && dpm.isAdminActive(adminComponent());
            boolean camera = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
            boolean location = IntruderCaptureService.hasLocationPermission(ctx);
            boolean overlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);
            SharedPreferences auth = ctx.getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
            boolean hasAuth = !auth.getString("token", "").isEmpty() && !auth.getString("api", "").isEmpty();
            o.put("supported", true);
            o.put("admin_active", admin);
            o.put("camera", camera);
            o.put("location", location);
            o.put("overlay", overlay);
            o.put("auth", hasAuth);
            o.put("enabled", sp.getBoolean("enabled", false));
            o.put("device_id", sp.getString("device_id", ""));
            o.put("threshold", sp.getInt("threshold", 2));
            o.put("failed", sp.getInt("failed", 0));
            o.put("last_report", sp.getLong("last_report", 0));
            o.put("pending", !sp.getString("pending", "").isEmpty());
            o.put("sdk", Build.VERSION.SDK_INT);
            // Re-send a capture that could not be uploaded (phone was offline).
            IntruderCaptureService.flushPending(ctx);
        } catch (Exception e) {
            o.put("supported", false);
            o.put("error", String.valueOf(e));
        }
        call.resolve(o);
    }

    // Runtime permissions the capture needs (camera + location).
    @PluginMethod
    public void requestTheftPermissions(PluginCall call) {
        try {
            Activity a = getActivity();
            if (a != null) {
                ActivityCompat.requestPermissions(a, new String[]{
                        Manifest.permission.CAMERA,
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION}, 7731);
            }
        } catch (Exception e) { /* ignore */ }
        call.resolve();
    }

    // Opens Android's "Activate device admin" screen for Nek Sathi.
    @PluginMethod
    public void openDeviceAdmin(PluginCall call) {
        try {
            Intent i = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            i.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent());
            i.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Needed so Nek Sathi can notice wrong unlock attempts, photograph the intruder and alert your family.");
            Activity a = getActivity();
            if (a != null) a.startActivity(i); else { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); }
        } catch (Exception e) {
            call.reject("could not open device admin settings");
            return;
        }
        call.resolve();
    }

    // Turns device admin off again (user disables protection in the app).
    @PluginMethod
    public void removeDeviceAdmin(PluginCall call) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (dpm != null && dpm.isAdminActive(adminComponent())) dpm.removeActiveAdmin(adminComponent());
            TheftAdminReceiver.prefs(getContext()).edit().putBoolean("enabled", false).apply();
        } catch (Exception e) { /* ignore */ }
        getTheftStatus(call);
    }

    // Opens the device's Location settings so the user can turn GPS back on
    // (used when the app finds location is off while sharing status / SOS).
    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try {
                Intent i2 = new Intent(Settings.ACTION_SETTINGS);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
            } catch (Exception e2) {
                call.reject("could not open location settings");
                return;
            }
        }
        call.resolve();
    }

    // "Display over other apps" — lets Android start our capture service / call
    // screen from the background (needed on Android 10+).
    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            call.reject("could not open overlay settings");
            return;
        }
        call.resolve();
    }

    // ---------------------------------------------------------- volume SOS --

    // Turn the opt-in "volume-up x3 = SOS" protection on or off for this phone.
    @PluginMethod
    public void setVolumeSos(PluginCall call) {
        try {
            boolean on = call.getBoolean("enabled", Boolean.TRUE);
            VolumeSosService.setEnabled(getContext(), on);
        } catch (Exception e) { /* ignore */ }
        getVolumeSosStatus(call);
    }

    @PluginMethod
    public void getVolumeSosStatus(PluginCall call) {
        JSObject o = new JSObject();
        try {
            Context ctx = getContext();
            boolean enabled = VolumeSosService.isEnabled(ctx);
            SharedPreferences auth = ctx.getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
            boolean hasAuth = !auth.getString("token", "").isEmpty() && !auth.getString("api", "").isEmpty();
            boolean location = IntruderCaptureService.hasLocationPermission(ctx);
            boolean pending = ctx.getSharedPreferences(VolumeSosService.PREFS, Context.MODE_PRIVATE).getBoolean("pending", false);
            if (enabled) SosHelper.flushPending(ctx);
            o.put("supported", true);
            o.put("enabled", enabled);
            o.put("running", enabled);
            o.put("auth", hasAuth);
            o.put("location", location);
            o.put("pending", pending);
        } catch (Exception e) {
            o.put("supported", false);
            o.put("error", String.valueOf(e));
        }
        call.resolve(o);
    }

    // Fire the SOS pipeline once (vibration + location + POST /me/sos) so the
    // user can confirm their family receives it, without pressing the keys.
    @PluginMethod
    public void testVolumeSos(PluginCall call) {
        try { SosHelper.fire(getContext()); } catch (Exception e) { /* ignore */ }
        call.resolve();
    }

    // ------------------------------------------ SOS lock-screen display help --

    // What's still missing for the full-screen SOS alert to pop over the lock
    // screen (vs. only a notification + siren): the Android-14 full-screen-intent
    // permission and a battery-optimization exemption. The web shows a helper card.
    @PluginMethod
    public void getSosDisplayStatus(PluginCall call) {
        JSObject o = new JSObject();
        try {
            Context ctx = getContext();
            boolean fsi = true;   // pre-Android-14 it is granted by default
            if (Build.VERSION.SDK_INT >= 34) {
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                fsi = nm != null && nm.canUseFullScreenIntent();
            }
            boolean battOk = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                battOk = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            }
            o.put("supported", true);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("full_screen_intent", fsi);
            o.put("battery_unrestricted", battOk);
        } catch (Exception e) {
            o.put("supported", false);
            o.put("error", String.valueOf(e));
        }
        call.resolve(o);
    }

    // Android 14+: the "Full-screen notifications" permission screen for this app;
    // older: the app's notification settings.
    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 34) {
                i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
                        Uri.parse("package:" + getContext().getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            openAppInfoSettings(call);
            return;
        }
        call.resolve();
    }

    // The app's system details page — where the OEM "show on lock screen",
    // "display pop-up in background" and autostart toggles live (names vary).
    @PluginMethod
    public void openAppInfoSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            call.reject("could not open app settings");
            return;
        }
        call.resolve();
    }

    // Ask Android to exempt Nek Sathi from battery optimization (so the lock-screen
    // alert / background work isn't killed).
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try {
                Intent i2 = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
            } catch (Exception e2) {
                call.reject("could not open battery settings");
                return;
            }
        }
        call.resolve();
    }

    // Runs the whole capture pipeline once (photo + location + upload) so the
    // user can verify it from the app without locking the phone.
    @PluginMethod
    public void testIntruderCapture(PluginCall call) {
        try {
            int n = Math.max(1, TheftAdminReceiver.prefs(getContext()).getInt("threshold", 2));
            IntruderCaptureService.start(getContext(), n);
        } catch (Exception e) {
            call.reject("could not start capture");
            return;
        }
        call.resolve();
    }
}
