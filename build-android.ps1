# ─────────────────────────────────────────────────────────────────────────────
# Kanaku — Full Android Release Build Script (APK + AAB)
# Usage:  .\build-android.ps1  (run from k:\Project\Kanaku)
# Output: android\app\build\outputs\apk\nosms\release\app-nosms-release.apk
#         android\app\build\outputs\bundle\nosmsRelease\app-nosms-release.aab
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# Derive the repo root from this script's own location instead of hardcoding
# "k:\Project\Kanaku" — the old value meant the script only ran on one machine.
$root = $PSScriptRoot

# Select JDK 21
if (Test-Path "C:\Program Files\Java\jdk-21\bin\java.exe") {
    $env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
} elseif (Test-Path "C:\Program Files\Eclipse Adoptium\jdk-21\bin\java.exe") {
    $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21"
} elseif (Test-Path "C:\Program Files\Microsoft\jdk-21\bin\java.exe") {
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21"
} elseif ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    # Keep existing JAVA_HOME
} else {
    Write-Host "FAILED: JDK 21 not found. Set JAVA_HOME to a JDK 21 install." -ForegroundColor Red
    exit 1
}

Write-Host "Using JAVA_HOME: $env:JAVA_HOME" -ForegroundColor DarkGray

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  KANAKU -- Android Release Build (APK + AAB)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Frontend build (Android mode)
Write-Host "[1/3] Building frontend (--mode android)..." -ForegroundColor Yellow
Set-Location "$root\frontend"
npx vite build --mode android
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Frontend build" -ForegroundColor Red; exit 1 }
Write-Host "OK: Frontend built" -ForegroundColor Green

# Step 2: Capacitor sync
Write-Host ""
Write-Host "[2/3] Syncing to Android..." -ForegroundColor Yellow
Set-Location $root
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Cap sync" -ForegroundColor Red; exit 1 }
Write-Host "OK: Synced" -ForegroundColor Green

# Step 3: Gradle release build (APK + AAB Bundle)
Write-Host ""
Write-Host "[3/3] Building Android APK & AAB (both flavors: nosms + full)..." -ForegroundColor Yellow
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Set-Location "$root\android"
.\gradlew.bat assembleRelease bundleRelease -PallowMissingGoogleServices=true
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Gradle build" -ForegroundColor Red; exit 1 }

# Copy artifacts to root for direct access
Copy-Item "$root\android\app\build\outputs\apk\nosms\release\app-nosms-release.apk" "$root\kanaku-release.apk" -Force
Copy-Item "$root\android\app\build\outputs\apk\full\release\app-full-release.apk" "$root\kanaku-full-release.apk" -Force

# Done
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""

$outputsDir = "$root\android\app\build\outputs"
Get-ChildItem $outputsDir -Recurse -Include "*.apk","*.aab" | Sort-Object LastWriteTime -Descending | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 1)
    $ext = $_.Extension.ToUpper().Replace('.','')
    Write-Host "  [$ext] $($_.FullName)"
    Write-Host "        Size: ${size} MB  |  Built: $($_.LastWriteTime)"
    Write-Host ""
}
Write-Host "  Root Play-Store APK: $root\kanaku-release.apk" -ForegroundColor Cyan
Write-Host "  Root Full-SMS APK:   $root\kanaku-full-release.apk" -ForegroundColor Cyan
Write-Host ""
