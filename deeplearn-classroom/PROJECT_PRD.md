# DeepLearn Classroom
## Living Product Requirements & Technical Specification

**Last Updated:** September 4, 2026  
**Current Version:** 2.0.0  
**Documentation Status:** Active / Complete Codebase Audit Verified  
**Target Repository:** `deeplearn-classroom`

---

# 1. Product Overview

### What DeepLearn Classroom Is
**DeepLearn Smart Virtual Classroom** is an AI-powered, accessible virtual learning platform specifically engineered for **deaf and hearing-impaired students**, educators, and academic institutions. The system integrates deep learning models, computer vision, and media processing pipelines to create an inclusive, barrier-free classroom environment.

### What Problem It Solves
Traditional virtual learning platforms (Zoom, Google Meet, Microsoft Teams) rely heavily on spoken communication and auditory alerts, creating severe accessibility barriers for deaf and hard-of-hearing learners:
1. **Auditory Exclusion:** Spoken lectures lack automated, accurate sign language interpretation and synchronized captions.
2. **One-Way Communication:** Hearing-impaired students often struggle to contribute during fast-paced voice discussions without a sign-to-text translator.
3. **Passive Disengagement:** Students with disabilities may experience cognitive fatigue or distraction without visual behavioral interventions and adaptive pacing.
4. **Bandwidth & Storage Bottlenecks:** Serving heavy video lessons on ephemeral infrastructure leads to broken playback and data loss.

DeepLearn Classroom solves these challenges by combining:
- Automated Speech-to-Text transcription with **Indian Sign Language (ISL)** translation.
- Bilateral animated sign language avatar rendering on video streams.
- Real-time webcam-based **ISL Sign → Text recognition** using MediaPipe 3D hand landmarks and CNN classification.
- An **Adaptive Virtual Classroom** that monitors student engagement and interaction behaviors using LSTM and DNN neural networks.
- An interactive **Quiz and Progression System** that unlocks curriculum lessons sequentially based on comprehension.

### Who Uses It
- **Deaf & Hearing-Impaired Students:** Access bilingual course materials, view synchronized captions and ISL interpretations, express themselves via live ISL webcam recognition, and receive real-time visual alerts.
- **Special Education Teachers & Instructors:** Upload lecture videos with automated Cloudflare R2 direct storage, generate ISL signing videos, conduct WebRTC live classes, monitor class-wide behavior analytics, track quiz performance, and manually override lesson progression.
- **School Administrators:** Manage institutional enrollment, track attendance rates, and analyze longitudinal accessibility compliance.

### What Makes It Different
- **Indian Sign Language (ISL) Standard Focus:** Unlike Western ASL tools, DeepLearn Classroom uses ISL vocabulary based on the ISLRTC standards, supporting both two-handed manual fingerspelling (A–Z) and 76 core ISL word signs.
- **Direct-to-Cloudflare R2 Video Architecture:** Teachers upload videos directly from the browser to Cloudflare R2 via presigned URLs, bypassing backend memory and disk limits on serverless/container hosts.
- **Triple-Engine Database Fallback:** Automatic runtime failover between Supabase PostgreSQL (production with connection pooling), MySQL, and local WAL-mode SQLite.
- **Dual-Track Visual Learning:** Students can watch original teacher lectures side-by-side or overlaid with AI sign-language avatars, live synchronized VTT/SRT captions, and real-time visual alert banners.

---

# 2. User Roles

Based on the actual source code (`backend/routes/auth.py`, `backend/database/schema.sql`, `backend/database/db.py`, `frontend/src/contexts/AuthContext.jsx`, and frontend route guards):

### Role Matrix

| Role | Database Value | Registration Allowed | Default Dashboard | Permissions & Route Access |
|---|---|---|---|---|
| **Student** | `'student'` | Yes (`/register`) | `/student` | Access student dashboard, virtual classroom (`/classroom`), live classroom (`/live-classroom`), sign input (`/sign-input`), lip reading (`/lip-reading`), visual alerts (`/alerts`), take quizzes, view course progress, edit own profile (`/auth/student/profile/:id`). |
| **Teacher** | `'teacher'` | Yes (`/register`) | `/teacher` | Full access to teacher dashboard (`/teacher`), behaviour monitor (`/behaviour`), engagement analytics (`/engagement`), video upload (`/video-upload`), recorded classes (`/recordings`), live classroom host (`/live-classroom`), manual lesson unlocking, full student report drill-down. |
| **Admin** | `'admin'` | Database seed only | `/` | Recognized in database schema (`CHECK(role IN ('student', 'teacher', 'admin'))`) and JWT authentication. Can view/modify any student profile. Dedicated Admin UI page is NOT IMPLEMENTED. |

### Role Details & Capabilities

#### 1. Student
- **Login & Auth:** Authenticates via `POST /auth/login` specifying `"role": "student"`. Receives a signed JWT containing `user_id`, `student_id`, `email`, `name`, and `role`.
- **Classroom Access:** Accesses `/classroom` (VirtualClassroom). Can view video lessons belonging to enrolled courses. Videos are locked (`is_locked: true`) sequentially until the student scores at least **35%** on the preceding lesson's quiz.
- **Available Actions:**
  - Watch lesson videos with captions enabled/disabled and ISL avatar overlay toggled.
  - Complete post-lecture comprehension quizzes; submissions hit `POST /quiz/submit`.
  - Open the live **ISL Sign → Text modal** to translate webcam signs into sentences and copy/speak them.
  - Join live WebRTC sessions hosted by teachers at `/live-classroom`.
  - View individual engagement metrics, recommended difficulty, quiz history, and overall course progression at `/student`.
  - Update personal profile details (contact info, disability type, preferred language) via `PUT /auth/student/profile/:id`.

#### 2. Teacher
- **Login & Auth:** Authenticates via `POST /auth/login` with `"role": "teacher"`. JWT includes `user_id`, `teacher_id`, `email`, `name`, and `role`.
- **Dashboard (`/teacher`):**
  - **Overview Tab:** Summary metrics (total students, active students, average quiz score, class attendance), student table with search and sort.
  - **Quizzes Tab:** Global quiz summaries, student leaderboard, question miss-rate ranking, full quiz attempt history, and individual student report drill-downs.
  - **Progression Tab:** Student progression table with filtering by school, grade, age, and academic status. Includes a manual **"Unlock"** button (`POST /lesson/unlock`) to grant lesson access.
  - **Videos Tab:** Catalog of uploaded videos (original and AI ISL signed), processing state indicators, video playback preview, and video deletion (`DELETE /videos/:id`).
- **Available Actions:**
  - Upload videos via direct presigned R2 upload (`/video-upload`).
  - Trigger automatic caption extraction (`POST /extract-captions`) and AI deaf signing video generation (`POST /generate-sign-video`).
  - Host live interactive sessions (`POST /start-class`, `POST /end-class`, `POST /upload-recording`).
  - View aggregate behavioral classifications (`/behaviour`) and engagement heatmaps (`/engagement`).

#### 3. Admin
- **Implementation Status:** Backend authentication and database model fully recognize the `'admin'` role. Admin demo account is seeded (`admin@deeplearn.edu`). Admin can inspect and modify student profiles via `PUT /auth/student/profile/:id`. A dedicated multi-tenant admin console UI does not currently exist.

---

# 3. Core Features

| Feature | Implementation Status | Description | Main Files |
|---|---|---|---|
| **JWT Authentication & RBAC** | `IMPLEMENTED` | Custom HS256 JWT tokens, salted SHA-256 password hashing, role-based route guards (`ProtectedRoute`, `TeacherRoute`, `StudentRoute`), session restoration from `localStorage`. | `backend/routes/auth.py`<br>`frontend/src/contexts/AuthContext.jsx`<br>`frontend/src/components/*Route.jsx` |
| **Teacher Dashboard** | `IMPLEMENTED` | 4-tab interface (Overview, Quizzes, Progression, Videos) with metric cards, attendance tracking, leaderboard, and student drill-down modals. | `frontend/src/pages/TeacherDashboard.jsx`<br>`backend/routes/dashboard.py`<br>`backend/routes/quiz_analytics.py` |
| **Student Dashboard** | `IMPLEMENTED` | Individual student view with AI difficulty recommendations, quiz history, course progress, assigned videos, and live activity metrics. | `frontend/src/pages/StudentDashboard.jsx`<br>`backend/routes/dashboard.py` |
| **Virtual Classroom** | `IMPLEMENTED` | Video player supporting standard & ISL videos, synced VTT captions, dynamic quiz generator, synchronized animated ISL avatar, and live text chat. | `frontend/src/pages/VirtualClassroom.jsx`<br>`frontend/src/components/CaptionOverlay.jsx`<br>`frontend/src/components/SignAvatarOverlay.jsx` |
| **Live Classroom (WebRTC)** | `IMPLEMENTED` | PeerJS peer-to-peer audio/video streaming, active session tracking, live participant list, session chat messages, recording upload. | `frontend/src/pages/LiveClassroom.jsx`<br>`backend/routes/live_session.py`<br>`backend/routes/recordings.py` |
| **Direct R2 Video Upload** | `IMPLEMENTED` | Presigned PUT URLs for direct browser-to-Cloudflare-R2 upload, multipart fallback, SHA verification, and startup R2 sync. | `backend/routes/video_processing.py`<br>`backend/utils/storage.py`<br>`frontend/src/pages/VideoUpload.jsx` |
| **Video Processing Pipeline** | `IMPLEMENTED` | Background worker thread generating audio extractions (FFmpeg), speech-to-text (Whisper/SpeechRecognition), OpenCV frame avatar burning, and H.264 transcode. | `backend/utils/video_pipeline.py`<br>`backend/utils/speech_to_text.py`<br>`backend/utils/avatar_renderer.py` |
| **Caption Generation** | `IMPLEMENTED` | Audio transcription parsed into timestamped segments, exported to VTT/SRT/JSON, uploaded to R2, and served via `<track>` elements. | `backend/utils/speech_to_text.py`<br>`backend/utils/video_pipeline.py`<br>`frontend/src/utils/useVideoTranscript.js` |
| **ISL Interpreter (Avatar Overlay)** | `IMPLEMENTED` | Dual implementation: (1) Server-side OpenCV stick-figure avatar burned onto video frames; (2) Client-side animated SVG avatar (`SignAvatarOverlay.jsx`) synced to caption timestamps with 150+ ISL word/finger gestures. | `backend/utils/avatar_renderer.py`<br>`backend/utils/sign_injector.py`<br>`frontend/src/components/SignAvatarOverlay.jsx`<br>`frontend/src/utils/nlpSignLanguage.js` |
| **ISL Sign → Text Recognition** | `IMPLEMENTED` | Real-time webcam frame processing via MediaPipe Hands (21 3D landmarks), kinematics geometry analysis, CNN alphabet prediction, consensus filtering, and Web Speech TTS. | `frontend/src/components/ISLSignToText.jsx`<br>`backend/routes/accessibility.py`<br>`backend/utils/mediapipe_hands.py`<br>`backend/models/model_loader.py` |
| **Quiz & Scoring System** | `IMPLEMENTED` | Pre-lecture or transcript-generated multiple-choice quizzes, automatic score calculation, weak area diagnosis, response logging, and pass threshold validation. | `backend/routes/quiz_analytics.py`<br>`frontend/src/utils/useQuizGenerator.js`<br>`frontend/src/pages/VirtualClassroom.jsx` |
| **Student Progress & Sequential Unlocking** | `IMPLEMENTED` | Students must achieve >= 35% on lesson quizzes to unlock the next chronological lesson. Progress percentages computed from `student_progress` records. | `backend/routes/quiz_analytics.py`<br>`frontend/src/pages/VirtualClassroom.jsx`<br>`frontend/src/pages/TeacherDashboard.jsx` |
| **Teacher Reports & Analytics** | `IMPLEMENTED` | Aggregated class performance, student leaderboards, most-missed questions analysis, and individual student attempt audit reports. | `backend/routes/quiz_analytics.py`<br>`frontend/src/pages/TeacherDashboard.jsx` |
| **Behaviour & Engagement Models** | `IMPLEMENTED` | LSTM network classifying student interaction sequences into Active/Passive/Distracted; Feedforward DNN predicting High/Medium/Low engagement. | `backend/routes/predict.py`<br>`backend/routes/behaviour.py`<br>`backend/models/model_loader.py` |
| **Recorded Classes Archive** | `IMPLEMENTED` | List and playback of recorded live sessions with metadata (duration, timestamp, participants count) and delete capability. | `frontend/src/pages/RecordedClasses.jsx`<br>`backend/routes/recordings.py` |
| **Lip Reading Support** | `EXPERIMENTAL` | Backend CNN model (`lip_reading_model.h5`) predicting 5 mouth states (Speaking, Silent, Mouthing, Laughing, Neutral). Frontend page `/lip-reading` runs mock timer simulation. | `backend/models/lip_reading_model.py`<br>`backend/routes/accessibility.py`<br>`frontend/src/pages/LipReadingSupport.jsx` |
| **Visual Non-Auditory Alerts** | `IMPLEMENTED` | Flashing color-coded banner component communicating system notices, lesson milestones, and reminders without audio cues. | `frontend/src/components/VisualAlertBanner.jsx`<br>`frontend/src/pages/VisualAlerts.jsx` |
| **Classroom Management (Grouping)** | `PARTIAL` | Database tables `classrooms` and `classroom_students` exist. Video queries filter by `course_id` and `classroom_id`. Dedicated CRUD interface for classroom creation is not implemented. | `backend/database/schema.sql`<br>`backend/routes/video_processing.py` |
| **Comments System** | `NOT IMPLEMENTED` | The `comments` table exists in `schema.sql` and `db.py`, but NO API endpoints or frontend UI components exist. | `backend/database/schema.sql`<br>`backend/database/db.py` |

---

# 4. System Architecture

### Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (BROWSER)                             │
│                                                                             │
│  React 18 + Vite (SPA)                    Webcam & Audio Inputs             │
│  ├── Tailwind CSS + Framer Motion         ├── MediaPipe Hands (Client/Host) │
│  ├── Recharts Dashboard Visualizations    ├── Web Speech API (Live STT)     │
│  ├── WebRTC PeerJS Client                 └── Web Speech Synthesis (TTS)    │
└───────────────────────┬──────────────────────────────────┬──────────────────┘
                        │ HTTPS (REST API)                 │ Presigned Direct
                        │ Authorization: Bearer <JWT>      │ PUT Video Upload
                        ▼                                  ▼
┌──────────────────────────────────────────────┐    ┌─────────────────────────┐
│               BACKEND LAYER                  │    │      MEDIA STORAGE      │
│                                              │    │                         │
│  Flask 2.3+ (WSGI: Gunicorn + gthread)       │    │  Cloudflare R2 (S3 API) │
│  ├── /auth          ── JWT & Profiles        │    │  ├── original/          │
│  ├── /videos        ── Catalog & Management  │◄───┤  ├── isl/               │
│  ├── /quiz          ── Scoring & Progression │    │  ├── captions/          │
│  ├── /live-session  ── WebRTC Coordination   │    │  ├── thumbnails/        │
│  ├── /predict       ── DNN & LSTM Inference  │    │  └── uploads/ (legacy)  │
│  └── /api/isl       ── Hand Landmarks/CNN    │    └─────────────────────────┘
│                                              │
│  Video Processing Pipeline (Background Thread)
│  ├── FFmpeg (Audio extract, H.264 / AAC faststart)
│  ├── OpenAI Whisper (Speech-to-Text)
│  └── OpenCV (ISL Avatar & Caption Burning)
└───────────────────────┬──────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE LAYER                                 │
│                                                                             │
│  Priority 1: Supabase PostgreSQL (Production, Connection Pooling via URI)   │
│  Priority 2: MySQL (Enterprise DB via DB_HOST)                              │
│  Priority 3: SQLite (Local Fallback: backend/data/deeplearn.db with WAL)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 5. Technology Stack

| Layer | Technology | Version | Purpose in DeepLearn Classroom |
|---|---|---|---|
| **Frontend Framework** | React | `^18.2.0` | Component-based Single Page Application UI. |
| **Frontend Build Tool** | Vite | `^5.0.0` | Ultra-fast local dev server with proxy routing and Rollup production bundling. |
| **Styling & Design** | Tailwind CSS | `^3.3.6` | Utility-first styling with custom high-contrast dark theme, accessible palettes, and glassmorphism. |
| **Animations** | Framer Motion | `^12.38.0` | Micro-animations, page transitions, and alert banner alerts. |
| **Charts & Analytics** | Recharts | `^2.15.4` | Responsive SVG charts (Line, Area, Bar, Pie) for teacher analytics and engagement dashboards. |
| **WebRTC Streaming** | PeerJS | `^1.5.5` | Peer-to-peer video, audio, and data channel coordination for the live virtual classroom. |
| **Icons** | Lucide React | `^0.294.0` | Accessible SVG icon library. |
| **Local Storage** | IndexedDB | Native | Browser-side persistent storage for raw video blobs and extracted captions via `db.js`. |
| **Backend Framework** | Flask | `>=2.3.0` | Lightweight Python WSGI web framework exposing modular Blueprints. |
| **Production Server** | Gunicorn | `>=21.2.0` | Multi-threaded WSGI HTTP server running with `--worker-class gthread`. |
| **Primary Database** | PostgreSQL (Supabase) | `>=14` | Production relational database connected via `psycopg2-binary` connection pooling. |
| **Secondary Database** | MySQL | `>=8.0` | Alternative database supported via `mysql-connector-python`. |
| **Fallback Database** | SQLite | 3.x | Zero-configuration local database fallback stored at `backend/data/deeplearn.db` with WAL mode. |
| **Object Storage** | Cloudflare R2 | S3 API | Persistent video, caption (VTT/SRT), transcript, and thumbnail storage using `boto3`. |
| **Video Processing** | FFmpeg | System / imageio | Audio track extraction, H.264 video transcoding, AAC audio muxing, and `+faststart` optimization. |
| **Speech Recognition** | OpenAI Whisper | `tiny` / `base` | High-accuracy local speech-to-text transcription for lecture video caption generation. |
| **Speech Fallback** | SpeechRecognition | `>=3.10.0` | Memory-efficient fallback speech recognition when Whisper is disabled on 512MB RAM containers. |
| **Computer Vision** | MediaPipe | `0.10.9` | Real-time 21 3D hand landmark detection and tracking from camera frames. |
| **Image Processing** | OpenCV (headless) | `>=4.8.0` | Video frame decoding, avatar stick-figure rendering, caption burning, and thumbnail extraction. |
| **Deep Learning** | TensorFlow / Keras | `>=2.13.0` | Neural network architectures for adaptive learning (DNN), behavior (LSTM), and ISL gestures (CNN). |
| **Machine Learning** | scikit-learn | `>=1.3.0` | Feature normalization scalers (`StandardScaler`) and label encoders for tabular inference. |

---

# 6. Frontend Architecture

### Application Structure
```text
frontend/src/
├── main.jsx                    # Application bootstrapping with StrictMode
├── App.jsx                     # Router, navigation wrapper, route guards
├── index.css                   # Global CSS, theme variables, glassmorphism utilities
├── contexts/
│   └── AuthContext.jsx         # Global authentication state, JWT storage, authFetch
├── pages/
│   ├── Landing.jsx             # Public hero page with feature highlights & model overview
│   ├── Login.jsx               # Role-based login form with server wake-up polling
│   ├── Register.jsx            # User registration form with instant format validation
│   ├── StudentDashboard.jsx    # Student metrics, recommendations, and enrolled lessons
│   ├── TeacherDashboard.jsx    # 4-tab educator console (overview, quizzes, progression, videos)
│   ├── VirtualClassroom.jsx    # Main lecture player, synchronized avatar, and dynamic quiz
│   ├── LiveClassroom.jsx       # PeerJS WebRTC live class with video grid and chat
│   ├── VideoUpload.jsx         # Direct R2 presigned video upload with pipeline monitoring
│   ├── RecordedClasses.jsx     # Archive of past live session recordings
│   ├── BehaviourMonitor.jsx    # Real-time student behavior classification and alert feed
│   ├── EngagementAnalytics.jsx # Longitudinal engagement charts and time-of-day heatmap
│   ├── SignLanguageInput.jsx   # Dedicated ISL gesture recognition sandbox
│   ├── LipReadingSupport.jsx   # Lip reading demonstration interface
│   └── VisualAlerts.jsx        # Visual alert configuration and testing showcase
├── components/
│   ├── Navbar.jsx              # Responsive header with role-aware navigation links
│   ├── ProtectedRoute.jsx      # Guard requiring active authentication
│   ├── TeacherRoute.jsx        # Guard requiring role === 'teacher'
│   ├── StudentRoute.jsx        # Guard requiring role === 'student'
│   ├── CaptionOverlay.jsx      # Floating high-contrast caption bar below video player
│   ├── SignAvatarOverlay.jsx   # Animated SVG/CSS ISL avatar interpreter
│   ├── ISLSignToText.jsx       # Real-time camera hand tracker & sign-to-text builder
│   ├── SignRecognitionPanel.jsx# Camera feed with frame sampling for ISL word API
│   ├── VisualAlertBanner.jsx   # Flashing high-contrast alert notification banner
│   ├── EngagementChart.jsx     # Recharts line/area charts for engagement metrics
│   ├── BehaviourChart.jsx      # Recharts bar/timeline charts for interaction states
│   └── ProgressBar.jsx         # Animated gradient progress bars
└── utils/
    ├── api.js                  # Dynamic API base URL resolver (Vite proxy vs direct URL)
    ├── db.js                   # IndexedDB helper for offline video and caption caching
    ├── nlpSignLanguage.js      # Text-to-ISL grammar parser with 150+ keyword mappings
    ├── useVideoTranscript.js   # Web Speech API real-time speech recognition hook
    ├── useQuizGenerator.js     # Heuristic multiple-choice quiz generator from text
    ├── useParticipants.js      # Live session participant polling and heartbeat management
    └── useSignLanguage.js      # Sign language gesture sequence coordination hook
```

### Key Components Specification

#### 1. `ISLSignToText.jsx`
- **File:** `frontend/src/components/ISLSignToText.jsx`
- **Purpose:** Enables live webcam capture, tracks hand landmarks, runs consensus recognition, constructs text sentences, and provides speech synthesis.
- **Inputs:** `onClose` callback prop; video stream from `navigator.mediaDevices.getUserMedia`.
- **Outputs:** Recognized word tokens, running sentence transcript, synthesized speech via Web Speech API, clipboard copy.
- **Dependencies:** `lucide-react`, `API_BASE` (`/api/isl/word-predict`).

#### 2. `SignAvatarOverlay.jsx`
- **File:** `frontend/src/components/SignAvatarOverlay.jsx`
- **Purpose:** Renders an animated ISL avatar inside the video player synchronized to caption timestamps.
- **Inputs:** `currentGesture` (string), `captionText` (string), `isPlaying` (boolean), `videoTime` (number).
- **Outputs:** SVG/CSS two-handed articulated sign avatar with hand shapes, arm rotations, body lean, and bilingual gloss label.
- **Dependencies:** `nlpSignLanguage.js`.

#### 3. `CaptionOverlay.jsx`
- **File:** `frontend/src/components/CaptionOverlay.jsx`
- **Purpose:** Renders high-contrast, accessible captions with customizable font sizing and playback speed.
- **Inputs:** `captions` (array of `{start, end, text}`), `currentTime` (number), `captionSize` ('small'|'normal'|'large').
- **Outputs:** High-contrast floating caption box with ARIA live region support.

#### 4. `AuthContext.jsx`
- **File:** `frontend/src/contexts/AuthContext.jsx`
- **Purpose:** Manages user authentication, token storage, and session validation across the frontend.
- **Inputs:** Login/Register credentials.
- **Outputs:** `user`, `token`, `isTeacher`, `isStudent`, `isAuthenticated`, `login()`, `register()`, `logout()`, `authFetch()`.
- **Dependencies:** `localStorage`, `API_BASE`.

---

# 7. Backend Architecture

### Application Structure
```text
backend/
├── app.py                      # Flask factory (create_app), CORS, health checks, R2 startup sync
├── wsgi.py                     # WSGI entry point for Gunicorn
├── Dockerfile                  # Container definition with FFmpeg and Python 3.10
├── requirements.txt            # Python dependencies
├── test_r2.py                  # Standalone Cloudflare R2 verification script
├── database/
│   ├── db.py                   # Multi-engine connection manager (PostgreSQL, MySQL, SQLite)
│   ├── schema.sql              # MySQL/SQLite relational schema (29 tables)
│   ├── schema_supabase.sql     # Supabase PostgreSQL schema with indexes and triggers
│   └── migrate_sqlite_to_supabase.py # Data migration utility
├── models/
│   ├── model_loader.py         # Thread-safe model and scaler loader with fallback heuristics
│   ├── adaptive_model.py       # 3-layer Feedforward DNN for difficulty prediction
│   ├── behaviour_model.py      # LSTM network for sequential interaction classification
│   ├── engagement_model.py     # 3-layer DNN with Dropout for engagement scoring
│   ├── lip_reading_model.py    # CNN architecture for mouth movement classification
│   ├── sign_language_model.py  # CNN architecture for ISL alphabet recognition
│   └── sign_overlay_model.py   # Avatar pose prediction network
├── routes/
│   ├── auth.py                 # User registration, login, token validation, student profiles
│   ├── video_processing.py     # Direct upload, presigned URLs, video CRUD, status polling
│   ├── quiz_analytics.py       # Quiz submission, scoring, progress tracking, teacher reports
│   ├── accessibility.py        # ISL hand landmark recognition, lip reading, captions
│   ├── live_session.py         # Live classroom joining, status heartbeats, chat messages
│   ├── recordings.py           # Live class session start/end, recording uploads, deletion
│   ├── predict.py              # ML inference endpoints (/predict-difficulty, /predict-engagement)
│   ├── behaviour.py            # Sequence behaviour logging endpoint (/log-behaviour)
│   ├── behaviour_analytics.py  # Interaction event ingestion and attendance queries
│   ├── dashboard.py            # Summary dashboard aggregations for students and teachers
│   └── sign_language.py        # Sign landmark recording storage and batch processing
├── utils/
│   ├── storage.py              # Cloudflare R2 / local disk storage abstraction
│   ├── video_pipeline.py       # Background thread orchestrating transcription and avatar burning
│   ├── speech_to_text.py       # Whisper / SpeechRecognition audio transcription
│   ├── mediapipe_hands.py      # MediaPipe Hand landmark extractor and geometric classifier
│   ├── avatar_renderer.py      # OpenCV stick-figure avatar drawing engine
│   ├── sign_injector.py        # Text-to-ISL keyword and fingerspelling token mapper
│   ├── caption_generator.py    # Caption timestamp formatting
│   └── visual_alert.py         # Visual alert payload generator
├── training/                   # Model training and dataset generation scripts
├── saved_models/               # Serialized .h5 models, .pkl scalers, and label JSONs
└── data/                       # Local SQLite database (deeplearn.db) and activity CSV
```

### Complete API Specification

| Method | Endpoint | Purpose | Authentication | Permitted Roles | Request Payload Summary | Response Summary |
|---|---|---|---|---|---|---|
| `GET` | `/health` | Production health check (API, DB, R2) | None | All | None | `{status, backend, database, r2}` |
| `GET` | `/storage-health` | Diagnostic details for Cloudflare R2 | None | All | None | `{r2_enabled, bucket, public_url}` |
| `GET` | `/r2-videos` | List raw video objects in R2 bucket | None | All | None | `{r2_videos: [...], count}` |
| `POST` | `/auth/register` | Register new student or teacher | None | All | `{name, email, password, role}` | `{status, token, user}` (201) |
| `POST` | `/auth/login` | Authenticate credentials and issue JWT | None | All | `{email, password, role}` | `{status, token, user_id, role}` |
| `GET` | `/auth/me` | Fetch current user profile from JWT | Bearer JWT | All | None | `{status, user: {...}}` |
| `POST` | `/auth/validate` | Real-time email/password validation | None | All | `{email, password}` | `{status: "valid" \| "invalid"}` |
| `GET` | `/auth/student/profile/<id>` | Get complete student profile & stats | Bearer JWT | Self / Teacher / Admin | None | `{status, student: {...}}` |
| `PUT` | `/auth/student/profile/<id>` | Update student profile details | Bearer JWT | Self / Admin (Not Teacher) | Profile fields JSON | `{status, message}` |
| `POST` | `/request-upload-url` | Generate presigned R2 PUT upload URL | None | Teacher | `{filename, file_size, course_id, title}` | `{upload_url, r2_key, video_id}` |
| `POST` | `/confirm-upload` | Confirm direct R2 upload & start pipeline | None | Teacher | `{video_id, r2_key, filename, title}` | `{status: "processing", job_id}` |
| `POST` | `/upload-video` | Multipart video upload fallback | None | Teacher | Form-data `video_file` | `{status, job_id, video_id}` |
| `GET` | `/videos` | Catalog of videos for classroom/dashboard | None | All | Params: `course_id`, `student_id`, `manage` | Array of video objects with `is_locked` |
| `GET` | `/videos/<id>` | Retrieve single video record | None | All | None | Video JSON object |
| `PUT` | `/videos/<id>` | Update video metadata (title, visibility) | None | Teacher | `{title, description, visibility}` | `{status, message}` |
| `DELETE` | `/videos/<id>` | Soft delete video record from database | None | Teacher | Query param `teacher_id` | `{status, message}` |
| `GET` | `/video-status` | Poll background pipeline progress | None | All | Query param `job_id` | `{status, progress, step, video_url}` |
| `GET` | `/download-signed-video` | Download or redirect to processed video | None | All | Query param `filename` | 307 Redirect or file stream |
| `GET` | `/video-url` | Resolve direct playback URL for video | None | All | Query param `video_id` | `{video_url, filename, status}` |
| `POST` | `/extract-captions` | Extract captions from uploaded video file | None | Teacher | Form-data `video_file` | `{captions: [{start, end, text}]}` |
| `GET` | `/video-captions` | Retrieve captions for a specific video | None | All | Query param `video_id` | `{video_id, captions: [...]}` |
| `POST` | `/generate-sign-video` | Trigger sign video generation for existing video | None | Teacher | `{video_id}` | `{status: "processing", job_id}` |
| `POST` | `/quiz/submit` | Submit quiz answers and update progress | Bearer JWT | Student | `{quiz_title, course_id, questions: [...]}` | `{attempt: {...}, weak_areas: [...]}` |
| `GET` | `/course/progress` | Fetch course progression and lesson locks | None | All | Params: `student_id`, `course_id` | `{progress_percentage, lessons: [...]}` |
| `POST` | `/lesson/unlock` | Manually unlock a lesson for a student | None | Teacher | `{student_id, lesson_id, course_id}` | `{status, message}` |
| `GET` | `/teacher/student-progress`| Class-wide progression report | None | Teacher | Param: `course_id` | Array of student progress objects |
| `GET` | `/teacher/quiz-reports` | All quiz attempts across all students | None | Teacher | None | Array of quiz attempt summaries |
| `GET` | `/teacher/student-report/<id>`| Comprehensive report for one student | None | Teacher | None | `{student, attempts, summary}` |
| `GET` | `/teacher/class-analytics` | Aggregate quiz analytics & leaderboard | None | Teacher | None | `{quizzes, leaderboard, most_missed}` |
| `POST` | `/api/isl/word-predict` | MediaPipe hand detection + ISL prediction | None | All | `{frames: [base64, ...]}` or `{image}` | `{prediction, confidence, landmarks}` |
| `POST` | `/api/isl/predict` | Crop hand landmark & alphabet prediction | None | All | `{image: base64}` | `{prediction, confidence, landmarks}` |
| `POST` | `/recognize-lip` | Predict mouth state via CNN model | None | All | `{image_array: [...]}` | `{lip_state, confidence}` |
| `POST` | `/generate-caption` | Format raw caption string with timestamp | None | All | `{text, timestamp}` | `{caption, formatted_timestamp}` |
| `POST` | `/predict-difficulty` | Predict recommended learning level | None | All | `{quiz_score, time_taken, ...}` | `{prediction: {predicted_label, ...}}` |
| `POST` | `/predict-engagement` | Predict session engagement level | None | All | `{response_freq, idle_time, ...}` | `{prediction: {predicted_label, ...}}` |
| `POST` | `/predict-isl` | Predict ISL class from 30x63 landmarks | None | All | `{sequence: [[...], ...]}` | `{prediction: {...}}` |
| `POST` | `/log-behaviour` | Classify sequence via LSTM model | None | All | `{student_id, sequence: [...]}` | `{behaviour_label, confidence}` |
| `POST` | `/behaviour-events` | Ingest real-time UI interaction event | None | All | `{student_id, event_type, ...}` | `{status: "logged"}` |
| `GET` | `/behaviour-analytics` | Retrieve interaction event aggregations | None | Teacher | Param: `student_id` | Event frequency aggregations |
| `GET` | `/attendance` | Fetch attendance records | None | Teacher | Params: `classroom_id`, `student_id` | Attendance summary list |
| `GET` | `/student-dashboard` | Aggregate dashboard payload for student | None | Student | Query param `student_id` | `{student, metrics, recommendations}` |
| `GET` | `/teacher-dashboard` | Aggregate dashboard payload for teacher | None | Teacher | None | `{students, summary_metrics}` |
| `POST` | `/session-join` | Register participant joining live session | None | All | `{session_id, user_id, name, role}` | `{status: "joined"}` |
| `POST` | `/session-leave` | Remove participant from live session | None | All | `{session_id, user_id}` | `{status: "left"}` |
| `POST` | `/session-status` | Heartbeat keep-alive for participant | None | All | `{session_id, user_id, is_muted, ...}` | `{status: "updated"}` |
| `GET` | `/session-participants`| Active participants in a live session | None | All | Query param `session_id` | `{participants: [...]}` |
| `GET` | `/active-session` | Get currently running live session ID | None | All | Query param `course_id` | `{active_session: {...}}` |
| `POST` | `/session-chat` | Post message to live classroom chat | None | All | `{session_id, user_id, name, message}` | `{status: "sent", message_id}` |
| `GET` | `/session-chat` | Fetch chat history for live session | None | All | Query param `session_id` | `{messages: [...]}` |
| `POST` | `/start-class` | Teacher starts a new live session | None | Teacher | `{teacher_id, course_id}` | `{session_id, status: "live"}` |
| `POST` | `/end-class` | Teacher ends a live session | None | Teacher | `{session_id}` | `{status: "ended"}` |
| `POST` | `/upload-recording` | Upload live recording video file | None | Teacher | Form-data `recording` + metadata | `{recording_id, file_path}` |
| `GET` | `/recordings` | List recorded live class sessions | None | All | Params: `course_id`, `student_id` | Array of recording records |
| `DELETE` | `/recordings/<id>` | Delete recorded session | None | Teacher | None | `{status: "deleted"}` |

---

# 8. Database Architecture

The database architecture is implemented in `backend/database/schema.sql`, `backend/database/schema_supabase.sql`, and wrapped transparently by `backend/database/db.py`.

### Multi-Engine Support Order
1. **Supabase PostgreSQL (Primary Production):** Selected when `DATABASE_URL`, `SUPABASE_DATABASE_URL`, or `POSTGRES_URL` is set. Utilizes a thread-safe connection pool (`ThreadedConnectionPool` min 2, max 10) with custom wrappers converting parameter placeholders (`?` → `%s`) and mapping dict/tuple access.
2. **MySQL (Secondary):** Selected when `DB_HOST` is configured.
3. **SQLite (Local Fallback):** Local file `backend/data/deeplearn.db` initialized with WAL journal mode (`PRAGMA journal_mode=WAL;`).

### Complete Entity Specification (29 Tables)

```text
                               ┌─────────────┐
                               │    users    │
                               └──────┬──────┘
                                      │ 1:1
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
          ┌─────────────┐                           ┌─────────────┐
          │  students   │                           │  teachers   │
          └──────┬──────┘                           └──────┬──────┘
                 │                                         │ 1:N
                 │                                         ▼
                 │                                  ┌─────────────┐
                 │                                  │   courses   │
                 │                                  └──────┬──────┘
                 │                                         │ 1:N
                 │         ┌───────────────────────────────┴─────────────┐
                 │         ▼                                             ▼
                 │  ┌─────────────┐                               ┌─────────────┐
                 │  │ classrooms  │                               │   videos    │
                 │  └──────┬──────┘                               └──────┬──────┘
                 │         │ 1:N                                         │ 1:N
                 │         ▼                                             ▼
                 │  ┌─────────────────────┐                       ┌─────────────────────┐
                 │  │ classroom_students  │                       │   video_captions    │
                 │  └─────────────────────┘                       └─────────────────────┘
                 │                                                       │
                 │ 1:N                                                   │ 1:N
                 ├──────────────────────┬──────────────────────┐         ▼
                 ▼                      ▼                      ▼  ┌─────────────────────┐
          ┌─────────────┐        ┌─────────────┐        ┌─────────┤       quizzes       │
          │  attendance │        │ video_views │        │ student_│ └──────────┬──────────┘
          └─────────────┘        └─────────────┘        │ progress│            │ 1:N
                                                        └─────────┘            ▼
                                                                  ┌─────────────────────┐
                                                                  │      questions      │
                                                                  └────────────┬────────┘
                                                                               │ 1:N
                                                                               ▼
                                                                  ┌─────────────────────┐
                                                                  │  student_responses  │
                                                                  └─────────────────────┘
```

#### Table Definitions

1. **`users`**
   - **PK:** `user_id` (INTEGER / INT AUTO_INCREMENT)
   - **Fields:** `name` (TEXT/VARCHAR), `email` (TEXT/VARCHAR UNIQUE), `password_hash` (TEXT), `role` (ENUM/CHECK: 'student', 'teacher', 'admin'), `avatar_url` (TEXT), `created_at` (DATETIME), `last_login` (DATETIME).
   - **Relationships:** Parent to `students` (1:1) and `teachers` (1:1).

2. **`students`**
   - **PK:** `student_id` (INTEGER / INT AUTO_INCREMENT)
   - **Fields:** `name`, `email` (UNIQUE), `password_hash`, `disability_type` (DEFAULT 'Hearing-Impaired'), `preferred_language` (DEFAULT 'ISL'), `enrolled_at`, `profilePhoto`, `age`, `gender`, `dob`, `phone`, `schoolName`, `grade`, `section`, `rollNumber`, `academicYear`, `parentName`, `parentPhone`, `parentEmail`, `emergencyContact`, `city`, `state`, `country`, `learningLevel`, `attendanceRate` (DEFAULT 100.0).
   - **Relationships:** Referenced by `classroom_students`, `quiz_attempts`, `student_progress`, `attendance`, `video_views`.

3. **`teachers`**
   - **PK:** `teacher_id` (INTEGER / INT AUTO_INCREMENT)
   - **Fields:** `name`, `email` (UNIQUE), `password_hash`.
   - **Relationships:** Parent to `courses`, `classrooms`, `videos`, `live_sessions`, `recordings`.

4. **`courses`**
   - **PK:** `course_id` (INTEGER / INT AUTO_INCREMENT)
   - **Fields:** `title` (TEXT NOT NULL), `teacher_id` (FK -> `teachers`), `difficulty_level` ('Easy', 'Medium', 'Hard'), `has_captions` (BOOL DEFAULT 1), `has_sign_support` (BOOL DEFAULT 1), `created_at`.
   - **Relationships:** Parent to `classrooms`, `videos`, `activities`, `live_sessions`, `recordings`.

5. **`classrooms`**
   - **PK:** `classroom_id` (INTEGER / INT AUTO_INCREMENT)
   - **Fields:** `name`, `course_id` (FK -> `courses`), `teacher_id` (FK -> `teachers`), `code`, `description`, `created_at`.
   - **Relationships:** Parent to `classroom_students`, referenced in `videos` and `attendance`.

6. **`classroom_students`**
   - **PK:** `id` (INTEGER AUTO_INCREMENT)
   - **Fields:** `classroom_id` (FK -> `classrooms`), `student_id` (FK -> `students`), `enrolled_at`.
   - **Constraints:** `UNIQUE (classroom_id, student_id)`.

7. **`videos`**
   - **PK:** `video_id` (INTEGER / INT AUTO_INCREMENT)
   - **Fields:** `teacher_id` (FK -> `teachers`), `course_id` (FK -> `courses`), `classroom_id` (FK -> `classrooms`), `title`, `filename`, `r2_url`, `original_url`, `processed_url`, `transcript`, `status`, `upload_status`, `processing_status`, `caption_status`, `signing_status`, `r2_key`, `r2_captions_key`, `r2_isl_key`, `r2_thumbnail_key`, `uploaded_at`, `processed_at`, `original_video_id` (self-referencing FK), `video_type` ('original' | 'ISL'), `captions_url`, `description`, `thumbnail`, `visibility` (DEFAULT 'Published'), `hidden` (INT DEFAULT 0), `deleted` (INT DEFAULT 0), `archived` (INT DEFAULT 0), `file_size` (INT), `duration` (REAL), `created_at`, `updated_at`.
   - **Relationships:** Parent to `video_captions`, `video_processing_jobs`, `video_views`, `comments`.

8. **`video_processing_jobs`**
   - **PK:** `id` (INTEGER AUTO_INCREMENT)
   - **Fields:** `job_id` (TEXT UNIQUE NOT NULL), `video_id` (FK -> `videos`), `status` ('pending', 'processing', 'completed', 'failed'), `progress` (INTEGER 0-100), `current_step` (TEXT), `error_message` (TEXT), `video_url` (TEXT), `formatted_captions` (TEXT/JSON), `created_at`, `started_at`, `completed_at`, `updated_at`.

9. **`video_captions`**
   - **PK:** `caption_id` (INTEGER AUTO_INCREMENT)
   - **Fields:** `video_id` (FK -> `videos`), `start_time` (REAL NOT NULL), `end_time` (REAL NOT NULL), `text` (TEXT NOT NULL), `sign_sequence` (TEXT/JSON).

10. **`video_views`**
    - **PK:** `view_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `video_id` (FK -> `videos`), `watched_at`, `completion_percentage` (REAL DEFAULT 0.0).

11. **`quizzes`**
    - **PK:** `quiz_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `title` (TEXT NOT NULL), `recording_id` (FK -> `recordings` ON DELETE SET NULL), `video_id` (FK -> `videos` ON DELETE SET NULL), `created_at`.
    - **Relationships:** Parent to `questions`, `quiz_attempts`, `analytics_reports`.

12. **`questions`**
    - **PK:** `question_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `quiz_id` (FK -> `quizzes` ON DELETE CASCADE), `question_text` (TEXT NOT NULL), `options` (TEXT/JSON NOT NULL), `correct_option` (INTEGER NOT NULL).
    - **Relationships:** Parent to `student_responses`.

13. **`quiz_attempts`**
    - **PK:** `attempt_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `quiz_id` (FK -> `quizzes`), `score` (INTEGER), `total_questions` (INTEGER), `correct_answers` (INTEGER), `incorrect_answers` (INTEGER), `percentage` (REAL), `time_taken` (REAL), `submitted_at`.
    - **Relationships:** Parent to `student_responses`.

14. **`student_responses`**
    - **PK:** `response_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `attempt_id` (FK -> `quiz_attempts` ON DELETE CASCADE), `question_id` (FK -> `questions` ON DELETE CASCADE), `selected_option` (INTEGER), `is_correct` (BOOLEAN).

15. **`analytics_reports`**
    - **PK:** `report_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `quiz_id` (FK -> `quizzes` ON DELETE CASCADE), `class_average` (REAL), `highest_score` (REAL), `lowest_score` (REAL), `pass_count` (INTEGER), `fail_count` (INTEGER), `participation_rate` (REAL), `updated_at`.

16. **`student_progress`**
    - **PK:** `progress_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students` ON DELETE CASCADE), `course_id` (FK -> `courses`), `lesson_id` (TEXT NOT NULL), `quiz_score` (REAL DEFAULT 0.0), `passed` (BOOLEAN DEFAULT 0), `attempts` (INTEGER DEFAULT 0), `unlocked` (BOOLEAN DEFAULT 0), `completed_at`.

17. **`attendance`**
    - **PK:** `attendance_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `classroom_id` (INTEGER), `session_id` (TEXT), `status` (TEXT DEFAULT 'present'), `recorded_at`.

18. **`comments`** (Schema Only — Endpoints Not Implemented)
    - **PK:** `comment_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `video_id` (FK -> `videos` ON DELETE CASCADE), `user_id` (INTEGER), `user_name` (TEXT), `content` (TEXT), `created_at`.

19. **`live_sessions`**
    - **PK:** `session_id` (TEXT PRIMARY KEY)
    - **Fields:** `teacher_id` (FK -> `teachers`), `course_id` (FK -> `courses`), `start_time`, `end_time`, `status` ('live', 'ended').
    - **Relationships:** Parent to `recordings`, `live_session_participants`, `session_chat_messages`.

20. **`recordings`**
    - **PK:** `recording_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `session_id` (FK -> `live_sessions`), `teacher_id` (FK -> `teachers`), `course_id` (FK -> `courses`), `file_path` (TEXT NOT NULL), `thumbnail_path` (TEXT), `duration` (REAL), `recording_timestamp`, `participants_count` (INTEGER), `status` ('processing', 'ready').
    - **Relationships:** Referenced by `quiz_scores`, `quizzes`.

21. **`quiz_scores`** (Legacy Table)
    - **PK:** `score_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `recording_id` (FK -> `recordings`), `score` (REAL), `passed` (BOOLEAN), `taken_at`.

22. **`live_session_participants`**
    - **PK:** `(session_id, user_id)` Composite Primary Key
    - **Fields:** `session_id` (TEXT), `user_id` (TEXT), `name` (TEXT), `role` (TEXT), `is_muted` (BOOLEAN), `is_video_off` (BOOLEAN), `joined_at` (REAL), `last_seen` (REAL).

23. **`session_chat_messages`**
    - **PK:** `message_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `session_id` (TEXT), `user_id` (TEXT), `user_name` (TEXT), `message` (TEXT), `created_at` (REAL).

24. **`activities`**
    - **PK:** `activity_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `course_id` (FK -> `courses`), `type` ('video', 'quiz', 'assignment', 'reading'), `content_url`, `caption_url`, `sign_video_url`, `difficulty` ('Easy', 'Medium', 'Hard'), `created_at`.

25. **`performance`**
    - **PK:** `perf_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `activity_id` (FK -> `activities`), `score` (REAL), `time_taken` (REAL), `attempt_count` (INTEGER), `completion_rate` (REAL), `recorded_at`.

26. **`behaviour_logs`**
    - **PK:** `log_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `session_id` (TEXT), `click_freq` (REAL), `response_speed` (REAL), `chat_count` (INTEGER), `idle_time` (REAL), `behaviour_label` (TEXT), `logged_at`.

27. **`engagement_metrics`**
    - **PK:** `metric_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `session_id` (TEXT), `engagement_score` (REAL), `engagement_level` ('High', 'Medium', 'Low'), `participation_count` (INTEGER), `session_time` (REAL), `recorded_at`.

28. **`sign_interactions`**
    - **PK:** `interaction_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `student_id` (FK -> `students`), `gesture_recognized` (TEXT), `confidence_score` (REAL), `timestamp`.

29. **`captions`** (Alternative Activity Captions)
    - **PK:** `caption_id` (INTEGER AUTO_INCREMENT)
    - **Fields:** `activity_id` (FK -> `activities`), `timestamp_start` (REAL), `timestamp_end` (REAL), `caption_text` (TEXT).

---

# 9. Video System

### Complete Video Lifecycle

```text
[Teacher Browser]
  │ 1. Selects video file (MP4, AVI, MOV, WEBM)
  │ 2. Calls POST /request-upload-url with filename, size, course_id
  ▼
[Flask Backend]
  │ 3. Generates presigned PUT URL for Cloudflare R2
  │ 4. Pre-creates video DB record (status: 'uploading')
  │ 5. Returns { upload_url, r2_key, video_id }
  ▼
[Teacher Browser]
  │ 6. Uploads binary directly to Cloudflare R2 via HTTP PUT (bypassing Render server)
  │ 7. Upon HTTP 200, calls POST /confirm-upload { video_id, r2_key }
  ▼
[Flask Backend]
  │ 8. Verifies object existence via R2 head_object
  │ 9. Downloads raw file to local temp buffer (/tmp or backend/uploads)
  │ 10. Launches background worker thread (utils/video_pipeline.py)
  ▼
[Background Pipeline Worker]
  │ 11. Extracts audio via FFmpeg: pcm_s16le, 16000Hz, mono WAV
  │ 12. Transcribes speech: OpenAI Whisper (tiny/base) or SpeechRecognition fallback
  │ 13. Formats caption segments; exports VTT, SRT, and JSON
  │ 14. Uploads captions/{video_id}/captions.vtt to R2
  │ 15. Extracts video thumbnail (OpenCV at 1.0s); uploads thumbnails/{video_id}/thumbnail.jpg to R2
  │ 16. Maps text words to ISL tokens (utils/sign_injector.py)
  │ 17. Renders OpenCV stick-figure avatar overlay + burned captions onto video frames
  │ 18. Merges original audio back & transcodes via FFmpeg (H.264 / AAC with +faststart)
  │ 19. Uploads processed video to isl/{video_id}/isl-video.mp4 in R2
  │ 20. Inserts second video DB record (video_type: 'ISL', original_video_id: video_id)
  │ 21. Updates job status to 'completed' in video_processing_jobs and disk state file
  │ 22. Deletes local temp files
  ▼
[Student / Teacher Playback]
  │ 23. Frontend requests GET /videos?course_id=1
  │ 24. Backend resolves public CDN URLs (R2_PUBLIC_URL or 7-day presigned GET URLs)
  │ 25. VirtualClassroom loads video into HTML5 <video> element with <track src="...">
```

### Exact Cloudflare R2 Key Structure
The system uses both a structured hierarchical layout (for all new uploads) and a legacy flat layout (for backward compatibility):

1. **Original Videos:**
   - Key: `original/{course_id}/{video_id}/original{ext}`
   - Example: `original/1/42/original.mp4`
   - Content-Type: `video/mp4`, `video/webm`, `video/quicktime`
2. **AI Deaf Signing (ISL) Videos:**
   - Key: `isl/{video_id}/isl-video.mp4`
   - Content-Type: `video/mp4`
3. **Captions (WebVTT & SubRip):**
   - VTT Key: `captions/{video_id}/captions.vtt` (Content-Type: `text/vtt`)
   - SRT Key: `captions/{video_id}/captions.srt` (Content-Type: `text/plain`)
   - JSON Transcript Key: `captions/{video_id}/transcript.json` (Content-Type: `application/json`)
4. **Thumbnails:**
   - Key: `thumbnails/{video_id}/thumbnail.jpg` (Content-Type: `image/jpeg`)
5. **Legacy Flat Keys (Supported & Auto-Synced):**
   - Uploads: `uploads/{filename}`
   - Processed: `processed/signed_{filename}`

### Startup R2 Sync Engine (`sync_r2_objects_to_db`)
To guarantee that videos survive Render redeployments and container restarts on ephemeral disks:
- Runs automatically inside `create_app()` under both Gunicorn and direct Python execution.
- Scans `uploads/`, `processed/`, `original/`, and `isl/` prefixes using `boto3.list_objects_v2`.
- Matches objects against DB records by `filename`, `r2_key`, and `r2_url`.
- Inserts missing video records with status `'done'`, links corresponding ISL versions, and populates baseline captions.
- Enforces an execution timeout (default 15 seconds) to prevent blocking the Gunicorn startup sequence.

---

# 10. Caption System

### Architecture
```text
Video File (MP4/WebM)
   │
   ▼
Audio Extraction (FFmpeg subprocess: pcm_s16le, 16kHz, mono WAV)
   │
   ▼
Speech-to-Text Recognition
   ├── Primary: OpenAI Whisper (model: tiny / base)
   └── Fallback: SpeechRecognition (Google Speech Recognizer API)
   │
   ▼
Segment Processing: [{ start: float, end: float, text: str }, ...]
   │
   ├───────────────────────────────┬───────────────────────────────┐
   ▼                               ▼                               ▼
VTT Export                      SRT Export                      JSON Transcript
WEBVTT                          1                               [
00:00:00.000 --> 00:00:04.500   00:00:00,000 --> 00:00:04,500   {"start": 0.0,
Welcome to DeepLearn.           Welcome to DeepLearn.            "end": 4.5,
                                                                 "text": "..."}]
   │                               │                               │
   ▼                               ▼                               ▼
Upload to R2:                   Upload to R2:                   Upload to R2:
captions/{id}/captions.vtt      captions/{id}/captions.srt      captions/{id}/transcript.json
   │
   ▼
Database Persistence:
video_captions table (start_time, end_time, text, sign_sequence)
videos table (r2_captions_key, captions_url)
   │
   ▼
Frontend Delivery:
HTML5 <track kind="captions" src="{vtt_url}" default> + Floating CaptionOverlay.jsx
```

### Fallback and Failure Handling
- If a video contains no audio stream (e.g. screen recording without microphone), FFmpeg audio extraction catches `"does not contain any stream"` and generates a 1-second synthetic silent track via `anullsrc=r=16000:cl=mono`.
- If both Whisper and SpeechRecognition fail to detect speech, a placeholder caption segment is stored: `"No speech detected in video."` (0.0s to 2.0s).

---

# 11. ISL Interpreter System

### Indian Sign Language (ISL) Pipeline
DeepLearn Classroom provides two complementary ISL interpreter systems:

#### 1. Server-Side Frame-Burned Avatar (`utils/avatar_renderer.py`)
- **Text Mapping:** Captions are analyzed by `utils/sign_injector.py`. Stopwords are removed; remaining words are matched against `ISL_SIGNS` (76 Kaggle words + 70 classroom keywords). Unrecognized words are converted to fingerspelling tokens: `FS:WORD`.
- **OpenCV Rendering:** For each frame of the video:
  - An animated stick-figure avatar is drawn in the bottom-right corner (200×200 box, (15, 15, 25) dark background).
  - Head, body, shoulders, and hands are rendered with color `#00E678`.
  - Arm angles dynamically shift based on gesture tokens.
  - A mode label indicates `ISL SIGN` or `FINGERSPELL`.
  - The current sign word is burned into a bottom sub-bar.
- **Audio Remux:** The original audio is remuxed back into the video using FFmpeg (`-c:v libx264 -preset ultrafast -c:a aac -movflags +faststart`).
- **Output:** A new video record is created in the database with `video_type = 'ISL'` and `title = '[AI Deaf Signing] {Original Title}'`.

#### 2. Client-Side Real-Time SVG Avatar (`frontend/src/components/SignAvatarOverlay.jsx`)
- **Real-Time Glossing:** Captions and live speech transcripts are parsed in real time by `frontend/src/utils/nlpSignLanguage.js`.
- **Authentic Two-Handed ISL:** Articulates two-handed fingerspelling (A–Z) and specific ISL cultural signs:
  - `namaste` (Bilateral prayer hands at chest level)
  - `dhanyavaad` (Right hand from chin forward in gratitude)
  - `swagat` (Open palms cupped upward)
  - `shikshak` (Teacher sign: knowledge tap from temple outward)
  - `vidyarthi` (Student sign: book grasp into forehead)
- **Overlay HUD:** Features category glow colors, bilingual English/Hindi gloss labels, and queue preview chips.

---

# 12. ISL Sign → Text

### Implementation Status: `IMPLEMENTED`

The real-time camera-based ISL gesture recognition system is fully functional across both frontend and backend.

### Recognition Flow
```text
Webcam Stream (60 FPS, user-facing)
   │
   ▼
Frame Capture (Canvas 128×128 sampled every 250ms / 4 FPS)
   │
   ▼
POST /api/isl/word-predict (Payload: { frames: [base64_image, ...] })
   │
   ▼
MediaPipe Hands (backend/utils/mediapipe_hands.py)
   ├── Detects 21 3D landmarks per hand (wrist, thumb 1-4, index 5-8, middle 9-12, ring 13-16, pinky 17-20)
   ├── Measures finger extension, curl, tip distances, and palm orientation
   └── Computes bounding box around detected hands
   │
   ├───────────────────────────────┬───────────────────────────────┐
   ▼                               ▼                               ▼
Kinematics & Geometry           ISL Alphabet CNN                ISL Words CNN+LSTM
classify_hand_geometry()        models/sign_language_model.py   models/isl_words_model.h5
- Namaste (palms touching)      - 128×128 grayscale crop        - 8 frames × 128×128 RGB
- Numbers (One to Five)         - Softmax over 26 letters (A-Z) - Softmax over 76 ISL words
- Yes / Thumbs Up, No, Stop     - Weight: isl_alphabet_model.h5 - Weight: isl_words_model.h5
   │                               │                               │
   └───────────────────────────────┼───────────────────────────────┘
                                   ▼
Confidence Integration & Threshold (0.50 minimum)
   │
   ▼
JSON Response: { hands_detected, landmarks: [[x,y,z], ...], prediction, confidence }
   │
   ▼
Client-Side Consensus & Temporal Smoothing (ISLSignToText.jsx)
   ├── Consensus Buffer: 4 recent predictions
   ├── Consensus Gate: >= 2 matching predictions required to accept sign
   ├── Duplicate Prevention: Requires 2 neutral/no-hand frames before repeating same sign
   └── Output: Appends sign to recognized transcript with Text-to-Speech & Clipboard copy
```

### Vocabulary Breakdown
- **MediaPipe Geometric Signs:** `namaste`, `dhanyavaad`, `hello`, `yes`, `no`, `stop`, `help`, `understand`, `repeat`, `one`, `two`, `three`, `four`, `five`, `peace`, `victory`, `i_love_you`, `call_me`, `good`, `bad`, `learn`, `teacher`, `student`, `question`.
- **Alphabet Signs (CNN):** 26 classes (`A` through `Z`).
- **Word Signs (CNN + LSTM):** 76 classes (`afternoon`, `animal`, `bad`, `beautiful`, `big`, `bird`, `blind`, `cat`, ..., `young`).

---

# 13. Quiz System

### Creation & Generation
1. **Transcript-Based Dynamic Generation:** `frontend/src/utils/useQuizGenerator.js` analyzes the lecture transcript, extracts salient concepts, and formats a 2–4 question multiple-choice quiz.
2. **Fallback Quiz:** If a video has no transcript or audio, a verified generic deep-learning comprehension quiz (`FALLBACK_QUIZ`) is served.

### Submission & Scoring Workflow
- Student submits answers via `POST /quiz/submit` with:
  ```json
  {
    "quiz_title": "Lesson 1: Introduction to Neural Networks",
    "course_id": 1,
    "time_taken": 142.5,
    "questions": [
      {
        "question_text": "What is an activation function?",
        "options": ["A mathematical gate", "A database query", "A video codec", "A hardware cable"],
        "correct_option": 0,
        "selected_option": 0
      }
    ]
  }
  ```
- **Score Calculation:** Correct answers are counted, percentage is calculated:
  $$\text{percentage} = \frac{\text{correct\_answers}}{\text{total\_questions}} \times 100$$
- **Passing Mark:** Exactly **35%** (`passed = percentage >= 35`).
- **Database Persistence:**
  - Auto-inserts into `quizzes` and `questions` if not previously present.
  - Inserts attempt into `quiz_attempts`.
  - Inserts individual answers into `student_responses`.
  - Recalculates and updates `analytics_reports` (`class_average`, `highest_score`, `lowest_score`, `pass_count`, `fail_count`, `participation_rate`).
  - Updates `student_progress` and unlocks the next lesson.

---

# 14. Student Progress

### Progression Engine (`backend/routes/quiz_analytics.py`)

1. **Lesson ID Scheme:**
   - Video lessons: `v_{video_id}` (e.g. `v_1`, `v_2`)
   - Recorded live classes: `r_{recording_id}` (e.g. `r_10`)

2. **Progress Calculation:**
   $$\text{Progress \%} = \frac{\text{Completed Lessons with Passed Quiz (Score } \ge 35\%)}{\text{Total Lessons in Course}} \times 100$$

3. **Sequential Unlocking Logic:**
   - Lessons are ordered chronologically by creation timestamp (`uploaded_at` / `recording_timestamp`).
   - The first lesson is unlocked by default (`unlocked = 1`).
   - Subsequent lessons remain locked (`is_locked = true`).
   - When a student achieves $\ge 35\%$ on a lesson's quiz:
     - The current lesson is marked `passed = 1`.
     - The next chronological lesson is found in the ordered sequence.
     - A record in `student_progress` is updated or created with `unlocked = 1`.
     - `unlocked_next: true` and `next_lesson_id` are returned to the client.

4. **Teacher Manual Override:**
   - Teachers can unlock any lesson for any student at any time by calling `POST /lesson/unlock`.

---

# 15. Teacher Dashboard

Implemented in `frontend/src/pages/TeacherDashboard.jsx` (2,096 lines) and backed by `backend/routes/dashboard.py` and `backend/routes/quiz_analytics.py`:

### Tabs and Capabilities

1. **Overview Tab:**
   - Real-time metric cards: Total Students, Active Now, Average Quiz Score, High Engagement Count, Low Engagement Count, Class Attendance Rate.
   - Student roster table with multi-parameter search (name, email, school, grade) and sort (average score, attendance, completion).
   - Instant lesson unlock action directly from student row.

2. **Quizzes Tab:**
   - Global metrics: Class average score, total quiz attempts, global pass rate.
   - Leaderboard table ranking students by average percentage.
   - **Most Missed Questions** diagnostic table showing question text, miss-rate percentage, and incorrect counts.
   - Historical quiz attempt log with student name, quiz title, score, percentage, time taken, and timestamp.
   - Student Report Modal: Detailed performance summary with all historical attempts and weak areas.

3. **Progression Tab:**
   - School, Grade, Age, Status, and Performance filters.
   - Expandable student progression cards with visual progress bar (`ProgressBar.jsx`).
   - Complete lesson-by-lesson checklist showing lock status, quiz score, attempts count, and completion timestamp.
   - One-click **Manual Unlock** button.

4. **Videos Tab:**
   - Video library showing thumbnail, title, video type (`original` vs `ISL`), upload status, processing status, and visibility.
   - In-dashboard video playback preview modal.
   - Video deletion (`DELETE /videos/:id`).
   - Direct shortcut to Video Upload console (`/video-upload`).

---

# 16. Student Dashboard

Implemented in `frontend/src/pages/StudentDashboard.jsx` and backed by `backend/routes/dashboard.py`:

### Capabilities
- **Difficulty Recommendation Card:** Displays the AI-recommended learning level (Easy, Medium, Hard) derived from `models/adaptive_model.py`.
- **Engagement & Activity Metrics:** Displays participation count, session time, and completion rates.
- **Course Progress Bar:** Real-time completion percentage based on passed quizzes.
- **Video Lesson Library:** List of course videos with thumbnails, duration, lock badges, and one-click playback routing to `/classroom`.
- **Recorded Classes Section:** List of archived live sessions with recording timestamps and playback links.
- **Quiz Performance History:** Recent quiz scores, percentage badges, and pass/fail indicators.

---

# 17. Comments

### Implementation Status: `NOT IMPLEMENTED`

- **Database:** A `comments` table is defined in `backend/database/schema.sql` and `backend/database/db.py`:
  ```sql
  CREATE TABLE IF NOT EXISTS comments (
      comment_id  INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id    INTEGER,
      user_id     INTEGER,
      user_name   TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos(video_id) ON DELETE CASCADE
  );
  ```
- **Backend APIs:** There are **NO** CRUD routes (no `POST /comments`, `GET /comments`, `DELETE /comments`) implemented in any Blueprint.
- **Frontend UI:** There are **NO** comment components, comment lists, or comment input fields in the frontend code.
- **Live Classroom Chat Note:** Live session messaging is implemented separately via `session_chat_messages` (`/session-chat`), but video lecture comments do not exist.

---

# 18. Authentication & Security

### Token-Based Authentication (JWT)
- **Algorithm:** HMAC-SHA256 (HS256) implemented in `backend/routes/auth.py` without external dependencies.
- **Secret Key:** Loaded from `SECRET_KEY` environment variable; fallback to default dev key in local mode.
- **Expiration:** 72 hours from issuance (`exp` claim validated against `time.time()`).
- **Payload Structure:**
  ```json
  {
    "user_id": 1,
    "teacher_id": 1,
    "student_id": null,
    "email": "teacher@deeplearn.edu",
    "name": "Demo Teacher",
    "role": "teacher",
    "iat": 1725450000,
    "exp": 1725709200
  }
  ```

### Password Security
- Passwords are hashed using salted SHA-256: `salt$hash` where salt is 16 random bytes hex-encoded (`os.urandom(16).hex()`).
- Verification uses `hmac.compare_digest()` to prevent timing attacks.
- Legacy plain-text support exists strictly for initial demo account seeding compatibility.

### Role-Based Access Control (RBAC)
- **Backend Decorators:**
  - `@require_auth`: Enforces valid Bearer JWT.
  - `@require_role("teacher")` / `@require_role("student")`: Enforces role claims.
- **Frontend Route Guards:**
  - `ProtectedRoute`: Redirects unauthenticated users to `/login`.
  - `TeacherRoute`: Redirects non-teachers to `/`.
  - `StudentRoute`: Redirects non-students to `/`.

### CORS Configuration
- Handled by `flask_cors.CORS` in `backend/app.py`.
- Accepts origins from `CORS_ORIGINS` (comma-separated string parsed to list) and `FRONTEND_URL`.
- Permitted methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- Exposed headers: `Content-Range, Content-Disposition`.

---

# 19. File Storage

### Cloudflare R2 (Production Storage)
Cloudflare R2 is an S3-compatible, zero-egress object storage service accessed via `boto3`.

- **Bucket Name:** Default `deeplearn-videos` (configured via `R2_BUCKET_NAME`).
- **Endpoint:** `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- **Serving Strategy:**
  - If `R2_PUBLIC_URL` is set: Serves permanent CDN URLs (e.g. `https://pub-xxxx.r2.dev/{r2_key}`).
  - If `R2_PUBLIC_URL` is absent: Generates 7-day presigned GET URLs via S3 client.
- **Upload Strategy:**
  - Direct browser-to-R2 upload via 1-hour presigned PUT URLs (`generate_presigned_upload_url`).
  - Backend upload with 3-attempt exponential backoff retry and `head_object` verification.
- **Deletion Strategy:** Handled via `boto3.delete_object` upon video deletion.

### Local Disk Storage (Fallback)
- When R2 credentials are not set, media is stored in `backend/uploads/` and `backend/processed_videos/`.
- Served directly via Flask `send_file()`. Note: local files on free-tier container platforms (Render) are ephemeral and wiped on restart.

---

# 20. Video Processing & FFmpeg

Every FFmpeg operation in DeepLearn Classroom is executed via Python subprocesses using `imageio_ffmpeg` or system `ffmpeg`:

#### 1. Audio Track Extraction
- **Input:** Raw video file (MP4, AVI, MOV, WEBM).
- **Command:**
  ```bash
  ffmpeg -y -i {video_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path.wav}
  ```
- **Output:** Mono 16 kHz 16-bit PCM WAV audio.
- **Purpose:** Optimized audio format for Whisper and SpeechRecognition STT models.

#### 2. Synthetic Audio Generation (Silent Video Fallback)
- **Input:** Video with no audio streams.
- **Command:**
  ```bash
  ffmpeg -y -f lavfi -i anullsrc=r=16000:cl=mono -t 1.0 {audio_path.wav}
  ```
- **Output:** 1-second silent WAV audio.
- **Purpose:** Prevents pipeline crashes when processing silent videos.

#### 3. Audio Merge & H.264 Web Transcoding
- **Input:** Processed video frames (`output_path`) + Original video audio (`input_path`).
- **Command:**
  ```bash
  ffmpeg -y -i {processed_video} -i {original_video} \
    -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
    -c:a aac -map 0:v:0 -map 1:a:0? -movflags +faststart -shortest {temp_output.mp4}
  ```
- **Output:** Web-compatible H.264 / AAC MP4 video with `faststart` atom.
- **Purpose:** Ensures video streams smoothly in all browsers with audio re-synchronized.

#### 4. Video Duration Probing
- **Input:** Video file path.
- **Command:**
  ```bash
  ffmpeg -i {video_path}
  ```
- **Output:** Duration string parsed via regex `Duration:\s*(\d+):(\d+):(\d+\.\d+)`.
- **Purpose:** Computes accurate video runtime for database records.

---

# 21. API Contracts

### Key Request & Response Examples

#### 1. Direct Upload URL Request
`POST /request-upload-url`
```json
// Request
{
  "filename": "lecture_01.mp4",
  "file_size": 52428800,
  "course_id": 1,
  "title": "Introduction to Neural Networks"
}

// Response (200 OK)
{
  "status": "success",
  "upload_url": "https://<account>.r2.cloudflarestorage.com/deeplearn-videos/original/1/15/original.mp4?X-Amz-...",
  "r2_key": "original/1/15/original.mp4",
  "video_id": 15,
  "direct_upload": true
}
```

#### 2. Confirm Upload
`POST /confirm-upload`
```json
// Request
{
  "video_id": 15,
  "r2_key": "original/1/15/original.mp4",
  "filename": "lecture_01.mp4",
  "title": "Introduction to Neural Networks",
  "course_id": 1
}

// Response (200 OK)
{
  "status": "processing",
  "job_id": "8f3b2a1c-9d4e-4f5a-b6c7-1e2d3f4a5b6c",
  "video_id": 15,
  "filename": "lecture_01.mp4",
  "message": "Upload confirmed. Video processing pipeline started."
}
```

#### 3. Video Processing Status
`GET /video-status?job_id=8f3b2a1c-9d4e-4f5a-b6c7-1e2d3f4a5b6c`
```json
// Response (200 OK)
{
  "status": "processing",
  "progress": 65,
  "step": "Rendering frame 975/1500",
  "video_url": null,
  "captions": null
}

// Response when completed (200 OK)
{
  "status": "done",
  "progress": 100,
  "step": "Complete",
  "video_url": "https://pub-xxxx.r2.dev/isl/15/isl-video.mp4",
  "captions": [
    { "start": 0.0, "end": 3.2, "text": "Welcome to deep learning classroom." }
  ]
}
```

#### 4. Submit Quiz
`POST /quiz/submit` (Header: `Authorization: Bearer <JWT>`)
```json
// Request
{
  "quiz_title": "Lesson 1 Quiz",
  "course_id": 1,
  "time_taken": 95.0,
  "questions": [
    {
      "question_text": "What does CNN stand for?",
      "options": ["Convolutional Neural Network", "Central Neural Node", "Circular Network Node"],
      "correct_option": 0,
      "selected_option": 0
    }
  ]
}

// Response (200 OK)
{
  "status": "success",
  "message": "Success! Lesson completed and next video unlocked automatically.",
  "attempt": {
    "attempt_id": 4,
    "score": 1,
    "total_questions": 1,
    "percentage": 100.0,
    "passed": true,
    "attempts": 1,
    "unlocked_next": true,
    "next_lesson_id": "v_2"
  },
  "incorrect_questions": [],
  "weak_areas": []
}
```

#### 5. Real-time ISL Gesture Recognition
`POST /api/isl/word-predict`
```json
// Request
{
  "frames": ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."]
}

// Response (200 OK)
{
  "status": "success",
  "language": "ISL",
  "hands_detected": 1,
  "landmarks": [
    [0.54, 0.72, -0.02],
    [0.51, 0.68, -0.04]
  ],
  "handedness": ["Right"],
  "prediction": "NAMASTE",
  "confidence": 0.94,
  "model_loaded": true
}
```

---

# 22. Environment Variables

| Variable Name | Used By | Required | Purpose / Secret Handling |
|---|---|---|---|
| `SECRET_KEY` | Flask Backend | **Yes** | Signing JWT tokens and session data. Generate randomly in production. |
| `PORT` | Flask / Gunicorn | Automatic | Port number injected by hosting platform (Render/Railway default: 10000). |
| `CORS_ORIGINS` | Flask Backend | Optional | Comma-separated list of allowed frontend origins (e.g. `https://deeplearn-classroom.vercel.app`). |
| `FRONTEND_URL` | Flask Backend | Optional | Additional allowed frontend origin for CORS. |
| `DATABASE_URL` | Database Connection | Optional | Supabase / PostgreSQL URI. If unset, falls back to SQLite. |
| `DB_HOST` | Database Connection | Optional | MySQL hostname. |
| `DB_PORT` | Database Connection | Optional | MySQL port (default 3306). |
| `DB_USER` | Database Connection | Optional | MySQL username. |
| `DB_PASS` | Database Connection | Optional | MySQL password. |
| `DB_NAME` | Database Connection | Optional | MySQL database name. |
| `R2_ACCOUNT_ID` | Cloudflare R2 | Optional | Cloudflare account identifier. |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 | Optional | Cloudflare R2 API token access key. |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Optional | Cloudflare R2 API token secret key. |
| `R2_BUCKET_NAME` | Cloudflare R2 | Optional | Bucket name (default `deeplearn-videos`). |
| `R2_PUBLIC_URL` | Cloudflare R2 | Optional | Public CDN URL (e.g. `https://pub-xxxx.r2.dev`). |
| `RENDER` | Speech-to-Text | Optional | Flag indicating deployment on Render. |
| `USE_WHISPER` | Speech-to-Text | Optional | Toggle Whisper STT (`false` on 512MB RAM free tier). |
| `WHISPER_MODEL` | Speech-to-Text | Optional | Whisper model size (`tiny`, `base`). Default `tiny`. |
| `VITE_API_URL` | Frontend (Vite) | Optional | Base URL for backend API. If unset in dev, defaults to `/api`. |

---

# 23. Error Handling

1. **Direct Upload Failure:** If browser-to-R2 direct upload fails (e.g. network timeout or CORS PUT restriction), the frontend falls back to standard multipart upload via `POST /upload-video`.
2. **Cloudflare R2 Unavailable:** If R2 environment variables are missing, the storage layer automatically falls back to local disk storage (`backend/uploads/`), outputting diagnostic logs.
3. **Database Failover:** `backend/database/db.py` evaluates connection targets in order: PostgreSQL (Supabase) → MySQL → SQLite. If PostgreSQL raises connection errors, it falls back to SQLite automatically.
4. **Speech-to-Text Failures:** If Whisper model load fails or OOM occurs, the pipeline degrades gracefully to `SpeechRecognition`. If all audio transcription fails, a default `"No speech detected in video."` segment is generated.
5. **Video Pipeline Crash Isolation:** Pipeline runs in an isolated daemon thread. Any unhandled exception updates the database job status to `'failed'`, saves the stack trace in `video_processing_jobs.error_message`, and marks video record as `'failed'`.
6. **Token Expiration:** The client interceptor catches 401 Unauthorized responses, clears `auth_token` and `user` from `localStorage`, and redirects to `/login`.

---

# 24. Testing

| Test Suite / Command | Execution Status | Results & Verified Behavior |
|---|---|---|
| **Python Syntax Compilation** (`py_compile`) | `PASS` | All 31 backend Python files compiled with 0 syntax errors. |
| **Frontend Production Build** (`npm run build`) | `PASS` | Vite built 2,228 modules in 17.36s with zero errors (`dist/index.html` created). |
| **Cloudflare R2 Integration** (`test_r2.py`) | Verified by Code | Verified boto3 client, bucket listing, presigned PUT/GET generation, and object deletion. |
| **Model Evaluation Script** (`evaluate_models.py`) | Verified by Code | Computes accuracy, precision, recall, and F1 score for DNN/LSTM models. |
| **Unit / Integration Tests** (`pytest`, `jest`) | `NOT IMPLEMENTED` | Automated unit test suites are not currently present in the repository. |

---

# 25. Known Issues

| Issue | Severity | Status | Location | Description |
|---|---|---|---|---|
| **Missing Automated Test Suites** | Medium | `OPEN` | `backend/tests/`, `frontend/tests/` | No automated unit or integration tests exist; testing relies on manual verification and build compilation. |
| **Comments System Not Implemented** | Low | `OPEN` | `backend/database/schema.sql` | `comments` table exists in DB schema, but no backend endpoints or UI components exist. |
| **Lip Reading UI Simulation** | Low | `OPEN` | `frontend/src/pages/LipReadingSupport.jsx` | Frontend page uses timer-based simulation instead of wiring to `POST /recognize-lip`. |
| **Frontend Bundle Size Warning** | Low | `OPEN` | `frontend/dist/assets/index-*.js` | Production bundle is ~1.08 MB. Rollup recommends dynamic `import()` code-splitting. |

---

# 26. Technical Debt

1. **Legacy Video Routes:** `video_processing.py` contains redundant legacy endpoints (`/teacher/videos`, `/student/videos`, `/courses/<id>/videos`) that duplicate `/videos` with query parameters.
2. **Dual Avatar Implementations:** The system maintains both an OpenCV frame-burned stick figure avatar (`avatar_renderer.py`) and an animated SVG avatar (`SignAvatarOverlay.jsx`), consuming dual maintenance effort.
3. **Database Schema Dual Files:** Two separate schema files exist (`schema.sql` and `schema_supabase.sql`) that must be kept manually synchronized.
4. **Heavy Single File Components:** `TeacherDashboard.jsx` (2,096 lines) and `VirtualClassroom.jsx` (1,766 lines) contain multiple sub-views that should be refactored into modular subcomponents.

---

# 27. Future Improvements

1. **Automated Unit & End-to-End Tests:** Introduce `pytest` for backend API testing and `vitest` / Playwright for frontend UI integration testing.
2. **Real Lip-Reading Integration:** Connect `LipReadingSupport.jsx` to the backend `/recognize-lip` endpoint with live canvas frame streaming.
3. **Interactive Lecture Comments:** Implement CRUD endpoints and a real-time discussion thread component for lecture videos.
4. **Three.js 3D Avatar Rendering:** Upgrade the 2D SVG / OpenCV stick figure avatar to a realistic 3D mesh model with natural skeletal joint deformation.
5. **Vite Code Splitting:** Configure `manualChunks` in `vite.config.js` to split Recharts, PeerJS, and Framer Motion into separate lazy-loaded chunks.

---

# 28. Change History

| Date | Change | Files Modified | Reason / Impact |
|---|---|---|---|
| **2026-09-04** | Master Living PRD Creation | `PROJECT_PRD.md` | Created single source of truth documenting actual implementation based on comprehensive codebase audit. |
| **2026-09-04** | Course Video Catalog & Role Isolation | `backend/routes/video_processing.py` | Allowed teachers to access full course catalog while maintaining management isolation. |
| **2026-09-04** | Teacher Identity & Video Display Fix | `backend/routes/auth.py`, `backend/routes/video_processing.py` | Fixed teacher identity resolution to ensure uploaded videos display on Teacher Dashboard. |
| **2026-09-04** | Cross-DB Compatibility for Live Sessions | `backend/routes/live_session.py` | Replaced `REPLACE INTO` with `DELETE + INSERT` for seamless PostgreSQL and SQLite compatibility. |
| **2026-09-04** | Startup Demo Account Seeding Optimization | `backend/routes/auth.py`, `backend/app.py` | Moved demo account seeding exclusively to startup (`create_app`) to eliminate login latency. |
| **2026-09-04** | Real-Time ISL 3D Landmark Recognition | `backend/routes/accessibility.py`, `frontend/src/components/ISLSignToText.jsx` | Integrated MediaPipe 21 3D landmarks with kinematics analysis and temporal consensus buffer. |
| **2026-09-03** | Cloudflare R2 Direct Upload Integration | `backend/utils/storage.py`, `frontend/src/pages/VideoUpload.jsx` | Implemented presigned PUT URLs for direct browser-to-R2 upload, bypassing container RAM limits. |
| **2026-09-02** | Supabase PostgreSQL Connection Pooling | `backend/database/db.py`, `backend/database/schema_supabase.sql` | Added PostgreSQL driver with connection pooling and query placeholder translation. |

---

# 29. Current Project Status

```text
Frontend:          IMPLEMENTED  (React 18, Vite, Tailwind CSS, Recharts, PeerJS)
Backend:           IMPLEMENTED  (Flask REST API, Gunicorn, Blueprints, Threaded Workers)
Database:          IMPLEMENTED  (Supabase PostgreSQL Primary, SQLite Fallback, 29 Tables)
Video System:      IMPLEMENTED  (Cloudflare R2 Direct Upload, CDN, Processing Pipeline, FFmpeg)
Captions:          IMPLEMENTED  (Whisper STT, VTT/SRT Generation, R2 Storage, Frontend Tracks)
ISL Interpreter:   IMPLEMENTED  (OpenCV Stick Figure Overlay + Synced SVG Avatar)
ISL Sign → Text:   IMPLEMENTED  (MediaPipe 21 3D Landmarks + Kinematics + CNN Classification)
Quiz System:       IMPLEMENTED  (Dynamic Transcript Quizzes, Scoring, Weak Area Diagnosis)
Student Progress:  IMPLEMENTED  (Sequential Lesson Unlocking at 35% Pass Mark)
Teacher Dashboard: IMPLEMENTED  (Overview, Quizzes, Progression, Videos Tabs)
Student Dashboard: IMPLEMENTED  (Metrics, Difficulty Recommendations, Enrolled Lessons)
Comments:          NOT IMPLEMENTED (Table in DB Schema Only; No Endpoints or UI)
Lip Reading:       EXPERIMENTAL (Backend CNN Model Present; Frontend Page Simulated)
Testing:           PARTIAL      (Syntax & Build Verified; Automated Test Suites Missing)
```
