from __future__ import annotations

import math
import time

RESIDENTS = [
    {"id": "R-101", "name": "Resident 101", "base_temp": 36.7, "base_hr": 74, "base_spo2": 98},
    {"id": "R-104", "name": "Resident 104", "base_temp": 36.9, "base_hr": 79, "base_spo2": 97},
    {"id": "R-118", "name": "Resident 118", "base_temp": 38.4, "base_hr": 108, "base_spo2": 94},
    {"id": "R-122", "name": "Resident 122", "base_temp": 37.0, "base_hr": 82, "base_spo2": 98},
]


def current_health() -> list[dict]:
    now = time.time()
    records = []
    for index, resident in enumerate(RESIDENTS):
        wave = math.sin(now / 8 + index)
        temperature = round(resident["base_temp"] + wave * 0.12, 1)
        heart_rate = int(resident["base_hr"] + wave * 4)
        oxygen = int(resident["base_spo2"] + round(wave))
        if temperature >= 38 or heart_rate >= 105 or oxygen < 95:
            status = "Review"
            severity = "High"
        else:
            status = "Normal"
            severity = "Low"
        records.append(
            {
                "resident_id": resident["id"],
                "resident": resident["name"],
                "temperature": temperature,
                "heart_rate": heart_rate,
                "oxygen": oxygen,
                "status": status,
                "severity": severity,
            }
        )
    return records
