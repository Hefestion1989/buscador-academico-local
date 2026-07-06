$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. "$PSScriptRoot\common.ps1"
$Python = Get-ProjectPython
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
$env:TOKENIZERS_PARALLELISM = "false"

& $Python -m streamlit run app\ui_streamlit.py --server.address 127.0.0.1 --server.fileWatcherType none
