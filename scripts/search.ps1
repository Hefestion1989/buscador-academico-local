param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [int]$TopK = 8
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. "$PSScriptRoot\common.ps1"
$Python = Get-ProjectPython

& $Python -m app.cli search --query $Query --top-k $TopK
