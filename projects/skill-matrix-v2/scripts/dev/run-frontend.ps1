# PowerShell script to run the frontend locally
# Usage: .\scripts\dev\run-frontend.ps1

Write-Host "Starting Frontend Development Server" -ForegroundColor Green
Write-Host ""

# Check if .env file exists
if (-not (Test-Path "frontend\.env")) {
    Write-Host "Warning: .env file not found in frontend directory" -ForegroundColor Yellow
    Write-Host "Creating .env from example..." -ForegroundColor Yellow
    
    $envContent = @"
VITE_BASE_URL=http://localhost:8080/
VITE_SSO_URL=https://jktech-auth-gateway-140475459295.asia-south1.run.app
"@
    
    Set-Content -Path "frontend\.env" -Value $envContent
    Write-Host ".env file created. Please update VITE_BASE_URL if your backend runs on a different port." -ForegroundColor Cyan
    Write-Host ""
}

# Check if node_modules exists
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
    Write-Host ""
}

Set-Location frontend

Write-Host "Starting Vite development server..." -ForegroundColor Green
Write-Host "Frontend will be available at: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

npm run dev
