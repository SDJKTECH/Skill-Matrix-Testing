from llm import call_llm
from prompts import SQL_SYSTEM_PROMPT, SQL_REWRITE_SYSTEM_PROMPT
from db_session import (
    create_session,
    load_session,
    update_session,
    get_engine,
    load_schema,
    db_schema,
)
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError, OperationalError, ProgrammingError
import sqlparse
import logging
import re
from typing import Optional


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sql-agent")

# ------------------------------------------------
# LOAD SCHEMA ONCE AT STARTUP (GLOBAL)
# ------------------------------------------------
try:
    schema_text = load_schema()
    logger.info("Schema loaded successfully.")
    logger.info("Loaded schema: %s", " ".join(schema_text.split()))
except Exception as e:
    logger.warning(f"Failed to load schema: {str(e)}")
    schema_text = "Schema information unavailable"


# --------SQL validator UTILS ---------------
FORBIDDEN = {
    "insert", "update", "delete",
    "drop", "alter", "truncate",
    "create", "replace"
}

def validate_sql(sql: str):
    sql_lower = sql.strip().lower()

    if not sql_lower.startswith("select"):
        raise ValueError("Only SELECT queries are allowed")

    parsed = sqlparse.parse(sql)
    for stmt in parsed:
        for token in stmt.tokens:
            if token.value.lower() in FORBIDDEN:
                raise ValueError("Forbidden SQL keyword detected")


# --------SQL Rewrite UTILS -----------------

def rewrite_sql(previous_sql: str, follow_up_question: str) -> str:
    """Ask the LLM to rewrite `previous_sql` to satisfy `follow_up_question` and return the SQL string."""

    prompt = (
        f"{SQL_REWRITE_SYSTEM_PROMPT}\n\n"
        f"Database Schema:\n{schema_text}\n\n"
        f"Previous SQL:\n{previous_sql}\n\n"
        f"Follow-up question:\n{follow_up_question}\n\n"
        "Produce the new SQL that answers the follow-up question."
    )

    messages = [
        {"role": "user", "content": prompt}
    ]

    response = call_llm(messages)

    match = re.search(
        r"(select[\s\S]+?;|select[\s\S]+$)",
        response,
        re.IGNORECASE,
    )

    if not match:
        raise ValueError("No valid SELECT found in LLM output when rewriting SQL")

    sql = match.group(1).strip()

    if sql.count(";") > 1:
        raise ValueError("Multiple SQL statements detected")

    return sql


# --------Execute SQL UTILS -----------------

def execute_sql(sql: str):
    """Execute SQL using the sync engine and return rows and columns."""
    try:
        with get_engine().connect() as conn:
            result = conn.execute(text(sql).execution_options(timeout=5))

            columns = list(result.keys())
            rows = result.fetchall()

            data = [dict(zip(columns, row)) for row in rows]

            return data, columns

    except ProgrammingError as e:
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.error("SQL syntax error: %s | SQL: %s", " ".join(error_msg.split()), " ".join(sql.split()))

        if "syntax error" in error_msg.lower():
            raise ValueError("The generated SQL query has a syntax error. Please try rephrasing your question.")
        elif "column" in error_msg.lower() and "does not exist" in error_msg.lower():
            raise ValueError("The query references a column that doesn't exist. Please try rephrasing your question.")
        elif "relation" in error_msg.lower() and "does not exist" in error_msg.lower():
            raise ValueError("The query references a table that doesn't exist. Please try rephrasing your question.")
        else:
            raise ValueError("The generated SQL query has an error. Please try rephrasing your question.")

    except OperationalError as e:
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.error("Database operational error: %s | SQL: %s", " ".join(error_msg.split()), " ".join(sql.split()))

        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise ValueError("The query took too long to execute. Please try a simpler question.")
        elif "connection" in error_msg.lower():
            raise ValueError("Unable to connect to the database. Please try again later.")
        else:
            raise ValueError("A database error occurred. Please try again later.")

    except SQLAlchemyError as e:
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.error("SQLAlchemy error: %s | SQL: %s", " ".join(error_msg.split()), " ".join(sql.split()))
        raise ValueError("An error occurred while executing the query. Please try rephrasing your question.")

    except Exception as e:
        logger.exception("Unexpected error executing SQL: %s | SQL: %s", " ".join(str(e).split()), " ".join(sql.split()))
        raise ValueError("An unexpected error occurred. Please try again later.")


# --------SQL EXTRACTION UTILS -----------------

def extract_sql(text: str) -> str:
    text = text.strip().replace("```sql", "").replace("```", "")

    match = re.search(
        r"(select[\s\S]+?;|select[\s\S]+$)",
        text,
        re.IGNORECASE,
    )

    if not match:
        raise ValueError("No valid SELECT SQL found")

    sql = match.group(1).strip()

    if sql.count(";") > 1:
        raise ValueError("Multiple SQL statements detected")

    return sql


# MAIN PIPELINE — SESSION-ONLY FOLLOW-UP LOGIC
def run_sql_pipeline(
    question: str,
    session_id: Optional[str] = None,
    request_info: Optional[dict] = None, 
):
    """Main pipeline invoked by external callers.

    ``request_info`` is optional and should contain keys such as
    ``request_id``, ``timestamp``, ``client_ip``, ``user_agent``,
    ``origin``, ``endpoint`` and ``method``. These details will be
    echoed back in the response and can also be logged for audit
    purposes.
    """
    state = None
    sql = None

    try:
        # record request metadata if available
        if request_info:
            logger.info("Incoming request: %s", request_info)
        logger.info("Question: %s", " ".join(str(question).split()))
            

        # 1️⃣ LOAD SESSION IF PROVIDED
        if session_id:
            try:
                state = load_session(session_id)
            except Exception as e:
                logger.warning(f"Error loading session {session_id}: {str(e)}")
                state = None
                session_id = None

        # 2️⃣ FOLLOW-UP
        if state and state.get("last_sql"):
            logger.info("Follow-up detected via session state")

            try:
                sql = rewrite_sql(
                    previous_sql=state["last_sql"],
                    follow_up_question=question,
                )
            except ValueError as e:
                logger.warning(f"Failed to rewrite SQL, treating as new query: {str(e)}")
                state = None
                sql = None

        # 3️⃣ NEW QUERY
        if not sql:
            if not session_id or not state:
                try:
                    session_id = create_session(schema=db_schema)
                    logger.info("Created new session: %s", session_id)
                except Exception as e:
                    logger.error(f"Error creating session: {str(e)}")
                    raise ValueError("Unable to create a new session. Please try again later.")

            prompt = f"""
{SQL_SYSTEM_PROMPT}

Database Schema:
{schema_text}

User Question:
{question}
"""

            try:
                raw_output = call_llm([{"role": "user", "content": prompt}])
            except Exception as e:
                logger.error(f"LLM API error: {str(e)}")
                raise ValueError("Unable to process your question. Please try again later.")

            try:
                sql = extract_sql(raw_output)
            except ValueError as e:
                logger.error(f"Failed to extract SQL from LLM response: {str(e)}")
                raise ValueError("Unable to generate a valid query from your question. Please try rephrasing it.")

        # 4️⃣ VALIDATE + EXECUTE
        logger.info("Final SQL: %s", " ".join(sql.split()))

        validate_sql(sql)
        try:
            rows, columns = execute_sql(sql)
        except ValueError as e:
            if not isinstance(e.__context__, ProgrammingError):  # retry only bad SQL
                raise
            db_error = " ".join(str(e.__context__.orig).split())
            logger.warning("Retrying once to fix SQL error: %s", db_error)
            sql = rewrite_sql(sql, f"{question}\n\nThe previous SQL failed with: {db_error}\nFix the SQL so it runs.")
            logger.info("Retry SQL: %s", " ".join(sql.split()))
            validate_sql(sql)
            rows, columns = execute_sql(sql)

        # 5️⃣ UPDATE SESSION
        try:
            update_session(
                session_id=session_id,
                question=question,
                sql=sql,
            )
        except Exception as e:
            logger.warning(f"Error updating session {session_id}: {str(e)}")

        # 6️⃣ RESPONSE
        human_text = None
        try:
            if len(rows) == 1 and len(columns) == 1:
                val = rows[0].get(columns[0])
                if isinstance(val, (int, float)):
                    n = int(val)
                    if "count" in columns[0].lower() or re.search(r"^\s*select\s+count\(", sql, re.IGNORECASE):
                        human_text = f"{n} People found" if n != 1 else "1 Person found"
        except Exception:
            human_text = None

        response = {
            "session_id": session_id,
            "columns": columns,
            "rows": rows,
            "request_info": request_info,
        }
        # include any provided request metadata in the output
        if request_info:
            response.update(request_info)

        if human_text:
            response["text"] = human_text

        return response

    except ValueError:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in SQL pipeline: {str(e)}")
        raise ValueError("An unexpected error occurred while processing your question. Please try again later.")