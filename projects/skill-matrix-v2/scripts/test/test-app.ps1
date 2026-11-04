# PowerShell script to test the application
# This script helps verify that the app is set up correctly

Write-Host "=== Skill Matrix Application Test ===" -ForegroundColor Cyan
Write-Host ""

# Check Python
Write-Host "Checking Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Python not found! Please install Python 3.10+" -ForegroundColor Red
    exit 1
}

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found! Please install Node.js 18+" -ForegroundColor Red
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ npm found: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "✗ npm not found!" -ForegroundColor Red
    exit 1
}

# Check pip
Write-Host "Checking pip..." -ForegroundColor Yellow
$pipVersion = pip --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ pip found" -ForegroundColor Green
} else {
    Write-Host "✗ pip not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Checking project structure..." -ForegroundColor Yellow

# Check frontend
if (Test-Path "frontend") {
    Write-Host "✓ frontend directory exists" -ForegroundColor Green
    
    if (Test-Path "frontend\package.json") {
        Write-Host "✓ frontend/package.json exists" -ForegroundColor Green
    } else {
        Write-Host "✗ frontend/package.json not found" -ForegroundColor Red
    }
} else {
    Write-Host "✗ frontend directory not found" -ForegroundColor Red
}

# Check backend
if (Test-Path "backend") {
    Write-Host "✓ backend directory exists" -ForegroundColor Green
    
    $functionCount = (Get-ChildItem -Path "backend" -Directory).Count
    Write-Host "✓ Found $functionCount backend functions" -ForegroundColor Green
} else {
    Write-Host "✗ backend directory not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow

# Check frontend dependencies
if (Test-Path "frontend\node_modules") {
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "⚠ Frontend dependencies not installed. Run: cd frontend && npm install" -ForegroundColor Yellow
}

# Check functions-framework
$frameworkInstalled = python -c "import functions_framework" 2>$null
if ($frameworkInstalled) {
    Write-Host "✓ functions-framework installed" -ForegroundColor Green
} else {
    Write-Host "⚠ functions-framework not installed. Run: pip install functions-framework" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Checking environment files..." -ForegroundColor Yellow

# Check backend .env
$backendEnvCount = (Get-ChildItem -Path "backend" -Recurse -Filter ".env" -ErrorAction SilentlyContinue).Count
if ($backendEnvCount -gt 0) {
    Write-Host "✓ Found $backendEnvCount .env file(s) in backend" -ForegroundColor Green
} else {
    Write-Host "⚠ No .env files found in backend. Create .env files with database credentials." -ForegroundColor Yellow
}

# Check frontend .env
if (Test-Path "frontend\.env") {
    Write-Host "✓ frontend/.env exists" -ForegroundColor Green
} else {
    Write-Host "⚠ frontend/.env not found. Create it with VITE_BASE_URL and VITE_SSO_URL" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create .env files with your database credentials" -ForegroundColor White
Write-Host "2. Install missing dependencies if any" -ForegroundColor White
Write-Host "3. Run backend function: .\scripts\run-backend-function.ps1 <function-name> <port>" -ForegroundColor White
Write-Host "4. Run frontend: .\scripts\run-frontend.ps1" -ForegroundColor White
Write-Host ""
