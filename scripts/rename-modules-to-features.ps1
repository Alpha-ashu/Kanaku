<#
.SYNOPSIS
  PHASE 3 codemod: rename backend/src/modules/ -> backend/src/features/ and
  rewrite every import, lazy require, doc link, and api-docs reference.

.DESCRIPTION
  This is a destructive, repo-wide rename. It is designed to be:
    - Idempotent (safe to re-run; second run is a no-op)
    - Dry-run capable (default mode prints what WOULD change)
    - Atomic-ish (does the directory move LAST so a failure mid-codemod
      leaves the source tree unchanged)

  After running, you MUST:
    1. npm --prefix backend run build       (or: tsc -p backend)
    2. npm --prefix backend test
    3. npm --prefix backend run test:security
    4. npm --prefix frontend run build
    5. Commit in a SINGLE dedicated PR titled
       "refactor: rename backend modules/ -> features/ (Phase 3)"

.PARAMETER Apply
  Without this switch the script runs in DRY-RUN mode and only reports.
  Pass -Apply to actually mutate files.

.PARAMETER SkipDocs
  Skip the 59 markdown files (recommended for first pass — review code
  rename, then do docs in a follow-up commit).

.EXAMPLE
  # See what would change (safe):
  pwsh -File scripts/rename-modules-to-features.ps1

  # Apply only the code rename:
  pwsh -File scripts/rename-modules-to-features.ps1 -Apply -SkipDocs

  # Apply everything including 59 markdown files:
  pwsh -File scripts/rename-modules-to-features.ps1 -Apply
#>

[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$SkipDocs
)

$ErrorActionPreference = 'Stop'
$repoRoot   = Split-Path -Parent $PSScriptRoot
$srcModules = Join-Path $repoRoot 'backend\src\modules'
$srcFeats   = Join-Path $repoRoot 'backend\src\features'

if (-not (Test-Path $srcModules)) {
  if (Test-Path $srcFeats) {
    Write-Host "[idempotent] backend/src/modules/ already renamed to features/. Nothing to do." -ForegroundColor Green
    exit 0
  }
  throw "Cannot find $srcModules -- repo layout unexpected."
}

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN' }
Write-Host "==== Phase 3 rename ($mode) ====" -ForegroundColor Cyan

# ---------- 1. Inventory ----------

# TS / JS source files that import from modules/
$codeExts = '*.ts','*.tsx','*.js','*.cjs','*.mjs'
$codeFiles = Get-ChildItem -Path $repoRoot -Recurse -Include $codeExts -File |
  Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\archive-unused\\' -and
    $_.FullName -notmatch '\\\.git\\'
  }

# Pattern matches:
#   from '../modules/...'  | from "./modules/..."  | from "modules/..."
#   require('../modules/...') | require("./modules/...")
# i.e. the substring 'modules/' or 'modules\\' immediately preceded by a path
# separator OR by a quote (start of relative path). We avoid the bare word
# "modules" in English prose.
$codeRegex = "(?<pre>['""]\.\.?/|['""]|/|\\)modules(?<post>[/\\])"

$codeChanges = @()
foreach ($f in $codeFiles) {
  $text = Get-Content -Raw $f.FullName
  $matches = [regex]::Matches($text, $codeRegex)
  if ($matches.Count -gt 0) {
    $codeChanges += [pscustomobject]@{
      Path  = $f.FullName.Substring($repoRoot.Length + 1)
      Hits  = $matches.Count
    }
  }
}

# Markdown files
$mdFiles = Get-ChildItem -Path $repoRoot -Recurse -Include *.md -File |
  Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\archive-unused\\' -and
    $_.FullName -notmatch '\\\.git\\'
  }
$mdRegex = "(?<pre>['""\(\s/]|backend[\\/]src[\\/])modules(?<post>[/\\])"  # link/path-shaped only
$mdChanges = @()
foreach ($f in $mdFiles) {
  $text = Get-Content -Raw $f.FullName
  $matches = [regex]::Matches($text, $mdRegex)
  if ($matches.Count -gt 0) {
    $mdChanges += [pscustomobject]@{
      Path = $f.FullName.Substring($repoRoot.Length + 1)
      Hits = $matches.Count
    }
  }
}

# api-docs JSON
$jsonFiles = Get-ChildItem -Path (Join-Path $repoRoot 'api-docs') -Recurse -Include *.json -File -ErrorAction SilentlyContinue
$jsonChanges = @()
foreach ($f in $jsonFiles) {
  $text = Get-Content -Raw $f.FullName
  if ($text -match 'backend/src/modules/') {
    $jsonChanges += [pscustomobject]@{ Path = $f.FullName.Substring($repoRoot.Length + 1); Hits = ([regex]::Matches($text, 'backend/src/modules/')).Count }
  }
}

Write-Host ""
Write-Host "[plan] code files with import rewrites : $($codeChanges.Count) files, $(($codeChanges | Measure-Object Hits -Sum).Sum) hits"
Write-Host "[plan] markdown files                  : $($mdChanges.Count) files, $(($mdChanges | Measure-Object Hits -Sum).Sum) hits  $(if($SkipDocs){'(SKIPPED via -SkipDocs)'})"
Write-Host "[plan] api-docs json files             : $($jsonChanges.Count) files, $(($jsonChanges | Measure-Object Hits -Sum).Sum) hits"
Write-Host "[plan] directory rename                : backend/src/modules/ -> backend/src/features/"
Write-Host ""

if (-not $Apply) {
  Write-Host "DRY-RUN. Re-run with -Apply to mutate. Sample of changes:" -ForegroundColor Yellow
  $codeChanges | Select-Object -First 5 | Format-Table -AutoSize
  if (-not $SkipDocs) { $mdChanges | Select-Object -First 5 | Format-Table -AutoSize }
  $jsonChanges | Select-Object -First 3 | Format-Table -AutoSize
  exit 0
}

# ---------- 2. Apply ----------
function Replace-InFile {
  param([string]$Path, [string]$Pattern, [string]$Replacement)
  $text = Get-Content -Raw -LiteralPath $Path
  $new  = [regex]::Replace($text, $Pattern, $Replacement)
  if ($new -ne $text) {
    # Preserve original encoding (assume UTF-8 no-BOM)
    [System.IO.File]::WriteAllText($Path, $new, [System.Text.UTF8Encoding]::new($false))
    return $true
  }
  return $false
}

# 2a. Rewrite imports/requires in code
Write-Host "[apply] rewriting $($codeChanges.Count) code files..."
foreach ($c in $codeChanges) {
  $abs = Join-Path $repoRoot $c.Path
  [void](Replace-InFile -Path $abs -Pattern $codeRegex -Replacement '${pre}features${post}')
}

# 2b. Rewrite markdown
if (-not $SkipDocs) {
  Write-Host "[apply] rewriting $($mdChanges.Count) markdown files..."
  foreach ($c in $mdChanges) {
    $abs = Join-Path $repoRoot $c.Path
    [void](Replace-InFile -Path $abs -Pattern $mdRegex -Replacement '${pre}features${post}')
  }
}

# 2c. Rewrite api-docs JSON (the controller/route paths)
Write-Host "[apply] rewriting $($jsonChanges.Count) api-docs JSON files..."
foreach ($c in $jsonChanges) {
  $abs = Join-Path $repoRoot $c.Path
  [void](Replace-InFile -Path $abs -Pattern 'backend/src/modules/' -Replacement 'backend/src/features/')
}

# 2d. Patch the api-docs generator scripts themselves
$genPathRegex   = '([''"\\/])modules([''"\\/])'
$genQuoteSingle = "'modules'"
$genQuoteDouble = '"modules"'
foreach ($gen in @('scripts\generate-api-docs.cjs','scripts\generate-api-docs.ps1')) {
  $abs = Join-Path $repoRoot $gen
  if (Test-Path $abs) {
    [void](Replace-InFile -Path $abs -Pattern $genPathRegex -Replacement '$1features$2')
    [void](Replace-InFile -Path $abs -Pattern ([regex]::Escape($genQuoteSingle)) -Replacement "'features'")
    [void](Replace-InFile -Path $abs -Pattern ([regex]::Escape($genQuoteDouble)) -Replacement '"features"')
  }
}

# 2e. Directory rename — LAST, so failures above leave src/ intact
Write-Host "[apply] git mv backend/src/modules -> backend/src/features ..."
Push-Location $repoRoot
try {
  & git mv backend/src/modules backend/src/features 2>&1 | Out-Host
} finally { Pop-Location }

Write-Host ""
Write-Host "==== DONE ====" -ForegroundColor Green
Write-Host "Verify before committing:"
Write-Host "  npm --prefix backend run build"
Write-Host "  npm --prefix backend test"
Write-Host "  npm --prefix backend run test:security"
Write-Host "  npm --prefix frontend run build"
Write-Host "If any of the above fail, run: git restore --staged --worktree ."



