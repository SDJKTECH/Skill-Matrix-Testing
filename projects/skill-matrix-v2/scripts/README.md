# Scripts Directory

This directory contains utility scripts organized by purpose.

## Directory Structure

```
scripts/
├── dev/          # Development and runtime scripts
│   ├── start-all-backend.ps1       # Start all backend functions for local dev
│   ├── run-backend-function.ps1    # Run backend Cloud Functions locally (PowerShell)
│   ├── run-backend-function.sh      # Run backend Cloud Functions locally (Bash)
│   └── run-frontend.ps1             # Run frontend development server
└── test/         # Testing and verification scripts
    └── test-app.ps1                 # Verify application setup and dependencies
```

## Usage

### Development Scripts

#### Start All Backend Functions (PowerShell)
```powershell
.\scripts\dev\start-all-backend.ps1 [--list-only] [--skills-only] [--employee-only] [--certificates-only] [--aggregations-only]
```

- `--list-only`: List functions and ports only; do not start.
- `--skills-only`: Start only skills-related functions.
- `--employee-only`: Start only employee-related functions.
- `--certificates-only`: Start only certificate-related functions.
- `--aggregations-only`: Start only aggregation-related functions (e.g. `get_combined_hierarchy_v2`).

See [docs/development/NEW_BACKEND_API_INTEGRATION.md](../docs/development/NEW_BACKEND_API_INTEGRATION.md) for full details.

#### Run Backend Function (PowerShell)
```powershell
.\scripts\dev\run-backend-function.ps1 <function-directory> [port]
```

Example:
```powershell
.\scripts\dev\run-backend-function.ps1 getCertificateMapping_v2 8080
```

#### Run Backend Function (Bash/Linux/Mac)
```bash
./scripts/dev/run-backend-function.sh <function-directory> [port]
```

#### Run Frontend
```powershell
.\scripts\dev\run-frontend.ps1
```

### Test Scripts

#### Test Application Setup
```powershell
.\scripts\test\test-app.ps1
```

This script verifies:
- Python installation
- Node.js and npm installation
- Project structure
- Dependencies installation
- Environment files (.env)

## Notes

- All scripts should be run from the project root directory
- Development scripts help run the application locally
- Test scripts verify the environment and setup
