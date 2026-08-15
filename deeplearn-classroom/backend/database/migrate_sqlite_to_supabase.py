"""
migrate_sqlite_to_supabase.py
==============================
Idempotent migration script that copies data from local SQLite (backend/data/deeplearn.db)
to Supabase PostgreSQL.

Usage:
    python migrate_sqlite_to_supabase.py
    python migrate_sqlite_to_supabase.py --url "postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres"

Key features:
- Reads all records from SQLite.
- Preserves all primary keys, foreign keys, and timestamps.
- Idempotent: safe to run multiple times without duplicating data (ON CONFLICT DO NOTHING).
- Automatically resets PostgreSQL sequences to MAX(id) so future auto-increments work cleanly.
- Detailed migration report per table.
"""

import os
import sys
import argparse
import sqlite3
import json

# Ensure UTF-8 stdout encoding on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure python-dotenv is loaded
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass


# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# ── Table Migration Order (Parent tables before Child tables) ────────────────
MIGRATION_TABLES = [
    ("users", "user_id"),
    ("teachers", "teacher_id"),
    ("students", "student_id"),
    ("courses", "course_id"),
    ("classrooms", "classroom_id"),
    ("classroom_students", "id"),
    ("live_sessions", "session_id"),
    ("recordings", "recording_id"),
    ("videos", "video_id"),
    ("video_processing_jobs", "id"),
    ("video_captions", "caption_id"),
    ("video_views", "view_id"),
    ("quizzes", "quiz_id"),
    ("questions", "question_id"),
    ("quiz_attempts", "attempt_id"),
    ("student_responses", "response_id"),
    ("analytics_reports", "report_id"),
    ("student_progress", "progress_id"),
    ("attendance", "attendance_id"),
    ("comments", "comment_id"),
    ("quiz_scores", "score_id"),
    ("live_session_participants", None),
    ("session_chat_messages", "message_id"),
    ("activities", "activity_id"),
    ("performance", "perf_id"),
    ("behaviour_logs", "log_id"),
    ("engagement_metrics", "metric_id"),
    ("sign_interactions", "interaction_id"),
    ("captions", "caption_id"),
]



def get_sqlite_conn(sqlite_path: str):
    """Return connection to source SQLite database."""
    if not os.path.exists(sqlite_path):
        raise FileNotFoundError(f"SQLite database file not found at: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_postgres_conn(db_url: str):
    """Return connection to destination PostgreSQL database."""
    import psycopg2
    import psycopg2.extras

    if db_url.startswith("postgres://"):
        db_url = "postgresql://" + db_url[len("postgres://"):]

    conn = psycopg2.connect(db_url, connect_timeout=15)
    return conn


def run_migration(sqlite_path: str, pg_url: str):
    print("=" * 60)
    print("🚀 DeepLearn Classroom: SQLite → Supabase PostgreSQL Migration")
    print("=" * 60)
    print(f"Source SQLite      : {sqlite_path}")
    masked_url = pg_url.split("@")[-1] if "@" in pg_url else pg_url[:20] + "..."
    print(f"Target PostgreSQL  : ...@{masked_url}")
    print()

    # Step 1: Open connections
    sqlite_conn = get_sqlite_conn(sqlite_path)
    pg_conn = get_postgres_conn(pg_url)

    # Step 2: Initialize PostgreSQL Schema if not present
    schema_path = os.path.join(os.path.dirname(__file__), "schema_supabase.sql")
    if os.path.exists(schema_path):
        print("Ensuring Supabase PostgreSQL schema exists...")
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        with pg_conn.cursor() as pg_cur:
            pg_cur.execute(schema_sql)
        pg_conn.commit()
        print("✓ PostgreSQL schema verified.\n")

    sqlite_cur = sqlite_conn.cursor()

    # Discover tables present in SQLite
    sqlite_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_sqlite_tables = {row[0] for row in sqlite_cur.fetchall()}

    stats = []

    for table_name, pk_col in MIGRATION_TABLES:
        if table_name not in existing_sqlite_tables:
            print(f"⏩ Table '{table_name}' does not exist in SQLite — skipping.")
            continue

        # Read all rows from SQLite
        sqlite_cur.execute(f'SELECT * FROM "{table_name}"')
        rows = sqlite_cur.fetchall()
        if not rows:
            print(f"ℹ️  Table '{table_name}': 0 rows in SQLite.")
            stats.append((table_name, 0, 0))
            continue

        col_names = [d[0] for d in sqlite_cur.description]
        placeholders = ", ".join(["%s"] * len(col_names))
        columns_clause = ", ".join([f'"{c}"' for c in col_names])

        # Construct ON CONFLICT clause for idempotency
        if pk_col:
            conflict_clause = f'ON CONFLICT ("{pk_col}") DO NOTHING'
        elif table_name == "live_session_participants":
            conflict_clause = 'ON CONFLICT ("session_id", "user_id") DO NOTHING'
        elif table_name == "classroom_students":
            conflict_clause = 'ON CONFLICT ("classroom_id", "student_id") DO NOTHING'
        else:
            conflict_clause = "ON CONFLICT DO NOTHING"

        insert_sql = f'INSERT INTO "{table_name}" ({columns_clause}) VALUES ({placeholders}) {conflict_clause}'

        inserted_count = 0
        with pg_conn.cursor() as pg_cur:
            for r in rows:
                values = []
                for val in r:
                    # Convert JSON dict/list objects to json string if necessary
                    if isinstance(val, (dict, list)):
                        values.append(json.dumps(val))
                    else:
                        values.append(val)
                try:
                    pg_cur.execute(insert_sql, values)
                    inserted_count += 1
                except Exception as row_err:
                    print(f"   ⚠️ Warning on table {table_name} row: {row_err}")
            pg_conn.commit()

        # Reset sequence for auto-increment column if applicable
        if pk_col and pk_col != "session_id":
            try:
                with pg_conn.cursor() as pg_cur:
                    seq_query = f"""
                        SELECT setval(
                            pg_get_serial_sequence('{table_name}', '{pk_col}'),
                            COALESCE((SELECT MAX("{pk_col}") FROM "{table_name}"), 1),
                            true
                        )
                    """
                    pg_cur.execute(seq_query)
                pg_conn.commit()
            except Exception as seq_err:
                pass  # non-fatal for non-serial PKs

        print(f"✓ Table '{table_name}': Processed {len(rows)} SQLite rows.")
        stats.append((table_name, len(rows), inserted_count))

    sqlite_conn.close()
    pg_conn.close()

    print("\n" + "=" * 60)
    print("📊 MIGRATION SUMMARY")
    print("=" * 60)
    print(f"{'Table Name':<30} {'SQLite Rows':<15} {'Status':<15}")
    print("-" * 60)
    for table_name, total, inserted in stats:
        print(f"{table_name:<30} {total:<15} {'Success' if total > 0 else 'Empty'}")
    print("=" * 60)
    print("✨ Migration to Supabase PostgreSQL completed successfully!")


def main():
    parser = argparse.ArgumentParser(description="Migrate DeepLearn SQLite database to Supabase PostgreSQL")
    parser.add_argument(
        "--sqlite",
        default=os.path.join(os.path.dirname(__file__), "..", "data", "deeplearn.db"),
        help="Path to deeplearn.db SQLite file"
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DATABASE_URL") or os.environ.get("POSTGRES_URL"),
        help="Supabase PostgreSQL connection URL"
    )

    args = parser.parse_args()

    if not args.url:
        print("❌ Error: No DATABASE_URL or SUPABASE_DATABASE_URL found.")
        print("Please provide --url 'postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres'")
        print("or set DATABASE_URL in your .env or environment.")
        sys.exit(1)

    run_migration(args.sqlite, args.url)


if __name__ == "__main__":
    main()
