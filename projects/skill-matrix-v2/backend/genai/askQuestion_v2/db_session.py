from sqlalchemy import create_engine, text, inspect
from sqlalchemy.pool import NullPool
from urllib.parse import quote_plus
import os
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

def get_db_engine():
    """Create and return a SQLAlchemy engine using environment variables."""
    db_user = quote_plus(os.getenv("DB_USER"))
    db_pass = quote_plus(os.getenv("DB_PASS"))
    db_name = os.getenv("DB_NAME")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    
    # Validate required environment variables
    if not all([db_user, db_pass, db_name, db_host]):
        missing = [var for var, val in [
            ("DB_USER", db_user), ("DB_PASS", db_pass), 
            ("DB_NAME", db_name), ("DB_HOST", db_host)
        ] if not val]
        error_msg = f"Missing required database environment variables: {', '.join(missing)}"
        raise ValueError(error_msg)
    
    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    
    # Use NullPool for serverless Cloud Functions (no connection pooling)
    engine = create_engine(db_url, poolclass=NullPool, future=True)
    return engine

# Create engine instance (lazy initialization - only when needed)
engine = None

def get_engine():
    """Get or create the database engine (lazy initialization)."""
    global engine
    if engine is None:
        engine = get_db_engine()
    return engine

#-------Session control UTILS-------------

db_schema = os.getenv("DB_SCHEMA")
SESSION_SCHEMA = f'"{db_schema}"' 

def create_session(schema: str):
    """Create a new SQL agent session."""
    q = text(f"""
        INSERT INTO {SESSION_SCHEMA}.sql_agent_session
            (last_question, last_sql, schema_name)
        VALUES ('', '', :schema)
        RETURNING session_id;
    """)
    with get_engine().begin() as conn:
        return conn.execute(q, {"schema": schema}).scalar()


def load_session(session_id: str):
    """Load session data if it exists and is not expired (30 minutes)."""
    q = text(f"""
        SELECT last_question, last_sql, schema_name
        FROM {SESSION_SCHEMA}.sql_agent_session
        WHERE session_id = :sid
          AND updated_at > now() - interval '30 minutes';
    """)
    with get_engine().connect() as conn:
        row = conn.execute(q, {"sid": session_id}).fetchone()

    return dict(row._mapping) if row else None


def update_session(session_id, question, sql):
    """Update session with new question and SQL."""
    q = text(f"""
        UPDATE {SESSION_SCHEMA}.sql_agent_session
        SET last_question = :q,
            last_sql = :sql,
            updated_at = now()
        WHERE session_id = :sid;
    """)
    with get_engine().begin() as conn:
        conn.execute(q, {
            "sid": session_id,
            "q": question,
            "sql": sql
        })


#-------Schema inspection utility-------------

ALLOWED_SCHEMAS = [db_schema]


def load_schema() -> str:
    """Reflect the DB schema using a synchronous connection and SQLAlchemy inspector.

    Returns a text representation of the allowed schema(s), including tables,
    columns, primary keys and foreign keys. This version is intended for use in
    synchronous code paths and replaces the earlier async helper that required
    ``engine.connect().run_sync``.
    """
    eng = get_engine()
    inspector = inspect(eng)
    schema_str = ""

    for schema_name in ALLOWED_SCHEMAS:
        schema_str += f"Schema \"{schema_name}\":\n"

        for table in inspector.get_table_names(schema=schema_name):
            schema_str += f' Table "{schema_name}"."{table}":\n'

            columns = inspector.get_columns(table, schema=schema_name)
            pk = inspector.get_pk_constraint(table, schema=schema_name).get("constrained_columns", [])

            for col in columns:
                col_line = f'  - "{col["name"]}" ({col["type"]})'
                if col["name"] in pk:
                    col_line += " PRIMARY KEY"
                schema_str += col_line + "\n"

            fks = inspector.get_foreign_keys(table, schema=schema_name)
            for fk in fks:
                local_cols = ", ".join(f'"{c}"' for c in fk["constrained_columns"])
                remote_table = fk["referred_table"]
                remote_schema = fk.get("referred_schema", schema_name)
                remote_cols = ", ".join(f'"{c}"' for c in fk["referred_columns"])

                schema_str += (
                    f'   FOREIGN KEY ({local_cols}) '
                    f'REFERENCES "{remote_schema}"."{remote_table}" ({remote_cols})\n'
                )

            schema_str += "\n"

    return schema_str
