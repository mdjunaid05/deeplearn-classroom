-- ============================================================
-- DeepLearn Smart Virtual Classroom — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS deeplearn_classroom;
USE deeplearn_classroom;

-- ── Students ──────────────────────────────────────────────
CREATE TABLE students (
    student_id          INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(120)  NOT NULL,
    email               VARCHAR(255)  NOT NULL UNIQUE,
    password_hash       VARCHAR(255)  NOT NULL,
    disability_type     VARCHAR(100)  DEFAULT 'Hearing-Impaired',
    preferred_language  ENUM('ASL', 'ISL', 'BSL') DEFAULT 'ASL',
    enrolled_at         DATETIME      DEFAULT CURRENT_TIMESTAMP
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

-- ── Videos Pipeline ──────────────────────────────────────
CREATE TABLE videos (
    video_id       INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id     INT          NOT NULL,
    course_id      INT          NOT NULL,
    original_url   VARCHAR(512),
    processed_url  VARCHAR(512),
    transcript     TEXT,
    status         ENUM('uploaded', 'processing', 'done') DEFAULT 'uploaded',
    uploaded_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    processed_at   DATETIME,
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

-- ── Indexes for common queries ────────────────────────────
CREATE INDEX idx_perf_student       ON performance(student_id);
CREATE INDEX idx_perf_activity      ON performance(activity_id);
CREATE INDEX idx_behaviour_student  ON behaviour_logs(student_id);
CREATE INDEX idx_behaviour_session  ON behaviour_logs(session_id);
CREATE INDEX idx_engagement_student ON engagement_metrics(student_id);
CREATE INDEX idx_engagement_session ON engagement_metrics(session_id);
