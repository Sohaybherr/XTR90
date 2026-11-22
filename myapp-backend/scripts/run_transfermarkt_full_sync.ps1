param(
    [double]$SleepSeconds = 1,
    [int]$Limit = 0,
    [switch]$RetryNotFound,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$BackendDir = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$ProjectDir = Resolve-Path -LiteralPath (Join-Path $BackendDir "..")
$TransfermarktDir = Join-Path $ProjectDir "tools\transfermarkt-api"
$Python = Join-Path $TransfermarktDir ".venv\Scripts\python.exe"
$LogDir = Join-Path $BackendDir "logs"
$ApiOut = Join-Path $LogDir "transfermarkt-api.out.log"
$ApiErr = Join-Path $LogDir "transfermarkt-api.err.log"
$SyncOut = Join-Path $LogDir "transfermarkt-full-sync.out.log"
$SyncErr = Join-Path $LogDir "transfermarkt-full-sync.err.log"
$StartedApiProcess = $null

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-HttpOk {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Transfermarkt API virtualenv not found: $Python. Install it from tools\transfermarkt-api first."
}

if (-not (Test-HttpOk -Url "http://127.0.0.1:8000/openapi.json")) {
    $StartedApiProcess = Start-Process `
        -FilePath $Python `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $TransfermarktDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $ApiOut `
        -RedirectStandardError $ApiErr `
        -PassThru

    Start-Sleep -Seconds 5
}

if (-not (Test-HttpOk -Url "http://127.0.0.1:8000/openapi.json")) {
    throw "Transfermarkt API is not reachable. Check $ApiErr"
}

$syncArgs = @("scripts\sync_transfermarkt.py", "--resources", "all", "--limit", "$Limit", "--sleep", "$SleepSeconds")
if ($RetryNotFound) { $syncArgs += "--retry-not-found" }
if ($Force) { $syncArgs += "--force" }

Set-Content -LiteralPath $SyncOut -Value "" -Encoding UTF8
Set-Content -LiteralPath $SyncErr -Value "" -Encoding UTF8

Write-Host "Output log: $SyncOut"
Write-Host "Error log:  $SyncErr"
Write-Host "Transfermarkt full sync running. Keep this terminal open."

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUNBUFFERED = "1"

Push-Location $BackendDir
try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & python @syncArgs 2>> $SyncErr | Tee-Object -FilePath $SyncOut -Append
    $exitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
    Pop-Location
    if ($StartedApiProcess -and -not $StartedApiProcess.HasExited) {
        Stop-Process -Id $StartedApiProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

exit $exitCode
