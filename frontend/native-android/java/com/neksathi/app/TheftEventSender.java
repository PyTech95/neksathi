package com.neksathi.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Posts a SIM-removed / power-off / boot theft event to the backend when theft
// protection is ON, so the owner + family get alerted even without a wrong
// unlock (pt 4). Reads device_id from nek_theft (TheftAdminReceiver.PREFS) and
// api/token from nek_calls (CallApi.PREFS) — the same auth the intruder capture
// already uses. Backend: POST {api}/devices/{device_id}/theft-event {type}.
public class TheftEventSender {
    private static final String TAG = "NekTheftEvent";
    private static final int TIMEOUT_MS = 5000;   // short: ACTION_SHUTDOWN gives us little time

    // True when the user has turned anti-theft protection on for this phone.
    public static boolean enabled(Context ctx) {
        try {
            return TheftAdminReceiver.prefs(ctx).getBoolean("enabled", false);
        } catch (Exception e) {
            return false;
        }
    }

    public static void send(Context ctx, String type) {
        send(ctx, type, false);
    }

    // sync=true runs the POST on the calling thread — used for ACTION_SHUTDOWN,
    // where a spawned background thread would be killed before it completes.
    public static void send(final Context ctx, final String type, final boolean sync) {
        if (!enabled(ctx)) return;
        final String deviceId = TheftAdminReceiver.prefs(ctx).getString("device_id", "");
        SharedPreferences auth = ctx.getApplicationContext()
                .getSharedPreferences(CallApi.PREFS, Context.MODE_PRIVATE);
        final String api = auth.getString("api", "");
        final String token = auth.getString("token", "");
        if (deviceId.isEmpty() || api.isEmpty() || token.isEmpty()) {
            Log.w(TAG, "not configured (device_id/api/token missing) for " + type);
            return;
        }
        final String url = api + "/devices/" + deviceId + "/theft-event";
        String json;
        try {
            json = new JSONObject().put("type", type).toString();
        } catch (Exception e) {
            json = "{\"type\":\"" + type + "\"}";
        }
        final String body = json;
        Runnable r = new Runnable() {
            @Override public void run() { doPost(url, token, body, type); }
        };
        if (sync) r.run();
        else new Thread(r).start();
    }

    private static void doPost(String url, String token, String json, String type) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            OutputStream os = c.getOutputStream();
            os.write(json.getBytes("UTF-8"));
            os.flush();
            os.close();
            int code = c.getResponseCode();
            Log.i(TAG, "theft-event " + type + " -> HTTP " + code);
        } catch (Exception e) {
            Log.w(TAG, "theft-event " + type + " failed: " + e);
        } finally {
            if (c != null) {
                try { c.disconnect(); } catch (Exception ignored) {}
            }
        }
    }
}
