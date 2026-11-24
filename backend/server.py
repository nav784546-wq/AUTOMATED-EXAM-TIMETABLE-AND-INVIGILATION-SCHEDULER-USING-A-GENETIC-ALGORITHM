import sys
import os
import json
import uuid
import re
import sqlite3
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

# Add root directory to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import init_db, get_connection
from backend.services.genetic_algorithm import run_genetic_algorithm
from backend.services.seating import generate_seating_plan
from backend.services.subsection import divide_department_students
from backend.services.exam_date_validation import (
    DEFAULT_SCHEDULING_POLICY,
    normalize_scheduling_policy,
    validate_complete_exam_timetable,
)
from backend.services.hall_allocation_service import (
    allocate_exam_halls,
    build_combined_hall_report_rows,
    build_department_wise_report_rows,
    build_individual_student_report_rows,
    lookup_student_hall_assignments,
    validate_hall_allocation_plan,
)
from backend.services.password_reset_service import (
    consume_reset_token,
    issue_reset_request,
    rollback_reset_request,
    validate_reset_token,
)
from backend.services.audit_log_service import (
    create_admin_account,
    delete_admin_account,
    get_password_reset_audit_summary,
    link_admin_firebase_uid,
    list_admin_accounts,
    list_password_reset_audit_logs,
    list_unified_system_audit_logs,
    record_password_reset_audit,
    record_system_audit_log,
    resolve_requester_admin,
    update_admin_account,
)

PORT = int(os.environ.get('BACKEND_PORT', '5000'))


def _serialize_hall_allocation_row(r):
    row_dict = dict(r)
    target_mode = row_dict.get("target_mode") or "PERCENT_50"
    target_pct = row_dict.get("target_percentage")
    if target_pct is None:
        target_pct = 50
    try:
        selected_halls = json.loads(row_dict.get("selected_hall_ids_json") or "[]")
    except Exception:
        selected_halls = []
    return {
        "id": row_dict["id"],
        "examDate": row_dict["exam_date"],
        "session": row_dict["session"],
        "selectedDepartments": json.loads(row_dict.get("selected_departments_json") or "[]"),
        "targetMode": target_mode,
        "targetPercentage": int(target_pct),
        "customTargetPerDept": row_dict.get("custom_target_per_dept") or 0,
        "maxDeptsPerHall": int(row_dict.get("max_depts_per_hall") or 2),
        "selectedHallIds": selected_halls,
        "totalStudents": row_dict.get("total_students") or 0,
        "totalAllocated": row_dict.get("total_allocated") or 0,
        "hallsRequired": row_dict.get("halls_required") or 0,
        "remainingAvailableCapacity": row_dict.get("remaining_available_capacity") or 0,
        "hallSummaries": json.loads(row_dict.get("hall_summaries_json") or "[]"),
        "allocations": json.loads(row_dict.get("allocations_json") or "[]"),
        "createdAt": row_dict.get("created_at"),
    }


def _fetch_all_hall_allocations_from_conn(c):
    c.execute("SELECT * FROM hall_allocations ORDER BY rowid DESC LIMIT 200")
    return [_serialize_hall_allocation_row(r) for r in c.fetchall()]


def _compute_reserved_hall_ids(existing_allocations, exam_date, session, exclude_alloc_id=None, explicit_reserved=None):
    reserved = {str(x) for x in (explicit_reserved or []) if x is not None}
    for saved in existing_allocations or []:
        if exclude_alloc_id and str(saved.get("id") or "") == str(exclude_alloc_id):
            continue
        if str(saved.get("examDate") or "").strip() != str(exam_date or "").strip():
            continue
        if str(saved.get("session") or "").strip() != str(session or "").strip():
            continue
        for hs in saved.get("hallSummaries") or []:
            if (hs.get("allocated") or 0) > 0 and hs.get("hallId"):
                reserved.add(str(hs["hallId"]))
    return sorted(reserved)


def _run_hall_allocation_from_body(c, body):
    exam_date = str(body.get("examDate") or "").strip()
    session_val = str(body.get("session") or "FN").strip() or "FN"
    selected_depts = body.get("selectedDepartments")
    target_mode = str(body.get("targetMode") or "PERCENT_50").strip()
    target_pct = body.get("targetPercentage")
    custom_target = int(body.get("customTargetPerDept") or 30)
    max_depts = int(body.get("maxDeptsPerHall") or 2)
    selected_hall_ids = body.get("selectedHallIds")
    cols = int(body.get("columnsPerRow") or 5)
    alloc_id = body.get("id")

    if isinstance(body.get("students"), list):
        students_list = body["students"]
    else:
        c.execute("SELECT id, reg_no, name, department, section, batch, semester FROM students")
        students_list = [
            {
                "id": r["id"],
                "regNo": r["reg_no"],
                "name": r["name"],
                "department": r["department"],
                "section": r["section"],
                "batch": r["batch"],
                "semester": r["semester"],
            }
            for r in c.fetchall()
        ]

    if isinstance(body.get("halls"), list):
        halls_list = body["halls"]
    else:
        c.execute("SELECT id, hall_number, building, capacity, available FROM halls")
        halls_list = [
            {
                "id": r["id"],
                "hallNumber": r["hall_number"],
                "building": r["building"],
                "capacity": r["capacity"],
                "available": bool(r["available"]),
            }
            for r in c.fetchall()
        ]

    existing_allocs = _fetch_all_hall_allocations_from_conn(c)
    reserved_ids = _compute_reserved_hall_ids(
        existing_allocs,
        exam_date,
        session_val,
        exclude_alloc_id=alloc_id,
        explicit_reserved=body.get("reservedHallIds"),
    )

    plan = allocate_exam_halls(
        students=students_list,
        halls=halls_list,
        selected_departments=selected_depts,
        exam_date=exam_date,
        session=session_val,
        target_mode=target_mode,
        target_percentage=target_pct,
        custom_target_per_dept=custom_target,
        max_depts_per_hall=max_depts,
        selected_hall_ids=selected_hall_ids,
        reserved_hall_ids=reserved_ids,
        columns_per_row=cols,
    )
    if alloc_id:
        plan["id"] = alloc_id
    validation = validate_hall_allocation_plan(
        plan,
        existing_session_allocations=existing_allocs,
        max_depts_per_hall=plan.get("maxDeptsPerHall"),
    )
    return plan, validation, existing_allocs


def get_stored_scheduling_policy():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM metadata WHERE key = 'scheduling_policy'")
    row = c.fetchone()
    conn.close()
    if not row:
        return dict(DEFAULT_SCHEDULING_POLICY)
    try:
        parsed = json.loads(row["value"] or "{}")
        return normalize_scheduling_policy(parsed)
    except Exception:
        return dict(DEFAULT_SCHEDULING_POLICY)


def save_stored_scheduling_policy(policy):
    norm = normalize_scheduling_policy(policy)
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('scheduling_policy', ?)",
        (json.dumps(norm),),
    )
    conn.commit()
    conn.close()
    return norm


DEFAULT_EXAM_DATES_GA = [
    "2026-11-16",
    "2026-11-17",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
    "2026-11-22",
    "2026-11-23",
    "2026-11-24",
    "2026-11-25",
]

DEFAULT_GA_CONFIG = {
    "populationSize": 40,
    "generations": 50,
    "mutationRate": 0.12,
    "crossoverRate": 0.8,
    "elitismCount": 2,
    "tournamentSize": 3,
    "earlyStopGenerations": 0,
    "executionMode": "WEB_WORKER",
    "availableDates": list(DEFAULT_EXAM_DATES_GA),
}


def normalize_ga_config(raw=None):
    src = raw if isinstance(raw, dict) else {}

    def _clamp_int(val, min_v, max_v, fallback):
        try:
            n = int(round(float(val)))
        except (TypeError, ValueError):
            return fallback
        return max(min_v, min(max_v, n))

    def _clamp_float(val, min_v, max_v, fallback):
        try:
            n = float(val)
        except (TypeError, ValueError):
            return fallback
        return round(max(min_v, min(max_v, n)), 4)

    pop_size = _clamp_int(src.get("populationSize"), 10, 300, DEFAULT_GA_CONFIG["populationSize"])
    raw_gen = src.get("generations") if src.get("generations") is not None else src.get("maxGenerations")
    generations = _clamp_int(raw_gen, 10, 500, DEFAULT_GA_CONFIG["generations"])
    mutation_rate = _clamp_float(src.get("mutationRate"), 0.01, 0.5, DEFAULT_GA_CONFIG["mutationRate"])
    crossover_rate = _clamp_float(src.get("crossoverRate"), 0.3, 1.0, DEFAULT_GA_CONFIG["crossoverRate"])
    max_elite = min(10, max(1, pop_size // 2))
    elitism_count = _clamp_int(src.get("elitismCount"), 1, max_elite, min(DEFAULT_GA_CONFIG["elitismCount"], max_elite))
    max_tour = min(8, pop_size)
    tournament_size = _clamp_int(src.get("tournamentSize"), 2, max_tour, min(DEFAULT_GA_CONFIG["tournamentSize"], max_tour))
    early_stop = _clamp_int(src.get("earlyStopGenerations"), 0, 100, DEFAULT_GA_CONFIG["earlyStopGenerations"])
    exec_mode = "SERVER_WORKER" if str(src.get("executionMode") or "").upper() == "SERVER_WORKER" else "WEB_WORKER"

    raw_dates = src.get("availableDates")
    clean_dates = []
    if isinstance(raw_dates, list):
        clean_dates = sorted({
            str(d).strip()
            for d in raw_dates
            if re.match(r"^\d{4}-\d{2}-\d{2}$", str(d or "").strip())
        })
    if not clean_dates:
        clean_dates = list(DEFAULT_EXAM_DATES_GA)

    return {
        "populationSize": pop_size,
        "generations": generations,
        "mutationRate": mutation_rate,
        "crossoverRate": crossover_rate,
        "elitismCount": elitism_count,
        "tournamentSize": tournament_size,
        "earlyStopGenerations": early_stop,
        "executionMode": exec_mode,
        "availableDates": clean_dates,
    }


def get_stored_ga_config():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM metadata WHERE key = 'ga_config'")
    row = c.fetchone()
    conn.close()
    if not row:
        return dict(DEFAULT_GA_CONFIG)
    try:
        parsed = json.loads(row["value"] or "{}")
        return normalize_ga_config(parsed)
    except Exception:
        return dict(DEFAULT_GA_CONFIG)


def save_stored_ga_config(config):
    norm = normalize_ga_config(config)
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('ga_config', ?)",
        (json.dumps(norm),),
    )
    conn.commit()
    conn.close()
    return norm


def _norm_sec_token(val):
    s = str(val or '').strip().lower()
    if s.startswith('section '):
        s = s[8:].strip()
    return s


def compute_schedule_conflicts(
    schedule_list,
    faculty_list,
    subjects_list=None,
    students_list=None,
    departments_list=None,
    halls_list=None,
    policy=None,
):
    if subjects_list is None or students_list is None or departments_list is None or halls_list is None:
        conn = get_connection()
        c = conn.cursor()
        if departments_list is None:
            c.execute("SELECT id, name FROM departments")
            departments_list = [dict(r) for r in c.fetchall()]
        if halls_list is None:
            c.execute("SELECT id, hall_number, capacity, available FROM halls")
            halls_list = [
                {
                    "id": r["id"],
                    "hallNumber": r["hall_number"],
                    "capacity": r["capacity"],
                    "available": bool(r["available"]),
                }
                for r in c.fetchall()
            ]
        if subjects_list is None:
            c.execute("SELECT id, code, name, department, batch, section, semester, enrolled_count FROM subjects")
            subjects_list = [dict(r) for r in c.fetchall()]
        if students_list is None:
            c.execute("SELECT id, reg_no, enrolled_subject_ids FROM students")
            students_list = []
            for r in c.fetchall():
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"] or "[]")
                except Exception:
                    sub_ids = []
                students_list.append({"id": r["id"], "regNo": r["reg_no"], "enrolledSubjectIds": sub_ids})
        conn.close()

    active_policy = normalize_scheduling_policy(policy if policy is not None else get_stored_scheduling_policy())
    fac_map = {f["id"]: f for f in faculty_list}
    hall_map = {h["id"]: h for h in (halls_list or [])}
    sub_map = {s["id"]: s for s in subjects_list}
    enrollment_map = {}
    for stu in students_list:
        stu_key = stu.get("id") or stu.get("regNo")
        if not stu_key:
            continue
        for sid in stu.get("enrolledSubjectIds") or []:
            if sid:
                enrollment_map.setdefault(sid, set()).add(stu_key)

    hall_slot_counts = {}
    inv_slot_counts = {}
    items_by_slot = {}
    fac_duty_counts = {}

    for idx, item in enumerate(schedule_list):
        slot = f"{item.get('date', '')}|{item.get('session', '')}"
        items_by_slot.setdefault(slot, []).append((idx, item))
        hall_id = item.get('hallId')
        inv_id = item.get('invigilatorId') or item.get('facultyId')
        if hall_id:
            hall_slot_counts[(slot, hall_id)] = hall_slot_counts.get((slot, hall_id), 0) + 1
        if inv_id:
            inv_slot_counts[(slot, inv_id)] = inv_slot_counts.get((slot, inv_id), 0) + 1
            fac_duty_counts[inv_id] = fac_duty_counts.get(inv_id, 0) + 1

    student_clash_flags = [False] * len(schedule_list)
    dept_warning_flags = [False] * len(schedule_list)

    for slot_entries in items_by_slot.values():
        for i in range(len(slot_entries)):
            idx_a, a = slot_entries[i]
            sub_a = sub_map.get(a.get("subjectId"))
            set_a = enrollment_map.get(a.get("subjectId"), set())
            dept_a = str(a.get("department") or (sub_a or {}).get("department") or "").strip().lower()
            batch_a = str(a.get("batch") or (sub_a or {}).get("batch") or "").strip().lower()
            sem_a = str(a.get("semester") if a.get("semester") is not None else (sub_a or {}).get("semester", "")).strip()
            sec_a = _norm_sec_token(a.get("section") or (sub_a or {}).get("section"))

            for j in range(i + 1, len(slot_entries)):
                idx_b, b = slot_entries[j]
                if a.get("examId") and b.get("examId") and a.get("examId") == b.get("examId"):
                    continue
                sub_b = sub_map.get(b.get("subjectId"))
                set_b = enrollment_map.get(b.get("subjectId"), set())

                if set_a and set_b and (set_a & set_b):
                    student_clash_flags[idx_a] = True
                    student_clash_flags[idx_b] = True
                    continue

                dept_b = str(b.get("department") or (sub_b or {}).get("department") or "").strip().lower()
                if not dept_a or not dept_b or dept_a != dept_b:
                    continue

                batch_b = str(b.get("batch") or (sub_b or {}).get("batch") or "").strip().lower()
                sem_b = str(b.get("semester") if b.get("semester") is not None else (sub_b or {}).get("semester", "")).strip()
                sec_b = _norm_sec_token(b.get("section") or (sub_b or {}).get("section"))

                batch_ok = (not batch_a) or (not batch_b) or (batch_a == batch_b)
                sem_ok = (not sem_a) or (not sem_b) or (sem_a == sem_b)
                sec_ok = (not sec_a) or (not sec_b) or (sec_a == sec_b)

                if batch_ok and sem_ok and sec_ok:
                    student_clash_flags[idx_a] = True
                    student_clash_flags[idx_b] = True
                else:
                    dept_warning_flags[idx_a] = True
                    dept_warning_flags[idx_b] = True

    validation = validate_complete_exam_timetable(
        schedule_list,
        departments=departments_list,
        subjects=subjects_list,
        students=students_list,
        halls=halls_list,
        faculty=faculty_list,
        policy=active_policy,
    )
    same_day_ids = set(validation["oneExamPerDay"]["violatingExamIds"])
    gap_ids = set(validation["minimumExamGap"]["violatingExamIds"])
    indep_ids = set(validation["departmentIndependence"]["violatingExamIds"])

    updated = []
    student_clashes = 0
    department_warnings = 0
    invigilator_conflicts = 0
    capacity_violations = 0
    hall_double_bookings = 0
    total_enrolled = 0
    total_capacity = 0

    for idx, item in enumerate(schedule_list):
        slot = f"{item.get('date', '')}|{item.get('session', '')}"
        hall_id = item.get('hallId')
        inv_id = item.get('invigilatorId') or item.get('facultyId')
        enrolled = int(item.get('enrolledCount', 0))
        capacity = int(item.get('hallCapacity', 0))
        eid = str(item.get("examId") or item.get("id") or item.get("subjectId") or f"idx-{idx}")

        fac = fac_map.get(inv_id)
        hall_obj = hall_map.get(hall_id)
        has_student_clash = student_clash_flags[idx]
        has_dept_warning = (not has_student_clash) and dept_warning_flags[idx]
        has_hall_double = bool(hall_id and hall_slot_counts.get((slot, hall_id), 0) > 1)
        has_cap_issue = (capacity > 0 and enrolled > capacity) or (hall_obj is not None and not bool(hall_obj.get("available", True)))
        has_inv_conflict = bool(
            (inv_id and inv_slot_counts.get((slot, inv_id), 0) > 1)
            or (fac is not None and not bool(fac.get("available", 1)))
        )
        has_dept_date_violation = eid in same_day_ids
        has_dept_gap_violation = eid in gap_ids
        has_dept_indep_violation = eid in indep_ids

        if has_student_clash:
            student_clashes += 1
        if has_dept_warning:
            department_warnings += 1
        if has_inv_conflict:
            invigilator_conflicts += 1
        if has_cap_issue:
            capacity_violations += 1
        if has_hall_double:
            hall_double_bookings += 1

        total_enrolled += enrolled
        total_capacity += capacity

        cloned = dict(item)
        cloned["hasStudentClash"] = has_student_clash
        cloned["hasDepartmentWarning"] = has_dept_warning
        cloned["hasInvigilatorConflict"] = has_inv_conflict
        cloned["hasCapacityIssue"] = has_cap_issue
        cloned["hasHallDoubleBooking"] = has_hall_double
        cloned["hasDepartmentDateViolation"] = has_dept_date_violation
        cloned["hasDepartmentGapViolation"] = has_dept_gap_violation
        cloned["hasDepartmentIndependenceViolation"] = has_dept_indep_violation
        updated.append(cloned)

    avail_fac = [f for f in faculty_list if bool(f.get("available", 1))]
    pool = avail_fac if avail_fac else faculty_list
    workload_std_dev = 0.0
    if pool:
        counts = [fac_duty_counts.get(f["id"], 0) for f in pool]
        mean = sum(counts) / len(counts)
        variance = sum((c - mean) ** 2 for c in counts) / len(counts)
        workload_std_dev = round(variance ** 0.5, 2)

    dept_same_day_violations = validation["counts"]["departmentSameDayViolations"]
    dept_gap_violations = validation["counts"]["departmentGapViolations"]
    dept_indep_violations = validation["counts"]["departmentIndependenceViolations"]

    total_hard = (
        student_clashes
        + invigilator_conflicts
        + capacity_violations
        + hall_double_bookings
        + dept_same_day_violations
        + dept_gap_violations
        + dept_indep_violations
    )
    util_rate = round(min(100.0, (total_enrolled / total_capacity) * 100.0), 1) if total_capacity > 0 else 0.0
    conflicts = {
        "studentClashes": student_clashes,
        "departmentWarnings": department_warnings,
        "invigilatorConflicts": invigilator_conflicts,
        "capacityViolations": capacity_violations,
        "hallDoubleBookings": hall_double_bookings,
        "departmentSameDayViolations": dept_same_day_violations,
        "departmentGapViolations": dept_gap_violations,
        "departmentIndependenceViolations": dept_indep_violations,
        "validationWarnings": validation["warnings"],
        "departmentTimelines": validation["departmentTimelines"],
        "totalHardViolations": total_hard,
        "utilizationRate": util_rate,
        "workloadStdDev": workload_std_dev,
    }
    return updated, conflicts


def save_conflict_report_for_schedule(conn, schedule_id, schedule_list, conflicts):
    c = conn.cursor()
    flagged = [
        item for item in schedule_list
        if item.get("hasStudentClash")
        or item.get("hasInvigilatorConflict")
        or item.get("hasCapacityIssue")
        or item.get("hasHallDoubleBooking")
        or item.get("hasDepartmentDateViolation")
        or item.get("hasDepartmentGapViolation")
        or item.get("hasDepartmentIndependenceViolation")
    ]
    report_id = f"rep-{uuid.uuid4().hex[:8]}"
    c.execute(
        """
        INSERT INTO conflict_reports (
            id, schedule_id, student_clashes, invigilator_conflicts,
            capacity_violations, hall_double_bookings, total_hard_violations,
            utilization_rate, workload_std_dev, flagged_items_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report_id,
            schedule_id,
            int(conflicts.get("studentClashes", 0)),
            int(conflicts.get("invigilatorConflicts", 0)),
            int(conflicts.get("capacityViolations", 0)),
            int(conflicts.get("hallDoubleBookings", 0)),
            int(conflicts.get("totalHardViolations", 0)),
            float(conflicts.get("utilizationRate", 0)),
            float(conflicts.get("workloadStdDev", 0)),
            json.dumps(flagged),
        ),
    )
    return report_id


class ExamGridRequestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def parse_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                return json.loads(body)
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == '/api/health':
            self.send_json({"status": "ok", "service": "ExamGrid Python Backend"})
            return

        if path == '/api/overview/stats':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT COUNT(*) as cnt FROM students")
            total_students = c.fetchone()["cnt"]
            c.execute("SELECT COUNT(*) as cnt FROM departments")
            active_depts = c.fetchone()["cnt"]
            c.execute("SELECT COUNT(*) as cnt FROM faculty")
            total_faculty = c.fetchone()["cnt"]
            c.execute("SELECT COUNT(*) as cnt FROM halls")
            total_halls = c.fetchone()["cnt"]
            c.execute("SELECT COUNT(*) as cnt FROM subjects")
            total_subjects = c.fetchone()["cnt"]
            conn.close()
            self.send_json({
                "totalStudents": total_students,
                "activeDepartments": active_depts,
                "totalFaculty": total_faculty,
                "totalHalls": total_halls,
                "scheduledExams": total_subjects,
            })
            return

        if path == '/api/departments':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id, name FROM departments ORDER BY name ASC")
            rows = c.fetchall()
            conn.close()
            self.send_json([{"id": r["id"], "name": r["name"]} for r in rows])
            return

        if path == '/api/batches':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id, name FROM batches ORDER BY name ASC")
            rows = c.fetchall()
            conn.close()
            self.send_json([{"id": r["id"], "name": r["name"]} for r in rows])
            return

        if path == '/api/sections':
            dept = query.get('department', [None])[0]
            conn = get_connection()
            c = conn.cursor()
            if dept:
                c.execute("SELECT id, department, name FROM sections WHERE department = ? ORDER BY name ASC", (dept,))
            else:
                c.execute("SELECT id, department, name FROM sections ORDER BY department ASC, name ASC")
            rows = c.fetchall()
            conn.close()
            self.send_json([{"id": r["id"], "department": r["department"], "name": r["name"]} for r in rows])
            return

        if path == '/api/subjects':
            dept = query.get('department', [None])[0]
            conn = get_connection()
            c = conn.cursor()
            if dept:
                c.execute("SELECT * FROM subjects WHERE department = ? ORDER BY code ASC", (dept,))
            else:
                c.execute("SELECT * FROM subjects ORDER BY code ASC")
            rows = c.fetchall()
            conn.close()
            self.send_json([
                {
                    "id": r["id"],
                    "code": r["code"],
                    "name": r["name"],
                    "department": r["department"],
                    "batch": r["batch"],
                    "section": r["section"],
                    "semester": r["semester"],
                    "enrolledCount": r["enrolled_count"],
                }
                for r in rows
            ])
            return

        if path == '/api/halls':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM halls ORDER BY hall_number ASC")
            rows = c.fetchall()
            conn.close()
            self.send_json([
                {
                    "id": r["id"],
                    "hallNumber": r["hall_number"],
                    "building": r["building"],
                    "capacity": r["capacity"],
                    "available": bool(r["available"]),
                }
                for r in rows
            ])
            return

        if path == '/api/faculty':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM faculty ORDER BY name ASC")
            rows = c.fetchall()
            conn.close()
            self.send_json([
                {
                    "id": r["id"],
                    "employeeId": r["employee_id"],
                    "name": r["name"],
                    "department": r["department"],
                    "designation": r["designation"],
                    "email": r["email"],
                    "phone": r["phone"],
                    "available": bool(r["available"]),
                    "maxDuties": r["max_duties"],
                }
                for r in rows
            ])
            return

        if path == '/api/students/summary':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT COUNT(*) as total FROM students")
            total = c.fetchone()["total"]
            c.execute("SELECT department, COUNT(*) as count FROM students GROUP BY department ORDER BY department ASC")
            by_dept = [{"department": r["department"], "count": r["count"]} for r in c.fetchall()]
            c.execute("SELECT department, section, COUNT(*) as count FROM students GROUP BY department, section ORDER BY department ASC, section ASC")
            by_sec = [{"department": r["department"], "section": r["section"], "count": r["count"]} for r in c.fetchall()]
            conn.close()
            self.send_json({"totalStudents": total, "byDepartment": by_dept, "bySection": by_sec})
            return

        if path == '/api/students/query':
            dept = query.get('department', ['ALL'])[0]
            batch = query.get('batch', ['ALL'])[0]
            section = query.get('section', ['ALL'])[0]
            search = (query.get('search', [''])[0] or '').strip().lower()
            page = max(1, int(query.get('page', ['1'])[0] or 1))
            page_size = max(1, min(200, int(query.get('pageSize', ['25'])[0] or 25)))

            clauses = []
            params = []
            if dept and dept != 'ALL':
                clauses.append("department = ?")
                params.append(dept)
            if batch and batch != 'ALL':
                clauses.append("batch = ?")
                params.append(batch)
            if section and section != 'ALL':
                clauses.append("section = ?")
                params.append(section)
            if search:
                like_q = f"%{search}%"
                clauses.append("(LOWER(reg_no) LIKE ? OR LOWER(name) LIKE ? OR LOWER(department) LIKE ?)")
                params.extend([like_q, like_q, like_q])

            where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            conn = get_connection()
            c = conn.cursor()
            c.execute(f"SELECT COUNT(*) as cnt FROM students {where_sql}", tuple(params))
            total_count = c.fetchone()["cnt"]
            offset = (page - 1) * page_size
            c.execute(
                f"SELECT * FROM students {where_sql} ORDER BY reg_no ASC LIMIT ? OFFSET ?",
                tuple(params) + (page_size, offset),
            )
            rows = c.fetchall()
            conn.close()

            items = []
            for r in rows:
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"])
                except Exception:
                    sub_ids = []
                items.append({
                    "id": r["id"],
                    "regNo": r["reg_no"],
                    "name": r["name"],
                    "department": r["department"],
                    "section": r["section"],
                    "batch": r["batch"],
                    "semester": r["semester"],
                    "enrolledSubjectIds": sub_ids,
                })

            total_pages = max(1, (total_count + page_size - 1) // page_size)
            self.send_json({
                "items": items,
                "totalCount": total_count,
                "page": min(page, total_pages),
                "pageSize": page_size,
                "totalPages": total_pages,
            })
            return

        if path == '/api/students':
            dept = query.get('department', [None])[0]
            conn = get_connection()
            c = conn.cursor()
            if dept:
                c.execute("SELECT * FROM students WHERE department = ? ORDER BY reg_no ASC", (dept,))
            else:
                c.execute("SELECT * FROM students ORDER BY reg_no ASC")
            rows = c.fetchall()
            conn.close()
            result = []
            for r in rows:
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"])
                except Exception:
                    sub_ids = []
                result.append({
                    "id": r["id"],
                    "regNo": r["reg_no"],
                    "name": r["name"],
                    "department": r["department"],
                    "section": r["section"],
                    "batch": r["batch"],
                    "semester": r["semester"],
                    "enrolledSubjectIds": sub_ids,
                })
            self.send_json(result)
            return

        if path == '/api/subsections/latest':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM subsections ORDER BY created_at DESC LIMIT 20")
            rows = c.fetchall()
            conn.close()
            self.send_json([
                {
                    "id": r["id"],
                    "department": r["department"],
                    "subsectionCount": r["subsection_count"],
                    "totalStudents": r["total_students"],
                    "assignments": json.loads(r["assignments_json"]),
                    "createdAt": r["created_at"],
                }
                for r in rows
            ])
            return

        if path == '/api/hall-allocations':
            conn = get_connection()
            c = conn.cursor()
            rows = _fetch_all_hall_allocations_from_conn(c)[:100]
            conn.close()
            self.send_json(rows)
            return

        if path == '/api/hall-allocation/report':
            alloc_id = query.get('allocationId', [None])[0]
            report_format = str(query.get('format', ['ALL'])[0] or 'ALL').strip().upper()
            dept_filter = str(query.get('department', ['ALL'])[0] or 'ALL').strip()
            exam_date = query.get('examDate', [None])[0]
            session_val = query.get('session', [None])[0]

            conn = get_connection()
            c = conn.cursor()
            if alloc_id:
                c.execute("SELECT * FROM hall_allocations WHERE id = ?", (alloc_id,))
                row = c.fetchone()
            elif exam_date and session_val:
                c.execute(
                    "SELECT * FROM hall_allocations WHERE exam_date = ? AND session = ? ORDER BY rowid DESC LIMIT 1",
                    (exam_date, session_val),
                )
                row = c.fetchone()
            elif exam_date:
                c.execute(
                    "SELECT * FROM hall_allocations WHERE exam_date = ? ORDER BY rowid DESC LIMIT 1",
                    (exam_date,),
                )
                row = c.fetchone()
            else:
                c.execute("SELECT * FROM hall_allocations ORDER BY rowid DESC LIMIT 1")
                row = c.fetchone()
            conn.close()

            if not row:
                self.send_json({"error": "No confirmed hall allocation found for the requested criteria."}, status=404)
                return

            plan = _serialize_hall_allocation_row(row)
            dept_wise = build_department_wise_report_rows(plan, dept_filter)
            combined = build_combined_hall_report_rows(plan)
            individual = build_individual_student_report_rows(plan)

            response_payload = {
                "allocationId": plan["id"],
                "examDate": plan["examDate"],
                "session": plan["session"],
                "selectedDepartments": plan["selectedDepartments"],
                "targetMode": plan["targetMode"],
                "targetPercentage": plan["targetPercentage"],
                "maxDeptsPerHall": plan["maxDeptsPerHall"],
                "totalStudents": plan["totalStudents"],
                "totalAllocated": plan["totalAllocated"],
                "hallsRequired": plan["hallsRequired"],
                "remainingAvailableCapacity": plan["remainingAvailableCapacity"],
            }
            if report_format == 'DEPT_WISE':
                response_payload["rows"] = dept_wise
            elif report_format == 'COMBINED':
                response_payload["rows"] = combined
            elif report_format == 'INDIVIDUAL':
                response_payload["rows"] = individual
            else:
                response_payload["departmentWise"] = dept_wise
                response_payload["combined"] = combined
                response_payload["individual"] = individual
            self.send_json(response_payload)
            return

        if path.startswith('/api/hall-allocation/student/'):
            reg_no = urllib.parse.unquote(path.split('/api/hall-allocation/student/', 1)[1].strip('/'))
            exam_date = query.get('examDate', [None])[0]
            session_val = query.get('session', [None])[0]
            if not reg_no:
                self.send_json({"error": "Registration number is required."}, status=400)
                return

            conn = get_connection()
            c = conn.cursor()
            records = _fetch_all_hall_allocations_from_conn(c)
            conn.close()

            matches = lookup_student_hall_assignments(
                reg_no,
                records,
                exam_date=exam_date,
                session=session_val,
            )
            if not matches:
                self.send_json(
                    {
                        "found": False,
                        "registrationNumber": reg_no,
                        "assignments": [],
                        "error": f"No hall allocation found for registration number '{reg_no}'.",
                    },
                    status=404,
                )
                return

            self.send_json(
                {
                    "found": True,
                    "registrationNumber": matches[0]["regNo"],
                    "studentName": matches[0]["studentName"],
                    "department": matches[0]["department"],
                    "hallNumber": matches[0]["hallNumber"],
                    "building": matches[0]["building"],
                    "seatNumber": matches[0]["seatNumber"],
                    "assignments": matches,
                }
            )
            return

        if path == '/api/scheduler/policy':
            self.send_json(get_stored_scheduling_policy())
            return

        if path == '/api/scheduler/ga-config':
            self.send_json(get_stored_ga_config())
            return

        if path == '/api/scheduler/latest':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM schedules ORDER BY rowid DESC LIMIT 1")
            row = c.fetchone()
            conn.close()
            if not row:
                self.send_json({"hasSchedule": False, "schedule": []})
                return
            try:
                history = json.loads(row["history_json"] or "[]")
            except Exception:
                history = []
            try:
                conflicts = json.loads(row["conflicts_json"] or "{}")
            except Exception:
                conflicts = {}
            self.send_json({
                "hasSchedule": True,
                "scheduleId": row["id"],
                "fitness": row["fitness"],
                "hardConflicts": row["hard_conflicts"],
                "softScore": row["soft_score"],
                "history": history,
                "conflicts": conflicts,
                "convergedAtGeneration": row["converged_at_generation"] or 0,
                "executionTimeMs": row["execution_time_ms"] or 0,
                "scope": row["scope"] or "ALL",
                "schedule": json.loads(row["schedule_json"]),
            })
            return

        if path.startswith('/api/schedules/'):
            sched_id = urllib.parse.unquote(path.split('/api/schedules/', 1)[1].strip('/'))
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM schedules WHERE id = ?", (sched_id,))
            row = c.fetchone()
            conn.close()
            if not row:
                self.send_json({"error": "Schedule not found"}, status=404)
                return
            try:
                history = json.loads(row["history_json"] or "[]")
            except Exception:
                history = []
            try:
                conflicts = json.loads(row["conflicts_json"] or "{}")
            except Exception:
                conflicts = {}
            self.send_json({
                "hasSchedule": True,
                "scheduleId": row["id"],
                "bestFitness": row["fitness"],
                "history": history,
                "conflicts": conflicts,
                "convergedAtGeneration": row["converged_at_generation"] or 0,
                "executionTimeMs": row["execution_time_ms"] or 0,
                "scope": row["scope"] or "ALL",
                "schedule": json.loads(row["schedule_json"]),
            })
            return

        if path == '/api/optimization-runs':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM optimization_runs ORDER BY rowid DESC LIMIT 25")
            rows = c.fetchall()
            conn.close()
            self.send_json([
                {
                    "id": r["id"],
                    "scheduleId": r["schedule_id"],
                    "scope": r["scope"],
                    "executionMode": r["execution_mode"],
                    "status": r["status"],
                    "bestFitness": r["best_fitness"],
                    "convergedAtGeneration": r["converged_at_generation"],
                    "executionTimeMs": r["execution_time_ms"],
                    "populationSize": r["population_size"],
                    "generations": r["generations"],
                    "mutationRate": r["mutation_rate"],
                    "crossoverRate": r["crossover_rate"],
                    "constraintConfig": json.loads(r["constraint_config_json"] or "{}"),
                    "conflicts": json.loads(r["conflicts_json"] or "{}"),
                    "constraintReport": json.loads(r["constraint_report_json"] or "{}"),
                    "createdAt": r["created_at"],
                }
                for r in rows
            ])
            return

        if path == '/api/conflict-reports/latest':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM conflict_reports ORDER BY rowid DESC LIMIT 1")
            row = c.fetchone()
            conn.close()
            if not row:
                self.send_json({"hasReport": False})
                return
            self.send_json({
                "hasReport": True,
                "id": row["id"],
                "scheduleId": row["schedule_id"],
                "studentClashes": row["student_clashes"],
                "invigilatorConflicts": row["invigilator_conflicts"],
                "capacityViolations": row["capacity_violations"],
                "hallDoubleBookings": row["hall_double_bookings"],
                "totalHardViolations": row["total_hard_violations"],
                "utilizationRate": row["utilization_rate"],
                "workloadStdDev": row["workload_std_dev"],
                "flaggedItems": json.loads(row["flagged_items_json"] or "[]"),
                "createdAt": row["created_at"],
            })
            return

        if path == '/api/reports/timetable.csv':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM schedules ORDER BY rowid DESC LIMIT 1")
            row = c.fetchone()
            conn.close()
            schedule = json.loads(row["schedule_json"]) if row else []
            headers = [
                "Date", "Session", "Subject Code", "Subject Name", "Department",
                "Enrolled Students", "Hall Number", "Hall Capacity",
                "Assigned Invigilator", "Invigilator Dept", "Status"
            ]
            rows = []
            for item in schedule:
                has_conflict = item.get("hasStudentClash") or item.get("hasInvigilatorConflict") or item.get("hasCapacityIssue") or item.get("hasHallDoubleBooking")
                cells = [
                    str(item.get("date", "")),
                    str(item.get("session", "")),
                    str(item.get("subjectCode", "")),
                    str(item.get("subjectName", "")),
                    str(item.get("department", "")),
                    str(item.get("enrolledCount", 0)),
                    str(item.get("hallNumber", "")),
                    str(item.get("hallCapacity", 0)),
                    str(item.get("invigilatorName", "")),
                    str(item.get("invigilatorDept", "")),
                    "Conflict Detected" if has_conflict else "Conflict-Free",
                ]
                rows.append(",".join(f'"{c}"' if "," in c else c for c in cells))
            csv_text = "\ufeff" + ",".join(headers) + "\n" + "\n".join(rows)
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename=examgrid_timetable_report.csv')
            self.end_headers()
            self.wfile.write(csv_text.encode('utf-8'))
            return

        if path == '/api/auth/audit/password-reset':
            uid_filter = query.get('firebaseUid', [None])[0]
            outcome_filter = query.get('outcome', [None])[0]
            event_filter = query.get('eventType', [None])[0]
            limit_val = int(query.get('limit', ['100'])[0] or 100)
            conn = get_connection()
            try:
                logs = list_password_reset_audit_logs(
                    conn,
                    firebase_uid=uid_filter,
                    outcome=outcome_filter,
                    event_type=event_filter,
                    limit=limit_val,
                )
                summary = get_password_reset_audit_summary(conn, firebase_uid=uid_filter)
            finally:
                conn.close()
            self.send_json({"logs": logs, "summary": summary})
            return

        if path == '/api/admin/me':
            email_val = query.get('email', [self.headers.get('X-Admin-Email', '')])[0]
            uid_val = query.get('uid', [self.headers.get('X-Admin-Uid', '')])[0]
            conn = get_connection()
            try:
                info = resolve_requester_admin(conn, email=email_val, uid=uid_val, bootstrap=True)
            finally:
                conn.close()
            self.send_json(info)
            return

        if path == '/api/admin/accounts':
            req_email = query.get('requesterEmail', [self.headers.get('X-Admin-Email', '')])[0]
            req_uid = query.get('requesterUid', [self.headers.get('X-Admin-Uid', '')])[0]
            conn = get_connection()
            try:
                result = list_admin_accounts(
                    conn,
                    requester_email=req_email,
                    requester_uid=req_uid,
                )
            finally:
                conn.close()
            self.send_json(result)
            return

        if path == '/api/admin/audit-logs':
            req_email = query.get('requesterEmail', [self.headers.get('X-Admin-Email', '')])[0]
            req_uid = query.get('requesterUid', [self.headers.get('X-Admin-Uid', '')])[0]
            category = query.get('category', [''])[0]
            outcome = query.get('outcome', [''])[0]
            search = query.get('search', [''])[0]
            limit_val = int(query.get('limit', ['50'])[0] or 50)
            offset_val = int(query.get('offset', ['0'])[0] or 0)
            conn = get_connection()
            try:
                requester = resolve_requester_admin(conn, email=req_email, uid=req_uid, bootstrap=False)
                if not requester["isSuperAdmin"]:
                    self.send_json(
                        {
                            "error": "Access Denied: Only Super Administrators can view system audit logs.",
                            "requesterRole": requester["role"],
                        },
                        status=403,
                    )
                    return
                payload = list_unified_system_audit_logs(
                    conn,
                    category=category or None,
                    outcome=outcome or None,
                    search=search or None,
                    limit=limit_val,
                    offset=offset_val,
                )
            finally:
                conn.close()
            self.send_json(payload)
            return

        self.send_json({"error": "Not Found"}, status=404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path == '/api/departments':
            dept_id = body.get('id') or f"dept-{uuid.uuid4().hex[:8]}"
            name = str(body.get('name', '')).strip()
            if not name:
                self.send_json({"error": "Department name is required."}, status=400)
                return
            initial_sections = body.get('initialSections') or ['Section A', 'Section B']
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id FROM departments WHERE LOWER(name) = LOWER(?)", (name,))
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Department '{name}' already exists."}, status=409)
                return
            try:
                c.execute("INSERT INTO departments (id, name) VALUES (?, ?)", (dept_id, name))
                created_sections = []
                for sec_name in initial_sections:
                    clean_sec = str(sec_name).strip()
                    if not clean_sec:
                        continue
                    sec_id = f"sec-{uuid.uuid4().hex[:8]}"
                    c.execute(
                        "INSERT OR IGNORE INTO sections (id, department, name) VALUES (?, ?, ?)",
                        (sec_id, name, clean_sec),
                    )
                    created_sections.append({"id": sec_id, "department": name, "name": clean_sec})
                conn.commit()
                conn.close()
                self.send_json({"id": dept_id, "name": name, "sections": created_sections})
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Department '{name}' already exists."}, status=409)
            return

        if path == '/api/batches':
            batch_id = body.get('id') or f"batch-{uuid.uuid4().hex[:8]}"
            name = str(body.get('name', '')).strip()
            if not name:
                self.send_json({"error": "Batch name is required."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id FROM batches WHERE LOWER(name) = LOWER(?)", (name,))
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Batch '{name}' already exists."}, status=409)
                return
            try:
                c.execute("INSERT INTO batches (id, name) VALUES (?, ?)", (batch_id, name))
                conn.commit()
                conn.close()
                self.send_json({"id": batch_id, "name": name})
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Batch '{name}' already exists."}, status=409)
            return

        if path == '/api/sections':
            sec_id = body.get('id') or f"sec-{uuid.uuid4().hex[:8]}"
            department = str(body.get('department', '')).strip()
            name = str(body.get('name', '')).strip()
            if not department or not name:
                self.send_json({"error": "Department and section name are required."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            c.execute(
                "SELECT id FROM sections WHERE LOWER(department) = LOWER(?) AND LOWER(name) = LOWER(?)",
                (department, name),
            )
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Section '{name}' already exists in {department}."}, status=409)
                return
            try:
                c.execute(
                    "INSERT INTO sections (id, department, name) VALUES (?, ?, ?)",
                    (sec_id, department, name),
                )
                conn.commit()
                conn.close()
                self.send_json({"id": sec_id, "department": department, "name": name})
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Section '{name}' already exists in {department}."}, status=409)
            return

        if path == '/api/subjects':
            sub_id = body.get('id') or f"sub-{uuid.uuid4().hex[:8]}"
            code = str(body.get('code', '')).strip().upper()
            name = str(body.get('name', '')).strip()
            if not code or not name:
                self.send_json({"error": "Subject code and name are required."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id FROM subjects WHERE LOWER(code) = LOWER(?)", (code,))
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Subject code '{code}' already exists."}, status=409)
                return
            try:
                payload = {
                    "id": sub_id,
                    "code": code,
                    "name": name,
                    "department": body.get('department', ''),
                    "batch": body.get('batch', '2024'),
                    "section": body.get('section', 'Section A'),
                    "semester": int(body.get('semester', 1)),
                    "enrolledCount": int(body.get('enrolledCount', 50)),
                }
                c.execute(
                    """
                    INSERT INTO subjects (id, code, name, department, batch, section, semester, enrolled_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["id"],
                        payload["code"],
                        payload["name"],
                        payload["department"],
                        payload["batch"],
                        payload["section"],
                        payload["semester"],
                        payload["enrolledCount"],
                    )
                )
                conn.commit()
                conn.close()
                self.send_json(payload)
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Subject code '{code}' already exists."}, status=409)
            return

        if path == '/api/halls':
            hall_id = body.get('id') or f"hall-{uuid.uuid4().hex[:8]}"
            hall_number = str(body.get('hallNumber', '')).strip().upper()
            if not hall_number:
                self.send_json({"error": "Hall number is required."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id FROM halls WHERE LOWER(hall_number) = LOWER(?)", (hall_number,))
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Hall '{hall_number}' already exists."}, status=409)
                return
            try:
                payload = {
                    "id": hall_id,
                    "hallNumber": hall_number,
                    "building": str(body.get('building', 'Main Academic Block')).strip(),
                    "capacity": int(body.get('capacity', 60)),
                    "available": bool(body.get('available', True)),
                }
                c.execute(
                    "INSERT INTO halls (id, hall_number, building, capacity, available) VALUES (?, ?, ?, ?, ?)",
                    (
                        payload["id"],
                        payload["hallNumber"],
                        payload["building"],
                        payload["capacity"],
                        1 if payload["available"] else 0,
                    )
                )
                conn.commit()
                conn.close()
                self.send_json(payload)
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Hall '{hall_number}' already exists."}, status=409)
            return

        if path == '/api/faculty':
            fac_id = body.get('id') or f"fac-{uuid.uuid4().hex[:8]}"
            employee_id = str(body.get('employeeId', '')).strip().upper()
            name = str(body.get('name', '')).strip()
            if not employee_id or not name:
                self.send_json({"error": "Faculty employee ID and name are required."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id FROM faculty WHERE LOWER(employee_id) = LOWER(?)", (employee_id,))
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Faculty ID '{employee_id}' already exists."}, status=409)
                return
            try:
                payload = {
                    "id": fac_id,
                    "employeeId": employee_id,
                    "name": name,
                    "department": body.get('department', ''),
                    "designation": body.get('designation', 'Assistant Prof.'),
                    "email": str(body.get('email', '')).strip(),
                    "phone": str(body.get('phone', '')).strip(),
                    "available": bool(body.get('available', True)),
                    "maxDuties": int(body.get('maxDuties', 4)),
                }
                c.execute(
                    """
                    INSERT INTO faculty (id, employee_id, name, department, designation, email, phone, available, max_duties)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["id"],
                        payload["employeeId"],
                        payload["name"],
                        payload["department"],
                        payload["designation"],
                        payload["email"],
                        payload["phone"],
                        1 if payload["available"] else 0,
                        payload["maxDuties"],
                    )
                )
                conn.commit()
                conn.close()
                self.send_json(payload)
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Faculty ID '{employee_id}' already exists."}, status=409)
            return

        if path == '/api/students':
            stu_id = body.get('id') or f"stu-{uuid.uuid4().hex[:8]}"
            reg_no = str(body.get('regNo', '')).strip().upper()
            name = str(body.get('name', '')).strip()
            if not reg_no or not name:
                self.send_json({"error": "Student registration number and name are required."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id FROM students WHERE LOWER(reg_no) = LOWER(?)", (reg_no,))
            if c.fetchone():
                conn.close()
                self.send_json({"error": f"Registration number '{reg_no}' already exists."}, status=409)
                return
            try:
                payload = {
                    "id": stu_id,
                    "regNo": reg_no,
                    "name": name,
                    "department": body.get('department', ''),
                    "section": body.get('section', 'Section A'),
                    "batch": body.get('batch', '2024'),
                    "semester": int(body.get('semester', 1)),
                    "enrolledSubjectIds": body.get('enrolledSubjectIds', []),
                }
                c.execute(
                    """
                    INSERT INTO students (id, reg_no, name, department, section, batch, semester, enrolled_subject_ids)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["id"],
                        payload["regNo"],
                        payload["name"],
                        payload["department"],
                        payload["section"],
                        payload["batch"],
                        payload["semester"],
                        json.dumps(payload["enrolledSubjectIds"]),
                    )
                )
                conn.commit()
                conn.close()
                self.send_json(payload)
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({"error": f"Registration number '{reg_no}' already exists."}, status=409)
            return

        if path == '/api/subsections/divide':
            dept = body.get('department')
            count = int(body.get('subsectionCount', 3))
            apply_to_db = bool(body.get('applyToDatabase', False))

            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM students WHERE department = ?", (dept,))
            rows = c.fetchall()
            students = [
                {
                    "id": r["id"],
                    "regNo": r["reg_no"],
                    "name": r["name"],
                    "department": r["department"],
                    "section": r["section"],
                    "batch": r["batch"],
                    "semester": r["semester"],
                }
                for r in rows
            ]

            result = divide_department_students(students, dept, count)
            if apply_to_db:
                for stu in result["assignedStudents"]:
                    c.execute("UPDATE students SET section = ? WHERE id = ?", (stu["section"], stu["id"]))
                sub_id = f"subsec-{uuid.uuid4().hex[:8]}"
                assignments = [
                    {
                        "studentId": s["id"],
                        "regNo": s["regNo"],
                        "name": s["name"],
                        "subsection": s["section"],
                    }
                    for s in result["assignedStudents"]
                ]
                c.execute(
                    """
                    INSERT INTO subsections (id, department, subsection_count, total_students, assignments_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (sub_id, dept, count, result["totalStudents"], json.dumps(assignments)),
                )
                conn.commit()
            conn.close()
            self.send_json(result)
            return

        if path == '/api/scheduler/validate':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id, name FROM departments")
            depts = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, code, name, department, batch, section, semester, enrolled_count FROM subjects")
            subs = [dict(r) for r in c.fetchall()]
            for s in subs:
                s["enrolledCount"] = s["enrolled_count"]
            c.execute("SELECT id, hall_number, capacity, available FROM halls")
            halls = [
                {"id": r["id"], "hallNumber": r["hall_number"], "capacity": r["capacity"], "available": bool(r["available"])}
                for r in c.fetchall()
            ]
            c.execute("SELECT id, name, department, available, max_duties FROM faculty")
            facs = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, reg_no, enrolled_subject_ids FROM students")
            stus = []
            for r in c.fetchall():
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"] or "[]")
                except Exception:
                    sub_ids = []
                stus.append({"id": r["id"], "regNo": r["reg_no"], "enrolledSubjectIds": sub_ids})

            sched = body.get("schedule")
            if sched is None:
                c.execute("SELECT schedule_json FROM schedules ORDER BY rowid DESC LIMIT 1")
                row = c.fetchone()
                sched = json.loads(row["schedule_json"]) if row else []
            conn.close()

            policy = normalize_scheduling_policy(body.get("policy") or body.get("constraintConfig") or get_stored_scheduling_policy())
            validation = validate_complete_exam_timetable(
                sched,
                departments=depts,
                subjects=subs,
                students=stus,
                halls=halls,
                faculty=facs,
                policy=policy,
            )
            self.send_json(validation)
            return

        if path == '/api/scheduler/run':
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id, name FROM departments")
            depts = [dict(r) for r in c.fetchall()]
            c.execute("SELECT * FROM subjects")
            subs = [dict(r) for r in c.fetchall()]
            for s in subs:
                s["enrolledCount"] = s["enrolled_count"]
            c.execute("SELECT * FROM halls")
            halls = [dict(r) for r in c.fetchall()]
            for h in halls:
                h["hallNumber"] = h["hall_number"]
                h["available"] = bool(h.get("available", 1))
            c.execute("SELECT * FROM faculty")
            facs = [dict(r) for r in c.fetchall()]
            for f in facs:
                f["maxDuties"] = f["max_duties"]
                f["available"] = bool(f.get("available", 1))
            c.execute("SELECT id, reg_no, enrolled_subject_ids FROM students")
            stus = []
            for r in c.fetchall():
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"] or "[]")
                except Exception:
                    sub_ids = []
                stus.append({"id": r["id"], "regNo": r["reg_no"], "enrolledSubjectIds": sub_ids})
            conn.close()

            scope = body.get("scope", "ALL")
            if scope == "SINGLE_DAY" and body.get("selectedSubjectIds"):
                sub_set = set(body.get("selectedSubjectIds") or [])
                subs = [s for s in subs if s.get("id") in sub_set]
            elif scope == "SELECTED" and body.get("selectedDepartments"):
                dept_set = set(body.get("selectedDepartments") or [])
                subs = [s for s in subs if s.get("department") in dept_set]
                if body.get("selectedCourses"):
                    course_set = set(body.get("selectedCourses") or [])
                    subs = [s for s in subs if s.get("code") in course_set or s.get("name") in course_set]
                if body.get("selectedSections"):
                    sec_set = set(body.get("selectedSections") or [])
                    subs = [s for s in subs if s.get("section") in sec_set]
                if body.get("selectedBatches"):
                    batch_set = set(body.get("selectedBatches") or [])
                    subs = [s for s in subs if s.get("batch") in batch_set]

            policy = normalize_scheduling_policy(body.get("policy") or body.get("constraintConfig") or get_stored_scheduling_policy())
            exams = [{"id": f"exam-{i+1}", "subjectId": s["id"], "durationMinutes": 180} for i, s in enumerate(subs)]
            result = run_genetic_algorithm(
                exams,
                subs,
                halls,
                facs,
                {**body, "policy": policy},
                students=stus,
                departments=depts,
            )
            effective_policy = dict(policy)
            if scope == "SINGLE_DAY":
                effective_policy["minGapDaysBetweenExams"] = 0

            updated_sched, conflicts = compute_schedule_conflicts(
                result["bestSchedule"],
                facs,
                subjects_list=subs,
                students_list=stus,
                departments_list=depts,
                halls_list=halls,
                policy=effective_policy,
            )
            validation = validate_complete_exam_timetable(
                updated_sched,
                departments=depts,
                subjects=subs,
                students=stus,
                halls=halls,
                faculty=facs,
                policy=effective_policy,
            )

            sched_id = f"sched-{uuid.uuid4().hex[:8]}"
            history = result.get("fitnessHistory", [])
            conn = get_connection()
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO schedules (
                    id, schedule_json, fitness, hard_conflicts, soft_score,
                    history_json, conflicts_json, converged_at_generation, execution_time_ms, scope
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sched_id,
                    json.dumps(updated_sched),
                    result["fitness"],
                    conflicts["totalHardViolations"],
                    result["softScore"],
                    json.dumps(history),
                    json.dumps(conflicts),
                    len(history),
                    0,
                    scope,
                )
            )
            tt_id = f"tt-{uuid.uuid4().hex[:8]}"
            c.execute(
                "INSERT INTO timetables (id, schedule_id, entries_json, scope) VALUES (?, ?, ?, ?)",
                (tt_id, sched_id, json.dumps(updated_sched), scope),
            )
            save_conflict_report_for_schedule(conn, sched_id, updated_sched, conflicts)
            conn.commit()
            conn.close()

            self.send_json({
                "scheduleId": sched_id,
                "fitness": result["fitness"],
                "hardConflicts": conflicts["totalHardViolations"],
                "softScore": result["softScore"],
                "fitnessHistory": history,
                "conflicts": conflicts,
                "validation": validation,
                "policy": policy,
                "isConflictFree": conflicts["totalHardViolations"] == 0,
                "bestSchedule": updated_sched,
                "scope": scope,
            })
            return

        if path == '/api/scheduler/save':
            sched_id = body.get('scheduleId') or f"sched-{uuid.uuid4().hex[:8]}"
            sched_list = body.get('schedule', [])
            history = body.get('history', [])
            conflicts = body.get('conflicts', {})
            fitness = float(body.get('bestFitness', 0))
            converged = int(body.get('convergedAtGeneration', len(history)))
            exec_ms = float(body.get('executionTimeMs', 0))
            scope = str(body.get('scope', 'ALL'))
            allow_override = bool(body.get('allowOverride', False))

            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT id, name FROM departments")
            depts = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, code, name, department, batch, section, semester, enrolled_count FROM subjects")
            subs = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, hall_number, capacity, available FROM halls")
            halls = [{"id": r["id"], "hallNumber": r["hall_number"], "capacity": r["capacity"], "available": bool(r["available"])} for r in c.fetchall()]
            c.execute("SELECT id, name, department, available, max_duties FROM faculty")
            facs = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, reg_no, enrolled_subject_ids FROM students")
            stus = []
            for r in c.fetchall():
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"] or "[]")
                except Exception:
                    sub_ids = []
                stus.append({"id": r["id"], "regNo": r["reg_no"], "enrolledSubjectIds": sub_ids})

            policy = normalize_scheduling_policy(body.get("policy") or body.get("constraintConfig") or get_stored_scheduling_policy())
            effective_policy = dict(policy)
            if scope == "SINGLE_DAY":
                effective_policy["minGapDaysBetweenExams"] = 0

            validation = validate_complete_exam_timetable(
                sched_list,
                departments=depts,
                subjects=subs,
                students=stus,
                halls=halls,
                faculty=facs,
                policy=effective_policy,
            )
            if body.get("strictValidation") and not validation["isValid"] and not allow_override:
                conn.close()
                msg = validation["warnings"][0] if validation["warnings"] else "Schedule violates active department exam date policy."
                self.send_json({"error": msg, "detail": msg, "validation": validation}, status=422)
                return

            updated_sched, computed_conflicts = compute_schedule_conflicts(
                sched_list,
                facs,
                subjects_list=subs,
                students_list=stus,
                departments_list=depts,
                halls_list=halls,
                policy=effective_policy,
            )
            final_conflicts = computed_conflicts if sched_list else conflicts

            c.execute(
                """
                INSERT OR REPLACE INTO schedules (
                    id, schedule_json, fitness, hard_conflicts, soft_score,
                    history_json, conflicts_json, converged_at_generation, execution_time_ms, scope
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sched_id,
                    json.dumps(updated_sched),
                    fitness,
                    int(final_conflicts.get('totalHardViolations', 0)),
                    0,
                    json.dumps(history),
                    json.dumps(final_conflicts),
                    converged,
                    exec_ms,
                    scope,
                )
            )
            tt_id = f"tt-{sched_id}"
            c.execute(
                "INSERT OR REPLACE INTO timetables (id, schedule_id, entries_json, scope) VALUES (?, ?, ?, ?)",
                (tt_id, sched_id, json.dumps(updated_sched), scope),
            )
            save_conflict_report_for_schedule(conn, sched_id, updated_sched, final_conflicts)
            conn.commit()
            conn.close()
            self.send_json({"success": True, "scheduleId": sched_id, "validation": validation, "conflicts": final_conflicts})
            return

        if path == '/api/scheduler/override-faculty':
            exam_id = body.get('examId')
            fac_id = body.get('facultyId')
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM faculty WHERE id = ?", (fac_id,))
            fac = c.fetchone()
            if not fac:
                conn.close()
                self.send_json({"error": "Faculty not found"}, status=404)
                return

            c.execute("SELECT * FROM faculty")
            all_facs = [dict(r) for r in c.fetchall()]

            c.execute("SELECT * FROM schedules ORDER BY rowid DESC LIMIT 1")
            row = c.fetchone()
            if not row:
                conn.close()
                self.send_json({"error": "No schedule found"}, status=404)
                return

            sched = json.loads(row["schedule_json"])
            found = False
            for item in sched:
                if item.get("examId") == exam_id:
                    item["invigilatorId"] = fac["id"]
                    item["facultyId"] = fac["id"]
                    item["invigilatorName"] = fac["name"]
                    item["invigilatorDept"] = fac["department"]
                    found = True
                    break

            if not found:
                conn.close()
                self.send_json({"error": "Exam entry not found in schedule"}, status=404)
                return

            updated_sched, conflicts = compute_schedule_conflicts(sched, all_facs)
            c.execute(
                "UPDATE schedules SET schedule_json = ?, hard_conflicts = ?, conflicts_json = ? WHERE id = ?",
                (json.dumps(updated_sched), conflicts["totalHardViolations"], json.dumps(conflicts), row["id"]),
            )
            c.execute(
                "UPDATE timetables SET entries_json = ?, updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ?",
                (json.dumps(updated_sched), row["id"]),
            )
            save_conflict_report_for_schedule(conn, row["id"], updated_sched, conflicts)
            conn.commit()
            conn.close()
            self.send_json({"success": True, "updatedSchedule": updated_sched, "conflicts": conflicts})
            return

        if path == '/api/scheduler/batch-update':
            updates_list = body.get('updates') or []
            if not isinstance(updates_list, list) or len(updates_list) == 0:
                self.send_json({"error": "At least one schedule update is required."}, status=400)
                return

            allow_override = bool(body.get('allowOverride', False))
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM schedules ORDER BY rowid DESC LIMIT 1")
            row = c.fetchone()
            if not row:
                conn.close()
                self.send_json({"error": "No schedule found"}, status=404)
                return

            c.execute("SELECT id, name FROM departments")
            depts = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, code, name, department, batch, section, semester, enrolled_count FROM subjects")
            subs = [dict(r) for r in c.fetchall()]
            c.execute("SELECT * FROM halls")
            all_halls = [dict(r) for r in c.fetchall()]
            halls_map = {h["id"]: h for h in all_halls}
            c.execute("SELECT * FROM faculty")
            all_facs = [dict(r) for r in c.fetchall()]
            facs_map = {f["id"]: f for f in all_facs}
            c.execute("SELECT id, reg_no, enrolled_subject_ids FROM students")
            stus = []
            for r in c.fetchall():
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"] or "[]")
                except Exception:
                    sub_ids = []
                stus.append({"id": r["id"], "regNo": r["reg_no"], "enrolledSubjectIds": sub_ids})

            sched = json.loads(row["schedule_json"])
            updates_by_exam = {u.get("examId"): u for u in updates_list if u.get("examId")}
            applied_count = 0

            for item in sched:
                patch = updates_by_exam.get(item.get("examId"))
                if not patch:
                    continue
                if patch.get("date"):
                    item["date"] = patch["date"]
                if patch.get("session"):
                    item["session"] = patch["session"]
                hall_id = patch.get("hallId")
                if hall_id and hall_id in halls_map:
                    h = halls_map[hall_id]
                    item["hallId"] = h["id"]
                    item["hallNumber"] = h["hall_number"]
                    item["hallCapacity"] = h["capacity"]
                inv_id = patch.get("invigilatorId")
                if inv_id and inv_id in facs_map:
                    f = facs_map[inv_id]
                    item["invigilatorId"] = f["id"]
                    item["facultyId"] = f["id"]
                    item["invigilatorName"] = f["name"]
                    item["invigilatorDept"] = f["department"]
                applied_count += 1

            if applied_count == 0:
                conn.close()
                self.send_json({"error": "No matching exam slots found for batch update."}, status=404)
                return

            policy = normalize_scheduling_policy(body.get("policy") or get_stored_scheduling_policy())
            validation = validate_complete_exam_timetable(
                sched,
                departments=depts,
                subjects=subs,
                students=stus,
                halls=[{"id": h["id"], "hallNumber": h["hall_number"], "capacity": h["capacity"], "available": bool(h.get("available", 1))} for h in all_halls],
                faculty=all_facs,
                policy=policy,
            )
            dept_violation_count = (
                validation["counts"]["departmentSameDayViolations"]
                + validation["counts"]["departmentGapViolations"]
                + validation["counts"]["departmentIndependenceViolations"]
            )
            if dept_violation_count > 0 and not allow_override:
                conn.close()
                msg = validation["warnings"][0] if validation["warnings"] else "Batch update violates department scheduling policy."
                self.send_json({"error": msg, "detail": msg, "validation": validation}, status=422)
                return

            updated_sched, conflicts = compute_schedule_conflicts(
                sched,
                all_facs,
                subjects_list=subs,
                students_list=stus,
                departments_list=depts,
                halls_list=[{"id": h["id"], "hallNumber": h["hall_number"], "capacity": h["capacity"], "available": bool(h.get("available", 1))} for h in all_halls],
                policy=policy,
            )
            c.execute(
                "UPDATE schedules SET schedule_json = ?, hard_conflicts = ?, conflicts_json = ? WHERE id = ?",
                (json.dumps(updated_sched), conflicts["totalHardViolations"], json.dumps(conflicts), row["id"]),
            )
            c.execute(
                "UPDATE timetables SET entries_json = ?, updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ?",
                (json.dumps(updated_sched), row["id"]),
            )
            save_conflict_report_for_schedule(conn, row["id"], updated_sched, conflicts)
            conn.commit()
            conn.close()
            self.send_json({
                "success": True,
                "scheduleId": row["id"],
                "appliedCount": applied_count,
                "updatedSchedule": updated_sched,
                "conflicts": conflicts,
                "validation": validation,
            })
            return

        if path == '/api/conflict-reports':
            conn = get_connection()
            c = conn.cursor()
            sched_id = str(body.get('scheduleId', 'manual'))
            c.execute("SELECT * FROM faculty")
            all_facs = [dict(r) for r in c.fetchall()]
            sched = body.get('schedule', [])
            if sched:
                _, conflicts = compute_schedule_conflicts(sched, all_facs)
                report_id = save_conflict_report_for_schedule(conn, sched_id, sched, conflicts)
            else:
                conflicts = body.get('conflicts', {})
                report_id = save_conflict_report_for_schedule(conn, sched_id, [], conflicts)
            conn.commit()
            conn.close()
            self.send_json({"success": True, "reportId": report_id, "conflicts": conflicts})
            return

        if path in ('/api/hall-allocation/generate', '/api/hall-allocation/preview'):
            exam_date = str(body.get('examDate', '')).strip()
            if not exam_date:
                self.send_json({"error": "Exam date is required for hall allocation."}, status=400)
                return
            conn = get_connection()
            c = conn.cursor()
            plan, validation, _ = _run_hall_allocation_from_body(c, body)
            conn.close()
            self.send_json(
                {
                    **plan,
                    "isPreview": path.endswith('/preview'),
                    "validation": validation,
                    "reports": {
                        "departmentWise": build_department_wise_report_rows(plan),
                        "combined": build_combined_hall_report_rows(plan),
                        "individual": build_individual_student_report_rows(plan),
                    },
                }
            )
            return

        if path == '/api/hall-allocation/confirm':
            exam_date = str(body.get('examDate', '')).strip()
            session_val = str(body.get('session', 'FN')).strip() or 'FN'
            if not exam_date:
                self.send_json({"error": "Exam date is required to confirm hall allocation."}, status=400)
                return

            conn = get_connection()
            try:
                conn.isolation_level = None
                c = conn.cursor()
                c.execute("BEGIN IMMEDIATE")
                existing_allocs = _fetch_all_hall_allocations_from_conn(c)

                # Support either confirming an already-generated plan or generating + confirming atomically
                if isinstance(body.get("allocations"), list) and len(body["allocations"]) > 0:
                    alloc_id = body.get("id") or f"hallalloc-{uuid.uuid4().hex[:8]}"
                    plan = {
                        "id": alloc_id,
                        "examDate": exam_date,
                        "session": session_val,
                        "selectedDepartments": body.get("selectedDepartments", []),
                        "targetMode": str(body.get("targetMode", "PERCENT_50")),
                        "targetPercentage": int(body.get("targetPercentage") or 50),
                        "customTargetPerDept": int(body.get("customTargetPerDept") or 0),
                        "maxDeptsPerHall": int(body.get("maxDeptsPerHall") or 2),
                        "selectedHallIds": body.get("selectedHallIds") or [],
                        "totalStudents": int(body.get("totalStudents") or 0),
                        "totalAllocated": int(body.get("totalAllocated") or len(body["allocations"])),
                        "hallsRequired": int(body.get("hallsRequired") or 0),
                        "remainingAvailableCapacity": int(body.get("remainingAvailableCapacity") or 0),
                        "hallSummaries": body.get("hallSummaries", []),
                        "allocations": body.get("allocations", []),
                    }
                else:
                    plan, _, existing_allocs = _run_hall_allocation_from_body(c, body)
                    plan["id"] = body.get("id") or f"hallalloc-{uuid.uuid4().hex[:8]}"

                if int(plan.get("totalAllocated") or 0) <= 0:
                    c.execute("ROLLBACK")
                    conn.close()
                    self.send_json({"error": "Cannot confirm an empty hall allocation."}, status=422)
                    return

                validation = validate_hall_allocation_plan(
                    plan,
                    existing_session_allocations=existing_allocs,
                    max_depts_per_hall=plan.get("maxDeptsPerHall"),
                )
                if not validation["isValid"]:
                    c.execute("ROLLBACK")
                    conn.close()
                    has_session_conflict = bool(
                        validation["conflictingHalls"] or validation["conflictingStudents"]
                    )
                    self.send_json(
                        {
                            "error": validation["errors"][0],
                            "detail": validation["errors"][0],
                            "validation": validation,
                        },
                        status=409 if has_session_conflict else 422,
                    )
                    return

                c.execute(
                    """
                    INSERT OR REPLACE INTO hall_allocations (
                        id, exam_date, session, selected_departments_json, target_mode,
                        target_percentage, custom_target_per_dept, max_depts_per_hall,
                        selected_hall_ids_json, total_students, total_allocated,
                        halls_required, remaining_available_capacity,
                        hall_summaries_json, allocations_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        plan["id"],
                        plan["examDate"],
                        plan["session"],
                        json.dumps(plan.get("selectedDepartments", [])),
                        str(plan.get("targetMode") or "PERCENT_50"),
                        int(plan.get("targetPercentage") or 50),
                        int(plan.get("customTargetPerDept") or 0),
                        int(plan.get("maxDeptsPerHall") or 2),
                        json.dumps(plan.get("selectedHallIds") or []),
                        int(plan.get("totalStudents") or 0),
                        int(plan.get("totalAllocated") or 0),
                        int(plan.get("hallsRequired") or 0),
                        int(plan.get("remainingAvailableCapacity") or 0),
                        json.dumps(plan.get("hallSummaries", [])),
                        json.dumps(plan.get("allocations", [])),
                    ),
                )
                c.execute("COMMIT")
                conn.close()
                self.send_json({**plan, "confirmed": True, "validation": validation})
            except Exception as exc:
                try:
                    conn.rollback()
                except Exception:
                    pass
                conn.close()
                self.send_json({"error": str(exc)}, status=500)
            return

        if path == '/api/hall-allocations':
            alloc_id = body.get('id') or f"hallalloc-{uuid.uuid4().hex[:8]}"
            exam_date = str(body.get('examDate', '')).strip()
            session_val = str(body.get('session', 'FN')).strip()
            if not exam_date:
                self.send_json({"error": "Exam date is required for hall allocation."}, status=400)
                return
            payload = {
                "id": alloc_id,
                "examDate": exam_date,
                "session": session_val,
                "selectedDepartments": body.get('selectedDepartments', []),
                "targetMode": str(body.get('targetMode', 'PERCENT_50')),
                "targetPercentage": int(body.get('targetPercentage') or 50),
                "customTargetPerDept": int(body.get('customTargetPerDept') or 0),
                "maxDeptsPerHall": int(body.get('maxDeptsPerHall') or 2),
                "selectedHallIds": body.get('selectedHallIds', []),
                "totalStudents": int(body.get('totalStudents') or 0),
                "totalAllocated": int(body.get('totalAllocated') or 0),
                "hallsRequired": int(body.get('hallsRequired') or 0),
                "remainingAvailableCapacity": int(body.get('remainingAvailableCapacity') or 0),
                "hallSummaries": body.get('hallSummaries', []),
                "allocations": body.get('allocations', []),
            }
            conn = get_connection()
            c = conn.cursor()
            c.execute(
                """
                INSERT OR REPLACE INTO hall_allocations (
                    id, exam_date, session, selected_departments_json, target_mode,
                    target_percentage, custom_target_per_dept, max_depts_per_hall,
                    selected_hall_ids_json, total_students, total_allocated,
                    halls_required, remaining_available_capacity,
                    hall_summaries_json, allocations_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["examDate"],
                    payload["session"],
                    json.dumps(payload["selectedDepartments"]),
                    payload["targetMode"],
                    payload["targetPercentage"],
                    payload["customTargetPerDept"],
                    payload["maxDeptsPerHall"],
                    json.dumps(payload["selectedHallIds"]),
                    payload["totalStudents"],
                    payload["totalAllocated"],
                    payload["hallsRequired"],
                    payload["remainingAvailableCapacity"],
                    json.dumps(payload["hallSummaries"]),
                    json.dumps(payload["allocations"]),
                ),
            )
            conn.commit()
            conn.close()
            self.send_json(payload)
            return

        if path == '/api/optimization-runs':
            run_id = body.get('id') or f"garun-{uuid.uuid4().hex[:8]}"
            sched_id = str(body.get('scheduleId', '')).strip()
            if not sched_id:
                self.send_json({"error": "scheduleId is required."}, status=400)
                return
            payload = {
                "id": run_id,
                "scheduleId": sched_id,
                "scope": str(body.get('scope', 'ALL')),
                "executionMode": str(body.get('executionMode', 'WEB_WORKER')),
                "status": str(body.get('status', 'OPTIMAL')),
                "bestFitness": float(body.get('bestFitness') or 0),
                "convergedAtGeneration": int(body.get('convergedAtGeneration') or 0),
                "executionTimeMs": float(body.get('executionTimeMs') or 0),
                "populationSize": int(body.get('populationSize') or 40),
                "generations": int(body.get('generations') or 50),
                "mutationRate": float(body.get('mutationRate') or 0.12),
                "crossoverRate": float(body.get('crossoverRate') or 0.8),
                "constraintConfig": body.get('constraintConfig') or {},
                "conflicts": body.get('conflicts') or {},
                "constraintReport": body.get('constraintReport') or {},
            }
            conn = get_connection()
            c = conn.cursor()
            c.execute(
                """
                INSERT OR REPLACE INTO optimization_runs (
                    id, schedule_id, scope, execution_mode, status,
                    best_fitness, converged_at_generation, execution_time_ms,
                    population_size, generations, mutation_rate, crossover_rate,
                    constraint_config_json, conflicts_json, constraint_report_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["scheduleId"],
                    payload["scope"],
                    payload["executionMode"],
                    payload["status"],
                    payload["bestFitness"],
                    payload["convergedAtGeneration"],
                    payload["executionTimeMs"],
                    payload["populationSize"],
                    payload["generations"],
                    payload["mutationRate"],
                    payload["crossoverRate"],
                    json.dumps(payload["constraintConfig"]),
                    json.dumps(payload["conflicts"]),
                    json.dumps(payload["constraintReport"]),
                ),
            )
            conn.commit()
            conn.close()
            self.send_json(payload)
            return

        if path == '/api/seating/generate':
            cols = int(body.get('columnsPerRow', 6))
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM students")
            stus = [dict(r) for r in c.fetchall()]
            for s in stus:
                s["regNo"] = s["reg_no"]
            c.execute("SELECT * FROM halls")
            halls = [dict(r) for r in c.fetchall()]
            for h in halls:
                h["hallNumber"] = h["hall_number"]
            conn.close()

            result = generate_seating_plan(stus, halls, cols)
            self.send_json(result)
            return

        if path == '/api/auth/forgot-password/request':
            email_val = str(body.get('email') or '').strip()
            if not email_val or '@' not in email_val:
                self.send_json({"error": "Please enter a valid email address."}, status=400)
                return
            conn = get_connection()
            try:
                result = issue_reset_request(conn, email_val)
            finally:
                conn.close()
            self.send_json(result)
            return

        if path == '/api/auth/forgot-password/rollback':
            token_val = str(body.get('resetToken') or '').strip()
            conn = get_connection()
            try:
                result = rollback_reset_request(conn, token_val)
            finally:
                conn.close()
            self.send_json(result)
            return

        if path == '/api/auth/forgot-password/validate-token':
            token_val = str(body.get('resetToken') or '').strip()
            conn = get_connection()
            try:
                result = validate_reset_token(conn, token_val)
            finally:
                conn.close()
            self.send_json(result, status=200 if result.get("valid") else 400)
            return

        if path == '/api/auth/forgot-password/consume-token':
            token_val = str(body.get('resetToken') or '').strip()
            email_val = str(body.get('email') or '').strip()
            conn = get_connection()
            try:
                result = consume_reset_token(conn, reset_token=token_val, email=email_val)
            finally:
                conn.close()
            self.send_json(result)
            return

        if path == '/api/auth/admin-identity/sync':
            email_val = str(body.get('email') or '').strip()
            uid_val = str(body.get('firebaseUid') or '').strip()
            role_val = str(body.get('role') or 'admin').strip()
            if not email_val or not uid_val:
                self.send_json({"error": "Email and firebaseUid are required."}, status=400)
                return
            conn = get_connection()
            try:
                result = link_admin_firebase_uid(conn, email=email_val, firebase_uid=uid_val, role=role_val)
            finally:
                conn.close()
            self.send_json(result)
            return

        if path == '/api/auth/audit/password-reset':
            event_type = str(body.get('eventType') or '').strip()
            outcome = str(body.get('outcome') or '').strip()
            forwarded = str(self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            client_ip = forwarded or (self.client_address[0] if self.client_address else '')
            user_agent = str(self.headers.get('User-Agent') or '').strip()
            conn = get_connection()
            try:
                entry = record_password_reset_audit(
                    conn,
                    event_type=event_type,
                    outcome=outcome,
                    email=str(body.get('email') or '').strip(),
                    firebase_uid=str(body.get('firebaseUid') or '').strip(),
                    error_code=str(body.get('errorCode') or '').strip(),
                    failure_reason=str(body.get('failureReason') or '').strip(),
                    client_ip=client_ip,
                    user_agent=user_agent,
                    metadata=body.get('metadata') if isinstance(body.get('metadata'), dict) else None,
                )
            except ValueError as ve:
                conn.close()
                self.send_json({"error": str(ve)}, status=400)
                return
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
            self.send_json(entry, status=201)
            return

        if path == '/api/admin/accounts':
            forwarded = str(self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            client_ip = forwarded or (self.client_address[0] if self.client_address else '')
            user_agent = str(self.headers.get('User-Agent') or '').strip()
            req_email = str(body.get('requesterEmail') or self.headers.get('X-Admin-Email') or '').strip()
            req_uid = str(body.get('requesterUid') or self.headers.get('X-Admin-Uid') or '').strip()
            conn = get_connection()
            try:
                created = create_admin_account(
                    conn,
                    email=str(body.get('email') or '').strip(),
                    name=str(body.get('name') or '').strip(),
                    role=str(body.get('role') or 'admin').strip(),
                    firebase_uid=str(body.get('firebaseUid') or '').strip(),
                    requester_email=req_email,
                    requester_uid=req_uid,
                    client_ip=client_ip,
                    user_agent=user_agent,
                )
            except PermissionError as pe:
                conn.close()
                self.send_json({"error": str(pe)}, status=403)
                return
            except ValueError as ve:
                conn.close()
                status_code = 409 if "already exists" in str(ve).lower() else 400
                self.send_json({"error": str(ve)}, status=status_code)
                return
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
            self.send_json(created, status=201)
            return

        if path == '/api/admin/audit-logs':
            forwarded = str(self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            client_ip = forwarded or (self.client_address[0] if self.client_address else '')
            user_agent = str(self.headers.get('User-Agent') or '').strip()
            conn = get_connection()
            try:
                entry = record_system_audit_log(
                    conn,
                    category=str(body.get('category') or '').strip(),
                    action=str(body.get('action') or '').strip(),
                    summary=str(body.get('summary') or '').strip(),
                    outcome=str(body.get('outcome') or 'SUCCESS').strip(),
                    actor_email=str(body.get('actorEmail') or self.headers.get('X-Admin-Email') or '').strip(),
                    actor_uid=str(body.get('actorUid') or self.headers.get('X-Admin-Uid') or '').strip(),
                    actor_role=str(body.get('actorRole') or '').strip(),
                    target_type=str(body.get('targetType') or '').strip(),
                    target_id=str(body.get('targetId') or '').strip(),
                    target_label=str(body.get('targetLabel') or '').strip(),
                    client_ip=client_ip,
                    user_agent=user_agent,
                    metadata=body.get('metadata') if isinstance(body.get('metadata'), dict) else None,
                )
            except ValueError as ve:
                conn.close()
                self.send_json({"error": str(ve)}, status=400)
                return
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
            self.send_json(entry, status=201)
            return

        self.send_json({"error": "Not Found"}, status=404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path == '/api/scheduler/policy':
            saved = save_stored_scheduling_policy(body)
            self.send_json(saved)
            return

        if path == '/api/scheduler/ga-config':
            saved = save_stored_ga_config(body)
            self.send_json(saved)
            return

        if path == '/api/scheduler/update-exam':
            exam_id = body.get('examId')
            date_val = body.get('date')
            session_val = body.get('session')
            hall_id = body.get('hallId')
            inv_id = body.get('invigilatorId')
            allow_override = bool(body.get('allowOverride', False))

            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM schedules ORDER BY rowid DESC LIMIT 1")
            row = c.fetchone()
            if not row:
                conn.close()
                self.send_json({"error": "No schedule found"}, status=404)
                return

            c.execute("SELECT id, name FROM departments")
            depts = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, code, name, department, batch, section, semester, enrolled_count FROM subjects")
            subs = [dict(r) for r in c.fetchall()]
            c.execute("SELECT * FROM halls")
            all_halls = [
                {"id": r["id"], "hallNumber": r["hall_number"], "capacity": r["capacity"], "available": bool(r["available"])}
                for r in c.fetchall()
            ]
            c.execute("SELECT * FROM halls WHERE id = ?", (hall_id,))
            hall = c.fetchone()
            c.execute("SELECT * FROM faculty WHERE id = ?", (inv_id,))
            fac = c.fetchone()
            c.execute("SELECT * FROM faculty")
            all_facs = [dict(r) for r in c.fetchall()]
            c.execute("SELECT id, reg_no, enrolled_subject_ids FROM students")
            stus = []
            for r in c.fetchall():
                try:
                    sub_ids = json.loads(r["enrolled_subject_ids"] or "[]")
                except Exception:
                    sub_ids = []
                stus.append({"id": r["id"], "regNo": r["reg_no"], "enrolledSubjectIds": sub_ids})

            sched = json.loads(row["schedule_json"])
            policy = normalize_scheduling_policy(body.get("policy") or get_stored_scheduling_policy())
            prev_validation = validate_complete_exam_timetable(
                sched,
                departments=depts,
                subjects=subs,
                students=stus,
                halls=all_halls,
                faculty=all_facs,
                policy=policy,
            )

            found = False
            for item in sched:
                if item.get("examId") == exam_id:
                    if date_val:
                        item["date"] = date_val
                    if session_val:
                        item["session"] = session_val
                    if hall:
                        item["hallId"] = hall["id"]
                        item["hallNumber"] = hall["hall_number"]
                        item["hallCapacity"] = hall["capacity"]
                    if fac:
                        item["invigilatorId"] = fac["id"]
                        item["facultyId"] = fac["id"]
                        item["invigilatorName"] = fac["name"]
                        item["invigilatorDept"] = fac["department"]
                    found = True
                    break

            if not found:
                conn.close()
                self.send_json({"error": "Exam slot not found in schedule"}, status=404)
                return

            validation = validate_complete_exam_timetable(
                sched,
                departments=depts,
                subjects=subs,
                students=stus,
                halls=all_halls,
                faculty=all_facs,
                policy=policy,
            )
            dept_violation_ids = (
                set(validation["oneExamPerDay"]["violatingExamIds"])
                | set(validation["minimumExamGap"]["violatingExamIds"])
                | set(validation["departmentIndependence"]["violatingExamIds"])
            )
            prev_dept_violation_count = (
                prev_validation["counts"]["departmentSameDayViolations"]
                + prev_validation["counts"]["departmentGapViolations"]
                + prev_validation["counts"]["departmentIndependenceViolations"]
            )
            new_dept_violation_count = (
                validation["counts"]["departmentSameDayViolations"]
                + validation["counts"]["departmentGapViolations"]
                + validation["counts"]["departmentIndependenceViolations"]
            )
            introduces_dept_violation = (
                (exam_id in dept_violation_ids)
                or (new_dept_violation_count > prev_dept_violation_count)
            )
            if introduces_dept_violation and not allow_override:
                conn.close()
                matching_warn = next(
                    (
                        v["message"]
                        for v in (
                            validation["oneExamPerDay"]["violations"]
                            + validation["minimumExamGap"]["violations"]
                            + validation["departmentIndependence"]["violations"]
                        )
                        if exam_id in (v.get("examIds") or [])
                    ),
                    validation["warnings"][0] if validation["warnings"] else "Manual edit violates department exam date policy.",
                )
                self.send_json(
                    {"error": matching_warn, "detail": matching_warn, "validation": validation},
                    status=422,
                )
                return

            updated_sched, conflicts = compute_schedule_conflicts(
                sched,
                all_facs,
                subjects_list=subs,
                students_list=stus,
                departments_list=depts,
                halls_list=all_halls,
                policy=policy,
            )
            c.execute(
                "UPDATE schedules SET schedule_json = ?, hard_conflicts = ?, conflicts_json = ? WHERE id = ?",
                (json.dumps(updated_sched), conflicts["totalHardViolations"], json.dumps(conflicts), row["id"]),
            )
            c.execute(
                "UPDATE timetables SET entries_json = ?, updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ?",
                (json.dumps(updated_sched), row["id"]),
            )
            save_conflict_report_for_schedule(conn, row["id"], updated_sched, conflicts)
            conn.commit()
            conn.close()
            self.send_json({
                "success": True,
                "updatedSchedule": updated_sched,
                "conflicts": conflicts,
                "validation": validation,
            })
            return

        parts = [urllib.parse.unquote(p) for p in path.strip('/').split('/')]
        if len(parts) == 3 and parts[0] == 'api':
            resource = parts[1]
            resource_id = parts[2]
            conn = get_connection()
            c = conn.cursor()

            if resource == 'departments':
                new_name = str(body.get('name', '')).strip()
                if not new_name:
                    conn.close()
                    self.send_json({"error": "New department name is required."}, status=400)
                    return
                c.execute("SELECT id, name FROM departments WHERE id = ? OR name = ?", (resource_id, resource_id))
                existing = c.fetchone()
                if not existing:
                    conn.close()
                    self.send_json({"error": "Department not found."}, status=404)
                    return
                old_name = existing["name"]
                c.execute(
                    "SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id != ?",
                    (new_name, existing["id"]),
                )
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Department '{new_name}' already exists."}, status=409)
                    return
                c.execute("UPDATE departments SET name = ? WHERE id = ?", (new_name, existing["id"]))
                c.execute("UPDATE sections SET department = ? WHERE department = ?", (new_name, old_name))
                c.execute("UPDATE subjects SET department = ? WHERE department = ?", (new_name, old_name))
                c.execute("UPDATE faculty SET department = ? WHERE department = ?", (new_name, old_name))
                c.execute("UPDATE students SET department = ? WHERE department = ?", (new_name, old_name))
                c.execute("UPDATE subsections SET department = ? WHERE department = ?", (new_name, old_name))
                conn.commit()
                conn.close()
                self.send_json({"id": existing["id"], "name": new_name})
                return

            if resource == 'batches':
                new_name = str(body.get('name', '')).strip()
                if not new_name:
                    conn.close()
                    self.send_json({"error": "Batch name is required."}, status=400)
                    return
                c.execute("SELECT id, name FROM batches WHERE id = ? OR name = ?", (resource_id, resource_id))
                existing = c.fetchone()
                if not existing:
                    conn.close()
                    self.send_json({"error": "Batch not found."}, status=404)
                    return
                old_name = existing["name"]
                c.execute(
                    "SELECT id FROM batches WHERE LOWER(name) = LOWER(?) AND id != ?",
                    (new_name, existing["id"]),
                )
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Batch '{new_name}' already exists."}, status=409)
                    return
                c.execute("UPDATE batches SET name = ? WHERE id = ?", (new_name, existing["id"]))
                c.execute("UPDATE students SET batch = ? WHERE batch = ?", (new_name, old_name))
                c.execute("UPDATE subjects SET batch = ? WHERE batch = ?", (new_name, old_name))
                conn.commit()
                conn.close()
                self.send_json({"id": existing["id"], "name": new_name})
                return

            if resource == 'sections':
                new_name = str(body.get('name', '')).strip()
                if not new_name:
                    conn.close()
                    self.send_json({"error": "Section name is required."}, status=400)
                    return
                c.execute("SELECT id, department, name FROM sections WHERE id = ?", (resource_id,))
                existing = c.fetchone()
                if not existing:
                    conn.close()
                    self.send_json({"error": "Section not found."}, status=404)
                    return
                dept_name = existing["department"]
                old_name = existing["name"]
                c.execute(
                    "SELECT id FROM sections WHERE LOWER(department) = LOWER(?) AND LOWER(name) = LOWER(?) AND id != ?",
                    (dept_name, new_name, existing["id"]),
                )
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Section '{new_name}' already exists in {dept_name}."}, status=409)
                    return
                c.execute("UPDATE sections SET name = ? WHERE id = ?", (new_name, existing["id"]))
                c.execute(
                    "UPDATE students SET section = ? WHERE department = ? AND section = ?",
                    (new_name, dept_name, old_name),
                )
                c.execute(
                    "UPDATE subjects SET section = ? WHERE department = ? AND section = ?",
                    (new_name, dept_name, old_name),
                )
                conn.commit()
                conn.close()
                self.send_json({"id": existing["id"], "department": dept_name, "name": new_name})
                return

            if resource == 'subjects':
                code = str(body.get('code', '')).strip().upper()
                name = str(body.get('name', '')).strip()
                if not code or not name:
                    conn.close()
                    self.send_json({"error": "Subject code and name are required."}, status=400)
                    return
                c.execute("SELECT id FROM subjects WHERE LOWER(code) = LOWER(?) AND id != ?", (code, resource_id))
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Subject code '{code}' already exists."}, status=409)
                    return
                c.execute(
                    """
                    UPDATE subjects SET code = ?, name = ?, department = ?, batch = ?, section = ?, semester = ?, enrolled_count = ?
                    WHERE id = ?
                    """,
                    (
                        code,
                        name,
                        body.get('department', ''),
                        body.get('batch', '2024'),
                        body.get('section', 'Section A'),
                        int(body.get('semester', 1)),
                        int(body.get('enrolledCount', 50)),
                        resource_id,
                    )
                )
                conn.commit()
                conn.close()
                self.send_json({"id": resource_id, **body, "code": code, "name": name})
                return

            if resource == 'halls':
                hall_number = str(body.get('hallNumber', '')).strip().upper()
                if not hall_number:
                    conn.close()
                    self.send_json({"error": "Hall number is required."}, status=400)
                    return
                c.execute(
                    "SELECT id FROM halls WHERE LOWER(hall_number) = LOWER(?) AND id != ?",
                    (hall_number, resource_id),
                )
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Hall '{hall_number}' already exists."}, status=409)
                    return
                c.execute(
                    "UPDATE halls SET hall_number = ?, building = ?, capacity = ?, available = ? WHERE id = ?",
                    (
                        hall_number,
                        str(body.get('building', 'Main Academic Block')).strip(),
                        int(body.get('capacity', 60)),
                        1 if body.get('available', True) else 0,
                        resource_id,
                    )
                )
                conn.commit()
                conn.close()
                self.send_json({"id": resource_id, **body, "hallNumber": hall_number})
                return

            if resource == 'faculty':
                employee_id = str(body.get('employeeId', '')).strip().upper()
                name = str(body.get('name', '')).strip()
                if not employee_id or not name:
                    conn.close()
                    self.send_json({"error": "Faculty employee ID and name are required."}, status=400)
                    return
                c.execute(
                    "SELECT id FROM faculty WHERE LOWER(employee_id) = LOWER(?) AND id != ?",
                    (employee_id, resource_id),
                )
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Faculty ID '{employee_id}' already exists."}, status=409)
                    return
                c.execute(
                    """
                    UPDATE faculty SET employee_id = ?, name = ?, department = ?, designation = ?, email = ?, phone = ?, available = ?, max_duties = ?
                    WHERE id = ?
                    """,
                    (
                        employee_id,
                        name,
                        body.get('department', ''),
                        body.get('designation', 'Assistant Prof.'),
                        str(body.get('email', '')).strip(),
                        str(body.get('phone', '')).strip(),
                        1 if body.get('available', True) else 0,
                        int(body.get('maxDuties', 4)),
                        resource_id,
                    )
                )
                conn.commit()
                conn.close()
                self.send_json({"id": resource_id, **body, "employeeId": employee_id, "name": name})
                return

            if resource == 'students':
                reg_no = str(body.get('regNo', '')).strip().upper()
                name = str(body.get('name', '')).strip()
                if not reg_no or not name:
                    conn.close()
                    self.send_json({"error": "Student registration number and name are required."}, status=400)
                    return
                c.execute(
                    "SELECT id FROM students WHERE LOWER(reg_no) = LOWER(?) AND id != ?",
                    (reg_no, resource_id),
                )
                if c.fetchone():
                    conn.close()
                    self.send_json({"error": f"Registration number '{reg_no}' already exists."}, status=409)
                    return
                c.execute(
                    """
                    UPDATE students SET reg_no = ?, name = ?, department = ?, section = ?, batch = ?, semester = ?, enrolled_subject_ids = ?
                    WHERE id = ?
                    """,
                    (
                        reg_no,
                        name,
                        body.get('department', ''),
                        body.get('section', 'Section A'),
                        body.get('batch', '2024'),
                        int(body.get('semester', 1)),
                        json.dumps(body.get('enrolledSubjectIds', [])),
                        resource_id,
                    )
                )
                conn.commit()
                conn.close()
                self.send_json({"id": resource_id, **body, "regNo": reg_no, "name": name})
                return

            conn.close()

        if len(parts) == 4 and parts[0] == 'api' and parts[1] == 'admin' and parts[2] == 'accounts':
            account_id = parts[3]
            forwarded = str(self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            client_ip = forwarded or (self.client_address[0] if self.client_address else '')
            user_agent = str(self.headers.get('User-Agent') or '').strip()
            req_email = str(body.get('requesterEmail') or self.headers.get('X-Admin-Email') or '').strip()
            req_uid = str(body.get('requesterUid') or self.headers.get('X-Admin-Uid') or '').strip()
            conn = get_connection()
            try:
                updated = update_admin_account(
                    conn,
                    account_id=account_id,
                    name=body.get('name'),
                    role=body.get('role'),
                    status=body.get('status'),
                    requester_email=req_email,
                    requester_uid=req_uid,
                    client_ip=client_ip,
                    user_agent=user_agent,
                )
            except PermissionError as pe:
                conn.close()
                self.send_json({"error": str(pe)}, status=403)
                return
            except LookupError as le:
                conn.close()
                self.send_json({"error": str(le)}, status=404)
                return
            except ValueError as ve:
                conn.close()
                self.send_json({"error": str(ve)}, status=400)
                return
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
            self.send_json(updated)
            return

        self.send_json({"error": "Not Found"}, status=404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        parts = [urllib.parse.unquote(p) for p in path.strip('/').split('/')]

        if len(parts) == 4 and parts[0] == 'api' and parts[1] == 'admin' and parts[2] == 'accounts':
            account_id = parts[3]
            body = self.parse_body()
            forwarded = str(self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            client_ip = forwarded or (self.client_address[0] if self.client_address else '')
            user_agent = str(self.headers.get('User-Agent') or '').strip()
            req_email = str(
                query.get('requesterEmail', [''])[0]
                or body.get('requesterEmail')
                or self.headers.get('X-Admin-Email')
                or ''
            ).strip()
            req_uid = str(
                query.get('requesterUid', [''])[0]
                or body.get('requesterUid')
                or self.headers.get('X-Admin-Uid')
                or ''
            ).strip()
            conn = get_connection()
            try:
                deleted = delete_admin_account(
                    conn,
                    account_id=account_id,
                    requester_email=req_email,
                    requester_uid=req_uid,
                    client_ip=client_ip,
                    user_agent=user_agent,
                )
            except PermissionError as pe:
                conn.close()
                self.send_json({"error": str(pe)}, status=403)
                return
            except LookupError as le:
                conn.close()
                self.send_json({"error": str(le)}, status=404)
                return
            except ValueError as ve:
                conn.close()
                self.send_json({"error": str(ve)}, status=400)
                return
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
            self.send_json(deleted)
            return

        if len(parts) == 3 and parts[0] == 'api':
            resource = parts[1]
            resource_id = parts[2]
            conn = get_connection()
            c = conn.cursor()

            if resource == 'departments':
                c.execute("SELECT id, name FROM departments WHERE id = ? OR name = ?", (resource_id, resource_id))
                row = c.fetchone()
                if row:
                    c.execute("DELETE FROM departments WHERE id = ?", (row["id"],))
                    c.execute("DELETE FROM sections WHERE department = ?", (row["name"],))
                    conn.commit()
                    conn.close()
                    self.send_json({"success": True, "deletedId": row["id"]})
                    return
                conn.close()
                self.send_json({"error": "Department not found."}, status=404)
                return

            if resource == 'batches':
                c.execute("SELECT id FROM batches WHERE id = ? OR name = ?", (resource_id, resource_id))
                row = c.fetchone()
                if row:
                    c.execute("DELETE FROM batches WHERE id = ?", (row["id"],))
                    conn.commit()
                    conn.close()
                    self.send_json({"success": True, "deletedId": row["id"]})
                    return
                conn.close()
                self.send_json({"error": "Batch not found."}, status=404)
                return

            table_map = {
                'sections': 'sections',
                'subjects': 'subjects',
                'halls': 'halls',
                'faculty': 'faculty',
                'students': 'students',
                'hall-allocations': 'hall_allocations',
                'optimization-runs': 'optimization_runs',
            }

            if resource in table_map:
                table = table_map[resource]
                c.execute(f"DELETE FROM {table} WHERE id = ?", (resource_id,))
                conn.commit()
                conn.close()
                self.send_json({"success": True, "deletedId": resource_id})
                return

            conn.close()

        self.send_json({"error": "Not Found"}, status=404)


def run_server():
    init_db()
    server = HTTPServer(('127.0.0.1', PORT), ExamGridRequestHandler)
    print(f"[Python Backend] Listening on http://127.0.0.1:{PORT}")
    server.serve_forever()


if __name__ == '__main__':
    run_server()
