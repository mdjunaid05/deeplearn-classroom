# DeepLearn Smart Virtual Classroom System — Deaf & Hearing-Impaired Edition

A Deep Learning–Based Adaptive Virtual Classroom platform with real-time behaviour monitoring and engagement detection. This project uses three specialized TensorFlow/Keras neural networks to create a highly adaptive and personalized learning environment.

## 🧠 Project Overview

The DeepLearn system uses AI to analyze how students interact with the platform and adjusts the educational content accordingly. 

Key AI components:
1. **Adaptive Learning Model**: Predicts the optimal difficulty level (Easy/Medium/Hard) based on past performance and interaction metrics.
2. **Behaviour Classification Model**: An LSTM network that analyzes sequences of interactions (clicks, chat, idle time) to classify student behaviour (Active/Passive/Distracted).
3. **Engagement Detection Model**: A Deep Neural Network that processes session data to determine overall engagement levels (High/Medium/Low).
4. **Sign Language Recognition Model**: A CNN+LSTM model utilizing MediaPipe hand landmarks to classify 10 key ASL gestures in real-time.
5. **Lip Reading Model**: A CNN model predicting lip state (Speaking/Silent/Mouthing/Laughing/Neutral) from grayscale facial crops.
6. **Sign Language Avatar Overlay Model**: Maps extracted text to ASL gesture landmarks and renders an avatar overlay on videos.

## ♿ Accessibility Features
- **High Contrast Dark Theme**: Designed with a minimum 4.5:1 contrast ratio.
- **Visual Alert System**: Non-auditory, color-coded flashing banners for notifications.
- **Live Caption Overlay**: High contrast (white-on-black) real-time captions synced with activities.
- **Sign Language Input**: Live ASL gesture recognition via webcam.
- **Lip Reading Support**: Verifies engagement visually without requiring audio.
- **Text-Only Chat**: Removing auditory barriers to communication.
- **Accessible UI**: ARIA labels, tab indexing, and 16px minimum font size across all components.

## 🤟 Supported Sign Gestures
- Hello, Yes, No, Help, Understand, Repeat, Stop, Good, Bad, Question.

The backend is built with Flask and MySQL, serving predictions and analytics to a modern, glassmorphic React frontend built with Vite, Tailwind CSS, and Recharts.

---

## 📁 Full File Structure

```text
deeplearn-classroom/
├── backend/
│   ├── app.py                   # Flask main app & API entry point
│   ├── requirements.txt         # Python dependencies
│   ├── models/
│   │   ├── adaptive_model.py    # Adaptive learning DNN architecture
│   │   ├── behaviour_model.py   # Behaviour classification LSTM architecture
│   │   ├── engagement_model.py  # Engagement detection DNN architecture
│   │   └── model_loader.py      # Inference helper (loads .h5 models & scalers)
│   ├── routes/
│   │   ├── predict.py           # Routes: /predict-difficulty, /predict-engagement
│   │   ├── behaviour.py         # Routes: /log-behaviour
│   │   └── dashboard.py         # Routes: /student-dashboard, /teacher-dashboard
│   ├── training/
│   │   ├── generate_dataset.py  # Synthetic dataset generator (250 rows)
│   │   ├── train_adaptive.py    # Train & save adaptive model
│   │   ├── train_behaviour.py   # Train & save behaviour LSTM
│   │   ├── train_engagement.py  # Train & save engagement model
│   │   └── evaluate_models.py   # Computes accuracy, F1, and confusion matrices
│   ├── database/
│   │   ├── schema.sql           # MySQL schema (7 tables)
│   │   └── db.py                # Database connection helper (MySQL + SQLite fallback)
│   ├── data/
│   │   └── student_activity.csv # Generated dataset (created via generate_dataset.py)
│   └── saved_models/            # Generated .h5 models and .pkl scalers
│
├── frontend/
│   ├── package.json             # NPM dependencies & scripts
│   ├── tailwind.config.js       # Tailwind theme (colors, fonts, animations)
│   ├── postcss.config.js        # PostCSS configuration
│   ├── vite.config.js           # Vite config & API proxy
│   ├── index.html               # Entry HTML
│   └── src/
│       ├── main.jsx             # React entry point
│       ├── App.jsx              # React Router setup
│       ├── index.css            # Global CSS (glassmorphism, gradients)
│       ├── pages/
│       │   ├── Landing.jsx            # Hero page with model overview
│       │   ├── Login.jsx              # Role-based login (demo)
│       │   ├── StudentDashboard.jsx   # Individual metrics & recommendations
│       │   ├── TeacherDashboard.jsx   # Aggregate analytics & student table
│       │   ├── VirtualClassroom.jsx   # Live session, video, quiz, & behaviour sidebar
│       │   ├── BehaviourMonitor.jsx   # Behaviour alerts and LSTM timeline
│       │   └── EngagementAnalytics.jsx# Long-term trends & time-of-day heatmap
│       └── components/
│           ├── Navbar.jsx             # Main navigation
│           ├── EngagementChart.jsx    # Recharts (Line, Area, Gauge)
│           ├── BehaviourChart.jsx     # Recharts (Bar, Pie, Timeline)
│           └── ProgressBar.jsx        # Animated gradient progress bars
│
└── README.md                    # Project documentation
```

---

## ⚙️ Setup Instructions

### 1. Backend Setup

Open a terminal and navigate to the `backend` directory.

**Create Virtual Environment & Install Dependencies:**
```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
pip install mediapipe==0.10.9 opencv-python>=4.8.0 moviepy openai-whisper SpeechRecognition Pillow ffmpeg-python
```

### Video Pipeline Setup
- Install `ffmpeg` system dependency and ensure it is in your system PATH.
- The Whisper model will be downloaded automatically on first run via `whisper.load_model("base")`.
- Processing time estimate: ~2x video duration on CPU.
- Supported formats: MP4, AVI, MOV.

**Full pipeline flow in plain terms:**
Teacher uploads MP4
        ↓
Audio extracted (moviepy)
        ↓
Speech → Text (Whisper)
        ↓
Text split into words/sentences
        ↓
Each word → sign gesture lookup
        ↓
Gesture rendered as avatar on frames (OpenCV)
        ↓
Frames recompiled into video (ffmpeg)
        ↓
Student downloads/watches signed video

**Generate Dataset:**
```bash
python training/generate_dataset.py
```
*(This creates `backend/data/student_activity.csv` with 250 rows).*

**Train Models:**
You must train all three models to generate the `.h5` and `.pkl` files required by the API.
```bash
python training/train_adaptive.py
python training/train_behaviour.py
python training/train_engagement.py
```

*(Optional) Evaluate Models:*
```bash
python training/evaluate_models.py
```
*(This prints Accuracy, Precision, Recall, F1 and saves confusion matrix PNGs to `saved_models/`)*

**Run Flask App:**
```bash
python app.py
```
*(The API will start on `http://localhost:5000`)*

### 2. Frontend Setup

Open a new terminal and navigate to the `frontend` directory.

**Install Dependencies:**
```bash
cd frontend
npm install
```

**Run Development Server:**
```bash
npm run dev
```
*(The React app will start on `http://localhost:3000`. The Vite config automatically proxies `/api` requests to the Flask backend).*

---

## 🔌 API Usage Examples

You can test the machine learning API endpoints using `curl` while the Flask server is running.

**1. Predict Difficulty:**
```bash
curl -X POST http://localhost:5000/predict-difficulty \
-H "Content-Type: application/json" \
-d '{"quiz_score": 85.0, "time_taken": 120.0, "attempt_count": 1, "completion_rate": 0.9, "prev_score": 80.0}'
```

**2. Predict Engagement:**
```bash
curl -X POST http://localhost:5000/predict-engagement \
-H "Content-Type: application/json" \
-d '{"response_freq": 1.2, "participation_count": 15, "activity_completion": 0.8, "idle_time": 5.0, "session_time": 45.0, "quiz_score": 75.0}'
```

**3. Log Sequence Behaviour (LSTM):**
```bash
curl -X POST http://localhost:5000/log-behaviour \
-H "Content-Type: application/json" \
-d '{
  "student_id": 1001,
  "sequence": [
    {"click_freq": 2.5, "response_speed": 1.5, "chat_count": 2, "idle_time": 1.0},
    {"click_freq": 2.1, "response_speed": 1.8, "chat_count": 1, "idle_time": 2.0},
    {"click_freq": 1.5, "response_speed": 2.0, "chat_count": 0, "idle_time": 5.0},
    {"click_freq": 0.5, "response_speed": 4.0, "chat_count": 0, "idle_time": 15.0},
    {"click_freq": 0.2, "response_speed": 5.0, "chat_count": 0, "idle_time": 20.0},
    {"click_freq": 0.1, "response_speed": 5.5, "chat_count": 0, "idle_time": 25.0},
    {"click_freq": 0.1, "response_speed": 6.0, "chat_count": 0, "idle_time": 30.0},
    {"click_freq": 0.0, "response_speed": 0.0, "chat_count": 0, "idle_time": 45.0},
    {"click_freq": 0.0, "response_speed": 0.0, "chat_count": 0, "idle_time": 50.0},
    {"click_freq": 0.0, "response_speed": 0.0, "chat_count": 0, "idle_time": 60.0}
  ]
}'
```

---

## 🚀 Deployment Guide

### Backend (Render)
1. Commit the code to GitHub.
2. In Render, create a new **Web Service**.
3. Connect your repository.
4. Settings:
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt && python training/generate_dataset.py && python training/train_adaptive.py && python training/train_behaviour.py && python training/train_engagement.py`
   - **Start Command:** `gunicorn app:create_app()`
5. Add Environment Variables:
   - `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` (If using external MySQL)
   - Or omit them to use the SQLite fallback.

### Frontend (Vercel)
1. Create a new project in Vercel.
2. Connect your repository.
3. Configure the **Framework Preset** as `Vite`.
4. Set the **Root Directory** to `frontend`.
5. Add an Environment Variable:
   - `VITE_API_URL` = `<YOUR_RENDER_BACKEND_URL>`
6. Deploy.

---

## 📊 Model Architecture Summary

| Model | Type | Architecture | Input Features | Output Classes | Loss |
|-------|------|--------------|----------------|----------------|------|
| **Adaptive Learning** | Feedforward DNN | `Dense(64) → Dense(32) → Dense(3, Softmax)` | 5 (quiz_score, time_taken, attempt_count, completion_rate, prev_score) | 3 (Easy, Medium, Hard) | Categorical Crossentropy |
| **Behaviour Monitoring** | Recurrent (LSTM) | `LSTM(64) → Dense(32) → Dense(3, Softmax)` | Sequence `(10, 4)` (click_freq, response_speed, chat_count, idle_time) | 3 (Active, Passive, Distracted) | Categorical Crossentropy |
| **Engagement Detection**| Deep Neural Network | `Dense(128) → Dropout(0.3) → Dense(64) → Dense(3, Softmax)` | 6 (response_freq, participation_count, activity_completion, idle_time, session_time, quiz_score) | 3 (High, Medium, Low) | Categorical Crossentropy |
| **Sign Language Recognition** | CNN + LSTM | `TimeDistributed(Dense(128)) → LSTM(64) → LSTM(32) → Dense(10, Softmax)` | Sequence `(30, 63)` (MediaPipe hand landmarks) | 10 (ASL Gestures) | Categorical Crossentropy |
| **Lip Reading** | CNN | `Conv2D(32) → Pool → Conv2D(64) → Pool → Dense(128) → Dense(5, Softmax)` | Image `(64, 64, 1)` (Grayscale lip crop) | 5 (Lip states) | Categorical Crossentropy |
