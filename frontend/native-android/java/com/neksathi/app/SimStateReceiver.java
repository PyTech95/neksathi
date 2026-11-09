package com.neksathi.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;
import android.util.Log;

// Anti-theft (pt 4): detects SIM removal and phone power-off while protection is on.
//   - SIM_STATE_CHANGED / SIM_CARD_STATE_CHANGED: fires "sim_removed" on a real
//     present -> absent transition (a thief swapping the SIM).
//   - ACTION_SHUTDOWN / QUICKBOOT_POWEROFF: best-effort "power_off" posted
//     synchronously (the process is about to die). The *reliable* signal is
//     BootReceiver, which posts "device_booted" on the next power-on.
// These are protected system broadcasts, registered in AndroidManifest.
//
// NOTE: on Android 8+ (and more so 14+) manifest delivery of SIM_STATE_CHANGED
// can be throttled by some OEMs; the boot-time report is the dependable backstop.
public class SimStateReceiver extends BroadcastReceiver {
    private static final String TAG = "NekSim";
    private static final String PREFS = "nek_sim";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        final String action = intent.getAction();
        try {
            if ("android.intent.action.ACTION_SHUTDOWN".equals(action)
                    || "android.intent.action.QUICKBOOT_POWEROFF".equals(action)
                    || "com.htc.intent.action.QUICKBOOT_POWEROFF".equals(action)) {
                TheftEventSender.send(ctx, "power_off", true);   // synchronous
                return;
            }
            if ("android.intent.action.SIM_STATE_CHANGED".equals(action)
                    || "android.telephony.action.SIM_CARD_STATE_CHANGED".equals(action)) {
                handleSimState(ctx);
            }
        } catch (Exception e) {
            Log.w(TAG, "onReceive error: " + e);
        }
    }

    private void handleSimState(Context ctx) {
        boolean present;
        try {
            TelephonyManager tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            int state = tm != null ? tm.getSimState() : TelephonyManager.SIM_STATE_UNKNOWN;
            // ABSENT = no SIM; UNKNOWN = indeterminate. Any other state (READY,
            // PIN/PUK/NETWORK-locked) means a SIM is physically present.
            present = state != TelephonyManager.SIM_STATE_ABSENT
                    && state != TelephonyManager.SIM_STATE_UNKNOWN;
        } catch (Exception e) {
            return;
        }
        SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean wasPresent = sp.getBoolean("present", true);
        sp.edit().putBoolean("present", present).apply();
        // Fire only on a genuine present -> absent transition, and only if armed.
        if (wasPresent && !present && TheftEventSender.enabled(ctx)) {
            Log.i(TAG, "SIM removed -> theft event");
            TheftEventSender.send(ctx, "sim_removed");
        }
    }
}
