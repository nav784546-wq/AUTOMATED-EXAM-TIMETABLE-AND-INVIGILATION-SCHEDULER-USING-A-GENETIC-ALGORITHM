from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import json
import uuid
import os
from typing import List, Optional

from backend.database import init_db, get_connection
from backend.models import (
    DepartmentModel,
    SubjectModel,
    HallModel,
    FacultyModel,
    StudentModel,
    GAConfigRequest,
    OverrideFacultyRequest,
    SubsectionDivisionRequest,
    SeatingPlanRequest,
    HallAllocationRequest,
    PasswordResetRequestModel,
    PasswordResetTokenModel,
    PasswordResetConsumeModel,
    AdminIdentitySyncModel,
    PasswordResetAuditEventModel,
    AdminAccountCreateModel,
    AdminAccountUpdateModel,
    SystemAuditLogCreateModel,
)
from backend.services.genetic_algorithm import run_genetic_algorithm
from backend.services.seating import generate_seating_plan
from backend.services.subsection import divide_department_students
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

app = FastAPI(title="ExamGrid GA Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ExamGrid GA Python FastAPI"}

@app.get("/api/overview/stats")
def get_overview_stats():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as cnt FROM students")
    total_students = c.fetchone()["cnt"]

    c.execute("SELECT COUNT(*) as cnt FROM departments")
    active_departments = c.fetchone()["cnt"]

    c.execute("SELECT COUNT(*) as cnt FROM faculty")
    total_faculty = c.fetchone()["cnt"]

    c.execute("SELECT COUNT(*) as cnt FROM halls")
    total_halls = c.fetchone()["cnt"]

    c.execute("SELECT COUNT(*) as cnt FROM subjects")
    total_subjects = c.fetchone()["cnt"]

    conn.close()
    return {
        "totalStudents": total_students,
        "activeDepartments": active_departments,
        "totalFaculty": total_faculty,
        "totalHalls": total_halls,
        "scheduledExams": total_subjects,
    }

@app.get("/api/departments")
def list_departments():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, name FROM departments ORDER BY name ASC")
    rows = c.fetchall()
    conn.close()
    return [{"id": r["id"], "name": r["name"]} for r in rows]

@app.post("/api/departments")
def create_department(dept: DepartmentModel):
    dept_id = dept.id or f"dept-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute("INSERT INTO departments (id, name) VALUES (?, ?)", (dept_id, dept.name.strip()))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Department creation failed: {str(e)}")
    conn.close()
    return {"id": dept_id, "name": dept.name.strip()}

@app.delete("/api/departments/{dept_id}")
def delete_department(dept_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM departments WHERE id = ?", (dept_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deletedId": dept_id}

@app.get("/api/subjects")
def list_subjects(department: Optional[str] = None):
    conn = get_connection()
    c = conn.cursor()
    if department:
        c.execute("SELECT * FROM subjects WHERE department = ? ORDER BY code ASC", (department,))
    else:
        c.execute("SELECT * FROM subjects ORDER BY code ASC")
    rows = c.fetchall()
    conn.close()
    return [
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
    ]

@app.post("/api/subjects")
def create_subject(sub: SubjectModel):
    sub_id = sub.id or f"sub-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute(
            """
            INSERT INTO subjects (id, code, name, department, batch, section, semester, enrolled_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (sub_id, sub.code.strip(), sub.name.strip(), sub.department, sub.batch, sub.section, sub.semester, sub.enrolledCount)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"id": sub_id, **sub.dict(exclude={"id"})}

@app.put("/api/subjects/{sub_id}")
def update_subject(sub_id: str, sub: SubjectModel):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """
        UPDATE subjects SET code = ?, name = ?, department = ?, batch = ?, section = ?, semester = ?, enrolled_count = ?
        WHERE id = ?
        """,
        (sub.code.strip(), sub.name.strip(), sub.department, sub.batch, sub.section, sub.semester, sub.enrolledCount, sub_id)
    )
    conn.commit()
    conn.close()
    return {"id": sub_id, **sub.dict(exclude={"id"})}

@app.delete("/api/subjects/{sub_id}")
def delete_subject(sub_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM subjects WHERE id = ?", (sub_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deletedId": sub_id}

@app.get("/api/halls")
def list_halls():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM halls ORDER BY hall_number ASC")
    rows = c.fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "hallNumber": r["hall_number"],
            "building": r["building"],
            "capacity": r["capacity"],
            "available": bool(r["available"]),
        }
        for r in rows
    ]

@app.post("/api/halls")
def create_hall(hall: HallModel):
    hall_id = hall.id or f"hall-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO halls (id, hall_number, building, capacity, available) VALUES (?, ?, ?, ?, ?)",
            (hall_id, hall.hallNumber.strip(), hall.building.strip(), hall.capacity, 1 if hall.available else 0)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"id": hall_id, **hall.dict(exclude={"id"})}

@app.put("/api/halls/{hall_id}")
def update_hall(hall_id: str, hall: HallModel):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        "UPDATE halls SET hall_number = ?, building = ?, capacity = ?, available = ? WHERE id = ?",
        (hall.hallNumber.strip(), hall.building.strip(), hall.capacity, 1 if hall.available else 0, hall_id)
    )
    conn.commit()
    conn.close()
    return {"id": hall_id, **hall.dict(exclude={"id"})}

@app.delete("/api/halls/{hall_id}")
def delete_hall(hall_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM halls WHERE id = ?", (hall_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deletedId": hall_id}

@app.get("/api/faculty")
def list_faculty():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM faculty ORDER BY name ASC")
    rows = c.fetchall()
    conn.close()
    return [
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
    ]

@app.post("/api/faculty")
def create_faculty(fac: FacultyModel):
    fac_id = fac.id or f"fac-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute(
            """
            INSERT INTO faculty (id, employee_id, name, department, designation, email, phone, available, max_duties)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (fac_id, fac.employeeId.strip(), fac.name.strip(), fac.department, fac.designation, fac.email.strip(), fac.phone.strip(), 1 if fac.available else 0, fac.maxDuties)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"id": fac_id, **fac.dict(exclude={"id"})}

@app.put("/api/faculty/{fac_id}")
def update_faculty(fac_id: str, fac: FacultyModel):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """
        UPDATE faculty SET employee_id = ?, name = ?, department = ?, designation = ?, email = ?, phone = ?, available = ?, max_duties = ?
        WHERE id = ?
        """,
        (fac.employeeId.strip(), fac.name.strip(), fac.department, fac.designation, fac.email.strip(), fac.phone.strip(), 1 if fac.available else 0, fac.maxDuties, fac_id)
    )
    conn.commit()
    conn.close()
    return {"id": fac_id, **fac.dict(exclude={"id"})}

@app.delete("/api/faculty/{fac_id}")
def delete_faculty(fac_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM faculty WHERE id = ?", (fac_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deletedId": fac_id}

@app.get("/api/students")
def list_students(department: Optional[str] = None):
    conn = get_connection()
    c = conn.cursor()
    if department:
        c.execute("SELECT * FROM students WHERE department = ? ORDER BY reg_no ASC", (department,))
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
    return result

@app.post("/api/students")
def create_student(stu: StudentModel):
    stu_id = stu.id or f"stu-{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    c = conn.cursor()
    try:
        c.execute(
            """
            INSERT INTO students (id, reg_no, name, department, section, batch, semester, enrolled_subject_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (stu_id, stu.regNo.strip(), stu.name.strip(), stu.department, stu.section, stu.batch, stu.semester, json.dumps(stu.enrolledSubjectIds))
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"id": stu_id, **stu.dict(exclude={"id"})}

@app.put("/api/students/{stu_id}")
def update_student(stu_id: str, stu: StudentModel):
    conn = get_connection()
    c = conn.cursor()
    c.execute(
        """
        UPDATE students SET reg_no = ?, name = ?, department = ?, section = ?, batch = ?, semester = ?, enrolled_subject_ids = ?
        WHERE id = ?
        """,
        (stu.regNo.strip(), stu.name.strip(), stu.department, stu.section, stu.batch, stu.semester, json.dumps(stu.enrolledSubjectIds), stu_id)
    )
    conn.commit()
    conn.close()
    return {"id": stu_id, **stu.dict(exclude={"id"})}

@app.delete("/api/students/{stu_id}")
def delete_student(stu_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM students WHERE id = ?", (stu_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deletedId": stu_id}

@app.post("/api/subsections/divide")
def divide_subsections(req: SubsectionDivisionRequest):
    students = list_students(department=req.department)
    result = divide_department_students(students, req.department, req.subsectionCount)

    if req.applyToDatabase:
        conn = get_connection()
        c = conn.cursor()
        for stu in result["assignedStudents"]:
            c.execute("UPDATE students SET section = ? WHERE id = ?", (stu["section"], stu["id"]))
        conn.commit()
        conn.close()

    return result

@app.get("/api/scheduler/ga-config")
def get_ga_config_route():
    from backend.server import get_stored_ga_config
    return get_stored_ga_config()

@app.put("/api/scheduler/ga-config")
def put_ga_config_route(req: Dict[str, Any]):
    from backend.server import save_stored_ga_config
    return save_stored_ga_config(req)

@app.post("/api/scheduler/run")
def trigger_ga_scheduler(req: GAConfigRequest):
    subjects = list_subjects()
    halls = list_halls()
    faculty = list_faculty()

    # Department-wise or multi-department selection filtering
    if req.scope == "SELECTED" and req.selectedDepartments:
        dept_set = set(req.selectedDepartments)
        subjects = [s for s in subjects if s.get("department") in dept_set]
        if req.selectedCourses:
            course_set = set(req.selectedCourses)
            subjects = [s for s in subjects if s.get("code") in course_set or s.get("name") in course_set]
        if req.selectedSections:
            sec_set = set(req.selectedSections)
            subjects = [s for s in subjects if s.get("section") in sec_set]
        if req.selectedBatches:
            batch_set = set(req.selectedBatches)
            subjects = [s for s in subjects if s.get("batch") in batch_set]

    exams = [{"id": f"exam-{i+1}", "subjectId": s["id"], "durationMinutes": 180} for i, s in enumerate(subjects)]
    result = run_genetic_algorithm(exams, subjects, halls, faculty, req.dict())

    conn = get_connection()
    c = conn.cursor()
    sched_id = f"sched-{uuid.uuid4().hex[:6]}"
    c.execute(
        "INSERT INTO schedules (id, schedule_json, fitness, hard_conflicts, soft_score) VALUES (?, ?, ?, ?, ?)",
        (sched_id, json.dumps(result["bestSchedule"]), result["fitness"], result["hardConflicts"], result["softScore"])
    )
    conn.commit()
    conn.close()

    return {
        "scheduleId": sched_id,
        "fitness": result["fitness"],
        "hardConflicts": result["hardConflicts"],
        "softScore": result["softScore"],
        "fitnessHistory": result["fitnessHistory"],
        "isConflictFree": result["isConflictFree"],
        "bestSchedule": result["bestSchedule"],
    }

@app.get("/api/scheduler/latest")
def get_latest_schedule():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM schedules ORDER BY created_at DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    if not row:
        return {"hasSchedule": False, "schedule": []}
    return {
        "hasSchedule": True,
        "scheduleId": row["id"],
        "fitness": row["fitness"],
        "hardConflicts": row["hard_conflicts"],
        "softScore": row["soft_score"],
        "schedule": json.loads(row["schedule_json"]),
    }

@app.post("/api/scheduler/override-faculty")
def override_faculty_duty(req: OverrideFacultyRequest):
    faculty_list = list_faculty()
    target_fac = next((f for f in faculty_list if f["id"] == req.facultyId), None)
    if not target_fac:
        raise HTTPException(status_code=404, detail="Faculty not found")

    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM schedules ORDER BY created_at DESC LIMIT 1")
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="No schedule found to override")

    sched = json.loads(row["schedule_json"])
    updated = False
    for item in sched:
        if item.get("examId") == req.examId:
            item["facultyId"] = target_fac["id"]
            item["invigilatorName"] = target_fac["name"]
            item["invigilatorDept"] = target_fac["department"]
            item["hasInvigilatorConflict"] = False
            updated = True
            break

    if updated:
        c.execute("UPDATE schedules SET schedule_json = ? WHERE id = ?", (json.dumps(sched), row["id"]))
        conn.commit()

    conn.close()
    return {"success": updated, "updatedSchedule": sched}

@app.post("/api/seating/generate")
def generate_seating(req: SeatingPlanRequest):
    students = list_students()
    halls = list_halls()
    result = generate_seating_plan(students, halls, req.columnsPerRow)
    return result


def _load_hall_allocations_fastapi(conn):
    c = conn.cursor()
    c.execute("SELECT * FROM hall_allocations ORDER BY rowid DESC LIMIT 200")
    rows = c.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        result.append(
            {
                "id": d["id"],
                "examDate": d["exam_date"],
                "session": d["session"],
                "selectedDepartments": json.loads(d.get("selected_departments_json") or "[]"),
                "targetMode": d.get("target_mode") or "PERCENT_50",
                "targetPercentage": int(d.get("target_percentage") or 50),
                "customTargetPerDept": d.get("custom_target_per_dept") or 0,
                "maxDeptsPerHall": int(d.get("max_depts_per_hall") or 2),
                "selectedHallIds": json.loads(d.get("selected_hall_ids_json") or "[]"),
                "totalStudents": d.get("total_students") or 0,
                "totalAllocated": d.get("total_allocated") or 0,
                "hallsRequired": d.get("halls_required") or 0,
                "remainingAvailableCapacity": d.get("remaining_available_capacity") or 0,
                "hallSummaries": json.loads(d.get("hall_summaries_json") or "[]"),
                "allocations": json.loads(d.get("allocations_json") or "[]"),
            }
        )
    return result


def _compute_reserved_halls_fastapi(
    existing_allocs,
    exam_date: str,
    session: str,
    exclude_alloc_id: Optional[str] = None,
    explicit_reserved: Optional[List[str]] = None,
) -> List[str]:
    reserved = {str(x) for x in (explicit_reserved or []) if x is not None}
    for saved in existing_allocs or []:
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


@app.post("/api/hall-allocation/generate")
@app.post("/api/hall-allocation/preview")
def generate_or_preview_hall_allocation(req: HallAllocationRequest, request: Request):
    exam_date = str(req.examDate or "").strip()
    if not exam_date:
        raise HTTPException(status_code=400, detail="Exam date is required for hall allocation.")

    students = req.students if isinstance(req.students, list) else list_students()
    halls = req.halls if isinstance(req.halls, list) else list_halls()
    conn = get_connection()
    existing = _load_hall_allocations_fastapi(conn)
    conn.close()
    reserved = _compute_reserved_halls_fastapi(
        existing,
        exam_date,
        req.session,
        exclude_alloc_id=req.id,
        explicit_reserved=req.reservedHallIds,
    )
    plan = allocate_exam_halls(
        students=students,
        halls=halls,
        selected_departments=req.selectedDepartments or None,
        exam_date=exam_date,
        session=req.session,
        target_mode=req.targetMode,
        target_percentage=req.targetPercentage,
        custom_target_per_dept=req.customTargetPerDept,
        max_depts_per_hall=req.maxDeptsPerHall,
        selected_hall_ids=req.selectedHallIds,
        reserved_hall_ids=reserved,
        columns_per_row=req.columnsPerRow,
    )
    if req.id:
        plan["id"] = req.id
    validation = validate_hall_allocation_plan(
        plan,
        existing_session_allocations=existing,
        max_depts_per_hall=plan.get("maxDeptsPerHall"),
    )
    return {
        **plan,
        "isPreview": request.url.path.endswith("/preview"),
        "validation": validation,
        "reports": {
            "departmentWise": build_department_wise_report_rows(plan),
            "combined": build_combined_hall_report_rows(plan),
            "individual": build_individual_student_report_rows(plan),
        },
    }


@app.post("/api/hall-allocation/confirm")
def confirm_hall_allocation(req: HallAllocationRequest):
    exam_date = str(req.examDate or "").strip()
    if not exam_date:
        raise HTTPException(status_code=400, detail="Exam date is required to confirm hall allocation.")

    conn = get_connection()
    try:
        conn.isolation_level = None
        c = conn.cursor()
        c.execute("BEGIN IMMEDIATE")
        existing = _load_hall_allocations_fastapi(conn)
        if req.allocations:
            plan = {
                "id": req.id or f"hallalloc-{uuid.uuid4().hex[:8]}",
                "examDate": exam_date,
                "session": req.session,
                "selectedDepartments": req.selectedDepartments,
                "targetMode": req.targetMode,
                "targetPercentage": req.targetPercentage or 50,
                "customTargetPerDept": req.customTargetPerDept or 0,
                "maxDeptsPerHall": req.maxDeptsPerHall or 2,
                "selectedHallIds": req.selectedHallIds or [],
                "totalStudents": req.totalStudents or 0,
                "totalAllocated": req.totalAllocated or len(req.allocations),
                "hallsRequired": req.hallsRequired or 0,
                "remainingAvailableCapacity": req.remainingAvailableCapacity or 0,
                "hallSummaries": req.hallSummaries or [],
                "allocations": req.allocations,
            }
        else:
            students = req.students if isinstance(req.students, list) else list_students()
            halls = req.halls if isinstance(req.halls, list) else list_halls()
            reserved = _compute_reserved_halls_fastapi(
                existing,
                exam_date,
                req.session,
                exclude_alloc_id=req.id,
                explicit_reserved=req.reservedHallIds,
            )
            plan = allocate_exam_halls(
                students=students,
                halls=halls,
                selected_departments=req.selectedDepartments or None,
                exam_date=exam_date,
                session=req.session,
                target_mode=req.targetMode,
                target_percentage=req.targetPercentage,
                custom_target_per_dept=req.customTargetPerDept,
                max_depts_per_hall=req.maxDeptsPerHall,
                selected_hall_ids=req.selectedHallIds,
                reserved_hall_ids=reserved,
                columns_per_row=req.columnsPerRow,
            )
            plan["id"] = req.id or f"hallalloc-{uuid.uuid4().hex[:8]}"

        if int(plan.get("totalAllocated") or 0) <= 0:
            c.execute("ROLLBACK")
            conn.close()
            raise HTTPException(status_code=422, detail="Cannot confirm an empty hall allocation.")

        validation = validate_hall_allocation_plan(
            plan,
            existing_session_allocations=existing,
            max_depts_per_hall=plan.get("maxDeptsPerHall"),
        )
        if not validation["isValid"]:
            c.execute("ROLLBACK")
            conn.close()
            has_session_conflict = bool(
                validation["conflictingHalls"] or validation["conflictingStudents"]
            )
            raise HTTPException(
                status_code=409 if has_session_conflict else 422,
                detail=validation["errors"][0],
            )

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
        return {**plan, "confirmed": True, "validation": validation}
    except HTTPException:
        raise
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/hall-allocation/report")
def get_hall_allocation_report(
    allocationId: Optional[str] = None,
    format: str = "ALL",
    department: str = "ALL",
):
    conn = get_connection()
    rows = _load_hall_allocations_fastapi(conn)
    conn.close()
    plan = next((r for r in rows if r["id"] == allocationId), rows[0] if rows else None)
    if not plan:
        raise HTTPException(status_code=404, detail="No hall allocation found")
    return {
        "allocationId": plan["id"],
        "examDate": plan["examDate"],
        "session": plan["session"],
        "departmentWise": build_department_wise_report_rows(plan, department),
        "combined": build_combined_hall_report_rows(plan),
        "individual": build_individual_student_report_rows(plan),
    }


@app.get("/api/hall-allocation/student/{registration_number}")
def get_student_hall_assignment(
    registration_number: str,
    examDate: Optional[str] = None,
    session: Optional[str] = None,
):
    conn = get_connection()
    rows = _load_hall_allocations_fastapi(conn)
    conn.close()
    matches = lookup_student_hall_assignments(registration_number, rows, exam_date=examDate, session=session)
    if not matches:
        raise HTTPException(status_code=404, detail="No hall allocation found for student")
    return {"found": True, "registrationNumber": matches[0]["regNo"], "assignments": matches}

@app.get("/api/reports/timetable.csv")
def download_timetable_csv():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM schedules ORDER BY created_at DESC LIMIT 1")
    row = c.fetchone()
    conn.close()

    schedule = json.loads(row["schedule_json"]) if row else []
    headers = [
        "Date", "Session", "Subject Code", "Subject Name", "Department",
        "Enrolled Students", "Hall Number", "Hall Capacity",
        "Assigned Invigilator", "Invigilator Dept", "Status"
    ]

    def escape_csv(val):
        s = str(val if val is not None else "")
        if "," in s or '"' in s or "\n" in s:
            return f'"{s.replace(chr(34), chr(34)+chr(34))}"'
        return s

    rows = []
    for item in schedule:
        has_conflict = item.get("hasStudentClash") or item.get("hasInvigilatorConflict") or item.get("hasCapacityIssue") or item.get("hasHallDoubleBooking")
        row_cells = [
            item.get("date", ""),
            item.get("session", ""),
            item.get("subjectCode", ""),
            item.get("subjectName", ""),
            item.get("department", ""),
            item.get("enrolledCount", 0),
            item.get("hallNumber", ""),
            item.get("hallCapacity", 0),
            item.get("invigilatorName", ""),
            item.get("invigilatorDept", ""),
            "Conflict Detected" if has_conflict else "Conflict-Free",
        ]
        rows.append(",".join(escape_csv(x) for x in row_cells))

    csv_content = "\ufeff" + ",".join(headers) + "\n" + "\n".join(rows)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=examgrid_timetable_report.csv"}
    )


@app.post("/api/auth/forgot-password/request")
def request_password_reset_token(req: PasswordResetRequestModel):
    email_val = str(req.email or "").strip()
    if not email_val or "@" not in email_val:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    conn = get_connection()
    try:
        return issue_reset_request(conn, email_val)
    finally:
        conn.close()


@app.post("/api/auth/forgot-password/rollback")
def rollback_password_reset_token(req: PasswordResetTokenModel):
    conn = get_connection()
    try:
        return rollback_reset_request(conn, req.resetToken)
    finally:
        conn.close()


@app.post("/api/auth/forgot-password/validate-token")
def validate_password_reset_token(req: PasswordResetTokenModel):
    conn = get_connection()
    try:
        result = validate_reset_token(conn, req.resetToken)
    finally:
        conn.close()
    if not result.get("valid"):
        raise HTTPException(status_code=400, detail=result.get("message") or "Invalid password reset link.")
    return result


@app.post("/api/auth/forgot-password/consume-token")
def consume_password_reset_token(req: PasswordResetConsumeModel):
    conn = get_connection()
    try:
        return consume_reset_token(conn, reset_token=req.resetToken or "", email=req.email or "")
    finally:
        conn.close()


@app.post("/api/auth/admin-identity/sync")
def sync_admin_identity(req: AdminIdentitySyncModel):
    conn = get_connection()
    try:
        return link_admin_firebase_uid(
            conn,
            email=req.email,
            firebase_uid=req.firebaseUid,
            role=req.role or "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@app.post("/api/auth/audit/password-reset")
def create_password_reset_audit_log(req: PasswordResetAuditEventModel, request: Request):
    forwarded = str(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "")
    user_agent = str(request.headers.get("user-agent") or "").strip()
    conn = get_connection()
    try:
        return record_password_reset_audit(
            conn,
            event_type=req.eventType,
            outcome=req.outcome,
            email=req.email or "",
            firebase_uid=req.firebaseUid or "",
            error_code=req.errorCode or "",
            failure_reason=req.failureReason or "",
            client_ip=client_ip,
            user_agent=user_agent,
            metadata=req.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@app.get("/api/auth/audit/password-reset")
def read_password_reset_audit_logs(
    firebaseUid: Optional[str] = None,
    outcome: Optional[str] = None,
    eventType: Optional[str] = None,
    limit: int = 100,
):
    conn = get_connection()
    try:
        logs = list_password_reset_audit_logs(
            conn,
            firebase_uid=firebaseUid,
            outcome=outcome,
            event_type=eventType,
            limit=limit,
        )
        summary = get_password_reset_audit_summary(conn, firebase_uid=firebaseUid)
        return {"logs": logs, "summary": summary}
    finally:
        conn.close()


@app.get("/api/admin/me")
def get_current_admin_profile(email: str = "", uid: str = ""):
    conn = get_connection()
    try:
        return resolve_requester_admin(conn, email=email, uid=uid, bootstrap=True)
    finally:
        conn.close()


@app.get("/api/admin/accounts")
def get_admin_accounts(requesterEmail: str = "", requesterUid: str = ""):
    conn = get_connection()
    try:
        return list_admin_accounts(conn, requester_email=requesterEmail, requester_uid=requesterUid)
    finally:
        conn.close()


@app.post("/api/admin/accounts", status_code=201)
def post_admin_account(req: AdminAccountCreateModel, request: Request):
    forwarded = str(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "")
    user_agent = str(request.headers.get("user-agent") or "").strip()
    conn = get_connection()
    try:
        return create_admin_account(
            conn,
            email=req.email,
            name=req.name,
            role=req.role or "admin",
            firebase_uid=req.firebaseUid or "",
            requester_email=req.requesterEmail or "",
            requester_uid=req.requesterUid or "",
            client_ip=client_ip,
            user_agent=user_agent,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        status_code = 409 if "already exists" in str(ve).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(ve))
    finally:
        conn.close()


@app.put("/api/admin/accounts/{account_id}")
def put_admin_account(account_id: str, req: AdminAccountUpdateModel, request: Request):
    forwarded = str(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "")
    user_agent = str(request.headers.get("user-agent") or "").strip()
    conn = get_connection()
    try:
        return update_admin_account(
            conn,
            account_id=account_id,
            name=req.name,
            role=req.role,
            status=req.status,
            requester_email=req.requesterEmail or "",
            requester_uid=req.requesterUid or "",
            client_ip=client_ip,
            user_agent=user_agent,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except LookupError as le:
        raise HTTPException(status_code=404, detail=str(le))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    finally:
        conn.close()


@app.delete("/api/admin/accounts/{account_id}")
def remove_admin_account(
    account_id: str,
    request: Request,
    requesterEmail: str = "",
    requesterUid: str = "",
):
    forwarded = str(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "")
    user_agent = str(request.headers.get("user-agent") or "").strip()
    conn = get_connection()
    try:
        return delete_admin_account(
            conn,
            account_id=account_id,
            requester_email=requesterEmail,
            requester_uid=requesterUid,
            client_ip=client_ip,
            user_agent=user_agent,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except LookupError as le:
        raise HTTPException(status_code=404, detail=str(le))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    finally:
        conn.close()


@app.get("/api/admin/audit-logs")
def get_unified_system_audit_logs(
    requesterEmail: str = "",
    requesterUid: str = "",
    category: Optional[str] = None,
    outcome: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    conn = get_connection()
    try:
        requester = resolve_requester_admin(conn, email=requesterEmail, uid=requesterUid, bootstrap=False)
        if not requester["isSuperAdmin"]:
            raise HTTPException(
                status_code=403,
                detail="Access Denied: Only Super Administrators can view system audit logs.",
            )
        return list_unified_system_audit_logs(
            conn,
            category=category,
            outcome=outcome,
            search=search,
            limit=limit,
            offset=offset,
        )
    finally:
        conn.close()


@app.post("/api/admin/audit-logs", status_code=201)
def post_system_audit_log(req: SystemAuditLogCreateModel, request: Request):
    forwarded = str(request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "")
    user_agent = str(request.headers.get("user-agent") or "").strip()
    conn = get_connection()
    try:
        return record_system_audit_log(
            conn,
            category=req.category,
            action=req.action,
            summary=req.summary,
            outcome=req.outcome or "SUCCESS",
            actor_email=req.actorEmail or "",
            actor_uid=req.actorUid or "",
            actor_role=req.actorRole or "",
            target_type=req.targetType or "",
            target_id=req.targetId or "",
            target_label=req.targetLabel or "",
            client_ip=client_ip,
            user_agent=user_agent,
            metadata=req.metadata,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    finally:
        conn.close()

