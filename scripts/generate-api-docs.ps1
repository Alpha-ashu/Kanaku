<#
.SYNOPSIS
  Generates api-docs/<feature>/<action>.api.json files from backend route
  source. PowerShell port of scripts/generate-api-docs.cjs (kept in sync).

.DESCRIPTION
  Idempotent: hand-edited files (missing the `generator` field) are skipped.
  Auto-generated files include `generator: { auto: true }` so re-runs can
  safely overwrite them.

.USAGE
  pwsh -File scripts/generate-api-docs.ps1
#>

$ErrorActionPreference = 'Stop'
$repoRoot   = Split-Path -Parent $PSScriptRoot
$modulesDir = Join-Path $repoRoot 'backend\src\features'
$apiDocsDir = Join-Path $repoRoot 'api-docs'
$indexFile  = Join-Path $repoRoot 'backend\src\routes\index.ts'

# ---------- 1. Build feature -> URL prefix map ----------
$idxSrc = Get-Content -Raw $indexFile

# importName -> moduleFolder, from `import { foo } from '../features/<folder>/...'`
$importToFolder = @{}
$importMatches = [regex]::Matches($idxSrc,
  'import\s+(?:\{\s*([A-Za-z0-9_,\s]+)\s*\}|([A-Za-z0-9_]+))\s+from\s+[''"]\.\./features/([^/''"]+)/[^''"]+[''"]')
foreach ($m in $importMatches) {
  $folder = $m.Groups[3].Value
  if ($m.Groups[1].Success) {
    foreach ($n in ($m.Groups[1].Value -split ',')) {
      $name = $n.Trim(); if ($name) { $importToFolder[$name] = $folder }
    }
  } elseif ($m.Groups[2].Success) {
    $importToFolder[$m.Groups[2].Value] = $folder
  }
}

# featureFolder -> URL prefix (from router.use('/prefix', xRoutes))
$featureToPrefix = @{}

# Direct: router.use('/auth', authRoutes)
$useMatches = [regex]::Matches($idxSrc,
  'router\.use\(\s*[''"]([^''"]+)[''"]\s*,\s*([A-Za-z0-9_]+)\s*\)')
foreach ($m in $useMatches) {
  $prefix = $m.Groups[1].Value
  $name   = $m.Groups[2].Value
  if ($importToFolder.ContainsKey($name)) {
    $folder = $importToFolder[$name]
    if (-not $featureToPrefix.ContainsKey($folder)) { $featureToPrefix[$folder] = $prefix }
  }
}

# Lazy: router.use('/ai', lazyRoute(() => require('../features/ai/ai.routes'), 'aiRoutes'))
$lazyMatches = [regex]::Matches($idxSrc,
  'router\.use\(\s*[''"]([^''"]+)[''"]\s*,\s*lazyRoute\(\s*\(\)\s*=>\s*require\([''"]\.\./features/([^/''"]+)/[^''"]+[''"]\)')
foreach ($m in $lazyMatches) {
  $folder = $m.Groups[2].Value
  if (-not $featureToPrefix.ContainsKey($folder)) { $featureToPrefix[$folder] = $m.Groups[1].Value }
}

Write-Host "[api-docs] feature->prefix map: $($featureToPrefix.Count) entries"

# ---------- 2. Helper functions ----------
function Get-ActionName([string]$method, [string]$subpath) {
  $segs = $subpath.Trim('/').Split('/') | Where-Object { $_ }
  if ($segs.Count -eq 0) {
    switch ($method) {
      'GET'    { return 'list' }
      'POST'   { return 'create' }
      'PUT'    { return 'update' }
      'PATCH'  { return 'update' }
      'DELETE' { return 'delete' }
      default  { return $method.ToLower() }
    }
  }
  $norm = ($segs | ForEach-Object {
    if ($_.StartsWith(':')) { "by-$($_.Substring(1))" } else { $_ }
  }) -join '.'
  $norm = ($norm -replace '[^A-Za-z0-9._-]', '-')
  return "$($method.ToLower()).$norm"
}

function Get-PathParams([string]$subpath) {
  $out = [ordered]@{}
  foreach ($m in [regex]::Matches($subpath, ':([A-Za-z0-9_]+)')) {
    $out[$m.Groups[1].Value] = 'string (required)'
  }
  return $out
}

function Get-RouteMetadata {
  param([string]$ArgsText)
  # NOTE: parameter is NOT named $args (reserved automatic var in PowerShell)
  $hasAuth   = $ArgsText -match 'authMiddleware|requireAuth\b|requireRole\(|requireApproved|requireAdmin'
  $hasStepUp = $ArgsText -match 'securityGate\('
  $auth = if ($hasStepUp) { 'bearer+stepUp' } elseif ($hasAuth) { 'bearer' } else { 'public' }

  $rateLimit = 'default'
  if ($ArgsText -match 'destructiveLimiter|destructive_limiter|destructive_rate') { $rateLimit = 'destructive (3/min)' }
  elseif ($ArgsText -match 'authLimiter|auth_limiter|auth_rate')                  { $rateLimit = 'auth (20/min)' }

  $validation = [ordered]@{}
  if ($ArgsText -match 'validateBody\(\s*([A-Za-z0-9_.]+)')   { $validation['body']   = $matches[1] }
  if ($ArgsText -match 'validateParams\(\s*([A-Za-z0-9_.]+)') { $validation['params'] = $matches[1] }
  if ($ArgsText -match 'validateQuery\(\s*([A-Za-z0-9_.]+)')  { $validation['query']  = $matches[1] }

  # Handler = last bare identifier in args
  $stripped = $ArgsText -replace '\([^)]*\)', ''
  $tokens = $stripped.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  $handler = if ($tokens.Count -gt 0) { ($tokens[-1] -replace '[^A-Za-z0-9_]', '') } else { $null }

  return @{ auth = $auth; rateLimit = $rateLimit; validation = $validation; handler = $handler }
}

function Should-Skip([string]$path) {
  if (-not (Test-Path $path)) { return $false }
  try {
    $existing = Get-Content -Raw $path | ConvertFrom-Json
    if (-not $existing.generator) { return $true }
    if (-not $existing.generator.auto) { return $true }
    return $false
  } catch { return $true }
}

function Get-RouteFileName([string]$feature) {
  $dir = Join-Path $modulesDir $feature
  $f = Get-ChildItem -Path $dir -Filter '*.routes.ts' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($f) { return $f.Name } else { return "$feature.routes.ts" }
}

# ---------- 3. Walk modules and emit docs ----------
$routeRegex = [regex]'router\.(get|post|put|patch|delete|options|head)\s*\(\s*[''"`]([^''"`]+)[''"`]([^)]*)\)'

if (-not (Test-Path $apiDocsDir)) { New-Item -ItemType Directory -Force -Path $apiDocsDir | Out-Null }

$index = [ordered]@{}
$written = 0; $skipped = 0; $missingPrefix = 0

foreach ($featureDirInfo in Get-ChildItem -Path $modulesDir -Directory) {
  $feature = $featureDirInfo.Name
  $routeFiles = Get-ChildItem -Path $featureDirInfo.FullName -Filter '*.routes.ts' -File
  if ($routeFiles.Count -eq 0) { continue }
  if (-not $featureToPrefix.ContainsKey($feature)) {
    Write-Warning "[skip-feature] no URL prefix found for '$feature' in routes/index.ts"
    $missingPrefix++; continue
  }
  $prefix = $featureToPrefix[$feature]
  $featureOutDir = Join-Path $apiDocsDir $feature
  New-Item -ItemType Directory -Force -Path $featureOutDir | Out-Null
  $index[$feature] = @()

  foreach ($rf in $routeFiles) {
    $src = Get-Content -Raw $rf.FullName
    foreach ($m in $routeRegex.Matches($src)) {
      $method  = $m.Groups[1].Value.ToUpper()
      $subpath = $m.Groups[2].Value
      $argsRaw = $m.Groups[3].Value.Trim()
      $meta    = Get-RouteMetadata -ArgsText $argsRaw

      $fullPath = "/api/v1$prefix" + $(if ($subpath -eq '/') { '' } else { $subpath })
      $action   = Get-ActionName $method $subpath
      $target   = Join-Path $featureOutDir "$action.api.json"

      $index[$feature] += [ordered]@{
        method   = $method
        endpoint = $fullPath
        file     = "api-docs/$feature/$action.api.json"
        auth     = $meta.auth
      }

      if (Should-Skip $target) { $skipped++; continue }

      $headers = [ordered]@{ 'Content-Type' = 'application/json' }
      if ($meta.auth -ne 'public') { $headers['Authorization'] = 'Bearer <jwt>' }

      $hasBody = ($method -notin @('GET','HEAD','OPTIONS','DELETE'))
      $request = [ordered]@{
        headers = $headers
        params  = (Get-PathParams $subpath)
        query   = [ordered]@{}
      }
      if ($hasBody) { $request['body'] = [ordered]@{} }

      $responses = [ordered]@{
        '200' = [ordered]@{ description = 'TODO success shape'; body = [ordered]@{} }
        '400' = [ordered]@{ description = 'Validation failed'; body = [ordered]@{ error = 'validation_error'; issues = @() } }
        '429' = [ordered]@{ description = 'Rate limited'; body = [ordered]@{ error = 'too_many_requests' } }
        '500' = [ordered]@{ description = 'Server error'; body = [ordered]@{ error = 'internal_error' } }
      }
      if ($meta.auth -ne 'public') {
        $responses['401'] = [ordered]@{ description = 'Missing/invalid token'; body = [ordered]@{ error = 'unauthorized' } }
        $responses['403'] = [ordered]@{ description = 'Forbidden'; body = [ordered]@{ error = 'forbidden' } }
      }

      $validationRef = if ($meta.validation.Count -gt 0) {
        $vr = [ordered]@{}
        foreach ($k in $meta.validation.Keys) {
          $vr[$k] = "backend/src/features/$feature/*.validation.ts#$($meta.validation[$k])"
        }
        $vr
      } else { 'inline or none -- verify' }

      $doc = [ordered]@{
        endpoint    = $fullPath
        method      = $method
        feature     = $feature
        description = "TODO: describe $method $fullPath"
        auth        = $meta.auth
        rateLimit   = $meta.rateLimit
        implementation = [ordered]@{
          controller = "backend/src/features/$feature/$feature.controller.ts#$($meta.handler)"
          route      = "backend/src/features/$feature/$(Get-RouteFileName $feature)"
          validation = $validationRef
        }
        request     = $request
        responses   = $responses
        sideEffects = [ordered]@{
          writesDb      = ($method -notin @('GET','HEAD','OPTIONS'))
          emitsSocket   = $false
          transactional = $false
          audited       = $false
        }
        notes       = ''
        generator   = [ordered]@{
          auto         = $true
          version      = 1
          generatedAt  = (Get-Date -Format 'yyyy-MM-dd')
        }
      }
      ($doc | ConvertTo-Json -Depth 12) | Set-Content -Path $target -Encoding UTF8
      $written++
    }
  }
}

# ---------- 4. Index ----------
$totalEndpoints = ($index.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum
$indexDoc = [ordered]@{
  generatedAt    = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
  totalEndpoints = $totalEndpoints
  features       = $index
}
($indexDoc | ConvertTo-Json -Depth 8) | Set-Content -Path (Join-Path $apiDocsDir 'api-index.json') -Encoding UTF8

Write-Host "[api-docs] features=$($index.Keys.Count) endpoints=$totalEndpoints written=$written skipped(hand-edited)=$skipped missingPrefix=$missingPrefix"




