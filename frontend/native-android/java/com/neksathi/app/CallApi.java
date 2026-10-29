package com.neksathi.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Lightweight backend client used by the NATIVE lock-screen call UI so that an
// action taken there (Decline) is synced to the server immediately. Without this
// the in-app (web) layer would still see the call "ringing" and re-show it after
// the phone is unlocked — the "cut in one place, still rings in the other" bug.
//
// Auth (API base + bearer token) is pushed from the web app via
// NekNativePlugin.setCallAuth and kept in app-private SharedPreferences.
public class CallApi {
    public static final String PREFS = "nek_calls";
    private static final String TAG = "NekCallApi";

    public static void saveAuth(Context ctx, String api, String token) {
        try {
            ctx.getApplicationContext()
               .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
               .edit()
               .putString("api", api == null ? "" : api)
               .putString("token", token == null ? "" : token)
               .apply();
        } catch (Exception e) { /* ignore */ }
    }

    // Fire-and-forget POST {api}/family/sos/{sosId}/resolve — marks a family SOS
    // handled from the native lock-screen alert (the server then clears it for the
    // whole circle and silences their sirens via a sos_cancel push).
    public static void resolveSos(Context ctx, final String sosId) {
        if (sosId == null || sosId.isEmpty()) return;
        post(ctx, "/family/sos/" + sosId + "/resolve");
    }

    // Fire-and-forget POST {api}/me/calls/{callId}/reject with the bearer token.
    public static void reject(Context ctx, final String callId) {
        if (callId == null || callId.isEmpty()) return;
        post(ctx, "/me/calls/" + callId + "/reject");
    }

    // Shared fire-and-forget authenticated POST {api}{path} with an empty JSON body.
    private static void post(Context ctx, final String path) {
        SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        final String api = sp.getString("api", "");
        final String token = sp.getString("token", "");
        if (api.isEmpty() || token.isEmpty()) return;
        final String url = api + path;
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setRequestProperty("Authorization", "Bearer " + token);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setDoOutput(true);
                    OutputStream os = c.getOutputStream();
                    os.write("{}".getBytes("UTF-8"));
                    os.flush();
                    os.close();
                    c.getResponseCode(); // send the request
                } catch (Exception e) {
                    Log.w(TAG, "POST " + path + " failed: " + e);
                } finally {
                    if (c != null) {
                        try { c.disconnect(); } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }
}
