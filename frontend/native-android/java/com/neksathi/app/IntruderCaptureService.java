package com.neksathi.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.location.Location;
import android.location.LocationManager;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.util.Size;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

// Anti-theft capture engine. Started by TheftAdminReceiver after N wrong unlock
// attempts (or by the "Test capture now" button in the app):
//   1. becomes a foreground service (Android only lets a foreground service use
//      the camera while the app is in the background / the phone is locked),
//   2. grabs the last known location,
//   3. takes ONE front-camera photo with Camera2 (no preview surface needed),
//   4. POSTs {photo_base64, attempt_count, latitude, longitude} to
//      /api/devices/{device_id}/intruder with the JWT the web app saved via
//      NekNativePlugin.setCallAuth (same prefs the native call UI uses),
//   5. stops itself. The backend then alerts owner + family circle + admin.
// If the upload fails (no network on a stolen phone), the payload is kept in
// prefs and re-sent the next time the app runs (flushPending).
public class IntruderCaptureService extends Service {
    private static final String TAG = "NekTheft";
    private static final String CHANNEL_ID = "theft_protection";
    private static final int NOTIF_ID = 42431;
    private static final long CAMERA_TIMEOUT_MS = 9000;
    private static final long AE_WARMUP_MS = 1100;

    private HandlerThread thread;
    private Handler handler;
    private CameraDevice camera;
    private CameraCaptureSession session;
    private ImageReader reader;
    private long sessionStart;
    private final AtomicBoolean done = new AtomicBoolean(false);
    private int attempt = 1;

    public static void start(Context ctx, int attemptCount) {
        Context app = ctx.getApplicationContext();
        Intent i = new Intent(app, IntruderCaptureService.class);
        i.putExtra("attempt", attemptCount);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(i);
            else app.startService(i);
        } catch (Exception e) {
            // Background start refused (no "display over other apps" permission on
            // Android 12+). Still report the attempt — without a photo — directly.
            Log.w(TAG, "startForegroundService refused: " + e);
            final Context c = app;
            final int n = attemptCount;
            new Thread(new Runnable() {
                @Override public void run() { upload(c, null, n, lastKnownLocation(c)); }
            }).start();
        }
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        attempt = intent != null ? intent.getIntExtra("attempt", 1) : 1;
        goForeground();
        thread = new HandlerThread("nek-theft");
        thread.start();
        handler = new Handler(thread.getLooper());
        final Location loc = lastKnownLocation(this);
        // Hard stop: whatever the camera does, report within CAMERA_TIMEOUT_MS.
        handler.postDelayed(new Runnable() {
            @Override public void run() { finish(null, loc); }
        }, CAMERA_TIMEOUT_MS);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "camera permission missing - reporting without photo");
            finish(null, loc);
            return START_NOT_STICKY;
        }
        try {
            openFrontCamera(loc);
        } catch (Exception e) {
            Log.w(TAG, "camera open failed: " + e);
            finish(null, loc);
        }
        return START_NOT_STICKY;
    }

    // ---- foreground notification (kept off the lock screen) -----------------
    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Theft protection", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown briefly while Nek Sathi records a failed unlock attempt");
            ch.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Nek Sathi protection")
                .setContentText("Securing your phone…")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setSilent(true)
                .setOngoing(true)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int type = 0;
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                if (hasLocationPermission(this))
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
                if (type == 0) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
                startForeground(NOTIF_ID, n, type);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground failed: " + e);
            try { startForeground(NOTIF_ID, n); } catch (Exception ignored) {}
        }
    }

    // ---- camera ---------------------------------------------------------------
    private void openFrontCamera(final Location loc) throws Exception {
        final CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        if (cm == null) throw new IllegalStateException("no camera manager");
        String front = null, any = null;
        CameraCharacteristics chosen = null;
        for (String id : cm.getCameraIdList()) {
            CameraCharacteristics cc = cm.getCameraCharacteristics(id);
            Integer facing = cc.get(CameraCharacteristics.LENS_FACING);
            if (any == null) { any = id; chosen = cc; }
            if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) { front = id; chosen = cc; break; }
        }
        final String camId = front != null ? front : any;
        if (camId == null || chosen == null) throw new IllegalStateException("no camera");

        Size size = pickSize(chosen);
        Integer so = chosen.get(CameraCharacteristics.SENSOR_ORIENTATION);
        final int orientation = so == null ? 0 : so;

        reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.JPEG, 2);
        reader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            @Override public void onImageAvailable(ImageReader r) {
                Image img = null;
                try {
                    img = r.acquireLatestImage();
                    if (img == null) return;
                    // Let auto-exposure settle on the first frames, keep the first
                    // one taken after the warm-up.
                    if (System.currentTimeMillis() - sessionStart < AE_WARMUP_MS) return;
                    ByteBuffer buf = img.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buf.remaining()];
                    buf.get(bytes);
                    finish(bytes, loc);
                } catch (Exception e) {
                    Log.w(TAG, "image read failed: " + e);
                } finally {
                    if (img != null) try { img.close(); } catch (Exception ignored) {}
                }
            }
        }, handler);

        cm.openCamera(camId, new CameraDevice.StateCallback() {
            @Override public void onOpened(CameraDevice cam) {
                camera = cam;
                try {
                    cam.createCaptureSession(Collections.singletonList(reader.getSurface()), new CameraCaptureSession.StateCallback() {
                        @Override public void onConfigured(CameraCaptureSession s) {
                            session = s;
                            try {
                                CaptureRequest.Builder b = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                                b.addTarget(reader.getSurface());
                                b.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
                                b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                b.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                                b.set(CaptureRequest.JPEG_ORIENTATION, orientation);
                                b.set(CaptureRequest.JPEG_QUALITY, (byte) 80);
                                sessionStart = System.currentTimeMillis();
                                // Repeating JPEG frames: the first ones warm up exposure,
                                // the listener keeps the first frame after AE_WARMUP_MS.
                                s.setRepeatingRequest(b.build(), null, handler);
                            } catch (Exception e) {
                                Log.w(TAG, "capture request failed: " + e);
                                finish(null, loc);
                            }
                        }
                        @Override public void onConfigureFailed(CameraCaptureSession s) { finish(null, loc); }
                    }, handler);
                } catch (Exception e) {
                    Log.w(TAG, "session failed: " + e);
                    finish(null, loc);
                }
            }
            @Override public void onDisconnected(CameraDevice cam) { finish(null, loc); }
            @Override public void onError(CameraDevice cam, int error) {
                Log.w(TAG, "camera error " + error);
                finish(null, loc);
            }
        }, handler);
    }

    // Smallest JPEG size with width >= 640 (enough to recognise a face, small
    // enough to upload from a weak mobile connection); else the largest available.
    private static Size pickSize(CameraCharacteristics cc) {
        StreamConfigurationMap map = cc.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map != null ? map.getOutputSizes(ImageFormat.JPEG) : null;
        if (sizes == null || sizes.length == 0) return new Size(640, 480);
        Size best = null, largest = sizes[0];
        for (Size s : sizes) {
            if ((long) s.getWidth() * s.getHeight() > (long) largest.getWidth() * largest.getHeight()) largest = s;
            if (s.getWidth() >= 640 && (best == null || (long) s.getWidth() * s.getHeight() < (long) best.getWidth() * best.getHeight())) best = s;
        }
        return best != null ? best : largest;
    }

    // ---- finish: close camera, upload, stop ----------------------------------
    private void finish(final byte[] jpeg, final Location loc) {
        if (!done.compareAndSet(false, true)) return;
        try { if (session != null) session.close(); } catch (Exception ignored) {}
        try { if (camera != null) camera.close(); } catch (Exception ignored) {}
        try { if (reader != null) reader.close(); } catch (Exception ignored) {}
        final Context app = getApplicationContext();
        final int n = attempt;
        new Thread(new Runnable() {
            @Override public void run() {
                String photo = jpeg == null ? null : "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP);
                upload(app, photo, n, loc);
                new Handler(Looper.getMainLooper()).post(new Runnable() {
                    @Override public void run() {
                        try { stopForeground(true); } catch (Exception ignored) {}
                        stopSelf();
                    }
                });
            }
        }).start();
    }

    @Override
    public void onDestroy() {
        try { if (thread != null) thread.quitSafely(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    // ---- location -------------------------------------------------------------
    static boolean hasLocationPermission(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static Location lastKnownLocation(Context ctx) {
        if (!hasLocationPermission(ctx)) return null;
        try {
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;
            Location best = null;
            for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
                try {
                    Location l = lm.getLastKnownLocation(p);
                    if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                } catch (Exception ignored) {}
            }
            return best;
        } catch (Exception e) {
            return null;
        }
    }

    // ---- upload ---------------------------------------------------------------
    // Payload for POST /api/devices/{device_id}/intruder (see backend IntruderIn).
    private static String payloadJson(String photo, int attempt, Location loc) {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"attempt_count\":").append(Math.max(1, Math.min(50, attempt)));
        if (loc != null) {
            sb.append(",\"latitude\":").append(loc.getLatitude());
            sb.append(",\"longitude\":").append(loc.getLongitude());
        }
        if (photo != null) sb.append(",\"photo_base64\":\"").append(photo).append("\"");
        sb.append("}");
        return sb.toString();
    }

    static void upload(Context ctx, String photo, int attempt, Location loc) {
        SharedPreferences theft = TheftAdminReceiver.prefs(ctx);
        SharedPreferences auth = ctx.getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
        String deviceId = theft.getString("device_id", "");
        String api = auth.getString("api", "");
        String token = auth.getString("token", "");
        String body = payloadJson(photo, attempt, loc);
        if (deviceId.isEmpty() || api.isEmpty() || token.isEmpty()) {
            Log.w(TAG, "not configured (device_id/api/token missing) - keeping capture for later");
            theft.edit().putString("pending", body).apply();
            return;
        }
        if (!post(api + "/devices/" + deviceId + "/intruder", token, body)) {
            theft.edit().putString("pending", body).apply();
        } else {
            theft.edit().remove("pending").putLong("last_report", System.currentTimeMillis()).apply();
        }
    }

    // Re-send a capture that could not be uploaded at the time (called when the
    // app comes to the foreground via NekNativePlugin.getTheftStatus).
    static void flushPending(final Context ctx) {
        final SharedPreferences theft = TheftAdminReceiver.prefs(ctx);
        final String body = theft.getString("pending", "");
        if (body.isEmpty()) return;
        new Thread(new Runnable() {
            @Override public void run() {
                SharedPreferences auth = ctx.getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
                String deviceId = theft.getString("device_id", "");
                String api = auth.getString("api", "");
                String token = auth.getString("token", "");
                if (deviceId.isEmpty() || api.isEmpty() || token.isEmpty()) return;
                if (post(api + "/devices/" + deviceId + "/intruder", token, body)) {
                    theft.edit().remove("pending").putLong("last_report", System.currentTimeMillis()).apply();
                }
            }
        }).start();
    }

    private static boolean post(String url, String token, String json) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            OutputStream os = c.getOutputStream();
            os.write(json.getBytes("UTF-8"));
            os.flush();
            os.close();
            int code = c.getResponseCode();
            Log.i(TAG, "intruder report -> HTTP " + code);
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.w(TAG, "intruder report failed: " + e);
            return false;
        } finally {
            if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
        }
    }
}
