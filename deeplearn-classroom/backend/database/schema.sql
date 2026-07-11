-- ============================================================
-- DeepLearn Smart Virtual Classroom — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS deeplearn_classroom;
USE deeplearn_classroom;

-- ── Users ──────────────────────────────────────────────────
CREATE TABLE users (
    user_id         INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(120)  NOT NULL,
    email           VARCHAR(255)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255)  NOT NULL,
    role            ENUM('student', 'teacher', 'admin') NOT NULL,
    avatar_url      VARCHAR(255)  DEFAULT NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    last_login      DATETIME      DEFAULT NULL
) ENGINE=InnoDB;

-- ── Students ──────────────────────────────────────────────
CREATE TABLE students (
    student_id          INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(120)  NOT NULL,
    email               VARCHAR(255)  NOT NULL UNIQUE,
    password_hash       VARCHAR(255)  NOT NULL,
    disability_type     VARCHAR(100)  DEFAULT 'Hearing-Impaired',
    preferred_language  ENUM('ASL', 'ISL', 'BSL') DEFAULT 'ASL',
    enrolled_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
    profilePhoto        VARCHAR(255)  DEFAULT NULL,
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
    attendanceRate      DECIMAL(5,2)  DEFAULT 100.0
) ENGINE=InnoDB;

-- ── Teachers ──────────────────────────────────────────────
CREATE TABLE teachers (
    teacher_id    INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120)  NOT NULL,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL
) ENGINE=InnoDB;

-- ── Courses ───────────────────────────────────────────────
CREATE TABLE courses (
    course_id        INT AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(255) NOT NULL,
    teacher_id       INT          NOT NULL,
    difficulty_level ENUM('Easy','Medium','Hard') DEFAULT 'Medium',
    has_captions     BOOLEAN      DEFAULT TRUE,
    has_sign_support BOOLEAN      DEFAULT TRUE,
    created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Activities ────────────────────────────────────────────
CREATE TABLE activities (
    activity_id     INT AUTO_INCREMENT PRIMARY KEY,
    course_id       INT          NOT NULL,
    type            ENUM('video','quiz','assignment','reading') NOT NULL,
    content_url     VARCHAR(512) DEFAULT NULL,
    caption_url     VARCHAR(512) DEFAULT NULL,
    sign_video_url  VARCHAR(512) DEFAULT NULL,
    difficulty      ENUM('Easy','Medium','Hard') DEFAULT 'Medium',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(course_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Performance ───────────────────────────────────────────
CREATE TABLE performance (
    perf_id         INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT           NOT NULL,
    activity_id     INT           NOT NULL,
    score           DECIMAL(5,2)  DEFAULT 0.00,
    time_taken      DECIMAL(8,2)  DEFAULT 0.00,
    attempt_count   INT           DEFAULT 1,
    completion_rate DECIMAL(3,2)  DEFAULT 0.00,
    recorded_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id)  REFERENCES students(student_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES activities(activity_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Behaviour Logs ────────────────────────────────────────
CREATE TABLE behaviour_logs (
    log_id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT           NOT NULL,
    session_id      VARCHAR(64)   NOT NULL,
    click_freq      DECIMAL(8,2)  DEFAULT 0.00,
    response_speed  DECIMAL(8,2)  DEFAULT 0.00,
    chat_count      INT           DEFAULT 0,
    idle_time       DECIMAL(8,2)  DEFAULT 0.00,
    behaviour_label ENUM('Active','Passive','Distracted') DEFAULT 'Passive',
    logged_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Engagement Metrics ────────────────────────────────────
CREATE TABLE engagement_metrics (
    metric_id           INT AUTO_INCREMENT PRIMARY KEY,
    student_id          INT           NOT NULL,
    session_id          VARCHAR(64)   NOT NULL,
    engagement_score    DECIMAL(5,2)  DEFAULT 0.00,
    engagement_level    ENUM('High','Medium','Low') DEFAULT 'Medium',
    participation_count INT           DEFAULT 0,
    session_time        DECIMAL(8,2)  DEFAULT 0.00,
    recorded_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Sign Interactions ──────────────────────────────────────
CREATE TABLE sign_interactions (
    interaction_id     INT AUTO_INCREMENT PRIMARY KEY,
    student_id         INT          NOT NULL,
    gesture_recognized VARCHAR(100) NOT NULL,
    confidence_score   DECIMAL(5,4) DEFAULT 0.0,
    timestamp          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Captions ──────────────────────────────────────────────
CREATE TABLE captions (
    caption_id      INT AUTO_INCREMENT PRIMARY KEY,
    activity_id     INT          NOT NULL,
    timestamp_start DECIMAL(8,2) NOT NULL,
    timestamp_end   DECIMAL(8,2) NOT NULL,
    caption_text    TEXT         NOT NULL,
    FOREIGN KEY (activity_id) REFERENCES activities(activity_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE videos (
    video_id       INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id     INT          NOT NULL,
    course_id      INT          NOT NULL,
    title          VARCHAR(255),
    filename       VARCHAR(255),
    r2_url         VARCHAR(512),
    original_url   VARCHAR(512),
    processed_url  VARCHAR(512),
    transcript     TEXT,
    status         ENUM('uploaded', 'processing', 'done') DEFAULT 'uploaded',
    uploaded_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    processed_at   DATETIME,
    original_video_id INT          DEFAULT NULL,
    video_type     VARCHAR(50)  DEFAULT 'original',
    captions_url   VARCHAR(512) DEFAULT NULL,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE video_captions (
    caption_id     INT AUTO_INCREMENT PRIMARY KEY,
    video_id       INT          NOT NULL,
    start_time     DECIMAL(8,2) NOT NULL,
    end_time       DECIMAL(8,2) NOT NULL,
    text           TEXT         NOT NULL,
    sign_sequence  JSON,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE video_views (
    view_id               INT AUTO_INCREMENT PRIMARY KEY,
    student_id            INT NOT NULL,
    video_id              INT NOT NULL,
    watched_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    completion_percentage DECIMAL(5,2) DEFAULT 0.0,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Live Sessions ──────────────────────────────────────────
CREATE TABLE live_sessions (
    session_id     VARCHAR(64) PRIMARY KEY,
    teacher_id     INT NOT NULL,
    course_id      INT NOT NULL,
    start_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time       DATETIME,
    status         ENUM('live', 'ended') DEFAULT 'live',
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Recordings ─────────────────────────────────────────────
CREATE TABLE recordings (
    recording_id        INT AUTO_INCREMENT PRIMARY KEY,
    session_id          VARCHAR(64) NOT NULL,
    teacher_id          INT NOT NULL,
    course_id           INT NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    thumbnail_path      VARCHAR(512),
    duration            DECIMAL(8,2) DEFAULT 0.0,
    recording_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    participants_count  INT DEFAULT 0,
    status              ENUM('processing', 'processed', 'failed') DEFAULT 'processing',
    FOREIGN KEY (session_id) REFERENCES live_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Quiz Scores ─────────────────────────────────────────────
CREATE TABLE quiz_scores (
    score_id      INT AUTO_INCREMENT PRIMARY KEY,
    student_id    INT NOT NULL,
    recording_id  INT NOT NULL,
    score         DECIMAL(5,2) DEFAULT 0.00,
    passed        BOOLEAN DEFAULT FALSE,
    taken_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Live Session Participants ────────────────────────────────
CREATE TABLE live_session_participants (
    session_id      VARCHAR(64) NOT NULL,
    user_id         VARCHAR(64) NOT NULL,
    name            VARCHAR(120) NOT NULL,
    role            VARCHAR(50) NOT NULL,
    is_muted        BOOLEAN DEFAULT FALSE,
    is_video_off    BOOLEAN DEFAULT FALSE,
    joined_at       DOUBLE NOT NULL,
    last_seen       DOUBLE NOT NULL,
    PRIMARY KEY (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES live_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Session Chat Messages ────────────────────────────────────
CREATE TABLE session_chat_messages (
    message_id      INT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(64) NOT NULL,
    user_id         VARCHAR(64) NOT NULL,
    user_name       VARCHAR(120) NOT NULL,
    message         TEXT NOT NULL,
    created_at      DOUBLE NOT NULL,
    FOREIGN KEY (session_id) REFERENCES live_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Indexes for common queries ────────────────────────────
CREATE INDEX idx_perf_student       ON performance(student_id);
CREATE INDEX idx_perf_activity      ON performance(activity_id);
CREATE INDEX idx_behaviour_student  ON behaviour_logs(student_id);
CREATE INDEX idx_behaviour_session  ON behaviour_logs(session_id);
CREATE INDEX idx_engagement_student ON engagement_metrics(student_id);
CREATE INDEX idx_engagement_session ON engagement_metrics(session_id);
CREATE INDEX idx_chat_session       ON session_chat_messages(session_id, created_at);

-- ── Quiz Analytics & Teacher Reporting System ────────────────
CREATE TABLE quizzes (
    quiz_id      INT AUTO_INCREMENT PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    recording_id INT DEFAULT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recording_id) REFERENCES recordings(recording_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE questions (
    question_id   INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id       INT NOT NULL,
    question_text TEXT NOT NULL,
    options       TEXT NOT NULL,
    correct_option INT NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE quiz_attempts (
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

CREATE TABLE student_responses (
    response_id     INT AUTO_INCREMENT PRIMARY KEY,
    attempt_id      INT NOT NULL,
    question_id     INT NOT NULL,
    selected_option INT NOT NULL,
    is_correct      BOOLEAN NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE analytics_reports (
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

CREATE TABLE student_progress (
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



