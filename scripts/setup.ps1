$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. "$PSScriptRoot\common.ps1"
$Python = Get-ProjectPython

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    & $Python -m venv .venv
}

$VenvPython = ".\.venv\Scripts\python.exe"
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r requirements.txt

$env:ACADEMIC_SEARCH_ALLOW_DOWNLOAD = "1"
Write-Host "Descargando o verificando el modelo semantico local..."
& $VenvPython -m app.cli warmup
Remove-Item Env:\ACADEMIC_SEARCH_ALLOW_DOWNLOAD -ErrorAction SilentlyContinue

Write-Host "Instalacion lista. Ejecuta: .\scripts\run_app.ps1"
