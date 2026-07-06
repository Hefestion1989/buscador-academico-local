$Processes = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -like "python*.exe" -and
        $_.CommandLine -like "*streamlit*" -and
        $_.CommandLine -like "*ui_streamlit.py*"
    }

foreach ($Process in $Processes) {
    Stop-Process -Id $Process.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Servidor local detenido."
