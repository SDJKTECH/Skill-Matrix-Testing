import os
from pathlib import Path

from dotenv import load_dotenv

_env_file = Path(__file__).parent.parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file)

# Fallback app URL when the request has no Origin header (see notifications.resolve_app_url).
APP_URL = os.getenv("APP_URL")

header_map = {
        # Batch variants
        "Batch (YYYY-MM)": "batch_num",
        "Batch YYYY-MM": "batch_num",
        "batch-YYYY-MM": "batch_num",
        "Batch Number": "batch_num",
        "Batch Num": "batch_num",
        "Batch": "batch_num",

        "Batch Description":"Batch Description",
        "batch description":"Batch Description",
        "Batch Desc":"Batch Description",
        "batch desc":"Batch Description",

        # Training Status variants
        "Training Status (Auto-set if blank)": "Training Status",
        "Training Status Auto-set if blank": "Training Status",

        # Status Remarks variants
        "Status Remarks (Optional)": "Status Remarks",
        "Status Remark": "Status Remarks",
        "Status Remark (Optional)": "Status Remarks",

        # Training Quarter variants (replaces legacy Training Schedule)
        "Training Schedule": "Training Quarter",
        "Training Schedule (Optional)": "Training Quarter",
        "Training Quarter (Optional)": "Training Quarter",

        # Batch Status Remarks variants
        "Batch Status Remarks (Optional)": "Batch Status Remarks",
        "Batch Status Remark": "Batch Status Remarks",

        # Start Date variants
        "Start Date (YYYY-MM-DD, Optional)": "Start Date",
        "Start Date (YYYY-MM-DD)": "Start Date",
        "Start Date YYYY-MM-DD": "Start Date",

        # End Date variants
        "End Date (YYYY-MM-DD, Optional)": "End Date",
        "End Date (YYYY-MM-DD)": "End Date",
        "End Date YYYY-MM-DD": "End Date",
    }

# CSV SYNC HELPERS (GCS Bucket)
_CSV_COLUMNS = [
    "emp_id", "employee_name", "email", "department",
    "Area", "Area Description",
    "Sub Area", "Sub Area Description", "Module",
    "Module Course Level", "Module Description",
    "Batch_num", "Batch Description", "training_status", "Status Remarks", "employee_type","nominated_by",
    "start_date", "end_date", "created_at", "updated_at",
    "Training Quarter", "Batch Status", "Batch Status Remarks", "Training Mode", "Trainer",
    "Duration", "Batch Size", "Prerequisite", "Training Content", "Resources"
]
_CSV_BLOB_PATH = "employee-training/master_employee_training.csv"
_BACKUP_PREFIX = "employee-training/master_employee_training_"


_DATE_FORMATS = [
    "%Y-%m-%d",     # 2025-01-15
    "%d-%b-%y",     # 15-Jan-25
    "%d-%b-%Y",     # 15-Jan-2025
    "%d/%m/%Y",     # 15/01/2025
    "%m/%d/%Y",     # 01/15/2025
    "%d-%m-%Y",     # 15-01-2025
    "%Y/%m/%d",     # 2025/01/15
    "%b %d %Y",     # Jan 15 2025
    "%B %d %Y",     # January 15 2025
    "%d %b %Y",     # 15 Jan 2025
    "%d %B %Y",     # 15 January 2025
    "%Y%m%d",       # 20250115
]

STATUS_NORMALIZATION = {
    # Completed
    "complete": "Completed",
    "completed": "Completed",
    "done": "Completed",
    "finished": "Completed",
    "certified": "Completed",
    # In Progress
    "in progress": "In Progress",
    "in-progress": "In Progress",
    "inprogress": "In Progress",
    "ongoing": "In Progress",
    "active": "In Progress",
    "started": "In Progress",
    "not completed": "Not Completed",
    "incomplete": "Not Completed",
    "failed": "Not Completed",
    "dropped": "Not Completed",
    "drop": "Not Completed",
    "cancelled": "Not Completed",
    "canceled": "Not Completed",
    "withdrawn": "Not Completed",
    "on hold": "Not Completed",
    "onhold": "Not Completed",
    "on_hold": "Not Completed",
    "hold": "Not Completed",
    "paused": "Not Completed",
    "deferred": "Not Completed",
    "no show": "Not Completed",
    "noshow": "Not Completed",
    "no_show": "Not Completed",
    # Not Started
    "not started": "Not Started",
    "notstarted": "Not Started",
    "not_started": "Not Started",
    "pending": "Not Started",
    "yet to start": "Not Started",
}


BATCH_STATUS_NORMALIZATION = {
    # Completed
    "complete": "Completed",
    "completed": "Completed",
    "done": "Completed",
    "finished": "Completed",
    "certified": "Completed",
    # In Progress
    "in progress": "In Progress",
    "in-progress": "In Progress",
    "inprogress": "In Progress",
    "ongoing": "In Progress",
    "active": "In Progress",
    "started": "In Progress",

    # Planned
    "Planned": "Planned",
    "planned": "Planned",

    # Open
    "Open": "Open",
    "open": "Open",
    
    # Cancelled
    "Cancelled": "Cancelled",
    "cancelled": "Cancelled",
   
    # Archived
    "Archived": "Archived",
    "archived": "Archived",
}

TRAINING_MODE_NORMALIZATION = {
    "internal videos": "Internal Videos",
    "internal video": "Internal Videos",
    "internal-videos": "Internal Videos",
    "videos": "Internal Videos",
    "video": "Internal Videos",
    "external platforms": "External Platforms",
    "external platform": "External Platforms",
    "external-platforms": "External Platforms",
    "platforms": "External Platforms",
    "platform": "External Platforms",
    "hybrid": "Hybrid",
    "internal instructor-led": "Internal Instructor-led",
    "internal instructor led": "Internal Instructor-led",
    "internal-instructor-led": "Internal Instructor-led",
    "external instructor-led": "External Instructor-led",
    "external instructor led": "External Instructor-led",
    "external-instructor-led": "External Instructor-led",
}
