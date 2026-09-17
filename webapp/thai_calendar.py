"""
Thai Calendar and Official Working Day Helper
Handles Thai Buddhist calendar years (พ.ศ.), public holidays, and working day calculations.
"""

from datetime import date, timedelta
import re

THAI_MONTHS = [
    "",
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
]

THAI_MONTH_MAP = {m: i for i, m in enumerate(THAI_MONTHS) if m}
THAI_DAYS = ["วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์", "วันอาทิตย์"]

# Thai Public Holidays (YYYY, MM, DD): "Name"
# Covering 2024 (2567), 2025 (2568), 2026 (2569), 2027 (2570)
FIXED_HOLIDAYS = {
    (1, 1): "วันขึ้นปีใหม่",
    (4, 6): "วันจักรี",
    (4, 13): "วันสงกรานต์",
    (4, 14): "วันสงกรานต์",
    (4, 15): "วันสงกรานต์",
    (5, 1): "วันแรงงานแห่งชาติ",
    (5, 4): "วันฉัตรมงคล",
    (6, 3): "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี",
    (7, 28): "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว",
    (8, 12): "วันแม่แห่งชาติ",
    (10, 13): "วันนวมินทรมหาราช",
    (10, 23): "วันปิยมหาราช",
    (12, 5): "วันคล้ายวันพระบรมราชสมภพ ร.9 (วันพ่อแห่งชาติ)",
    (12, 10): "วันรัฐธรรมนูญ",
    (12, 31): "วันสิ้นปี",
}

# Specific Buddhist & movable holidays (and announced extra cabinet holidays)
SPECIFIC_HOLIDAYS = {
    # 2024 (2567)
    date(2024, 1, 2): "วันหยุดชดเชยวันสิ้นปี",
    date(2024, 2, 24): "วันมาฆบูชา",
    date(2024, 2, 26): "วันหยุดชดเชยวันมาฆบูชา",
    date(2024, 4, 8): "วันหยุดชดเชยวันจักรี",
    date(2024, 4, 16): "วันหยุดชดเชยวันสงกรานต์",
    date(2024, 5, 6): "วันหยุดชดเชยวันฉัตรมงคล",
    date(2024, 5, 22): "วันวิสาขบูชา",
    date(2024, 7, 20): "วันอาสาฬหบูชา",
    date(2024, 7, 21): "วันเข้าพรรษา",
    date(2024, 7, 22): "วันหยุดชดเชยวันอาสาฬหบูชาและวันเข้าพรรษา",
    date(2024, 7, 29): "วันหยุดชดเชยวันเฉลิมพระชนมพรรษา ร.10",
    date(2024, 10, 14): "วันหยุดชดเชยวันนวมินทรมหาราช",

    # 2025 (2568)
    date(2025, 2, 12): "วันมาฆบูชา",
    date(2025, 4, 7): "วันหยุดชดเชยวันจักรี",
    date(2025, 4, 16): "วันหยุดชดเชยวันสงกรานต์",
    date(2025, 5, 5): "วันหยุดชดเชยวันฉัตรมงคล",
    date(2025, 5, 11): "วันวิสาขบูชา",
    date(2025, 5, 12): "วันหยุดชดเชยวันวิสาขบูชา",
    date(2025, 7, 10): "วันอาสาฬหบูชา",
    date(2025, 7, 11): "วันเข้าพรรษา",
    date(2025, 10, 13): "วันนวมินทรมหาราช",

    # 2026 (2569)
    date(2026, 1, 2): "วันหยุดพิเศษตามมติ ครม.",
    date(2026, 3, 3): "วันมาฆบูชา",
    date(2026, 4, 6): "วันจักรี",
    date(2026, 4, 13): "วันสงกรานต์",
    date(2026, 4, 14): "วันสงกรานต์",
    date(2026, 4, 15): "วันสงกรานต์",
    date(2026, 5, 4): "วันฉัตรมงคล",
    date(2026, 5, 31): "วันวิสาขบูชา",
    date(2026, 6, 1): "วันหยุดชดเชยวันวิสาขบูชา",
    date(2026, 7, 29): "วันอาสาฬหบูชา",
    date(2026, 7, 30): "วันเข้าพรรษา",
    date(2026, 8, 12): "วันแม่แห่งชาติ",
    date(2026, 10, 13): "วันนวมินทรมหาราช",
    date(2026, 10, 23): "วันปิยมหาราช",
    date(2026, 12, 7): "วันหยุดชดเชยวันพ่อแห่งชาติ",
    date(2026, 12, 10): "วันรัฐธรรมนูญ",
    date(2026, 12, 31): "วันสิ้นปี",

    # 2027 (2570)
    date(2027, 2, 21): "วันมาฆบูชา",
    date(2027, 2, 22): "วันหยุดชดเชยวันมาฆบูชา",
    date(2027, 5, 20): "วันวิสาขบูชา",
    date(2027, 7, 18): "วันอาสาฬหบูชา",
    date(2027, 7, 19): "วันเข้าพรรษา/ชดเชย",
}

def is_weekend(d: date) -> bool:
    return d.weekday() >= 5  # 5=Sat, 6=Sun

def get_holiday_name(d: date) -> str | None:
    if d in SPECIFIC_HOLIDAYS:
        return SPECIFIC_HOLIDAYS[d]
    month_day = (d.month, d.day)
    if month_day in FIXED_HOLIDAYS:
        return FIXED_HOLIDAYS[month_day]
    # Check compensatory if holiday falls on weekend
    # If Monday, check Sunday or Saturday
    if d.weekday() == 0:
        prev_sun = d - timedelta(days=1)
        prev_sat = d - timedelta(days=2)
        if (prev_sun.month, prev_sun.day) in FIXED_HOLIDAYS:
            return f"วันหยุดชดเชย{FIXED_HOLIDAYS[(prev_sun.month, prev_sun.day)]}"
        if (prev_sat.month, prev_sat.day) in FIXED_HOLIDAYS:
            return f"วันหยุดชดเชย{FIXED_HOLIDAYS[(prev_sat.month, prev_sat.day)]}"
    return None

def check_date(d: date) -> dict:
    weekend = is_weekend(d)
    holiday = get_holiday_name(d)
    is_working = (not weekend) and (holiday is None)
    return {
        "date_iso": d.isoformat(),
        "thai_date": format_thai_date(d),
        "day_name": THAI_DAYS[d.weekday()],
        "weekday_thai": THAI_DAYS[d.weekday()],
        "is_working_day": is_working,
        "is_weekend": weekend,
        "is_holiday": holiday is not None,
        "holiday_name": holiday,
        "warning_text": (f"ตรงกับ{THAI_DAYS[d.weekday()]}" if weekend else "") or (f"ตรงกับวันหยุด: {holiday}" if holiday else "")
    }

def add_working_days(start_date: date, working_days: int) -> date:
    curr = start_date
    added = 0
    while added < working_days:
        curr += timedelta(days=1)
        if not is_weekend(curr) and get_holiday_name(curr) is None:
            added += 1
    return curr

def ensure_working_day(d: date) -> date:
    curr = d
    while is_weekend(curr) or get_holiday_name(curr) is not None:
        curr += timedelta(days=1)
    return curr

def format_thai_date(d: date) -> str:
    thai_year = d.year + 543
    return f"{d.day} {THAI_MONTHS[d.month]} {thai_year}"

def parse_thai_date(s: str) -> date | None:
    if not s:
        return None
    s = s.strip()
    # Match "DD Month YYYY" e.g. "30 กรกฎาคม 2569" or "8 สิงหาคม 2569"
    m = re.search(r"(\d{1,2})\s+([^\d\s]+)\s+(\d{4})", s)
    if m:
        day = int(m.group(1))
        month_name = m.group(2)
        year_be = int(m.group(3))
        month = THAI_MONTH_MAP.get(month_name)
        if month:
            year_ce = year_be - 543 if year_be > 2400 else year_be
            try:
                return date(year_ce, month, day)
            except ValueError:
                pass

    # Match numeric dates with delimiters: DD/MM/YYYY or DD-MM-YYYY
    m_delim = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", s)
    if m_delim:
        day = int(m_delim.group(1))
        month = int(m_delim.group(2))
        yr = int(m_delim.group(3))
        year_ce = yr - 543 if yr > 2400 else yr
        try:
            return date(year_ce, month, day)
        except ValueError:
            pass

    # Match 8 digits: DDMYYYYY e.g. "08082569" or 7 digits e.g. "8082569"
    clean_digits = re.sub(r"\D", "", s)
    if len(clean_digits) == 8:
        day = int(clean_digits[0:2])
        month = int(clean_digits[2:4])
        yr = int(clean_digits[4:8])
        year_ce = yr - 543 if yr > 2400 else yr
        try:
            return date(year_ce, month, day)
        except ValueError:
            pass
    elif len(clean_digits) == 7:
        day = int(clean_digits[0:1])
        month = int(clean_digits[1:3])
        yr = int(clean_digits[3:7])
        year_ce = yr - 543 if yr > 2400 else yr
        try:
            return date(year_ce, month, day)
        except ValueError:
            pass

    # Try ISO YYYY-MM-DD
    try:
        parts = s.split("-")
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except Exception:
        pass
    return None
