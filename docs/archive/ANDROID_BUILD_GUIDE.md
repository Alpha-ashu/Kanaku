# Expense Tracker Android Build Setup & CI/CD Guide

This document explains the complete end-to-end Android build automation system set up for the Expense Tracker project.

## Overview

The project includes:
1. **Local E2E Build Script** (`e2e-build.ps1`)  automate debug APK and signed release AAB builds on your machine
2. **GitHub Actions CI/CD** (`build-android-aab.yml`)  automatic builds on every push to main/master or manual workflow dispatch
3. **Gradle Configuration**  Java 17 / Kotlin jvmTarget 17 enforcement to ensure consistent compilation
4. **Keystore & Signing**  automated signing for release builds using GitHub Secrets

---

## Quick Start

### Local Debug Build (No Signing)

```powershell
# From repo root in PowerShell
.\e2e-build.ps1 -Debug
```

Expected output:
```
Debug APK: K:\Project\...\android\app\build\outputs\apk\debug\app-debug.apk
Done.
```

### Local Release Build (Signed AAB)

```powershell
# From repo root in PowerShell
.\e2e-build.ps1 -Release -KeystorePath .\android\finance-life-release.keystore
```

The script will prompt for keystore password and key password (entered as hidden input).

Or provide passwords inline (less secure, use only for testing):

```powershell
.\e2e-build.ps1 -Release `
  -KeystorePath .\android\finance-life-release.keystore `
  -KeystorePassword "your-password" `
  -KeyPassword "your-password"
```

Expected output:
```
Release AAB: K:\Project\...\android\app\build\outputs\bundle\release\app-release.aab
Done.
```

---

## CI/CD Setup (GitHub Actions)

### 1. Store Secrets in GitHub Repository

Navigate to your GitHub repository settings:
- **Settings**  **Secrets and variables**  **Actions**  **New repository secret**

Add the following secrets:

| Secret Name | Value | Description |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file | Encode your `finance-life-release.keystore` as base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Your keystore password | Plain text password for the keystore |
| `ANDROID_KEY_PASSWORD` | Your key password | Plain text password for the key alias |

#### How to encode the keystore file:

**On Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes(".\android\finance-life-release.keystore")) | Set-Clipboard
```

Then paste into the GitHub secret.

**On macOS/Linux:**
```bash
base64 -i ./android/finance-life-release.keystore | pbcopy  # macOS
# or
base64 -w 0 ./android/finance-life-release.keystore | xclip -selection clipboard  # Linux
```

### 2. Workflow Triggers

The workflow will automatically:
- **Build Release AAB** on every push to `main` or `master` branch
- **Manual Trigger** via GitHub Actions UI to build debug APK or release AAB on demand

### 3. Accessing Build Artifacts

After a successful build:
1. Go to **Actions** tab in your GitHub repository
2. Click on the workflow run (commit message or manual trigger name)
3. Scroll to **Artifacts** section
4. Download:
   - `app-release-aab` (30-day retention)
   - `app-debug` (7-day retention)

---

## Project Structure & Key Files

```
android/
 app/
    build.gradle               Added keystore signing config
    capacitor.build.gradle     Auto-generated (watch for VERSION_21!)
 build.gradle                   Java/Kotlin 17 enforcement for all modules
 capacitor-cordova-android-plugins/
    build.gradle               Updated to Java 17
 gradlew, gradlew.bat           Gradle wrapper

node_modules/@capacitor/*/android/build.gradle
 @capacitor/android/capacitor/
 @capacitor/app/android/
 @capacitor/device/android/
 @capacitor/filesystem/android/
 @capacitor/haptics/android/
 @capacitor/keyboard/android/
 @capacitor/local-notifications/android/
 @capacitor/preferences/android/
 @capacitor/splash-screen/android/
 @capacitor/status-bar/android/
     build.gradle               All updated to Java 17 & Kotlin jvmTarget 17

.github/workflows/
 build-android-aab.yml          CI/CD automation

e2e-build.ps1                       Local PowerShell build automation
README_E2E_BUILD.md                 Usage guide for e2e script
.patchpackagerc.json                Config for patch-package
patches/                            Patches for node_modules (future use)
```

---

## Java Version & Compilation Targets

### The Problem
The Capacitor plugin modules (under `node_modules/@capacitor/*/android`) declare `JavaVersion.VERSION_21` as their compile target, but the project's local JDK is Java 17. This causes a mismatch:
- Java compilation fails with "invalid source release: 21"
- Kotlin compilation fails with "Inconsistent JVM-target compatibility"

### The Solution
We enforce Java 17 and Kotlin jvmTarget 17 across the **entire** Gradle project (root + all subprojects):

**In `android/build.gradle`:**
```groovy
tasks.withType(JavaCompile).configureEach {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

subprojects {
    afterEvaluate { proj ->
        try {
            if (proj.extensions.findByName('android')) {
                proj.android.compileOptions.sourceCompatibility = JavaVersion.VERSION_17
                proj.android.compileOptions.targetCompatibility = JavaVersion.VERSION_17
            }
        } catch (ignored) {}

        proj.tasks.withType(JavaCompile).configureEach {
            sourceCompatibility = JavaVersion.VERSION_17
            targetCompatibility = JavaVersion.VERSION_17
        }

        try {
            proj.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
                kotlinOptions.jvmTarget = '17'
            }
        } catch (ignored) {}
    }
}
```

This **overrides** module-level settings from node_modules without editing the files permanently.

### Long-Term Considerations

**Option A (Current):** Keep the enforcement in `android/build.gradle`
-  Works with local JDK 17
-  No persistent node_modules edits (but we did edit them for clarity)
-   Will need to re-apply if Capacitor major version updates

**Option B (Future):** Upgrade local JDK to 21
-  No overrides needed
-  Plugin defaults work as-is
-   Requires team/CI environment update

**Option C (Recommended for Teams):** Use Gradle Java Toolchains
-  Clean, maintainable, official Android/Gradle approach
-  Works with any JDK version
-   Requires AGP 8.0+ (already satisfied)

For now, **Option A is active and working**. Transition to Option C when convenient.

---

## Important Notes

### `capacitor.build.gradle` File
This file is **auto-generated** by `npx capacitor update`. After running that command, it may reset `compileOptions` to `JavaVersion.VERSION_21`. If the build fails after a Capacitor update:

**Quick fix:**
```powershell
# Edit android/app/capacitor.build.gradle and change:
# sourceCompatibility JavaVersion.VERSION_21  JavaVersion.VERSION_17
# targetCompatibility JavaVersion.VERSION_21  JavaVersion.VERSION_17
```

Or run:
```bash
npx capacitor update && npx patch-package --create-patch @capacitor/app  # future: apply patches automatically
```

### Keystore Security
- **Never commit** `key.properties` or keystore files to source control
- Store keystore file in a secure, offline location
- Use GitHub Secrets for CI/CD passwords (they're encrypted at rest and masked in logs)
- Rotate credentials periodically

### Build Artifacts Retention
- Debug APK: 7 days (testing only)
- Release AAB: 30 days (for Play Store submission and rollback)

---

## Troubleshooting

### Build fails with "invalid source release: 21"
**Cause:** Java compilation target mismatch  
**Solution:** Ensure `android/build.gradle` has the Java 17 enforcement block above

### Build fails with "Inconsistent JVM-target compatibility"
**Cause:** Kotlin jvmTarget mismatch  
**Solution:** Ensure Kotlin task configuration is in `android/build.gradle`

### `e2e-build.ps1` not found or execution error
**Cause:** Execution policy or script not in root  
**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# or run from repo root with full path:
& '.\e2e-build.ps1' -Debug
```

### Gradle daemon issues
**Cause:** Stale daemon process  
**Solution:**
```bash
cd android
./gradlew --stop
./gradlew clean assembleDebug
```

### GitHub Actions secret not recognized
**Cause:** Secret name mismatch or not pushed to main branch  
**Solution:**
1. Verify secret names match exactly (case-sensitive)
2. Ensure secrets are set in the **same repository** (not forked)
3. Push changes and re-run workflow

---

## Next Steps

1. **Set up GitHub Secrets** (see CI/CD Setup above)
2. **Test local builds:**
   ```powershell
   .\e2e-build.ps1 -Debug
   ```
3. **Test CI/CD:**
   - Push a commit to `main`/`master`
   - Check GitHub Actions for build status
   - Download artifact from Actions tab
4. **(Optional) Test release build locally:**
   ```powershell
   .\e2e-build.ps1 -Release -KeystorePath .\android\finance-life-release.keystore
   ```

---

## Additional Commands

### Clean build cache
```bash
cd android
./gradlew clean
```

### Sync Capacitor plugins
```bash
npx cap sync android
```

### Open Android Studio
```bash
npx cap open android
```

### Check Gradle properties
```bash
cd android
./gradlew properties | grep -i "java\|kotlin"
```

---

## Support & Resources

- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Android Gradle Plugin Guide](https://developer.android.com/build)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Gradle Java Toolchains](https://docs.gradle.org/current/userguide/toolchains.html)

---

**Last Updated:** February 11, 2026  
**Project:** Finance Life - Expense Tracker (Android)
