# Database Directory

This directory contains database schema and migration scripts.

## Files

- **`ddl_v2.sql`** - Complete database schema definition for Skill Matrix V2
  - Schema: `skill_matrix_v2_prod`
  - Includes all tables, sequences, indexes, constraints, and triggers
  - Uses ENUM types for fixed-value fields
  - Follows naming conventions: PascalCase tables, snake_case columns

- **`ER_DIAGRAM.md`** - Entity Relationship Diagram (ERD) for the database
  - Mermaid format for visualization
  - Shows all tables, relationships, and ENUM types
  - Can be viewed in GitHub, VS Code (with Mermaid extension), or online at mermaid.live
  - **Note**: Mermaid doesn't support manual table positioning

- **`ER_DIAGRAM.dbml`** - DBML format for dbdiagram.io
  - **Recommended for custom layouts** - You can drag and rearrange tables
  - Interactive diagram with better layout control
  - Export as PNG, PDF, or SQL

## Schema Overview

### Core Tables
- `Employee` - Employee information
- `EmployeeSkills` - Employee skill assignments
- `EmployeeCertificates` - Employee certificate records
- `EmployeeTrainings` - Employee training records

### Master Tables (Skills)
- `MasterDomain` - Skill domains
- `MasterDiscipline` - Skill disciplines
- `MasterSkillArea` - Skill areas
- `MasterFramework` - Frameworks/tools
- `SkillHierarchyLink` - Links domain, discipline, skill area, and framework

### Master Tables (Certificates)
- `MasterCertificate` - Certificate definitions
- `MasterCertificateProvider` - Certificate providers
- `ProviderCertificateMapping` - Provider-Certificate mappings

### Master Tables (Training)
- `MasterArea` - Training areas
- `MasterSubarea` - Training sub-areas
- `MasterModule` - Training modules
- `TrainingHierarchyLinks` - Links area, subarea, and module

### Quiz Tables
- `quiz` - Quizzes attached to a training module, with a pass mark
- `quiz_question` - Questions of a quiz
- `quiz_option` - Answer options of a question (`is_correct` marks the right ones)
- `quiz_attempt` - One employee's attempt; locked once Submitted
- `quiz_attempt_answer` - The options an employee selected in an attempt

### Other Tables
- `Comment` - Polymorphic comments for skills, certificates, and trainings

## ENUM Types

1. `skill_level_enum` - L1, L2, L3
2. `approval_status_enum` - Pending, Approved, Rejected, Pre-Approved
3. `training_status_enum` - Not Started, In Progress, Completed, Not Completed
4. `employee_type_enum` - New Lateral, Existing Lateral, Freshers, Customer, Interns
5. `comment_type_enum` - Employee, Manager, Department
6. `quiz_type_enum` - Lesson, Course Assessment
7. `quiz_question_type_enum` - Single Choice, Multiple Choice
8. `quiz_attempt_status_enum` - In Progress, Submitted

## Usage

To apply the schema to your database:

```sql
\i database/ddl_v2.sql
```

Or in psql:
```bash
psql -U postgres -d your_database -f database/ddl_v2.sql
```

## Viewing the ER Diagram

### Option 1: dbdiagram.io (Recommended - Drag & Drop Layout)
1. Go to https://dbdiagram.io
2. Click "Import" or create a new project
3. Copy and paste the contents of `ER_DIAGRAM.dbml`
4. **You can now drag tables around to arrange them as you like!**
5. Export as PNG, PDF, or SQL when done

### Option 2: Mermaid (Fixed Layout)
**In VS Code:**
1. Install the Mermaid extension
2. Open `ER_DIAGRAM.md`
3. Use Markdown preview (Ctrl+Shift+V)

**Online:**
1. Go to https://mermaid.live
2. Copy the mermaid code block from `ER_DIAGRAM.md`
3. Paste and view the diagram

**In GitHub/GitLab:**
The diagram will automatically render when viewing the file in the repository.

**Note**: Mermaid diagrams have automatic layout - you cannot manually position tables.
