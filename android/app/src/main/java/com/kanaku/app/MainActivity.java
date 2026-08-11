package com.kanaku.app;

import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsDetectionPlugin.class);

        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // FLAG_SECURE: keep account balances and transaction history out of the
        // Android recents thumbnail, screenshots and screen recordings. Standard
        // for a PIN-locked finance app — the lock screen is pointless if the last
        // frame of the dashboard is sitting in the task switcher.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Log uncaught exceptions, then hand off to the platform handler.
        //
        // IMPORTANT: this MUST delegate. A handler that only logs leaves the
        // process alive with a dead looper thread — a permanently frozen UI that
        // never shows "app has stopped" and never recovers — and it hides every
        // crash from Play Console vitals and any crash reporter.
        final Thread.UncaughtExceptionHandler previousHandler =
            Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Log.e("KANAKU_CRASH", "Uncaught exception on thread " + thread.getName(), throwable);
            if (previousHandler != null) {
                previousHandler.uncaughtException(thread, throwable);
            } else {
                // No platform handler to delegate to — terminate rather than
                // leaving a zombie process behind.
                android.os.Process.killProcess(android.os.Process.myPid());
                System.exit(10);
            }
        });
    }
}
