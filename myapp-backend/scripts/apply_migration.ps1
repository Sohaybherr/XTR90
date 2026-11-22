param(
    [string]$MigrationFile = "database\migrations\001_prepare_api_football.sql",
    [string]$EnvFile = ".env",
    [string]$PsqlPath = ""
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

function Resolve-Psql {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        if (Test-Path -LiteralPath $ExplicitPath) {
            return (Resolve-Path -LiteralPath $ExplicitPath).Path
        }
        throw "psql not found at explicit path: $ExplicitPath"
    }

    $command = Get-Command "psql" -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidateRoots = @(
        "$env:ProgramFiles\PostgreSQL",
        "${env:ProgramFiles(x86)}\PostgreSQL"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($root in $candidateRoots) {
        $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }

    throw "psql was not found. Install PostgreSQL client tools, add PostgreSQL bin to PATH, or rerun with -PsqlPath 'C:\Path\To\psql.exe'."
}

if (-not (Test-Path -LiteralPath $MigrationFile)) {
    throw "Migration file not found: $MigrationFile"
}

$envValues = Read-DotEnv -Path $EnvFile
$psql = Resolve-Psql -ExplicitPath $PsqlPath

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

$oldPgPassword = $env:PGPASSWORD
try {
    if ($dbPassword) {
        $env:PGPASSWORD = $dbPassword
    }

    & $psql `
        --host $dbHost `
        --port $dbPort `
        --username $dbUser `
        --dbname $dbName `
        --file $MigrationFile `
        --set ON_ERROR_STOP=1

    Write-Host "Migration applied: $MigrationFile"
}
finally {
    $env:PGPASSWORD = $oldPgPassword
}
