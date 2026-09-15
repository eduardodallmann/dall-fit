package com.dallfit.app.offline;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.dallfit.app.DallFitApplication;
import com.dallfit.app.MainActivity;
import com.dallfit.app.R;

final class OfflineActionNotifier {
    private static final String CHANNEL_ID = "offline_action_required";
    private static final int NOTIFICATION_ID = 9001;
    private final Context context;

    OfflineActionNotifier(Context context) {
        this.context = context.getApplicationContext();
    }

    void notifyActionRequired() {
        if (DallFitApplication.isAppVisible()) return;
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
        ) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            manager.createNotificationChannel(
                new NotificationChannel(
                    CHANNEL_ID,
                    "Ações de sincronização",
                    NotificationManager.IMPORTANCE_DEFAULT
                )
            );
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Ação necessária no Dall Fit")
            .setContentText("Abra o app para continuar a sincronização.")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true);
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification.build());
    }
}
