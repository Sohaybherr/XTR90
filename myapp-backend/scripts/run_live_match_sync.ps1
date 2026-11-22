param(
    [string]$Date = (Get-Date -Format "yyyy-MM-dd"),
    [int]$IntervalSeconds = 5,
    [int]$Limit = 50,
    [switch]$IgnoreBudget
)

$ErrorActionPreference = "Stop"

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$python = "python"
$lineupArgs = @("scripts/sync_lineups_by_date.py", $Date)
$liveArgs = @(
    "-m",
    "scripts.api_football.live.live_scheduler",
    "--limit",
    "$Limit",
    "--watch",
    "--interval",
    "$IntervalSeconds"
)

if ($IgnoreBudget) {
    $lineupArgs += "--ignore-budget"
    $liveArgs += "--ignore-budget"
}

Write-Host "Live match sync starting."
Write-Host "Date: $Date"
Write-Host "Lineups: python $($lineupArgs -join ' ')"
Write-Host "Live scores: python $($liveArgs -join ' ')"
Write-Host "Stop with Ctrl+C."
Write-Host ""

try {
    & $python @lineupArgs
}
catch {
    Write-Warning "Lineup sync failed, continuing with live score refresh: $($_.Exception.Message)"
}

& $python @liveArgs
