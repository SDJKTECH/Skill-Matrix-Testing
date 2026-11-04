"""
Google Cloud Function to save employee certificates.
Uses SQLAlchemy ORM and environment variables.
Saves certificates to employee_certificates table using provider_certificate_mapping.id.
"""

import json
import os
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
from urllib.parse import quote_plus

from flask import Request
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add backend directory to path to import utils
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
    pass

# Add backend directory to path to import utils
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    from utils.event_publisher import publish_event
except ImportError:
    publish_event = None

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


def get_cors_headers(request: Request) -> Dict[str, str]:
    """
    Get CORS headers that allow localhost for local development
    and Cloud Run origins for deployed frontend.
    """
    origin = request.headers.get('Origin', '')
    # Allow localhost for local development and Cloud Run for deployed frontend
    allowed_origins = [
        'http://localhost:5173',  # Vite dev server
        'https://skill-matrix-v2-dev-140475459295.asia-south1.run.app',  # V2 Dev Cloud Run
    ]
    
    # If origin is in allowed list, use it; otherwise use * for production
    if origin in allowed_origins:
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        }
    else:
        # For any other origin, allow it (but without credentials)
        return {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }


def get_employee_id(email: str, conn) -> Optional[int]:
    """Get employee ID from email."""
    schema = os.getenv("DB_SCHEMA")
    query = text(f'SELECT id FROM "{schema}".employee WHERE LOWER(email) = LOWER(:email)')
    result = conn.execute(query, {"email": email.lower()}).fetchone()
    return result[0] if result else None


def get_provider_id(provider_name: str, conn) -> Optional[int]:
    """Get provider ID from master_certificate_provider by provider name."""
    schema = os.getenv("DB_SCHEMA")
    query = text(f"""
        SELECT id FROM "{schema}".master_certificate_provider
        WHERE LOWER(cert_provider) = LOWER(:provider_name)
    """)
    result = conn.execute(query, {"provider_name": provider_name}).fetchone()
    return result[0] if result else None


def get_certificate_id(cert_name: str, cert_level: Optional[str], conn) -> Optional[int]:
    """Get certificate ID from master_certificate by name and level."""
    schema = os.getenv("DB_SCHEMA")
    
    if cert_level:
        query = text(f"""
            SELECT id FROM "{schema}".master_certificate
            WHERE LOWER(cert_name) = LOWER(:cert_name) 
            AND (cert_level IS NULL OR LOWER(cert_level) = LOWER(:cert_level))
        """)
        result = conn.execute(query, {"cert_name": cert_name, "cert_level": cert_level}).fetchone()
    else:
        query = text(f"""
            SELECT id FROM "{schema}".master_certificate
            WHERE LOWER(cert_name) = LOWER(:cert_name) 
            AND cert_level IS NULL
        """)
        result = conn.execute(query, {"cert_name": cert_name}).fetchone()
    
    return result[0] if result else None


def get_mapping_id(provider_id: int, certificate_id: int, conn) -> Optional[int]:
    """Get provider_certificate_mapping ID from provider_id and certificate_id."""
    schema = os.getenv("DB_SCHEMA")
    query = text(f"""
        SELECT id FROM "{schema}".provider_certificate_mapping
        WHERE provider_id = :provider_id AND certificate_id = :certificate_id
    """)
    result = conn.execute(query, {"provider_id": provider_id, "certificate_id": certificate_id}).fetchone()
    return result[0] if result else None


def save_employee_certificates_v2(
    email: str, 
    certificates: List[Dict], 
    manager_email: str = ""
) -> Dict[str, Any]:
    """
    Save employee certificates to employee_certificates table.
    
    Args:
        email: Employee email
        certificates: List of certificate dictionaries with:
            - certProvider (required) - provider name
            - certName (required) - certificate name
            - certLevel (optional) - certificate level
            - yearAchieved (optional) - year achieved (for issued_date)
            - expiryDate (optional) - expiry date
        manager_email: Manager email (optional, for updating manager_id)
        
    Returns:
        Dictionary with message and counts
    """
    schema = os.getenv("DB_SCHEMA")
    
    # Validate required environment variables
    required_vars = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    engine = get_db_engine()
    
    with engine.begin() as conn:
        try:
            # Get employee ID
            emp_id = get_employee_id(email, conn)
            if not emp_id:
                raise ValueError(f"Employee not found for email: {email}")
            
            # Update manager_id if manager_email is provided
            if manager_email:
                manager_id = get_employee_id(manager_email, conn)
                if manager_id:
                    update_mgr_query = text(f"""
                        UPDATE "{schema}".employee 
                        SET reports_to = :manager_id 
                        WHERE id = :emp_id AND (reports_to IS NULL OR reports_to = 0)
                    """)
                    conn.execute(update_mgr_query, {"manager_id": manager_id, "emp_id": emp_id})
            
            # Fetch existing employee certificates (using mapping_id)
            existing_query = text(f"""
                SELECT certificate_id
                FROM "{schema}".employee_certificates
                WHERE employee_id = :emp_id
            """)
            
            existing_certs = set()
            result = conn.execute(existing_query, {"emp_id": emp_id})
            for row in result:
                existing_certs.add(row[0])
            
            # Process certificates
            incoming_mapping_ids = set()
            to_upsert = []
            errors = []
            
            for cert in certificates:
                cert_provider = (cert.get("certProvider") or "").strip()
                cert_name = (cert.get("certName") or "").strip()
                cert_level = cert.get("certLevel")
                
                if not cert_provider or not cert_name:
                    logger.warning(f"Skipping certificate entry with missing provider/name: {cert}")
                    errors.append(f"Missing provider or name for certificate: {cert}")
                    continue
                
                # Get provider ID
                provider_id = get_provider_id(cert_provider, conn)
                if not provider_id:
                    error_msg = f"Provider '{cert_provider}' not found in master_certificate_provider"
                    logger.warning(error_msg)
                    errors.append(error_msg)
                    continue
                
                # Get certificate ID
                certificate_id = get_certificate_id(cert_name, cert_level, conn)
                if not certificate_id:
                    error_msg = f"Certificate '{cert_name}' (level: {cert_level}) not found in master_certificate"
                    logger.warning(error_msg)
                    errors.append(error_msg)
                    continue
                
                # Get mapping ID (this is what we save to employee_certificates.certificate_id)
                mapping_id = get_mapping_id(provider_id, certificate_id, conn)
                if not mapping_id:
                    error_msg = f"Provider '{cert_provider}' and Certificate '{cert_name}' mapping not found in provider_certificate_mapping"
                    logger.warning(error_msg)
                    errors.append(error_msg)
                    continue
                
                incoming_mapping_ids.add(mapping_id)
                
                # Prepare certificate data
                year_achieved = cert.get("yearAchieved")
                expiry_date = cert.get("expiryDate")
                
                # Convert yearAchieved to issued_date (use January 1st of that year)
                issued_date = None
                if year_achieved:
                    try:
                        issued_date = datetime(int(year_achieved), 1, 1)
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid yearAchieved: {year_achieved}")
                
                # Parse expiry_date if it's a string
                expiry_date_parsed = None
                if expiry_date:
                    if isinstance(expiry_date, str):
                        try:
                            expiry_date_parsed = datetime.strptime(expiry_date, "%Y-%m-%d")
                        except ValueError:
                            try:
                                expiry_date_parsed = datetime.strptime(expiry_date, "%Y-%m-%d %H:%M:%S")
                            except ValueError:
                                logger.warning(f"Invalid expiryDate format: {expiry_date}")
                    else:
                        expiry_date_parsed = expiry_date
                
                to_upsert.append({
                    "employee_id": emp_id,
                    "certificate_id": mapping_id,  # This is the mapping_id from provider_certificate_mapping
                    "issued_date": issued_date,
                    "expiry_date": expiry_date_parsed,
                })
            
            # Delete certificates that are no longer in the incoming list
            to_delete_mapping_ids = list(existing_certs - incoming_mapping_ids)
            
            if to_delete_mapping_ids:
                delete_query = text(f"""
                    DELETE FROM "{schema}".employee_certificates
                    WHERE employee_id = :emp_id AND certificate_id = ANY(:mapping_ids)
                """)
                conn.execute(delete_query, {"emp_id": emp_id, "mapping_ids": to_delete_mapping_ids})
            
            # Delete existing certificates that are being updated (before reinsert)
            if to_upsert:
                mapping_ids_to_update = [row["certificate_id"] for row in to_upsert]
                delete_existing_query = text(f"""
                    DELETE FROM "{schema}".employee_certificates
                    WHERE employee_id = :emp_id AND certificate_id = ANY(:mapping_ids)
                """)
                conn.execute(delete_existing_query, {"emp_id": emp_id, "mapping_ids": mapping_ids_to_update})
                
                # Insert new/updated certificates
                insert_query = text(f"""
                    INSERT INTO "{schema}".employee_certificates
                        (employee_id, certificate_id, issued_date, expiry_date)
                    VALUES (:employee_id, :certificate_id, :issued_date, :expiry_date)
                """)
                
                # Execute inserts one by one for consistency
                for cert_data in to_upsert:
                    conn.execute(insert_query, cert_data)
            
            result = {
                "message": f"Certificates processed for {email}",
                "deleted_count": len(to_delete_mapping_ids),
                "upserted_count": len(to_upsert),
            }
            
            if errors:
                result["warnings"] = errors
            
            logger.info(f"✅ Processed {len(to_upsert)} certificates for {email}, deleted {len(to_delete_mapping_ids)}")
            
            # Fire Webhook Event Dispatcher
            if publish_event:
                try:
                    from utils.event_types import SystemEventType
                    event_type = SystemEventType.EMPLOYEE_CERTIFICATE_UPDATED.value
                except ImportError:
                    event_type = "EMPLOYEE_CERTIFICATE_UPDATED"

                # Make inserted/updated data JSON serializable
                serializable_upserted = []
                for cert_data in to_upsert:
                    cert_copy = cert_data.copy()
                    if cert_copy.get("issued_date"):
                        cert_copy["issued_date"] = cert_copy["issued_date"].isoformat()
                    if cert_copy.get("expiry_date"):
                        cert_copy["expiry_date"] = cert_copy["expiry_date"].isoformat()
                    serializable_upserted.append(cert_copy)

                publish_event(conn, event_type, {
                    "action": "UPDATE_EMPLOYEE_CERTIFICATES",
                    "data": {
                        "employee_id": emp_id,
                        "email": email,
                        "upserted_certificates": serializable_upserted,
                        "deleted_certificate_mapping_ids": to_delete_mapping_ids
                    }
                })
                
            return result
            
        except Exception as e:
            logger.exception(f"❌ Error saving employee certificates for {email}")
            raise e


def save_employee_certificate_v2(request: Request):
    """
    Cloud Function entry point.
    Accepts POST with email, managerEmail (optional), and certificates array.
    Certificates should have: certProvider, certName, certLevel (optional), etc.
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = get_cors_headers(request)
        headers['Access-Control-Max-Age'] = '3600'
        return ("", 204, headers)
    
    headers = get_cors_headers(request)
    headers['Content-Type'] = 'application/json'
    
    try:
        if request.method != "POST":
            return (json.dumps({"error": "Method not allowed"}), 405, headers)
        
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        certificates = data.get("certificates", [])
        manager_email = data.get("managerEmail", "")
        
        if not email:
            return (json.dumps({"error": "Missing required field: email"}), 400, headers)
        
        if certificates is None:
            return (json.dumps({"error": "Missing required field: certificates"}), 400, headers)
        
        email = str(email).strip().lower()
        manager_email = str(manager_email).strip().lower() if manager_email else ""
        
        result = save_employee_certificates_v2(email, certificates, manager_email)
        
        return (json.dumps(result), 200, headers)
        
    except ValueError as e:
        logger.exception("❌ Validation error in save_employee_certificate_v2")
        return (json.dumps({"error": str(e)}), 404, headers)
    except SQLAlchemyError as exc:
        logger.exception("❌ Database error in save_employee_certificate_v2")
        return (
            json.dumps({
                "error": "Unable to save employee certificates right now. Please try again."
            }),
            500,
            headers
        )
    except Exception as exc:
        logger.exception("❌ Unexpected error in save_employee_certificate_v2")
        return (
            json.dumps({
                "error": "Something went wrong while saving certificates. Please try again."
            }),
            500,
            headers
        )


"""
Deployment command (Development):

gcloud functions deploy dev_save_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-secrets DB_DEV_V2=DB_DEV_V2:latest

Deployment command (Production):

gcloud functions deploy save_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-secrets DB_PROD_V2=DB_PROD_V2:latest

Local testing command:
functions-framework --target=save_employee_certificate_v2 --debug --port=8104

Test URL: http://127.0.0.1:8104/
Test with POST:
curl -X POST http://127.0.0.1:8104/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "managerEmail": "manager@example.com",
    "certificates": [
      {
        "certProvider": "AWS",
        "certName": "Solutions Architect",
        "certLevel": "Associate",
        "yearAchieved": 2023,
        "expiryDate": "2026-12-31",
        "verified": false,
        "certIdExternal": "AWS-12345"
      }
    ]
  }'
"""
