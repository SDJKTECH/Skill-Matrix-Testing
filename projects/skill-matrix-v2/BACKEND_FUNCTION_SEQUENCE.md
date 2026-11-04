# Backend Function Call Sequence - Frontend to Backend

This document lists all backend functions called by the frontend in the order they are invoked, from app initialization to user interactions.

## Quick Reference - Call Sequence Summary

| # | Phase | Function | When | Component/Context |
|---|-------|----------|------|-------------------|
| 1 | Init | `get_skill_hierarchy_link_v2` | App start | SkillContext |
| 2 | Init | `get_certificate_mapping_v2` | App start | CertificateContext |
| 3 | Auth | `save_employee_v2` | After login | AuthContext |
| 4 | Main | `get_employee_skill_v2` | Skills tab loads | EmployeeSkillTable |
| 5 | Main | `get_employee_certificate_v2` | Certs tab loads | EmployeeCertTable |
| 6 | Main | `get_employee_skills_hierarchy_v2` | Graph tab loads | HierarchyGraph |
| 7 | Main | `get_expert_skill_request` | Approve tab loads | SkillRequestList |
| 8 | Action | `save_employee_skill_v2` | User saves skills | SkillContext |
| 9 | Action | `save_employee_certificate_v2` | User saves certs | CertificateContext |
| 10 | Action | `review_skill` | Manager reviews skills | SkillContext |
| 11 | Action | `review_certificate` | Manager reviews certs | CertificateContext |
| 12 | Action | `update_manager_email` | User updates manager | AuthContext |
| 13 | Action | `upload_cv` | User uploads CV | AuthContext |
| 14 | Action | `get_master_file` | User downloads file | SkillContext/CertificateContext |
| 15 | Training | `add_training_v2` | Training tab loads / actions | training-batch, my-trainings |
| 16 | Training | `manage_comments_v2` | Batch notes panel | BatchNotesPanel |
| 17 | Training | `get_training_analytics_v2` | Training Analytics tab | TrainingAnalyticsDashboard |
| 18 | Dashboard | `get_combined_hierarchy_v2` | Manager Dashboard loads | ManagerDashboard |
| 19 | AI | `ask_question_v2` | Chat panel opened | ChatPanel |
| 20 | Reports | `get_employee_skill_matrix_report_v2` / `_skills_report_v2` / `_certificate_report_v2` / `_training_report_v2` | Report download buttons | (various) |
| 21 | Event | `webhook_consumer_v2` | Async, triggered by Pub/Sub, not called directly by frontend | — |

---

## App Initialization Phase

### 1. **App Start (main.jsx)**
   - No backend calls at this stage
   - Contexts are initialized: `ThemeProvider`, `CertificateProvider`, `SkillProvider`, `AuthProvider`

### 2. **SkillContext Initialization (SkillContext.jsx)**
   - **Function**: `get_skill_hierarchy_link_v2`
   - **Method**: `GET`
   - **When**: On component mount (useEffect with empty dependency array)
   - **Purpose**: Fetch master skills hierarchy data
   - **Location**: `frontend/src/context/SkillContext.jsx:53`
   - **Backend**: `backend/skills/getSkillHierarchyLink_v2/main.py`

### 3. **CertificateContext Initialization (CertificateContext.jsx)**
   - **Function**: `get_certificate_mapping_v2` (with fallback to `get_master_certificates`)
   - **Method**: `GET`
   - **When**: On component mount (useEffect with empty dependency array)
   - **Purpose**: Fetch master certificates mapping
   - **Location**: `frontend/src/context/CertificateContext.jsx:38`
   - **Backend**: `backend/certificates/getCertificateMapping_v2/main.py` or `backend/certificates/getMasterCertificate_v2/main.py`

### 4. **AuthContext Initialization (AuthContext.jsx)**
   - **Function**: Checks localStorage for existing token
   - **When**: On component mount (useEffect)
   - **If token exists**: Calls `getUserProfile()` which triggers `save_employee_v2`

---

## Authentication Phase

### 5. **User Login (AuthContext.jsx)**
   - **Function**: SSO Gateway (external redirect)
   - **When**: User clicks login button
   - **Location**: `frontend/src/context/AuthContext.jsx:139`

### 6. **Auth Callback Processing (AuthCallback.jsx → AuthContext.jsx)**
   - **Function**: `handleAuthCallback()` processes JWT token
   - **When**: After SSO redirect with token in URL
   - **Location**: `frontend/src/pages/AuthCallback.jsx:25`

### 7. **Get User Profile (AuthContext.jsx)**
   - **Function**: `getUserProfile()`
   - **When**: After receiving JWT token from SSO
   - **Sub-calls**:
     - **7a. Microsoft Graph Token** (if needed for photo)
       - **Function**: SSO Gateway `/graph-token` endpoint
       - **Method**: `GET`
       - **Location**: `frontend/src/context/AuthContext.jsx:207`
     - **7b. Microsoft Graph Photo** (if token available)
       - **Function**: Microsoft Graph API `/me/photo/$value`
       - **Method**: `GET`
       - **Location**: `frontend/src/context/AuthContext.jsx:221`
     - **7c. Save Employee Data**
       - **Function**: `save_employee_v2`
       - **Method**: `POST`
       - **When**: After decoding JWT and mapping profile
       - **Purpose**: Save/update employee data in database, get manager email and CV URL
       - **Location**: `frontend/src/context/AuthContext.jsx:301`
       - **Backend**: `backend/employee/saveEmployee_v2/main.py`

---

## Main Application Phase (After Login)

### 8. **MainComponent Loads (MainComponent.jsx)**
   - Default tab: "Add Skills" → `EmployeeSkillTable` component

### 9. **EmployeeSkillTable Component (EmployeeSkillTable.jsx)**
   - **Function**: `get_employee_skill_v2`
   - **Method**: `POST`
   - **When**: On component mount if `employeeSkills.length === 0`
   - **Purpose**: Fetch existing employee skills
   - **Location**: `frontend/src/component/EmployeeSkillTable.jsx:58`
   - **Triggered by**: `fetchEmployeeSkills()` from SkillContext
   - **Backend**: `backend/skills/getEmployeeSkill_v2/main.py`

### 10. **EmployeeCertTable Component (EmployeeCertTable.jsx)**
   - **Function**: `get_employee_certificate_v2`
   - **Method**: `POST`
   - **When**: When user switches to "Add Certification" tab and component mounts
   - **Purpose**: Fetch existing employee certificates
   - **Location**: `frontend/src/component/EmployeeCertTable.jsx:68`
   - **Triggered by**: `fetchEmployeeCertificates()` from CertificateContext
   - **Backend**: `backend/certificates/getEmployeeCertificate_v2/main.py`

### 11. **HierarchyGraph Component (HierarchyGraph.jsx)**
   - **Function**: `get_employee_skills_hierarchy_v2`
   - **Method**: `GET`
   - **When**: When user switches to "Skill Graph" tab and component mounts
   - **Purpose**: Fetch employee skills in hierarchical format for visualization
   - **Location**: `frontend/src/component/HierarchyGraph.jsx:1032`
   - **Triggered by**: `fetchEmployeeSkillsHierarchy()` from helper
   - **Backend**: `backend/skills/getEmployeeSkillHierarchy_v2/main.py`

### 12. **RequestList Component (RequestList.jsx)**
   - **Function**: `get_expert_skill_request`
   - **Method**: `GET`
   - **When**: When user switches to "Approve" tab and `SkillRequestList` component mounts
   - **Purpose**: Fetch pending skill approval requests for the manager
   - **Location**: `frontend/src/component/SkillRequestList.jsx:31`
   - **Triggered by**: `fetchEmployeeRequests()` from SkillContext
   - **Backend**: `backend/skills/getExpertSkillRequest_v2/main.py`
   
   - **Note**: `CertificateRequestList` component also exists and calls `get_certificate_requests`, but it's currently commented out in the RequestList component. If enabled, it would fetch certificate requests similarly.

---

## User Action Phase

### 13. **Save Employee Skills (SkillContext.jsx)**
   - **Function**: `save_employee_skill_v2`
   - **Method**: `POST`
   - **When**: User clicks "Save" button in skills table
   - **Purpose**: Save/update employee skills
   - **Location**: `frontend/src/context/SkillContext.jsx:160`
   - **Backend**: `backend/skills/saveEmployeeSkill_v2/main.py`
   - **After save**: Automatically calls `get_employee_skill_v2` to refresh data

### 14. **Save Employee Certificates (CertificateContext.jsx)**
   - **Function**: `save_employee_certificate_v2`
   - **Method**: `POST`
   - **When**: User clicks "Save" button in certificates table
   - **Purpose**: Save/update employee certificates
   - **Location**: `frontend/src/context/CertificateContext.jsx:201`
   - **Backend**: `backend/certificates/saveEmployeeCertificate_v2/main.py`
   - **After save**: Automatically calls `get_employee_certificate_v2` to refresh data

### 15. **Review Skill (Approve/Reject) (SkillContext.jsx)**
   - **Function**: `review_skill`
   - **Method**: `POST`
   - **When**: Manager approves or rejects skill requests in "Approve" tab
   - **Purpose**: Update skill approval status
   - **Location**: `frontend/src/context/SkillContext.jsx:305`
   - **Backend**: `backend/skills/reviewSkill_v2/main.py`

### 16. **Review Certificate (Approve/Reject) (CertificateContext.jsx)**
   - **Function**: `review_certificate`
   - **Method**: `POST`
   - **When**: Manager approves or rejects certificate requests
   - **Purpose**: Update certificate approval status
   - **Location**: `frontend/src/context/CertificateContext.jsx:314`
   - **Backend**: `backend/certificates/reviewCertificate_v2/main.py` (if exists)

### 17. **Update Manager Email (AuthContext.jsx)**
   - **Function**: `update_manager_email`
   - **Method**: `POST`
   - **When**: User updates manager email in Profile Modal
   - **Purpose**: Update employee's manager email
   - **Location**: `frontend/src/context/AuthContext.jsx:403`
   - **Note**: Frontend calls `update_manager_email`, but backend has `update_manager_email_v2` - may need endpoint alignment

### 18. **Upload CV (AuthContext.jsx)**
   - **Function**: `upload_cv`
   - **Method**: `POST` (multipart/form-data)
   - **When**: User uploads CV file in Profile Modal
   - **Purpose**: Upload employee CV to storage
   - **Location**: `frontend/src/context/AuthContext.jsx:443`
   - **Note**: Frontend calls `upload_cv`, but backend has `uploadCv_v2` - may need endpoint alignment

### 19. **Download Master Skills File (SkillContext.jsx)**
   - **Function**: `get_master_file`
   - **Method**: `GET`
   - **When**: User clicks download button for skills master file
   - **Purpose**: Download master skills file (CSV/Excel)
   - **Location**: `frontend/src/context/SkillContext.jsx:247`
   - **Backend**: `backend/skills/getMasterFile_v2/main.py`

### 20. **Download Master Certificates File (CertificateContext.jsx)**
   - **Function**: `get_master_file`
   - **Method**: `GET`
   - **When**: User clicks download button for certificates master file
   - **Purpose**: Download master certificates file (CSV/Excel)
   - **Location**: `frontend/src/context/CertificateContext.jsx:355`
   - **Backend**: `backend/skills/getMasterFile_v2/main.py` (same endpoint, different type parameter)

---

## Training Module

Added — the Training Batches feature (My Trainings, Manager Dashboard, Training Batches admin, Training Analytics) wasn't in this doc before.

### 21. **Training Batches / My Trainings (`frontend/src/features/training/`)**
   - **Functions**: `fetchTrainings`, `requestTrainingNomination`, `reviewTrainingNominations`, `fetchBatchEnrollments`, `suggestEmployees`
   - **Helper**: `frontend/src/helper/addTrainingV2Api.js` — all call `${BASE_URL}add_training_v2` with different methods/params
   - **Backend**: `backend/data/addTraining_v2/main.py`
   - **Also**: `frontend/src/helper/trainingBatchesApi.js` (`fetchBatches`, `createBatch`, `updateBatch`, `deleteBatch`) calls `${BASE_URL}add_training_v2/training_batch` — same backend function, batch-management sub-routes.
   - **Email side-effects**: nomination submitted/approved/rejected notifications via `notifications.py` in the same function directory (see `docs/data/addTraining_v2.md`).

### 22. **Batch Notes / Comments (`BatchNotesPanel.jsx`)**
   - **Function**: `fetchBatchNotes`, `createBatchNote`
   - **Helper**: `frontend/src/helper/trainingNotesApi.js` — calls `${BASE_URL}manage_comments_v2`
   - **Backend**: `backend/aggregations/manageComments_v2/main.py`
   - **Purpose**: Comments on a training enrollment, a certificate, a skill request, or (new) a whole training batch (`comment.batch_id`).

### 23. **Training Analytics (`TrainingAnalyticsDashboard.jsx`)**
   - **Helpers**: `frontend/src/features/training/training-analytics/api/trainingAnalyticsApi.js`, `certificateAnalyticsApi.js`
   - **Backend**: `backend/reports/getTrainingAnalytics_v2/main.py`
   - **When**: Training Analytics tab loads

---

## Manager Dashboard / Aggregations

Added — the Manager Dashboard's combined-hierarchy call wasn't in this doc before.

### 24. **Combined Hierarchy (`ManagerDashboard.jsx`, `HomeScreen.jsx`)**
   - **Function**: `get_combined_hierarchy_v2`
   - **Method**: `POST`
   - **Helper**: `frontend/src/helper/hierarchyApi.js` (`fetchCombinedHierarchy`)
   - **Backend**: `backend/aggregations/getCombinedHierarchy_v2/main.py`
   - **Purpose**: For managers — all subordinates' skills, certificates, and trainings in one combined-hierarchy response.

---

## AI Assistant (GenAI)

Added — the chat assistant wasn't in this doc before.

### 25. **Chat Panel (`ChatPanel.jsx`)**
   - **Function**: `ask_question_v2`
   - **Backend**: `backend/genai/askQuestion_v2/main.py`

---

## Reports Module

Added — the report-download functions weren't in this doc before.

### 26. **Report Downloads** (various trigger points — report/export buttons)
   - `backend/reports/getEmployeeSkillMatrixReport_v2/main.py`
   - `backend/reports/getEmployeeSkillsReport_v2/main.py`
   - `backend/reports/getEmployeeCertificateReport_v2/main.py`
   - `backend/reports/getEmployeeTrainingReport_v2/main.py`
   - `backend/reports/getTrainingAnalytics_v2/main.py` (also listed under Training Module above — it's both a report export and the Analytics tab's data source)
   - All private-IAM Cloud Functions behind the frontend proxy, generating Excel exports. See `docs/reports/*.md` for per-function detail.

---

## Event System / Webhooks

Added — the async webhook/event system wasn't in this doc before.

### 27. **Webhook Consumer (`backend/webhook_consumer_v2/main.py`)**
   - **Not called by the frontend.** Triggered by GCP Pub/Sub push subscriptions, configured via the `event_subscriptions_config` table (see `database/ddl_v2.sql`).
   - **Publisher**: `backend/utils/event_publisher.py`, called from other backend functions on relevant writes (e.g. skill/certificate/training changes), queries `event_subscriptions_config` for active subscriptions matching the event action.
   - See `docs/webhooks/webhook_consumer_v2.md` for the full architecture.

---

## Summary by Category

### Skills Functions
1. `get_skill_hierarchy_link_v2` - Get master skills (on app start)
2. `get_employee_skill_v2` - Get employee skills (when skills tab loads)
3. `save_employee_skill_v2` - Save employee skills (on save action)
4. `get_expert_skill_request` - Get pending skill requests (when approve tab loads)
5. `review_skill` - Approve/reject skills (on review action)
6. `get_master_file` (type: skills) - Download skills master file (on download action)
7. `get_employee_skills_hierarchy_v2` - Get skills hierarchy (when graph tab loads)

### Certificate Functions
1. `get_certificate_mapping_v2` - Get master certificates (on app start)
2. `get_employee_certificate_v2` - Get employee certificates (when certs tab loads)
3. `save_employee_certificate_v2` - Save employee certificates (on save action)
4. `get_certificate_requests` - Get pending certificate requests (when approve tab loads)
5. `review_certificate` - Approve/reject certificates (on review action)
6. `get_master_file` (type: certificates) - Download certificates master file (on download action)

### Employee Functions
1. `save_employee_v2` - Save/update employee data (on login)
2. `update_manager_email_v2` - Update manager email (on profile update)
3. `upload_cv` - Upload CV file (on CV upload)

### Training Functions (Added)
1. `add_training_v2` - Nominate/enroll/manage training batches (My Trainings, Training Batches admin)
2. `manage_comments_v2` - Batch/training/skill/certificate comments
3. `get_training_analytics_v2` - Training Analytics dashboard data

### Aggregation / Dashboard Functions (Added)
1. `get_combined_hierarchy_v2` - Manager Dashboard combined subordinate data

### AI Functions (Added)
1. `ask_question_v2` - Chat assistant

### Report Functions (Added)
1. `get_employee_skill_matrix_report_v2`
2. `get_employee_skills_report_v2`
3. `get_employee_certificate_report_v2`
4. `get_employee_training_report_v2`
5. `get_training_analytics_v2`

---

## Notes

- All backend functions use the Vite proxy configuration for routing
- Functions requiring authentication include JWT token in Authorization header
- Some functions are called automatically on component mount, others are triggered by user actions
- After save operations, the frontend automatically refreshes the data by calling the corresponding GET function
- (Added) Training Module, Manager Dashboard/Aggregations, AI Assistant, Reports Module, and Event System/Webhooks sections above cover functions this doc didn't previously list
