FROM python:3.10-slim

# Install system dependencies required for OpenCV and FFmpeg
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Create persistent directories for uploads and job state
# These survive within the container lifecycle but not across deploys.
# For true persistence across deploys, mount a volume or use cloud storage.
RUN mkdir -p /app/uploads/_jobs /app/processed_videos /app/recordings

# ── Port ──────────────────────────────────────────────────────────────────────
# DO NOT hardcode a port. Render (and Railway) inject $PORT at runtime.
# EXPOSE is documentation-only; the actual binding is in CMD below.
EXPOSE 10000

# ── Gunicorn startup ──────────────────────────────────────────────────────────
# IMPORTANT: Use shell form (not exec form) so that $PORT is expanded at
# runtime from Render/Railway's environment variable.
#
# Free-tier tuning (512 MB RAM):
#   - 1 worker + 2 threads  → safe within 512MB
#   - USE_WHISPER=false      → set in Render dashboard (Whisper needs ~1GB)
#   - timeout=120            → reduced from 600 (free tier has CPU limits)
#   - NO --preload           → avoids loading TF/Whisper before fork (OOM risk)
CMD gunicorn \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers 1 \
    --threads 2 \
    --worker-class gthread \
    --timeout 120 \
    --keep-alive 5 \
    --log-level info \
    --access-logfile - \
    --error-logfile - \
    wsgi:app
