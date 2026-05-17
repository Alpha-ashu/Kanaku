# Android Build Quick Reference

## Build Commands

### Debug APK (Local Testing)
```powershell
.\e2e-build.ps1 -Debug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release AAB (Play Store)
```powershell
.\e2e-build.ps1 -Release -KeystorePath .\android\finance-life-release.keystore
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Both (Debug + Release)
```powershell
.\e2e-build.ps1 -KeystorePath .\android\finance-life-release.keystore
```

## Gradle Wrapper (Direct)

From `android/` folder:

```bash
# Debug APK
./gradlew assembleDebug

# Release AAB (requires key.properties or signing config)
./gradlew bundleRelease

# Clean
./gradlew clean

# Properties check
./gradlew properties | grep -i java
```

## CI/CD

### Manual Trigger
- Go to GitHub repo  **Actions** tab
- Select **Build Android AAB (Release)** workflow
- Click **Run workflow**  choose variant (debug/release)

### Automatic Trigger
- Push to `main` or `master` branch automatically builds Release AAB

### Download Build
- Actions tab  workflow run  **Artifacts** section

## Setup (One-Time)

### GitHub Secrets (for CI)
1. Repo Settings  Secrets and variables  Actions
2. Add:
   - `ANDROID_KEYSTORE_BASE64` (base64-encoded keystore)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_PASSWORD`

### Install Dependencies
```bash
npm install
npx cap sync android
```

### Verify Java/Kotlin Settings
```bash
cd android
./gradlew properties | grep -E "sourceCompatibility|targetCompatibility|jvmTarget"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "invalid source release: 21" | Java version mismatch; check `android/build.gradle` enforcement |
| "Inconsistent JVM-target compatibility" | Kotlin jvmTarget mismatch; ensure `kotlinOptions.jvmTarget = '17'` in build files |
| Script execution error | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` (Windows) |
| Gradle daemon stuck | `cd android && ./gradlew --stop` |
| `capacitor.build.gradle` reverts to VERSION_21 | Re-apply Java 17 edit after `npx capacitor update` |

## Key Files

- **Local Build:** `e2e-build.ps1`
- **CI/CD:** `.github/workflows/build-android-aab.yml`
- **Gradle Config:** `android/build.gradle` (Java/Kotlin enforcement)
- **App Config:** `android/app/build.gradle` (signing setup)
- **Guide:** `ANDROID_BUILD_GUIDE.md` (detailed documentation)

## Useful Links

- [Capacitor Android Docs](https://capacitorjs.com/docs/android)
- [Android Gradle Plugin](https://developer.android.com/build)
- [GitHub Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
