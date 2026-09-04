"""
utils/storage.py — Cloudflare R2 / Local Storage Abstraction
=============================================================
Provides a unified interface for storing and retrieving video files.

When R2 env vars are present  → files are stored in Cloudflare R2
When R2 env vars are absent   → files are stored on local disk (dev fallback)

Cloudflare R2 is S3-compatible, so we use boto3 with a custom endpoint_url.

Required env vars for R2 (set in Render dashboard):
    R2_ACCOUNT_ID        — from Cloudflare dashboard (top-right)
    R2_ACCESS_KEY_ID     — from R2 API Token creation
    R2_SECRET_ACCESS_KEY — from R2 API Token creation
    R2_BUCKET_NAME       — name of your R2 bucket (e.g. "deeplearn-videos")
    R2_PUBLIC_URL        — public bucket URL (e.g. https://pub-xxxx.r2.dev)
                           Leave empty to use presigned URLs instead.
"""

import os
import sys
import traceback
import threading
import time
import mimetypes

# Load .env file in development (ignored in production where env vars are set directly)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed — env vars must be set externally

# ── Configuration ─────────────────────────────────────────────────────────────

R2_ACCOUNT_ID        = os.environ.get("R2_ACCOUNT_ID", "").strip()
R2_ACCESS_KEY_ID     = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
R2_BUCKET_NAME       = os.environ.get("R2_BUCKET_NAME", "deeplearn-videos").strip()
R2_PUBLIC_URL        = os.environ.get("R2_PUBLIC_URL", "").strip().rstrip("/")

# Support full endpoint URL directly (e.g. https://<account>.r2.cloudflarestorage.com)
# If not set, it is constructed from R2_ACCOUNT_ID automatically.
_R2_ENDPOINT = os.environ.get(
    "R2_ENDPOINT_URL",
    f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else "",
).strip()

# ── Startup Diagnostics ──────────────────────────────────────────────────────
# Log which R2 env vars are set/missing so deployment issues are immediately visible.

_REQUIRED_VARS = {
    "R2_ACCOUNT_ID": R2_ACCOUNT_ID,
    "R2_ACCESS_KEY_ID": R2_ACCESS_KEY_ID,
    "R2_SECRET_ACCESS_KEY": R2_SECRET_ACCESS_KEY,
}
_OPTIONAL_VARS = {
    "R2_BUCKET_NAME": R2_BUCKET_NAME,
    "R2_PUBLIC_URL": R2_PUBLIC_URL,
}

_missing_vars = [k for k, v in _REQUIRED_VARS.items() if not v]
_set_vars     = [k for k, v in _REQUIRED_VARS.items() if v]

if _missing_vars:
    print(f"[Storage] [WARNING] R2 DISABLED - missing env vars: {', '.join(_missing_vars)}", flush=True)
    print(f"[Storage]    Set vars: {', '.join(_set_vars) if _set_vars else '(none)'}", flush=True)
    print(f"[Storage]    Videos will be stored on local disk (ephemeral on Render).", flush=True)
else:
    print(f"[Storage] [OK] R2 ENABLED", flush=True)
    print(f"[Storage]    Endpoint   : {_R2_ENDPOINT}", flush=True)
    print(f"[Storage]    Bucket     : {R2_BUCKET_NAME}", flush=True)
    print(f"[Storage]    Account ID : {R2_ACCOUNT_ID[:8]}...{R2_ACCOUNT_ID[-4:] if len(R2_ACCOUNT_ID) > 8 else ''}", flush=True)
    print(f"[Storage]    Access Key : {R2_ACCESS_KEY_ID[:8]}...{R2_ACCESS_KEY_ID[-4:] if len(R2_ACCESS_KEY_ID) > 8 else ''}", flush=True)
    print(f"[Storage]    Public URL : {R2_PUBLIC_URL or '(not set - will use presigned URLs)'}", flush=True)


# Determines whether R2 is available (all required vars present)
def _r2_enabled() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY)


# -- Startup credential verification -------------------------------------------
if _r2_enabled():
    print(f"[Storage] R2 credentials detected - Account={R2_ACCOUNT_ID[:8]}... Bucket={R2_BUCKET_NAME} PublicURL={R2_PUBLIC_URL or '(presigned)'}")
else:
    print("[Storage] R2 credentials NOT configured - using local disk storage (files will be lost on redeploy)")


# ── Lazy boto3 client (created once, reused) ──────────────────────────────────

_s3_client = None
_s3_lock   = threading.Lock()


def _get_client():
    """Return a cached boto3 S3 client pointed at Cloudflare R2."""
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    with _s3_lock:
        if _s3_client is not None:
            return _s3_client
        try:
            import boto3
            from botocore.config import Config

            # Cloudflare R2 config: disable checksums that R2 doesn't support
            r2_config = Config(
                retries={"max_attempts": 3, "mode": "standard"},
                s3={"addressing_style": "path"},
                signature_version="s3v4",
            )

            _s3_client = boto3.client(
                "s3",
                endpoint_url=_R2_ENDPOINT,
                aws_access_key_id=R2_ACCESS_KEY_ID,
                aws_secret_access_key=R2_SECRET_ACCESS_KEY,
                region_name="auto",  # R2 uses "auto" region
                config=r2_config,
            )
            print(f"[R2_CLIENT_INITIALIZED] endpoint={_R2_ENDPOINT} bucket={R2_BUCKET_NAME}", flush=True)
            return _s3_client
        except Exception as e:
            print(f"[R2_CLIENT_INIT_FAILED] error={e}", flush=True)
            print(f"[R2_CLIENT_INIT_FAILED] traceback={traceback.format_exc()}", flush=True)
            raise


def verify_bucket_access() -> bool:
    """
    Lightweight check that R2 credentials work and the bucket exists.
    Call once at startup to surface credential/permission issues early.
    Returns True if the bucket is accessible, False otherwise.
    """
    if not _r2_enabled():
        return False
    try:
        client = _get_client()
        client.head_bucket(Bucket=R2_BUCKET_NAME)
        print(f"[R2_BUCKET_VERIFIED] bucket={R2_BUCKET_NAME} accessible", flush=True)
        return True
    except Exception as e:
        _log_r2_error("R2_BUCKET_VERIFY_FAILED", e, bucket=R2_BUCKET_NAME)
        return False


# ── Error Logging Helper ─────────────────────────────────────────────────────

def _log_r2_error(tag: str, error: Exception, **context):
    """
    Log a comprehensive R2 error with all diagnostic information.
    """
    error_info = {
        "tag": tag,
        "error_message": str(error),
        "error_type": type(error).__name__,
    }

    # Extract AWS/botocore-specific error details
    try:
        from botocore.exceptions import ClientError, BotoCoreError
        if isinstance(error, ClientError):
            resp = error.response or {}
            error_info["aws_error_code"] = resp.get("Error", {}).get("Code", "unknown")
            error_info["aws_error_message"] = resp.get("Error", {}).get("Message", "unknown")
            error_info["http_status_code"] = resp.get("ResponseMetadata", {}).get("HTTPStatusCode", "unknown")
            error_info["request_id"] = resp.get("ResponseMetadata", {}).get("RequestId", "unknown")
            error_info["r2_response"] = resp.get("Error", {})
        elif isinstance(error, BotoCoreError):
            error_info["aws_error_code"] = "BotoCoreError"
    except ImportError:
        pass

    # Add context
    error_info.update(context)

    # Add missing env var diagnostics
    if _missing_vars:
        error_info["missing_env_vars"] = _missing_vars

    # Log everything
    print(f"[{tag}] {error_info}", flush=True)
    print(f"[{tag}] stack_trace={traceback.format_exc()}", flush=True)


# ── Content Type Detection ────────────────────────────────────────────────────

def _detect_content_type(filename: str, default: str = "application/octet-stream") -> str:
    """Detect MIME type from filename extension."""
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or default


# ── Upload Verification ───────────────────────────────────────────────────────

def verify_upload(r2_key: str) -> bool:
    """
    Verify an object exists in R2 by calling head_object.
    Returns True if the object is confirmed present.
    """
    if not _r2_enabled():
        return False
    try:
        client = _get_client()
        resp = client.head_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        size = resp.get("ContentLength", 0)
        print(f"[R2_VERIFY_SUCCESS] key={r2_key} size={size}", flush=True)
        return size > 0
    except Exception as e:
        print(f"[R2_VERIFY_FAILED] key={r2_key} error={e}", flush=True)
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def upload_file(local_path: str, r2_key: str, content_type: str = None, max_retries: int = 3) -> str:
    """
    Upload a local file to R2 with retry logic and verification.

    Args:
        local_path:   Absolute path to the file on disk.
        r2_key:       Object key in R2 (e.g. "uploads/myvideo.mp4").
        content_type: MIME type for the Content-Type header.
                      If None, auto-detected from the file extension.
        max_retries:  Number of upload attempts before giving up.

    Returns:
        str: Public URL if R2, or local path if fallback.
    """
    if not _r2_enabled():
        print(f"[Storage] R2 not configured - keeping file locally: {local_path}", flush=True)
        if _missing_vars:
            print(f"[Storage] Missing env vars: {', '.join(_missing_vars)}", flush=True)
        return local_path

    if not content_type:
        content_type = _detect_content_type(r2_key, default="video/mp4")

    if not os.path.exists(local_path):
        print(f"[R2_UPLOAD_FAILED] File does not exist: {local_path}", flush=True)
        return local_path

    file_size = os.path.getsize(local_path)
    if file_size == 0:
        print(f"[R2_UPLOAD_FAILED] File is empty (0 bytes): {local_path}", flush=True)
        return local_path

    print(f"[R2_UPLOAD_STARTED] key={r2_key} content_type={content_type} size={file_size} source={local_path}", flush=True)

    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            client = _get_client()
            extra_args = {"ContentType": content_type}
            client.upload_file(local_path, R2_BUCKET_NAME, r2_key, ExtraArgs=extra_args)

            # Verify the upload actually landed in R2
            if verify_upload(r2_key):
                url = get_public_url(r2_key)
                print(f"[R2_UPLOAD_SUCCESS] key={r2_key} url={url} size={file_size} attempt={attempt}", flush=True)
                return url
            else:
                print(f"[R2_UPLOAD_VERIFY_FAILED] key={r2_key} attempt={attempt}/{max_retries}", flush=True)
                last_error = Exception("Upload verification failed")
        except Exception as e:
            last_error = e
            print(f"[R2_UPLOAD_RETRY] key={r2_key} attempt={attempt}/{max_retries} error={e}", flush=True)
            if attempt < max_retries:
                time.sleep(1 * attempt)  # Exponential backoff

    _log_r2_error("R2_UPLOAD_FAILED", last_error, key=r2_key, local_path=local_path, content_type=content_type, file_size=file_size)
    return local_path


def upload_fileobj(file_obj, r2_key: str, content_type: str = "video/mp4") -> str:
    """
    Upload a file-like object directly to R2 (avoids temp file on disk).

    Args:
        file_obj:     A file-like object (e.g. request.files['video_file']).
        r2_key:       Object key in R2.
        content_type: MIME type.

    Returns:
        str: Public URL if R2, or empty string on failure.
    """
    if not _r2_enabled():
        print(f"[Storage] R2 not configured — cannot upload file object", flush=True)
        return ""

    print(f"[R2_UPLOAD_STARTED] key={r2_key} content_type={content_type} source=fileobj", flush=True)

    try:
        client = _get_client()
        extra_args = {
            "ContentType": content_type,
        }
        client.upload_fileobj(file_obj, R2_BUCKET_NAME, r2_key, ExtraArgs=extra_args)
        url = get_public_url(r2_key)
        print(f"[R2_UPLOAD_SUCCESS] key={r2_key} url={url}", flush=True)
        return url
    except Exception as e:
        _log_r2_error("R2_UPLOAD_FAILED", e, key=r2_key, content_type=content_type)
        return ""


def download_file(r2_key: str, local_path: str) -> bool:
    """
    Download a file from R2 to a local path.

    Returns:
        bool: True on success, False on failure.
    """
    if not _r2_enabled():
        # In local mode the file is already on disk — nothing to download
        return os.path.exists(local_path)

    try:
        client = _get_client()
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        client.download_file(R2_BUCKET_NAME, r2_key, local_path)
        print(f"[Storage] Downloaded from R2: {r2_key} -> {local_path}", flush=True)
        return True
    except Exception as e:
        _log_r2_error("R2_DOWNLOAD_FAILED", e, key=r2_key, local_path=local_path)
        return False


def read_r2_text(r2_key: str) -> str:
    """Read a text/vtt/json object directly from R2 as a UTF-8 string."""
    if not _r2_enabled():
        return ""
    try:
        client = _get_client()
        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        return resp["Body"].read().decode("utf-8")
    except Exception as e:
        _log_r2_error("R2_READ_TEXT_FAILED", e, key=r2_key)
        return ""


def delete_file(r2_key: str) -> None:
    """Delete an object from R2 (silent on failure)."""
    if not _r2_enabled():
        return
    try:
        client = _get_client()
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        print(f"[Storage] Deleted from R2: {r2_key}", flush=True)
    except Exception as e:
        _log_r2_error("R2_DELETE_FAILED", e, key=r2_key)


def get_public_url(r2_key: str) -> str:
    """
    Return the public URL for an R2 object.

    If R2_PUBLIC_URL is set → uses it directly (fastest, no expiry).
    Otherwise              → generates a 7-day presigned URL.
    If R2 is not enabled   → returns the key as-is (used as local path).
    """
    if not _r2_enabled():
        return r2_key  # local path

    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL}/{r2_key}"

    # Presigned URL (7 days)
    try:
        client = _get_client()
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET_NAME, "Key": r2_key},
            ExpiresIn=7 * 24 * 3600,  # 7 days
        )
        return url
    except Exception as e:
        _log_r2_error("R2_PRESIGN_FAILED", e, key=r2_key)
        return r2_key


def is_r2_url(path_or_url: str) -> bool:
    """Return True if the given string is an R2 URL (not a local path)."""
    return path_or_url.startswith("http://") or path_or_url.startswith("https://")


def make_r2_key(prefix: str, filename: str) -> str:
    """
    Build a namespaced R2 object key (flat structure — backward compat).
    Example: make_r2_key("uploads", "lecture.mp4") → "uploads/lecture.mp4"
    """
    return f"{prefix}/{filename}".lstrip("/")


def make_structured_r2_key(prefix: str, course_id: int, video_id: int, filename: str) -> str:
    """
    Build a structured R2 object key with course/video hierarchy (new uploads).
    Example: make_structured_r2_key("original", 1, 42, "lecture.mp4")
             → "original/1/42/original.mp4"
    """
    ext = os.path.splitext(filename)[1].lower() or ".mp4"
    return f"{prefix}/{course_id}/{video_id}/original{ext}"


def generate_presigned_upload_url(r2_key: str, content_type: str = "video/mp4", expires_in: int = 3600) -> str:
    """
    Generate a presigned PUT URL for direct browser-to-R2 upload.

    The browser will use this URL to upload the file directly to Cloudflare R2,
    bypassing the backend server. R2 secret keys never leave the backend.

    Args:
        r2_key:       Object key in R2 (e.g. "original/1/42/original.mp4")
        content_type: MIME type for the upload
        expires_in:   URL validity in seconds (default 1 hour)

    Returns:
        str: Presigned PUT URL, or empty string if R2 is not enabled.
    """
    if not _r2_enabled():
        return ""
    try:
        client = _get_client()
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": R2_BUCKET_NAME,
                "Key": r2_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
        print(f"[R2_PRESIGNED_UPLOAD_URL] key={r2_key} expires_in={expires_in}s", flush=True)
        return url
    except Exception as e:
        _log_r2_error("R2_PRESIGNED_UPLOAD_FAILED", e, key=r2_key)
        return ""


def download_from_r2(r2_key: str, local_path: str) -> bool:
    """
    Download an R2 object to a local file path.
    Used to pull uploaded videos from R2 to the local temp dir for pipeline processing.

    Returns True if download succeeded, False otherwise.
    """
    if not _r2_enabled():
        return False
    try:
        client = _get_client()
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        client.download_file(R2_BUCKET_NAME, r2_key, local_path)
        size = os.path.getsize(local_path) if os.path.exists(local_path) else 0
        print(f"[R2_DOWNLOAD_SUCCESS] key={r2_key} local={local_path} size={size}", flush=True)
        return size > 0
    except Exception as e:
        _log_r2_error("R2_DOWNLOAD_FAILED", e, key=r2_key, local_path=local_path)
        return False


def get_r2_diagnostics() -> dict:
    """
    Return a diagnostic dict for health-check endpoints.
    """
    return {
        "r2_enabled": _r2_enabled(),
        "endpoint": _R2_ENDPOINT if _r2_enabled() else None,
        "bucket": R2_BUCKET_NAME if _r2_enabled() else None,
        "public_url": R2_PUBLIC_URL or None,
        "missing_env_vars": _missing_vars if _missing_vars else None,
        "account_id_set": bool(R2_ACCOUNT_ID),
        "access_key_set": bool(R2_ACCESS_KEY_ID),
        "secret_key_set": bool(R2_SECRET_ACCESS_KEY),
    }


def verify_bucket_access() -> bool:
    """
    Verify that we can successfully connect to and list the R2 bucket.
    Used by the /health endpoint for production monitoring.
    Returns True if bucket is accessible, False otherwise.
    """
    if not _r2_enabled():
        return False
    try:
        client = _get_client()
        # HeadBucket is the lightest S3 API call — just checks access
        client.head_bucket(Bucket=R2_BUCKET_NAME)
        return True
    except Exception as e:
        print(f"[Storage] verify_bucket_access failed: {e}", flush=True)
        return False


def list_bucket_videos() -> list:
    """
    List all video objects in R2 bucket (uploads/, processed/, captions/, thumbnails/).
    Returns list of dicts: [{key, size, last_modified}, ...]
    Used by TeacherDashboard to show storage status.
    """
    if not _r2_enabled():
        return []
    try:
        client = _get_client()
        videos = []
        for prefix in ["uploads/", "processed/", "captions/", "thumbnails/"]:
            response = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix=prefix)
            for obj in response.get("Contents", []):
                key = obj.get("Key", "")
                if not key or key.endswith("/"):
                    continue
                filename = os.path.basename(key)
                videos.append({
                    "key": key,
                    "filename": filename,
                    "size": obj.get("Size", 0),
                    "last_modified": obj.get("LastModified", "").isoformat() if hasattr(obj.get("LastModified", ""), "isoformat") else str(obj.get("LastModified", "")),
                    "url": get_public_url(key),
                    "prefix": prefix.rstrip("/"),
                })
        return videos
    except Exception as e:
        print(f"[Storage] list_bucket_videos failed: {e}", flush=True)
        return []


def sync_r2_objects_to_db(conn, timeout_seconds: int = 10) -> int:
    """
    Scans Cloudflare R2 bucket and auto-populates database video records
    for any files that exist in R2 but are missing from DB.

    Scans these prefixes:
      - uploads/          (flat legacy structure)
      - original/         (new hierarchical structure: original/{courseId}/{videoId}/original.mp4)
      - processed/        (legacy ISL videos)
      - isl/              (new ISL structure: isl/{videoId}/isl-video.mp4)

    Returns the count of new videos synced.
    Has a timeout to prevent blocking the request cycle.
    Idempotent: safe to run multiple times without creating duplicates.
    """
    if not _r2_enabled():
        return 0

    start_time = time.time()

    try:
        client = _get_client()
        synced_count = 0
        import json
        cursor = conn.cursor()

        # ── Scan uploads/ (legacy flat structure) ──
        response = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix="uploads/")
        contents = response.get("Contents", [])

        for obj in contents:
            if time.time() - start_time > timeout_seconds:
                print(f"[Storage] R2 sync timeout after {timeout_seconds}s, synced {synced_count} so far.", flush=True)
                break

            key = obj.get("Key", "")
            if not key or key.endswith("/"):
                continue

            filename = os.path.basename(key)
            if not filename or not any(filename.lower().endswith(ext) for ext in (".mp4", ".mov", ".avi", ".webm", ".mkv")):
                continue

            # Idempotency: check by filename, r2_key, or r2_url
            cursor.execute(
                "SELECT video_id, r2_key FROM videos WHERE filename = ? OR r2_key = ? OR r2_url LIKE ?",
                (filename, key, f"%{filename}%")
            )
            existing_row = cursor.fetchone()
            if existing_row:
                # Backfill missing r2_key on existing records
                if not existing_row[1]:
                    cursor.execute(
                        "UPDATE videos SET r2_key = ?, upload_status = 'uploaded' WHERE video_id = ?",
                        (key, existing_row[0])
                    )
                continue


            orig_url = get_public_url(key)
            file_size = obj.get("Size", 0)

            # Check for corresponding processed/signed_ version
            processed_key = f"processed/signed_{filename}"
            processed_url = orig_url
            has_isl = False
            try:
                client.head_object(Bucket=R2_BUCKET_NAME, Key=processed_key)
                processed_url = get_public_url(processed_key)
                has_isl = True
            except Exception:
                pass

            title_clean = filename.replace("_", " ").replace(".mp4", "").replace(".mov", "").replace(".avi", "").replace(".webm", "")

            cursor.execute("""
                INSERT INTO videos (
                    teacher_id, course_id, title, filename, original_url, processed_url, r2_url, r2_key,
                    status, upload_status, processing_status, video_type, description, visibility, file_size,
                    caption_status, signing_status
                ) VALUES (
                    1, 1, ?, ?, ?, ?, ?, ?,
                    'done', 'uploaded', 'completed', 'original', 'Cloudflare R2 synced video lesson.', 'Published', ?,
                    'available', ?
                )
            """, (title_clean, filename, orig_url, processed_url, orig_url, key, file_size,
                  'available' if has_isl else 'pending'))
            orig_id = cursor.lastrowid
            synced_count += 1

            if has_isl:
                isl_title = f"[AI Deaf Signing] {title_clean}"
                isl_filename = f"signed_{filename}"
                cursor.execute("""
                    INSERT INTO videos (
                        teacher_id, course_id, title, filename, original_url, processed_url, r2_url, r2_key,
                        status, upload_status, processing_status, original_video_id, video_type,
                        description, visibility, captions_url, caption_status, signing_status
                    ) VALUES (
                        1, 1, ?, ?, ?, ?, ?, ?,
                        'done', 'uploaded', 'completed', ?, 'ISL',
                        'Cloudflare R2 synced AI ISL video.', 'Published', ?, 'available', 'available'
                    )
                """, (isl_title, isl_filename, orig_url, processed_url, processed_url, processed_key,
                      orig_id, f"/video-captions?video_id={orig_id + 1}"))
                synced_count += 1

            # Check if real captions exist in R2 under captions/{orig_id}/transcript.json
            cap_synced = False
            transcript_raw = read_r2_text(f"captions/{orig_id}/transcript.json")
            if transcript_raw:
                try:
                    loaded_caps = json.loads(transcript_raw)
                    if isinstance(loaded_caps, list) and len(loaded_caps) > 0:
                        for item in loaded_caps:
                            cursor.execute(
                                "INSERT INTO video_captions (video_id, start_time, end_time, text) VALUES (?, ?, ?, ?)",
                                (orig_id, float(item.get("start", 0)), float(item.get("end", 0)), item.get("text", ""))
                            )
                        cursor.execute(
                            "UPDATE videos SET caption_status = 'available', captions_url = ?, r2_captions_key = ? WHERE video_id = ?",
                            (f"/video-captions?video_id={orig_id}", f"captions/{orig_id}/captions.vtt", orig_id)
                        )
                        cap_synced = True
                except Exception:
                    pass
            if not cap_synced:
                cursor.execute("UPDATE videos SET caption_status = 'pending' WHERE video_id = ?", (orig_id,))

        # ── Scan original/ (new hierarchical structure) ──
        response2 = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix="original/")
        for obj in response2.get("Contents", []):
            if time.time() - start_time > timeout_seconds:
                break
            key = obj.get("Key", "")
            if not key or key.endswith("/"):
                continue
            if not any(key.lower().endswith(ext) for ext in (".mp4", ".mov", ".avi", ".webm", ".mkv")):
                continue

            # Idempotency: check by r2_key
            cursor.execute("SELECT video_id FROM videos WHERE r2_key = ?", (key,))
            if cursor.fetchone():
                continue

            # Parse courseId/videoId from key: original/{courseId}/{videoId}/original.mp4
            parts = key.split("/")
            if len(parts) >= 4:
                try:
                    course_id = int(parts[1])
                    # video_id is already in DB if this was created via presigned upload
                    # Skip if we can't determine — the confirm-upload flow handles this
                except ValueError:
                    pass
            # If we can't parse the structure, just log and skip
            print(f"[R2_SYNC] Found new-structure object {key}, skipping auto-insert (managed by confirm-upload flow)", flush=True)

        conn.commit()
        elapsed = round(time.time() - start_time, 2)
        if synced_count > 0:
            print(f"[R2_SYNC_COMPLETE] synced={synced_count} elapsed={elapsed}s", flush=True)
        return synced_count

    except Exception as e:
        print(f"[R2_SYNC_FAILED] error={e}", flush=True)
        return 0
