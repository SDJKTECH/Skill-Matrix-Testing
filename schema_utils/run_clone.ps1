# Installs requirements.txt, then runs clone_schema.py.
# Run from PowerShell:  powershell -ExecutionPolicy Bypass -File .\run_clone.ps1
# Extra arguments are passed to clone_schema.py, e.g. .\run_clone.ps1 --skip-backup

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$python = $null
foreach ($candidate in @("py", "python")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) { $python = $candidate; break }
}
if (-not $python) {
    Write-Host "Python was not found. Install it from https://www.python.org and tick 'Add to PATH'." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example. Fill in the real values, then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing requirements..." -ForegroundColor Cyan
& $python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "pip install failed." -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host "Running clone_schema.py..." -ForegroundColor Cyan
& $python clone_schema.py @args
exit $LASTEXITCODE
