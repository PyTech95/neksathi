package com.neksathi.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Restart the opt-in volume-button SOS service after the phone reboots, so the
// user does not have to open the app to re-arm it.
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        try {
            if (VolumeSosService.isEnabled(ctx)) {
                VolumeSosService.setEnabled(ctx, true);
            }
        } catch (Exception ignored) {}
    }
}
