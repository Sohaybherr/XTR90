param(
    [string]$EnvFile = ".env",
    [string]$BackupDir = "backups",
    [string]$PgDumpPath = ""
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Environment file not found: $Path"
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }
        $key, $value = $line.Split("=", 2)
        $values[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
    }

    return $values
}

function Resolve-PgDump {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        if (Test-Path -LiteralPath $ExplicitPath) {
            return (Resolve-Path -LiteralPath $ExplicitPath).Path
        }
        throw "pg_dump not found at explicit path: $ExplicitPath"
    }

    $command = Get-Command "pg_dump" -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidateRoots = @(
        "$env:ProgramFiles\PostgreSQL",
        "${env:ProgramFiles(x86)}\PostgreSQL"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($root in $candidateRoots) {
        $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter "pg_dump.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }

    throw "pg_dump was not found. Install PostgreSQL client tools, add PostgreSQL bin to PATH, or rerun with -PgDumpPath 'C:\Path\To\pg_dump.exe'."
}

$envValues = Read-DotEnv -Path $EnvFile
$pgDump = Resolve-PgDump -ExplicitPath $PgDumpPath

$dbHost = $envValues["DB_HOST"]
if (-not $dbHost) { $dbHost = $envValues["PGHOST"] }
if (-not $dbHost) { $dbHost = "localhost" }

$dbPort = $envValues["DB_PORT"]
if (-not $dbPort) { $dbPort = $envValues["PGPORT"] }
if (-not $dbPort) { $dbPort = "5432" }

$dbName = $envValues["DB_NAME"]
if (-not $dbName) { $dbName = $envValues["PGDATABASE"] }

$dbUser = $envValues["DB_USER"]
if (-not $dbUser) { $dbUser = $envValues["PGUSER"] }

$dbPassword = $envValues["DB_PASSWORD"]
if (-not $dbPassword) { $dbPassword = $envValues["PGPASSWORD"] }

if (-not $dbName -or -not $dbUser) {
    throw "Missing DB_NAME/PGDATABASE or DB_USER/PGUSER in $EnvFile"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupPath = Join-Path $BackupDir "football_db_$timestamp.sql"

$oldPgPassword = $env:PGPASSWORD
try {
    if ($dbPassword) {
        $env:PGPASSWORD = $dbPassword
    }

    & $pgDump `
        --host $dbHost `
        --port $dbPort `
        --username $dbUser `
        --dbname $dbName `
        --format plain `
        --no-owner `
        --no-privileges `
        --file $backupPath

    if (-not (Test-Path -LiteralPath $backupPath)) {
        throw "pg_dump completed without creating $backupPath"
    }

    Write-Host "Backup created: $backupPath"
}
finally {
    $env:PGPASSWORD = $oldPgPassword
}
