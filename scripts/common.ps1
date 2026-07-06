function Get-ProjectPython {
    $VenvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
    if (Test-Path $VenvPython) {
        return (Resolve-Path $VenvPython).Path
    }

    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($PythonCommand -and $PythonCommand.Source -notlike "*\WindowsApps\python.exe") {
        return $PythonCommand.Source
    }

    $PyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($PyCommand) {
        return $PyCommand.Source
    }

    $LocalPython = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Recurse -Filter python.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "\\Python3\d+\\python.exe$" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($LocalPython) {
        return $LocalPython.FullName
    }

    throw "No encontre Python instalado. Instala Python 3.10 o superior desde https://www.python.org/downloads/windows/ y volve a ejecutar este script."
}
