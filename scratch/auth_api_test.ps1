
$baseUrl = 'https://kanaku.fly.dev'
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$testEmail = "testuser_${timestamp}@mailinator.com"
$testPassword = 'TestPass123!'
$results = [System.Collections.ArrayList]::new()

function Invoke-ApiTest {
    param([string]$Name, [string]$Uri, [string]$Method, $Body, [int]$ExpectCode, $ExtraHeaders)
    Write-Host ""
    Write-Host "--- $Name ---" -ForegroundColor Cyan
    try {
        $params = @{ Uri=$Uri; Method=$Method; UseBasicParsing=$true; TimeoutSec=20 }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 5); $params.ContentType = 'application/json' }
        if ($ExtraHeaders) { $params.Headers = $ExtraHeaders }
        $r = Invoke-WebRequest @params
        $preview = if ($r.Content.Length -gt 350) { $r.Content.Substring(0,350) + '...' } else { $r.Content }
        $pass = ($r.StatusCode -eq $ExpectCode)
        Write-Host "  Status : $($r.StatusCode)" -ForegroundColor $(if ($pass) { 'Green' } else { 'Yellow' })
        Write-Host "  Body   : $preview"
        return @{ Name=$Name; Status=[int]$r.StatusCode; Body=$r.Content; Pass=$pass }
    } catch {
        $res = $_.Exception.Response
        if ($res) {
            $code = [int]$res.StatusCode
            $stream = $res.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($stream)
            $errBody = $reader.ReadToEnd()
            $pass = ($code -eq $ExpectCode)
            Write-Host "  Status : $code" -ForegroundColor $(if ($pass) { 'Green' } else { 'Red' })
            Write-Host "  Error  : $($errBody.Substring(0,[Math]::Min(350,$errBody.Length)))"
            return @{ Name=$Name; Status=$code; Body=$errBody; Pass=$pass }
        } else {
            Write-Host "  Network Error: $_" -ForegroundColor Red
            return @{ Name=$Name; Status=0; Body=$_.ToString(); Pass=$false }
        }
    }
}

Write-Host '=========================================' -ForegroundColor Yellow
Write-Host '  FINORA AUTH API TEST SUITE' -ForegroundColor Yellow
Write-Host "  Backend : $baseUrl" -ForegroundColor Yellow
Write-Host "  Email   : $testEmail" -ForegroundColor Yellow
Write-Host '=========================================' -ForegroundColor Yellow

# HEALTH CHECK
Write-Host '' ; Write-Host '=== HEALTH CHECK ===' -ForegroundColor Magenta
$null = $results.Add((Invoke-ApiTest -Name 'T0: Health Check' -Uri "$baseUrl/health" -Method GET -Body $null -ExpectCode 200))

# REGISTRATION - NEGATIVE
Write-Host '' ; Write-Host '=== REGISTRATION NEGATIVE TESTS ===' -ForegroundColor Magenta

$null = $results.Add((Invoke-ApiTest -Name 'T1: Register empty body' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{} -ExpectCode 400))
$null = $results.Add((Invoke-ApiTest -Name 'T2: Register missing password' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{ firstName='Test';lastName='User';email='nopwd@test.com' } -ExpectCode 400))
$null = $results.Add((Invoke-ApiTest -Name 'T3: Register invalid email' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{ firstName='Test';lastName='User';email='notanemail';password='Test1234!' } -ExpectCode 400))
$null = $results.Add((Invoke-ApiTest -Name 'T4: Register weak password' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{ firstName='Test';lastName='User';email=$testEmail;password='123' } -ExpectCode 400))
$null = $results.Add((Invoke-ApiTest -Name 'T5: Register missing firstName' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{ lastName='User';email=$testEmail;password=$testPassword } -ExpectCode 400))

# REGISTRATION - POSITIVE
Write-Host '' ; Write-Host '=== REGISTRATION POSITIVE TEST ===' -ForegroundColor Magenta

$r6 = Invoke-ApiTest -Name 'T6: Register valid user' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{ firstName='TestFinora';lastName='User';email=$testEmail;password=$testPassword } -ExpectCode 201
$null = $results.Add($r6)

# Duplicate registration
$null = $results.Add((Invoke-ApiTest -Name 'T7: Register duplicate email' -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body @{ firstName='Dup';lastName='User';email=$testEmail;password=$testPassword } -ExpectCode 409))

# LOGIN - NEGATIVE
Write-Host '' ; Write-Host '=== LOGIN NEGATIVE TESTS ===' -ForegroundColor Magenta

$null = $results.Add((Invoke-ApiTest -Name 'T8: Login empty body' -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body @{} -ExpectCode 400))
$fakeEmail = "ghost_$(Get-Random)@nowhere.com"
$null = $results.Add((Invoke-ApiTest -Name 'T9: Login non-existent user' -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body @{ email=$fakeEmail;password='FakePass123!' } -ExpectCode 401))
$null = $results.Add((Invoke-ApiTest -Name 'T10: Login wrong password' -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body @{ email=$testEmail;password='WrongPassword999!' } -ExpectCode 401))
$null = $results.Add((Invoke-ApiTest -Name 'T11: Login invalid email format' -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body @{ email='badformat';password=$testPassword } -ExpectCode 400))

# LOGIN - POSITIVE
Write-Host '' ; Write-Host '=== LOGIN POSITIVE TEST ===' -ForegroundColor Magenta

$r12 = Invoke-ApiTest -Name 'T12: Login valid credentials' -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body @{ email=$testEmail;password=$testPassword } -ExpectCode 200
$null = $results.Add($r12)

$loginToken = $null
if ($r12.Status -eq 200) {
    try {
        $data = $r12.Body | ConvertFrom-Json
        $loginToken = $data.data.token
        if (-not $loginToken) { $loginToken = $data.token }
        Write-Host "  Token  : $($loginToken.Substring(0,[Math]::Min(50,$loginToken.Length)))..." -ForegroundColor Green
    } catch { Write-Host '  Could not parse token' -ForegroundColor Yellow }
}

# CHALLENGE / PIN TESTS
Write-Host '' ; Write-Host '=== CHALLENGE / PIN TESTS ===' -ForegroundColor Magenta

$null = $results.Add((Invoke-ApiTest -Name 'T13: Challenge without token' -Uri "$baseUrl/api/v1/auth/challenge" -Method POST -Body @{ pin='481620';deviceId='device-001' } -ExpectCode 401))
$null = $results.Add((Invoke-ApiTest -Name 'T14: Challenge with fake token' -Uri "$baseUrl/api/v1/auth/challenge" -Method POST -Body @{ pin='481620';deviceId='device-001' } -ExpectCode 401 -ExtraHeaders @{ Authorization='Bearer fake.invalid.jwt' }))

# Protected route without token
Write-Host '' ; Write-Host '=== PROTECTED ROUTES ===' -ForegroundColor Magenta

$null = $results.Add((Invoke-ApiTest -Name 'T15: Get profile without token' -Uri "$baseUrl/api/v1/users/me" -Method GET -Body $null -ExpectCode 401))

if ($loginToken) {
    $null = $results.Add((Invoke-ApiTest -Name 'T16: Get profile with valid token' -Uri "$baseUrl/api/v1/users/me" -Method GET -Body $null -ExpectCode 200 -ExtraHeaders @{ Authorization="Bearer $loginToken" }))
} else {
    Write-Host '' ; Write-Host '  SKIP T16 - no login token available' -ForegroundColor Yellow
}

# SUMMARY
Write-Host ''
Write-Host '=========================================' -ForegroundColor Yellow
Write-Host '  FINAL TEST RESULTS' -ForegroundColor Yellow
Write-Host '=========================================' -ForegroundColor Yellow
$passed = 0; $failed = 0
foreach ($item in $results) {
    $icon = if ($item.Pass) { '[PASS]' } else { '[FAIL]' }
    $color = if ($item.Pass) { 'Green' } else { 'Red' }
    Write-Host "$icon $($item.Name) — HTTP $($item.Status)" -ForegroundColor $color
    if ($item.Pass) { $passed++ } else { $failed++ }
}
Write-Host ''
$totalColor = if ($failed -eq 0) { 'Green' } else { 'Yellow' }
Write-Host "Total: $($results.Count)  |  Passed: $passed  |  Failed: $failed" -ForegroundColor $totalColor
Write-Host "Test account: $testEmail / $testPassword"
