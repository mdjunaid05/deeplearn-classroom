"""
Authentication Routes — /auth/login, /auth/register, /auth/me, /auth/validate
Supports JWT token-based authentication with database-backed user accounts.
"""

import os
import re
import hashlib
import hmac
import json
import time
import base64
from flask import Blueprint, request, jsonify, current_app
from database.db import get_db_connection

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

# ── JWT Helpers (lightweight, no external dependency) ────────────────────────

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)

def _get_secret():
    return current_app.config.get("SECRET_KEY", "deeplearn-dev-key-2024")

def create_jwt(payload: dict, expires_hours: int = 72) -> str:
    """Create a signed JWT token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload["exp"] = int(time.time()) + expires_hours * 3600
    payload["iat"] = int(time.time())

    h = _b64url_encode(json.dumps(header).encode())
    p = _b64url_encode(json.dumps(payload).encode())
    signature = hmac.new(
        _get_secret().encode(), f"{h}.{p}".encode(), hashlib.sha256
    ).digest()
    s = _b64url_encode(signature)
    return f"{h}.{p}.{s}"

def decode_jwt(token: str) -> dict | None:
    """Decode and verify a JWT token. Returns payload or None."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h, p, s = parts
        expected_sig = hmac.new(
            _get_secret().encode(), f"{h}.{p}".encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64url_decode(s), expected_sig):
            return None
        payload = json.loads(_b64url_decode(p))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

# ── Password Helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Create a salted SHA-256 hash of the password."""
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${hashed}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash."""
    if "$" not in stored_hash:
        # Legacy plain-text comparison (demo accounts)
        return password == stored_hash
    salt, hashed = stored_hash.split("$", 1)
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest() == hashed

# ── Validation ───────────────────────────────────────────────────────────────

def validate_email(email):
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_password(password):
    """Validate password requirements."""
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit"
    return True, "Valid"

# ── Middleware Helper ────────────────────────────────────────────────────────

def get_current_user():
    """Extract and verify the current user from the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    return decode_jwt(token)

def require_auth(f):
    """Decorator to protect routes with JWT auth."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

def require_role(role):
    """Decorator to restrict routes to a specific role."""
    from functools import wraps
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if user.get("role") != role:
                return jsonify({"error": f"Access denied. {role.capitalize()} role required."}), 403
            request.current_user = user
            return f(*args, **kwargs)
        return decorated
    return decorator

# ── Seed Demo Accounts ───────────────────────────────────────────────────────

def _seed_demo_accounts():
    """Insert demo accounts if they don't already exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    demo_users = [
        ("Demo Student", "student@deeplearn.edu", hash_password("Student123"), "student"),
        ("Alice Johnson", "alice@deeplearn.edu", hash_password("Alice123"), "student"),
        ("Bob Williams", "bob@deeplearn.edu", hash_password("Bob123"), "student"),
        ("Demo Teacher", "teacher@deeplearn.edu", hash_password("Teacher123"), "teacher"),
        ("Dr. Smith", "dr.smith@deeplearn.edu", hash_password("Smith123"), "teacher"),
    ]

    for name, email, pwd_hash, role in demo_users:
        cursor.execute("SELECT user_id FROM users WHERE email = ?", (email,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                (name, email, pwd_hash, role),
            )

    conn.commit()
    conn.close()

# ── Routes ───────────────────────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user account.
    
    Expects JSON:
    {
        "name": "John Doe",
        "email": "user@example.com",
        "password": "Password123",
        "role": "student" or "teacher"
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "").lower()

    # Validation
    if not name or len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters"}), 400
    if not email:
        return jsonify({"error": "Email is required"}), 400
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400
    if not role or role not in ["student", "teacher"]:
        return jsonify({"error": "Valid role (student/teacher) is required"}), 400

    valid, msg = validate_password(password)
    if not valid:
        return jsonify({"error": msg}), 400

    # Check if email already exists
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE email = ?", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "An account with this email already exists"}), 409

    # Create the account
    pwd_hash = hash_password(password)
    cursor.execute(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
        (name, email, pwd_hash, role),
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    # Generate token
    token = create_jwt({
        "user_id": user_id,
        "email": email,
        "name": name,
        "role": role,
    })

    return jsonify({
        "status": "success",
        "message": "Account created successfully",
        "token": token,
        "user": {
            "user_id": user_id,
            "email": email,
            "name": name,
            "role": role,
        },
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate user credentials and return a JWT token.
    
    Expects JSON:
    {
        "email": "user@example.com",
        "password": "Password123",
        "role": "student" or "teacher"
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "").lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400
    if not password:
        return jsonify({"error": "Password is required"}), 400
    if not role or role not in ["student", "teacher"]:
        return jsonify({"error": "Valid role (student/teacher) is required"}), 400
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400

    # Ensure demo accounts exist
    try:
        _seed_demo_accounts()
    except Exception:
        pass  # Non-critical

    # Look up user in database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT user_id, name, email, password_hash, role FROM users WHERE email = ? AND role = ?",
        (email, role),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Invalid email or password"}), 401

    # Handle both dict-like (sqlite Row) and tuple results
    if hasattr(row, "keys"):
        user_id, name, db_email, pwd_hash, db_role = row["user_id"], row["name"], row["email"], row["password_hash"], row["role"]
    else:
        user_id, name, db_email, pwd_hash, db_role = row

    if not verify_password(password, pwd_hash):
        return jsonify({"error": "Invalid email or password"}), 401

    # Generate JWT
    token = create_jwt({
        "user_id": user_id,
        "email": db_email,
        "name": name,
        "role": db_role,
    })

    return jsonify({
        "status": "success",
        "token": token,
        "user_id": user_id,
        "email": db_email,
        "name": name,
        "role": db_role,
    }), 200


@auth_bp.route("/me", methods=["GET"])
def get_me():
    """
    Get the current authenticated user's profile.
    Requires a valid JWT token in the Authorization header.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401

    return jsonify({
        "status": "success",
        "user": {
            "user_id": user.get("user_id"),
            "email": user.get("email"),
            "name": user.get("name"),
            "role": user.get("role"),
        },
    }), 200


@auth_bp.route("/validate", methods=["POST"])
def validate_credentials():
    """
    Validate email and password format without checking credentials.
    Useful for real-time validation during typing.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    email = data.get("email", "").strip()
    password = data.get("password", "")

    errors = {}

    if not email:
        errors["email"] = "Email is required"
    elif not validate_email(email):
        errors["email"] = "Invalid email format"

    if not password:
        errors["password"] = "Password is required"
    else:
        valid, msg = validate_password(password)
        if not valid:
            errors["password"] = msg

    if errors:
        return jsonify({"status": "invalid", "errors": errors}), 400

    return jsonify({"status": "valid"}), 200
