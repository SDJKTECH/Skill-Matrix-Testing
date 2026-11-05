"""Tests for backend/quiz/attemptQuiz_v2/main.py (no real DB, network or credentials)."""
import importlib.util
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

# The module under test needs these libraries; skip cleanly when one is not installed.
flask = pytest.importorskip("flask")
pytest.importorskip("dotenv")
sa_exc = pytest.importorskip("sqlalchemy.exc")
Flask = flask.Flask
DBAPIError, IntegrityError = sa_exc.DBAPIError, sa_exc.IntegrityError

MAIN = Path(__file__).resolve().parent.parent / "attemptQuiz_v2" / "main.py"
spec = importlib.util.spec_from_file_location("attempt_quiz_v2_main", MAIN)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

SCHEMA = "s"


class Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)


class FakeConn:
    """Routes SQL to canned rows by substring; records every statement."""

    def __init__(self, routes):
        self.routes = routes  # list of (substring, rows or callable or Exception)
        self.calls = []

    def execute(self, stmt, params=None):
        sql = str(stmt)
        self.calls.append((sql, params))
        for key, val in self.routes:
            if key in sql:
                if isinstance(val, Exception):
                    raise val
                if callable(val):
                    val = val(params)
                return Result(val)
        return Result([])

    def begin_nested(self):
        @contextmanager
        def cm():
            yield
        return cm()

    def sql_with(self, key):
        return [c for c in self.calls if key in c[0]]


def attempt_row(status="In Progress", emp=1, quiz=10, attempt=100, **kw):
    row = dict(attempt_id=attempt, quiz_id=quiz, employee_id=emp, status=status,
               started_at=None, submitted_at=None, score=None, max_score=None,
               percentage=None, passed=None)
    row.update(kw)
    return row


def quiz_row(active=True, pass_pct=Decimal("60")):
    return dict(quiz_id=10, module_id=5, quiz_title="Q", description="d",
                quiz_type="Lesson", pass_percentage=pass_pct, is_active=active)


def pg_error(cls, code):
    return cls("stmt", {}, SimpleNamespace(pgcode=code))


# ---------- calculate_score ----------

def test_score_all_or_nothing_multiple_choice():
    qs = [(1, Decimal("2")), (2, Decimal("3"))]
    correct = {1: {1, 2}, 2: {5}}
    # partial selection on q1 gets nothing, q2 exact gets 3
    assert m.calculate_score(qs, correct, {1: {1}, 2: {5}}) == (Decimal("3"), Decimal("5"))
    # superset on q1 gets nothing
    assert m.calculate_score(qs, correct, {1: {1, 2, 9}})[0] == 0
    # exact on both
    assert m.calculate_score(qs, correct, {1: {1, 2}, 2: {5}}) == (Decimal("5"), Decimal("5"))


def test_score_unanswered_and_no_correct_options():
    qs = [(1, 1), (2, 1)]
    assert m.calculate_score(qs, {1: {1}}, {}) == (Decimal("0"), Decimal("2"))
    # a question with no correct option never scores, even if unanswered
    assert m.calculate_score(qs, {}, {2: set()})[0] == 0


# ---------- helpers ----------

def test_to_int():
    assert m._to_int("5", "f") == 5
    for bad in (None, True, "abc", [1]):
        with pytest.raises(ValueError):
            m._to_int(bad, "f")


def test_resolve_employee():
    c = FakeConn([("WHERE id", [{"id": 7}])])
    assert m.resolve_employee_id(c, SCHEMA, employee_id="7") == 7
    c = FakeConn([("LOWER(email)", [{"id": 8}])])
    assert m.resolve_employee_id(c, SCHEMA, email=" a@b.c ") == 8
    assert c.calls[0][1] == {"email": "a@b.c"}
    with pytest.raises(m.NotFoundError):
        m.resolve_employee_id(FakeConn([]), SCHEMA, employee_id=1)
    with pytest.raises(m.NotFoundError):
        m.resolve_employee_id(FakeConn([]), SCHEMA, email="x@y.z")
    with pytest.raises(ValueError):
        m.resolve_employee_id(FakeConn([]), SCHEMA)


# ---------- start ----------

def test_start_creates_attempt_and_hides_is_correct():
    new = attempt_row()
    c = FakeConn([
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("status = 'In Progress'", []),
        ("INSERT INTO", [new]),
        ("FROM \"s\".quiz_attempt_answer", [{"question_id": 1, "option_id": 2}]),
        ("FROM \"s\".quiz_question", [dict(question_id=1, question_text="t",
                                          question_type="Single Choice", marks=Decimal("1"),
                                          display_order=1)]),
        ("FROM \"s\".quiz_option", [dict(option_id=2, question_id=1, option_text="o",
                                        display_order=1)]),
    ])
    out = m.start_attempt(c, SCHEMA, 1, quiz_id=10)
    assert out["resumed"] is False
    assert out["attempt"]["status"] == "In Progress"
    assert out["answers"] == [{"questionId": 1, "optionIds": [2]}]
    assert out["questions"][0]["options"][0]["optionId"] == 2
    assert "is_correct" not in repr(out).lower() and "iscorrect" not in repr(out).lower()
    # the SQL that fetches options must not select is_correct
    for sql, _ in c.sql_with("quiz_option"):
        assert "is_correct" not in sql
    assert c.sql_with("INSERT INTO")


def test_start_returns_existing_open_attempt_without_insert():
    c = FakeConn([
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("status = 'In Progress'", [attempt_row()]),
    ])
    out = m.start_attempt(c, SCHEMA, 1, quiz_id=10)
    assert out["resumed"] is True
    assert not c.sql_with("INSERT INTO")


def test_start_race_unique_violation_falls_back_to_open_attempt():
    looks = iter([[], [attempt_row()]])
    c = FakeConn([
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("status = 'In Progress'", lambda p: next(looks)),
        ("INSERT INTO", pg_error(IntegrityError, m.PG_UNIQUE_VIOLATION)),
    ])
    assert m.start_attempt(c, SCHEMA, 1, quiz_id=10)["resumed"] is True


def test_start_other_integrity_error_reraised():
    c = FakeConn([
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("status = 'In Progress'", []),
        ("INSERT INTO", pg_error(IntegrityError, m.PG_FOREIGN_KEY_VIOLATION)),
    ])
    with pytest.raises(IntegrityError):
        m.start_attempt(c, SCHEMA, 1, quiz_id=10)


def test_start_inactive_quiz_conflict_and_missing_quiz():
    with pytest.raises(m.ConflictError):
        m.start_attempt(FakeConn([("FROM \"s\".quiz\n", [quiz_row(active=False)])]),
                        SCHEMA, 1, quiz_id=10)
    with pytest.raises(m.NotFoundError):
        m.start_attempt(FakeConn([]), SCHEMA, 1, quiz_id=10)


def test_start_by_module_and_type():
    c = FakeConn([("module_id = :module_id", [quiz_row()]),
                  ("status = 'In Progress'", [attempt_row()])])
    assert m.start_attempt(c, SCHEMA, 1, module_id=5, quiz_type="Lesson")["resumed"]
    assert c.calls[0][1] == {"module_id": 5, "quiz_type": "Lesson"}
    with pytest.raises(m.NotFoundError):
        m.start_attempt(FakeConn([]), SCHEMA, 1, module_id=5, quiz_type="Lesson")
    with pytest.raises(ValueError):
        m.start_attempt(FakeConn([]), SCHEMA, 1, module_id=5, quiz_type="Bogus")
    with pytest.raises(ValueError):
        m.start_attempt(FakeConn([]), SCHEMA, 1, module_id=5)
    with pytest.raises(ValueError):
        m.start_attempt(FakeConn([]), SCHEMA, 1)


# ---------- save ----------

def save_conn(status="In Progress", emp=1, qtype="Multiple Choice", question=True, valid=(2, 3)):
    return FakeConn([
        ("FROM \"s\".quiz_attempt\n", [attempt_row(status=status, emp=emp)]),
        ("question_type::text", [dict(question_id=1, question_type=qtype)] if question else []),
        ("SELECT option_id FROM", [{"option_id": o} for o in valid]),
        ("SELECT question_id, option_id", [{"question_id": 1, "option_id": 2}]),
    ])


def test_save_replaces_previous_answers_and_dedupes():
    c = save_conn()
    out = m.save_answers(c, SCHEMA, 1, 100, 1, [3, 2, 2])
    assert out["optionIds"] == [2, 3]
    kinds = [s.split()[0] for s, _ in c.calls if s.strip().startswith(("DELETE", "INSERT"))]
    assert kinds == ["DELETE", "INSERT", "INSERT"]
    assert "FOR UPDATE" in c.calls[0][0]


def test_save_empty_list_clears_answer():
    c = save_conn()
    out = m.save_answers(c, SCHEMA, 1, 100, 1, [])
    assert out["optionIds"] == []
    assert c.sql_with("DELETE FROM") and not c.sql_with("INSERT INTO")


def test_save_rejects_bad_input():
    with pytest.raises(m.ForbiddenError):
        m.save_answers(save_conn(emp=2), SCHEMA, 1, 100, 1, [2])
    with pytest.raises(m.ConflictError):
        m.save_answers(save_conn(status="Submitted"), SCHEMA, 1, 100, 1, [2])
    with pytest.raises(m.NotFoundError):
        m.save_answers(FakeConn([]), SCHEMA, 1, 100, 1, [2])
    with pytest.raises(ValueError):
        m.save_answers(save_conn(question=False), SCHEMA, 1, 100, 1, [2])
    with pytest.raises(ValueError):  # option from another question
        m.save_answers(save_conn(valid=(2,)), SCHEMA, 1, 100, 1, [2, 99])
    with pytest.raises(ValueError):  # single choice with 2 options
        m.save_answers(save_conn(qtype="Single Choice"), SCHEMA, 1, 100, 1, [2, 3])
    with pytest.raises(ValueError):
        m.save_answers(save_conn(), SCHEMA, 1, 100, 1, "2")
    with pytest.raises(ValueError):
        m.save_answers(save_conn(), SCHEMA, 1, 100, 1, ["x"])


def test_save_rejected_does_not_write():
    c = save_conn(valid=(2,))
    with pytest.raises(ValueError):
        m.save_answers(c, SCHEMA, 1, 100, 1, [2, 99])
    assert not c.sql_with("DELETE FROM") and not c.sql_with("INSERT INTO")


# ---------- submit ----------

def submit_conn(selected, pass_pct=Decimal("60"), status="In Progress", emp=1, questions=None):
    questions = questions if questions is not None else [
        {"question_id": 1, "marks": Decimal("1")}, {"question_id": 2, "marks": Decimal("1")},
        {"question_id": 3, "marks": Decimal("1")}]
    return FakeConn([
        ("FROM \"s\".quiz_attempt\n", [attempt_row(status=status, emp=emp)]),
        ("FROM \"s\".quiz\n", [quiz_row(pass_pct=pass_pct)]),
        ("SELECT question_id, marks", questions),
        ("is_correct = true", [{"question_id": 1, "option_id": 11},
                               {"question_id": 2, "option_id": 21},
                               {"question_id": 3, "option_id": 31}]),
        ("FROM \"s\".quiz_attempt_answer", [{"question_id": q, "option_id": o} for q, o in selected]),
        ("UPDATE", lambda p: [attempt_row(
            status="Submitted", score=p["score"], max_score=p["max_score"],
            percentage=p["percentage"], passed=p["passed"])]),
    ])


def test_submit_pass_sets_all_result_columns_in_one_update():
    c = submit_conn([(1, 11), (2, 21), (3, 99)])  # 2/3 = 66.67 >= 60
    out = m.submit_attempt(c, SCHEMA, 1, 100)
    assert (out["score"], out["maxScore"], out["percentage"]) == (2.0, 3.0, 66.67)
    assert out["passed"] is True and out["result"] == "Pass"
    updates = c.sql_with("UPDATE")
    assert len(updates) == 1
    sql = updates[0][0]
    for col in ("status = 'Submitted'", "submitted_at", "score", "max_score", "percentage", "passed"):
        assert col in sql


def test_submit_fail_and_boundary():
    out = m.submit_attempt(submit_conn([(1, 11)]), SCHEMA, 1, 100)  # 33.33
    assert out["passed"] is False and out["result"] == "Fail"
    # exactly equal to pass percentage passes
    out = m.submit_attempt(submit_conn([(1, 11)], pass_pct=Decimal("33.33")), SCHEMA, 1, 100)
    assert out["passed"] is True
    # nothing answered
    out = m.submit_attempt(submit_conn([]), SCHEMA, 1, 100)
    assert out["score"] == 0.0 and out["passed"] is False


def test_submit_guards():
    with pytest.raises(m.ConflictError):
        m.submit_attempt(submit_conn([], status="Submitted"), SCHEMA, 1, 100)
    with pytest.raises(m.ForbiddenError):
        m.submit_attempt(submit_conn([], emp=2), SCHEMA, 1, 100)
    with pytest.raises(ValueError):
        m.submit_attempt(submit_conn([], questions=[]), SCHEMA, 1, 100)
    c = submit_conn([], status="Submitted")
    with pytest.raises(m.ConflictError):
        m.submit_attempt(c, SCHEMA, 1, 100)
    assert not c.sql_with("UPDATE")


def test_get_attempt_checks_owner():
    with pytest.raises(m.ForbiddenError):
        m.get_attempt(FakeConn([("FROM \"s\".quiz_attempt\n", [attempt_row(emp=2)])]), SCHEMA, 1, 100)


# ---------- entry point ----------

@pytest.fixture
def app():
    return Flask(__name__)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("DB_SCHEMA", SCHEMA)


def patch_engine(monkeypatch, conn):
    engine = MagicMock()
    engine.begin.return_value.__enter__.return_value = conn
    monkeypatch.setattr(m, "get_db_engine", lambda: engine)
    return engine


def call(app, method="POST", json=None, query=None):
    with app.test_request_context(method=method, json=json, query_string=query):
        from flask import request
        resp = m.attempt_quiz_v2(request)
        return resp.status_code, resp.get_json(silent=True), resp


def test_entry_options_and_method(app):
    code, _, resp = call(app, "OPTIONS")
    assert code == 204 and resp.headers["Access-Control-Allow-Origin"] == "*"
    assert call(app, "DELETE")[0] == 405


def test_entry_validation_before_db(app, monkeypatch):
    def boom():
        raise AssertionError("DB must not be touched")
    monkeypatch.setattr(m, "get_db_engine", boom)
    assert call(app, json={"action": "x"})[0] == 400
    assert call(app, json={"action": "start", "quizId": 1})[0] == 400  # no employee
    assert call(app, json={"action": "save", "email": "a@b.c", "attemptId": 1})[0] == 400
    assert call(app, json={"action": "submit", "email": "a@b.c", "attemptId": "z"})[0] == 400
    assert call(app, "GET", query={"email": "a@b.c"})[0] == 400
    assert call(app, "GET", query={"attempt_id": "1"})[0] == 400


def test_entry_start_status_codes(app, monkeypatch):
    patch_engine(monkeypatch, FakeConn([
        ("FROM \"s\".employee", [{"id": 1}]),
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("status = 'In Progress'", []),
        ("INSERT INTO", [attempt_row()]),
    ]))
    code, body, _ = call(app, json={"action": "start", "email": "a@b.c", "quizId": 10})
    assert code == 201 and body["attempt"]["attemptId"] == 100
    patch_engine(monkeypatch, FakeConn([
        ("FROM \"s\".employee", [{"id": 1}]),
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("status = 'In Progress'", [attempt_row()]),
    ]))
    assert call(app, json={"action": "start", "employeeId": 1, "quizId": 10})[0] == 200


@pytest.mark.parametrize("conn_routes,expected", [
    ([], 404),  # employee not found
    ([("FROM \"s\".employee", [{"id": 1}]),
      ("FROM \"s\".quiz_attempt\n", [attempt_row(emp=2)])], 403),
    ([("FROM \"s\".employee", [{"id": 1}]),
      ("FROM \"s\".quiz_attempt\n", [attempt_row(status="Submitted")])], 409),
    ([("FROM \"s\".employee", [{"id": 1}]),
      ("FROM \"s\".quiz_attempt\n", pg_error(DBAPIError, m.PG_CHECK_VIOLATION))], 409),
    ([("FROM \"s\".employee", [{"id": 1}]),
      ("FROM \"s\".quiz_attempt\n", pg_error(DBAPIError, m.PG_FOREIGN_KEY_VIOLATION))], 400),
    ([("FROM \"s\".employee", [{"id": 1}]),
      ("FROM \"s\".quiz_attempt\n", pg_error(DBAPIError, "XX000"))], 500),
    ([("FROM \"s\".employee", [{"id": 1}]),
      ("FROM \"s\".quiz_attempt\n", RuntimeError("secret detail"))], 500),
])
def test_entry_error_mapping(app, monkeypatch, conn_routes, expected):
    patch_engine(monkeypatch, FakeConn(conn_routes))
    code, body, _ = call(app, json={"action": "submit", "email": "a@b.c", "attemptId": 100})
    assert code == expected
    assert "secret detail" not in str(body)


def test_entry_get_returns_attempt_with_answers(app, monkeypatch):
    patch_engine(monkeypatch, FakeConn([
        ("FROM \"s\".employee", [{"id": 1}]),
        ("FROM \"s\".quiz_attempt\n", [attempt_row()]),
        ("FROM \"s\".quiz\n", [quiz_row()]),
        ("FROM \"s\".quiz_attempt_answer", [{"question_id": 1, "option_id": 2}]),
    ]))
    code, body, _ = call(app, "GET", query={"attempt_id": "100", "email": "a@b.c"})
    assert code == 200
    assert body["answers"] == [{"questionId": 1, "optionIds": [2]}]
    assert "questions" in body
