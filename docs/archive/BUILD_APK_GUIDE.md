# Build APK/AAB for FinanceLife App

## Issue: Java Version Compatibility
The command line build is failing due to Java version conflicts. The easiest solution is to use Android Studio GUI.

## Steps to Build APK/AAB:

### Method 1: Using Android Studio (Recommended)

1. **Open Android Studio**
   ```bash
   npx cap open android
   ```

2. **Wait for Gradle Sync** to complete

3. **Build APK for Testing:**
   - Go to **Build  Build Bundle(s) / APK(s)  Build APK(s)**
   - Choose **Debug** variant
   - APK will be generated at: `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Build AAB for Play Store:**
   - Go to **Build  Generate Signed Bundle / APK**
   - Select **Android App Bundle**
   - Create or upload keystore:
     - Keystore path: `finance-life-release.keystore` (already generated)
     - Password: [the password you set earlier]
     - Alias: `finance-life`
     - Key password: [same as keystore password]
   - Select **release** variant
   - AAB will be generated at: `android/app/build/outputs/bundle/release/app-release.aab`

### Method 2: Fix Java Version Issues (Advanced)

If you want to fix the command line build:

1. **Set JAVA_HOME environment variable:**
   ```cmd
   set JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
   set PATH=%JAVA_HOME%\bin;%PATH%
   ```

2. **Update gradle.properties** (already done):
   ```
   org.gradle.java.home=C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.16.8-hotspot
   ```

3. **Try building again:**
   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleDebug  # for debug APK
   ./gradlew bundleRelease   # for release AAB
   ```

## File Locations After Build:

### Debug APK (for testing):
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Release AAB (for Play Store):
```
android/app/build/outputs/bundle/release/app-release.aab
```

### Release APK (if needed):
```
android/app/build/outputs/apk/release/app-release.apk
```

## Next Steps:

1. **Test the Debug APK** on your device first
2. **Upload AAB to Play Store** when ready for production
3. **Complete Play Store listing** with app info, screenshots, etc.

## Keystore Information:
- **File**: `finance-life-release.keystore` (already created)
- **Alias**: `finance-life`
- **Validity**: 10,000 days
- **Owner**: shaik ashraf

 **Important**: Keep your keystore file and passwords secure! You'll need them for all future app updates.
