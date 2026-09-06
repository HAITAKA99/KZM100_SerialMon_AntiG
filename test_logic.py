# test_logic.py
import re
import math

PACKET_REGEX = re.compile(r"^(\d{2}\.\d)\[m/s\],(\d{3}),([+-]\d{2}\.\d)$")

def parse_packet(line):
    line = line.strip()
    m = PACKET_REGEX.match(line)
    if not m:
        return None
    speed_str, dir_str, temp_str = m.groups()
    speed = float(speed_str)
    direction = int(dir_str)
    temp = float(temp_str)
    is_error = abs(speed - 99.9) < 0.05
    return {
        "speed": speed,
        "direction": direction,
        "temperature": temp,
        "is_error": is_error
    }

def vector_mean_direction(angles):
    if not angles:
        return None
    sum_sin = sum(math.sin(math.radians(deg)) for deg in angles)
    sum_cos = sum(math.cos(math.radians(deg)) for deg in angles)
    mean_rad = math.atan2(sum_sin, sum_cos)
    mean_deg = math.degrees(mean_rad)
    if mean_deg < 0:
        mean_deg += 360
    return round(mean_deg) % 360

# Tests
assert parse_packet("12.3[m/s],045,+23.5") == {"speed": 12.3, "direction": 45, "temperature": 23.5, "is_error": False}
assert parse_packet("99.9[m/s],180,+15.0")["is_error"] == True
assert parse_packet("05.2[m/s],270,-08.5")["temperature"] == -8.5
assert parse_packet("invalid") is None

assert vector_mean_direction([350, 10]) == 0
assert vector_mean_direction([80, 100]) == 90

print("ALL PYTHON LOGIC TESTS PASSED!")
