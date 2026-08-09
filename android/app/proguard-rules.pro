# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ── Capacitor WebView bridge ──────────────────────────────────────────────────
# Capacitor's native Java/Kotlin bridge communicates with the WebView-hosted
# JavaScript via reflection and @JavascriptInterface annotations. R8/ProGuard
# must not strip, rename, or obfuscate these classes or the bridge breaks
# silently in release builds (minifyEnabled=true).

-keep class com.getcapacitor.** { *; }
-keep class com.kanaku.app.** { *; }

# Keep WebView JavaScript interface methods (used by Capacitor plugins)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Capacitor Cordova compatibility layer ─────────────────────────────────────
# Some plugins still use the Cordova bridge under the hood.
-keep class org.apache.cordova.** { *; }

# ── Capacitor plugin classes and reflection methods ───────────────────────────
# Each @capacitor/* plugin registers a Java/Kotlin class via reflection.
# Stripping them causes "Plugin not found" errors on device.
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
    @com.getcapacitor.annotation.ActivityCallback public *;
    @com.getcapacitor.annotation.PermissionCallback public *;
}

# ── Native Biometric & AndroidX Biometric ─────────────────────────────────────
-keep class ee.forgr.biometric.** { *; }
-keep class androidx.biometric.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.community.** { *; }
-keep class androidx.security.crypto.** { *; }

# Keep line numbers and annotations for runtime reflection and debugging
-keepattributes SourceFile,LineNumberTable,*Annotation*

# Suppress harmless missing classes/warnings from plugins during R8 shrinking
-dontwarn ee.forgr.biometric.**
-dontwarn com.google.firebase.**
-dontwarn androidx.biometric.**
-dontwarn com.capacitorjs.plugins.**
-dontwarn org.apache.cordova.**


