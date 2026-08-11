package com.kanaku.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
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

        // Carry the SMS identity into the app as a deep link so the tap opens the
        // prefilled add-transaction screen. This side only knows the platform SMS
        // id; lib/nativeDeepLinks.ts resolves it to the local record id, which is
        // assigned later by the JS layer when it drains the pending queue.
        String sourceSmsId = transaction.optString("sourceSmsId", "");
        if (!sourceSmsId.isEmpty()) {
            launchIntent.setAction(Intent.ACTION_VIEW);
            launchIntent.setData(
                Uri.parse("kanaku://sms-transaction")
                    .buildUpon()
                    .appendQueryParameter("sourceSmsId", sourceSmsId)
                    .build()
            );
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                transaction.optString("sourceSmsId", "").hashCode() & 0x7fffffff,
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
                // Monochrome drawable, NOT the launcher mipmap. The system renders a
                // small icon as an alpha mask, so a full-colour asset shows up as a
                // blank white square in the status bar.
                .setSmallIcon(R.drawable.ic_stat_kanaku)
                .setColor(ContextCompat.getColor(context, R.color.colorPrimary))
                .setContentTitle("New Transaction Detected")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(context).notify(
                transaction.optString("sourceSmsId", "").hashCode() & 0x7fffffff,
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
