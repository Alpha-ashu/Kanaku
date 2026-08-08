package com.kanaku.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class SmsReceiver extends BroadcastReceiver {
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

        Map<String, StringBuilder> bodiesByKey = new HashMap<>();
        Map<String, Long> timestampsByKey = new HashMap<>();
        Map<String, String> addressesByKey = new HashMap<>();

        for (Object pdu : pdus) {
            if (!(pdu instanceof byte[])) {
                continue;
            }

            SmsMessage smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
            if (smsMessage == null) {
                continue;
            }

            String address = smsMessage.getOriginatingAddress() == null ? "" : smsMessage.getOriginatingAddress();
            long timestamp = smsMessage.getTimestampMillis();
            String key = address + "|" + timestamp;

            StringBuilder bodyBuilder = bodiesByKey.get(key);
            if (bodyBuilder == null) {
                bodyBuilder = new StringBuilder();
                bodiesByKey.put(key, bodyBuilder);
            }
            bodyBuilder.append(smsMessage.getMessageBody());
            timestampsByKey.put(key, timestamp);
            addressesByKey.put(key, address);
        }

        for (Map.Entry<String, StringBuilder> entry : bodiesByKey.entrySet()) {
            String key = entry.getKey();
            String body = entry.getValue().toString();
            String address = addressesByKey.getOrDefault(key, "");
            long timestamp = timestampsByKey.getOrDefault(key, System.currentTimeMillis());
            String sourceSmsId = buildSourceSmsId(address, body, timestamp);

            JSONObject parsedTransaction = SmsTransactionParser.parse(sourceSmsId, address, body, timestamp);
            if (parsedTransaction == null) {
                continue;
            }

            SmsDetectionStore.upsertPendingTransaction(context, parsedTransaction);
            SmsNotificationHelper.showDetectionNotification(context, parsedTransaction);
            SmsDetectionPlugin.dispatchIncomingTransaction(parsedTransaction);
        }
    }

    private String buildSourceSmsId(String address, String body, long timestamp) {
        String normalized = (address + "|" + timestamp + "|" + body).toLowerCase(Locale.ENGLISH);
        return "incoming_" + (normalized.hashCode() & 0x7fffffff);
    }
}
