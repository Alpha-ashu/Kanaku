# Android Release Checklist

Use this checklist before generating production APK/AAB.

## 1. Prerequisites
- Java 17 installed and `JAVA_HOME` set.
- Android SDK installed (API 36 and build tools 36.0.0).
- Node.js 18+ installed.
- A secure release keystore stored outside the repository.

## 2. Secure Signing Setup
- Generate keystore (first time only): `./scripts/generate-keystore.ps1`
- Preferred: run `./scripts/create-key-properties.ps1` and follow prompts.
- Alternative: copy `android/key.properties.example` to `android/key.properties` and fill values manually.
- Confirm `android/key.properties` is ignored by git.
- Confirm `*.keystore` / `*.jks` are ignored by git.

## 3. Sync Web and Native Layers
```powershell
npm install
npm run build
npx cap sync android
```

## 4. Build in Android Studio (GUI)
- Open project: `npx cap open android`.
- Wait for Gradle sync to finish.
- Debug APK:
  - `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`.
  - Use variant `fullDebug` for SMS-enabled build.
  - Use variant `nosmsDebug` for Play-safe no-SMS build.
- Release AAB/APK:
  - `Build` -> `Generate Signed Bundle / APK`.
  - Select `Android App Bundle` (recommended) or `APK`.
  - Use variant `fullRelease` for SMS-enabled build.
  - Use variant `nosmsRelease` for no-SMS release build.
  - Select your keystore.

## 5. Build by CLI (Optional)
```powershell
./scripts/generate-keystore.ps1
./scripts/create-key-properties.ps1
cd android
.\gradlew.bat clean assembleFullDebug --no-daemon
.\gradlew.bat clean assembleNosmsDebug --no-daemon
.\gradlew.bat bundleFullRelease --no-daemon
.\gradlew.bat bundleNosmsRelease --no-daemon
```

## 6. Artifact Locations
- Full debug APK: `android/app/build/outputs/apk/full/debug/app-full-debug.apk`
- No-SMS debug APK: `android/app/build/outputs/apk/nosms/debug/app-nosms-debug.apk`
- Full release AAB: `android/app/build/outputs/bundle/fullRelease/app-full-release.aab`
- No-SMS release AAB: `android/app/build/outputs/bundle/nosmsRelease/app-nosms-release.aab`

## 7. Compliance Checks
- Verify Play Store eligibility for SMS permissions (`READ_SMS`, `RECEIVE_SMS`) before publishing.
- If not eligible, publish `nosmsRelease` flavor.

## 8. Backend and Data Security Gate (Required)
- Run critical backend security smoke tests:
  - `npm --prefix backend run test:security:critical`
- Confirm the command is green before release (security, transactions, bills-security suites all pass).
- Apply core finance RLS hardening migration in Supabase SQL Editor:
  - `supabase/migrations/010_enforce_rls_core_finance_tables.sql`
- Run post-migration verification query:
  - `supabase/migrations/010_verify_rls_core_finance_tables.sql`
- Confirm `verification_passed = true` for all required tables in the verification summary.

## 9. Rollback Steps
- If a release build fails, run:
```powershell
cd android
.\gradlew.bat --stop
.\gradlew.bat clean
```
- Re-run `npx cap sync android` and rebuild.
- If signing issues persist, regenerate `android/key.properties` from the example and retry.
