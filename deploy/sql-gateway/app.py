"""
Kubenex SQL Gateway — a thin HTTP bridge in front of the Spark Thrift Server.

The Thrift Server speaks the Hive binary protocol, which a browser or a
Next.js route handler cannot talk to directly. This service exposes a small
JSON API over it:

    POST /query    {"query": "SELECT 1"} -> {"columns": [...], "rows": [...]}
    GET  /history  -> recent executions, newest first
    GET  /jobs     -> scheduled jobs
    POST /jobs     -> create a scheduled job
    DELETE /jobs/{id}
    GET  /health   -> {"ok": true}

Scheduled jobs are stored here rather than written into Airflow's DAG folder,
which is a read-only ConfigMap. A factory DAG in Airflow reads this table and
generates one DAG per row, so scheduling a notebook never requires the web app
to hold Kubernetes API credentials.

Every statement that passes through /query is recorded to Postgres, so query
history is captured centrally no matter which part of the UI ran it (SQL
editor, notebook cell, ingest job). History writes are best-effort: if the
history store is unreachable the query still returns normally.

Deployed into the data-platform namespace; see deployment.yaml.
"""

import json
import os
import re
import time
import logging
from typing import Any

import psycopg2
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pyhive import hive

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("sql-gateway")

THRIFT_HOST = os.environ.get("THRIFT_HOST", "spark-thrift")
THRIFT_PORT = int(os.environ.get("THRIFT_PORT", "10000"))

# Spark's Thrift Server is usually reachable with NOSASL; some builds expect
# SASL PLAIN (PyHive calls that "NONE"). Try each in turn rather than making
# the operator guess which one their deployment uses.
AUTH_MODES = ["NOSASL", "NONE"]

# Guard against a runaway SELECT pulling an unbounded result set into memory.
MAX_ROWS = int(os.environ.get("MAX_ROWS", "1000"))

PG_HOST = os.environ.get("PG_HOST", "postgres.data-platform.svc.cluster.local")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
PG_DB = os.environ.get("PG_DB", "dataplatform")
PG_USER = os.environ.get("POSTGRES_USER", "")
PG_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "")

app = FastAPI(title="Kubenex SQL Gateway")


class QueryRequest(BaseModel):
    query: str
    # Accepted and ignored: /api/sql sends it, but the host/port come from env
    # so the gateway can't be pointed at an arbitrary backend by a caller.
    jdbc_url: str | None = None
    max_rows: int | None = None
    # Which part of the UI ran this, for the history view.
    source: str | None = None


def _clean_error(exc: Exception) -> str:
    """Pull the human-readable message out of a Thrift exception.

    PyHive surfaces failures as a full TExecuteStatementResp repr, which buries
    the actual Spark message inside hundreds of characters of protocol noise.
    The useful part is the first Spark/Hive exception line.
    """
    raw = str(exc)
    match = re.search(
        r"(?:org\.apache\.spark\.sql\.\w+|org\.apache\.hive\.[\w.]+):\s*(.+?)(?:\\n|$)",
        raw,
    )
    if match:
        return match.group(1).strip()
    return raw[:500]


def _connect() -> Any:
    """Open a Thrift connection, trying each supported auth mode."""
    last_error: Exception | None = None
    for auth in AUTH_MODES:
        try:
            return hive.connect(host=THRIFT_HOST, port=THRIFT_PORT, auth=auth)
        except Exception as exc:  # noqa: BLE001 - surfaced to the caller below
            last_error = exc
            log.warning("connect failed with auth=%s: %s", auth, exc)
    raise RuntimeError(f"could not connect to thrift: {last_error}")


# ── Query history ───────────────────────────────────────────────────────────

def _pg() -> Any:
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
        connect_timeout=5,
    )


def _init_jobs() -> None:
    """Create the scheduled-jobs table if it does not exist. Safe to re-run."""
    with _pg() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS scheduled_jobs (
                id              BIGSERIAL PRIMARY KEY,
                name            TEXT        NOT NULL UNIQUE,
                dag_id          TEXT        NOT NULL UNIQUE,
                source_notebook TEXT,
                schedule        TEXT        NOT NULL,
                statements      JSONB       NOT NULL,
                enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )


def _init_history() -> None:
    """Create the history table if it does not exist. Safe to re-run."""
    with _pg() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS query_history (
                id          BIGSERIAL PRIMARY KEY,
                statement   TEXT        NOT NULL,
                source      TEXT        NOT NULL DEFAULT 'unknown',
                status      TEXT        NOT NULL,
                error       TEXT,
                row_count   INTEGER,
                truncated   BOOLEAN     NOT NULL DEFAULT FALSE,
                duration_ms INTEGER     NOT NULL,
                started_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS query_history_started_at_idx "
            "ON query_history (started_at DESC)"
        )


def _record(
    statement: str,
    source: str,
    status: str,
    duration_ms: int,
    row_count: int | None = None,
    truncated: bool = False,
    error: str | None = None,
) -> None:
    """Best-effort history write. A failure here must never fail the query."""
    try:
        with _pg() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO query_history
                    (statement, source, status, error, row_count,
                     truncated, duration_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (statement, source, status, error, row_count,
                 truncated, duration_ms),
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("history write failed: %s", exc)


@app.on_event("startup")
def startup() -> None:
    try:
        _init_history()
        _init_jobs()
        log.info("history + jobs tables ready on %s/%s", PG_HOST, PG_DB)
    except Exception as exc:  # noqa: BLE001
        # The gateway is still useful without history, so start anyway.
        log.warning("history init failed, continuing without it: %s", exc)


@app.get("/history")
def history(limit: int = 100, source: str | None = None) -> dict[str, Any]:
    limit = max(1, min(limit, 500))
    try:
        clause = "WHERE source = %s" if source else ""
        params: tuple[Any, ...] = (source, limit) if source else (limit,)
        with _pg() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, statement, source, status, error, row_count,
                       truncated, duration_ms, started_at
                FROM query_history
                {clause}
                ORDER BY started_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()
        return {
            "entries": [
                {
                    "id": r[0],
                    "statement": r[1],
                    "source": r[2],
                    "status": r[3],
                    "error": r[4],
                    "rowCount": r[5],
                    "truncated": r[6],
                    "durationMs": r[7],
                    "startedAt": r[8].isoformat(),
                }
                for r in rows
            ]
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc), "entries": []}


# ── Scheduled jobs ──────────────────────────────────────────────────────────

# Airflow dag_ids allow letters, digits, dash, dot and underscore only.
_SLUG_RE = re.compile(r"[^A-Za-z0-9_]+")


def _slug(name: str) -> str:
    slug = _SLUG_RE.sub("_", name).strip("_").lower()
    return f"kbx_{slug or 'job'}"


class JobRequest(BaseModel):
    name: str
    schedule: str
    statements: list[str]
    source_notebook: str | None = None


@app.get("/jobs")
def list_jobs() -> dict[str, Any]:
    try:
        with _pg() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, dag_id, source_notebook, schedule,
                       statements, enabled, created_at
                FROM scheduled_jobs
                ORDER BY created_at DESC
                """
            )
            rows = cur.fetchall()
        return {
            "jobs": [
                {
                    "id": r[0],
                    "name": r[1],
                    "dagId": r[2],
                    "sourceNotebook": r[3],
                    "schedule": r[4],
                    "statements": r[5],
                    "enabled": r[6],
                    "createdAt": r[7].isoformat(),
                }
                for r in rows
            ]
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc), "jobs": []}


@app.post("/jobs")
def create_job(req: JobRequest) -> Any:
    name = (req.name or "").strip()
    statements = [s.strip().rstrip(";") for s in req.statements if s and s.strip()]

    if not name:
        return JSONResponse(status_code=400, content={"error": "Name is required"})
    if not statements:
        return JSONResponse(
            status_code=400, content={"error": "At least one statement is required"}
        )
    if not (req.schedule or "").strip():
        return JSONResponse(status_code=400, content={"error": "Schedule is required"})

    try:
        with _pg() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scheduled_jobs
                    (name, dag_id, source_notebook, schedule, statements)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, dag_id
                """,
                (
                    name,
                    _slug(name),
                    req.source_notebook,
                    req.schedule.strip(),
                    json.dumps(statements),
                ),
            )
            job_id, dag_id = cur.fetchone()
        return {"id": job_id, "dagId": dag_id, "statements": len(statements)}
    except psycopg2.errors.UniqueViolation:
        return JSONResponse(
            status_code=409,
            content={"error": f"A job named {name!r} already exists."},
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=502, content={"error": str(exc)})


@app.delete("/jobs/{job_id}")
def delete_job(job_id: int) -> Any:
    try:
        with _pg() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM scheduled_jobs WHERE id = %s", (job_id,))
            removed = cur.rowcount
        if not removed:
            return JSONResponse(status_code=404, content={"error": "No such job"})
        return {"deleted": job_id}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=502, content={"error": str(exc)})


# ── Execution ───────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, Any]:
    result: dict[str, Any] = {"thrift": f"{THRIFT_HOST}:{THRIFT_PORT}"}
    try:
        conn = _connect()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchall()
        cur.close()
        conn.close()
        result["ok"] = True
    except Exception as exc:  # noqa: BLE001
        result["ok"] = False
        result["error"] = str(exc)

    try:
        with _pg() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
        result["history"] = True
    except Exception:  # noqa: BLE001
        result["history"] = False

    return result


@app.post("/query")
def query(req: QueryRequest) -> Any:
    sql = (req.query or "").strip().rstrip(";")
    if not sql:
        return JSONResponse(status_code=400, content={"error": "Query is required"})

    source = req.source or "unknown"
    limit = req.max_rows or MAX_ROWS
    started = time.monotonic()
    conn = None
    cur = None

    try:
        conn = _connect()
        cur = conn.cursor()
        cur.execute(sql)

        # DDL/DML statements (CREATE, INSERT, ...) have no result set. Spark
        # reports this as either None or an empty descriptor depending on the
        # statement, so both must be treated as "no rows" — otherwise the
        # fetch below raises and a statement that actually succeeded gets
        # reported to the caller as a failure.
        if not cur.description:
            elapsed = int((time.monotonic() - started) * 1000)
            _record(sql, source, "success", elapsed, row_count=0)
            return {
                "columns": [],
                "rows": [],
                "rowCount": 0,
                "truncated": False,
                "durationMs": elapsed,
            }

        # PyHive reports columns as "table.column"; the short name reads better
        # in a results grid and matches what the SQL editor shows.
        columns = [d[0].split(".")[-1] for d in cur.description]
        types = [d[1] for d in cur.description]

        try:
            raw = cur.fetchmany(limit + 1)
        except Exception as fetch_exc:  # noqa: BLE001
            # Some statements advertise a schema but carry no result set.
            # The statement itself already succeeded, so report zero rows
            # rather than failing it after the fact.
            log.info("no result set to fetch (%s); treating as 0 rows", fetch_exc)
            raw = []

        truncated = len(raw) > limit
        raw = raw[:limit]

        rows = [
            {c: (None if v is None else str(v)) for c, v in zip(columns, r)}
            for r in raw
        ]

        elapsed = int((time.monotonic() - started) * 1000)
        _record(sql, source, "success", elapsed,
                row_count=len(rows), truncated=truncated)

        return {
            "columns": columns,
            "columnTypes": types,
            "rows": rows,
            "rowCount": len(rows),
            "truncated": truncated,
            "durationMs": elapsed,
        }

    except Exception as exc:  # noqa: BLE001
        log.exception("query failed")
        elapsed = int((time.monotonic() - started) * 1000)
        message = _clean_error(exc)
        _record(sql, source, "error", elapsed, error=message)
        return JSONResponse(
            status_code=400,
            content={"error": message, "durationMs": elapsed},
        )
    finally:
        if cur is not None:
            try:
                cur.close()
            except Exception:  # noqa: BLE001
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass
