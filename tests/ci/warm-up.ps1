param([Parameter(Mandatory = $true)][string]$BaseUrl)

# After the database is dropped and recreated, pooled connections inside the app are stale.
# Send the same GraphQL query until one answers without errors.
$body = '{"query":"{ permitTypes { code } }"}'
$deadline = (Get-Date).AddSeconds(60)
while ($true) {
  try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/graphql" -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -eq 200 -and $response.Content -notmatch '"errors"') { break }
  } catch {
    # keep trying until the deadline
  }
  if ((Get-Date) -gt $deadline) { throw 'The legacy app did not answer the GraphQL warm-up query within 60 seconds' }
  Start-Sleep -Seconds 2
}
