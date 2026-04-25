"""
Visual Alert Utils
Triggers color-coded visual alerts for the frontend.
"""

def trigger_alert(alert_type, message):
    """
    Returns alert configuration (color, flash pattern, duration).
    Types: info (blue), warning (yellow), critical (red), success (green).
    """
    alerts = {
        "info": {
            "color": "blue",
            "flash": False,
            "duration": 5000,
        },
        "warning": {
            "color": "yellow",
            "flash": True,
            "duration": 8000,
        },
        "critical": {
            "color": "red",
            "flash": True,
            "duration": 10000,
        },
        "success": {
            "color": "green",
            "flash": False,
            "duration": 3000,
        }
    }
    
    # Default to info if unknown
    config = alerts.get(alert_type, alerts["info"])
    
    return {
        "message": message,
        "type": alert_type,
        **config
    }
