package com.kanaku.app;

import android.os.Bundle;
import android.util.Log;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsDetectionPlugin.class);

        // Ensure FirebaseApp is safely initialized even if google-services.json is omitted
        // so that @capacitor/push-notifications does not throw uncaught IllegalStateException.
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId(getPackageName())
                    .setApiKey("AIzaSyDummyApiKeyForKanakuOfflineNotifications")
                    .setProjectId("kanaku-app")
                    .build();
                FirebaseApp.initializeApp(this, options);
            }
        } catch (Exception e) {
            Log.w("KANAKU", "Firebase fallback initialization: " + e.getMessage());
        }

        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}

