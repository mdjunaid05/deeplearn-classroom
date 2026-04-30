"""
Authentication Routes — /auth/login, /auth/register, /auth/validate
"""

from flask import Blueprint, request, jsonify
import re

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


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


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate user credentials.
    
    Expects JSON:
    {
        "email": "user@example.com",
        "password": "Password123",
        "role": "student" or "teacher"
    }
    
    Returns:
    {
        "status": "success",
        "user_id": 1,
        "role": "student",
        "name": "John Doe"
    }
    """
    data = request.get_json(silent=True)
    
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400
    
    # Validate required fields
    email = data.get("email", "").strip()
    password = data.get("password", "")
    role = data.get("role", "").lower()
    
    # Check empty fields
    if not email:
        return jsonify({"error": "Email is required"}), 400
    if not password:
        return jsonify({"error": "Password is required"}), 400
    if not role or role not in ["student", "teacher"]:
        return jsonify({"error": "Valid role (student/teacher) is required"}), 400
    
    # Validate email format
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400
    
    # Demo credentials (for development/testing)
    demo_accounts = {
        "student": {
            "student@deeplearn.edu": {"password": "Student123", "name": "Demo Student", "id": 1001},
            "alice@deeplearn.edu": {"password": "Alice123", "name": "Alice", "id": 1002},
            "bob@deeplearn.edu": {"password": "Bob123", "name": "Bob", "id": 1003},
        },
        "teacher": {
            "teacher@deeplearn.edu": {"password": "Teacher123", "name": "Demo Teacher", "id": 2001},
            "dr.smith@deeplearn.edu": {"password": "Smith123", "name": "Dr. Smith", "id": 2002},
        }
    }
    
    # Check credentials
    if role in demo_accounts and email in demo_accounts[role]:
        stored_password = demo_accounts[role][email]["password"]
        if password == stored_password:
            return jsonify({
                "status": "success",
                "user_id": demo_accounts[role][email]["id"],
                "email": email,
                "name": demo_accounts[role][email]["name"],
                "role": role
            }), 200
    
    # Invalid credentials
    return jsonify({"error": "Invalid email or password"}), 401


@auth_bp.route("/validate", methods=["POST"])
def validate_credentials():
    """
    Validate email and password format without checking credentials.
    Useful for real-time validation during typing.
    
    Expects JSON:
    {
        "email": "user@example.com",
        "password": "Password123"
    }
    """
    data = request.get_json(silent=True)
    
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400
    
    email = data.get("email", "").strip()
    password = data.get("password", "")
    
    errors = {}
    
    # Validate email
    if not email:
        errors["email"] = "Email is required"
    elif not validate_email(email):
        errors["email"] = "Invalid email format"
    
    # Validate password
    if not password:
        errors["password"] = "Password is required"
    else:
        valid, msg = validate_password(password)
        if not valid:
            errors["password"] = msg
    
    if errors:
        return jsonify({
            "status": "invalid",
            "errors": errors
        }), 400
    
    return jsonify({
        "status": "valid"
    }), 200
