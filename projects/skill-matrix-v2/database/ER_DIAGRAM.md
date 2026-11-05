# Skill Matrix V2 Database - ER Diagram

## Entity Relationship Diagram

```mermaid
erDiagram
    Employee {
        int id PK
        string email
        string emp_id
        string name
        string job_title
        string department
        int reports_to FK
        string role  // role_enum
        boolean is_manager
        string cv_public_url
        datetime created_at
        datetime updated_at
    }

    MasterDomain {
        int id PK
        string domain_name
        string description  // text
        boolean is_mandatory
        datetime created_at
        datetime updated_at
    }

    MasterDiscipline {
        int id PK
        string discipline_name
        string description  // text
        boolean is_mandatory
        boolean ismandatory
        datetime created_at
        datetime updated_at
    }

    MasterSkillArea {
        int id PK
        string skill_area
        string description  // text
        boolean is_mandatory
        boolean ismandatory
        datetime created_at
        datetime updated_at
    }

    MasterFramework {
        int id PK
        string framework_name
        string basic
        string intermediate
        string expert
        string description  // text
        boolean is_mandatory
        boolean ismandatory
        datetime created_at
        datetime updated_at
    }

    SkillHierarchyLink {
        int id PK
        int domain_id FK
        int discipline_id FK
        int skill_area_id FK
        int framework_id FK
        int skillarea_id
        datetime created_at
        datetime updated_at
    }

    EmployeeSkills {
        int id PK
        int employee_id FK
        int skill_hierarchy_id FK
        string level_selected  // skill_level_enum
        string approval_status // approval_status_enum
        string rejection_reason
        datetime requested_at
        datetime reviewed_at
        datetime created_at
        datetime updated_at
        int reviewed_by FK
    }

    MasterCertificate {
        int id PK
        string cert_name
        string cert_level
        string valid_years  // stored as varchar
        datetime created_at
        datetime updated_at
    }

    MasterCertificateProvider {
        int id PK
        string cert_provider
        datetime created_at
        datetime updated_at
    }

    ProviderCertificateMapping {
        int id PK
        int provider_id FK
        int certificate_id FK
        datetime created_at
        datetime updated_at
    }

    EmployeeCertificates {
        int id PK
        int employee_id FK
        int certificate_id FK
        datetime issued_date
        datetime expiry_date
        datetime created_at
        datetime updated_at
    }

    MasterArea {
        int area_id PK
        string area_name
        string description  // text
        datetime created_at
        datetime updated_at
    }

    MasterSubarea {
        int sub_area_id PK
        string sub_area_name
        string description  // text
        datetime created_at
        datetime updated_at
    }

    MasterModule {
        int module_id PK
        string module_name
        string course_level
        string description  // text
        datetime created_at
        datetime updated_at
    }

    TrainingHierarchyLinks {
        int training_hierarchy_id PK
        int area_id FK
        int sub_area_id FK
        int module_id FK
        datetime created_at
        datetime updated_at
    }

    TrainingBatches {
        int id PK
        string batch_num
        int training_hierarchy_id FK
        string batch_desc
        string training_quarter
        string batch_status     // training_batch_status_enum
        string batch_status_remarks
        date start_date
        date end_date
        string duration
        string training_mode    // training_mode_enum
        string trainer
        int batch_size
        string prerequisite
        string training_content
        string resources
        datetime created_at
        datetime updated_at
    }

    EmployeeTrainings {
        int employee_training_id PK
        int employee_id FK
        int batch_id FK
        string competency
        string training_status  // training_status_enum
        string status_remarks
        string employee_type    // employee_type_enum
        string nominated_by
        date start_date
        date end_date
        datetime created_at
        datetime updated_at
    }

    Comment {
        int comment_id PK
        int employee_training_id FK
        int employee_certificate_id FK
        int employee_skill_id FK
        string comment_type
        string comment_text
        datetime commented_at
        int commented_by_id FK
        datetime created_at
        datetime updated_at
        int batch_id FK
    }

    Quiz {
        int quiz_id PK
        int module_id FK
        string quiz_title
        string description
        string quiz_type
        decimal pass_percentage
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    QuizQuestion {
        int question_id PK
        int quiz_id FK
        string question_text
        string question_type
        decimal marks
        int display_order
        datetime created_at
        datetime updated_at
    }

    QuizOption {
        int option_id PK
        int question_id FK
        string option_text
        boolean is_correct
        int display_order
        datetime created_at
        datetime updated_at
    }

    QuizAttempt {
        int attempt_id PK
        int quiz_id FK
        int employee_id FK
        string status
        datetime started_at
        datetime submitted_at
        decimal score
        decimal max_score
        decimal percentage
        boolean passed
        datetime created_at
        datetime updated_at
    }

    QuizAttemptAnswer {
        int attempt_answer_id PK
        int attempt_id FK
        int question_id FK
        int option_id FK
        datetime created_at
        datetime updated_at
    }

    Employee ||--o{ Employee : manages
    MasterDomain ||--o{ SkillHierarchyLink : has
    MasterDiscipline ||--o{ SkillHierarchyLink : has
    MasterSkillArea ||--o{ SkillHierarchyLink : has
    MasterFramework ||--o{ SkillHierarchyLink : has
    Employee ||--o{ EmployeeSkills : has
    SkillHierarchyLink ||--o{ EmployeeSkills : assigned_to
    MasterCertificateProvider ||--o{ ProviderCertificateMapping : provides
    MasterCertificate ||--o{ ProviderCertificateMapping : mapped_to
    Employee ||--o{ EmployeeCertificates : has
    ProviderCertificateMapping ||--o{ EmployeeCertificates : issued_as
    MasterArea ||--o{ TrainingHierarchyLinks : contains
    MasterSubarea ||--o{ TrainingHierarchyLinks : contains
    MasterModule ||--o{ TrainingHierarchyLinks : contains
    TrainingHierarchyLinks ||--o{ TrainingBatches : scheduled_as
    Employee ||--o{ EmployeeTrainings : enrolled_in
    TrainingBatches ||--o{ EmployeeTrainings : assigned_to
    Employee ||--o{ Comment : creates
    EmployeeTrainings ||--o{ Comment : has
    EmployeeCertificates ||--o{ Comment : has
    EmployeeSkills ||--o{ Comment : has
    TrainingBatches ||--o{ Comment : has
    MasterModule ||--o{ Quiz : has
    Quiz ||--o{ QuizQuestion : contains
    QuizQuestion ||--o{ QuizOption : offers
    Quiz ||--o{ QuizAttempt : attempted_as
    Employee ||--o{ QuizAttempt : takes
    QuizAttempt ||--o{ QuizAttemptAnswer : records
    QuizOption ||--o{ QuizAttemptAnswer : chosen_in
    EventSubscriptionsConfig {
        int id PK
        string event_action
        string target_url
        string http_method
        jsonb headers
        jsonb params
        string pubsub_topic
        string pubsub_subscription
        boolean is_active
        int created_by
        datetime created_at
        datetime updated_at
    }

```

## ENUM Types

### 1. `skill_level_enum`
- Values: `'L1'`, `'L2'`, `'L3'`
- Used in: `EmployeeSkills.level_selected`

### 2. `approval_status_enum`
- Values: `'Pending'`, `'Approved'`, `'Rejected'`
- Used in: `EmployeeSkills.approval_status`

### 3. `training_status_enum`
- Values: `'Not Started'`, `'In Progress'`, `'Completed'`, `'Not Completed'`
- Used in: `EmployeeTrainings.training_status`

### 4. `employee_type_enum`
- Values: `'New Lateral'`, `'Existing Lateral'`, `'Freshers'`, `'Customer'`, `'Interns'`
- Used in: `EmployeeTrainings.employee_type`

### 5. `training_batch_status_enum`
- Values: `'Planned'`, `'Open'`, `'In Progress'`, `'Completed'`, `'Cancelled'`, `'Archived'`
- Used in: `TrainingBatches.batch_status`

### 6. `training_mode_enum`
- Values: `'Internal Videos'`, `'External Platforms'`, `'Hybrid'`, `'Internal Instructor-led'`, `'External Instructor-led'`
- Used in: `TrainingBatches.training_mode`

### 7. `comment_type_enum`
- Values: `'Employee'`, `'Manager'`, `'Department'`
- Used in: `Comment.comment_type`

### 8. `quiz_type_enum`
- Values: `'Lesson'`, `'Course Assessment'`
- Used in: `Quiz.quiz_type`

### 9. `quiz_question_type_enum`
- Values: `'Single Choice'`, `'Multiple Choice'`
- Used in: `QuizQuestion.question_type`

### 10. `quiz_attempt_status_enum`
- Values: `'In Progress'`, `'Submitted'`
- Used in: `QuizAttempt.status`

## Key Relationships

### One-to-Many Relationships
- **Employee → EmployeeSkills**: One employee can have multiple skills
- **Employee → EmployeeCertificates**: One employee can have multiple certificates
- **Employee → EmployeeTrainings**: One employee can be enrolled in multiple training batches
- **Employee → Comment**: One employee can make multiple comments
- **SkillHierarchyLink → EmployeeSkills**: One skill hierarchy can be assigned to multiple employees
- **TrainingHierarchyLinks → TrainingBatches**: One training hierarchy can have multiple batches scheduled against it
- **TrainingBatches → EmployeeTrainings**: One training batch can have multiple employees enrolled in it

### Many-to-Many Relationships (via Junction Tables)
- **MasterCertificate ↔ MasterCertificateProvider**: Many-to-many via `ProviderCertificateMapping`
- **MasterDomain, MasterDiscipline, MasterSkillArea, MasterFramework**: Combined into `SkillHierarchyLink` (4-way junction)
- **MasterArea, MasterSubarea, MasterModule**: Combined into `TrainingHierarchyLinks` (3-way junction)
- **Employee ↔ TrainingHierarchyLinks (via TrainingBatches)**: An employee's enrollment (`EmployeeTrainings.batch_id`) points at a `TrainingBatches` row, which in turn points at the hierarchy (`training_hierarchy_id`) — so multiple batches, and therefore multiple sets of enrolled employees, can share the same area/subarea/module

### Polymorphic Relationship
- **Comment**: Can reference either `EmployeeTrainings`, `EmployeeCertificates`, or `EmployeeSkills` (enforced by CHECK constraint)

## Notes

1. **Employee Self-Reference**: `Employee.manager_id` references `Employee.id` (primary key)
2. **Polymorphic Comment**: The `Comment` table uses multiple nullable foreign keys with a CHECK constraint to ensure exactly one is set
3. **All tables** have `created_at` and `updated_at` timestamps with automatic update triggers
4. **Foreign Key Actions**: Most use `ON UPDATE CASCADE` and appropriate `ON DELETE` actions (CASCADE, RESTRICT, SET NULL)
5. **Quiz attempts**: a `Submitted` `QuizAttempt` and its `QuizAttemptAnswer` rows are locked by trigger; `QuizOption.is_correct` must not be returned to the browser before submit; only one `In Progress` attempt is allowed per employee per quiz
5. **Employee ID**: `emp_id` is JKTech's business employee identifier, while `id` is the technical primary key used for all foreign key relationships