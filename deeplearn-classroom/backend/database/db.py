"""
Database connection helper for DeepLearn Smart Virtual Classroom.
==================================================================
Priority order:
1. PostgreSQL / Supabase — via DATABASE_URL / SUPABASE_DATABASE_URL / POSTGRES_URL
2. MySQL — via DB_HOST environment variables
3. SQLite — local file fallback (backend/data/deeplearn.db)
"""

import os
import re
import json
import sqlite3
import threading
from urllib.parse import urlparse

# ── Global Initialization Flags & Connection Pool ─────────────────────────────
_postgres_pool = None
_postgres_pool_lock = threading.Lock()
_postgres_initialized = False
_mysql_initialized = False
_sqlite_initialized = False


# ── PostgreSQL Dict Row Wrapper ───────────────────────────────────────────────
class PostgresRow:
    """
    Dict-like wrapper for PostgreSQL rows.
    Provides compatibility with SQLite sqlite3.Row:
    - dict(row)
    - row['column_name'] (case-insensitive)
    - row[0] (indexed access)
    - row.keys()
    """
    def __init__(self, data_dict, data_tuple, col_names):
        self._dict = {k.lower(): v for k, v in data_dict.items()} if data_dict else {}
        self._raw_dict = data_dict or {}
        self._tuple = data_tuple or ()
        self._col_names = col_names or []

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._tuple[key]
        return self._dict[str(key).lower()]

    def get(self, key, default=None):
        return self._dict.get(str(key).lower(), default)

    def keys(self):
        return self._col_names

    def values(self):
        return self._tuple

    def items(self):
        return self._raw_dict.items()

    def __contains__(self, key):
        return str(key).lower() in self._dict

    def __iter__(self):
        return iter(self._col_names)

    def __len__(self):
        return len(self._tuple)

    def __repr__(self):
        return f"<PostgresRow {self._raw_dict}>"


# ── PostgreSQL Cursor Wrapper ─────────────────────────────────────────────────
class PostgresCursorWrapper:
    """
    Wraps psycopg2 cursor to provide standard SQLite/MySQL API compatibility:
    - Replaces '?' placeholders with '%s'
    - Tracks lastrowid for INSERT statements
    - Returns PostgresRow objects from fetchone/fetchall
    """
    def __init__(self, cursor, conn_wrapper=None):
        self._cursor = cursor
        self._conn_wrapper = conn_wrapper
        self._lastrowid = None

    def _convert_placeholders(self, query: str) -> str:
        """Convert SQLite '?' parameter placeholders to PostgreSQL '%s'."""
        if "?" not in query:
            return query
        
        # Simple placeholder replacement when not inside string literals
        parts = []
        in_single = False
        in_double = False
        i = 0
        while i < len(query):
            ch = query[i]
            if ch == "'" and (i == 0 or query[i-1] != '\\'):
                in_single = not in_single
                parts.append(ch)
            elif ch == '"' and (i == 0 or query[i-1] != '\\'):
                in_double = not in_double
                parts.append(ch)
            elif ch == '?' and not in_single and not in_double:
                parts.append('%s')
            else:
                parts.append(ch)
            i += 1
        return "".join(parts)

    def execute(self, query, params=None):
        converted_query = self._convert_placeholders(query)
        self._lastrowid = None

        # Check if query is an INSERT and might need lastrowid capture
        is_insert = converted_query.strip().upper().startswith("INSERT INTO")
        has_returning = "RETURNING" in converted_query.upper()

        if is_insert and not has_returning:
            # Append RETURNING * to capture the generated ID
            modified_query = converted_query.rstrip("; \t\n") + " RETURNING *"
            try:
                if params is not None:
                    res = self._cursor.execute(modified_query, params)
                else:
                    res = self._cursor.execute(modified_query)
                
                # Capture the first column of the returned row as lastrowid
                row = self._cursor.fetchone()
                if row:
                    if isinstance(row, dict):
                        # First value in dict or common id fields
                        self._lastrowid = row.get("id") or row.get("video_id") or row.get("user_id") or row.get("student_id") or row.get("teacher_id") or list(row.values())[0]
                    elif isinstance(row, (tuple, list)):
                        self._lastrowid = row[0]
                return res
            except Exception:
                # If RETURNING * fails (e.g. syntax nuance), fallback to standard execution
                if self._conn_wrapper:
                    self._conn_wrapper.rollback()
                pass

        if params is not None:
            return self._cursor.execute(converted_query, params)
        return self._cursor.execute(converted_query)

    def executemany(self, query, seq_of_params):
        converted_query = self._convert_placeholders(query)
        return self._cursor.executemany(converted_query, seq_of_params)

    def _wrap_row(self, row):
        if row is None:
            return None
        if isinstance(row, PostgresRow):
            return row
        col_names = [d[0] for d in self._cursor.description] if self._cursor.description else []
        if isinstance(row, dict):
            return PostgresRow(row, tuple(row.values()), col_names)
        elif isinstance(row, (tuple, list)):
            row_dict = dict(zip(col_names, row))
            return PostgresRow(row_dict, tuple(row), col_names)
        return row

    def fetchone(self):
        row = self._cursor.fetchone()
        return self._wrap_row(row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [self._wrap_row(r) for r in rows]

    def fetchmany(self, size=None):
        rows = self._cursor.fetchmany(size) if size is not None else self._cursor.fetchmany()
        return [self._wrap_row(r) for r in rows]

    @property
    def lastrowid(self):
        return self._lastrowid

    @property
    def description(self):
        return self._cursor.description

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def close(self):
        self._cursor.close()

    def __getattr__(self, name):
        return getattr(self._cursor, name)


# ── PostgreSQL Connection Wrapper ─────────────────────────────────────────────
class PostgresConnectionWrapper:
    """
    Wraps psycopg2 pooled connection.
    On close(), returns the connection to the pool rather than terminating it.
    """
    def __init__(self, raw_conn, pool=None):
        self._conn = raw_conn
        self._pool = pool
        self._closed = False

    def cursor(self, *args, **kwargs):
        import psycopg2.extras
        # Use RealDictCursor so rows can be converted to dictionaries
        cursor = self._conn.cursor(*args, cursor_factory=psycopg2.extras.RealDictCursor, **kwargs)
        return PostgresCursorWrapper(cursor, self)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        if not self._closed:
            self._closed = True
            if self._pool and not self._conn.closed:
                try:
                    self._pool.putconn(self._conn)
                except Exception:
                    try:
                        self._conn.close()
                    except Exception:
                        pass
            elif not self._conn.closed:
                self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


# ── MySQL Wrappers ────────────────────────────────────────────────────────────
class MySQLCursorWrapper:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=None):
        if params is not None:
            query = query.replace("?", "%s")
        return self._cursor.execute(query, params)

    def executemany(self, query, seq_of_params):
        query = query.replace("?", "%s")
        return self._cursor.executemany(query, seq_of_params)

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def description(self):
        return self._cursor.description

    def close(self):
        self._cursor.close()

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class MySQLConnectionWrapper:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self, *args, **kwargs):
        cursor = self._conn.cursor(*args, **kwargs)
        return MySQLCursorWrapper(cursor)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


# ── Database URL Resolution ───────────────────────────────────────────────────
def _get_postgres_url() -> str:
    """Return database URL from environment if configured."""
    for env_var in ["DATABASE_URL", "SUPABASE_DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"]:
        url = os.environ.get(env_var, "").strip()
        if url:
            # Handle postgres:// vs postgresql:// protocol
            if url.startswith("postgres://"):
                url = "postgresql://" + url[len("postgres://"):]
            return url
    return ""


# ── Connection Pool Manager ───────────────────────────────────────────────────
def _get_postgres_pool(db_url: str):
    global _postgres_pool
    if _postgres_pool is not None:
        return _postgres_pool
    with _postgres_pool_lock:
        if _postgres_pool is not None:
            return _postgres_pool
        try:
            import psycopg2.pool
            # Minimum 1 connection, maximum 10 connections per Gunicorn worker
            _postgres_pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=db_url,
                connect_timeout=15,
            )
            print("[Database] [OK] Supabase PostgreSQL connection pool initialized.", flush=True)
            return _postgres_pool
        except Exception as e:
            print(f"[Database] [ERROR] Failed to initialize PostgreSQL pool: {e}", flush=True)
            raise


# ── Schema Initialization ─────────────────────────────────────────────────────
def _init_postgres(conn):
    """Ensure all Supabase PostgreSQL tables and indexes exist."""
    schema_file = os.path.join(os.path.dirname(__file__), "schema_supabase.sql")
    if os.path.exists(schema_file):
        try:
            with open(schema_file, "r", encoding="utf-8") as f:
                sql_content = f.read()
            cursor = conn.cursor()
            cursor.execute(sql_content)
            conn.commit()
            print("[Database] [OK] Supabase PostgreSQL schema verified/initialized.", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"[Database] PostgreSQL schema init warning (tables may already exist): {e}", flush=True)


def _init_mysql(conn):
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id         INT AUTO_INCREMENT PRIMARY KEY,
                name            VARCHAR(255) NOT NULL,
                email           VARCHAR(255) NOT NULL UNIQUE,
                password_hash   VARCHAR(255) NOT NULL,
                role            VARCHAR(50) NOT NULL,
                avatar_url      VARCHAR(512),
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login      DATETIME
            ) ENGINE=InnoDB;
        """)
        conn.commit()
    except Exception as e:
        print(f"[Database] MySQL schema init failed: {e}", flush=True)


def _init_sqlite(conn):
    """Create tables in SQLite if they don't exist yet."""
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            email           TEXT NOT NULL UNIQUE,
            password_hash   TEXT NOT NULL,
            role            TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
            avatar_url      TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login      DATETIME
        );

        CREATE TABLE IF NOT EXISTS students (
            student_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name                TEXT NOT NULL,
            email               TEXT NOT NULL UNIQUE,
            password_hash       TEXT NOT NULL,
            disability_type     TEXT DEFAULT 'Hearing-Impaired',
            preferred_language  TEXT DEFAULT 'ISL',
            enrolled_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            profilePhoto        TEXT,
            age                 INTEGER,
            gender              TEXT,
            dob                 TEXT,
            phone               TEXT,
            schoolName          TEXT,
            grade               TEXT,
            section             TEXT,
            rollNumber          TEXT,
            academicYear        TEXT,
            parentName          TEXT,
            parentPhone         TEXT,
            parentEmail         TEXT,
            emergencyContact    TEXT,
            city                TEXT,
            state               TEXT,
            country             TEXT,
            learningLevel       TEXT,
            attendanceRate      REAL DEFAULT 100.0
        );

        CREATE TABLE IF NOT EXISTS teachers (
            teacher_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS courses (
            course_id        INTEGER PRIMARY KEY AUTOINCREMENT,
            title            TEXT NOT NULL,
            teacher_id       INTEGER NOT NULL,
            difficulty_level TEXT DEFAULT 'Medium',
            has_captions     BOOLEAN DEFAULT 1,
            has_sign_support BOOLEAN DEFAULT 1,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
        );

        CREATE TABLE IF NOT EXISTS classrooms (
            classroom_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            course_id    INTEGER NOT NULL,
            teacher_id   INTEGER NOT NULL,
            code         TEXT,
            description  TEXT,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(course_id),
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
        );

        CREATE TABLE IF NOT EXISTS classroom_students (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            classroom_id INTEGER NOT NULL,
            student_id   INTEGER NOT NULL,
            enrolled_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (classroom_id) REFERENCES classrooms(classroom_id),
            FOREIGN KEY (student_id) REFERENCES students(student_id),
            UNIQUE (classroom_id, student_id)
        );

        CREATE TABLE IF NOT EXISTS videos (
            video_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id     INTEGER NOT NULL,
            course_id      INTEGER NOT NULL,
            classroom_id   INTEGER,
            title          TEXT,
            filename       TEXT,
            r2_url         TEXT,
            original_url   TEXT,
            processed_url  TEXT,
            transcript     TEXT,
            status         TEXT DEFAULT 'uploaded',
            upload_status  TEXT DEFAULT 'uploaded',
            processing_status TEXT DEFAULT 'pending',
            caption_status TEXT DEFAULT 'pending',
            signing_status TEXT DEFAULT 'pending',
            r2_key         TEXT DEFAULT NULL,
            r2_captions_key TEXT DEFAULT NULL,
            r2_isl_key     TEXT DEFAULT NULL,
            r2_thumbnail_key TEXT DEFAULT NULL,
            uploaded_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at   DATETIME,
            original_video_id INTEGER DEFAULT NULL,
            video_type     TEXT DEFAULT 'original',
            captions_url   TEXT DEFAULT NULL,
            description    TEXT DEFAULT NULL,
            thumbnail      TEXT DEFAULT NULL,
            visibility     TEXT DEFAULT 'Published',
            hidden         INTEGER DEFAULT 0,
            deleted        INTEGER DEFAULT 0,
            archived       INTEGER DEFAULT 0,
            file_size      INTEGER DEFAULT 0,
            duration       REAL DEFAULT 0.0,
            created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
            FOREIGN KEY (course_id) REFERENCES courses(course_id)
        );

        CREATE TABLE IF NOT EXISTS video_processing_jobs (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id             TEXT NOT NULL UNIQUE,
            video_id           INTEGER,
            status             TEXT DEFAULT 'pending',
            progress           INTEGER DEFAULT 0,
            current_step       TEXT DEFAULT 'Initializing...',
            error_message      TEXT,
            video_url          TEXT,
            formatted_captions TEXT,
            created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at         DATETIME,
            completed_at       DATETIME,
            updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (video_id) REFERENCES videos(video_id)
        );

        CREATE TABLE IF NOT EXISTS video_captions (
            caption_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id       INTEGER NOT NULL,
            start_time     REAL NOT NULL,
            end_time       REAL NOT NULL,
            text           TEXT NOT NULL,
            sign_sequence  TEXT,
            FOREIGN KEY (video_id) REFERENCES videos(video_id)
        );

        CREATE TABLE IF NOT EXISTS video_views (
            view_id               INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id            INTEGER NOT NULL,
            video_id              INTEGER NOT NULL,
            watched_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            completion_percentage REAL DEFAULT 0.0,
            FOREIGN KEY (student_id) REFERENCES students(student_id),
            FOREIGN KEY (video_id) REFERENCES videos(video_id)
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            quiz_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT NOT NULL,
            recording_id INTEGER,
            video_id     INTEGER,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS questions (
            question_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id       INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            options       TEXT NOT NULL,
            correct_option INTEGER NOT NULL,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quiz_attempts (
            attempt_id        INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id        INTEGER NOT NULL,
            quiz_id           INTEGER NOT NULL,
            score             INTEGER NOT NULL,
            total_questions   INTEGER NOT NULL,
            correct_answers   INTEGER NOT NULL,
            incorrect_answers INTEGER NOT NULL,
            percentage        REAL NOT NULL,
            time_taken        REAL NOT NULL,
            submitted_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS student_responses (
            response_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id      INTEGER NOT NULL,
            question_id     INTEGER NOT NULL,
            selected_option INTEGER NOT NULL,
            is_correct      BOOLEAN NOT NULL,
            FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS analytics_reports (
            report_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id            INTEGER NOT NULL,
            class_average      REAL DEFAULT 0.0,
            highest_score      REAL DEFAULT 0.0,
            lowest_score       REAL DEFAULT 0.0,
            pass_count         INTEGER DEFAULT 0,
            fail_count         INTEGER DEFAULT 0,
            participation_rate REAL DEFAULT 0.0,
            updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS student_progress (
            progress_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id    INTEGER NOT NULL,
            course_id     INTEGER NOT NULL,
            lesson_id     TEXT NOT NULL,
            quiz_score    REAL DEFAULT 0.0,
            passed        BOOLEAN DEFAULT 0,
            attempts      INTEGER DEFAULT 0,
            unlocked      BOOLEAN DEFAULT 0,
            completed_at  DATETIME,
            FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS attendance (
            attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id    INTEGER NOT NULL,
            classroom_id  INTEGER,
            session_id    TEXT,
            status        TEXT DEFAULT 'present',
            recorded_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS comments (
            comment_id  INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id    INTEGER,
            user_id     INTEGER,
            user_name   TEXT NOT NULL,
            content     TEXT NOT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS live_sessions (
            session_id     TEXT PRIMARY KEY,
            teacher_id     INTEGER NOT NULL,
            course_id      INTEGER NOT NULL,
            start_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time       DATETIME,
            status         TEXT DEFAULT 'live',
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
            FOREIGN KEY (course_id) REFERENCES courses(course_id)
        );

        CREATE TABLE IF NOT EXISTS recordings (
            recording_id        INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id          TEXT NOT NULL,
            teacher_id          INTEGER NOT NULL,
            course_id           INTEGER NOT NULL,
            file_path           TEXT NOT NULL,
            thumbnail_path      TEXT,
            duration            REAL DEFAULT 0.0,
            recording_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            participants_count  INTEGER DEFAULT 0,
            status              TEXT DEFAULT 'processing',
            FOREIGN KEY (session_id) REFERENCES live_sessions(session_id),
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
            FOREIGN KEY (course_id) REFERENCES courses(course_id)
        );

        CREATE TABLE IF NOT EXISTS quiz_scores (
            score_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id   INTEGER NOT NULL,
            recording_id INTEGER NOT NULL,
            score        REAL DEFAULT 0.0,
            passed       BOOLEAN DEFAULT 0,
            taken_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id),
            FOREIGN KEY (recording_id) REFERENCES recordings(recording_id)
        );

        CREATE TABLE IF NOT EXISTS live_session_participants (
            session_id      TEXT NOT NULL,
            user_id         TEXT NOT NULL,
            name            TEXT NOT NULL,
            role            TEXT NOT NULL,
            is_muted        BOOLEAN DEFAULT 0,
            is_video_off    BOOLEAN DEFAULT 0,
            joined_at       REAL NOT NULL,
            last_seen       REAL NOT NULL,
            PRIMARY KEY (session_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS session_chat_messages (
            message_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT NOT NULL,
            user_id         TEXT NOT NULL,
            user_name       TEXT NOT NULL,
            message         TEXT NOT NULL,
            created_at      REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activities (
            activity_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id       INTEGER NOT NULL,
            type            TEXT NOT NULL,
            content_url     TEXT,
            caption_url     TEXT,
            sign_video_url  TEXT,
            difficulty      TEXT DEFAULT 'Medium',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(course_id)
        );

        CREATE TABLE IF NOT EXISTS performance (
            perf_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id      INTEGER NOT NULL,
            activity_id     INTEGER NOT NULL,
            score           REAL DEFAULT 0.0,
            time_taken      REAL DEFAULT 0.0,
            attempt_count   INTEGER DEFAULT 1,
            completion_rate REAL DEFAULT 0.0,
            recorded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id)  REFERENCES students(student_id),
            FOREIGN KEY (activity_id) REFERENCES activities(activity_id)
        );

        CREATE TABLE IF NOT EXISTS behaviour_logs (
            log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id      INTEGER NOT NULL,
            session_id      TEXT NOT NULL,
            click_freq      REAL DEFAULT 0.0,
            response_speed  REAL DEFAULT 0.0,
            chat_count      INTEGER DEFAULT 0,
            idle_time       REAL DEFAULT 0.0,
            behaviour_label TEXT DEFAULT 'Passive',
            logged_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id)
        );

        CREATE TABLE IF NOT EXISTS engagement_metrics (
            metric_id           INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id          INTEGER NOT NULL,
            session_id          TEXT NOT NULL,
            engagement_score    REAL DEFAULT 0.0,
            engagement_level    TEXT DEFAULT 'Medium',
            participation_count INTEGER DEFAULT 0,
            session_time        REAL DEFAULT 0.0,
            recorded_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id)
        );

        CREATE TABLE IF NOT EXISTS sign_interactions (
            interaction_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id         INTEGER NOT NULL,
            gesture_recognized TEXT NOT NULL,
            confidence_score   REAL DEFAULT 0.0,
            timestamp          DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id)
        );

        CREATE TABLE IF NOT EXISTS captions (
            caption_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id     INTEGER NOT NULL,
            timestamp_start REAL NOT NULL,
            timestamp_end   REAL NOT NULL,
            caption_text    TEXT NOT NULL,
            FOREIGN KEY (activity_id) REFERENCES activities(activity_id)
        );
    """)


# ── Public Database Connection Helper ─────────────────────────────────────────
def get_db_connection():
    """
    Return a database connection.
    1. Supabase PostgreSQL (via DATABASE_URL or SUPABASE_DATABASE_URL)
    2. MySQL (via DB_HOST)
    3. SQLite local database (fallback)
    """
    global _postgres_initialized, _mysql_initialized, _sqlite_initialized

    # 1. Check for PostgreSQL / Supabase URL
    pg_url = _get_postgres_url()
    if pg_url:
        pool = _get_postgres_pool(pg_url)
        raw_conn = pool.getconn()
        wrapped_conn = PostgresConnectionWrapper(raw_conn, pool)
        if not _postgres_initialized:
            _init_postgres(wrapped_conn)
            _postgres_initialized = True
        return wrapped_conn

    # 2. Check for MySQL
    db_host = os.environ.get("DB_HOST")
    if db_host:
        import mysql.connector
        conn = mysql.connector.connect(
            host=db_host,
            port=int(os.environ.get("DB_PORT", 3306)),
            user=os.environ.get("DB_USER", "root"),
            password=os.environ.get("DB_PASS", ""),
            database=os.environ.get("DB_NAME", "deeplearn_classroom"),
        )
        wrapped_conn = MySQLConnectionWrapper(conn)
        if not _mysql_initialized:
            _init_mysql(wrapped_conn)
            _mysql_initialized = True
        return wrapped_conn

    # 3. Fallback to SQLite
    db_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, "deeplearn.db")
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    if not _sqlite_initialized:
        _init_sqlite(conn)
        _sqlite_initialized = True
    return conn


def query_db(query, args=(), one=False, commit=False):
    """
    Convenience helper to execute a query and automatically close the connection.
    Supports Supabase PostgreSQL, MySQL, and SQLite transparently.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(query, args)
        if commit:
            conn.commit()
            return cur.lastrowid
        rv = cur.fetchall()
        return (rv[0] if rv else None) if one else rv
    finally:
        conn.close()

