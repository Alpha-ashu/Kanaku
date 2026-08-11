package com.kanaku.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class SmsDetectionStore {

    private static final String PREFS_NAME = "KANAKU_sms_detection";
    private static final String ENABLED_KEY = "enabled";
    private static final String PENDING_TRANSACTIONS_KEY = "pending_transactions";
    private static final String STORED_AT_FIELD = "_storedAt";

    /**
     * The pending list is a review queue, not an archive — the app pulls entries
     * and calls markTransactionHandled(). It previously grew without any bound:
     * every detected SMS was appended to a single JSON string that had to be
     * fully parsed and re-serialised on each new message, so a phone with months
     * of bank alerts turned every incoming SMS into a progressively slower
     * read-modify-write.
     */
    private static final int MAX_PENDING = 50;
    private static final long MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L;

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
        long now = System.currentTimeMillis();

        try {
            transaction.put(STORED_AT_FIELD, now);
        } catch (JSONException ignored) {
            // Non-fatal: the entry simply won't be age-pruned.
        }

        JSONArray next = new JSONArray();
        boolean replaced = false;

        for (int index = 0; index < items.length(); index++) {
            JSONObject current = items.optJSONObject(index);
            if (current == null) {
                continue;
            }

            // Drop entries the user never acted on within the retention window.
            long storedAt = current.optLong(STORED_AT_FIELD, now);
            if (now - storedAt > MAX_AGE_MS) {
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

        persist(context, trimToCap(next));
    }

    public static synchronized void removePendingTransaction(Context context, String sourceSmsId) {
        if (sourceSmsId == null) {
            return;
        }

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

        persist(context, next);
    }

    /** Keeps the newest MAX_PENDING entries (the array is in insertion order). */
    private static JSONArray trimToCap(JSONArray items) {
        if (items.length() <= MAX_PENDING) {
            return items;
        }

        JSONArray trimmed = new JSONArray();
        for (int index = items.length() - MAX_PENDING; index < items.length(); index++) {
            JSONObject current = items.optJSONObject(index);
            if (current != null) {
                trimmed.put(current);
            }
        }
        return trimmed;
    }

    private static void persist(Context context, JSONArray items) {
        getPrefs(context).edit().putString(PENDING_TRANSACTIONS_KEY, items.toString()).apply();
    }
}
