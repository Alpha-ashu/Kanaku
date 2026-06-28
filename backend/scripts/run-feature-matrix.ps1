$ErrorActionPreference = 'Stop'

$base = 'http://localhost:3000/api/v1'
$loginBody = @{ email = 'shaik.job.details@gmail.com'; password = '123456789' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri ($base + '/auth/login') -Method Post -ContentType 'application/json' -Body $loginBody
$token = $login.data.accessToken
$headers = @{ Authorization = ('Bearer ' + $token) }

$authUserData = Invoke-RestMethod -Uri ($base + '/auth/profile') -Method Get -Headers $headers
$pinVerify = Invoke-RestMethod -Uri ($base + '/pin/verify') -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ pin = '847291'; deviceId = 'qa-matrix-device' } | ConvertTo-Json)

$accounts = Invoke-RestMethod -Uri ($base + '/accounts') -Method Get -Headers $headers
$transactions = Invoke-RestMethod -Uri ($base + '/transactions') -Method Get -Headers $headers
$goals = Invoke-RestMethod -Uri ($base + '/goals') -Method Get -Headers $headers
$loans = Invoke-RestMethod -Uri ($base + '/loans') -Method Get -Headers $headers
$investments = Invoke-RestMethod -Uri ($base + '/investments') -Method Get -Headers $headers
$todos = Invoke-RestMethod -Uri ($base + '/todos') -Method Get -Headers $headers
$groups = Invoke-RestMethod -Uri ($base + '/groups') -Method Get -Headers $headers
$settings = Invoke-RestMethod -Uri ($base + '/settings') -Method Get -Headers $headers

$todoCreate = Invoke-RestMethod -Uri ($base + '/todos') -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ title = 'QA Matrix Todo'; completed = $false } | ConvertTo-Json)
$todoId = $todoCreate.data.id
$todoUpdate = Invoke-RestMethod -Uri ($base + '/todos/' + $todoId) -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ completed = $true } | ConvertTo-Json)
$todoDelete = Invoke-RestMethod -Uri ($base + '/todos/' + $todoId) -Method Delete -Headers $headers

$groupCreate = Invoke-RestMethod -Uri ($base + '/groups') -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  name = 'QA Matrix Group'
  totalAmount = 2100
  paidBy = $accounts.data[0].id
  date = (Get-Date).ToString('o')
  members = @(
    @{ name = 'Admin User'; share = 1050; paid = $true; isCurrentUser = $true },
    @{ name = 'Member B'; share = 1050; paid = $false }
  )
  items = @(
    @{ name = 'Meal'; amount = 2100; sharedBy = @('Admin User', 'Member B') }
  )
  description = 'Matrix run'
  category = 'food'
  splitType = 'equal'
  yourShare = 1050
  status = 'pending'
} | ConvertTo-Json -Depth 8)
$groupId = $groupCreate.data.id
$groupUpdate = Invoke-RestMethod -Uri ($base + '/groups/' + $groupId) -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ status = 'settled' } | ConvertTo-Json)
$groupDelete = Invoke-RestMethod -Uri ($base + '/groups/' + $groupId) -Method Delete -Headers $headers

$investmentCreate = Invoke-RestMethod -Uri ($base + '/investments') -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ assetType = 'stock'; assetName = 'QA TEST LTD'; quantity = 2; buyPrice = 100; currentPrice = 125; purchaseDate = (Get-Date).ToString('o') } | ConvertTo-Json)
$investmentId = $investmentCreate.data.id
$investmentUpdate = Invoke-RestMethod -Uri ($base + '/investments/' + $investmentId) -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ currentPrice = 130 } | ConvertTo-Json)
$investmentDelete = Invoke-RestMethod -Uri ($base + '/investments/' + $investmentId) -Method Delete -Headers $headers

$futureTxCount = (($transactions.data | Where-Object { [datetime]$_.date -gt (Get-Date) }) | Measure-Object).Count

$matrix = @(
  [pscustomobject]@{ feature = 'Dashboard'; status = if (($accounts.data.Count -gt 0) -and ($transactions.data.Count -gt 0) -and ($goals.data.Count -gt 0) -and ($loans.data.Count -gt 0) -and ($investments.data.Count -gt 0)) { 'PASS' } else { 'WARN' }; note = 'Data sources present for dashboard widgets' },
  [pscustomobject]@{ feature = 'Accounts'; status = if ($accounts.data.Count -ge 1) { 'PASS' } else { 'FAIL' }; note = ('records=' + $accounts.data.Count) },
  [pscustomobject]@{ feature = 'Transactions'; status = if ($transactions.data.Count -ge 1) { 'PASS' } else { 'FAIL' }; note = ('records=' + $transactions.data.Count) },
  [pscustomobject]@{ feature = 'Calendar'; status = if (($transactions.data.Count -ge 1) -and ($futureTxCount -ge 1)) { 'PASS' } else { 'WARN' }; note = ('futureTransactions=' + $futureTxCount) },
  [pscustomobject]@{ feature = 'Group Expense'; status = if (($groupCreate.success -eq $true) -and ($groupUpdate.success -eq $true) -and ($groupDelete.success -eq $true)) { 'PASS' } else { 'FAIL' }; note = 'create/update/delete verified' },
  [pscustomobject]@{ feature = 'Loan'; status = if ($loans.data.Count -ge 1) { 'PASS' } else { 'FAIL' }; note = ('records=' + $loans.data.Count) },
  [pscustomobject]@{ feature = 'Todo List'; status = if (($todoCreate.success -eq $true) -and ($todoUpdate.success -eq $true) -and ($todoDelete.success -eq $true)) { 'PASS' } else { 'FAIL' }; note = 'create/update/delete verified' },
  [pscustomobject]@{ feature = 'Investment'; status = if (($investmentCreate.success -eq $true) -and ($investmentUpdate.success -eq $true) -and ($investmentDelete.success -eq $true)) { 'PASS' } else { 'FAIL' }; note = 'create/update/delete verified' },
  [pscustomobject]@{ feature = 'Report'; status = if ($transactions.data.Count -ge 10) { 'PASS' } else { 'WARN' }; note = 'Sufficient transactions for charts' },
  [pscustomobject]@{ feature = 'Goals'; status = if ($goals.data.Count -ge 1) { 'PASS' } else { 'FAIL' }; note = ('records=' + $goals.data.Count) },
  [pscustomobject]@{ feature = 'Setting'; status = if ($settings.userId) { 'PASS' } else { 'FAIL' }; note = ('currency=' + $settings.currency + ', language=' + $settings.language) }
)

[pscustomobject]@{
  auth = [pscustomobject]@{ loginSuccess = $login.success; role = $authUserData.data.role; pinVerifySuccess = $pinVerify.success }
  counts = [pscustomobject]@{ accounts = $accounts.data.Count; transactions = $transactions.data.Count; goals = $goals.data.Count; loans = $loans.data.Count; investments = $investments.data.Count; todos = $todos.data.Count; groups = $groups.data.Count }
  matrix = $matrix
} | ConvertTo-Json -Depth 8
