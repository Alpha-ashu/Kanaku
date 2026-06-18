<#
.SYNOPSIS
  PHASE 7 (opt-in): migrate Kanaku to the apps/ monorepo layout.
    frontend/  -> apps/frontend/
    backend/   -> apps/backend/
    api/       -> apps/edge/      (Vercel serverless functions)

.DESCRIPTION
  Moving frontend/ and backend/ WHOLESALE keeps all their *internal* relative
  imports intact (they move together). The only breakages are:
    1. Root config files that point INTO those folders.
    2. A few CROSS-BOUNDARY references (enumerated & fixed below).
    3. scripts/*.mjs that use repo-root-relative string paths.

  This script is DRY-RUN by default. It prints the full plan and the
  cross-boundary references it will rewrite. Pass -Apply to execute.

  >>> YOU MUST RUN THIS IN A NODE + FULL-CI ENVIRONMENT <<<
  After -Apply, verify (any red => `git restore --staged --worktree .`):
    npm install                      # workspaces + postinstall prisma generate
    npm run build                    # backend + frontend
    npm test                         # frontend vitest
    npm --prefix apps/backend test   # backend jest
    npm --prefix apps/backend run test:security
    npx playwright test
    npx cap sync                     # mobile webDir

.PARAMETER Apply
  Without it: DRY-RUN (no changes). With it: perform the migration.

.EXAMPLE
  pwsh -File scripts/migrate-to-apps-layout.ps1            # preview
  pwsh -File scripts/migrate-to-apps-layout.ps1 -Apply     # execute (in CI)
#>

[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN' }
Write-Host "==== Phase 7: migrate to apps/ layout ($mode) ====" -ForegroundColor Cyan

# Idempotency guard
if ((Test-Path 'apps/frontend') -and -not (Test-Path 'frontend')) {
  Write-Host "[idempotent] already migrated to apps/. Nothing to do." -ForegroundColor Green
  exit 0
}
foreach ($d in 'frontend','backend') {
  if (-not (Test-Path $d)) { throw "Expected '$d/' at repo root - aborting (unexpected layout)." }
}

# ---- Helper: write file preserving UTF-8 (no BOM) ----
function Set-FileText([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $Path), $Text, [System.Text.UTF8Encoding]::new($false))
}
function Edit-File([string]$Path, [string]$Pattern, [string]$Replacement, [switch]$Regex) {
  if (-not (Test-Path $Path)) { return }
  $t = Get-Content -Raw -LiteralPath $Path
  $n = if ($Regex) { [regex]::Replace($t, $Pattern, $Replacement) } else { $t.Replace($Pattern, $Replacement) }
  if ($n -ne $t) {
    if ($Apply) { Set-FileText $Path $n }
    Write-Host "  [edit] $Path  ($Pattern -> $Replacement)"
  }
}

# =====================================================================
# 1. PLAN -" config rewrites (root files that point into the moved dirs)
# =====================================================================
Write-Host ""
Write-Host "--- Config rewrites ---" -ForegroundColor Yellow

# package.json (root): workspaces + scripts
Edit-File 'package.json' '"frontend",' '"apps/frontend",'
Edit-File 'package.json' '"backend"'   '"apps/backend"'
Edit-File 'package.json' '--workspace frontend' '--workspace apps/frontend'
Edit-File 'package.json' '--workspace backend'  '--workspace apps/backend'
Edit-File 'package.json' '--prefix backend'  '--prefix apps/backend'
Edit-File 'package.json' '--prefix frontend' '--prefix apps/frontend'
Edit-File 'package.json' 'cd backend &&' 'cd apps/backend &&'
Edit-File 'package.json' 'backend/prisma/schema.prisma' 'apps/backend/prisma/schema.prisma'
Edit-File 'package.json' 'rimraf frontend/dist backend/dist' 'rimraf apps/frontend/dist apps/backend/dist'

# vercel.json
Edit-File 'vercel.json' '"outputDirectory": "frontend/dist"' '"outputDirectory": "apps/frontend/dist"'
Edit-File 'vercel.json' '/api/stocks.ts' '/apps/edge/stocks.ts'
Edit-File 'vercel.json' '"api/stocks.ts"' '"apps/edge/stocks.ts"'

# fly.toml
Edit-File 'fly.toml' "dockerfile = 'backend/Dockerfile'" "dockerfile = 'apps/backend/Dockerfile'"

# capacitor.config.json
Edit-File 'capacitor.config.json' '"webDir": "frontend/dist"' '"webDir": "apps/frontend/dist"'

# playwright stays at tests/ (not moved) -" no change

# root tsconfig references (if any point into frontend/backend)
Edit-File 'tsconfig.json' '"path": "./frontend"' '"path": "./apps/frontend"'
Edit-File 'tsconfig.json' '"path": "./backend"'  '"path": "./apps/backend"'

# =====================================================================
# 2. PLAN -" CROSS-BOUNDARY code references (enumerated from git grep)
# =====================================================================
Write-Host ""
Write-Host "--- Cross-boundary code rewrites ---" -ForegroundColor Yellow

# backend/apply_schema.cjs reads ../database -> becomes ../../database after move.
# (We edit it at its CURRENT path; it moves with backend afterward.)
Edit-File 'backend/apply_schema.cjs' "'../database/" "'../../database/"

# scripts/*.mjs that use repo-root-relative string paths into backend/frontend.
# These run from repo root, so the string 'backend/...' / 'frontend/...' still
# resolves from root -" but the targets moved. Rewrite known ones:
Get-ChildItem scripts -Filter *.mjs -File | ForEach-Object {
  Edit-File $_.FullName 'backend/prisma/schema.prisma' 'apps/backend/prisma/schema.prisma'
  Edit-File $_.FullName "'backend/src" "'apps/backend/src"
  Edit-File $_.FullName "'frontend/src" "'apps/frontend/src"
}

# scripts/*.cjs and remaining *.mjs that reference across the boundary (run from repo root)
Get-ChildItem scripts -Filter *.cjs -File | ForEach-Object {
  Edit-File $_.FullName "'../backend/" "'../apps/backend/"
  Edit-File $_.FullName "'../frontend/" "'../apps/frontend/"
}
Get-ChildItem scripts -Filter *.mjs -File | ForEach-Object {
  Edit-File $_.FullName "'../backend/" "'../apps/backend/"
  Edit-File $_.FullName "'../frontend/" "'../apps/frontend/"
}# =====================================================================
# 3. DETECT -" any OTHER cross-boundary refs we should eyeball
# =====================================================================
Write-Host ""
Write-Host "--- Residual cross-boundary references to REVIEW manually ---" -ForegroundColor Yellow
$residual = git --no-pager grep -n -I -E "\.\./(frontend|backend)/" -- ':!frontend/*' ':!backend/*' ':!apps/*' ':!*.md' ':!archive-unused/*' 2>$null
if ($residual) { $residual | ForEach-Object { Write-Host "  $_" } }
else { Write-Host "  (none detected outside frontend/ and backend/)" -ForegroundColor Green }

# =====================================================================
# 4. MOVE -" do the directory moves LAST (so failures above leave tree intact)
# =====================================================================
Write-Host ""
Write-Host "--- Directory moves ---" -ForegroundColor Yellow
if ($Apply) {
  New-Item -ItemType Directory -Force -Path apps | Out-Null
  & git mv frontend apps/frontend 2>&1 | Out-Host
  & git mv backend  apps/backend  2>&1 | Out-Host
  if (Test-Path 'api') { & git mv api apps/edge 2>&1 | Out-Host }
  Write-Host "  moved frontend, backend, api -> apps/" -ForegroundColor Green
} else {
  Write-Host "  (dry-run) would: git mv frontend apps/frontend; git mv backend apps/backend; git mv api apps/edge"
}

# =====================================================================
# 5. NEXT STEPS
# =====================================================================
Write-Host ""
Write-Host "==== $mode complete ====" -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host "Re-run with -Apply IN A NODE + CI ENVIRONMENT to execute." -ForegroundColor Yellow
} else {
  Write-Host "VERIFY NOW (any failure => git restore --staged --worktree .):" -ForegroundColor Yellow
  @(
    'npm install',
    'npm run build',
    'npm test',
    'npm --prefix apps/backend test',
    'npm --prefix apps/backend run test:security',
    'npx playwright test',
    'npx cap sync'
  ) | ForEach-Object { Write-Host "  $_" }
}


