"""
Database connection helper.
Uses MySQL via mysql-connector-python. Falls back to SQLite for demo/testing.
"""

import os
import sqlite3


def get_db_connection():
    """
    Return a database connection.
    Tries MySQL first (if DB_HOST env var is set), otherwise falls back to a
    local SQLite database for easy demo/testing.
    """
    db_host = os.environ.get("DB_HOST")

    if db_host:
        import mysql.connector
        return mysql.connector.connect(
            host=db_host,
            port=int(os.environ.get("DB_PORT", 3306)),
            user=os.environ.get("DB_USER", "root"),
            password=os.environ.get("DB_PASS", ""),
            database=os.environ.get("DB_NAME", "deeplearn_classroom"),
        )

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
