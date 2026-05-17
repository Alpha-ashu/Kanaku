# Android Build System Architecture

## System Overview

```

           EXPENSE TRACKER ANDROID BUILD SYSTEM                  


                          
                             Developer  
                              Machine   
                          
                                 
                    
                                             
                     
             Local Build             Git Push to    
               (Windows)             main/master    
                     
                                             
             
           e2e-build.ps1           GitHub Actions    
           (PowerShell)            (Ubuntu Linux)    
             
                                             
             
          1. npx cap sync          1. Setup JDK 17   
          2. Create keystore       2. npm install    
          3. gradle build          3. npx cap sync   
          4. Clean up .props       4. gradle build   
              5. Upload artifact
                                    
                      
           Debug APK Created     
           Ready for Test       Release AAB Created
                                   Ready for Store 
            
                                             
                    
                             
                    
                      Download Artifact 
                      from GitHub       
                    
```

---

## Build Pipeline Flow

### Local Build (Developer)

```
START
  
   .\e2e-build.ps1 -Debug
     
      Sync Capacitor plugins (optional)
     
      Check gradle wrapper exists
     
      Run: ./gradlew assembleDebug
        
         Read android/build.gradle
           Enforce: Java 17 + Kotlin jvmTarget 17
        
         Compile Java sources
        
         Compile Kotlin sources
        
         Package resources
        
         Assemble APK
     
      Output: app-debug.apk
  
   Report: APK location
  
   END (Success)
```

### Local Release Build (Developer + Keystore)

```
START
  
   .\e2e-build.ps1 -Release -KeystorePath ...
     
      Sync Capacitor plugins (optional)
     
      Validate keystore file exists
     
      Prompt for passwords (masked input)
     
      Create android/key.properties
         storeFile, storePassword, keyAlias, keyPassword
     
      Run: ./gradlew bundleRelease
        
         Read android/build.gradle
           Enforce: Java 17 + Kotlin jvmTarget 17
        
         Compile all sources
        
         Read android/app/build.gradle
           Read key.properties  Configure signing
        
         Sign bundle with keystore
        
         Create AAB (Android App Bundle)
     
      Delete android/key.properties (cleanup)
     
      Output: app-release.aab
  
   Report: AAB location
  
   END (Success)
```

### CI/CD Build (GitHub Actions)

```
START (Push to main/master)
  
   GitHub Actions triggered
     
      Checkout code
     
      Setup Java 17
     
      Setup Android SDK 36
     
      npm install
         (auto-apply patches via postinstall.js)
     
      npx cap sync android
     
      Decode ANDROID_KEYSTORE_BASE64 from secrets
         Write to: android/finance-life-release.keystore
     
      Create android/key.properties from secrets
         ANDROID_KEYSTORE_PASSWORD
         ANDROID_KEY_PASSWORD
         keyAlias = finance-life
     
      Run: ./gradlew bundleRelease
        
         (Same as local: Java 17, Kotlin 17 enforcement)
        
         Output: app-release.aab
     
      Upload artifact (30-day retention)
     
      Delete keystore & key.properties (cleanup)
     
      Generate build summary
     
      Report status
  
   END (Success)

ACTION: Download artifact from GitHub Actions tab
```

---

## Gradle Build Configuration Stack

```
Root Project (android/)

 android/build.gradle
  
   Java 17 & Kotlin jvmTarget 17 enforcement
     Applies to all subprojects via afterEvaluate
  
   Repositories (google, mavenCentral)
  
   Capacitor plugin includes (in capacitor.settings.gradle)

 app/ (subproject)
  
   android/app/build.gradle
    
     Load key.properties if exists
    
     signingConfigs { release { ... } }
    
     buildTypes { release { signingConfig ... } }
    
     Dependencies: Capacitor plugins
  
   android/app/capacitor.build.gradle (auto-generated)
      compileOptions: Java 17

 capacitor-cordova-android-plugins/ (subproject)
   build.gradle  Java 17

 :capacitor-android (from node_modules)
    Java 17 enforcement (via root afterEvaluate)
    Kotlin jvmTarget 17 enforcement

Plus 9 Capacitor plugins under node_modules/:
 @capacitor/android
 @capacitor/app
 @capacitor/device
 @capacitor/filesystem (has Kotlin code)
 @capacitor/haptics
 @capacitor/keyboard
 @capacitor/local-notifications
 @capacitor/preferences
 @capacitor/splash-screen
 @capacitor/status-bar

All: Java 17 + Kotlin jvmTarget 17 enforced
```

---

## File Dependencies & Flow

```
Key Files & Their Relationships:

e2e-build.ps1
   Calls: ./gradlew (from android/)
   Creates: android/key.properties
   Reads: ./e2e-build.ps1 parameters
   Output: app-debug.apk or app-release.aab

.github/workflows/build-android-aab.yml
   Triggers: on push to main/master
   Reads: GitHub Secrets
   Calls: ./gradlew (from android/)
   Creates: android/key.properties
   Uploads: artifact to GitHub

android/build.gradle (Master Config)
   Enforces: Java 17 + Kotlin 17 globally
   Applied to: All subprojects & node_modules
   Loaded by: ./gradlew

android/app/build.gradle
   Loads: android/key.properties (if exists)
   Defines: signingConfigs.release
   Wires: signing to release buildType
   Dependencies: Capacitor plugins

android/app/capacitor.build.gradle (Auto-generated)
   Generated by: npx capacitor update
   Sets: compileOptions Java 17
   Note: Needs manual update after capacitor update

node_modules/@capacitor/*/android/build.gradle
   Declares: Original Java 21 (overridden by root)
   Contains: Kotlin code (in filesystem)
   Kotlin target: Enforced to 17 by root build.gradle
   Status: Works with Java 17 enforcement
```

---

## Java/Kotlin Version Enforcement Path

```
                    ./gradlew assembleDebug
                            
                            
                  Read android/build.gradle
                            
        
                                               
                                               
  Global TaskConfig                    Subprojects AfterEvaluate
  (JavaCompile tasks)                  (Each module)
                                               
         sourceCompatibility: 17        
         targetCompatibility: 17                   
         Apply to root project                     
                                    Android Ext   JavaCompile Tasks
                                    sourceCompat: 17
                                    targetCompat: 17

        Plus: Kotlin jvmTarget = '17' for modules with Kotlin code

                            
                  Compile Phase (Java + Kotlin)
                            
        
                                               
                                               
   Java Sources                        Kotlin Sources
   (Java 17)                           (jvmTarget 17)
                                               
        
                            
                    Unified Bytecode (Java 17)
                            
                            
                    Package & Sign (if release)
                            
                            
                    APK or AAB Output
```

---

## GitHub Secrets Flow

```
User Setup (One-time):
  Keystore file  Base64 encode
                  
              ANDROID_KEYSTORE_BASE64 (secret)
                  
        GitHub Repository Settings

  Password inputs
    
  ANDROID_KEYSTORE_PASSWORD (secret)
  ANDROID_KEY_PASSWORD (secret)
    
  GitHub Repository Settings



During CI/CD Build:

  GitHub Actions workflow reads secrets
          
  ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          
  base64 -d  android/finance-life-release.keystore
          
  Create key.properties with:
    - storeFile=/path/to/keystore
    - storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    - keyAlias=finance-life
    - keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          
  Gradle reads key.properties
          
  Apply signing to release build
          
  Delete key.properties & keystore (cleanup)
          
  Upload signed AAB artifact
```

---

## Artifact Lifecycle

```
Local Build:
   Debug APK
     Location: android/app/build/outputs/apk/debug/app-debug.apk
     Size: ~50-100 MB
     Status: Unsigned (debug)
     Usage: Install on device for testing
  
   Release AAB
      Location: android/app/build/outputs/bundle/release/app-release.aab
      Size: ~30-50 MB
      Status: Signed
      Usage: Upload to Google Play Store

CI/CD Build:
   Debug APK (if manual dispatch)
     Uploaded to: GitHub Artifacts
     Retention: 7 days
     Download: Actions  run  Artifacts tab
  
   Release AAB (automatic on push)
      Uploaded to: GitHub Artifacts
      Retention: 30 days
      Download: Actions  run  Artifacts tab

After Download:
   Debug APK
     adb install app-debug.apk
  
   Release AAB
      Upload to Google Play Console
```

---

## Security Architecture

```
Local Machine:
  Keystore file
     Stored: Offline, secure location
     Access: Developer only
     Usage: ./gradlew via key.properties
     Cleanup: key.properties deleted after build

GitHub Repository:
  Secrets (encrypted, at rest)
     ANDROID_KEYSTORE_BASE64
       Decoded: Only during CI build
       Masked: In logs
    
     ANDROID_KEYSTORE_PASSWORD
       Usage: Unlocks keystore during build
       Masked: In logs
    
     ANDROID_KEY_PASSWORD
        Usage: Unlocks key alias
        Masked: In logs

CI/CD Build (Ubuntu):
  Temporary files (cleaned up)
     Decoded keystore
     key.properties
     Deleted after build completes

Result:
  Signed artifact (AAB)
     Safe to share/upload
     Verified with keystore signature
```

---

**Last Updated:** February 11, 2026  
**Status:** Production Ready 
