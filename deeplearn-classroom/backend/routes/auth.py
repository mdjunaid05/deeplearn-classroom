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
        return hmac.compare_digest(password, stored_hash)
    salt, hashed = stored_hash.split("$", 1)
    computed_hash = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return hmac.compare_digest(computed_hash, hashed)

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
    try:
        cursor = conn.cursor()

        demo_users = [
            ("Demo Student", "student@deeplearn.edu", "Student123", "student"),
            ("Test Student", "student@test.com", "Password123", "student"),
            ("Alice Johnson", "alice@deeplearn.edu", "Alice123", "student"),
            ("Bob Williams", "bob@deeplearn.edu", "Bob123", "student"),
            ("Demo Teacher", "teacher@deeplearn.edu", "Teacher123", "teacher"),
            ("Test Teacher", "teacher@test.com", "Password123", "teacher"),
            ("Example Teacher", "teacher@example.com", "Password123", "teacher"),
            ("Dr. Smith", "dr.smith@deeplearn.edu", "Smith123", "teacher"),
            ("Demo Admin", "admin@deeplearn.edu", "Admin123", "admin"),
        ]

        for name, email, plain_pwd, role in demo_users:
            email_clean = email.strip().lower()
            pwd_hash = hash_password(plain_pwd)

            cursor.execute("SELECT user_id FROM users WHERE LOWER(email) = ?", (email_clean,))
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                    (name, email_clean, pwd_hash, role),
                )
                user_id = cursor.lastrowid
            else:
                user_id = row["user_id"] if hasattr(row, "keys") else row[0]
                cursor.execute("UPDATE users SET password_hash = ?, role = ? WHERE user_id = ?", (pwd_hash, role, user_id))

            if role == "student":
                cursor.execute("SELECT student_id FROM students WHERE LOWER(email) = ?", (email_clean,))
                if not cursor.fetchone():
                    try:
                        cursor.execute(
                            "INSERT INTO students (student_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
                            (user_id, name, email_clean, pwd_hash),
                        )
                    except Exception:
                        cursor.execute(
                            "INSERT INTO students (name, email, password_hash) VALUES (?, ?, ?)",
                            (name, email_clean, pwd_hash),
                        )
                else:
                    cursor.execute("UPDATE students SET password_hash = ? WHERE LOWER(email) = ?", (pwd_hash, email_clean))

            elif role == "teacher":
                cursor.execute("SELECT teacher_id FROM teachers WHERE LOWER(email) = ?", (email_clean,))
                if not cursor.fetchone():
                    try:
                        cursor.execute(
                            "INSERT INTO teachers (teacher_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
                            (user_id, name, email_clean, pwd_hash),
                        )
                    except Exception:
                        cursor.execute(
                            "INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)",
                            (name, email_clean, pwd_hash),
                        )
                else:
                    cursor.execute("UPDATE teachers SET password_hash = ? WHERE LOWER(email) = ?", (pwd_hash, email_clean))

        conn.commit()
    except Exception as e:
        print(f"[AUTH_SEED_ERROR] {e}", flush=True)
        conn.rollback()
    finally:
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
    if not role or role not in ["student", "teacher", "admin"]:
        return jsonify({"error": "Valid role (student/teacher/admin) is required"}), 400

    valid, msg = validate_password(password)
    if not valid:
        return jsonify({"error": msg}), 400

    # Check if email already exists
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE LOWER(email) = ?", (email,))
        if cursor.fetchone():
            return jsonify({"error": "An account with this email already exists"}), 409

        # Create the account
        pwd_hash = hash_password(password)
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (name, email, pwd_hash, role),
        )
        user_id = cursor.lastrowid
        
        if role == "student":
            cursor.execute("SELECT student_id FROM students WHERE LOWER(email) = ?", (email,))
            if not cursor.fetchone():
                try:
                    cursor.execute(
                        "INSERT INTO students (student_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
                        (user_id, name, email, pwd_hash),
                    )
                except Exception:
                    cursor.execute(
                        "INSERT INTO students (name, email, password_hash) VALUES (?, ?, ?)",
                        (name, email, pwd_hash),
                    )
        elif role == "teacher":
            cursor.execute("SELECT teacher_id FROM teachers WHERE LOWER(email) = ?", (email,))
            if not cursor.fetchone():
                try:
                    cursor.execute(
                        "INSERT INTO teachers (teacher_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
                        (user_id, name, email, pwd_hash),
                    )
                except Exception:
                    cursor.execute(
                        "INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)",
                        (name, email, pwd_hash),
                    )
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
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
    if not role or role not in ["student", "teacher", "admin"]:
        return jsonify({"error": "Valid role (student/teacher/admin) is required"}), 400
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400

    # Ensure demo accounts exist
    try:
        _seed_demo_accounts()
    except Exception:
        pass  # Non-critical

    # Look up user in database
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id, name, email, password_hash, role FROM users WHERE LOWER(email) = ? AND LOWER(role) = ?",
            (email, role),
        )
        row = cursor.fetchone()

        # Fallback: Check without role constraint if user exists under email
        if not row:
            cursor.execute(
                "SELECT user_id, name, email, password_hash, role FROM users WHERE LOWER(email) = ?",
                (email,),
            )
            u_row = cursor.fetchone()
            if u_row:
                u_id = u_row["user_id"] if hasattr(u_row, "keys") else u_row[0]
                cursor.execute("UPDATE users SET role = ? WHERE user_id = ?", (role, u_id))
                conn.commit()
                row = (
                    u_id,
                    u_row["name"] if hasattr(u_row, "keys") else u_row[1],
                    u_row["email"] if hasattr(u_row, "keys") else u_row[2],
                    u_row["password_hash"] if hasattr(u_row, "keys") else u_row[3],
                    role,
                )

        # Fallback: check teachers or students table directly if not found in users
        if not row:
            if role == "teacher":
                cursor.execute("SELECT teacher_id, name, email, password_hash FROM teachers WHERE LOWER(email) = ?", (email,))
                t_row = cursor.fetchone()
                if t_row:
                    t_name = t_row["name"] if hasattr(t_row, "keys") else t_row[1]
                    t_email = t_row["email"] if hasattr(t_row, "keys") else t_row[2]
                    t_pwd = t_row["password_hash"] if hasattr(t_row, "keys") else t_row[3]
                    cursor.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'teacher')", (t_name, t_email, t_pwd))
                    user_id = cursor.lastrowid
                    conn.commit()
                    row = (user_id, t_name, t_email, t_pwd, "teacher")
            elif role == "student":
                cursor.execute("SELECT student_id, name, email, password_hash FROM students WHERE LOWER(email) = ?", (email,))
                s_row = cursor.fetchone()
                if s_row:
                    s_name = s_row["name"] if hasattr(s_row, "keys") else s_row[1]
                    s_email = s_row["email"] if hasattr(s_row, "keys") else s_row[2]
                    s_pwd = s_row["password_hash"] if hasattr(s_row, "keys") else s_row[3]
                    cursor.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'student')", (s_name, s_email, s_pwd))
                    user_id = cursor.lastrowid
                    conn.commit()
                    row = (user_id, s_name, s_email, s_pwd, "student")
    finally:
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


# ── Student Profile Management ────────────────────────────────────────────────

def validate_student_profile(data):
    errors = {}
    
    # Age: 3-100
    if "age" in data and data["age"] is not None:
        try:
            age_val = int(data["age"])
            if age_val < 3 or age_val > 100:
                errors["age"] = "Age must be between 3 and 100"
        except (ValueError, TypeError):
            errors["age"] = "Age must be a valid integer"
            
    # School Name: Required
    if "schoolName" in data:
        school_name = str(data["schoolName"]).strip()
        if not school_name:
            errors["schoolName"] = "School Name is required"

    # Parent Phone: Valid format
    if "parentPhone" in data and data["parentPhone"] is not None:
        parent_phone = str(data["parentPhone"]).strip()
        if parent_phone and not re.match(r"^\+?[\d\s\-()]{7,20}$", parent_phone):
            errors["parentPhone"] = "Parent Phone format is invalid"

    # Email validations
    if "email" in data and data["email"] is not None:
        email = str(data["email"]).strip()
        if email and not validate_email(email):
            errors["email"] = "Email format is invalid"

    if "parentEmail" in data and data["parentEmail"] is not None:
        parent_email = str(data["parentEmail"]).strip()
        if parent_email and not validate_email(parent_email):
            errors["parentEmail"] = "Parent Email format is invalid"

    return len(errors) == 0, errors


@auth_bp.route("/student/profile/<int:student_id>", methods=["GET"])
@require_auth
def get_student_profile(student_id):
    """
    GET /auth/student/profile/:student_id
    Retrieves full details for a student.
    Allowed roles: student (only own), teacher, admin.
    """
    current_user = request.current_user
    role = current_user.get("role")
    
    # Authorization checks
    if role == "student" and current_user.get("user_id") != student_id:
        return jsonify({"error": "Access denied. You can only view your own profile."}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            student_id, name, email, disability_type, preferred_language, enrolled_at,
            profilePhoto, age, gender, dob, phone, schoolName, grade, section,
            rollNumber, academicYear, parentName, parentPhone, parentEmail,
            emergencyContact, city, state, country, learningLevel, attendanceRate
        FROM students WHERE student_id = ?
    """, (student_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({"error": "Student not found"}), 404
        
    # Build dict
    if hasattr(row, "keys"):
        student = dict(row)
    else:
        columns = [
            "student_id", "name", "email", "disability_type", "preferred_language", "enrolled_at",
            "profilePhoto", "age", "gender", "dob", "phone", "schoolName", "grade", "section",
            "rollNumber", "academicYear", "parentName", "parentPhone", "parentEmail",
            "emergencyContact", "city", "state", "country", "learningLevel", "attendanceRate"
        ]
        student = dict(zip(columns, row))
        
    # Also add course and progression statistics
    # Enrolled Courses, Completed Courses, Quiz Scores, Certificates Earned
    try:
        from routes.quiz_analytics import get_student_progress_list
        progress_pct, lessons = get_student_progress_list(student_id, course_id=1)
        
        student["enrolled_courses"] = ["Smart Virtual Classroom Basics"]
        student["completed_courses"] = ["Smart Virtual Classroom Basics"] if progress_pct >= 100.0 else []
        student["current_course_progress"] = progress_pct
        student["certificates_earned"] = ["Smart Classroom Completion Certificate"] if progress_pct >= 100.0 else []
        
        # Get actual quiz scores from quiz_attempts
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT qa.score, qa.total_questions, qa.percentage, q.title 
            FROM quiz_attempts qa
            JOIN quizzes q ON qa.quiz_id = q.quiz_id
            WHERE qa.student_id = ?
        """, (student_id,))
        attempts = cursor.fetchall()
        conn.close()
        
        quiz_scores_list = []
        if attempts:
            if hasattr(attempts[0], "keys"):
                for att in attempts:
                    quiz_scores_list.append({
                        "quiz_name": att["title"],
                        "score": f"{att['score']}/{att['total_questions']}",
                        "percentage": float(att["percentage"])
                    })
            else:
                for att in attempts:
                    quiz_scores_list.append({
                        "quiz_name": att[3],
                        "score": f"{att[0]}/{att[1]}",
                        "percentage": float(att[2])
                    })
        student["quiz_scores"] = quiz_scores_list
    except Exception as e:
        print(f"Error computing learning stats: {e}")
        student["enrolled_courses"] = []
        student["completed_courses"] = []
        student["current_course_progress"] = 0.0
        student["certificates_earned"] = []
        student["quiz_scores"] = []
        
    return jsonify({"status": "success", "student": student}), 200


@auth_bp.route("/student/profile/<int:student_id>", methods=["PUT"])
@require_auth
def update_student_profile(student_id):
    """
    PUT /auth/student/profile/:student_id
    Updates student profile details.
    Allowed roles: student (only own), admin.
    Teachers are NOT allowed to modify.
    """
    current_user = request.current_user
    role = current_user.get("role")
    
    # Authorization check
    if role == "teacher":
        return jsonify({"error": "Access denied. Teachers cannot modify student profiles."}), 403
    if role == "student" and current_user.get("user_id") != student_id:
        return jsonify({"error": "Access denied. You can only modify your own profile."}), 403
        
    data = request.get_json(silent=True) or {}
    
    # Convert age if present
    if "age" in data and data["age"] != "" and data["age"] is not None:
        try:
            data["age"] = int(data["age"])
        except ValueError:
            return jsonify({"error": "Age must be a valid integer"}), 400
            
    # Validations
    valid, errors = validate_student_profile(data)
    if not valid:
        return jsonify({"error": "Validation failed", "errors": errors}), 400
        
    # Fields to update
    fields = [
        "name", "profilePhoto", "age", "gender", "dob", "phone",
        "schoolName", "grade", "section", "rollNumber", "academicYear",
        "parentName", "parentPhone", "parentEmail", "emergencyContact",
        "city", "state", "country", "learningLevel", "disability_type", "preferred_language"
    ]
    
    update_parts = []
    params = []
    
    for f in fields:
        if f in data:
            update_parts.append(f"{f} = ?")
            params.append(data[f])
            
    if not update_parts:
        return jsonify({"error": "No fields to update"}), 400
        
    params.append(student_id)
    query = f"UPDATE students SET {', '.join(update_parts)} WHERE student_id = ?"
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(query, params)
        
        # Sync name/email to users table
        if "name" in data or "email" in data:
            user_update_parts = []
            user_params = []
            if "name" in data:
                user_update_parts.append("name = ?")
                user_params.append(data["name"])
            if "email" in data:
                user_update_parts.append("email = ?")
                user_params.append(data["email"])
            user_params.append(student_id)
            cursor.execute(f"UPDATE users SET {', '.join(user_update_parts)} WHERE user_id = ?", user_params)
            
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Profile updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to update profile: {str(e)}"}), 500
