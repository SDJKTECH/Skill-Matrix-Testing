#!/bin/bash
# Bash script to start all backend functions for local development (WSL/Linux/macOS)
# Usage: bash scripts/dev/start-all-backend.sh [OPTIONS]
#   --list-only          Only list functions, don't start them
#   --skills-only        Only start skills-related functions
#   --employee-only      Only start employee-related functions
#   --certificates-only  Only start certificate-related functions
#   --data-only          Only start data-related functions
#   --aggregations-only  Only start aggregation-related functions
#   --genai-only         Only start genai-related functions
#   --reports-only       Only start report-related functions

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_ENV_FILE="$BASE_DIR/backend/.env"

print_env_file_details() {
    local env_file="$1"
    local label="$2"

    echo -e "\033[36m=== Active $label Environment ===\033[0m"
    if [ ! -f "$env_file" ]; then
        echo -e "  \033[33m.env file not found: $env_file\033[0m"
        echo ""
        return
    fi

    echo -e "  \033[90mFile: $env_file\033[0m"
    echo -e "  \033[90mUpdated: $(date -r "$env_file" '+%Y-%m-%d %H:%M:%S %Z')\033[0m"
    echo ""

    while IFS= read -r line || [ -n "$line" ]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"

        if [ -z "$line" ] || [[ "$line" == \#* ]] || [[ "$line" != *"="* ]]; then
            continue
        fi

        local key="${line%%=*}"
        local value="${line#*=}"
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"

        if [[ "$key" =~ ^(GCP_PROJECT|GOOGLE_APPLICATION_CREDENTIALS|api_key|ENV|BASE_URL|SEND_EMAIL_URL|APP_URL|EMAIL_TEMPLATE|OPENAI_API_KEY|DB_SCHEMA_PROD|DB_SCHEMA_DEV)$ ]]; then
            continue
        fi

        if [[ "${key^^}" =~ (PASS|PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|PRIVATE) ]]; then
            value="[redacted]"
        fi

        printf "  \033[33m%-32s\033[0m %s\n" "$key" "$value"
    done < "$env_file"
    echo ""
}

# Parse arguments
LIST_ONLY=false
FILTER=""

for arg in "$@"; do
    case "$arg" in
        --list-only)       LIST_ONLY=true ;;
        --skills-only)     FILTER="skills" ;;
        --employee-only)   FILTER="employee" ;;
        --certificates-only) FILTER="certificates" ;;
        --data-only)       FILTER="data" ;;
        --aggregations-only) FILTER="aggregations" ;;
        --genai-only)      FILTER="genai" ;;
        --reports-only)    FILTER="reports" ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# ─── Function definitions: "name|path|port|category" ───
FUNCTIONS=(
    # Skills
    "save_employee_skill_v2|backend/skills/saveEmployeeSkill_v2|8080|skills"
    "get_employee_skill_v2|backend/skills/getEmployeeSkill_v2|8081|skills"
    "get_skill_hierarchy_link_v2|backend/skills/getSkillHierarchyLink_v2|8082|skills"
    "get_pending_skill_request_v2|backend/skills/getPendingSkillRequest_v2|8083|skills"
    "review_skill_request_v2|backend/skills/reviewSkillRequest_v2|8084|skills"
    # Employee
    "save_employee_v2|backend/employee/saveEmployee_v2|8090|employee"
    "update_manager_email_v2|backend/employee/update_manager_email_v2|8091|employee"
    "upload_cv_v2|backend/employee/uploadCv_v2|8092|employee"
    "get_employee_skills_info|backend/employee/getEmployeeSkillsInfo_v2|8093|employee"
    "get_emp_training_course_v2|backend/employee/getEmpTrainingCourse_v2|8094|employee"
    # Certificates
    "get_certificate_mapping_v2|backend/certificates/getCertificateMapping_v2|8100|certificates"
    "get_employee_certificate_v2|backend/certificates/getEmployeeCertificate_v2|8102|certificates"
    "save_employee_certificate_v2|backend/certificates/saveEmployeeCertificate_v2|8104|certificates"
    # Data
    "get_master_file_v2|backend/data/getMasterFile_v2|8085|data"
    "add_skill_v2|backend/data/addSkill_v2|8087|data"
    "add_certificate_v2|backend/data/addCertificate_v2|8107|data"
    "add_training_v2|backend/data/addTraining_v2|8108|data"
    "add_training_course_v2|backend/data/addTrainingCourse_v2|8112|data"
    # Aggregations
    "get_combined_hierarchy_v2|backend/aggregations/getCombinedHierarchy_v2|8110|aggregations"
    "manage_comments_v2|backend/aggregations/manageComments_v2|8111|aggregations"
    # GenAI
    "ask_question_v2|backend/genai/askQuestion_v2|8120|genai"
    # Reports
    "get_employee_skill_matrix_report_v2|backend/reports/getEmployeeSkillMatrixReport_v2|8086|reports"
    "get_employee_skills_report_v2|backend/reports/getEmployeeSkillsReport_v2|8088|reports"
    "get_employee_certificate_report_v2|backend/reports/getEmployeeCertificateReport_v2|8095|reports"
    "get_employee_training_report_v2|backend/reports/getEmployeeTrainingReport_v2|8096|reports"
    "get_training_analytics_v2|backend/reports/getTrainingAnalytics_v2|8097|reports"
)

print_env_file_details "$BACKEND_ENV_FILE" "Backend"

# ─── Print port mapping ───
echo -e "\033[36m=== Backend Functions Port Mapping ===\033[0m"
echo ""

for entry in "${FUNCTIONS[@]}"; do
    IFS='|' read -r NAME FUNC_PATH PORT CATEGORY <<< "$entry"
    if [ -n "$FILTER" ] && [ "$CATEGORY" != "$FILTER" ]; then
        continue
    fi
    printf "  \033[33m%-35s -> Port %s\033[0m\n" "$NAME" "$PORT"
done

# ─── List-only mode ───
if [ "$LIST_ONLY" = true ]; then
    echo ""
    echo -e "\033[36m=== Quick Start Commands ===\033[0m"
    echo ""
    for entry in "${FUNCTIONS[@]}"; do
        IFS='|' read -r NAME FUNC_PATH PORT CATEGORY <<< "$entry"
        if [ -n "$FILTER" ] && [ "$CATEGORY" != "$FILTER" ]; then
            continue
        fi
        FULL_PATH="$BASE_DIR/$FUNC_PATH"
        echo -e "\033[90m# $NAME (Port $PORT)\033[0m"
        echo "cd \"$FULL_PATH\""
        echo "functions-framework --target=$NAME --source main.py --debug --port=$PORT"
        echo ""
    done
    echo -e "\033[32mRun without --list-only to automatically start all functions\033[0m"
    exit 0
fi

# ─── Start functions ───
echo ""
echo -e "\033[32m=== Starting Backend Functions ===\033[0m"
echo ""

PIDS=()
STARTED=0
TOTAL=0

cleanup() {
    echo ""
    echo -e "\033[33mStopping all backend functions...\033[0m"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null
    done
    wait 2>/dev/null
    echo -e "\033[32mAll functions stopped.\033[0m"
    exit 0
}
trap cleanup SIGINT SIGTERM

for entry in "${FUNCTIONS[@]}"; do
    IFS='|' read -r NAME FUNC_PATH PORT CATEGORY <<< "$entry"
    if [ -n "$FILTER" ] && [ "$CATEGORY" != "$FILTER" ]; then
        continue
    fi
    TOTAL=$((TOTAL + 1))

    FULL_PATH="$BASE_DIR/$FUNC_PATH"

    # Check path exists
    if [ ! -d "$FULL_PATH" ]; then
        echo -e "  \033[31m✗ $NAME - Path not found: $FULL_PATH\033[0m"
        continue
    fi

    # Check main.py exists
    if [ ! -f "$FULL_PATH/main.py" ]; then
        echo -e "  \033[31m✗ $NAME - main.py not found\033[0m"
        continue
    fi

    # Check if port is already in use
    if ss -tlnp 2>/dev/null | grep -q ":${PORT} " || lsof -i :"$PORT" >/dev/null 2>&1; then
        echo -e "  \033[33m! $NAME (Port $PORT) - Port already in use, skipping\033[0m"
        continue
    fi

    # Start function in background
    (cd "$FULL_PATH" && functions-framework --target="$NAME" --source main.py --debug --port="$PORT" > "$FULL_PATH/function.log" 2>&1) &
    PIDS+=($!)
    STARTED=$((STARTED + 1))
    echo -e "  \033[32m+ $NAME (Port $PORT) - Started (PID: ${PIDS[-1]})\033[0m"
    sleep 0.2
done

echo ""
echo -e "\033[36m=== Summary ===\033[0m"
if [ "$STARTED" -eq "$TOTAL" ]; then
    echo -e "  \033[32mStarted: $STARTED / $TOTAL functions\033[0m"
else
    echo -e "  \033[33mStarted: $STARTED / $TOTAL functions\033[0m"
fi
echo ""
echo -e "\033[32mAll functions are running in the background.\033[0m"
echo -e "\033[90mLogs are at: <function_directory>/function.log\033[0m"
echo ""
echo -e "\033[33mPress Ctrl+C to stop all functions.\033[0m"
echo ""
echo -e "\033[32mPort mapping is configured in frontend/vite.config.js\033[0m"

# Wait for all background processes
wait
