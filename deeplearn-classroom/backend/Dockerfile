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

# Expose the port the app runs on
EXPOSE 5000

# Production Gunicorn config:
# - 1 worker + 4 threads avoids multi-process job state isolation issues
#   (the file-based job state in video_pipeline.py handles thread safety)
# - timeout=600 allows long Whisper transcriptions and frame rendering
# - Worker timeout is separate from request timeout; background threads continue.
# To override, set GUNICORN_CMD_ARGS in the deployment environment.
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "1", \
     "--threads", "4", \
     "--worker-class", "gthread", \
     "--timeout", "600", \
     "--keep-alive", "5", \
     "--log-level", "info", \
     "wsgi:app"]
