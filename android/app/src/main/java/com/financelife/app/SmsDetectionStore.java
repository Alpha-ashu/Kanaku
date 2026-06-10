package com.financelife.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class SmsDetectionStore {

    private static final String PREFS_NAME = "KANAKU_sms_detection";
    private static final String ENABLED_KEY = "enabled";
    private static final String PENDING_TRANSACTIONS_KEY = "pending_transactions";

    private SmsDetectionStore() {
    }

    private static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static boolean isEnabled(Context context) {
        return getPrefs(context).getBoolean(ENABLED_KEY, false);
    }

    public static void setEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(ENABLED_KEY, enabled).apply();
    }

    public static synchronized JSONArray getPendingTransactions(Context context) {
        String raw = getPrefs(context).getString(PENDING_TRANSACTIONS_KEY, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException exception) {
            return new JSONArray();
        }
    }

    public static synchronized void upsertPendingTransaction(Context context, JSONObject transaction) {
        JSONArray items = getPendingTransactions(context);
        String sourceSmsId = transaction.optString("sourceSmsId", "");
        JSONArray next = new JSONArray();
        boolean replaced = false;

        for (int index = 0; index < items.length(); index++) {
            JSONObject current = items.optJSONObject(index);
            if (current == null) {
                continue;
            }

            if (!sourceSmsId.isEmpty() && sourceSmsId.equals(current.optString("sourceSmsId", ""))) {
                next.put(transaction);
                replaced = true;
            } else {
                next.put(current);
            }
        }

        if (!replaced) {
            next.put(transaction);
        }

        getPrefs(context).edit().putString(PENDING_TRANSACTIONS_KEY, next.toString()).apply();
    }

    public static synchronized void removePendingTransaction(Context context, String sourceSmsId) {
        JSONArray items = getPendingTransactions(context);
        JSONArray next = new JSONArray();

        for (int index = 0; index < items.length(); index++) {
            JSONObject current = items.optJSONObject(index);
            if (current == null) {
                continue;
            }

            if (!sourceSmsId.equals(current.optString("sourceSmsId", ""))) {
                next.put(current);
            }
        }

        getPrefs(context).edit().putString(PENDING_TRANSACTIONS_KEY, next.toString()).apply();
    }
}
