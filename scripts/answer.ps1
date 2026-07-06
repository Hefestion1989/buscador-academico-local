param(
    [Parameter(Mandatory = $true)]
    [string]$Query,

    [int]$TopK = 8,

    [switch]$NoLocalLlm
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. "$PSScriptRoot\common.ps1"
$Python = Get-ProjectPython

$ArgsList = @("-m", "app.cli", "answer", "--query", $Query, "--top-k", "$TopK")
if ($NoLocalLlm) {
    $ArgsList += "--no-local-llm"
}

& $Python @ArgsList
