This file describes how to use the `scripts/e2e-build.ps1` script to automate building debug APKs and signed release AABs for the Android app.

Files added:
- `scripts/e2e-build.ps1` - PowerShell script that:
  - Optionally runs `npx cap sync android` if a Capacitor config is present
  - Creates a `android/key.properties` file from input keystore path and passwords
  - Runs Gradle (via the wrapper) to assemble debug and/or bundle release for a selected flavor (`nosms` or `full`)
  - Prints output file locations and removes `key.properties` by default
- `scripts/generate-keystore.ps1` - One-command helper that runs `keytool` interactively and creates a new release keystore in `./secure/`
- `scripts/create-key-properties.ps1` - Interactive helper to create `android/key.properties` without passing passwords on the command line

Usage examples (run from repo root in PowerShell):

Build debug only:

```powershell
.\scripts\e2e-build.ps1 -Debug
```

Build debug for SMS-enabled flavor:

```powershell
.\scripts\e2e-build.ps1 -Debug -Flavor full
```

Build release only (provide keystore path and password):

```powershell
.\scripts\e2e-build.ps1 -Release -Flavor nosms -KeystorePath .\secure\finance-life-release.keystore -KeystorePassword "YourPassword" -KeyPassword "YourPassword"
```

Build both (will prompt for passwords if not provided):

```powershell
.\scripts\e2e-build.ps1 -Flavor nosms -KeystorePath .\secure\finance-life-release.keystore
```

Notes:
- The script writes `android/key.properties` temporarily; it will be removed after the build unless you pass `-KeepKeyProperties`.
- `-Flavor nosms` is the default to support Play-safe release builds without SMS permissions.
- You can pre-create signing properties safely with `./scripts/create-key-properties.ps1`.
- Output paths (after successful build):
  - No-SMS debug APK: `android/app/build/outputs/apk/nosms/debug/app-nosms-debug.apk`
  - Full debug APK: `android/app/build/outputs/apk/full/debug/app-full-debug.apk`
  - No-SMS release AAB: `android/app/build/outputs/bundle/nosmsRelease/app-nosms-release.aab`
  - Full release AAB: `android/app/build/outputs/bundle/fullRelease/app-full-release.aab`

If you need me to adapt the script to create an unsigned release APK instead, or to keep the `key.properties` file permanently, tell me which behavior you prefer.
