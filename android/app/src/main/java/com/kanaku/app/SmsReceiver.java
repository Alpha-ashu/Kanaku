package com.kanaku.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import org.json.JSONObject;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "KANAKU_SmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        if (!SmsDetectionStore.isEnabled(context)) {
            return;
        }

        Bundle extras = intent.getExtras();
        if (extras == null) {
            return;
        }

        Object[] pdus = (Object[]) extras.get("pdus");
        String format = extras.getString("format");
        if (pdus == null || pdus.length == 0) {
            return;
        }

        // Every PDU in a single SMS_RECEIVED broadcast belongs to ONE message —
        // that is how Android delivers a concatenated (multipart) SMS. They must
        // therefore be joined in array order.
        //
        // This used to group the parts into a map keyed by "address|timestamp".
        // Each part of a multipart message carries its own SMSC timestamp, so a
        // long bank alert split across two parts produced two different keys and
        // two truncated bodies — the amount regex then matched the wrong number
        // or nothing at all. Identity now comes from the first part only.
        StringBuilder bodyBuilder = new StringBuilder();
        String address = "";
        long timestamp = 0L;
        boolean haveHeader = false;

        for (Object pdu : pdus) {
            if (!(pdu instanceof byte[])) {
                continue;
            }

            SmsMessage smsMessage;
            try {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
            } catch (Exception exception) {
                Log.w(TAG, "Skipping undecodable SMS PDU", exception);
                continue;
            }
            if (smsMessage == null) {
                continue;
            }

            if (!haveHeader) {
                address = smsMessage.getOriginatingAddress() == null ? "" : smsMessage.getOriginatingAddress();
                timestamp = smsMessage.getTimestampMillis();
                haveHeader = true;
            }

            String part = smsMessage.getMessageBody();
            if (part != null) {
                bodyBuilder.append(part);
            }
        }

        if (!haveHeader || bodyBuilder.length() == 0) {
            return;
        }

        final String finalAddress = address;
        final long finalTimestamp = timestamp > 0 ? timestamp : System.currentTimeMillis();
        final String body = bodyBuilder.toString();

        // Parsing, the SharedPreferences read-modify-write and the notification all
        // used to run inline on the main thread inside onReceive, which has a hard
        // ~10s budget before an ANR. goAsync() keeps the receiver alive while the
        // work moves to a background thread.
        // Application context, not the short-lived receiver context: the work below
        // outlives onReceive().
        final Context appContext = context.getApplicationContext();
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                String sourceSmsId = SmsTransactionParser.buildStableSourceId(finalAddress, body);
                JSONObject parsedTransaction =
                    SmsTransactionParser.parse(sourceSmsId, finalAddress, body, finalTimestamp);
                if (parsedTransaction == null) {
                    return;
                }

                SmsDetectionStore.upsertPendingTransaction(appContext, parsedTransaction);
                SmsNotificationHelper.showDetectionNotification(appContext, parsedTransaction);
                SmsDetectionPlugin.dispatchIncomingTransaction(parsedTransaction);
            } catch (Throwable throwable) {
                Log.e(TAG, "Failed to process incoming SMS", throwable);
            } finally {
                pendingResult.finish();
            }
        }, "kanaku-sms-parse").start();
    }
}
