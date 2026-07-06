param(
    [string]$Root = "$env:USERPROFILE\Documents\Materiales Facultad Buscador",
    [switch]$Reindex
)

if ($env:ACADEMIC_SEARCH_ROOT) {
    $Root = $env:ACADEMIC_SEARCH_ROOT
}

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = $ProjectRoot.Path
$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Set-Location $ProjectRoot

$Existing = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -like "python*.exe" -and
        $_.CommandLine -like "*app.cli index*"
    }

if ($Existing) {
    Write-Host "Ya hay un indexado corriendo. No inicio otro."
    $Existing | Select-Object ProcessId, CommandLine | Format-Table -AutoSize
    exit 0
}

if (-not (Test-Path $Root)) {
    throw "No encontre la carpeta a indexar: $Root"
}

$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    throw "No encontre el Python del entorno virtual: $Python"
}

$LogPath = Join-Path $LogDir ("index_materiales_{0}.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
$ErrPath = Join-Path $LogDir ("index_materiales_{0}.err.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
$PidPath = Join-Path $LogDir "index_materiales.pid"

$Arguments = "-m app.cli index --root `"$Root`""
if ($Reindex) {
    $Arguments += " --reindex"
}

$Process = Start-Process `
    -FilePath $Python `
    -ArgumentList $Arguments `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrPath `
    -PassThru

$Process.Id | Set-Content -Path $PidPath -Encoding ascii

Write-Host "Indexado iniciado en segundo plano."
Write-Host "PID: $($Process.Id)"
Write-Host "Carpeta: $Root"
Write-Host "Log: $LogPath"
