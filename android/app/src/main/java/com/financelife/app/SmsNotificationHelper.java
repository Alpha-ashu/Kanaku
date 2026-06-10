package com.financelife.app;

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

import org.json.JSONObject;

import java.util.Locale;

public final class SmsNotificationHelper {

    private static final String CHANNEL_ID = "KANAKU_sms_detection";
    private static final String CHANNEL_NAME = "SMS Transaction Detection";

    private SmsNotificationHelper() {
    }

    public static void showDetectionNotification(Context context, JSONObject transaction) {
        createChannel(context);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) {
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                Math.abs(transaction.optString("sourceSmsId", "").hashCode()),
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String merchant = transaction.optString("merchant", "");
        String amountLabel = formatAmount(
                transaction.optDouble("amount", 0d),
                transaction.optString("currencyCode", "INR")
        );
        String action = "income".equalsIgnoreCase(transaction.optString("transactionType", "expense"))
                ? "received"
                : "spent";
        String body = merchant.isEmpty()
                ? amountLabel + " " + action + ". Review and add it to KANAKU."
                : amountLabel + " " + action + " at " + merchant + ". Review and add it to KANAKU.";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("New Transaction Detected")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(context).notify(
                Math.abs(transaction.optString("sourceSmsId", "").hashCode()),
                builder.build()
        );
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Alerts for bank transactions detected from SMS.");
        manager.createNotificationChannel(channel);
    }

    private static String formatAmount(double amount, String currencyCode) {
        String safeCurrency = currencyCode == null || currencyCode.isEmpty() ? "INR" : currencyCode.toUpperCase(Locale.ENGLISH);
        if ("INR".equals(safeCurrency)) {
            return String.format(Locale.ENGLISH, "\u20B9%.2f", amount);
        }
        return String.format(Locale.ENGLISH, "%s %.2f", safeCurrency, amount);
    }
}
