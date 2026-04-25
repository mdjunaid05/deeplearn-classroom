"""
Synthetic Dataset Generator for DeepLearn Smart Virtual Classroom
Generates 200+ rows of student activity data with realistic labels.
"""

import numpy as np
import pandas as pd
import os


def generate_dataset(n_rows=200, seed=42):
    """Generate synthetic student activity data with realistic label derivation."""
    np.random.seed(seed)

    data = {
        "student_id": np.random.randint(1001, 1051, size=n_rows),
        "activity_id": np.arange(1, n_rows + 1),
        "quiz_score": np.round(np.random.uniform(10, 100, size=n_rows), 1),
        "time_taken": np.round(np.random.uniform(30, 600, size=n_rows), 1),
        "attempt_count": np.random.randint(1, 6, size=n_rows),
        "clicks": np.random.randint(5, 200, size=n_rows),
        "participation_count": np.random.randint(0, 30, size=n_rows),
        "session_time": np.round(np.random.uniform(5, 120, size=n_rows), 1),
        "completion_rate": np.round(np.random.uniform(0.0, 1.0, size=n_rows), 2),
        "idle_time": np.round(np.random.uniform(0, 60, size=n_rows), 1),
        "prev_score": np.round(np.random.uniform(10, 100, size=n_rows), 1),
        "response_speed": np.round(np.random.uniform(0.5, 10.0, size=n_rows), 2),
        "chat_count": np.random.randint(0, 50, size=n_rows),
        "sign_inputs_count": np.random.randint(0, 100, size=n_rows),
        "caption_views": np.random.randint(0, 50, size=n_rows),
        "visual_alert_responses": np.random.randint(0, 20, size=n_rows),
        "signed_videos_watched": np.random.randint(0, 30, size=n_rows),
        "avg_video_completion_rate": np.round(np.random.uniform(0.1, 1.0, size=n_rows), 2),
    }

    df = pd.DataFrame(data)

    # ── Derive difficulty_label from quiz performance and attempt patterns ──
    def assign_difficulty(row):
        score_avg = (row["quiz_score"] + row["prev_score"]) / 2
        if score_avg >= 70 and row["attempt_count"] <= 2 and row["completion_rate"] >= 0.7:
            return "Easy"
        elif score_avg < 45 or (row["attempt_count"] >= 4 and row["completion_rate"] < 0.5):
            return "Hard"
        else:
            return "Medium"

    df["difficulty_label"] = df.apply(assign_difficulty, axis=1)

    # ── Derive behaviour_label from interaction patterns ──
    def assign_behaviour(row):
        click_rate = row["clicks"] / max(row["session_time"], 1)
        if row["idle_time"] > 30 and click_rate < 0.5 and row["chat_count"] < 5:
            return "Distracted"
        elif click_rate >= 1.5 and row["response_speed"] < 4.0 and row["chat_count"] >= 10:
            return "Active"
        else:
            return "Passive"

    df["behaviour_label"] = df.apply(assign_behaviour, axis=1)

    # ── Derive engagement_label from participation and activity metrics ──
    def assign_engagement(row):
        engagement_score = (
            row["participation_count"] * 2
            + row["quiz_score"] * 0.3
            + (1 - row["idle_time"] / 60) * 20
            + row["completion_rate"] * 30
        )
        if engagement_score >= 70:
            return "High"
        elif engagement_score >= 40:
            return "Medium"
        else:
            return "Low"

    df["engagement_label"] = df.apply(assign_engagement, axis=1)

    return df


def main():
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, "student_activity.csv")

    df = generate_dataset(n_rows=250)

    df.to_csv(output_path, index=False)

    print(f"[✓] Dataset generated: {output_path}")
    print(f"    Shape: {df.shape}")
    print(f"\n    Difficulty distribution:\n{df['difficulty_label'].value_counts().to_string()}")
    print(f"\n    Behaviour distribution:\n{df['behaviour_label'].value_counts().to_string()}")
    print(f"\n    Engagement distribution:\n{df['engagement_label'].value_counts().to_string()}")
    print(f"\n    Sample rows:\n{df.head()}")


if __name__ == "__main__":
    main()
