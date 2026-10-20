param(
  [Parameter(Mandatory = $true)][string]$Root,
  [int]$MinimumCases = 400
)

$cases = Get-ChildItem -Path $Root -Recurse -Filter *.json |
  Where-Object { $_.FullName -notmatch '[\\/](lighthouse|perf)[\\/]' }
if ($cases.Count -lt $MinimumCases) { throw "Only $($cases.Count) case files recorded, expected at least $MinimumCases" }
if (-not (Test-Path (Join-Path $Root 'schema/introspection.json'))) { throw 'schema/introspection.json was not recorded' }
$invalid = $cases | Select-String -SimpleMatch '<invalid' -List
if ($invalid) { throw "Recorded cases contain '<invalid': $($invalid.Path -join ', ')" }
Write-Output "$($cases.Count) case files recorded across $((Get-ChildItem -Path $Root -Directory).Count) folders"
