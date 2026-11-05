"""
Google Cloud Function to attempt a quiz (V2 Schema).
Handles starting an attempt, saving answers, reading an attempt, and submitting
it for scoring.

POST {"action": "start" | "save" | "submit", ...}
GET  ?attempt_id=<int>&email=<email> | employeeId=<int>

is_correct is never returned to the caller.
"""
import logging
import os
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from flask import jsonify, make_response
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError, IntegrityError, SQLAlchemyError
from sqlalchemy.pool import NullPool

# Load backend/.env only when running locally.
# Deployed functions use their own env vars.
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

PG_CHECK_VIOLATION = "23514"
PG_FOREIGN_KEY_VIOLATION = "23503"
PG_UNIQUE_VIOLATION = "23505"

QUIZ_TYPES = ("Lesson", "Course Assessment")


class NotFoundError(Exception):
    """Requested record does not exist (404)."""


class ForbiddenError(Exception):
    """Caller does not own the record (403)."""


class ConflictError(Exception):
    """Record state does not allow the operation (409)."""


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


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def _pgcode(err):
    """Return the PostgreSQL SQLSTATE of a DBAPI error, if any."""
    orig = getattr(err, "orig", None)
    return getattr(orig, "pgcode", None)


def _to_int(value, name):
    """Convert a value to int or raise ValueError naming the field."""
    if isinstance(value, bool) or value is None:
        raise ValueError(f"Invalid or missing field: {name}")
    try:
        return int(value)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid field type: {name} must be an integer")


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _num(value):
    """Convert Decimal to float for JSON."""
    return float(value) if value is not None else None


def resolve_employee_id(connection, schema, email=None, employee_id=None):
    """Resolve the employee's id from an email or an id."""
    if employee_id not in (None, ""):
        row = connection.execute(
            text(f'SELECT id FROM "{schema}".employee WHERE id = :id'),
            {"id": _to_int(employee_id, "employeeId")},
        ).mappings().fetchone()
        if not row:
            raise NotFoundError(f"Employee with ID {employee_id} not found")
        return row["id"]
    if email and str(email).strip():
        row = connection.execute(
            text(f'SELECT id FROM "{schema}".employee WHERE LOWER(email) = LOWER(:email)'),
            {"email": str(email).strip()},
        ).mappings().fetchone()
        if not row:
            raise NotFoundError(f"Employee with email {email} not found")
        return row["id"]
    raise ValueError("Missing required field: email or employeeId")


def _get_attempt(connection, schema, attempt_id, emp_id, lock=False):
    """Fetch an attempt and verify the employee owns it."""
    lock_sql = " FOR UPDATE" if lock else ""
    row = connection.execute(
        text(f'''
            SELECT attempt_id, quiz_id, employee_id, status::text AS status,
                   started_at, submitted_at, score, max_score, percentage, passed
            FROM "{schema}".quiz_attempt
            WHERE attempt_id = :attempt_id{lock_sql}
        '''),
        {"attempt_id": attempt_id},
    ).mappings().fetchone()
    if not row:
        raise NotFoundError(f"Attempt {attempt_id} not found")
    if row["employee_id"] != emp_id:
        raise ForbiddenError("Attempt does not belong to this employee")
    return row


def _attempt_summary(attempt):
    return {
        "attemptId": attempt["attempt_id"],
        "quizId": attempt["quiz_id"],
        "employeeId": attempt["employee_id"],
        "status": attempt["status"],
        "startedAt": _iso(attempt["started_at"]),
        "submittedAt": _iso(attempt["submitted_at"]),
        "score": _num(attempt["score"]),
        "maxScore": _num(attempt["max_score"]),
        "percentage": _num(attempt["percentage"]),
        "passed": attempt["passed"],
    }


def _fetch_saved_answers(connection, schema, attempt_id):
    """Return saved answers as a list of {questionId, optionIds}."""
    rows = connection.execute(
        text(f'''
            SELECT question_id, option_id
            FROM "{schema}".quiz_attempt_answer
            WHERE attempt_id = :attempt_id
            ORDER BY question_id, option_id
        '''),
        {"attempt_id": attempt_id},
    ).mappings().fetchall()
    grouped = {}
    for row in rows:
        grouped.setdefault(row["question_id"], []).append(row["option_id"])
    return [{"questionId": q, "optionIds": opts} for q, opts in grouped.items()]


def _fetch_questions(connection, schema, quiz_id):
    """Return questions with options. is_correct is deliberately not selected."""
    q_rows = connection.execute(
        text(f'''
            SELECT question_id, question_text, question_type::text AS question_type,
                   marks, display_order
            FROM "{schema}".quiz_question
            WHERE quiz_id = :quiz_id
            ORDER BY display_order, question_id
        '''),
        {"quiz_id": quiz_id},
    ).mappings().fetchall()
    o_rows = connection.execute(
        text(f'''
            SELECT o.option_id, o.question_id, o.option_text, o.display_order
            FROM "{schema}".quiz_option o
            JOIN "{schema}".quiz_question q ON q.question_id = o.question_id
            WHERE q.quiz_id = :quiz_id
            ORDER BY o.display_order, o.option_id
        '''),
        {"quiz_id": quiz_id},
    ).mappings().fetchall()

    options_by_q = {}
    for o in o_rows:
        options_by_q.setdefault(o["question_id"], []).append({
            "optionId": o["option_id"],
            "optionText": o["option_text"],
            "displayOrder": o["display_order"],
        })
    return [{
        "questionId": q["question_id"],
        "questionText": q["question_text"],
        "questionType": q["question_type"],
        "marks": _num(q["marks"]),
        "displayOrder": q["display_order"],
        "options": options_by_q.get(q["question_id"], []),
    } for q in q_rows]


def _get_quiz(connection, schema, quiz_id):
    quiz = connection.execute(
        text(f'''
            SELECT quiz_id, module_id, quiz_title, description,
                   quiz_type::text AS quiz_type, pass_percentage, is_active
            FROM "{schema}".quiz
            WHERE quiz_id = :quiz_id
        '''),
        {"quiz_id": quiz_id},
    ).mappings().fetchone()
    if not quiz:
        raise NotFoundError(f"Quiz {quiz_id} not found")
    return quiz


def _quiz_info(quiz):
    return {
        "quizId": quiz["quiz_id"],
        "moduleId": quiz["module_id"],
        "title": quiz["quiz_title"],
        "description": quiz["description"],
        "quizType": quiz["quiz_type"],
        "passPercentage": _num(quiz["pass_percentage"]),
    }


def _attempt_payload(connection, schema, attempt, include_questions=True):
    quiz = _get_quiz(connection, schema, attempt["quiz_id"])
    payload = {
        "attempt": _attempt_summary(attempt),
        "quiz": _quiz_info(quiz),
        "answers": _fetch_saved_answers(connection, schema, attempt["attempt_id"]),
    }
    if include_questions:
        payload["questions"] = _fetch_questions(connection, schema, attempt["quiz_id"])
    return payload


def _find_open_attempt(connection, schema, quiz_id, emp_id):
    return connection.execute(
        text(f'''
            SELECT attempt_id, quiz_id, employee_id, status::text AS status,
                   started_at, submitted_at, score, max_score, percentage, passed
            FROM "{schema}".quiz_attempt
            WHERE quiz_id = :quiz_id AND employee_id = :emp_id AND status = 'In Progress'
        '''),
        {"quiz_id": quiz_id, "emp_id": emp_id},
    ).mappings().fetchone()


def start_attempt(connection, schema, emp_id, quiz_id=None, module_id=None, quiz_type=None):
    """Start (or resume) an attempt for a quiz."""
    if quiz_id is not None:
        quiz = _get_quiz(connection, schema, quiz_id)
    else:
        if module_id is None or not quiz_type:
            raise ValueError("Provide quizId, or moduleId together with quizType")
        if quiz_type not in QUIZ_TYPES:
            raise ValueError(f"Invalid quizType: {quiz_type}. Must be one of {', '.join(QUIZ_TYPES)}")
        quiz = connection.execute(
            text(f'''
                SELECT quiz_id, module_id, quiz_title, description,
                       quiz_type::text AS quiz_type, pass_percentage, is_active
                FROM "{schema}".quiz
                WHERE module_id = :module_id
                  AND quiz_type = CAST(:quiz_type AS "{schema}".quiz_type_enum)
                  AND is_active = true
                ORDER BY quiz_id
                LIMIT 1
            '''),
            {"module_id": module_id, "quiz_type": quiz_type},
        ).mappings().fetchone()
        if not quiz:
            raise NotFoundError(f"No active {quiz_type} quiz found for module {module_id}")

    if not quiz["is_active"]:
        raise ConflictError(f"Quiz {quiz['quiz_id']} is not active")

    quiz_id = quiz["quiz_id"]
    attempt = _find_open_attempt(connection, schema, quiz_id, emp_id)
    resumed = attempt is not None

    if not attempt:
        try:
            # Savepoint so a concurrent-start race doesn't poison the transaction.
            with connection.begin_nested():
                new_row = connection.execute(
                    text(f'''
                        INSERT INTO "{schema}".quiz_attempt (quiz_id, employee_id, status)
                        VALUES (:quiz_id, :emp_id, 'In Progress')
                        RETURNING attempt_id, quiz_id, employee_id, status::text AS status,
                                  started_at, submitted_at, score, max_score, percentage, passed
                    '''),
                    {"quiz_id": quiz_id, "emp_id": emp_id},
                ).mappings().fetchone()
            attempt = new_row
        except IntegrityError as err:
            if _pgcode(err) != PG_UNIQUE_VIOLATION:
                raise
            attempt = _find_open_attempt(connection, schema, quiz_id, emp_id)
            resumed = True
            if not attempt:
                raise

    payload = _attempt_payload(connection, schema, attempt)
    payload["resumed"] = resumed
    return payload


def save_answers(connection, schema, emp_id, attempt_id, question_id, option_ids):
    """Replace the saved answers of one question in an open attempt."""
    if not isinstance(option_ids, list):
        raise ValueError("optionIds must be a list of integers")
    option_ids = sorted({_to_int(o, "optionIds") for o in option_ids})

    attempt = _get_attempt(connection, schema, attempt_id, emp_id, lock=True)
    if attempt["status"] != "In Progress":
        raise ConflictError(f"Attempt {attempt_id} is submitted and locked")

    question = connection.execute(
        text(f'''
            SELECT question_id, question_type::text AS question_type
            FROM "{schema}".quiz_question
            WHERE question_id = :question_id AND quiz_id = :quiz_id
        '''),
        {"question_id": question_id, "quiz_id": attempt["quiz_id"]},
    ).mappings().fetchone()
    if not question:
        raise ValueError(f"Question {question_id} does not belong to this quiz")

    if question["question_type"] == "Single Choice" and len(option_ids) > 1:
        raise ValueError("A Single Choice question accepts only one option")

    if option_ids:
        valid = connection.execute(
            text(f'''
                SELECT option_id FROM "{schema}".quiz_option
                WHERE question_id = :question_id AND option_id = ANY(:option_ids)
            '''),
            {"question_id": question_id, "option_ids": option_ids},
        ).mappings().fetchall()
        invalid = set(option_ids) - {r["option_id"] for r in valid}
        if invalid:
            raise ValueError(
                f"Option(s) {sorted(invalid)} do not belong to question {question_id}"
            )

    connection.execute(
        text(f'''
            DELETE FROM "{schema}".quiz_attempt_answer
            WHERE attempt_id = :attempt_id AND question_id = :question_id
        '''),
        {"attempt_id": attempt_id, "question_id": question_id},
    )
    for option_id in option_ids:
        connection.execute(
            text(f'''
                INSERT INTO "{schema}".quiz_attempt_answer (attempt_id, question_id, option_id)
                VALUES (:attempt_id, :question_id, :option_id)
            '''),
            {"attempt_id": attempt_id, "question_id": question_id, "option_id": option_id},
        )

    return {
        "message": "Answers saved",
        "attemptId": attempt_id,
        "questionId": question_id,
        "optionIds": option_ids,
        "answers": _fetch_saved_answers(connection, schema, attempt_id),
    }


def calculate_score(questions, correct_by_q, selected_by_q):
    """
    Score an attempt. A question's marks are awarded only when the selected
    option set exactly equals the set of correct options (all-or-nothing).

    questions: iterable of (question_id, marks)
    correct_by_q / selected_by_q: {question_id: set(option_id)}
    Returns (score, max_score) as Decimals.
    """
    score = Decimal("0")
    max_score = Decimal("0")
    for question_id, marks in questions:
        marks = Decimal(str(marks))
        max_score += marks
        correct = correct_by_q.get(question_id, set())
        selected = selected_by_q.get(question_id, set())
        if correct and selected == correct:
            score += marks
    return score, max_score


def submit_attempt(connection, schema, emp_id, attempt_id):
    """Score an open attempt and lock it."""
    attempt = _get_attempt(connection, schema, attempt_id, emp_id, lock=True)
    if attempt["status"] != "In Progress":
        raise ConflictError(f"Attempt {attempt_id} is already submitted and locked")

    quiz = _get_quiz(connection, schema, attempt["quiz_id"])

    questions = connection.execute(
        text(f'''
            SELECT question_id, marks FROM "{schema}".quiz_question WHERE quiz_id = :quiz_id
        '''),
        {"quiz_id": attempt["quiz_id"]},
    ).mappings().fetchall()
    if not questions:
        raise ValueError("Quiz has no questions and cannot be submitted")

    correct_rows = connection.execute(
        text(f'''
            SELECT o.question_id, o.option_id
            FROM "{schema}".quiz_option o
            JOIN "{schema}".quiz_question q ON q.question_id = o.question_id
            WHERE q.quiz_id = :quiz_id AND o.is_correct = true
        '''),
        {"quiz_id": attempt["quiz_id"]},
    ).mappings().fetchall()
    selected_rows = connection.execute(
        text(f'''
            SELECT question_id, option_id FROM "{schema}".quiz_attempt_answer
            WHERE attempt_id = :attempt_id
        '''),
        {"attempt_id": attempt_id},
    ).mappings().fetchall()

    correct_by_q, selected_by_q = {}, {}
    for r in correct_rows:
        correct_by_q.setdefault(r["question_id"], set()).add(r["option_id"])
    for r in selected_rows:
        selected_by_q.setdefault(r["question_id"], set()).add(r["option_id"])

    score, max_score = calculate_score(
        [(q["question_id"], q["marks"]) for q in questions], correct_by_q, selected_by_q
    )
    percentage = (
        (score / max_score * Decimal(100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if max_score > 0 else Decimal("0.00")
    )
    passed = percentage >= Decimal(str(quiz["pass_percentage"]))

    # The submitted check constraint needs every result column set in this same UPDATE.
    updated = connection.execute(
        text(f'''
            UPDATE "{schema}".quiz_attempt
            SET status = 'Submitted',
                submitted_at = CURRENT_TIMESTAMP,
                score = :score,
                max_score = :max_score,
                percentage = :percentage,
                passed = :passed
            WHERE attempt_id = :attempt_id
            RETURNING attempt_id, quiz_id, employee_id, status::text AS status,
                      started_at, submitted_at, score, max_score, percentage, passed
        '''),
        {
            "score": score, "max_score": max_score, "percentage": percentage,
            "passed": passed, "attempt_id": attempt_id,
        },
    ).mappings().fetchone()

    result = _attempt_summary(updated)
    return {
        "message": "Attempt submitted",
        "attempt": result,
        "score": result["score"],
        "maxScore": result["maxScore"],
        "percentage": result["percentage"],
        "passPercentage": _num(quiz["pass_percentage"]),
        "passed": result["passed"],
        "result": "Pass" if result["passed"] else "Fail",
    }


def get_attempt(connection, schema, emp_id, attempt_id):
    """Return an attempt with its questions and saved answers."""
    attempt = _get_attempt(connection, schema, attempt_id, emp_id)
    return _attempt_payload(connection, schema, attempt)


def attempt_quiz_v2(request):
    """
    Main function to attempt a quiz (V2 Schema).

    GET  ?attempt_id=<int>&email=<email>   (or employeeId=<int>)
        Returns the attempt, quiz info, questions/options and saved answers.

    POST {"action": "start", "email"|"employeeId", "quizId" | ("moduleId", "quizType")}
    POST {"action": "save", "email"|"employeeId", "attemptId", "questionId", "optionIds": [..]}
    POST {"action": "submit", "email"|"employeeId", "attemptId"}

    Errors: 400 validation, 403 not the owner, 404 not found, 409 locked/inactive.
    """
    logger.info(f"Received {request.method} request")

    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    if request.method not in ["GET", "POST"]:
        return _cors_response({"error": f"Method {request.method} not allowed"}, 405)

    try:
        schema = os.getenv("DB_SCHEMA")
        if request.method == "POST":
            if not request.is_json:
                return _cors_response({"error": "Request must be JSON"}, 400)
            data = request.get_json(silent=True)
            if not data or not isinstance(data, dict):
                return _cors_response({"error": "Invalid JSON data"}, 400)
            action = str(data.get("action") or "").strip().lower()
            if action not in ("start", "save", "submit"):
                return _cors_response(
                    {"error": "Invalid or missing action. Must be 'start', 'save' or 'submit'"}, 400
                )
            email, employee_id = data.get("email"), data.get("employeeId")
            attempt_id = quiz_id = module_id = question_id = None
            if action in ("save", "submit"):
                attempt_id = _to_int(data.get("attemptId"), "attemptId")
            if action == "save":
                question_id = _to_int(data.get("questionId"), "questionId")
            if action == "start":
                if data.get("quizId") is not None:
                    quiz_id = _to_int(data.get("quizId"), "quizId")
                elif data.get("moduleId") is not None:
                    module_id = _to_int(data.get("moduleId"), "moduleId")
            # Validate the request shape before touching the database.
            if not email and employee_id in (None, ""):
                return _cors_response({"error": "Missing required field: email or employeeId"}, 400)
        else:
            email, employee_id = request.args.get("email"), request.args.get("employeeId")
            attempt_id = _to_int(request.args.get("attempt_id"), "attempt_id")
            if not email and employee_id in (None, ""):
                return _cors_response({"error": "Missing required parameter: email or employeeId"}, 400)

        engine = get_db_engine()
        with engine.begin() as connection:
            emp_id = resolve_employee_id(connection, schema, email, employee_id)

            if request.method == "GET":
                return _cors_response(get_attempt(connection, schema, emp_id, attempt_id), 200)

            if action == "start":
                result = start_attempt(
                    connection, schema, emp_id, quiz_id=quiz_id, module_id=module_id,
                    quiz_type=data.get("quizType"),
                )
                return _cors_response(result, 200 if result["resumed"] else 201)
            if action == "save":
                result = save_answers(
                    connection, schema, emp_id, attempt_id, question_id, data.get("optionIds")
                )
                return _cors_response(result, 200)
            result = submit_attempt(connection, schema, emp_id, attempt_id)
            return _cors_response(result, 200)

    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return _cors_response({"error": str(e)}, 400)

    except NotFoundError as e:
        return _cors_response({"error": str(e)}, 404)

    except ForbiddenError as e:
        return _cors_response({"error": str(e)}, 403)

    except ConflictError as e:
        return _cors_response({"error": str(e)}, 409)

    except DBAPIError as db_err:
        code = _pgcode(db_err)
        if code == PG_CHECK_VIOLATION:
            # Submitted-attempt lock triggers raise check_violation.
            return _cors_response({"error": "Attempt is submitted and locked"}, 409)
        if code == PG_FOREIGN_KEY_VIOLATION:
            return _cors_response({"error": "Option does not belong to the question"}, 400)
        logger.exception("Database error in attempt_quiz_v2")
        return _cors_response({"error": "Database error"}, 500)

    except SQLAlchemyError:
        logger.exception("Database error in attempt_quiz_v2")
        return _cors_response({"error": "Database error"}, 500)

    except Exception:
        logger.exception("Unexpected error in attempt_quiz_v2")
        return _cors_response({"error": "Internal server error"}, 500)


"""
===========================================
LOCAL TESTING
===========================================

functions-framework --target=attempt_quiz_v2 --source main.py --debug --port=8113


===========================================
DEPLOYMENT COMMANDS
===========================================

gcloud functions deploy attemptQuiz_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point attempt_quiz_v2 \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""
