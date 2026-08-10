# ─────────────────────────────────────────────────────────────────────────────
# Kanaku — Full Android Release Build Script
# Usage:  .\build-android.ps1  (run from k:\Project\Kanaku)
# Output: android\app\build\outputs\apk\nosms\release\app-nosms-release.apk
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$root = "k:\Project\Kanaku"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  KANAKU -- Android Release Build" -ForegroundColor Cyan
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

# Step 3: Gradle release build
Write-Host ""
Write-Host "[3/3] Building Android APK..." -ForegroundColor Yellow
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Set-Location "$root\android"
.\gradlew assembleRelease
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Gradle build" -ForegroundColor Red; exit 1 }

# Done
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""

$apkDir = "$root\android\app\build\outputs\apk"
Get-ChildItem $apkDir -Recurse -Filter "*.apk" | Sort-Object LastWriteTime -Descending | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 1)
    Write-Host "  APK: $($_.FullName)"
    Write-Host "  Size: ${size} MB  |  Built: $($_.LastWriteTime)"
    Write-Host ""
}
Write-Host "  Install: app-nosms-release.apk (recommended)" -ForegroundColor Cyan
Write-Host ""
