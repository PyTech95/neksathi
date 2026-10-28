package com.neksathi.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.widget.TextView;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

// One-time "Call setup" screen (WhatsApp-style): guides the user to grant the
// permissions needed for reliable full-screen incoming calls on the lock screen.
public class CallSetupActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_call_setup);

        findViewById(R.id.btn_notif).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openNotifications(); }
        });
        findViewById(R.id.btn_fullscreen).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openFullScreen(); }
        });
        findViewById(R.id.btn_overlay).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openOverlay(); }
        });
        findViewById(R.id.btn_battery).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openBattery(); }
        });
        findViewById(R.id.btn_autostart).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openAutostart(); }
        });
        findViewById(R.id.btn_done).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        });

        // The full-screen-intent permission only exists on Android 14+.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            View row = findViewById(R.id.row_fullscreen);
            if (row != null) row.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    private void refreshStatus() {
        setStatus(R.id.status_notif, NotificationManagerCompat.from(this).areNotificationsEnabled());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            setStatus(R.id.status_fullscreen, nm != null && nm.canUseFullScreenIntent());
        }

        boolean overlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
        setStatus(R.id.status_overlay, overlay);

        boolean battery = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            battery = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        }
        setStatus(R.id.status_battery, battery);
    }

    private void setStatus(int id, boolean ok) {
        TextView t = (TextView) findViewById(id);
        if (t == null) return;
        t.setText(ok ? "✓ Enabled" : "Not enabled — tap Enable");
        t.setTextColor(ok ? 0xFF16A34A : 0xFFE11D48);
    }

    private void openNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2001);
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(i);
        } catch (Exception e) { openAppDetails(); }
    }

    private void openFullScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.fromParts("package", getPackageName(), null));
                startActivity(i);
                return;
            } catch (Exception e) { /* fall through */ }
        }
        openAppDetails();
    }

    private void openOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
                return;
            } catch (Exception e) { /* fall through */ }
        }
        openAppDetails();
    }

    private void openBattery() {
        try {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (Exception e) { openAppDetails(); }
    }

    private void openAutostart() {
        String[][] comps = {
                {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
                {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
                {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
                {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"}
        };
        for (String[] c : comps) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(c[0], c[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return;
            } catch (Exception e) { /* try the next OEM */ }
        }
        openAppDetails();
    }

    private void openAppDetails() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) { /* ignore */ }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        refreshStatus();
    }
}
