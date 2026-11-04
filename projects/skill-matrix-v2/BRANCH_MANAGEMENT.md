# Branch Management Guide

## Overview

This project uses a `development` and `main` branch strategy. Some files should **only exist in the development branch** and should not be merged to `main`.

## Files That Stay in Development Branch Only

### 1. Database Schema Files (Dev Environment)
- `database/ddl_v2.sql` - Development database schema
- `database/ER_DIAGRAM.dbml` - DBML diagram (dev tooling)
- `database/ER_DIAGRAM.md` - ER Diagram documentation

**Reason**: These are for development/testing. Production uses a different schema or deployment process.

### 2. Development Scripts
- `scripts/dev/*` - Local development scripts
- `scripts/test/*` - Testing scripts

**Reason**: These are for local development only, not needed in production.

## How to Manage This

### Option 1: Selective Merging (Recommended)

When merging `development` → `main`, **exclude** these files:

```bash
# Create a merge commit excluding dev-only files
git checkout main
git merge development --no-commit --no-ff

# Unstage dev-only files
git reset HEAD database/ddl_v2.sql
git reset HEAD database/ER_DIAGRAM.dbml
git reset HEAD database/ER_DIAGRAM.md
git reset HEAD scripts/dev/
git reset HEAD scripts/test/

# Commit the merge
git commit -m "Merge development to main (excluding dev-only files)"
```

### Option 2: Use .gitattributes (Automatic)

I've created a `.gitattributes` file that uses `merge=ours` strategy for dev-only files. This means:
- These files will keep their `main` branch version during merges
- Changes in `development` won't overwrite `main` for these files

**To use this:**
1. The `.gitattributes` file is already created
2. During merges, Git will automatically use the `main` branch version for these files

### Option 3: Branch Protection Rules (GitHub)

Set up branch protection on GitHub:

1. Go to **Settings** → **Branches**
2. Add rule for `main` branch
3. Enable **"Require pull request reviews"**
4. In the PR, manually exclude dev-only files from the merge

### Option 4: Separate Dev-Only Branch

Create a `dev-only` branch for development-specific files:
- Keep `development` for code that will merge to `main`
- Use `dev-only` for files that never merge

## Best Practices

1. **Document what stays in dev**: Keep this file updated
2. **Use PR templates**: Add checklist to exclude dev-only files
3. **Review merges carefully**: Always review what's being merged
4. **Use .gitattributes**: Automates the process (Option 2)

## Quick Reference

### Files to EXCLUDE from main merges:
```
database/ddl_v2.sql
database/ER_DIAGRAM.dbml
database/ER_DIAGRAM.md
scripts/dev/
scripts/test/
```

### Files that SHOULD merge to main:
```
backend/
frontend/
.github/workflows/
README.md
LICENSE
.gitignore
.gitattributes
```

## Example: Merging Development to Main

```bash
# 1. Ensure you're on main and it's up to date
git checkout main
git pull origin main

# 2. Merge development
git merge development --no-commit --no-ff

# 3. Unstage dev-only files
git restore --staged database/ddl_v2.sql
git restore --staged database/ER_DIAGRAM.*
git restore --staged scripts/dev/
git restore --staged scripts/test/

# 4. Commit the merge
git commit -m "Merge development to main (excluding dev-only files)"

# 5. Push
git push origin main
```

## Alternative: Use Git Merge Strategies

You can also use merge drivers. The `.gitattributes` file I created uses `merge=ours` which will:
- Keep the `main` branch version of these files
- Ignore changes from `development` branch for these specific files

This is the **easiest** approach - it's automatic!
