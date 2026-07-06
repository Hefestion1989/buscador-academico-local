param(
    [switch]$NoBrowser
)

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = $ProjectRoot.Path
$Port = 8501
$Url = "http://localhost:$Port"

Set-Location $ProjectRoot

. "$PSScriptRoot\common.ps1"
$Python = Get-ProjectPython
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
$env:TOKENIZERS_PARALLELISM = "false"
$LogDir = Join-Path $ProjectRoot "logs"
$StdOutLog = Join-Path $LogDir "streamlit.out.log"
$StdErrLog = Join-Path $LogDir "streamlit.err.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-AppIsReady {
    try {
        $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500)
    }
    catch {
        return $false
    }
}

function Get-AppProcesses {
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -like "python*.exe" -and
            $_.CommandLine -like "*streamlit*" -and
            $_.CommandLine -like "*ui_streamlit.py*"
        }
}

if (-not (Test-AppIsReady)) {
    $ExistingProcesses = @(Get-AppProcesses)
    if ($ExistingProcesses.Count -eq 0) {
        $Arguments = @(
            "-m",
            "streamlit",
            "run",
            "app\ui_streamlit.py",
            "--server.port",
            "$Port",
            "--server.address",
            "127.0.0.1",
            "--server.headless",
            "true",
            "--browser.gatherUsageStats",
            "false",
            "--server.fileWatcherType",
            "none"
        )

        Start-Process `
            -FilePath $Python `
            -ArgumentList $Arguments `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $StdOutLog `
            -RedirectStandardError $StdErrLog
    }
    Start-Sleep -Seconds 8
}

if (-not $NoBrowser) {
    Start-Process $Url
}

Write-Host "Buscador academico local listo en $Url"
exit 0
