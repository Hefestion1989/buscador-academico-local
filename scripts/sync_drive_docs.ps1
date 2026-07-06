param(
    [string]$Source = "",
    [string]$Destination = "$env:USERPROFILE\Documents\Materiales Facultad Buscador"
)

if ($env:ACADEMIC_SEARCH_ROOT) {
    $Destination = $env:ACADEMIC_SEARCH_ROOT
}

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not $Source) {
    $Candidates = @(
        "G:\Mi unidad",
        "$env:USERPROFILE\Google Drive",
        "$env:USERPROFILE\Mi unidad",
        "$env:USERPROFILE\My Drive",
        "$env:USERPROFILE\OneDrive"
    )
    $Source = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $Source -or -not (Test-Path $Source)) {
    throw "No encontre la carpeta de Drive: $Source"
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$LogPath = Join-Path $LogDir ("sync_drive_docs_{0}.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))

Write-Host "Origen: $Source"
Write-Host "Destino local: $Destination"
Write-Host "Copiando documentos soportados. Esto puede tardar si Drive tiene que descargar archivos..."

$RobocopyArgs = @(
    $Source,
    $Destination,
    "*.pdf",
    "*.docx",
    "*.txt",
    "*.md",
    "*.rtf",
    "/S",
    "/Z",
    "/FFT",
    "/XJ",
    "/R:2",
    "/W:2",
    "/MT:8",
    "/NP",
    "/TEE",
    "/LOG:$LogPath"
)

& robocopy @RobocopyArgs
$ExitCode = $LASTEXITCODE

if ($ExitCode -le 7) {
    Write-Host "Sincronizacion terminada correctamente."
    Write-Host "Ruta para usar en el buscador:"
    Write-Host $Destination
    exit 0
}

throw "Robocopy termino con codigo $ExitCode. Revisa el log: $LogPath"
