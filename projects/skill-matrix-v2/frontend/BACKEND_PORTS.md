# Backend Function Port Mapping

This document lists the port assignments for local development. When starting backend functions, use these ports:

## Skills Functions
- `save_employee_skill_v2` → Port **8080**
- `get_employee_skill_v2` → Port **8081**
- `get_skill_hierarchy_link_v2` → Port **8082**
- `get_pending_skill_request_v2` → Port **8083**
- `review_skill_request_v2` → Port **8084**
- `get_master_file_v2` → Port **8085**
- `add_skill_v2` → Port **8087**

## Employee Functions
- `save_employee_v2` → Port **8090**
- `update_manager_email_v2` → Port **8091**
- `upload_cv_v2` → Port **8092**
- `get_employee_skills_info` → Port **8093**
- `get_emp_training_course_v2` → Port **8094**

## Certificate Functions
- `get_certificate_mapping_v2` → Port **8100**
- `get_employee_certificate_v2` → Port **8102**
- `get_employee_certificates_v2` → Port **8103**
- `save_employee_certificate_v2` → Port **8104**
- `get_certificate_requests` → Port **8105**
- `review_certificate` → Port **8106**
- `add_certificate_v2` → Port **8107**

## Training / Hierarchy
- `add_training_v2` → Port **8108**
- `get_combined_hierarchy_v2` → Port **8110**
- `add_training_course_v2` → Port **8112**

## Comments
- `manage_comments_v2` → Port **8111**

## GenAI Functions
- `ask_question_v2` → Port **8120**

## Reports
- `get_employee_skill_matrix_report_v2` → Port **8086**
- `get_employee_skills_report_v2` → Port **8088**
- `get_employee_certificate_report_v2` → Port **8095**
- `get_employee_training_report_v2` → Port **8096**
- `get_training_analytics_v2` → Port **8097**

## Adding New Functions

To add a new function:
1. Add the function name and port to `BACKEND_PORTS` in `vite.config.js`
2. Update this document with the new mapping
3. Add the function to `scripts/dev/start-all-backend.ps1` so it can be started with other backends
4. Restart the frontend dev server

The Vite proxy will automatically route requests to the correct port based on the endpoint name.

**Full guide (local run, deploy):** See [docs/development/NEW_BACKEND_API_INTEGRATION.md](../../docs/development/NEW_BACKEND_API_INTEGRATION.md).
