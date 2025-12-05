# PowerShell script to start both API and Web App servers
Write-Host "Starting Consumet API and Anime Web App..." -ForegroundColor Green
Write-Host ""

# Function to check if a command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Check if Node.js is installed
if (-not (Test-Command "node")) {
    Write-Host "Error: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Node.js version: $(node --version)" -ForegroundColor Cyan
Write-Host ""

# Check if dependencies are installed
$rootPackageJson = Test-Path "package.json"
$webAppPackageJson = Test-Path "anime-web-app\package.json"

if (-not $rootPackageJson) {
    Write-Host "Error: package.json not found in root directory" -ForegroundColor Red
    exit 1
}

# Install root dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing API dependencies..." -ForegroundColor Yellow
    npm install
}

# Install web app dependencies if needed
if ($webAppPackageJson -and -not (Test-Path "anime-web-app\node_modules")) {
    Write-Host "Installing Web App dependencies..." -ForegroundColor Yellow
    Push-Location anime-web-app
    npm install
    Pop-Location
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Starting servers..." -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "API Server: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Web App: Will open in a moment..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Red
Write-Host ""

# Start API server in background
$apiJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm start
}

# Wait a moment for API to start
Start-Sleep -Seconds 3

# Start Web App in background
$webJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location anime-web-app
    npm run dev
}

# Monitor jobs
Write-Host "Servers started! Monitoring output..." -ForegroundColor Green
Write-Host ""

try {
    while ($true) {
        # Check if jobs are still running
        if ($apiJob.State -ne "Running") {
            Write-Host "API server stopped unexpectedly" -ForegroundColor Red
            break
        }
        if ($webJob.State -ne "Running") {
            Write-Host "Web App server stopped unexpectedly" -ForegroundColor Red
            break
        }
        
        # Get and display job output
        $apiOutput = Receive-Job -Job $apiJob
        $webOutput = Receive-Job -Job $webJob
        
        if ($apiOutput) {
            Write-Host "[API] $apiOutput" -ForegroundColor Cyan
        }
        if ($webOutput) {
            Write-Host "[WEB] $webOutput" -ForegroundColor Magenta
        }
        
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping servers..." -ForegroundColor Yellow
    Stop-Job -Job $apiJob, $webJob
    Remove-Job -Job $apiJob, $webJob
    Write-Host "Servers stopped." -ForegroundColor Green
}
