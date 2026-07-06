param(
    [string]$OutputDir = "dist"
)

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = $ProjectRoot.Path
$OutputPath = Join-Path $ProjectRoot $OutputDir
$PackageName = "academic-semantic-search.zip"
$PackagePath = Join-Path $OutputPath $PackageName

New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
if (Test-Path $PackagePath) {
    Remove-Item -LiteralPath $PackagePath -Force
}

$ExcludedDirs = @(
    ".git",
    ".venv",
    "__pycache__",
    "data",
    "logs",
    "dist"
)

$ExcludedExtensions = @(
    ".pdf",
    ".doc",
    ".docx",
    ".rtf",
    ".zip",
    ".7z",
    ".rar",
    ".sqlite",
    ".sqlite3",
    ".db"
)

$Files = Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -Force |
    Where-Object {
        $relative = $_.FullName.Substring($ProjectRoot.Length).TrimStart("\", "/")
        $parts = $relative -split "[\\/]"
        -not ($parts | Where-Object { $_ -in $ExcludedDirs }) -and
        -not ($_.Extension.ToLowerInvariant() -in $ExcludedExtensions) -and
        $_.Name -notlike "*.pyc" -and
        $_.Name -notlike "*.log" -and
        $_.Name -notlike "*.pid"
    }

$TempDir = Join-Path $env:TEMP ("academic-semantic-search-package-{0}" -f ([guid]::NewGuid()))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$PackageRoot = Join-Path $TempDir "academic-semantic-search"
New-Item -ItemType Directory -Force -Path $PackageRoot | Out-Null

foreach ($File in $Files) {
    $relative = $File.FullName.Substring($ProjectRoot.Length).TrimStart("\", "/")
    $target = Join-Path $PackageRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $File.FullName -Destination $target -Force
}

Compress-Archive -LiteralPath $PackageRoot -DestinationPath $PackagePath -Force
Remove-Item -LiteralPath $TempDir -Recurse -Force

Write-Host "Paquete creado:"
Write-Host $PackagePath
