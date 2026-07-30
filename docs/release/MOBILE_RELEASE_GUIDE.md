# Kanaku — Mobile (Android & iOS) Architecture and Release Guide

_Last updated: 2026-07-30_

This is the single reference for the native side of Kanaku: how the Capacitor layer is
wired, what each platform can and cannot do, how to build and ship, and what is still
outstanding. It supersedes the scattered Android notes that previously lived in the
release checklist.

---

## 1. Shape of the mobile app

Kanaku is one React SPA (`frontend/`) delivered three ways:

| Target | How | Notes |
| --- | --- | --- |
| Web / PWA | Vercel, service worker | Same bundle, no native bridge |
| Android | Capacitor 8 → `android/` | Two flavors, see §4 |
| iOS | Capacitor 8 → `ios/` | Added 2026-07-30, see §5 |

There is no separate mobile codebase. The web build in `frontend/dist` is copied into
each native project by `npx cap sync`, and platform differences are handled at runtime
through `Capacitor.getPlatform()` / `Capacitor.isNativePlatform()`.

### 1.1 The one rule that matters most

> **Capacitor plugins must be declared in the root `package.json`.**

The Capacitor CLI builds its native plugin list from the `dependencies` +
`devDependencies` of the `package.json` that sits **next to `capacitor.config.json`** —
that is the repo root, not `frontend/`. A plugin declared only in `frontend/package.json`
type-checks, bundles, and imports fine, but `cap sync` never sees it, so no native code is
linked and every call to it rejects at runtime on device.

This repo shipped in exactly that state up to v8: ten plugins imported by the app, zero
compiled into the APK. `android/capacitor.settings.gradle` contained a single
`capacitor-android` entry and `app/capacitor.build.gradle` had an empty `dependencies {}`
block. See §8 for what that broke.

Both files are generated — never edit them by hand. If they look empty, the root
`package.json` is the thing to fix.

**Keep the plugin versions in root `package.json` and `frontend/package.json` identical.**
The root entry drives the native build; the frontend entry keeps the TS imports honest.
npm workspaces hoist a single copy when the versions agree.

---

## 2. Native capabilities by platform

| Capability | Web | Android | iOS | Implementation |
| --- | :---: | :---: | :---: | --- |
| Offline-first data (Dexie) | ✅ | ✅ | ✅ | `lib/database.ts` |
| PIN lock / auto-lock | ✅ | ✅ | ✅ | `contexts/SecurityContext.tsx` + `@capacitor/preferences` |
| Haptics | — | ✅ | ✅ | `@capacitor/haptics` |
| Status bar theming | — | ✅ | ✅ | `@capacitor/status-bar` (colour is Android-only) |
| Splash screen | — | ✅ | ✅ | `@capacitor/splash-screen` |
| Keyboard inset handling | — | ✅ | ✅ | `@capacitor/keyboard` → `--keyboard-height` |
| Local notifications | ✅¹ | ✅ | ✅ | `@capacitor/local-notifications` |
| Notification tap → deep link | ✅ | ✅ | ✅ | `lib/nativeDeepLinks.ts` |
| Hardware back button | — | ✅ | n/a | `@capacitor/app` `backButton` |
| File export / share | ✅ | ✅ | ✅ | `lib/nativeFiles.ts` (Filesystem + Share) |
| Receipt camera capture | ✅ | ✅ | ✅ | `<input capture="environment">` via the WebView file chooser |
| Microphone (waveform) | ✅ | ✅ | ✅ | `getUserMedia` + `RECORD_AUDIO` / `NSMicrophoneUsageDescription` |
| **Voice speech-to-text** | ✅ | ✅ | ⚠️ | `services/speechRecognitionAdapter.ts` — see §7.1 |
| **SMS auto-detection** | ❌ | ✅² | ❌ | Custom `SmsDetectionPlugin` — see §4.1, §7.2 |
| Biometric unlock | — | ✅ | ✅ | `services/biometricAuthService.ts` — see §7.3 |
| Push notifications | — | ⚠️ | ⚠️ | `services/pushNotificationService.ts` — see §7.4 |

¹ Browser Notification API. ² `full` flavor only.
⚠️ = implemented but gated on something outside the codebase — see the linked section.

---

## 3. Toolchain — pinned, and why

| Tool | Version | Why pinned |
| --- | --- | --- |
| Capacitor | 8.4.x | — |
| Android Gradle Plugin | **8.13.0** | Capacitor 8's plugin modules declare AGP 8.13.0 and apply `kotlin-android`. Under AGP 9 they fail to configure: `Cannot add extension with name 'kotlin'`, plus a spurious missing-`compileSdk` error. |
| Gradle | **8.14.3** | Ships with the Capacitor 8 template; matches AGP 8.13.0. |
| JDK | **21** | Plugin modules declare `kotlin { jvmToolchain(21) }`. JDK 17 cannot resolve a toolchain for them. |
| compileSdk / targetSdk | 36 | — |
| minSdk | 24 | — |
| iOS deployment target | 15.0 | Capacitor 8 minimum. |

**Do not bump AGP/Gradle ahead of Capacitor.** The project previously ran AGP 9.2.1 /
Gradle 9.6.1 without any symptom — only because no plugin subproject was in the build. The
moment plugins were linked, every one of them failed to configure.

`android/build.gradle` no longer force-rewrites subproject Java versions. It used to pin
every module to Java 17 in an `afterEvaluate` walk, which is a jvmTarget mismatch against
the plugins' Kotlin toolchain 21.

---

## 4. Android

### 4.1 Product flavors

The app has one flavor dimension, `smsSupport`:

| Flavor | Application id | SMS | Used for |
| --- | --- | :---: | --- |
| `full` | `com.kanaku.app` | ✅ | Direct download / sideload |
| `nosms` | `com.kanaku.app.nosms` | ❌ | **Google Play upload** |

Google Play's Permissions Declaration policy restricts `READ_SMS` / `RECEIVE_SMS` to apps
whose *core* function is SMS handling. A finance app reading bank alerts does not qualify,
hence the split.

Manifest layout:

- `app/src/main/AndroidManifest.xml` — everything common. Includes `RECORD_AUDIO`,
  `MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS`, `INTERNET`, the `kanaku://` deep-link
  filter, and the `SmsReceiver` declaration gated on `${smsReceiverEnabled}`.
- `app/src/full/AndroidManifest.xml` — **only** `READ_SMS` + `RECEIVE_SMS`.
- `app/src/nosms/AndroidManifest.xml` — `tools:node="remove"` guards for the SMS
  permissions and the receiver.

Flavor source sets are mutually exclusive, so `nosms` never merges `full`'s manifest. The
`tools:node="remove"` entries are belt-and-braces in case a library ever injects them.

Verify before every Play upload:

```bash
cd android && ./gradlew processNosmsReleaseMainManifest
grep -o 'android:name="android.permission.[A-Z_]*"' \
  app/build/intermediates/merged_manifest/nosmsRelease/*/AndroidManifest.xml | sort -u
```

`READ_SMS` and `RECEIVE_SMS` must not appear.

### 4.2 Why `RECORD_AUDIO` is required but `CAMERA` is not

Capacitor's `BridgeWebChromeClient.onPermissionRequest` answers a WebView
`AUDIO_CAPTURE` request by requesting `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` at runtime.
Android resolves a runtime request for an *undeclared* permission to DENIED immediately,
with no prompt — so `getUserMedia({ audio: true })` failed silently on device before these
were declared.

The receipt scanner's `<input capture="environment">` is served by the system camera app
through `ACTION_IMAGE_CAPTURE`, which needs no `CAMERA` permission. Declaring one would
actually make that intent throw, so the app deliberately does not request it.

### 4.3 Building

```bash
npm run mobile:build:android      # vite build + cap sync android
npm run mobile:aab:play           # nosms release AAB (Play)
npm run mobile:aab:full           # full release AAB (sideload)
```

Outputs — note the **per-flavor** paths; there is no `app-release.aab`:

```text
android/app/build/outputs/bundle/nosmsRelease/app-nosms-release.aab
android/app/build/outputs/bundle/fullRelease/app-full-release.aab
android/app/build/outputs/mapping/<flavor>Release/mapping.txt
```

Upload `mapping.txt` to the Play Console or release crash reports stay obfuscated.

Release signing reads `android/key.properties` (git-ignored; see
`key.properties.example`). `app/build.gradle` fails the build early with a clear message if
a release task runs without it.

### 4.4 SMS detection flow (`full` only)

```text
SmsReceiver (broadcast)
  └→ SmsTransactionParser.parse()        native regex/heuristics
      ├→ SmsDetectionStore               queued when the app is not running
      ├→ SmsNotificationHelper           system notification, tap → kanaku://sms-transaction?sourceSmsId=…
      └→ SmsDetectionPlugin.notifyListeners("smsTransactionDetected")
           └→ services/smsTransactionDetectionService.ts
                ├→ dedupe against db.transactions
                ├→ category suggestion, account match
                └→ db.smsTransactions + in-app notification
```

The native side only knows the platform SMS id. `lib/nativeDeepLinks.ts` resolves
`sourceSmsId` → local Dexie record id before navigating; if the JS layer has not drained
the queue yet it opens a blank add-transaction form rather than a broken prefilled one.

---

## 5. iOS

Added 2026-07-30. Capacitor 8 uses **Swift Package Manager**, so there is no CocoaPods
step and no `Podfile` — plugin linkage lives in `ios/App/CapApp-SPM/Package.swift`.

```text
ios/
  App/
    App.xcodeproj/            bundle id com.kanaku.app, MARKETING_VERSION 1.0.0, build 8
    App/
      Info.plist              purpose strings, kanaku:// URL type, status bar style
      AppDelegate.swift       Capacitor template (deep links + universal links already proxied)
      Assets.xcassets/        ⚠️ AppIcon is still the Capacitor placeholder — see §6
    CapApp-SPM/Package.swift  generated plugin linkage
```

### 5.1 Purpose strings

`Info.plist` declares `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
`NSPhotoLibraryAddUsageDescription`, and `NSMicrophoneUsageDescription`. Every one is
reachable from shipping UI. Without them App Review rejects the binary and WKWebView fails
the underlying call silently instead of prompting.

`UIViewControllerBasedStatusBarAppearance` is `true`, which the `@capacitor/status-bar`
plugin requires.

### 5.2 Windows caveat — `Package.swift` path separators

`npx cap add ios` / `cap sync ios` run on Windows emit **backslash** paths into
`Package.swift` (`..\..\..\node_modules\@capacitor\app`). SPM cannot resolve those on
macOS, so an iOS project synced from Windows fails to build for everyone else.

`scripts/normalize-spm-paths.mjs` rewrites them to forward slashes (valid on every
platform) and is chained into the npm scripts, so `npm run cap:sync`,
`npm run cap:sync:ios` and `npm run mobile:build:ios` are all safe from Windows.

If you call the Capacitor CLI directly (`npx cap sync ios`), run `npm run cap:fix:spm`
afterwards before committing. Syncing on macOS produces correct paths either way.

### 5.3 Building

```bash
npm run mobile:build:ios     # vite build + cap sync ios
npm run cap:open:ios         # opens Xcode (macOS only)
```

CI (`.github/workflows/build-ios.yml`) builds for the simulator on `macos-15` with
`CODE_SIGNING_ALLOWED=NO`, and asserts that plugins were actually linked into
`Package.swift`. Producing a signed `.ipa` needs an Apple Developer team, a distribution
certificate and a provisioning profile — none of which exist as repo secrets yet (§6).

---

## 6. Outstanding before an App Store / Play submission

| # | Item | Platform | Owner action |
| --- | --- | --- | --- |
| B-1 | **App icon is the Capacitor placeholder** | iOS | Supply a 1024×1024 **PNG, no alpha**, at `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`. The largest brand raster in the repo is 192×192 (`android/.../mipmap-xxxhdpi/ic_launcher.png`); `play-store-assets/icon_512x512.png` is **actually a JPEG** despite its name, so neither is usable as-is. |
| B-2 | **Apple signing secrets** | iOS | Add team id, distribution cert and provisioning profile; then extend `build-ios.yml` with archive + export. |
| B-3 | `ITSAppUsesNonExemptEncryption` not declared | iOS | Deliberately omitted — it is a legal export-compliance declaration. Set it in `Info.plist` once counsel confirms, or answer the prompt per upload. |
| B-4 | Splash assets are Capacitor defaults | iOS | Replace `Assets.xcassets/Splash.imageset/*`. |
| B-5 | Play listing AAB is stale | Android | The v8 AAB previously committed to the repo predates the plugin fix and is functionally broken on device. Rebuild from CI before the next upload. |
| B-6 | **Firebase / APNs credentials for push** | Both | Push is fully wired end-to-end but delivers nothing until: `android/app/google-services.json` (Firebase console), an APNs key + the Push Notifications capability on the Apple team, and `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` on the server. See §7.4. |
| B-7 | iOS voice needs a CocoaPods project | iOS | `@capacitor-community/speech-recognition` ships no `Package.swift`, so it does not link into the SPM iOS project. See §7.1. |

---

## 7. Known platform limitations

### 7.1 Voice speech-to-text — works on Android, not yet on iOS

`services/speechRecognitionAdapter.ts` presents one interface over two engines:

| Platform | Engine | Status |
| --- | --- | --- |
| Web | `window.SpeechRecognition` / `webkitSpeechRecognition` | ✅ |
| Android | `@capacitor-community/speech-recognition` → `SpeechRecognizer` | ✅ |
| iOS | same plugin → `SFSpeechRecognizer` | ⚠️ not linked |

The Web Speech API does not exist in either Capacitor WebView, which is why voice entry
used to dead-end on device with "Speech recognition not supported in this browser".

**Why iOS is still pending.** Capacitor 8's iOS project uses Swift Package Manager, and
this plugin (7.0.1, the latest) ships only a CocoaPods podspec with the pre-SPM
`ios/Plugin/` layout — no `Package.swift`. `cap sync` reports it and links 12 of the 13
plugins on iOS. Two ways out, both an owner decision:

1. **Switch the iOS project to CocoaPods** — `npx cap add ios --packagemanager CocoaPods`
   (needs macOS + `pod install`, and re-applying the Info.plist / entitlements /
   AppDelegate edits). Links all 13, but CocoaPods is the legacy path in the Capacitor
   ecosystem.
2. **Wait for the plugin to add SPM support**, or vendor a `Package.swift` for it via
   `patch-package` (this repo already has patch-package wired).

Until then the adapter degrades exactly as before on iOS — `available()` returns false and
the UI offers the keyboard. No regression, and no code change needed when it does land.

The language defaults to **en-IN**, not en-US: the parser expects rupee amounts, Hinglish
merchant names and Indian number formats.

### 7.2 SMS auto-detection is Android-only and always will be

iOS has no public API for reading the SMS inbox. `isSmsDetectionSupported()` already
returns false on any non-Android platform, so the UI hides the feature. Do not surface it
in iOS marketing copy.

### 7.3 Biometric unlock

`services/biometricAuthService.ts` + `@capgo/capacitor-native-biometric`.

**Biometrics do not bypass the PIN.** They unlock a copy of the PIN held in the platform's
hardware-backed store, and that PIN then runs through the *existing* unlock path:

```text
biometric prompt → getSecureCredentials() → pinService.verifyPin({ pin })
                                          → verifyPIN(pin) → encryption key
```

The server-side PIN check still runs and the local encryption key is still derived from the
PIN. Biometrics replace *typing*, not *verification*.

Design decisions worth keeping:

- The credential is stored with `AccessControl.BIOMETRY_CURRENT_SET`, **not** the plugin's
  `NONE` default (which stores credentials readable with no authentication at all —
  unacceptable for a PIN guarding financial data). It is read with `getSecureCredentials()`,
  whose prompt is cryptographically bound to the decryption key, so there is no code path
  that can retrieve the PIN without a live biometric match. One prompt, not two.
- `BIOMETRY_CURRENT_SET` invalidates the credential if someone later enrols a new
  face/fingerprint on the device. A legitimate re-enrolment invalidates it too — handled by
  turning the feature off and falling back to the PIN, with an explanatory message.
- Enrolment is offered **once, immediately after a verified PIN entry** — the only moment
  the app holds a known-good PIN without asking the user to retype it. "Don't ask again" is
  respected; the Settings toggle re-arms it.
- The credential is destroyed whenever PIN keys are (`clearLocalAuthPresentationState(false)`
  — i.e. user switch) and re-bound on PIN change (`syncBiometricPin`). Without the latter,
  biometrics would keep returning the old PIN and fail server verification every time.

### 7.4 Push notifications — wired end-to-end, waiting on credentials

The **backend was already complete** before this work: `Device.fcmToken`/`apnsToken`
columns, `PUT /devices/:deviceId/tokens`, a notification outbox with a `push` channel,
Firebase Admin config, retry/backoff, and dead-token cleanup
(`backend/src/workers/index.ts`). What was missing was the client: nothing ever registered,
so every queued push resolved to `no_device`.

`services/pushNotificationService.ts` closes the loop — permission → registration → token →
`POST /devices` + `PUT /devices/:id/tokens` → tap routes through the same
`lib/nativeDeepLinks.ts` as local notifications. Foreground pushes are mirrored into the
in-app notification centre, because the OS draws no banner while the app is open.
Registration runs only after PIN unlock, and `teardownPushNotifications()` detaches the
token on sign-out (before the access token is cleared, or the deactivate call would 401).

**Still required to actually deliver anything** (B-6):

| Where | What |
| --- | --- |
| `android/app/google-services.json` | From the Firebase console. `app/build.gradle` already applies the plugin conditionally. |
| Apple | APNs key + Push Notifications capability. `App.entitlements` (`aps-environment`) and the `AppDelegate` APNs forwarding are in place. |
| Server env | `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`. |

Without these, registration fails gracefully, `registrationError` is logged, and the app is
otherwise unaffected.

---

## 8. What the 2026-07-30 audit fixed

Recorded because several of these were silent — the app built, installed and launched with
all of them present.

| # | Defect | Impact on device | Fix |
| --- | --- | --- | --- |
| 1 | **Zero Capacitor plugins linked into the native builds.** Plugins were declared only in `frontend/package.json`; the CLI reads the root `package.json`. | Every native call rejected: PIN storage, haptics, status bar, splash, keyboard, local notifications, and `@capacitor/app`. Because the old `setupNativeFeatures()` shared one `try/catch`, the first rejection (`StatusBar`) skipped the rest — so the **hardware back button was never registered at all**. | Declared the 10 plugins in root `package.json`; `cap sync` now links all 10 on both platforms. |
| 2 | AGP 9.2.1 / Gradle 9.6.1 incompatible with Capacitor 8 plugin modules. | Latent — surfaced the moment plugins were linked; every plugin subproject failed to configure. | Pinned AGP 8.13.0 / Gradle 8.14.3 / JDK 21; removed the subproject Java-17 rewrite. |
| 3 | `READ_SMS` / `RECEIVE_SMS` missing from the merged manifest. | `requestPermissionForAlias("sms")` auto-denied with no prompt; SMS auto-detection silently did nothing in the `full` flavor. | Moved to a `full`-only manifest so Play's `nosms` build stays clean. |
| 4 | `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` never declared. | Mic permission auto-denied; voice waveform and mic pre-check failed. | Declared in the main manifest; `NSMicrophoneUsageDescription` on iOS. |
| 5 | File export used a blob URL + `<a download>`. | Report/statement exports silently produced no file in either WebView. | `lib/nativeFiles.ts` writes to Documents and opens the system share sheet; `download.ts` delegates on native via a lazy import so the web bundle is unaffected. |
| 6 | Notification taps had nowhere to go. | Tapping a notification only raised the app; the SMS alert dead-ended. | `lib/nativeDeepLinks.ts` handles `appUrlOpen`, `localNotificationActionPerformed` and cold-start launch URLs; `kanaku://` registered on both platforms; `SmsNotificationHelper` now carries the id. |
| 7 | `StatusBar.setBackgroundColor` is Android-only. | Would have thrown on iOS and aborted the rest of native setup. | Per-platform guards; each concern has its own `try/catch`. |
| 8 | CI uploaded `bundle/release/app-release.aab`. | That path does not exist for a flavored build — the artifact step uploaded nothing and the summary always reported no AAB. | Per-flavor upload paths, `if-no-files-found: error`, plus mapping files. |
| 9 | No iOS platform at all. | `capacitor.config.json` had an `ios` block nothing consumed. | Full `ios/` project, purpose strings, deep links, scripts, CI. |
| 10 | Splash never explicitly hidden; keyboard plugin unused. | Brand screen lingered; bottom nav sat on top of the keyboard. | `SplashScreen.hide()` when interactive; `--keyboard-height` + `body.keyboard-open`. |

### Verification performed

All run on 2026-07-30, the Android builds from cold caches.

| Check | Result |
| --- | --- |
| `tsc --noEmit` (frontend) | ✅ clean |
| `vite build` | ✅ succeeded |
| `vitest run` | ✅ **169/169** passing (22 files) |
| `cap sync android` / `cap sync ios` | ✅ 10 plugins linked on each |
| `gradlew assembleFullDebug` | ✅ APK built (262 tasks) |
| `gradlew bundleRelease` (cold) | ✅ both AABs + both `mapping.txt` (507 tasks) |
| Merged manifest, `full` | ✅ `READ_SMS`, `RECEIVE_SMS`, `RECORD_AUDIO`, `kanaku://` present |
| Merged manifest, `nosms` | ✅ no SMS permissions, no `SmsReceiver` |
| Plugin linkage in artifact | ✅ `RECEIVE_BOOT_COMPLETED` / `WAKE_LOCK` merged in from `@capacitor/local-notifications` |

**iOS has not been compiled.** No macOS machine was available; the project, its plugin
linkage and CI are in place, but the first `xcodebuild` run is unverified. Treat
`build-ios.yml` succeeding as the real gate.

---

## 9. Day-to-day commands

```bash
# Build web + sync both platforms
npm run mobile:build

# Per platform
npm run mobile:build:android
npm run mobile:build:ios

# Run on a device/emulator
npm run mobile:run:android
npm run mobile:run:ios          # macOS only

# Release bundles
npm run mobile:aab:play         # Play (nosms)
npm run mobile:aab:full         # sideload (full)

# Diagnose native setup
npm run cap:doctor

# Caches
npm run clean                   # dist + vite + turbo
npm run clean:mobile            # gradle + xcode build dirs
npm run clean:all
```

After pulling changes that touch plugins, always re-run `npx cap sync` — the generated
gradle/SPM files are not committed in a state you can rely on across dependency changes.

---

## 10. Adding a Capacitor plugin — checklist

1. `npm i @capacitor/<plugin> -w frontend`
2. **Add the same version to the root `package.json` `dependencies`** ← the step that is
   easy to miss and silently breaks the native build
3. `npm install` at the root
4. `npx cap sync`
5. Confirm the CLI prints the plugin in its "Found N Capacitor plugins" list for **both**
   platforms
6. Android: add any required `uses-permission` to `app/src/main/AndroidManifest.xml`
   (or a flavor-specific manifest if it is Play-restricted)
7. iOS: add the matching `NS*UsageDescription` to `Info.plist`
8. Rebuild both platforms before assuming it works — a clean type-check proves nothing
   about native linkage
9. **Check the plugin ships a `Package.swift`.** Capacitor 8's iOS project uses SPM.
   A CocoaPods-only plugin syncs without error on Android, prints a
   `does not have a Package.swift` warning, and is silently absent from the iOS build —
   this is exactly how `@capacitor-community/speech-recognition` ended up Android-only
   (§7.1)
