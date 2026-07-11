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


_mysql_initialized = False


def _init_mysql(conn):
    try:
        cursor = conn.cursor()
        
        # Create new tables if they don't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quizzes (
                quiz_id      INT AUTO_INCREMENT PRIMARY KEY,
                title        VARCHAR(255) NOT NULL,
                recording_id INT,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                question_id   INT AUTO_INCREMENT PRIMARY KEY,
                quiz_id       INT NOT NULL,
                question_text TEXT NOT NULL,
                options       TEXT NOT NULL,
                correct_option INT NOT NULL,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quiz_attempts (
                attempt_id        INT AUTO_INCREMENT PRIMARY KEY,
                student_id        INT NOT NULL,
                quiz_id           INT NOT NULL,
                score             INT NOT NULL,
                total_questions   INT NOT NULL,
                correct_answers   INT NOT NULL,
                incorrect_answers INT NOT NULL,
                percentage        DECIMAL(5,2) NOT NULL,
                time_taken        DECIMAL(8,2) NOT NULL,
                submitted_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS student_responses (
                response_id     INT AUTO_INCREMENT PRIMARY KEY,
                attempt_id      INT NOT NULL,
                question_id     INT NOT NULL,
                selected_option INT NOT NULL,
                is_correct      BOOLEAN NOT NULL,
                FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analytics_reports (
                report_id          INT AUTO_INCREMENT PRIMARY KEY,
                quiz_id            INT NOT NULL,
                class_average      DECIMAL(5,2) DEFAULT 0.00,
                highest_score      DECIMAL(5,2) DEFAULT 0.00,
                lowest_score       DECIMAL(5,2) DEFAULT 0.00,
                pass_count         INT DEFAULT 0,
                fail_count         INT DEFAULT 0,
                participation_rate DECIMAL(5,2) DEFAULT 0.00,
                updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS student_progress (
                progress_id   INT AUTO_INCREMENT PRIMARY KEY,
                student_id    INT NOT NULL,
                course_id     INT NOT NULL,
                lesson_id     VARCHAR(255) NOT NULL,
                quiz_score    DECIMAL(5,2) DEFAULT 0.00,
                passed        BOOLEAN DEFAULT FALSE,
                attempts      INT DEFAULT 0,
                unlocked      BOOLEAN DEFAULT FALSE,
                completed_at  DATETIME DEFAULT NULL,
                FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        """)

        cursor.execute("SHOW TABLES LIKE 'videos'")
        if cursor.fetchone():
            cursor.execute("DESCRIBE videos")
            cols = [row[0] for row in cursor.fetchall()]
            altered = False
            if "title" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN title VARCHAR(255)")
                altered = True
            if "filename" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN filename VARCHAR(255)")
                altered = True
            if "r2_url" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN r2_url VARCHAR(512)")
                altered = True
            if "description" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN description TEXT DEFAULT NULL")
                altered = True
            if "thumbnail" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN thumbnail VARCHAR(512) DEFAULT NULL")
                altered = True
            if "visibility" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN visibility VARCHAR(50) DEFAULT 'Published'")
                altered = True
            if "hidden" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN hidden TINYINT(1) DEFAULT 0")
                altered = True
            if "deleted" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN deleted TINYINT(1) DEFAULT 0")
                altered = True
            if "archived" not in cols:
                cursor.execute("ALTER TABLE videos ADD COLUMN archived TINYINT(1) DEFAULT 0")
                altered = True
            if altered:
                conn.commit()
                print("[Database] MySQL columns migrated successfully.")

        cursor.execute("SHOW TABLES LIKE 'students'")
        if cursor.fetchone():
            cursor.execute("DESCRIBE students")
            cols = [row[0] for row in cursor.fetchall()]
            altered = False
            new_cols = {
                "profilePhoto": "VARCHAR(255)",
                "age": "INT",
                "gender": "VARCHAR(50)",
                "dob": "VARCHAR(50)",
                "phone": "VARCHAR(50)",
                "schoolName": "VARCHAR(255)",
                "grade": "VARCHAR(50)",
                "section": "VARCHAR(50)",
                "rollNumber": "VARCHAR(50)",
                "academicYear": "VARCHAR(50)",
                "parentName": "VARCHAR(255)",
                "parentPhone": "VARCHAR(50)",
                "parentEmail": "VARCHAR(255)",
                "emergencyContact": "VARCHAR(50)",
                "city": "VARCHAR(100)",
                "state": "VARCHAR(100)",
                "country": "VARCHAR(100)",
                "learningLevel": "VARCHAR(50)",
                "attendanceRate": "DECIMAL(5,2) DEFAULT 100.0"
            }
            for col_name, col_type in new_cols.items():
                if col_name not in cols:
                    cursor.execute(f"ALTER TABLE students ADD COLUMN {col_name} {col_type}")
                    altered = True
            if altered:
                conn.commit()
                print("[Database] MySQL students table columns migrated successfully.")

        # Also migrate user roles to allow admin
        cursor.execute("SHOW TABLES LIKE 'users'")
        if cursor.fetchone():
            cursor.execute("DESCRIBE users")
            user_cols = cursor.fetchall()
            role_type = ""
            for ucol in user_cols:
                if ucol[0] == "role":
                    role_type = ucol[1]
                    break
            if "admin" not in role_type:
                cursor.execute("ALTER TABLE users MODIFY COLUMN role ENUM('student', 'teacher', 'admin') NOT NULL")
                conn.commit()
                print("[Database] MySQL users role column updated to include admin.")
    except Exception as e:
        print(f"[Database] MySQL schema migration failed: {e}")


def get_db_connection():
    """
    Return a database connection.
    Tries MySQL first (if DB_HOST env var is set), otherwise falls back to a
    local SQLite database for easy demo/testing.
    """
    global _mysql_initialized
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
            preferred_language  TEXT DEFAULT 'ASL',
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
            title          TEXT,
            filename       TEXT,
            r2_url         TEXT,
            original_url   TEXT,
            processed_url  TEXT,
            transcript     TEXT,
            status         TEXT DEFAULT 'uploaded',
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

        CREATE TABLE IF NOT EXISTS quizzes (
            quiz_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT NOT NULL,
            recording_id INTEGER,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS questions (
            question_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id       INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            options       TEXT NOT NULL, -- JSON-serialized list of options
            correct_option INTEGER NOT NULL, -- index of correct option
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
            time_taken        REAL NOT NULL, -- in seconds
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
    """)

    conn.commit()

    # Recreate users table to support 'admin' role in check constraint if needed
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
        sql_row = cursor.fetchone()
        if sql_row:
            sql = sql_row[0]
            if "'admin'" not in sql and '"admin"' not in sql:
                print("[Database] Migrating users table to support 'admin' role CHECK constraint...")
                cursor.execute("PRAGMA foreign_keys=OFF")
                cursor.execute("ALTER TABLE users RENAME TO users_old")
                cursor.execute("""
                    CREATE TABLE users (
                        user_id         INTEGER PRIMARY KEY AUTOINCREMENT,
                        name            TEXT NOT NULL,
                        email           TEXT NOT NULL UNIQUE,
                        password_hash   TEXT NOT NULL,
                        role            TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
                        avatar_url      TEXT,
                        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login      DATETIME
                    );
                """)
                cursor.execute("""
                    INSERT INTO users (user_id, name, email, password_hash, role, avatar_url, created_at, last_login)
                    SELECT user_id, name, email, password_hash, role, avatar_url, created_at, last_login
                    FROM users_old;
                """)
                cursor.execute("DROP TABLE users_old")
                cursor.execute("PRAGMA foreign_keys=ON")
                conn.commit()
                print("[Database] SQLite users table CHECK constraint migrated successfully.")
    except Exception as e:
        print(f"[Database] SQLite users table CHECK constraint migration failed: {e}")

    # Dynamic SQLite migration for existing database files
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(videos)")
        cols = [col[1] for col in cursor.fetchall()]
        altered = False
        if "title" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN title TEXT")
            altered = True
        if "filename" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN filename TEXT")
            altered = True
        if "r2_url" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN r2_url TEXT")
            altered = True
        if "original_video_id" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN original_video_id INTEGER DEFAULT NULL")
            altered = True
        if "video_type" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN video_type TEXT DEFAULT 'original'")
            altered = True
        if "captions_url" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN captions_url TEXT DEFAULT NULL")
            altered = True
        if "description" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN description TEXT DEFAULT NULL")
            altered = True
        if "thumbnail" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN thumbnail TEXT DEFAULT NULL")
            altered = True
        if "visibility" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN visibility TEXT DEFAULT 'Published'")
            altered = True
        if "hidden" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN hidden INTEGER DEFAULT 0")
            altered = True
        if "deleted" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN deleted INTEGER DEFAULT 0")
            altered = True
        if "archived" not in cols:
            cursor.execute("ALTER TABLE videos ADD COLUMN archived INTEGER DEFAULT 0")
            altered = True
        if altered:
            conn.commit()
            print("[Database] SQLite videos columns migrated successfully.")
    except Exception as e:
        print(f"[Database] SQLite videos schema migration failed: {e}")

    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(students)")
        cols = [col[1] for col in cursor.fetchall()]
        altered = False
        new_cols = {
            "profilePhoto": "TEXT",
            "age": "INTEGER",
            "gender": "TEXT",
            "dob": "TEXT",
            "phone": "TEXT",
            "schoolName": "TEXT",
            "grade": "TEXT",
            "section": "TEXT",
            "rollNumber": "TEXT",
            "academicYear": "TEXT",
            "parentName": "TEXT",
            "parentPhone": "TEXT",
            "parentEmail": "TEXT",
            "emergencyContact": "TEXT",
            "city": "TEXT",
            "state": "TEXT",
            "country": "TEXT",
            "learningLevel": "TEXT",
            "attendanceRate": "REAL DEFAULT 100.0"
        }
        for col_name, col_type in new_cols.items():
            if col_name not in cols:
                cursor.execute(f"ALTER TABLE students ADD COLUMN {col_name} {col_type}")
                altered = True
        if altered:
            conn.commit()
            print("[Database] SQLite students table columns migrated successfully.")
    except Exception as e:
        print(f"[Database] SQLite students schema migration failed: {e}")


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
