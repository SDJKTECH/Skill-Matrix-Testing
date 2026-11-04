#!/bin/bash
# Bash script to run the frontend locally (WSL/Linux/macOS)
# Usage: bash scripts/dev/run-frontend.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "\033[32mStarting Frontend Development Server\033[0m"
echo ""

# Check if .env file exists
if [ ! -f "$BASE_DIR/frontend/.env" ]; then
    echo -e "\033[33mWarning: .env file not found in frontend directory\033[0m"
    echo -e "\033[33mCreating .env from example...\033[0m"

    cat > "$BASE_DIR/frontend/.env" <<EOF
VITE_BASE_URL=/
VITE_SSO_URL=https://jktech-auth-gateway-140475459295.asia-south1.run.app
EOF

    echo -e "\033[36m.env file created. Please update VITE_BASE_URL if your backend runs on a different port.\033[0m"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "$BASE_DIR/frontend/node_modules" ]; then
    echo -e "\033[33mInstalling dependencies...\033[0m"
    (cd "$BASE_DIR/frontend" && npm install)
    echo ""
fi

cd "$BASE_DIR/frontend" || exit 1

echo -e "\033[32mStarting Vite development server...\033[0m"
echo -e "\033[36mFrontend will be available at: http://localhost:5173\033[0m"
echo ""

npm run dev
