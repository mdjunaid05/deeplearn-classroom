"""
Quiz Analytics and Teacher Reporting Routes.
Provides API endpoints for student quiz submissions and teacher analytics dashboards.
"""

import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from database.db import get_db_connection, query_db

quiz_analytics_bp = Blueprint("quiz_analytics", __name__)

def get_val(row, key_or_index):
    """Safely fetch a value from a database row (tuple, dict, or sqlite3.Row)."""
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key_or_index)
    if hasattr(row, "keys"):
        try:
            return row[key_or_index]
        except (IndexError, KeyError):
            pass
    if isinstance(key_or_index, int):
        try:
            return row[key_or_index]
        except IndexError:
            return None
    return None

@quiz_analytics_bp.route("/quiz/submit", methods=["POST"])
def submit_quiz():
    """
    POST /quiz/submit
    Saves student answers, calculates score stats, logs attempt and responses,
    updates legacy quiz_scores, updates quiz analytics report, and updates
    student progress & unlocks next lesson based on 35% pass mark.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    student_id = data.get("student_id")
    quiz_title = data.get("quiz_title", "General Quiz").strip()
    recording_id = data.get("recording_id")
    time_taken = data.get("time_taken", 0) # in seconds
    questions = data.get("questions", [])
    course_id = data.get("course_id", 1)

    if not student_id:
        return jsonify({"error": "Missing student_id"}), 400
    if not questions:
        return jsonify({"error": "No questions submitted"}), 400

    # Calculate Score, Correct, Incorrect, Percentage
    total_questions = len(questions)
    correct_answers = 0
    incorrect_answers = 0
    evaluated_questions = []

    # Format incorrect answers and weak areas
    incorrect_list = []
    weak_areas = set()

    for idx, q in enumerate(questions):
        question_text = q.get("question_text", "").strip()
        options = q.get("options", [])
        correct_option = q.get("correct_option", 0)
        selected_option = q.get("selected_option", 0)
        
        is_correct = (selected_option == correct_option)
        if is_correct:
            correct_answers += 1
        else:
            incorrect_answers += 1
            incorrect_list.append({
                "question_text": question_text,
                "selected_option": selected_option,
                "correct_option": correct_option,
                "options": options
            })
            
            # Map topics/weak areas
            q_text_lower = question_text.lower()
            if "activation" in q_text_lower:
                weak_areas.add("Activation Functions")
            elif "loss" in q_text_lower or "cost" in q_text_lower:
                weak_areas.add("Loss Functions")
            elif "overfit" in q_text_lower or "regulariz" in q_text_lower:
                weak_areas.add("Overfitting and Regularization")
            elif "gradient" in q_text_lower or "descent" in q_text_lower:
                weak_areas.add("Optimization & Gradient Descent")
            elif "network" in q_text_lower or "layer" in q_text_lower:
                weak_areas.add("Network Architecture")
            else:
                weak_areas.add("General Concepts")

        evaluated_questions.append({
            "question_text": question_text,
            "options": options,
            "correct_option": correct_option,
            "selected_option": selected_option,
            "is_correct": is_correct
        })

    percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0
    passed = percentage >= 35 # PASSING REQUIREMENT IS 35%

    conn = get_db_connection()
    cursor = conn.cursor()

    attempt_id = None
    unlocked_next = False
    next_lesson_id = None
    attempts_count = 1

    try:
        # 1. Ensure Quiz exists
        cursor.execute(
            "SELECT quiz_id FROM quizzes WHERE title = ? AND (recording_id = ? OR (? IS NULL AND recording_id IS NULL))",
            (quiz_title, recording_id, recording_id)
        )
        quiz_row = cursor.fetchone()
        if quiz_row:
            quiz_id = get_val(quiz_row, 0)
        else:
            cursor.execute(
                "INSERT INTO quizzes (title, recording_id) VALUES (?, ?)",
                (quiz_title, recording_id)
            )
            quiz_id = cursor.lastrowid

        # 2. Ensure Questions exist and link them to question_ids
        question_ids = []
        for eq in evaluated_questions:
            options_json = json.dumps(eq["options"])
            cursor.execute(
                "SELECT question_id FROM questions WHERE quiz_id = ? AND question_text = ?",
                (quiz_id, eq["question_text"])
            )
            q_row = cursor.fetchone()
            if q_row:
                q_id = get_val(q_row, 0)
            else:
                cursor.execute(
                    "INSERT INTO questions (quiz_id, question_text, options, correct_option) VALUES (?, ?, ?, ?)",
                    (quiz_id, eq["question_text"], options_json, eq["correct_option"])
                )
                q_id = cursor.lastrowid
            question_ids.append(q_id)

        # 3. Create Quiz Attempt
        cursor.execute(
            """
            INSERT INTO quiz_attempts (student_id, quiz_id, score, total_questions, correct_answers, incorrect_answers, percentage, time_taken)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (student_id, quiz_id, correct_answers, total_questions, correct_answers, incorrect_answers, percentage, time_taken)
        )
        attempt_id = cursor.lastrowid

        # 4. Insert Student Responses
        for idx, eq in enumerate(evaluated_questions):
            q_id = question_ids[idx]
            cursor.execute(
                """
                INSERT INTO student_responses (attempt_id, question_id, selected_option, is_correct)
                VALUES (?, ?, ?, ?)
                """,
                (attempt_id, q_id, eq["selected_option"], 1 if eq["is_correct"] else 0)
            )

        # 5. Backward compatibility with legacy quiz_scores table
        if recording_id:
            cursor.execute(
                "SELECT score_id FROM quiz_scores WHERE student_id = ? AND recording_id = ?",
                (student_id, recording_id)
            )
            score_row = cursor.fetchone()
            if score_row:
                cursor.execute(
                    "UPDATE quiz_scores SET score = ?, passed = ? WHERE student_id = ? AND recording_id = ?",
                    (correct_answers, 1 if passed else 0, student_id, recording_id)
                )
            else:
                cursor.execute(
                    "INSERT INTO quiz_scores (student_id, recording_id, score, passed) VALUES (?, ?, ?, ?)",
                    (student_id, recording_id, correct_answers, 1 if passed else 0)
                )

        # 6. Recalculate and update Analytics Report for this quiz
        cursor.execute(
            "SELECT percentage, student_id FROM quiz_attempts WHERE quiz_id = ?",
            (quiz_id,)
        )
        attempts = cursor.fetchall()
        
        percentages = [get_val(att, 0) for att in attempts]
        class_avg = sum(percentages) / len(percentages) if percentages else 0
        highest = max(percentages) if percentages else 0
        lowest = min(percentages) if percentages else 0
        pass_cnt = sum(1 for p in percentages if p >= 35) # Pass mark is 35%
        fail_cnt = len(percentages) - pass_cnt

        cursor.execute("SELECT COUNT(*) FROM students")
        total_students_row = cursor.fetchone()
        total_students = get_val(total_students_row, 0) or 1

        unique_students = len(set(get_val(att, 1) for att in attempts))
        participation_rate = (unique_students / total_students * 100)

        cursor.execute(
            "SELECT report_id FROM analytics_reports WHERE quiz_id = ?",
            (quiz_id,)
        )
        rep_row = cursor.fetchone()
        if rep_row:
            cursor.execute(
                """
                UPDATE analytics_reports 
                SET class_average = ?, highest_score = ?, lowest_score = ?, pass_count = ?, fail_count = ?, participation_rate = ?, updated_at = CURRENT_TIMESTAMP
                WHERE quiz_id = ?
                """,
                (class_avg, highest, lowest, pass_cnt, fail_cnt, participation_rate, quiz_id)
            )
        else:
            cursor.execute(
                """
                INSERT INTO analytics_reports (quiz_id, class_average, highest_score, lowest_score, pass_count, fail_count, participation_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (quiz_id, class_avg, highest, lowest, pass_cnt, fail_cnt, participation_rate)
            )

        # 7. Unify progression logic: resolve lesson_id
        lesson_id = None
        if recording_id:
            lesson_id = f"r_{recording_id}"
        else:
            cursor.execute("SELECT video_id FROM videos WHERE title = ?", (quiz_title,))
            v_row = cursor.fetchone()
            if v_row:
                lesson_id = f"v_{get_val(v_row, 0)}"
            else:
                # Try filename fallback
                cursor.execute("SELECT video_id FROM videos WHERE filename = ?", (quiz_title,))
                v_row2 = cursor.fetchone()
                if v_row2:
                    lesson_id = f"v_{get_val(v_row2, 0)}"

        if lesson_id:
            # Check existing progression
            cursor.execute(
                "SELECT progress_id, attempts, quiz_score, passed FROM student_progress WHERE student_id = ? AND course_id = ? AND lesson_id = ?",
                (student_id, course_id, lesson_id)
            )
            prog_row = cursor.fetchone()
            if prog_row:
                prog_id = get_val(prog_row, 0)
                prev_attempts = get_val(prog_row, 1) or 0
                prev_score = get_val(prog_row, 2) or 0.0
                prev_passed = bool(get_val(prog_row, 3))
                
                attempts_count = prev_attempts + 1
                new_passed = prev_passed or passed
                new_score = max(prev_score, percentage)
                
                cursor.execute(
                    """
                    UPDATE student_progress
                    SET quiz_score = ?, passed = ?, attempts = ?, completed_at = ?
                    WHERE progress_id = ?
                    """,
                    (new_score, 1 if new_passed else 0, attempts_count, datetime.now() if passed and not prev_passed else None, prog_id)
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO student_progress (student_id, course_id, lesson_id, quiz_score, passed, attempts, unlocked, completed_at)
                    VALUES (?, ?, ?, ?, ?, 1, 1, ?)
                    """,
                    (student_id, course_id, lesson_id, percentage, 1 if passed else 0, datetime.now() if passed else None)
                )
            
            # If passed, unlock next lesson in sequence
            if passed:
                # Need sequence
                cursor.execute("SELECT video_id FROM videos WHERE course_id = ? ORDER BY uploaded_at ASC, video_id ASC", (course_id,))
                v_rows = cursor.fetchall()
                cursor.execute("SELECT recording_id FROM recordings WHERE course_id = ? ORDER BY recording_timestamp ASC, recording_id ASC", (course_id,))
                r_rows = cursor.fetchall()
                
                ordered_ids = []
                for vr in v_rows:
                    ordered_ids.append(f"v_{get_val(vr, 0)}")
                for rr in r_rows:
                    ordered_ids.append(f"r_{get_val(rr, 0)}")
                    
                if lesson_id in ordered_ids:
                    curr_idx = ordered_ids.index(lesson_id)
                    if curr_idx < len(ordered_ids) - 1:
                        next_lesson_id = ordered_ids[curr_idx + 1]
                        
                        # Set next lesson unlocked in student_progress
                        cursor.execute(
                            "SELECT progress_id FROM student_progress WHERE student_id = ? AND course_id = ? AND lesson_id = ?",
                            (student_id, course_id, next_lesson_id)
                        )
                        next_prog_row = cursor.fetchone()
                        if next_prog_row:
                            cursor.execute(
                                "UPDATE student_progress SET unlocked = 1 WHERE progress_id = ?",
                                (get_val(next_prog_row, 0),)
                            )
                        else:
                            cursor.execute(
                                "INSERT INTO student_progress (student_id, course_id, lesson_id, unlocked) VALUES (?, ?, ?, 1)",
                                (student_id, course_id, next_lesson_id)
                            )
                        unlocked_next = True

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Failed to save quiz attempt: {str(e)}"}), 500

    conn.close()

    feedback_msg = "Success! Lesson completed and next video unlocked automatically." if passed else "You must score at least 35% to unlock the next lesson."

    return jsonify({
        "status": "success",
        "message": feedback_msg,
        "attempt": {
            "attempt_id": attempt_id,
            "score": correct_answers,
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "incorrect_answers": incorrect_answers,
            "percentage": percentage,
            "time_taken": time_taken,
            "passed": passed,
            "attempts": attempts_count,
            "unlocked_next": unlocked_next,
            "next_lesson_id": next_lesson_id
        },
        "incorrect_questions": incorrect_list,
        "weak_areas": list(weak_areas)
    }), 200

def get_ordered_lessons(course_id=1):
    """
    Returns a list of dicts for all lessons in the course, ordered chronologically.
    Format: [{'lesson_id': 'v_1', 'title': '...', 'type': 'video'}, ...]
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get all videos
    cursor.execute("""
        SELECT video_id, title, uploaded_at 
        FROM videos 
        WHERE course_id = ? 
        ORDER BY uploaded_at ASC, video_id ASC
    """, (course_id,))
    videos = cursor.fetchall()
    
    # Get all recordings
    cursor.execute("""
        SELECT recording_id, file_path, recording_timestamp 
        FROM recordings 
        WHERE course_id = ? 
        ORDER BY recording_timestamp ASC, recording_id ASC
    """, (course_id,))
    recordings = cursor.fetchall()
    conn.close()
    
    lessons = []
    
    for v in videos:
        v_id = get_val(v, 0)
        v_title = get_val(v, 1) or f"Lesson Video #{v_id}"
        lessons.append({
            "lesson_id": f"v_{v_id}",
            "title": v_title,
            "type": "video"
        })
        
    for r in recordings:
        r_id = get_val(r, 0)
        r_title = get_val(r, 1) or f"Live Class Recording #{r_id}"
        if r_title.endswith(".mp4"):
            r_title = r_title[:-4].replace("signed_", "").replace("_", " ").title()
        lessons.append({
            "lesson_id": f"r_{r_id}",
            "title": r_title,
            "type": "recording"
        })
        
    return lessons

def get_student_progress_list(student_id, course_id=1):
    lessons = get_ordered_lessons(course_id)
    if not lessons:
        return 0.0, []
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT lesson_id, quiz_score, passed, attempts, unlocked, completed_at
        FROM student_progress
        WHERE student_id = ? AND course_id = ?
    """, (student_id, course_id))
    rows = cursor.fetchall()
    conn.close()
    
    progress_map = {}
    for r in rows:
        l_id = get_val(r, 0)
        progress_map[l_id] = {
            "quiz_score": get_val(r, 1) or 0.0,
            "passed": bool(get_val(r, 2)),
            "attempts": get_val(r, 3) or 0,
            "unlocked": bool(get_val(r, 4)),
            "completed_at": get_val(r, 5)
        }
        
    completed_count = 0
    result_lessons = []
    is_previous_passed = True
    
    for idx, les in enumerate(lessons):
        l_id = les["lesson_id"]
        prog = progress_map.get(l_id, {
            "quiz_score": 0.0,
            "passed": False,
            "attempts": 0,
            "unlocked": False,
            "completed_at": None
        })
        
        is_unlocked = (idx == 0) or prog["unlocked"] or is_previous_passed
        
        if prog["passed"]:
            completed_count += 1
            
        result_lessons.append({
            "lesson_id": l_id,
            "title": les["title"],
            "type": les["type"],
            "is_locked": not is_unlocked,
            "quiz_score": round(prog["quiz_score"], 2),
            "passed": prog["passed"],
            "attempts": prog["attempts"],
            "completed_at": prog["completed_at"].isoformat() if prog["completed_at"] and not isinstance(prog["completed_at"], str) else prog["completed_at"]
        })
        
        is_previous_passed = prog["passed"]
        
    progress_percentage = (completed_count / len(lessons) * 100) if lessons else 0.0
    return round(progress_percentage, 2), result_lessons

@quiz_analytics_bp.route("/course/progress", methods=["GET"])
def get_course_progress():
    """
    GET /course/progress
    Params: student_id, course_id
    Returns overall progress percentage and lock status of each lesson.
    """
    student_id = request.args.get("student_id", type=int)
    course_id = request.args.get("course_id", 1, type=int)
    
    if not student_id:
        return jsonify({"error": "Missing student_id"}), 400
        
    try:
        percentage, lessons = get_student_progress_list(student_id, course_id)
        return jsonify({
            "progress_percentage": percentage,
            "lessons": lessons
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch course progress: {str(e)}"}), 500

@quiz_analytics_bp.route("/lesson/unlock", methods=["POST"])
def unlock_lesson():
    """
    POST /lesson/unlock
    Unlocks a specific lesson manually for a student.
    """
    data = request.get_json(silent=True) or {}
    student_id = data.get("student_id")
    course_id = data.get("course_id", 1)
    lesson_id = data.get("lesson_id")
    
    if not student_id or not lesson_id:
        return jsonify({"error": "Missing student_id or lesson_id"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT progress_id FROM student_progress WHERE student_id = ? AND course_id = ? AND lesson_id = ?",
            (student_id, course_id, lesson_id)
        )
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE student_progress SET unlocked = 1 WHERE progress_id = ?",
                (get_val(row, 0),)
            )
        else:
            cursor.execute(
                "INSERT INTO student_progress (student_id, course_id, lesson_id, unlocked) VALUES (?, ?, ?, 1)",
                (student_id, course_id, lesson_id)
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Failed to unlock lesson: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"status": "success", "message": f"Lesson {lesson_id} unlocked successfully."}), 200

@quiz_analytics_bp.route("/teacher/student-progress", methods=["GET"])
def get_teacher_student_progress():
    """
    GET /teacher/student-progress
    Returns quiz scores, attempts, pass/fail and progress percentage for all students.
    """
    course_id = request.args.get("course_id", 1, type=int)
    try:
        students = query_db("""
            SELECT 
                student_id, name, email, disability_type, preferred_language, enrolled_at,
                profilePhoto, age, gender, dob, phone, schoolName, grade, section,
                rollNumber, academicYear, parentName, parentPhone, parentEmail,
                emergencyContact, city, state, country, learningLevel, attendanceRate
            FROM students
        """)
        
        progression_report = []
        for s in students:
            s_id = s["student_id"]
            percentage, lessons = get_student_progress_list(s_id, course_id)
            
            progression_report.append({
                "student_id": s_id,
                "name": s["name"],
                "email": s["email"],
                "disability_type": s.get("disability_type"),
                "preferred_language": s.get("preferred_language"),
                "enrolled_at": s.get("enrolled_at"),
                "profilePhoto": s.get("profilePhoto"),
                "age": s.get("age"),
                "gender": s.get("gender"),
                "dob": s.get("dob"),
                "phone": s.get("phone"),
                "schoolName": s.get("schoolName"),
                "grade": s.get("grade"),
                "section": s.get("section"),
                "rollNumber": s.get("rollNumber"),
                "academicYear": s.get("academicYear"),
                "parentName": s.get("parentName"),
                "parentPhone": s.get("parentPhone"),
                "parentEmail": s.get("parentEmail"),
                "emergencyContact": s.get("emergencyContact"),
                "city": s.get("city"),
                "state": s.get("state"),
                "country": s.get("country"),
                "learningLevel": s.get("learningLevel"),
                "attendanceRate": s.get("attendanceRate") if s.get("attendanceRate") is not None else 100.0,
                "progress_percentage": percentage,
                "lessons": lessons
            })
            
        return jsonify(progression_report), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch student progress report: {str(e)}"}), 500


@quiz_analytics_bp.route("/teacher/quiz-reports", methods=["GET"])
def get_quiz_reports():
    """
    GET /teacher/quiz-reports
    Returns a list of all quiz attempts by all students.
    """
    query = """
        SELECT 
            qa.attempt_id,
            s.student_id,
            s.name AS student_name,
            q.title AS quiz_name,
            qa.score,
            qa.total_questions,
            qa.percentage,
            qa.submitted_at,
            qa.time_taken
        FROM quiz_attempts qa
        JOIN students s ON qa.student_id = s.student_id
        JOIN quizzes q ON qa.quiz_id = q.quiz_id
        ORDER BY qa.submitted_at DESC
    """
    try:
        reports = query_db(query)
        return jsonify(reports), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve quiz reports: {str(e)}"}), 500

@quiz_analytics_bp.route("/teacher/student-report/<int:student_id>", methods=["GET"])
def get_student_report(student_id):
    """
    GET /teacher/student-report/:id
    Returns detailed performance reports and metadata for a specific student.
    """
    try:
        # Get student info
        student = query_db(
            """SELECT 
                student_id, name, email, disability_type, preferred_language, enrolled_at,
                profilePhoto, age, gender, dob, phone, schoolName, grade, section,
                rollNumber, academicYear, parentName, parentPhone, parentEmail,
                emergencyContact, city, state, country, learningLevel, attendanceRate
               FROM students WHERE student_id = ?""",
            (student_id,),
            one=True
        )
        if not student:
            return jsonify({"error": "Student not found"}), 404

        # Get list of quiz attempts
        attempts = query_db(
            """
            SELECT 
                qa.attempt_id,
                q.title AS quiz_name,
                qa.score,
                qa.total_questions,
                qa.percentage,
                qa.time_taken,
                qa.submitted_at
            FROM quiz_attempts qa
            JOIN quizzes q ON qa.quiz_id = q.quiz_id
            WHERE qa.student_id = ?
            ORDER BY qa.submitted_at DESC
            """,
            (student_id,)
        )

        # Calculate student specific summaries
        stats = query_db(
            """
            SELECT 
                COUNT(attempt_id) AS total_attempts,
                AVG(percentage) AS avg_percentage,
                MAX(percentage) AS max_percentage,
                MIN(percentage) AS min_percentage
            FROM quiz_attempts
            WHERE student_id = ?
            """,
            (student_id,),
            one=True
        )

        return jsonify({
            "student": student,
            "attempts": attempts,
            "summary": {
                "total_attempts": stats.get("total_attempts") if stats else 0,
                "avg_percentage": round(stats.get("avg_percentage"), 2) if stats and stats.get("avg_percentage") is not None else 0,
                "max_percentage": stats.get("max_percentage") if stats and stats.get("max_percentage") is not None else 0,
                "min_percentage": stats.get("min_percentage") if stats and stats.get("min_percentage") is not None else 0
            }
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve student report: {str(e)}"}), 500

@quiz_analytics_bp.route("/teacher/class-analytics", methods=["GET"])
def get_class_analytics():
    """
    GET /teacher/class-analytics
    Returns aggregated class analytics: general summaries, leaderboard, and question stats.
    """
    try:
        # 1. Global Summaries per Quiz
        quizzes_summary = query_db(
            """
            SELECT 
                q.quiz_id,
                q.title AS quiz_name,
                ar.class_average,
                ar.highest_score,
                ar.lowest_score,
                ar.pass_count,
                ar.fail_count,
                ar.participation_rate,
                ar.updated_at
            FROM quizzes q
            LEFT JOIN analytics_reports ar ON q.quiz_id = ar.quiz_id
            ORDER BY q.created_at DESC
            """
        )

        # 2. Leaderboard (Ranking students by average score)
        leaderboard = query_db(
            """
            SELECT 
                s.student_id,
                s.name AS student_name,
                COUNT(qa.attempt_id) AS quizzes_taken,
                ROUND(AVG(qa.percentage), 2) AS average_percentage,
                MAX(qa.percentage) AS highest_percentage
            FROM students s
            JOIN quiz_attempts qa ON s.student_id = qa.student_id
            GROUP BY s.student_id, s.name
            ORDER BY average_percentage DESC
            """
        )

        # 3. Question-wise Performance (Most missed questions)
        question_performance = query_db(
            """
            SELECT 
                q.quiz_id,
                q.title AS quiz_name,
                qs.question_id,
                qs.question_text,
                COUNT(sr.response_id) AS total_responses,
                SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                SUM(CASE WHEN sr.is_correct = 0 THEN 1 ELSE 0 END) AS incorrect_count,
                ROUND(SUM(CASE WHEN sr.is_correct = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(sr.response_id), 2) AS miss_rate
            FROM questions qs
            JOIN quizzes q ON qs.quiz_id = q.quiz_id
            LEFT JOIN student_responses sr ON qs.question_id = sr.question_id
            GROUP BY q.quiz_id, q.title, qs.question_id, qs.question_text
            HAVING total_responses > 0
            ORDER BY miss_rate DESC
            """
        )

        # Calculate overall class totals
        total_students_row = query_db("SELECT COUNT(*) AS total FROM students", one=True)
        total_students = total_students_row.get("total") if total_students_row else 1

        attempts_summary = query_db(
            """
            SELECT 
                AVG(percentage) AS global_average,
                COUNT(attempt_id) AS total_attempts
            FROM quiz_attempts
            """,
            one=True
        )

        return jsonify({
            "quizzes": quizzes_summary,
            "leaderboard": leaderboard,
            "most_missed": question_performance,
            "global": {
                "total_students": total_students,
                "global_average": round(attempts_summary.get("global_average"), 2) if attempts_summary and attempts_summary.get("global_average") is not None else 0,
                "total_attempts": attempts_summary.get("total_attempts") if attempts_summary else 0
            }
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve class analytics: {str(e)}"}), 500
