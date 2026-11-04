# PowerShell script to run a backend function locally
# Usage: .\scripts\dev\run-backend-function.ps1 <function-directory> [port]

param(
    [Parameter(Mandatory=$true)]
    [string]$FunctionDir,
    
    [Parameter(Mandatory=$false)]
    [int]$Port = 8080
)

$FunctionPath = "backend\$FunctionDir"

if (-not (Test-Path $FunctionPath)) {
    Write-Host "Error: Function directory '$FunctionPath' not found!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$FunctionPath\main.py")) {
    Write-Host "Error: main.py not found in '$FunctionPath'!" -ForegroundColor Red
    exit 1
}

# Extract function name from directory (e.g., getCertificateMapping_v2 -> get_certificate_mapping_v2)
$FunctionName = $FunctionDir -replace '([A-Z])', '_$1' -replace '^_', '' -replace '-', '_'
$FunctionName = $FunctionName.ToLower()

Write-Host "Starting function: $FunctionName" -ForegroundColor Green
Write-Host "Directory: $FunctionPath" -ForegroundColor Cyan
Write-Host "Port: $Port" -ForegroundColor Cyan
Write-Host "URL: http://localhost:$Port/" -ForegroundColor Yellow
Write-Host ""

# Check if .env file exists
if (-not (Test-Path "$FunctionPath\.env")) {
    Write-Host "Warning: .env file not found in $FunctionPath" -ForegroundColor Yellow
    Write-Host "Make sure to create .env with database credentials!" -ForegroundColor Yellow
    Write-Host ""
}

# Change to function directory and run
Set-Location $FunctionPath

# Check if functions-framework is installed
$frameworkInstalled = python -c "import functions_framework" 2>$null
if (-not $frameworkInstalled) {
    Write-Host "Installing functions-framework..." -ForegroundColor Yellow
    pip install functions-framework
}

Write-Host "Running function..." -ForegroundColor Green
functions-framework --target=$FunctionName --source main.py --debug --port=$Port
