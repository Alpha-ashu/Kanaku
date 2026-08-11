package com.kanaku.app;

import android.Manifest;
import android.database.Cursor;
import android.provider.Telephony;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

@CapacitorPlugin(
    name = "SmsDetection",
    permissions = {
        @Permission(
            alias = "sms",
            strings = {
                Manifest.permission.READ_SMS,
                Manifest.permission.RECEIVE_SMS
            }
        )
    }
)
public class SmsDetectionPlugin extends Plugin {
    private static SmsDetectionPlugin activeInstance;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatusPayload());
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject result = buildStatusPayload();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("sms", call, "permissionsCallback");
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);

        if (enabled && getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permissions are required before enabling detection.");
            return;
        }

        SmsDetectionStore.setEnabled(getContext(), enabled);
        call.resolve(buildStatusPayload());
    }

    /**
     * Hard ceiling on how many inbox rows a single scan will examine.
     *
     * The `limit` parameter caps *results*, and the loop only incremented its
     * counter on a successful parse — so on a busy inbox this walked every
     * message in the date window (thousands of rows, full regex battery each)
     * before returning. That ran on the caller's thread and reliably ANR'd.
     */
    private static final int MAX_ROWS_SCANNED = 2000;

    @PluginMethod
    public void scanHistoricalMessages(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permissions are not granted.");
            return;
        }

        // Content-provider query + parsing must not run on the main thread.
        getBridge().execute(() -> runHistoricalScan(call));
    }

    private void runHistoricalScan(PluginCall call) {
        int days = call.getInt("days", 30);
        int limit = call.getInt("limit", 300);
        long cutoffMillis = System.currentTimeMillis() - (Math.max(days, 1) * 24L * 60L * 60L * 1000L);

        JSArray transactions = new JSArray();
        Cursor cursor = null;

        try {
            cursor = getContext().getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI,
                new String[] {
                    Telephony.Sms.Inbox._ID,
                    Telephony.Sms.Inbox.ADDRESS,
                    Telephony.Sms.Inbox.BODY,
                    Telephony.Sms.Inbox.DATE
                },
                Telephony.Sms.Inbox.DATE + " >= ?",
                new String[] { String.valueOf(cutoffMillis) },
                Telephony.Sms.Inbox.DATE + " DESC"
            );

            if (cursor == null) {
                JSObject response = new JSObject();
                response.put("transactions", transactions);
                call.resolve(response);
                return;
            }

            int matched = 0;
            int scanned = 0;
            while (cursor.moveToNext() && matched < limit && scanned < MAX_ROWS_SCANNED) {
                scanned += 1;
                String address = cursor.getString(1);
                String body = cursor.getString(2);
                long timestamp = cursor.getLong(3);

                // Same content-addressed id the live receiver mints, so a message
                // seen by both paths resolves to one pending entry instead of two.
                String sourceSmsId = SmsTransactionParser.buildStableSourceId(address, body);
                JSONObject parsed = SmsTransactionParser.parse(sourceSmsId, address, body, timestamp);

                if (parsed == null) {
                    continue;
                }

                transactions.put(toJSObject(parsed));
                matched += 1;
            }

            JSObject response = new JSObject();
            response.put("transactions", transactions);
            response.put("scanned", scanned);
            response.put("truncated", scanned >= MAX_ROWS_SCANNED);
            call.resolve(response);
        } catch (Exception exception) {
            call.reject("Historical SMS scan failed.", exception);
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    @PluginMethod
    public void getPendingTransactions(PluginCall call) {
        JSONArray pending = SmsDetectionStore.getPendingTransactions(getContext());
        JSObject response = new JSObject();
        response.put("transactions", toJSArray(pending));
        call.resolve(response);
    }

    @PluginMethod
    public void markTransactionHandled(PluginCall call) {
        // getString() returns the caller's value when the key is present, so an
        // explicit `null` from JS comes back as null despite the default.
        String sourceSmsId = call.getString("sourceSmsId", "");
        if (sourceSmsId != null && !sourceSmsId.isEmpty()) {
            SmsDetectionStore.removePendingTransaction(getContext(), sourceSmsId);
        }
        call.resolve();
    }

    @PluginMethod
    public void permissionsCallback(PluginCall call) {
        JSObject result = buildStatusPayload();
        result.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(result);
    }

    public static void dispatchIncomingTransaction(JSONObject transaction) {
        if (activeInstance == null || transaction == null) {
            return;
        }

        activeInstance.notifyListeners("smsTransactionDetected", toJSObject(transaction));
    }

    private JSObject buildStatusPayload() {
        JSObject payload = new JSObject();
        payload.put("enabled", SmsDetectionStore.isEnabled(getContext()));
        payload.put("supported", true);
        payload.put("permissionState", permissionStateToString(getPermissionState("sms")));
        return payload;
    }

    private String permissionStateToString(PermissionState state) {
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private static JSArray toJSArray(JSONArray source) {
        JSArray target = new JSArray();

        for (int index = 0; index < source.length(); index++) {
            JSONObject item = source.optJSONObject(index);
            if (item != null) {
                target.put(toJSObject(item));
            }
        }

        return target;
    }

    private static JSObject toJSObject(JSONObject source) {
        JSObject target = new JSObject();
        Iterator<String> keys = source.keys();

        while (keys.hasNext()) {
            String key = keys.next();
            target.put(key, source.opt(key));
        }

        return target;
    }
}
