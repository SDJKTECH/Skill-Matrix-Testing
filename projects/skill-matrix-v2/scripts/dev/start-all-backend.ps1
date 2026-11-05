# PowerShell script to start all backend functions for local development
# Usage: .\scripts\dev\start-all-backend.ps1 [--list-only] [--skills-only] [--employee-only] [--certificates-only] [--data-only] [--aggregations-only] [--genai-only] [--reports-only]
#   --list-only: Only list functions, don't start them
#   --skills-only: Only start skills-related functions
#   --employee-only: Only start employee-related functions
#   --certificates-only: Only start certificate-related functions
#   --data-only: Only start data-related functions
#   --aggregations-only: Only start aggregation-related functions
#   --genai-only: Only start genai-related functions
#   --reports-only: Only start report-related functions

param(
    [switch]$ListOnly = $false,
    [switch]$SkillsOnly = $false,
    [switch]$EmployeeOnly = $false,
    [switch]$CertificatesOnly = $false,
    [switch]$DataOnly = $false,
    [switch]$AggregationsOnly = $false,
    [switch]$GenaiOnly = $false,
    [switch]$ReportsOnly = $false
)

$basePath = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Port mapping (matches vite.config.js and actual function entry points)
$allFunctions = @(
    # Skills functions
    @{name="save_employee_skill_v2"; path="backend\skills\saveEmployeeSkill_v2"; port=8080; category="skills"},
    @{name="get_employee_skill_v2"; path="backend\skills\getEmployeeSkill_v2"; port=8081; category="skills"},
    @{name="get_skill_hierarchy_link_v2"; path="backend\skills\getSkillHierarchyLink_v2"; port=8082; category="skills"},
    @{name="get_pending_skill_request_v2"; path="backend\skills\getPendingSkillRequest_v2"; port=8083; category="skills"},
    @{name="review_skill_request_v2"; path="backend\skills\reviewSkillRequest_v2"; port=8084; category="skills"}
    # Employee functions
    @{name="save_employee_v2"; path="backend\employee\saveEmployee_v2"; port=8090; category="employee"},
    @{name="update_manager_email_v2"; path="backend\employee\update_manager_email_v2"; port=8091; category="employee"},
    @{name="upload_cv_v2"; path="backend\employee\uploadCv_v2"; port=8092; category="employee"},
    @{name="get_employee_skills_info"; path="backend\employee\getEmployeeSkillsInfo_v2"; port=8093; category="employee"},
    # Certificate functions
    @{name="get_certificate_mapping_v2"; path="backend\certificates\getCertificateMapping_v2"; port=8100; category="certificates"},
    @{name="get_employee_certificate_v2"; path="backend\certificates\getEmployeeCertificate_v2"; port=8102; category="certificates"},
    @{name="save_employee_certificate_v2"; path="backend\certificates\saveEmployeeCertificate_v2"; port=8104; category="certificates"},
    # Data functions
    @{name="get_master_file_v2"; path="backend\data\getMasterFile_v2"; port=8085; category="data"},
     @{name="add_skill_v2"; path="backend\data\addSkill_v2"; port=8087; category="data"},
    @{name="add_certificate_v2"; path="backend\data\addCertificate_v2"; port=8107; category="certificates"},# Aggregation functions
    @{name="add_training_v2"; path="backend\data\addTraining_v2"; port=8108; category="data"},
    @{name="get_combined_hierarchy_v2"; path="backend\aggregations\getCombinedHierarchy_v2"; port=8110; category="aggregations"},
    @{name="manage_comments_v2"; path="backend\aggregations\manageComments_v2"; port=8111; category="aggregations"},

    # Quiz functions
    @{name="attempt_quiz_v2"; path="backend\quiz\attemptQuiz_v2"; port=8112; category="quiz"},

    # GenAI functions
    @{name="ask_question_v2"; path="backend\genai\askQuestion_v2"; port=8120; category="genai"},
    # Reports functions
    @{name="get_employee_skill_matrix_report_v2"; path="backend\reports\getEmployeeSkillMatrixReport_v2"; port=8086; category="reports"},
    @{name="get_employee_skills_report_v2"; path="backend\reports\getEmployeeSkillsReport_v2"; port=8088; category="reports"},
    @{name="get_employee_certificate_report_v2"; path="backend\reports\getEmployeeCertificateReport_v2"; port=8095; category="reports"},
    @{name="get_employee_training_report_v2"; path="backend\reports\getEmployeeTrainingReport_v2"; port=8096; category="reports"},
    @{name="get_training_analytics_v2"; path="backend\reports\getTrainingAnalytics_v2"; port=8097; category="reports"}
)

# Filter functions based on parameters
$functions = $allFunctions
if ($SkillsOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "skills" }
} elseif ($EmployeeOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "employee" }
} elseif ($CertificatesOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "certificates" }
} elseif ($DataOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "data" }
} elseif ($AggregationsOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "aggregations" }
} elseif ($GenaiOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "genai" }
} elseif ($ReportsOnly) {
    $functions = $allFunctions | Where-Object { $_.category -eq "reports" }
}

Write-Host "=== Backend Functions Port Mapping ===" -ForegroundColor Cyan
Write-Host ""

foreach ($func in $functions) {
    Write-Host "  $($func.name.PadRight(35)) -> Port $($func.port)" -ForegroundColor Yellow
}

if ($ListOnly) {
    Write-Host ""
    Write-Host "=== Quick Start Commands ===" -ForegroundColor Cyan
    Write-Host ""
    foreach ($func in $functions) {
        $fullPath = Join-Path $basePath $func.path
        Write-Host "# $($func.name) (Port $($func.port))" -ForegroundColor Gray
        Write-Host "cd `"$fullPath`"" -ForegroundColor White
        Write-Host "functions-framework --target=$($func.name) --source main.py --debug --port=$($func.port)" -ForegroundColor White
        Write-Host ""
    }
    Write-Host "Run without --list-only to automatically start all functions" -ForegroundColor Green
    exit
}

Write-Host ""
Write-Host "=== Starting Backend Functions ===" -ForegroundColor Green
Write-Host ""

$startedFunctions = @()

foreach ($func in $functions) {
    $fullPath = Join-Path $basePath $func.path
    
    if (-not (Test-Path $fullPath)) {
        Write-Host "  X $($func.name) - Path not found: $fullPath" -ForegroundColor Red
        continue
    }
    
    if (-not (Test-Path (Join-Path $fullPath "main.py"))) {
        Write-Host "  X $($func.name) - main.py not found" -ForegroundColor Red
        continue
    }
    
    # Check if port is already in use
    $portInUse = Get-NetTCPConnection -LocalPort $func.port -ErrorAction SilentlyContinue
    if ($portInUse) {
        Write-Host "  ! $($func.name) (Port $($func.port)) - Port already in use, skipping" -ForegroundColor Yellow
        continue
    }
    
    # Start function in a new PowerShell window
    $command = "cd '$fullPath'; functions-framework --target=$($func.name) --source main.py --debug --port=$($func.port)"
    
    try {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $command -WindowStyle Minimized
        Write-Host "  + $($func.name) (Port $($func.port)) - Started" -ForegroundColor Green
        $startedFunctions += $func
        Start-Sleep -Milliseconds 500
    } catch {
        Write-Host "  X $($func.name) - Failed to start: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$color = if ($startedFunctions.Count -eq $functions.Count) { "Green" } else { "Yellow" }
Write-Host "  Started: $($startedFunctions.Count) / $($functions.Count) functions" -ForegroundColor $color
Write-Host ""
Write-Host "All functions are running in minimized PowerShell windows." -ForegroundColor Green
Write-Host "Check Task Manager to see running processes." -ForegroundColor Gray
Write-Host ""
Write-Host "To stop all functions, close the PowerShell windows." -ForegroundColor Yellow
Write-Host ""
Write-Host "Port mapping is configured in frontend/vite.config.js" -ForegroundColor Green
