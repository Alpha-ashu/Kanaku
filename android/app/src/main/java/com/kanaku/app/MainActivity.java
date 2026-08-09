package com.kanaku.app;

import android.os.Bundle;
import android.util.Log;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsDetectionPlugin.class);

        // Safe dynamic Firebase initialization fallback without direct compile-time coupling
        try {
            Class<?> firebaseAppClass = Class.forName("com.google.firebase.FirebaseApp");
            java.lang.reflect.Method getAppsMethod = firebaseAppClass.getMethod("getApps", android.content.Context.class);
            java.util.List<?> apps = (java.util.List<?>) getAppsMethod.invoke(null, this);
            if (apps == null || apps.isEmpty()) {
                Class<?> builderClass = Class.forName("com.google.firebase.FirebaseOptions$Builder");
                Object builder = builderClass.getDeclaredConstructor().newInstance();
                builderClass.getMethod("setApplicationId", String.class).invoke(builder, getPackageName());
                builderClass.getMethod("setApiKey", String.class).invoke(builder, "AIzaSyDummyApiKeyForKanakuOfflineNotifications");
                builderClass.getMethod("setProjectId", String.class).invoke(builder, "kanaku-app");
                Object options = builderClass.getMethod("build").invoke(builder);

                Class<?> optionsClass = Class.forName("com.google.firebase.FirebaseOptions");
                firebaseAppClass.getMethod("initializeApp", android.content.Context.class, optionsClass).invoke(null, this, options);
            }
        } catch (ClassNotFoundException ignored) {
            // Firebase SDK not linked in classpath
        } catch (Throwable e) {
            Log.w("KANAKU", "Firebase initialization fallback: " + e.getMessage());
        }

        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Catch and prevent any background plugin exceptions from crashing the app
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Log.e("KANAKU_CRASH", "Suppressed uncaught exception on thread " + thread.getName(), throwable);
        });
    }
}
