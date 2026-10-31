param([switch]$Apply)

$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$pythonPath = Join-Path $workspaceRoot 'venv\Scripts\python.exe'
$restorePath = Join-Path $PSScriptRoot '..\frontend-backups\20261031-094944\restore.py'

if ($Apply) {
    & $pythonPath $restorePath --apply
} else {
    & $pythonPath $restorePath
}
exit $LASTEXITCODE
