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
import threading
import time

# ── Configuration ─────────────────────────────────────────────────────────────

R2_ACCOUNT_ID       = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID    = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY= os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME      = os.environ.get("R2_BUCKET_NAME", "deeplearn-videos")
R2_PUBLIC_URL       = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")

# Determines whether R2 is available (all required vars present)
def _r2_enabled() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY)


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
        import boto3
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",  # R2 uses "auto" region
        )
        return _s3_client


# ── Public API ────────────────────────────────────────────────────────────────

def upload_file(local_path: str, r2_key: str, content_type: str = "video/mp4") -> str:
    """
    Upload a local file to R2 (or keep it local if R2 is not configured).

    Args:
        local_path:   Absolute path to the file on disk.
        r2_key:       Object key in R2 (e.g. "uploads/myvideo.mp4").
        content_type: MIME type for the Content-Type header.

    Returns:
        str: Public URL if R2, or local path if fallback.
    """
    if not _r2_enabled():
        # Local fallback — file stays where it is
        print(f"[Storage] R2 not configured — keeping file locally: {local_path}")
        return local_path

    try:
        client = _get_client()
        extra_args = {
            "ContentType": content_type,
        }
        # If public URL is set, make the object publicly readable
        if R2_PUBLIC_URL:
            extra_args["ACL"] = "public-read"

        client.upload_file(local_path, R2_BUCKET_NAME, r2_key, ExtraArgs=extra_args)
        url = get_public_url(r2_key)
        print(f"[Storage] Uploaded to R2: {r2_key} → {url}")
        return url
    except Exception as e:
        print(f"[Storage] R2 upload failed for {r2_key}: {e} — keeping file locally")
        return local_path


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
        print(f"[Storage] Downloaded from R2: {r2_key} → {local_path}")
        return True
    except Exception as e:
        print(f"[Storage] R2 download failed for {r2_key}: {e}")
        return False


def delete_file(r2_key: str) -> None:
    """Delete an object from R2 (silent on failure)."""
    if not _r2_enabled():
        return
    try:
        client = _get_client()
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        print(f"[Storage] Deleted from R2: {r2_key}")
    except Exception as e:
        print(f"[Storage] R2 delete failed for {r2_key}: {e}")


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
        print(f"[Storage] Could not generate presigned URL for {r2_key}: {e}")
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
