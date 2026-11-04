#!/bin/bash
# Script to run a backend function locally
# Usage: ./scripts/dev/run-backend-function.sh <function-directory> [port]

if [ $# -lt 1 ]; then
    echo "Usage: $0 <function-directory> [port]"
    echo "Example: $0 getCertificateMapping_v2 8080"
    exit 1
fi

FUNCTION_DIR=$1
PORT=${2:-8080}
FUNCTION_PATH="backend/$FUNCTION_DIR"

if [ ! -d "$FUNCTION_PATH" ]; then
    echo "Error: Function directory '$FUNCTION_PATH' not found!"
    exit 1
fi

if [ ! -f "$FUNCTION_PATH/main.py" ]; then
    echo "Error: main.py not found in '$FUNCTION_PATH'!"
    exit 1
fi

# Extract function name from directory (e.g., getCertificateMapping_v2 -> get_certificate_mapping_v2)
FUNCTION_NAME=$(echo "$FUNCTION_DIR" | sed 's/\([A-Z]\)/_\1/g' | tr '[:upper:]' '[:lower:]' | sed 's/^_//' | sed 's/-/_/g')

echo "Starting function: $FUNCTION_NAME"
echo "Directory: $FUNCTION_PATH"
echo "Port: $PORT"
echo "URL: http://localhost:$PORT/"
echo ""

# Check if .env file exists
if [ ! -f "$FUNCTION_PATH/.env" ]; then
    echo "Warning: .env file not found in $FUNCTION_PATH"
    echo "Make sure to create .env with database credentials!"
    echo ""
fi

# Change to function directory
cd "$FUNCTION_PATH" || exit 1

# Check if functions-framework is installed
if ! python -c "import functions_framework" 2>/dev/null; then
    echo "Installing functions-framework..."
    pip install functions-framework
fi

echo "Running function..."
functions-framework --target="$FUNCTION_NAME" --source main.py --debug --port="$PORT"
