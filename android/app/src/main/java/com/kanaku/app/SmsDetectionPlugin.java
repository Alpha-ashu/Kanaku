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

    @PluginMethod
    public void scanHistoricalMessages(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permissions are not granted.");
            return;
        }

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

            int count = 0;
            while (cursor.moveToNext() && count < limit) {
                String smsId = cursor.getString(0);
                String address = cursor.getString(1);
                String body = cursor.getString(2);
                long timestamp = cursor.getLong(3);
                JSONObject parsed = SmsTransactionParser.parse("historical_" + smsId, address, body, timestamp);

                if (parsed == null) {
                    continue;
                }

                transactions.put(toJSObject(parsed));
                count += 1;
            }

            JSObject response = new JSObject();
            response.put("transactions", transactions);
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
        String sourceSmsId = call.getString("sourceSmsId", "");
        if (!sourceSmsId.isEmpty()) {
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
