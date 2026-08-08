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

# ── Capacitor plugin classes ──────────────────────────────────────────────────
# Each @capacitor/* plugin registers a Java/Kotlin class via reflection.
# Stripping them causes "Plugin not found" errors on device.
-keep class * extends com.getcapacitor.Plugin { *; }

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
