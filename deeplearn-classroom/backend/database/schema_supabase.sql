-- ============================================================
-- DeepLearn Smart Virtual Classroom — Supabase PostgreSQL Schema
-- ============================================================
-- Primary production schema for Supabase PostgreSQL.
-- Media files (videos, thumbnails, captions) are stored in Cloudflare R2.
-- PostgreSQL stores only metadata, relational IDs, and R2 object keys.
-- ============================================================

-- ── Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id         SERIAL PRIMARY KEY,
    name            VARCHAR(255)  NOT NULL,
    email           VARCHAR(255)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255)  NOT NULL,
    role            VARCHAR(50)   NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    avatar_url      VARCHAR(512)  DEFAULT NULL,
    created_at      TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
    last_login      TIMESTAMPTZ   DEFAULT NULL
);

-- ── Students ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    student_id          SERIAL PRIMARY KEY,
    name                VARCHAR(255)  NOT NULL,
    email               VARCHAR(255)  NOT NULL UNIQUE,
    password_hash       VARCHAR(255)  NOT NULL,
    disability_type     VARCHAR(100)  DEFAULT 'Hearing-Impaired',
    preferred_language  VARCHAR(50)   DEFAULT 'ISL',
    enrolled_at         TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
    profilePhoto        VARCHAR(512)  DEFAULT NULL,
    age                 INT           DEFAULT NULL,
    gender              VARCHAR(50)   DEFAULT NULL,
    dob                 VARCHAR(50)   DEFAULT NULL,
    phone               VARCHAR(50)   DEFAULT NULL,
    schoolName          VARCHAR(255)  DEFAULT NULL,
    grade               VARCHAR(50)   DEFAULT NULL,
    section             VARCHAR(50)   DEFAULT NULL,
    rollNumber          VARCHAR(50)   DEFAULT NULL,
    academicYear        VARCHAR(50)   DEFAULT NULL,
    parentName          VARCHAR(255)  DEFAULT NULL,
    parentPhone         VARCHAR(50)   DEFAULT NULL,
    parentEmail         VARCHAR(255)  DEFAULT NULL,
    emergencyContact    VARCHAR(50)   DEFAULT NULL,
    city                VARCHAR(100)  DEFAULT NULL,
    state               VARCHAR(100)  DEFAULT NULL,
    country             VARCHAR(100)  DEFAULT NULL,
    learningLevel       VARCHAR(50)   DEFAULT NULL,
    attendanceRate      NUMERIC(5,2)  DEFAULT 100.00
);

-- ── Teachers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
    teacher_id    SERIAL PRIMARY KEY,
    name          VARCHAR(255)  NOT NULL,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL
);

-- ── Courses / Subjects ────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    course_id        SERIAL PRIMARY KEY,
    title            VARCHAR(255) NOT NULL,
    teacher_id       INT          NOT NULL,
    difficulty_level VARCHAR(50)  DEFAULT 'Medium',
    has_captions     BOOLEAN      DEFAULT TRUE,
    has_sign_support BOOLEAN      DEFAULT TRUE,
    created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE
);

-- ── Classrooms ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classrooms (
    classroom_id SERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    course_id    INT          NOT NULL,
    teacher_id   INT          NOT NULL,
    code         VARCHAR(50)  DEFAULT NULL,
    description  TEXT         DEFAULT NULL,
    created_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE
);

-- ── Classroom Students (Enrollments) ───────────────────────
CREATE TABLE IF NOT EXISTS classroom_students (
    id           SERIAL PRIMARY KEY,
    classroom_id INT NOT NULL,
    student_id   INT NOT NULL,
    enrolled_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(classroom_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    UNIQUE (classroom_id, student_id)
);

-- ── Videos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    video_id          SERIAL PRIMARY KEY,
    teacher_id        INT          NOT NULL,
    course_id         INT          NOT NULL,
    classroom_id      INT          DEFAULT NULL,
    title             VARCHAR(255),
    filename          VARCHAR(255),
    description       TEXT         DEFAULT NULL,
    
    -- Status lifecycle
    upload_status     VARCHAR(50)  DEFAULT 'uploaded' CHECK (upload_status IN ('uploading', 'uploaded', 'failed')),
    processing_status VARCHAR(50)  DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    caption_status    VARCHAR(50)  DEFAULT 'pending' CHECK (caption_status IN ('pending', 'processing', 'available', 'failed', 'unavailable')),
    signing_status    VARCHAR(50)  DEFAULT 'pending' CHECK (signing_status IN ('pending', 'processing', 'available', 'failed', 'unavailable')),
    status            VARCHAR(50)  DEFAULT 'uploaded',

    -- Cloudflare R2 Keys (Source of Truth for media)
    r2_key            VARCHAR(512) DEFAULT NULL,
    r2_captions_key   VARCHAR(512) DEFAULT NULL,
    r2_isl_key        VARCHAR(512) DEFAULT NULL,
    r2_thumbnail_key  VARCHAR(512) DEFAULT NULL,

    -- Dynamic / Legacy URL cache (generated fresh at request time)
    r2_url            VARCHAR(512) DEFAULT NULL,
    original_url      VARCHAR(512) DEFAULT NULL,
    processed_url     VARCHAR(512) DEFAULT NULL,
    captions_url      VARCHAR(512) DEFAULT NULL,
    thumbnail         VARCHAR(512) DEFAULT NULL,

    -- Metadata
    transcript        TEXT         DEFAULT NULL,
    original_video_id INT          DEFAULT NULL,
    video_type        VARCHAR(50)  DEFAULT 'original',
    visibility        VARCHAR(50)  DEFAULT 'Published',
    hidden            SMALLINT     DEFAULT 0,
    deleted           SMALLINT     DEFAULT 0,
    archived          SMALLINT     DEFAULT 0,
    file_size         BIGINT       DEFAULT 0,
    duration          NUMERIC(10,2) DEFAULT 0.0,
    
    uploaded_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    processed_at      TIMESTAMPTZ  DEFAULT NULL,
    created_at        TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- ── Video Processing Jobs ──────────────────────────────────
-- Persists asynchronous pipeline job state so jobs survive Render restarts
CREATE TABLE IF NOT EXISTS video_processing_jobs (
    id                 SERIAL PRIMARY KEY,
    job_id             VARCHAR(128) NOT NULL UNIQUE,
    video_id           INT          DEFAULT NULL,
    status             VARCHAR(50)  DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    progress           INT          DEFAULT 0,
    current_step       VARCHAR(255) DEFAULT 'Initializing...',
    error_message      TEXT         DEFAULT NULL,
    video_url          VARCHAR(512) DEFAULT NULL,
    formatted_captions JSONB        DEFAULT NULL,
    created_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    started_at         TIMESTAMPTZ  DEFAULT NULL,
    completed_at       TIMESTAMPTZ  DEFAULT NULL,
    updated_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

-- ── Video Captions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_captions (
    caption_id     SERIAL PRIMARY KEY,
    video_id       INT          NOT NULL,
    start_time     NUMERIC(8,2) NOT NULL,
    end_time       NUMERIC(8,2) NOT NULL,
    text           TEXT         NOT NULL,
    sign_sequence  JSONB        DEFAULT NULL,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

-- ── Video Views & Tracking ─────────────────────────────────
CREATE TABLE IF NOT EXISTS video_views (
    view_id               SERIAL PRIMARY KEY,
    student_id            INT NOT NULL,
    video_id              INT NOT NULL,
    watched_at            TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    completion_percentage NUMERIC(5,2) DEFAULT 0.0,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

-- ── Quizzes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
    quiz_id      SERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    recording_id INT          DEFAULT NULL,
    video_id     INT          DEFAULT NULL,
    created_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE SET NULL
);

-- ── Quiz Questions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    question_id    SERIAL PRIMARY KEY,
    quiz_id        INT  NOT NULL,
    question_text  TEXT NOT NULL,
    options        TEXT NOT NULL, -- JSON-serialized list of options
    correct_option INT  NOT NULL, -- 0-based index of correct option
    FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
);

-- View/alias for quiz_questions for standard compatibility
CREATE OR REPLACE VIEW quiz_questions AS SELECT * FROM questions;

-- ── Quiz Attempts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
    attempt_id        SERIAL PRIMARY KEY,
    student_id        INT          NOT NULL,
    quiz_id           INT          NOT NULL,
    score             INT          NOT NULL,
    total_questions   INT          NOT NULL,
    correct_answers   INT          NOT NULL,
    incorrect_answers INT          NOT NULL,
    percentage        NUMERIC(5,2) NOT NULL,
    time_taken        NUMERIC(8,2) NOT NULL, -- in seconds
    submitted_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
);

-- ── Student Responses ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_responses (
    response_id     SERIAL PRIMARY KEY,
    attempt_id      INT     NOT NULL,
    question_id     INT     NOT NULL,
    selected_option INT     NOT NULL,
    is_correct      BOOLEAN NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
);

-- ── Analytics Reports ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_reports (
    report_id          SERIAL PRIMARY KEY,
    quiz_id            INT          NOT NULL,
    class_average      NUMERIC(5,2) DEFAULT 0.00,
    highest_score      NUMERIC(5,2) DEFAULT 0.00,
    lowest_score       NUMERIC(5,2) DEFAULT 0.00,
    pass_count         INT          DEFAULT 0,
    fail_count         INT          DEFAULT 0,
    participation_rate NUMERIC(5,2) DEFAULT 0.00,
    updated_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
);

-- ── Student Progress ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_progress (
    progress_id   SERIAL PRIMARY KEY,
    student_id    INT          NOT NULL,
    course_id     INT          NOT NULL,
    lesson_id     VARCHAR(255) NOT NULL,
    quiz_score    NUMERIC(5,2) DEFAULT 0.00,
    passed        BOOLEAN      DEFAULT FALSE,
    attempts      INT          DEFAULT 0,
    unlocked      BOOLEAN      DEFAULT FALSE,
    completed_at  TIMESTAMPTZ  DEFAULT NULL,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- ── Attendance ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    attendance_id SERIAL PRIMARY KEY,
    student_id    INT          NOT NULL,
    classroom_id  INT          DEFAULT NULL,
    session_id    VARCHAR(64)  DEFAULT NULL,
    status        VARCHAR(50)  DEFAULT 'present',
    recorded_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- ── Comments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
    comment_id  SERIAL PRIMARY KEY,
    video_id    INT          DEFAULT NULL,
    user_id     INT          DEFAULT NULL,
    user_name   VARCHAR(120) NOT NULL,
    content     TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
);

-- ── Live Sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    teacher_id INT         NOT NULL,
    course_id  INT         NOT NULL,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time   TIMESTAMPTZ DEFAULT NULL,
    status     VARCHAR(50) DEFAULT 'live',
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- ── Recordings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recordings (
    recording_id        SERIAL PRIMARY KEY,
    session_id          VARCHAR(64)  NOT NULL,
    teacher_id          INT          NOT NULL,
    course_id           INT          NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    thumbnail_path      VARCHAR(512) DEFAULT NULL,
    duration            NUMERIC(8,2) DEFAULT 0.0,
    recording_timestamp TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    participants_count  INT          DEFAULT 0,
    status              VARCHAR(50)  DEFAULT 'processing',
    FOREIGN KEY (session_id) REFERENCES live_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- ── Quiz Scores ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_scores (
    score_id     SERIAL PRIMARY KEY,
    student_id   INT          NOT NULL,
    recording_id INT          NOT NULL,
    score        NUMERIC(5,2) DEFAULT 0.00,
    passed       BOOLEAN      DEFAULT FALSE,
    taken_at     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE CASCADE
);

-- ── Live Session Participants ────────────────────────────────
CREATE TABLE IF NOT EXISTS live_session_participants (
    session_id   VARCHAR(64)      NOT NULL,
    user_id      VARCHAR(64)      NOT NULL,
    name         VARCHAR(120)     NOT NULL,
    role         VARCHAR(50)      NOT NULL,
    is_muted     BOOLEAN          DEFAULT FALSE,
    is_video_off BOOLEAN          DEFAULT FALSE,
    joined_at    DOUBLE PRECISION NOT NULL,
    last_seen    DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES live_sessions(session_id) ON DELETE CASCADE
);

-- ── Session Chat Messages ────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_chat_messages (
    message_id SERIAL PRIMARY KEY,
    session_id VARCHAR(64)      NOT NULL,
    user_id    VARCHAR(64)      NOT NULL,
    user_name  VARCHAR(120)     NOT NULL,
    message    TEXT             NOT NULL,
    created_at DOUBLE PRECISION NOT NULL,
    FOREIGN KEY (session_id) REFERENCES live_sessions(session_id) ON DELETE CASCADE
);

-- ── Legacy / Supplementary Analytics Tables ──────────────────
CREATE TABLE IF NOT EXISTS activities (
    activity_id    SERIAL PRIMARY KEY,
    course_id      INT          NOT NULL,
    type           VARCHAR(50)  NOT NULL,
    content_url    VARCHAR(512) DEFAULT NULL,
    caption_url    VARCHAR(512) DEFAULT NULL,
    sign_video_url VARCHAR(512) DEFAULT NULL,
    difficulty     VARCHAR(50)  DEFAULT 'Medium',
    created_at     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance (
    perf_id         SERIAL PRIMARY KEY,
    student_id      INT          NOT NULL,
    activity_id     INT          NOT NULL,
    score           NUMERIC(5,2) DEFAULT 0.00,
    time_taken      NUMERIC(8,2) DEFAULT 0.00,
    attempt_count   INT          DEFAULT 1,
    completion_rate NUMERIC(3,2) DEFAULT 0.00,
    recorded_at     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id)  REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES activities(activity_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS behaviour_logs (
    log_id          SERIAL PRIMARY KEY,
    student_id      INT          NOT NULL,
    session_id      VARCHAR(64)  NOT NULL,
    click_freq      NUMERIC(8,2) DEFAULT 0.00,
    response_speed  NUMERIC(8,2) DEFAULT 0.00,
    chat_count      INT          DEFAULT 0,
    idle_time       NUMERIC(8,2) DEFAULT 0.00,
    behaviour_label VARCHAR(50)  DEFAULT 'Passive',
    logged_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS engagement_metrics (
    metric_id           SERIAL PRIMARY KEY,
    student_id          INT          NOT NULL,
    session_id          VARCHAR(64)  NOT NULL,
    engagement_score    NUMERIC(5,2) DEFAULT 0.00,
    engagement_level    VARCHAR(50)  DEFAULT 'Medium',
    participation_count INT          DEFAULT 0,
    session_time        NUMERIC(8,2) DEFAULT 0.00,
    recorded_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sign_interactions (
    interaction_id     SERIAL PRIMARY KEY,
    student_id         INT          NOT NULL,
    gesture_recognized VARCHAR(100) NOT NULL,
    confidence_score   NUMERIC(5,4) DEFAULT 0.0,
    timestamp          TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS captions (
    caption_id      SERIAL PRIMARY KEY,
    activity_id     INT          NOT NULL,
    timestamp_start NUMERIC(8,2) NOT NULL,
    timestamp_end   NUMERIC(8,2) NOT NULL,
    caption_text    TEXT         NOT NULL,
    FOREIGN KEY (activity_id) REFERENCES activities(activity_id) ON DELETE CASCADE
);

-- ── Indexes for Performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_course         ON videos(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_teacher        ON videos(teacher_id);
CREATE INDEX IF NOT EXISTS idx_videos_r2_key         ON videos(r2_key);
CREATE INDEX IF NOT EXISTS idx_jobs_job_id           ON video_processing_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_video_id         ON video_processing_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_perf_student          ON performance(student_id);
CREATE INDEX IF NOT EXISTS idx_perf_activity         ON performance(activity_id);
CREATE INDEX IF NOT EXISTS idx_behaviour_student     ON behaviour_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_behaviour_session     ON behaviour_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_engagement_student    ON engagement_metrics(student_id);
CREATE INDEX IF NOT EXISTS idx_engagement_session    ON engagement_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_session          ON session_chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_progress_student      ON student_progress(student_id, course_id);
