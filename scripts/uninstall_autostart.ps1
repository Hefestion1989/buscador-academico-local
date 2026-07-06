$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "Buscador Academico Local.lnk"

if (Test-Path $ShortcutPath) {
    Remove-Item -LiteralPath $ShortcutPath -Force
    Write-Host "Autoarranque desinstalado."
}
else {
    Write-Host "No habia autoarranque instalado para el buscador."
}
