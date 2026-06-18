"""
Database connection helper.
Uses MySQL via mysql-connector-python. Falls back to SQLite for demo/testing.
"""

import os
import sqlite3


class MySQLCursorWrapper:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=None):
        if params is not None:
            # Replace SQLite '?' with MySQL '%s' placeholders
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


def get_db_connection():
    """
    Return a database connection.
    Tries MySQL first (if DB_HOST env var is set), otherwise falls back to a
    local SQLite database for easy demo/testing.
    """
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
        return MySQLConnectionWrapper(conn)

    # ── SQLite fallback for local development / demo ──
    db_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, "deeplearn.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _init_sqlite(conn)
    return conn


def _init_sqlite(conn):
    """Create tables in SQLite if they don't exist yet."""
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            email           TEXT NOT NULL UNIQUE,
            password_hash   TEXT NOT NULL,
            role            TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
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
            preferred_language  TEXT DEFAULT 'ASL',
            enrolled_at         DATETIME DEFAULT CURRENT_TIMESTAMP
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

        CREATE TABLE IF NOT EXISTS videos (
            video_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id     INTEGER NOT NULL,
            course_id      INTEGER NOT NULL,
            original_url   TEXT,
            processed_url  TEXT,
            transcript     TEXT,
            status         TEXT DEFAULT 'uploaded',
            uploaded_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at   DATETIME,
            FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
            FOREIGN KEY (course_id) REFERENCES courses(course_id)
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
    """)

    conn.commit()


def query_db(query, args=(), one=False):
    """Execute a query and return results as list of dicts."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(query, args)

    if query.strip().upper().startswith("SELECT"):
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        results = [dict(zip(columns, row)) for row in rows]
        conn.close()
        return results[0] if one and results else results
    else:
        conn.commit()
        last_id = cursor.lastrowid
        conn.close()
        return last_id
