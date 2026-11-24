from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple


DEFAULT_SCHEDULING_POLICY: Dict[str, Any] = {
    "oneExamPerDeptPerDay": True,
    "minGapDaysBetweenExams": 2,
    "independentDeptScheduling": True,
    "allowSameDayFnAnPerDept": False,
    "allowMultipleDeptsSameDate": True,
}


def normalize_scheduling_policy(policy: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    src = policy if isinstance(policy, dict) else {}

    def _pick_bool(camel: str, snake: str, default: bool) -> bool:
        if camel in src and src[camel] is not None:
            return bool(src[camel])
        if snake in src and src[snake] is not None:
            return bool(src[snake])
        return default

    raw_gap = src.get(
        "minGapDaysBetweenExams",
        src.get("min_gap_days_between_exams", DEFAULT_SCHEDULING_POLICY["minGapDaysBetweenExams"]),
    )
    try:
        gap_int = int(raw_gap)
    except (TypeError, ValueError):
        gap_int = DEFAULT_SCHEDULING_POLICY["minGapDaysBetweenExams"]
    gap_int = max(0, min(14, gap_int))

    return {
        "oneExamPerDeptPerDay": _pick_bool(
            "oneExamPerDeptPerDay",
            "one_exam_per_dept_per_day",
            DEFAULT_SCHEDULING_POLICY["oneExamPerDeptPerDay"],
        ),
        "minGapDaysBetweenExams": gap_int,
        "independentDeptScheduling": _pick_bool(
            "independentDeptScheduling",
            "independent_dept_scheduling",
            DEFAULT_SCHEDULING_POLICY["independentDeptScheduling"],
        ),
        "allowSameDayFnAnPerDept": _pick_bool(
            "allowSameDayFnAnPerDept",
            "allow_same_day_fn_an_per_dept",
            DEFAULT_SCHEDULING_POLICY["allowSameDayFnAnPerDept"],
        ),
        "allowMultipleDeptsSameDate": _pick_bool(
            "allowMultipleDeptsSameDate",
            "allow_multiple_depts_same_date",
            DEFAULT_SCHEDULING_POLICY["allowMultipleDeptsSameDate"],
        ),
    }


def parse_exam_date(date_val: Any) -> Optional[date]:
    raw = str(date_val or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            continue
    return None


def format_display_date(date_val: Any) -> str:
    parsed = parse_exam_date(date_val)
    if parsed is not None:
        return parsed.strftime("%d.%m.%Y")
    return str(date_val or "").strip()


def short_session_label(session_val: Any) -> str:
    s = str(session_val or "").strip().upper()
    if s.startswith("FN"):
        return "FN"
    if s.startswith("AN"):
        return "AN"
    return s.split()[0] if s else "SLOT"


def session_sort_rank(session_val: Any) -> int:
    short = short_session_label(session_val)
    if short == "FN":
        return 0
    if short == "AN":
        return 1
    return 2


def _norm_sec_token(val: Any) -> str:
    s = str(val or "").strip().lower()
    if s.startswith("section "):
        s = s[8:].strip()
    return s


def _build_department_lookup(departments: Optional[List[Any]]) -> Tuple[Dict[str, Tuple[str, str]], Dict[str, Tuple[str, str]]]:
    by_id: Dict[str, Tuple[str, str]] = {}
    by_name: Dict[str, Tuple[str, str]] = {}
    for d in departments or []:
        if isinstance(d, dict):
            did = str(d.get("id") or "").strip()
            dname = str(d.get("name") or "").strip()
            if did and dname:
                canon = did.lower()
                by_id[did.lower()] = (canon, dname)
                by_name[dname.lower()] = (canon, dname)
            elif dname:
                canon = dname.lower()
                by_name[canon] = (canon, dname)
        elif isinstance(d, str) and d.strip():
            dname = d.strip()
            canon = dname.lower()
            by_name[canon] = (canon, dname)
    return by_id, by_name


def resolve_department_identity(
    item: Dict[str, Any],
    departments: Optional[List[Any]] = None,
    subjects_map: Optional[Dict[str, Dict[str, Any]]] = None,
    _lookup_cache: Optional[Tuple[Dict[str, Tuple[str, str]], Dict[str, Tuple[str, str]]]] = None,
) -> Tuple[str, str]:
    by_id, by_name = _lookup_cache or _build_department_lookup(departments)
    sub = subjects_map.get(item.get("subjectId")) if subjects_map and item.get("subjectId") else None

    dept_id = str(item.get("departmentId") or (sub or {}).get("departmentId") or "").strip()
    dept_name = str(item.get("department") or (sub or {}).get("department") or "").strip()

    if dept_id and dept_id.lower() in by_id:
        canon, canonical_name = by_id[dept_id.lower()]
        return canon, dept_name or canonical_name
    if dept_name and dept_name.lower() in by_name:
        canon, canonical_name = by_name[dept_name.lower()]
        return canon, canonical_name
    if dept_id:
        return dept_id.lower(), dept_name or dept_id
    if dept_name:
        return dept_name.lower(), dept_name
    return "general", "General"


def _format_subject_label(item: Dict[str, Any], subjects_map: Optional[Dict[str, Dict[str, Any]]] = None) -> str:
    sub = subjects_map.get(item.get("subjectId")) if subjects_map and item.get("subjectId") else None
    name = str(item.get("subjectName") or (sub or {}).get("name") or "").strip()
    code = str(item.get("subjectCode") or (sub or {}).get("code") or "").strip()
    if name and code:
        return f"{name} ({code})"
    return name or code or str(item.get("examId") or "Exam")


def _exam_uid(item: Dict[str, Any], fallback_idx: int) -> str:
    return str(item.get("examId") or item.get("id") or item.get("subjectId") or f"idx-{fallback_idx}")


def validate_one_exam_per_department_per_day(
    schedule: List[Dict[str, Any]],
    departments: Optional[List[Any]] = None,
    subjects: Optional[List[Dict[str, Any]]] = None,
    policy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    pol = normalize_scheduling_policy(policy)
    subjects_map = {s["id"]: s for s in (subjects or []) if isinstance(s, dict) and s.get("id")}
    lookup = _build_department_lookup(departments)

    if not pol["oneExamPerDeptPerDay"] or pol["allowSameDayFnAnPerDept"]:
        return {
            "valid": True,
            "enabled": False,
            "violations": [],
            "violatingExamIds": [],
            "count": 0,
        }

    grouped: Dict[Tuple[str, date], List[Tuple[int, Dict[str, Any], str]]] = {}
    for idx, item in enumerate(schedule or []):
        if not isinstance(item, dict):
            continue
        parsed_date = parse_exam_date(item.get("date"))
        if parsed_date is None:
            continue
        canon_dept, dept_display = resolve_department_identity(item, departments, subjects_map, lookup)
        grouped.setdefault((canon_dept, parsed_date), []).append((idx, item, dept_display))

    violations: List[Dict[str, Any]] = []
    violating_exam_ids: set = set()

    for (canon_dept, exam_date), entries in sorted(grouped.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if len(entries) <= 1:
            continue
        entries_sorted = sorted(entries, key=lambda e: (session_sort_rank(e[1].get("session")), _exam_uid(e[1], e[0])))
        dept_display = entries_sorted[0][2]
        date_fmt = exam_date.strftime("%d.%m.%Y")
        iso_date = exam_date.isoformat()

        for idx, item, _ in entries_sorted:
            violating_exam_ids.add(_exam_uid(item, idx))

        for pos in range(len(entries_sorted) - 1):
            idx_a, item_a, _ = entries_sorted[pos]
            idx_b, item_b, _ = entries_sorted[pos + 1]
            sub_a = _format_subject_label(item_a, subjects_map)
            sub_b = _format_subject_label(item_b, subjects_map)
            sess_a = short_session_label(item_a.get("session"))
            sess_b = short_session_label(item_b.get("session"))
            message = (
                f"Invalid Schedule: {dept_display} has {sub_a} ({sess_a}) and "
                f"{sub_b} ({sess_b}) on {date_fmt}. Only one examination per day per department is allowed."
            )
            violations.append({
                "type": "ONE_EXAM_PER_DAY",
                "departmentKey": canon_dept,
                "department": dept_display,
                "date": iso_date,
                "displayDate": date_fmt,
                "examIds": [_exam_uid(item_a, idx_a), _exam_uid(item_b, idx_b)],
                "subjects": [sub_a, sub_b],
                "sessions": [sess_a, sess_b],
                "message": message,
            })

    return {
        "valid": len(violations) == 0,
        "enabled": True,
        "violations": violations,
        "violatingExamIds": sorted(violating_exam_ids),
        "count": len(violations),
    }


def validate_minimum_exam_gap(
    schedule: List[Dict[str, Any]],
    departments: Optional[List[Any]] = None,
    subjects: Optional[List[Dict[str, Any]]] = None,
    policy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    pol = normalize_scheduling_policy(policy)
    min_gap = pol["minGapDaysBetweenExams"]
    min_day_diff = min_gap + 1
    subjects_map = {s["id"]: s for s in (subjects or []) if isinstance(s, dict) and s.get("id")}
    lookup = _build_department_lookup(departments)

    by_dept: Dict[str, List[Tuple[date, int, int, Dict[str, Any], str]]] = {}
    for idx, item in enumerate(schedule or []):
        if not isinstance(item, dict):
            continue
        parsed_date = parse_exam_date(item.get("date"))
        if parsed_date is None:
            continue
        canon_dept, dept_display = resolve_department_identity(item, departments, subjects_map, lookup)
        by_dept.setdefault(canon_dept, []).append(
            (parsed_date, session_sort_rank(item.get("session")), idx, item, dept_display)
        )

    violations: List[Dict[str, Any]] = []
    violating_exam_ids: set = set()
    timelines: Dict[str, List[Dict[str, Any]]] = {}

    for canon_dept, entries in sorted(by_dept.items(), key=lambda kv: kv[1][0][4].lower()):
        entries.sort(key=lambda e: (e[0], e[1], _exam_uid(e[3], e[2])))
        dept_display = entries[0][4]
        dept_timeline: List[Dict[str, Any]] = []

        for pos, (d_curr, _rank, idx_curr, item_curr, _) in enumerate(entries):
            gap_days: Optional[int] = None
            day_diff: Optional[int] = None
            gap_valid = True

            if pos > 0:
                d_prev, _prev_rank, idx_prev, item_prev, _ = entries[pos - 1]
                day_diff = (d_curr - d_prev).days
                gap_days = max(0, day_diff - 1) if day_diff > 0 else 0

                if min_gap > 0 and 0 < day_diff < min_day_diff:
                    gap_valid = False
                    eid_prev = _exam_uid(item_prev, idx_prev)
                    eid_curr = _exam_uid(item_curr, idx_curr)
                    violating_exam_ids.add(eid_prev)
                    violating_exam_ids.add(eid_curr)

                    sub_a = _format_subject_label(item_prev, subjects_map)
                    sub_b = _format_subject_label(item_curr, subjects_map)
                    d1_fmt = d_prev.strftime("%d.%m.%Y")
                    d2_fmt = d_curr.strftime("%d.%m.%Y")
                    if min_gap == 2:
                        req_phrase = "A minimum of two complete days between examinations is required."
                    else:
                        req_phrase = (
                            f"A minimum of {min_gap} complete day"
                            f"{'s' if min_gap != 1 else ''} between examinations is required."
                        )
                    message = (
                        f"Invalid Schedule: {dept_display} has {sub_a} on {d1_fmt} "
                        f"and {sub_b} on {d2_fmt}. {req_phrase}"
                    )
                    violations.append({
                        "type": "MINIMUM_GAP",
                        "departmentKey": canon_dept,
                        "department": dept_display,
                        "examIds": [eid_prev, eid_curr],
                        "subjects": [sub_a, sub_b],
                        "dates": [d_prev.isoformat(), d_curr.isoformat()],
                        "displayDates": [d1_fmt, d2_fmt],
                        "actualCompleteGapDays": gap_days,
                        "requiredCompleteGapDays": min_gap,
                        "message": message,
                    })

            dept_timeline.append({
                "examId": _exam_uid(item_curr, idx_curr),
                "subjectCode": item_curr.get("subjectCode") or (subjects_map.get(item_curr.get("subjectId")) or {}).get("code"),
                "subjectName": item_curr.get("subjectName") or (subjects_map.get(item_curr.get("subjectId")) or {}).get("name"),
                "date": d_curr.isoformat(),
                "displayDate": d_curr.strftime("%d.%m.%Y"),
                "session": item_curr.get("session"),
                "shortSession": short_session_label(item_curr.get("session")),
                "completeGapDaysFromPrev": gap_days,
                "dayDiffFromPrev": day_diff,
                "gapValid": gap_valid,
            })

        timelines[dept_display] = dept_timeline

    return {
        "valid": len(violations) == 0,
        "requiredGapDays": min_gap,
        "violations": violations,
        "violatingExamIds": sorted(violating_exam_ids),
        "count": len(violations),
        "departmentTimelines": timelines,
    }


def validate_department_independence(
    schedule: List[Dict[str, Any]],
    departments: Optional[List[Any]] = None,
    subjects: Optional[List[Dict[str, Any]]] = None,
    policy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    pol = normalize_scheduling_policy(policy)
    subjects_map = {s["id"]: s for s in (subjects or []) if isinstance(s, dict) and s.get("id")}
    lookup = _build_department_lookup(departments)

    depts_by_date: Dict[str, Dict[str, str]] = {}
    items_by_date: Dict[str, List[Tuple[int, Dict[str, Any]]]] = {}

    for idx, item in enumerate(schedule or []):
        if not isinstance(item, dict):
            continue
        parsed_date = parse_exam_date(item.get("date"))
        if parsed_date is None:
            continue
        iso = parsed_date.isoformat()
        canon_dept, dept_display = resolve_department_identity(item, departments, subjects_map, lookup)
        depts_by_date.setdefault(iso, {})[canon_dept] = dept_display
        items_by_date.setdefault(iso, []).append((idx, item))

    shared_dates = [
        {
            "date": iso,
            "displayDate": format_display_date(iso),
            "departments": sorted(dept_map.values()),
            "departmentCount": len(dept_map),
        }
        for iso, dept_map in sorted(depts_by_date.items())
        if len(dept_map) > 1
    ]

    if pol["allowMultipleDeptsSameDate"]:
        return {
            "valid": True,
            "independentDeptScheduling": pol["independentDeptScheduling"],
            "allowMultipleDeptsSameDate": True,
            "sharedDates": shared_dates,
            "violations": [],
            "violatingExamIds": [],
            "count": 0,
        }

    violations: List[Dict[str, Any]] = []
    violating_exam_ids: set = set()
    for entry in shared_dates:
        iso = entry["date"]
        for idx, item in items_by_date.get(iso, []):
            violating_exam_ids.add(_exam_uid(item, idx))
        violations.append({
            "type": "MULTIPLE_DEPARTMENTS_SAME_DATE",
            "date": iso,
            "displayDate": entry["displayDate"],
            "departments": entry["departments"],
            "message": (
                f"Invalid Schedule: Multiple departments ({', '.join(entry['departments'])}) "
                f"are scheduled on {entry['displayDate']}, which is disallowed by policy."
            ),
        })

    return {
        "valid": len(violations) == 0,
        "independentDeptScheduling": pol["independentDeptScheduling"],
        "allowMultipleDeptsSameDate": False,
        "sharedDates": shared_dates,
        "violations": violations,
        "violatingExamIds": sorted(violating_exam_ids),
        "count": len(violations),
    }


def validate_student_exam_conflicts(
    schedule: List[Dict[str, Any]],
    subjects: Optional[List[Dict[str, Any]]] = None,
    students: Optional[List[Dict[str, Any]]] = None,
    policy: Optional[Dict[str, Any]] = None,
    departments: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    _ = normalize_scheduling_policy(policy)
    subjects_map = {s["id"]: s for s in (subjects or []) if isinstance(s, dict) and s.get("id")}
    lookup = _build_department_lookup(departments)

    enrollment_map: Dict[str, set] = {}
    for stu in students or []:
        if not isinstance(stu, dict):
            continue
        stu_key = stu.get("id") or stu.get("regNo")
        if not stu_key:
            continue
        for sid in stu.get("enrolledSubjectIds") or []:
            if sid:
                enrollment_map.setdefault(sid, set()).add(stu_key)

    items_by_slot: Dict[str, List[Tuple[int, Dict[str, Any]]]] = {}
    for idx, item in enumerate(schedule or []):
        if not isinstance(item, dict):
            continue
        slot = f"{item.get('date', '')}|{item.get('session', '')}"
        items_by_slot.setdefault(slot, []).append((idx, item))

    violations: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    violating_exam_ids: set = set()
    warning_exam_ids: set = set()

    for slot_entries in items_by_slot.values():
        for i in range(len(slot_entries)):
            idx_a, a = slot_entries[i]
            sub_a = subjects_map.get(a.get("subjectId"))
            set_a = enrollment_map.get(a.get("subjectId"), set())
            dept_a_canon, dept_a_name = resolve_department_identity(a, departments, subjects_map, lookup)

            for j in range(i + 1, len(slot_entries)):
                idx_b, b = slot_entries[j]
                eid_a = _exam_uid(a, idx_a)
                eid_b = _exam_uid(b, idx_b)
                if eid_a == eid_b:
                    continue
                sub_b = subjects_map.get(b.get("subjectId"))
                set_b = enrollment_map.get(b.get("subjectId"), set())
                dept_b_canon, dept_b_name = resolve_department_identity(b, departments, subjects_map, lookup)

                shared = len(set_a & set_b) if (set_a and set_b) else 0
                if shared > 0:
                    violating_exam_ids.add(eid_a)
                    violating_exam_ids.add(eid_b)
                    violations.append({
                        "type": "STUDENT_OVERLAP",
                        "examIds": [eid_a, eid_b],
                        "departments": [dept_a_name, dept_b_name],
                        "sharedStudentCount": shared,
                        "date": a.get("date"),
                        "session": a.get("session"),
                        "message": (
                            f"Invalid Schedule: {_format_subject_label(a, subjects_map)} ({dept_a_name}) and "
                            f"{_format_subject_label(b, subjects_map)} ({dept_b_name}) share {shared} enrolled "
                            f"student{'s' if shared != 1 else ''} in {format_display_date(a.get('date'))} {short_session_label(a.get('session'))}."
                        ),
                    })
                    continue

                if dept_a_canon != dept_b_canon:
                    continue

                batch_a = str(a.get("batch") or (sub_a or {}).get("batch") or "").strip().lower()
                batch_b = str(b.get("batch") or (sub_b or {}).get("batch") or "").strip().lower()
                sem_a = str(a.get("semester") if a.get("semester") is not None else (sub_a or {}).get("semester", "")).strip()
                sem_b = str(b.get("semester") if b.get("semester") is not None else (sub_b or {}).get("semester", "")).strip()
                sec_a = _norm_sec_token(a.get("section") or (sub_a or {}).get("section"))
                sec_b = _norm_sec_token(b.get("section") or (sub_b or {}).get("section"))

                batch_ok = (not batch_a) or (not batch_b) or (batch_a == batch_b)
                sem_ok = (not sem_a) or (not sem_b) or (sem_a == sem_b)
                sec_ok = (not sec_a) or (not sec_b) or (sec_a == sec_b)

                if batch_ok and sem_ok and sec_ok:
                    violating_exam_ids.add(eid_a)
                    violating_exam_ids.add(eid_b)
                    violations.append({
                        "type": "STUDENT_COHORT_CLASH",
                        "examIds": [eid_a, eid_b],
                        "departments": [dept_a_name],
                        "sharedStudentCount": 0,
                        "date": a.get("date"),
                        "session": a.get("session"),
                        "message": (
                            f"Invalid Schedule: {_format_subject_label(a, subjects_map)} and "
                            f"{_format_subject_label(b, subjects_map)} in {dept_a_name} have overlapping student cohorts "
                            f"on {format_display_date(a.get('date'))} ({short_session_label(a.get('session'))})."
                        ),
                    })
                else:
                    warning_exam_ids.add(eid_a)
                    warning_exam_ids.add(eid_b)
                    warnings.append({
                        "type": "PARALLEL_COHORT_WARNING",
                        "examIds": [eid_a, eid_b],
                        "department": dept_a_name,
                        "date": a.get("date"),
                        "session": a.get("session"),
                    })

    return {
        "valid": len(violations) == 0,
        "violations": violations,
        "warnings": warnings,
        "violatingExamIds": sorted(violating_exam_ids),
        "warningExamIds": sorted(warning_exam_ids),
        "count": len(violations),
    }


def validate_complete_exam_timetable(
    schedule: List[Dict[str, Any]],
    departments: Optional[List[Any]] = None,
    subjects: Optional[List[Dict[str, Any]]] = None,
    students: Optional[List[Dict[str, Any]]] = None,
    halls: Optional[List[Dict[str, Any]]] = None,
    faculty: Optional[List[Dict[str, Any]]] = None,
    policy: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    pol = normalize_scheduling_policy(policy)
    one_per_day = validate_one_exam_per_department_per_day(schedule, departments, subjects, pol)
    min_gap = validate_minimum_exam_gap(schedule, departments, subjects, pol)
    independence = validate_department_independence(schedule, departments, subjects, pol)
    student_res = validate_student_exam_conflicts(schedule, subjects, students, pol, departments)

    halls_map = {h["id"]: h for h in (halls or []) if isinstance(h, dict) and h.get("id")}
    fac_map = {f["id"]: f for f in (faculty or []) if isinstance(f, dict) and f.get("id")}
    subjects_map = {s["id"]: s for s in (subjects or []) if isinstance(s, dict) and s.get("id")}

    hall_slot_counts: Dict[Tuple[str, str], int] = {}
    inv_slot_counts: Dict[Tuple[str, str], int] = {}
    for item in schedule or []:
        if not isinstance(item, dict):
            continue
        slot = f"{item.get('date', '')}|{item.get('session', '')}"
        if item.get("hallId"):
            hall_slot_counts[(slot, item["hallId"])] = hall_slot_counts.get((slot, item["hallId"]), 0) + 1
        inv_id = item.get("invigilatorId") or item.get("facultyId")
        if inv_id:
            inv_slot_counts[(slot, inv_id)] = inv_slot_counts.get((slot, inv_id), 0) + 1

    hall_double_bookings = 0
    capacity_violations = 0
    invigilator_conflicts = 0
    resource_violations: List[Dict[str, Any]] = []
    resource_exam_ids: set = set()

    for idx, item in enumerate(schedule or []):
        if not isinstance(item, dict):
            continue
        eid = _exam_uid(item, idx)
        slot = f"{item.get('date', '')}|{item.get('session', '')}"
        hall_id = item.get("hallId")
        inv_id = item.get("invigilatorId") or item.get("facultyId")
        sub = subjects_map.get(item.get("subjectId")) or {}
        hall = halls_map.get(hall_id) or {}
        fac = fac_map.get(inv_id) or {}

        enrolled = int(item.get("enrolledCount") if item.get("enrolledCount") is not None else sub.get("enrolledCount", 0))
        capacity = int(item.get("hallCapacity") if item.get("hallCapacity") is not None else hall.get("capacity", 0))

        if hall_id and hall_slot_counts.get((slot, hall_id), 0) > 1:
            hall_double_bookings += 1
            resource_exam_ids.add(eid)
        if (capacity > 0 and enrolled > capacity) or (hall and hall.get("available") is False):
            capacity_violations += 1
            resource_exam_ids.add(eid)
        if (inv_id and inv_slot_counts.get((slot, inv_id), 0) > 1) or (fac and fac.get("available") is False):
            invigilator_conflicts += 1
            resource_exam_ids.add(eid)

    if hall_double_bookings > 0:
        resource_violations.append({
            "type": "HALL_DOUBLE_BOOKING",
            "count": hall_double_bookings,
            "message": f"Invalid Schedule: {hall_double_bookings} exam slot(s) have double-booked examination halls.",
        })
    if capacity_violations > 0:
        resource_violations.append({
            "type": "CAPACITY_VIOLATION",
            "count": capacity_violations,
            "message": f"Invalid Schedule: {capacity_violations} exam slot(s) exceed hall capacity or use an unavailable hall.",
        })
    if invigilator_conflicts > 0:
        resource_violations.append({
            "type": "INVIGILATOR_CONFLICT",
            "count": invigilator_conflicts,
            "message": f"Invalid Schedule: {invigilator_conflicts} exam slot(s) have invigilator double-bookings or unavailable faculty.",
        })

    all_violations = (
        one_per_day["violations"]
        + min_gap["violations"]
        + independence["violations"]
        + student_res["violations"]
        + resource_violations
    )
    warning_messages = [v["message"] for v in all_violations if v.get("message")]
    all_violating_exam_ids = sorted(
        set(one_per_day["violatingExamIds"])
        | set(min_gap["violatingExamIds"])
        | set(independence["violatingExamIds"])
        | set(student_res["violatingExamIds"])
        | resource_exam_ids
    )

    same_day_exam_count = len(one_per_day["violatingExamIds"])
    gap_exam_count = len(min_gap["violatingExamIds"])
    independence_exam_count = len(independence["violatingExamIds"])
    student_clash_exam_count = len(student_res["violatingExamIds"])

    total_hard_violations = (
        student_clash_exam_count
        + invigilator_conflicts
        + capacity_violations
        + hall_double_bookings
        + one_per_day["count"]
        + min_gap["count"]
        + independence["count"]
    )
    is_valid = len(all_violations) == 0

    return {
        "isValid": is_valid,
        "canFinalize": is_valid,
        "policy": pol,
        "oneExamPerDay": one_per_day,
        "minimumExamGap": min_gap,
        "departmentIndependence": independence,
        "studentConflicts": student_res,
        "violations": all_violations,
        "warnings": warning_messages,
        "violatingExamIds": all_violating_exam_ids,
        "departmentTimelines": min_gap["departmentTimelines"],
        "counts": {
            "departmentSameDayViolations": one_per_day["count"],
            "departmentGapViolations": min_gap["count"],
            "departmentIndependenceViolations": independence["count"],
            "departmentSameDayExamCount": same_day_exam_count,
            "departmentGapExamCount": gap_exam_count,
            "departmentIndependenceExamCount": independence_exam_count,
            "studentClashes": student_clash_exam_count,
            "invigilatorConflicts": invigilator_conflicts,
            "capacityViolations": capacity_violations,
            "hallDoubleBookings": hall_double_bookings,
            "totalHardViolations": total_hard_violations,
        },
    }
