"""
Google Cloud Function that fetches combined hierarchy.
For managers: returns all subordinates' skills, certificates, and trainings
Uses SQLAlchemy ORM and environment variables.
"""

import os
import json
import logging
from typing import Dict
from urllib.parse import quote_plus

from flask import make_response
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def get_db_engine():
    """Create and return a SQLAlchemy engine using environment variables."""
    db_user = quote_plus(os.getenv("DB_USER"))
    db_pass = quote_plus(os.getenv("DB_PASS"))
    db_name = os.getenv("DB_NAME")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    
    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    
    engine = create_engine(db_url, poolclass=NullPool, future=True)
    return engine


def resolve_org_root_id(conn, schema):
    """
    Resolves the employee at the top of the ENTIRE organization, for the
    Admin "View Entire Organization" scope — dynamically, not a hardcoded
    id, so this keeps working with zero code changes whenever the real org
    root changes (a new CEO, a reorg, etc.).

    The schema's `reports_to` FK is `ON DELETE SET NULL` (see
    database/ddl_v2.sql) — if a manager is ever deleted without their
    reports being reassigned first, those orphaned reports also end up
    with reports_to IS NULL, alongside the real root. Tie-broken by direct
    report count (cheap: one indexed GROUP BY, not a recursive walk per
    candidate) rather than assuming there's always exactly one match — the
    real root will always have far more direct reports than an accidental
    orphan, so this is a reliable, low-cost way to pick correctly even if
    stray NULLs exist.
    """
    root_sql = text(
        f"""
        SELECT e.id
        FROM "{schema}".employee e
        LEFT JOIN "{schema}".employee r ON r.reports_to = e.id
        WHERE e.reports_to IS NULL
        GROUP BY e.id
        ORDER BY COUNT(r.id) DESC, e.id ASC
        LIMIT 1
        """
    )
    row = conn.execute(root_sql).mappings().fetchone()
    return row["id"] if row else None


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
  
    # Use json.dumps to guarantee insertion order is preserved and sorting is disabled
    response_body = json.dumps(data, sort_keys=False)
    
    response = make_response(response_body, status)
    response.headers["Content-Type"] = "application/json"
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response



def get_combined_hierarchy_v2(request):
    """
    Fetch combined hierarchy for a manager.
    Returns all subordinates' skills, certificates, and trainings.
    
    Request body:
    {
        "employeeId": <int>  // Employee ID of the manager
    }
    Or, for the Admin "View Entire Organization" view:
    {
        "root": "organization"  // employeeId omitted; root resolved
                                 // dynamically via resolve_org_root_id
                                 // (reports_to IS NULL). Named "root" (not
                                 // "scope") to avoid colliding with this
                                 // app's OTHER, unrelated "scope" concept
                                 // (Direct Reports vs Entire Team, see
                                 // ManagerDashboard.jsx) — this flag
                                 // controls which employee roots the WHOLE
                                 // tree, not how much of it to include.
    }
    """
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "3600"
        return response

    if request.method != "POST":
        return _cors_response({"error": "Method not allowed"}, 405)

    try:
        data = request.get_json(silent=True)
        if not data:
            return _cors_response({"error": "Missing JSON body"}, 400)

        # Get employee_id from request. root="organization" (Admin "View
        # Entire Organization") is the one case employeeId is optional —
        # the real root is resolved dynamically below instead of the
        # caller having to know/hardcode who it currently is.
        employee_id = data.get("employeeId")
        root = data.get("root")

        if root != "organization":
            if not employee_id:
                return _cors_response({"error": "Missing required field: employeeId"}, 400)

            # Validate employee_id is an integer
            try:
                employee_id = int(employee_id)
            except (ValueError, TypeError):
                return _cors_response(
                    {"error": "Invalid employeeId. Must be a valid integer."}, 400
                )

        engine = get_db_engine()
        schema = os.getenv("DB_SCHEMA")

        with engine.begin() as conn:

            if root == "organization":
                employee_id = resolve_org_root_id(conn, schema)
                if not employee_id:
                    logger.warning("root=organization requested but no root employee (reports_to IS NULL) exists")
                    return _cors_response({"error": "Could not resolve an organization root"}, 404)

            # Get Manager
            manager_sql = text(
                f"""
                SELECT id, emp_id, name, email
                FROM "{schema}".employee
                WHERE id = :employee_id
                """
            )
            result = conn.execute(manager_sql, {"employee_id": employee_id}).mappings().fetchone()

            if not result:
                logger.warning("Manager not found with ID: %s", employee_id)
                return _cors_response({"error": "Manager not found"}, 404)

            manager_id, manager_empId, manager_name, manager_email = result['id'], result['emp_id'], result['name'], result['email']

            manager_node = {
                "id": manager_id,
                "empId": manager_empId,
                "name": manager_name,
                "role": "Manager",
                "email": manager_email,
                "skills": {
                    "domainCount": 0,
                    "disciplineCount": 0,
                    "skillAreaCount": 0,
                    "frameworkCount": 0,
                    "l1Count": 0,
                    "l2Count": 0,
                    "l3Count": 0,
                    "activeSkillsCount": 0,
                    "pendingApprovalCount": 0,
                    "skillArray": [],
                },
                "certifications": {
                    "certificationCount": 0,
                    "certificationArray": [],
                    "recentCertificateName": None,
                },
                "trainings": {
                    "trainingCount": 0,
                    "completedTrainingCount": 0,
                    "trainingArray": [],
                },
                "associates": {
                    "associateCount": 0,
                    "associateArray1": [],
                },
            }

            # Get ALL Reportees Recursively (multi-level hierarchy)
            hierarchy_sql = text(
                f"""
                WITH RECURSIVE reportee_hierarchy AS (
                    SELECT
                        e.id,
                        e.emp_id,
                        e.name,
                        e.email,
                        e.reports_to AS manager_id,
                        m.email AS manager_email,
                        1 AS level,
                        ARRAY[:manager_id, e.id] AS path
                    FROM "{schema}".employee e
                    LEFT JOIN "{schema}".employee m ON e.reports_to = m.id
                    WHERE e.reports_to = :manager_id AND e.id != :manager_id

                    UNION ALL

                    SELECT
                        e.id,
                        e.emp_id,
                        e.name,
                        e.email,
                        e.reports_to AS manager_id,
                        m.email AS manager_email,
                        rh.level + 1,
                        rh.path || e.id
                    FROM "{schema}".employee e
                    LEFT JOIN "{schema}".employee m ON e.reports_to = m.id
                    INNER JOIN reportee_hierarchy rh ON e.reports_to = rh.id
                    WHERE NOT e.id = ANY(rh.path)
                )
                SELECT id, emp_id, name, email, manager_id, manager_email, level
                FROM reportee_hierarchy
                ORDER BY level, name
                """
            )

            all_reportees = conn.execute(hierarchy_sql, {"manager_id": manager_id}).mappings().fetchall()

            logger.info(
                "Found %s total reportees (all levels) for manager %s",
                len(all_reportees),
                manager_email,
            )

            # Build reportee dictionary for quick lookup
            reportee_dict = {}
            for rep in all_reportees:
                rep_id = rep['id']
                rep_emp_id = rep['emp_id']
                rep_name = rep['name']
                rep_email = rep['email']
                rep_manager_id = rep['manager_id']
                rep_manager_email = rep['manager_email']
                level = rep['level']


                reportee_node = {
                    "id": rep_id,
                    "empId": rep_emp_id if rep_emp_id else None,
                    "name": rep_name,
                    "role": "Employee",
                    "email": rep_email,
                    "managerEmail": rep_manager_email.lower() if rep_manager_email else None,
                    "managerId": rep_manager_id,
                    "level": level,
                    "skills": {
                        "domainCount": 0,
                        "disciplineCount": 0,
                        "skillAreaCount": 0,
                        "frameworkCount": 0,
                        "l1Count": 0,
                        "l2Count": 0,
                        "l3Count": 0,
                        "activeSkillsCount": 0,
                        "pendingApprovalCount": 0,
                        "skillArray": [],
                    },
                    "certifications": {
                        "certificationCount": 0,
                        "certificationArray": [],
                        "recentCertificateName": None,
                    },
                    "trainings": {
                        "trainingCount": 0,
                        "completedTrainingCount": 0,
                        "trainingArray": [],
                    },
                    "associates": {
                        "associateCount": 0,
                    },
                }
                reportee_dict[rep_id] = reportee_node


            # Accumulators for unique counts across all reportees (excludes manager)
            unique_skill_framework_ids = set()
            unique_training_module_ids = set()
            unique_cert_mapping_ids = set()

            # Fetch skills/certs/trainings for the manager + every reportee in one
            # batched query per data type, instead of 5 queries per employee.
            all_employee_ids = [manager_id] + [rep["id"] for rep in all_reportees]

            batch_skills_sql = text(
                f"""
                WITH employee_skills AS (
                    SELECT
                        es.employee_id,
                        es.level_selected,
                        es.approval_status,
                        es.skill_hierarchy_id,
                        shl.domain_id,
                        shl.discipline_id,
                        shl.skill_area_id,
                        shl.framework_id
                    FROM "{schema}".employee_skills es
                    INNER JOIN "{schema}".skill_hierarchy_links shl ON es.skill_hierarchy_id = shl.id
                    WHERE es.employee_id = ANY(:rep_ids)
                      -- Only actually-held skills count toward Manager Dashboard's
                      -- totals/domains — Pending/Rejected excluded, same
                      -- Approved/Pre-Approved "counts as held" set
                      -- skillDataTable.jsx already uses elsewhere in the app.
                      AND es.approval_status IN ('Approved', 'Pre-Approved')
                ),
                frameworks_agg AS (
                    SELECT
                        es.employee_id,
                        es.domain_id,
                        es.discipline_id,
                        es.skill_area_id,
                        json_agg(
                            json_build_object(
                                'id', es.framework_id,
                                'skillHierarchyId', es.skill_hierarchy_id,
                                'frameworkName', COALESCE(mf.framework_name, 'N/A'),
                                'type', 'framework',
                                'levelSelected', es.level_selected,
                                'approvalStatus', es.approval_status
                            ) ORDER BY mf.framework_name
                        ) FILTER (WHERE es.framework_id IS NOT NULL) AS frameworks
                    FROM employee_skills es
                    LEFT JOIN "{schema}".master_framework mf ON es.framework_id = mf.id
                    GROUP BY es.employee_id, es.domain_id, es.discipline_id, es.skill_area_id
                ),
                skill_area_agg AS (
                    SELECT
                        fa.employee_id,
                        fa.domain_id,
                        fa.discipline_id,
                        json_agg(
                            json_build_object(
                                'id', fa.skill_area_id,
                                'skillArea', COALESCE(msa.skill_area, 'N/A'),
                                'type', 'skillArea',
                                'frameworks', COALESCE(fa.frameworks, '[]'::json)
                            ) ORDER BY msa.skill_area
                        ) FILTER (WHERE fa.skill_area_id IS NOT NULL) AS skill_areas
                    FROM frameworks_agg fa
                    LEFT JOIN "{schema}".master_skill_area msa ON fa.skill_area_id = msa.id
                    GROUP BY fa.employee_id, fa.domain_id, fa.discipline_id
                ),
                discipline_agg AS (
                    SELECT
                        saa.employee_id,
                        saa.domain_id,
                        json_agg(
                            json_build_object(
                                'id', saa.discipline_id,
                                'disciplineName', COALESCE(md.discipline_name, 'N/A'),
                                'type', 'discipline',
                                'skillAreas', COALESCE(saa.skill_areas, '[]'::json)
                            ) ORDER BY md.discipline_name
                        ) FILTER (WHERE saa.discipline_id IS NOT NULL) AS disciplines
                    FROM skill_area_agg saa
                    LEFT JOIN "{schema}".master_discipline md ON saa.discipline_id = md.id
                    GROUP BY saa.employee_id, saa.domain_id
                ),
                domain_agg AS (
                    SELECT
                        da.employee_id,
                        json_agg(
                            json_build_object(
                                'id', da.domain_id,
                                'domainName', COALESCE(md.domain_name, 'N/A'),
                                'type', 'domain',
                                'disciplines', COALESCE(da.disciplines, '[]'::json)
                            ) ORDER BY md.domain_name
                        ) FILTER (WHERE da.domain_id IS NOT NULL) AS domains
                    FROM discipline_agg da
                    LEFT JOIN "{schema}".master_domain md ON da.domain_id = md.id
                    GROUP BY da.employee_id
                )
                SELECT employee_id, domains AS skills_hierarchy
                FROM domain_agg
                """
            )
            try:
                skills_rows = conn.execute(batch_skills_sql, {"rep_ids": all_employee_ids}).mappings().fetchall()
                skills_by_id = {row["employee_id"]: (row["skills_hierarchy"] or []) for row in skills_rows}
            except Exception as e:
                logger.warning(f"Error fetching batched skills hierarchy: {e}")
                skills_by_id = {}

            batch_level_counts_sql = text(
                f"""
                SELECT employee_id, level_selected, approval_status, COUNT(*) AS cnt
                FROM "{schema}".employee_skills
                WHERE employee_id = ANY(:rep_ids)
                GROUP BY employee_id, level_selected, approval_status
                """
            )
            level_counts_by_id: Dict[int, Dict[str, int]] = {}
            try:
                level_rows = conn.execute(batch_level_counts_sql, {"rep_ids": all_employee_ids}).mappings().fetchall()
                for row in level_rows:
                    counts = level_counts_by_id.setdefault(
                        row["employee_id"], {"l1": 0, "l2": 0, "l3": 0, "active": 0, "pending": 0}
                    )
                    cnt = row["cnt"]
                    status = row["approval_status"]
                    if status == "Pending":
                        counts["pending"] += cnt
                        continue
                    # Rejected counts toward neither active nor pending — same
                    # Approved/Pre-Approved "counts as held" set batch_skills_sql
                    # filters to above.
                    if status not in ("Approved", "Pre-Approved"):
                        continue
                    counts["active"] += cnt
                    if row["level_selected"] == "L1":
                        counts["l1"] += cnt
                    elif row["level_selected"] == "L2":
                        counts["l2"] += cnt
                    elif row["level_selected"] == "L3":
                        counts["l3"] += cnt
            except Exception as e:
                logger.warning(f"Error fetching batched skill level counts: {e}")

            batch_cert_sql = text(
                f"""
                SELECT
                    ec.employee_id,
                    ec.id AS employee_certificate_id,
                    pcm.id AS mapping_id,
                    mcp.cert_provider,
                    mc.cert_name,
                    mc.cert_level,
                    mc.valid_years,
                    ec.issued_date,
                    ec.expiry_date
                FROM "{schema}".employee_certificates ec
                INNER JOIN "{schema}".provider_certificate_mapping pcm
                    ON ec.certificate_id = pcm.id
                INNER JOIN "{schema}".master_certificate mc
                    ON pcm.certificate_id = mc.id
                INNER JOIN "{schema}".master_certificate_provider mcp
                    ON pcm.provider_id = mcp.id
                WHERE ec.employee_id = ANY(:rep_ids)
                ORDER BY ec.employee_id, mc.cert_name, mc.cert_level
                """
            )
            certs_by_id: Dict[int, list] = {}
            try:
                cert_rows = conn.execute(batch_cert_sql, {"rep_ids": all_employee_ids}).mappings().fetchall()
                for row in cert_rows:
                    certs_by_id.setdefault(row["employee_id"], []).append(row)
            except Exception as e:
                logger.warning(f"Error fetching batched certificates: {e}")

            batch_recent_cert_sql = text(
                f"""
                SELECT DISTINCT ON (ec.employee_id) ec.employee_id, mc.cert_name
                FROM "{schema}".employee_certificates ec
                JOIN "{schema}".provider_certificate_mapping pcm ON ec.certificate_id = pcm.id
                JOIN "{schema}".master_certificate mc ON pcm.certificate_id = mc.id
                WHERE ec.employee_id = ANY(:rep_ids)
                ORDER BY ec.employee_id, COALESCE(ec.issued_date, ec.created_at) DESC
                """
            )
            recent_cert_by_id: Dict[int, str] = {}
            try:
                recent_cert_rows = conn.execute(batch_recent_cert_sql, {"rep_ids": all_employee_ids}).mappings().fetchall()
                recent_cert_by_id = {row["employee_id"]: row["cert_name"] for row in recent_cert_rows}
            except Exception as e:
                logger.warning(f"Error fetching batched recent certificates: {e}")

            batch_training_sql = text(
                f"""
                SELECT
                    et.employee_training_id AS training_id,
                    et.employee_id,
                    thl.module_id,
                    tb.batch_num,
                    et.competency,
                    et.training_status::text AS training_status,
                    et.status_remarks,
                    et.employee_type::text AS employee_type,
                    et.nominated_by,
                    et.start_date,
                    et.end_date,
                    et.created_at,
                    ma.area_name,
                    msa.sub_area_name,
                    mm.module_name,
                    mm.course_level,
                    employee_comment_data.comment_text AS employee_comment,
                    manager_comment_data.comment_text AS manager_comment,
                    department_comment_data.comment_text AS department_comment,
                    department_comment_data.commented_at AS department_commented_at,
                    department_comment_data.commented_by_name AS department_commented_by
                FROM "{schema}".employee_trainings et
                LEFT JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
                INNER JOIN "{schema}".training_hierarchy_links thl
                    ON tb.training_hierarchy_id = thl.training_hierarchy_id
                LEFT JOIN "{schema}".master_area ma ON thl.area_id = ma.area_id
                LEFT JOIN "{schema}".master_subarea msa ON thl.sub_area_id = msa.sub_area_id
                LEFT JOIN "{schema}".master_module mm ON thl.module_id = mm.module_id
                LEFT JOIN LATERAL (
                    SELECT c.comment_text
                    FROM "{schema}"."comment" c
                    WHERE c.employee_training_id = et.employee_training_id
                      AND c.comment_type = 'Employee'
                    ORDER BY c.commented_at DESC
                    LIMIT 1
                ) AS employee_comment_data ON TRUE
                LEFT JOIN LATERAL (
                    SELECT c.comment_text
                    FROM "{schema}"."comment" c
                    WHERE c.employee_training_id = et.employee_training_id
                      AND c.comment_type = 'Manager'
                    ORDER BY c.commented_at DESC
                    LIMIT 1
                ) AS manager_comment_data ON TRUE
                LEFT JOIN LATERAL (
                    -- Also the decision-audit-trail row addTraining_v2's
                    -- handle_put writes on every explicit approve/reject/
                    -- status change (comment_type='Department', see that
                    -- file's "Audit trail (Item 3)" comment) — commented_at
                    -- + the commenter's name are exposed here (not just
                    -- comment_text, as before) so the frontend can show
                    -- "who marked it, and when" for a Not Completed status
                    -- without a new table or a per-row extra fetch.
                    SELECT c.comment_text, c.commented_at, ce.name AS commented_by_name
                    FROM "{schema}"."comment" c
                    LEFT JOIN "{schema}".employee ce ON ce.id = c.commented_by_id
                    WHERE c.employee_training_id = et.employee_training_id
                      AND c.comment_type = 'Department'
                    ORDER BY c.commented_at DESC
                    LIMIT 1
                ) AS department_comment_data ON TRUE
                WHERE et.employee_id = ANY(:rep_ids)
                ORDER BY et.employee_id, et.employee_training_id
                """
            )
            trainings_by_id: Dict[int, list] = {}
            try:
                training_rows = conn.execute(batch_training_sql, {"rep_ids": all_employee_ids}).mappings().fetchall()
                for row in training_rows:
                    trainings_by_id.setdefault(row["employee_id"], []).append(row)
            except Exception as e:
                logger.warning(f"Error fetching batched trainings: {e}")

            # Function to populate employee data (skills, certs, trainings) from
            # the pre-fetched batch lookups above (no per-employee DB round-trips)
            def populate_employee_data(reportee_node, is_reportee=False):
                rep_id = reportee_node["id"]

                skills_hierarchy = skills_by_id.get(rep_id, [])

                # Count skills at each hierarchy level
                def count_hierarchy(nodes, key_map):
                    """Recursively count nodes at each level of the skill hierarchy.
                    key_map is a list of (child_key, count_key) tuples for each level."""
                    if not isinstance(nodes, list) or not key_map:
                        return {}
                    child_key, count_key = key_map[0]
                    counts = {count_key: 0}
                    for node in nodes:
                        if not isinstance(node, dict):
                            continue
                        counts[count_key] += 1
                        children = node.get(child_key, [])
                        if isinstance(children, list) and len(key_map) > 1:
                            sub_counts = count_hierarchy(children, key_map[1:])
                            for k, v in sub_counts.items():
                                counts[k] = counts.get(k, 0) + v
                    return counts

                hierarchy_levels = [
                    ("disciplines", "domainCount"),
                    ("skillAreas", "disciplineCount"),
                    ("frameworks", "skillAreaCount"),
                    (None, "frameworkCount"),
                ]
                skill_counts = count_hierarchy(skills_hierarchy, hierarchy_levels)

                reportee_node["skills"]["domainCount"] = skill_counts.get("domainCount", 0)
                reportee_node["skills"]["disciplineCount"] = skill_counts.get("disciplineCount", 0)
                reportee_node["skills"]["skillAreaCount"] = skill_counts.get("skillAreaCount", 0)
                reportee_node["skills"]["frameworkCount"] = skill_counts.get("frameworkCount", 0)

                # Count L1/L2/L3 and approval status totals (pre-fetched above)
                level_counts = level_counts_by_id.get(
                    rep_id, {"l1": 0, "l2": 0, "l3": 0, "active": 0, "pending": 0}
                )
                reportee_node["skills"]["l1Count"] = level_counts["l1"]
                reportee_node["skills"]["l2Count"] = level_counts["l2"]
                reportee_node["skills"]["l3Count"] = level_counts["l3"]
                reportee_node["skills"]["activeSkillsCount"] = level_counts["active"]
                reportee_node["skills"]["pendingApprovalCount"] = level_counts["pending"]

                # Set skills data on the employee node
                reportee_node["skills"]["skillArray"] = skills_hierarchy if skills_hierarchy else []

                # Accumulate unique framework IDs for reportees
                if is_reportee and isinstance(skills_hierarchy, list):
                    for domain in skills_hierarchy:
                        for discipline in (domain.get("disciplines") or []):
                            for skill_area in (discipline.get("skillAreas") or []):
                                for framework in (skill_area.get("frameworks") or []):
                                    fw_id = framework.get("id")
                                    if fw_id is not None:
                                        unique_skill_framework_ids.add(fw_id)


                # Get Certifications (pre-fetched above)
                certs = certs_by_id.get(rep_id, [])

                cert_nodes = []
                for cert in certs:
                    cert_node = {
                        "mappingId": cert['mapping_id'],
                        "employeeCertificateId": cert['employee_certificate_id'],
                        "certName": cert['cert_name'] if cert['cert_name'] else None,
                        "certProvider": cert['cert_provider'] if cert['cert_provider'] else None,
                        "certLevel": cert['cert_level'] if cert['cert_level'] else None,
                        "validYears": cert['valid_years'] if cert['valid_years'] is not None else None,
                        "issuedDate": cert['issued_date'].isoformat() if hasattr(cert['issued_date'], "isoformat") else None,
                        "expiryDate": cert['expiry_date'].isoformat() if hasattr(cert['expiry_date'], "isoformat") else None,
                    }
                    cert_nodes.append(cert_node)


                reportee_node["certifications"]["certificationCount"] = len(cert_nodes)
                reportee_node["certifications"]["certificationArray"] = cert_nodes

                # Accumulate unique cert mapping IDs for reportees
                if is_reportee:
                    for c in cert_nodes:
                        mapping_id = c.get("mappingId")
                        if mapping_id is not None:
                            unique_cert_mapping_ids.add(mapping_id)

                # Most recent certificate by issued_date (pre-fetched above)
                reportee_node["certifications"]["recentCertificateName"] = recent_cert_by_id.get(rep_id)

                # Get Trainings (pre-fetched above)
                trainings = trainings_by_id.get(rep_id, [])

                training_nodes = []
                for tr in trainings:
                    training_node = {
                        "employeeTrainingId": tr['training_id'],
                        "employeeId": tr['employee_id'],
                        "moduleId": tr['module_id'] if tr['module_id'] else None,
                        "batch": tr['batch_num'] if tr['batch_num'] else None,
                        "moduleName": tr['module_name'] if tr['module_name'] else None,
                        "areaName": tr['area_name'] if tr['area_name'] else None,
                        "subAreaName": tr['sub_area_name'] if tr['sub_area_name'] else None,
                        "courseLevel": tr['course_level'] if tr['course_level'] else None,
                        "trainingStatus": tr['training_status'] if tr['training_status'] else None,
                        "statusRemarks": tr['status_remarks'] if tr['status_remarks'] else None,
                        "employeeType": tr['employee_type'] if tr['employee_type'] else None,
                        "nominatedBy": tr['nominated_by'] if tr['nominated_by'] else None,
                        "startDate": tr['start_date'].isoformat() if hasattr(tr['start_date'], "isoformat") else (str(tr['start_date']) if tr['start_date'] else None),
                        "endDate": tr['end_date'].isoformat() if hasattr(tr['end_date'], "isoformat") else (str(tr['end_date']) if tr['end_date'] else None),
                        "competency": tr['competency'] if tr['competency'] else None,
                        "createdAt": tr['created_at'].isoformat() if hasattr(tr['created_at'], "isoformat") else (str(tr['created_at']) if tr['created_at'] else None),
                        "employeeComment": str(tr['employee_comment']) if tr['employee_comment'] else None,
                        "managerComment": str(tr['manager_comment']) if tr['manager_comment'] else None,
                        "departmentComment": str(tr['department_comment']) if tr['department_comment'] else None,
                        # "Who marked it, and when" for the most recent
                        # explicit status decision (see the LATERAL join's
                        # comment above) — reviewedByName was previously
                        # only ever populated client-side, for the current
                        # session, right after an approve/reject; this is
                        # the first time it reflects real, persisted data on
                        # a normal page load.
                        "reviewedByName": tr['department_commented_by'] if tr['department_commented_by'] else None,
                        "reviewedAt": tr['department_commented_at'].isoformat() if hasattr(tr['department_commented_at'], "isoformat") else (str(tr['department_commented_at']) if tr['department_commented_at'] else None),
                    }
                    training_nodes.append(training_node)


                # Accumulate unique training module IDs for reportees
                if is_reportee:
                    for tr in training_nodes:
                        module_id = tr.get("moduleId")
                        if module_id is not None:
                            unique_training_module_ids.add(module_id)

                completed_training_count = sum(
                    1 for tr in training_nodes
                    if (tr.get("trainingStatus") or "").lower() == "completed"
                )
                reportee_node["trainings"]["trainingCount"] = len(training_nodes)
                reportee_node["trainings"]["completedTrainingCount"] = completed_training_count
                reportee_node["trainings"]["trainingArray"] = training_nodes


            # Populate manager's own data (skills, certs, trainings)
            populate_employee_data(manager_node, is_reportee=False)

            # Early return if no reportees
            if not all_reportees:
                # Set role to "Employee" since they have no reportees
                manager_node["role"] = "Employee"
                manager_node["reportee_summary"] = {
                    "totalUniqueSkills": 0,
                    "totalUniqueTrainings": 0,
                    "totalUniqueCertifications": 0,
                }
                logger.info("No reportees found for manager %s", manager_email)
                return _cors_response(manager_node, 200)

            # Recursive function to build tree
            built_node_ids = set()

            def build_tree(emp_id):
                '''Build tree recursively for an employee and all their reportees'''
                if emp_id not in reportee_dict or emp_id in built_node_ids:
                    return None
                built_node_ids.add(emp_id)

                current_node = reportee_dict[emp_id]

                # Find all direct reportees
                direct_reportees = [
                    reportee_id
                    for reportee_id, node in reportee_dict.items()
                    if node.get("managerId") == emp_id
                ]

                # Populate this employee's data (skills, certs, trainings)
                populate_employee_data(current_node, is_reportee=True)

                # Recursively build subtrees for each direct reportee
                associate_list = []
                for reportee_id in direct_reportees:
                    reportee_subtree = build_tree(reportee_id)
                    if reportee_subtree:
                        associate_list.append(reportee_subtree)

                # Set role based on whether they have direct reports
                if associate_list:
                    current_node["role"] = "Manager"
                    # Level of associates = current node's level + 1
                    assoc_level = current_node.get("level", 0) + 1
                    current_node["associates"] = {
                        "associateCount": len(associate_list),
                        f"associateArray{assoc_level}": associate_list,
                    }
                else:
                    current_node["role"] = "Employee"
                    assoc_level = current_node.get("level", 0) + 1
                    current_node["associates"] = {
                        "associateCount": 0,
                        f"associateArray{assoc_level}": [],
                    }

                return current_node


            # Build tree starting from manager's direct reportees
            manager_direct_reportees = [
                reportee_id
                for reportee_id, node in reportee_dict.items()
                if node.get("managerId") == manager_id
            ]


            logger.info(f"Building tree for {len(manager_direct_reportees)} direct reportees")
            # test code

            associates_for_manager = []
            for reportee_id in manager_direct_reportees:
                reportee_tree = build_tree(reportee_id)
                if reportee_tree:
                    associates_for_manager.append(reportee_tree)


            if associates_for_manager:
                manager_node["associates"] = {
                    "associateCount": len(associates_for_manager),
                    "associateArray1": associates_for_manager,
                }
            else:
                # If manager has no reportees, update their role to "Employee"
                manager_node["role"] = "Employee"
                manager_node["associates"] = {
                    "associateCount": 0,
                    "associateArray1": [],
                }

            manager_node["reportee_summary"] = {
                "totalUniqueSkills": len(unique_skill_framework_ids),
                "totalUniqueTrainings": len(unique_training_module_ids),
                "totalUniqueCertifications": len(unique_cert_mapping_ids),
            }


        logger.info(
            "Reportee competency hierarchy built successfully for manager %s",
            manager_email,
        )
        return _cors_response(manager_node, 200)

    except SQLAlchemyError as db_err:
        logger.exception("Database error in get_combined_hierarchy_v2")
        return _cors_response({"error": "Database error", "details": str(db_err)}, 500)

    except Exception as e:
        logger.exception("Unexpected error in get_combined_hierarchy_v2")
        return _cors_response({"error": str(e)}, 500)



"""
Deployment command (Production):
gcloud functions deploy get_combined_hierarchy_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_combined_hierarchy_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):
gcloud functions deploy dev_get_combined_hierarchy_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_combined_hierarchy_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:
functions-framework --target=get_combined_hierarchy_v2 --source main.py --debug --port=8110
"""
