package com.neksathi.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Handles the "Decline" action from the full-screen incoming-call notification:
// stop the ringtone, clear the notification, and tell the backend the call was
// rejected so the in-app (web) layer never re-shows it after unlock.
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        RingPlayer.stop();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CallMessagingService.CALL_NOTIF_ID);
        String callId = intent != null ? intent.getStringExtra("call_id") : null;
        CallApi.reject(ctx, callId);
    }
}
