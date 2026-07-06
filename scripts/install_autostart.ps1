$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = $ProjectRoot.Path
$ScriptPath = Join-Path $ProjectRoot "scripts\start_local.ps1"

$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "Buscador Academico Local.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -NoBrowser"
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Inicia el buscador academico local en http://localhost:8501 al iniciar sesion."
$Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
$Shortcut.Save()

Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -NoBrowser" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden

Write-Host "Autoarranque instalado."
Write-Host "Desde ahora, al iniciar sesion en Windows, el buscador queda disponible en http://localhost:8501"
