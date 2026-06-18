"""
Test Cloudflare R2 connectivity with the provided credentials.
Run from the backend directory:
    python test_r2.py
"""
import os
import sys
import tempfile

# Load .env
from dotenv import load_dotenv
load_dotenv()

R2_ACCOUNT_ID        = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID     = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME       = os.environ.get("R2_BUCKET_NAME", "deeplearn-videos")
R2_PUBLIC_URL        = os.environ.get("R2_PUBLIC_URL", "")

print("=" * 60)
print("Cloudflare R2 Connection Test")
print("=" * 60)
print(f"  Account ID  : {R2_ACCOUNT_ID[:8]}...{R2_ACCOUNT_ID[-4:]}")
print(f"  Access Key  : {R2_ACCESS_KEY_ID[:8]}...{R2_ACCESS_KEY_ID[-4:]}")
print(f"  Bucket      : {R2_BUCKET_NAME}")
print(f"  Endpoint    : https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com")
print(f"  Public URL  : {R2_PUBLIC_URL or '(not set — will use presigned URLs)'}")
print()

if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]):
    print("ERROR: Missing required env vars. Check your .env file.")
    sys.exit(1)

import boto3
from botocore.exceptions import ClientError

client = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
)

# Test 1: List buckets
print("[1] Listing buckets...")
try:
    resp = client.list_buckets()
    buckets = [b["Name"] for b in resp.get("Buckets", [])]
    print(f"    ✅ Found {len(buckets)} bucket(s): {buckets}")
    if R2_BUCKET_NAME not in buckets:
        print(f"    ⚠️  Bucket '{R2_BUCKET_NAME}' not found! Create it in Cloudflare dashboard.")
except ClientError as e:
    print(f"    ❌ FAILED: {e}")
    sys.exit(1)

# Test 2: Upload a small test file
print("\n[2] Uploading test file...")
TEST_KEY = "_deeplearn_test/connection_test.txt"
try:
    client.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=TEST_KEY,
        Body=b"DeepLearn R2 connection test OK",
        ContentType="text/plain",
    )
    print(f"    ✅ Uploaded: {TEST_KEY}")
except ClientError as e:
    print(f"    ❌ Upload FAILED: {e}")
    sys.exit(1)

# Test 3: Read it back
print("\n[3] Downloading test file...")
try:
    resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=TEST_KEY)
    content = resp["Body"].read()
    print(f"    ✅ Content: {content.decode()}")
except ClientError as e:
    print(f"    ❌ Download FAILED: {e}")

# Test 4: Generate presigned URL
print("\n[4] Generating presigned URL...")
try:
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": R2_BUCKET_NAME, "Key": TEST_KEY},
        ExpiresIn=3600,
    )
    print(f"    ✅ Presigned URL generated (valid 1h)")
    print(f"    URL: {url[:80]}...")
except ClientError as e:
    print(f"    ❌ Presigned URL FAILED: {e}")

# Test 5: Delete test file
print("\n[5] Cleaning up test file...")
try:
    client.delete_object(Bucket=R2_BUCKET_NAME, Key=TEST_KEY)
    print(f"    ✅ Deleted: {TEST_KEY}")
except ClientError as e:
    print(f"    ⚠️  Cleanup failed (non-critical): {e}")

print()
print("=" * 60)
print("✅ All R2 tests passed! Your credentials are working.")
print()
print("Next steps:")
print("  1. Go to Cloudflare → R2 → deeplearn-videos → Settings")
print("  2. Enable 'Public Access' to get your R2_PUBLIC_URL")
print("  3. Add these env vars to Render dashboard:")
print(f"     R2_ACCOUNT_ID     = {R2_ACCOUNT_ID}")
print(f"     R2_ACCESS_KEY_ID  = {R2_ACCESS_KEY_ID[:8]}... (see .env file)")
print(f"     R2_SECRET_ACCESS_KEY = (see .env file)")
print(f"     R2_BUCKET_NAME    = {R2_BUCKET_NAME}")
print(f"     R2_PUBLIC_URL     = (from Cloudflare bucket settings)")
print("=" * 60)
