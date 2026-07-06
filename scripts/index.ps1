param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [switch]$Reindex
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. "$PSScriptRoot\common.ps1"
$Python = Get-ProjectPython

$ArgsList = @("-m", "app.cli", "index", "--root", $Root)
if ($Reindex) {
    $ArgsList += "--reindex"
}

& $Python @ArgsList
