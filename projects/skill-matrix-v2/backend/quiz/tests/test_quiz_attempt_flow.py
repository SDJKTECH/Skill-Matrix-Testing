"""End-to-end attempt flow tests for backend/quiz/attemptQuiz_v2/main.py.

Uses a stateful in-memory fake connection (no real DB, network or credentials)
so start -> save -> read back -> submit can be exercised as one flow.
"""
import importlib.util
import sys
import types
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path

import pytest


def _install_stubs():
    """Stand in for libraries that are not installed (only main.py's imports)."""
    def mod(name, **attrs):
        module = types.ModuleType(name)
        module.__dict__.update(attrs)
        sys.modules[name] = module

    try:
        import dotenv  # noqa: F401
    except ImportError:
        mod("dotenv", load_dotenv=lambda *a, **k: None)
    try:
        import flask  # noqa: F401
    except ImportError:
        mod("flask", jsonify=lambda data: data, make_response=lambda *a, **k: a)
    try:
        import sqlalchemy  # noqa: F401
        import sqlalchemy.exc  # noqa: F401
        import sqlalchemy.pool  # noqa: F401
    except ImportError:
        class SQLAlchemyError(Exception):
            pass

        class DBAPIError(SQLAlchemyError):
            pass

        class IntegrityError(DBAPIError):
            pass

        mod("sqlalchemy", create_engine=None, text=lambda s: s)
        mod("sqlalchemy.exc", SQLAlchemyError=SQLAlchemyError,
            DBAPIError=DBAPIError, IntegrityError=IntegrityError)
        mod("sqlalchemy.pool", NullPool=object)


_install_stubs()

MAIN = Path(__file__).resolve().parent.parent / "attemptQuiz_v2" / "main.py"
_spec = importlib.util.spec_from_file_location("attempt_flow_main", MAIN)
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

S = "s"
EMP = 7


class Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)


class FlowConn:
    """Interprets the module's SQL by shape and keeps state in memory."""

    def __init__(self, questions, pass_pct=60, quiz_active=True):
        # questions: {qid: (type, marks, {option_id: is_correct})}
        self.questions = questions
        self.pass_pct = pass_pct
        self.quiz_active = quiz_active
        self.attempts = {}
        self.answers = set()  # (attempt_id, question_id, option_id)
        self.next_id = 100
        self.inserts = 0

    # -- helpers
    def _quiz(self):
        return {"quiz_id": 1, "module_id": 5, "quiz_title": "Q", "description": None,
                "quiz_type": "Lesson", "pass_percentage": self.pass_pct,
                "is_active": self.quiz_active}

    def _attempt_row(self, a):
        return dict(a)

    @contextmanager
    def begin_nested(self):
        yield

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        p = params or {}
        if sql.startswith("SELECT attempt_id") and "status = 'In Progress'" in sql:
            for a in self.attempts.values():
                if a["status"] == "In Progress" and a["employee_id"] == p["emp_id"]:
                    return Result([self._attempt_row(a)])
            return Result([])
        if sql.startswith("INSERT INTO") and ".quiz_attempt (" in sql:
            self.inserts += 1
            self.next_id += 1
            a = {"attempt_id": self.next_id, "quiz_id": p["quiz_id"],
                 "employee_id": p["emp_id"], "status": "In Progress",
                 "started_at": None, "submitted_at": None, "score": None,
                 "max_score": None, "percentage": None, "passed": None}
            self.attempts[a["attempt_id"]] = a
            return Result([self._attempt_row(a)])
        if sql.startswith("SELECT attempt_id") and "WHERE attempt_id" in sql:
            a = self.attempts.get(p["attempt_id"])
            return Result([self._attempt_row(a)] if a else [])
        if sql.startswith("SELECT quiz_id, module_id"):
            return Result([self._quiz()])
        if sql.startswith("SELECT question_id, question_text"):
            return Result([
                {"question_id": q, "question_text": f"Q{q}", "question_type": t,
                 "marks": mk, "display_order": q}
                for q, (t, mk, _) in self.questions.items()])
        if sql.startswith("SELECT o.option_id, o.question_id"):
            return Result([
                {"option_id": o, "question_id": q, "option_text": f"O{o}", "display_order": o}
                for q, (_, _, opts) in self.questions.items() for o in opts])
        if sql.startswith("SELECT question_id, question_type"):
            q = self.questions.get(p["question_id"])
            return Result([{"question_id": p["question_id"], "question_type": q[0]}] if q else [])
        if sql.startswith("SELECT question_id, marks"):
            return Result([{"question_id": q, "marks": mk}
                           for q, (_, mk, _) in self.questions.items()])
        if sql.startswith("SELECT option_id FROM") and "ANY" in sql:
            opts = self.questions[p["question_id"]][2]
            return Result([{"option_id": o} for o in p["option_ids"] if o in opts])
        if sql.startswith("SELECT o.question_id, o.option_id"):
            return Result([{"question_id": q, "option_id": o}
                           for q, (_, _, opts) in self.questions.items()
                           for o, c in opts.items() if c])
        if sql.startswith("SELECT question_id, option_id") and "ORDER BY" in sql:
            rows = sorted(r for r in self.answers if r[0] == p["attempt_id"])
            return Result([{"question_id": r[1], "option_id": r[2]} for r in rows])
        if sql.startswith("SELECT question_id, option_id"):
            return Result([{"question_id": r[1], "option_id": r[2]}
                           for r in self.answers if r[0] == p["attempt_id"]])
        if sql.startswith("DELETE FROM"):
            self.answers = {r for r in self.answers
                            if not (r[0] == p["attempt_id"] and r[1] == p["question_id"])}
            return Result([])
        if sql.startswith("INSERT INTO") and "quiz_attempt_answer" in sql:
            self.answers.add((p["attempt_id"], p["question_id"], p["option_id"]))
            return Result([])
        if sql.startswith("UPDATE"):
            a = self.attempts[p["attempt_id"]]
            a.update(status="Submitted", submitted_at="now", score=p["score"],
                     max_score=p["max_score"], percentage=p["percentage"], passed=p["passed"])
            return Result([self._attempt_row(a)])
        raise AssertionError(f"Unexpected SQL: {sql[:80]}")


# Q1 single (opts 11 correct,12), Q2 multiple (21,22 correct; 23 wrong), Q3 single (31 correct, 32)
def make_conn(pass_pct=60):
    return FlowConn({
        1: ("Single Choice", 1, {11: True, 12: False}),
        2: ("Multiple Choice", 2, {21: True, 22: True, 23: False}),
        3: ("Single Choice", 1, {31: True, 32: False}),
    }, pass_pct=pass_pct)


def start(conn):
    return m.start_attempt(conn, S, EMP, quiz_id=1)


def answer(conn, aid, answers):
    for q, opts in answers.items():
        m.save_answers(conn, S, EMP, aid, q, opts)


def submit_with(answers, pass_pct=60):
    conn = make_conn(pass_pct)
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, answers)
    return m.submit_attempt(conn, S, EMP, aid)


# ---------------- start ----------------
def test_start_creates_attempt_with_questions_and_options():
    conn = make_conn()
    res = start(conn)
    assert res["resumed"] is False
    assert res["attempt"]["status"] == "In Progress"
    assert conn.inserts == 1
    assert [q["questionId"] for q in res["questions"]] == [1, 2, 3]
    assert [o["optionId"] for o in res["questions"][1]["options"]] == [21, 22, 23]
    assert res["answers"] == []
    assert "isCorrect" not in str(res) and "is_correct" not in str(res)


def test_second_start_returns_open_attempt_without_new_insert():
    conn = make_conn()
    first = start(conn)
    second = start(conn)
    assert second["resumed"] is True
    assert second["attempt"]["attemptId"] == first["attempt"]["attemptId"]
    assert conn.inserts == 1


def test_resumed_start_returns_previously_saved_answers():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [12]})
    assert start(conn)["answers"] == [{"questionId": 1, "optionIds": [12]}]


# ---------------- save / read back ----------------
def test_saved_answers_read_back_per_attempt():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11], 2: [22, 21]})
    got = m.get_attempt(conn, S, EMP, aid)["answers"]
    assert got == [{"questionId": 1, "optionIds": [11]},
                   {"questionId": 2, "optionIds": [21, 22]}]


def test_answers_are_isolated_between_attempts():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11]})
    conn.answers.add((999, 3, 31))  # another attempt's answer
    assert m.get_attempt(conn, S, EMP, aid)["answers"] == [{"questionId": 1, "optionIds": [11]}]


def test_resaving_question_replaces_earlier_answers():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {2: [21, 22]})
    res = m.save_answers(conn, S, EMP, aid, 2, [23])
    assert res["optionIds"] == [23]
    assert res["answers"] == [{"questionId": 2, "optionIds": [23]}]


def test_navigating_back_keeps_other_answers():
    """Saving question 2 does not disturb the answer saved for question 1."""
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11], 2: [21]})
    answer(conn, aid, {1: [12]})
    got = {a["questionId"]: a["optionIds"] for a in m.get_attempt(conn, S, EMP, aid)["answers"]}
    assert got == {1: [12], 2: [21]}


def test_clearing_answer_with_empty_list():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11]})
    assert m.save_answers(conn, S, EMP, aid, 1, [])["answers"] == []


def test_option_from_another_question_rejected_and_nothing_written():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11]})
    with pytest.raises(ValueError, match="do not belong"):
        m.save_answers(conn, S, EMP, aid, 1, [21])
    assert conn.answers == {(aid, 1, 11)}


def test_single_choice_rejects_two_options_and_unknown_question():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    with pytest.raises(ValueError, match="only one"):
        m.save_answers(conn, S, EMP, aid, 1, [11, 12])
    with pytest.raises(ValueError, match="does not belong to this quiz"):
        m.save_answers(conn, S, EMP, aid, 99, [11])


def test_other_employee_cannot_save_or_submit():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    with pytest.raises(m.ForbiddenError):
        m.save_answers(conn, S, EMP + 1, aid, 1, [11])
    with pytest.raises(m.ForbiddenError):
        m.submit_attempt(conn, S, EMP + 1, aid)


# ---------------- scoring ----------------
def test_score_all_correct_passes():
    r = submit_with({1: [11], 2: [21, 22], 3: [31]})
    assert (r["score"], r["maxScore"], r["percentage"]) == (4.0, 4.0, 100.0)
    assert r["passed"] is True and r["result"] == "Pass"


def test_score_all_wrong_fails():
    r = submit_with({1: [12], 2: [23], 3: [32]})
    assert (r["score"], r["percentage"]) == (0.0, 0.0)
    assert r["passed"] is False and r["result"] == "Fail"


def test_score_nothing_answered_fails():
    r = submit_with({})
    assert r["score"] == 0.0 and r["result"] == "Fail"


def test_multiple_choice_partial_selection_gets_no_credit():
    # Only one of the two correct options -> Q2 (2 marks) lost; Q1+Q3 = 2/4
    r = submit_with({1: [11], 2: [21], 3: [31]})
    assert r["score"] == 2.0 and r["percentage"] == 50.0


def test_multiple_choice_extra_wrong_option_gets_no_credit():
    r = submit_with({1: [11], 2: [21, 22, 23], 3: [31]})
    assert r["score"] == 2.0


@pytest.mark.parametrize("pass_pct, expected", [(50, True), (50.01, False), (75, False)])
def test_pass_mark_boundary(pass_pct, expected):
    # Score 2/4 = 50.00%
    r = submit_with({1: [11], 2: [21], 3: [31]}, pass_pct=pass_pct)
    assert r["percentage"] == 50.0
    assert r["passed"] is expected
    assert r["result"] == ("Pass" if expected else "Fail")


def test_percentage_rounds_half_up_to_two_decimals():
    score, mx = m.calculate_score([(1, 1), (2, 1), (3, 1)], {1: {1}}, {1: {1}})
    assert (score, mx) == (Decimal("1"), Decimal("3"))
    r = submit_with({1: [11]})  # 1/4 = 25%
    assert r["percentage"] == 25.0


# ---------------- locking after submit ----------------
def test_submit_stores_result_and_locks_attempt():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11]})
    r = m.submit_attempt(conn, S, EMP, aid)
    assert r["attempt"]["status"] == "Submitted"
    assert conn.attempts[aid]["submitted_at"] is not None


def test_save_and_submit_refused_after_submit():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11]})
    m.submit_attempt(conn, S, EMP, aid)
    before = set(conn.answers)
    with pytest.raises(m.ConflictError):
        m.save_answers(conn, S, EMP, aid, 1, [12])
    with pytest.raises(m.ConflictError):
        m.submit_attempt(conn, S, EMP, aid)
    assert conn.answers == before


def test_start_after_submit_creates_new_attempt():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    m.submit_attempt(conn, S, EMP, aid)
    again = start(conn)
    assert again["resumed"] is False
    assert again["attempt"]["attemptId"] != aid


def test_submitted_attempt_readable_with_result():
    conn = make_conn()
    aid = start(conn)["attempt"]["attemptId"]
    answer(conn, aid, {1: [11], 2: [21, 22], 3: [31]})
    m.submit_attempt(conn, S, EMP, aid)
    got = m.get_attempt(conn, S, EMP, aid)
    assert got["attempt"]["status"] == "Submitted"
    assert got["attempt"]["passed"] is True
    assert got["attempt"]["percentage"] == 100.0
