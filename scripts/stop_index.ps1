$Processes = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -like "python*.exe" -and
        $_.CommandLine -like "*app.cli index*"
    }

if (-not $Processes) {
    Write-Host "No hay indexado corriendo."
    exit 0
}

foreach ($Process in $Processes) {
    Stop-Process -Id $Process.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Indexado pausado. El progreso guardado se puede continuar despues."
