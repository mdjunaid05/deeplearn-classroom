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


# ── Public API ────────────────────────────────────────────────────────────────

def upload_file(local_path: str, r2_key: str, content_type: str = None) -> str:
    """
    Upload a local file to R2 (or keep it local if R2 is not configured).

    Args:
        local_path:   Absolute path to the file on disk.
        r2_key:       Object key in R2 (e.g. "uploads/myvideo.mp4").
        content_type: MIME type for the Content-Type header.
                      If None, auto-detected from the file extension.

    Returns:
        str: Public URL if R2, or local path if fallback.
    """
    if not _r2_enabled():
        # Local fallback — file stays where it is
        print(f"[Storage] R2 not configured - keeping file locally: {local_path}", flush=True)
        if _missing_vars:
            print(f"[Storage] Missing env vars: {', '.join(_missing_vars)}", flush=True)
        return local_path

    # Auto-detect content type if not provided
    if not content_type:
        content_type = _detect_content_type(r2_key, default="video/mp4")

    # Validate the file exists and is non-empty
    if not os.path.exists(local_path):
        print(f"[R2_UPLOAD_FAILED] File does not exist: {local_path}", flush=True)
        return local_path

    file_size = os.path.getsize(local_path)
    if file_size == 0:
        print(f"[R2_UPLOAD_FAILED] File is empty (0 bytes): {local_path}", flush=True)
        return local_path

    print(f"[R2_UPLOAD_STARTED] key={r2_key} content_type={content_type} size={file_size} source={local_path}", flush=True)

    try:
        client = _get_client()

        # ─── IMPORTANT ───────────────────────────────────────────────────
        # Cloudflare R2 does NOT support S3-style ACLs (public-read, etc).
        # Sending ACL will cause a "NotImplemented" error.
        # Public access is configured at the bucket level in Cloudflare dashboard.
        # ─────────────────────────────────────────────────────────────────
        extra_args = {
            "ContentType": content_type,
        }

        client.upload_file(local_path, R2_BUCKET_NAME, r2_key, ExtraArgs=extra_args)

        url = get_public_url(r2_key)
        print(f"[R2_UPLOAD_SUCCESS] key={r2_key} url={url} size={file_size}", flush=True)
        return url

    except Exception as e:
        _log_r2_error("R2_UPLOAD_FAILED", e, key=r2_key, local_path=local_path, content_type=content_type, file_size=file_size)
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
    Build a namespaced R2 object key.
    Example: make_r2_key("uploads", "lecture.mp4") → "uploads/lecture.mp4"
    """
    return f"{prefix}/{filename}".lstrip("/")


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
