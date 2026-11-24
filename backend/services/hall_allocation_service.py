import math
import re
from typing import Any, Dict, List, Optional, Tuple


def natural_reg_no_key(value: Any) -> Tuple:
    """Natural sort key preserving numeric ordering while keeping leading-zero strings intact."""
    raw = str(value or "").strip()
    lower = raw.lower()
    parts = re.split(r"(\d+)", lower)
    tokens: List[Tuple[int, int, str]] = []
    for part in parts:
        if not part:
            continue
        if part.isdigit():
            tokens.append((0, int(part), part))
        else:
            tokens.append((1, 0, part))
    return (tuple(tokens), lower, raw)


def format_reg_no_range(first_reg_no: Optional[str], last_reg_no: Optional[str]) -> str:
    if not first_reg_no:
        return "—"
    if not last_reg_no or first_reg_no == last_reg_no:
        return str(first_reg_no)
    return f"{first_reg_no}–{last_reg_no}"


def deduplicate_and_sort_students(students: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen_reg_nos = set()
    seen_ids = set()
    unique_sorted: List[Dict[str, Any]] = []

    sorted_copy = sorted(students or [], key=lambda s: natural_reg_no_key(s.get("regNo") or s.get("reg_no")))
    for stu in sorted_copy:
        raw_reg = stu.get("regNo") if stu.get("regNo") is not None else stu.get("reg_no")
        reg_str = str(raw_reg or "").strip()
        reg_key = reg_str.upper()
        id_key = str(stu.get("id") or "")
        if not reg_key or reg_key in seen_reg_nos:
            continue
        if id_key and id_key in seen_ids:
            continue
        seen_reg_nos.add(reg_key)
        if id_key:
            seen_ids.add(id_key)
        unique_sorted.append(
            {
                **stu,
                "id": id_key or f"stu-{reg_key}",
                "regNo": reg_str,
                "department": str(stu.get("department") or "General").strip(),
                "name": str(stu.get("name") or "").strip(),
                "section": str(stu.get("section") or "Section A").strip(),
                "batch": str(stu.get("batch") or "2024").strip(),
            }
        )
    return unique_sorted


def _resolve_target_percentage(target_mode: str, target_percentage: Optional[int]) -> int:
    if target_percentage is not None:
        try:
            pct = int(target_percentage)
            return max(1, min(100, pct))
        except (TypeError, ValueError):
            pass
    m = re.match(r"^PERCENT_(\d+)$", str(target_mode or "").strip().upper())
    if m:
        return max(1, min(100, int(m.group(1))))
    return 50


def allocate_exam_halls(
    students: List[Dict[str, Any]],
    halls: List[Dict[str, Any]],
    selected_departments: Optional[List[str]] = None,
    exam_date: str = "",
    session: str = "FN",
    target_mode: str = "PERCENT_50",
    target_percentage: Optional[int] = None,
    custom_target_per_dept: int = 30,
    max_depts_per_hall: int = 2,
    selected_hall_ids: Optional[List[str]] = None,
    reserved_hall_ids: Optional[List[str]] = None,
    columns_per_row: int = 5,
) -> Dict[str, Any]:
    """
    Intelligent sequential examination hall allocation with department mixing.

    Rules enforced:
    1. Each hall contains students from at most `max_depts_per_hall` (default 2) departments.
    2. Target allocation per dept/hall defaults to `target_percentage`% (default 50%) or `custom_target_per_dept`.
    3. Remaining students are consolidated/accommodated in existing or additional halls without overflow.
    4. Students are sorted strictly ascending by registration number, preserving leading zeros.
    5. Best-Fit minimum hall utilization excluding unavailable, unselected, and session-reserved halls.
    """
    cols = max(1, int(columns_per_row or 5))
    max_depts = max(1, int(max_depts_per_hall or 2))
    pct = _resolve_target_percentage(target_mode, target_percentage)
    normalized_mode = "CUSTOM" if str(target_mode or "").upper() == "CUSTOM" else f"PERCENT_{pct}"

    reserved_set = {str(x) for x in (reserved_hall_ids or []) if x is not None}
    selected_hall_set = (
        {str(x) for x in selected_hall_ids if x is not None}
        if selected_hall_ids is not None
        else None
    )

    unique_students = deduplicate_and_sort_students(students)
    dept_selection_set = (
        {str(d) for d in selected_departments if d}
        if selected_departments and len(selected_departments) > 0
        else None
    )

    eligible_students = (
        [s for s in unique_students if s["department"] in dept_selection_set]
        if dept_selection_set is not None
        else unique_students
    )

    dept_students_map: Dict[str, List[Dict[str, Any]]] = {}
    for stu in eligible_students:
        dept_students_map.setdefault(stu["department"], []).append(stu)

    if dept_selection_set is not None:
        ordered_dept_names: List[str] = []
        seen_depts = set()
        for d in selected_departments or []:
            if d not in seen_depts and len(dept_students_map.get(d, [])) > 0:
                seen_depts.add(d)
                ordered_dept_names.append(d)
    else:
        ordered_dept_names = sorted(dept_students_map.keys())

    dept_states: List[Dict[str, Any]] = []
    for order_idx, dept_name in enumerate(ordered_dept_names):
        stu_list = dept_students_map.get(dept_name, [])
        total = len(stu_list)
        if normalized_mode == "CUSTOM":
            raw_target = max(1, int(custom_target_per_dept or 1))
        else:
            raw_target = max(1, math.ceil(total * (pct / 100.0)))
        target = min(total, raw_target)
        dept_states.append(
            {
                "department": dept_name,
                "orderIndex": order_idx,
                "students": stu_list,
                "total": total,
                "target": target,
                "remaining": total,
            }
        )

    # Partition halls into unavailable, reserved, unselected, and eligible
    sorted_halls = sorted(
        halls or [],
        key=lambda h: natural_reg_no_key(h.get("hallNumber") or h.get("hall_number")),
    )
    eligible_halls: List[Dict[str, Any]] = []
    reserved_halls: List[Dict[str, Any]] = []
    unavailable_halls: List[Dict[str, Any]] = []
    unselected_halls: List[Dict[str, Any]] = []

    for h in sorted_halls:
        cap = max(0, int(h.get("capacity") or 0))
        hall_id = str(h.get("id") or "")
        hall_num = str(h.get("hallNumber") or h.get("hall_number") or "")
        building = str(h.get("building") or "Main Academic Block")
        avail = bool(h.get("available", True))
        hall_obj = {
            **h,
            "id": hall_id or hall_num,
            "hallNumber": hall_num,
            "building": building,
            "capacity": cap,
            "available": avail,
        }
        is_reserved = hall_id in reserved_set or hall_num in reserved_set
        is_selected = (
            True
            if selected_hall_set is None
            else (hall_id in selected_hall_set or hall_num in selected_hall_set)
        )
        if not avail or cap <= 0:
            unavailable_halls.append(hall_obj)
        elif is_reserved:
            reserved_halls.append(hall_obj)
        elif not is_selected:
            unselected_halls.append(hall_obj)
        else:
            eligible_halls.append(hall_obj)

    unused_halls = list(eligible_halls)
    hall_plans: List[Dict[str, Any]] = []

    def _try_consolidate_small_remainders() -> bool:
        """
        Before opening an extra hall for a partial remainder (< target), absorb it
        into an already-opened hall hosting the same department if spare capacity exists.
        """
        absorbed_any = False
        for dept in dept_states:
            if dept["remaining"] <= 0 or dept["remaining"] >= dept["target"]:
                continue
            for plan in hall_plans:
                existing_slot = next(
                    (s for s in plan["slots"] if s["department"] == dept["department"]),
                    None,
                )
                if not existing_slot:
                    continue
                used = sum(s["count"] for s in plan["slots"])
                free = plan["hall"]["capacity"] - used
                if free >= dept["remaining"]:
                    existing_slot["count"] += dept["remaining"]
                    dept["remaining"] = 0
                    absorbed_any = True
                    break
        return absorbed_any

    # PASS 1: Plan per-(hall, dept) counts using Best-Fit minimum hall utilization.
    while unused_halls and any(d["remaining"] > 0 for d in dept_states):
        if _try_consolidate_small_remainders() and not any(d["remaining"] > 0 for d in dept_states):
            break

        active_depts = sorted(
            [d for d in dept_states if d["remaining"] > 0],
            key=lambda d: (-d["remaining"], d["orderIndex"]),
        )
        if not active_depts:
            break

        chosen_depts = active_depts[:max_depts]
        wants = [min(d["remaining"], d["target"]) for d in chosen_depts]
        desired_total = sum(wants)

        # Best-Fit: smallest unused hall with capacity >= desired_total; else largest unused hall
        chosen_idx = -1
        best_cap = float("inf")
        for idx, uh in enumerate(unused_halls):
            if uh["capacity"] >= desired_total and uh["capacity"] < best_cap:
                best_cap = uh["capacity"]
                chosen_idx = idx
        if chosen_idx == -1:
            max_cap = -1
            for idx, uh in enumerate(unused_halls):
                if uh["capacity"] > max_cap:
                    max_cap = uh["capacity"]
                    chosen_idx = idx

        chosen_hall = unused_halls.pop(chosen_idx)
        slots: List[Dict[str, Any]] = []
        rem_cap = chosen_hall["capacity"]

        for dept_obj, want in zip(chosen_depts, wants):
            if rem_cap <= 0:
                break
            take = min(want, rem_cap)
            if take > 0:
                slots.append(
                    {
                        "department": dept_obj["department"],
                        "orderIndex": dept_obj["orderIndex"],
                        "count": take,
                    }
                )
                dept_obj["remaining"] -= take
                rem_cap -= take

        if slots:
            hall_plans.append({"hall": chosen_hall, "slots": slots})

    # PASS 2: Remainder consolidation into already-allocated halls with spare capacity,
    # strictly preserving <= max_depts_per_hall and <= capacity.
    for dept in dept_states:
        if dept["remaining"] <= 0:
            continue

        for plan in hall_plans:
            if dept["remaining"] <= 0:
                break
            existing_slot = next(
                (s for s in plan["slots"] if s["department"] == dept["department"]),
                None,
            )
            if not existing_slot:
                continue
            used = sum(s["count"] for s in plan["slots"])
            free = plan["hall"]["capacity"] - used
            if free <= 0:
                continue
            add = min(dept["remaining"], free)
            existing_slot["count"] += add
            dept["remaining"] -= add

        if dept["remaining"] > 0:
            for plan in hall_plans:
                if dept["remaining"] <= 0:
                    break
                if len(plan["slots"]) >= max_depts:
                    continue
                if any(s["department"] == dept["department"] for s in plan["slots"]):
                    continue
                used = sum(s["count"] for s in plan["slots"])
                free = plan["hall"]["capacity"] - used
                if free <= 0:
                    continue
                add = min(dept["remaining"], free)
                plan["slots"].append(
                    {
                        "department": dept["department"],
                        "orderIndex": dept["orderIndex"],
                        "count": add,
                    }
                )
                dept["remaining"] -= add

    # PASS 3: Sort halls cleanly by hallNumber ascending and slice regNo-sorted students sequentially
    hall_plans.sort(key=lambda p: natural_reg_no_key(p["hall"]["hallNumber"]))

    dept_by_name = {d["department"]: d for d in dept_states}
    dept_cursors = {d["department"]: 0 for d in dept_states}
    allocations: List[Dict[str, Any]] = []
    used_hall_summaries: List[Dict[str, Any]] = []

    for plan in hall_plans:
        ordered_slots = sorted(plan["slots"], key=lambda s: s["orderIndex"])
        count_in_hall = 0
        department_breakdown: List[Dict[str, Any]] = []

        for slot in ordered_slots:
            dept_state = dept_by_name[slot["department"]]
            start = dept_cursors[slot["department"]]
            slice_students = dept_state["students"][start : start + slot["count"]]
            dept_cursors[slot["department"]] = start + len(slice_students)

            for stu in slice_students:
                row_num = (count_in_hall // cols) + 1
                col_num = (count_in_hall % cols) + 1
                seat_num = count_in_hall + 1
                allocations.append(
                    {
                        "studentId": stu["id"],
                        "regNo": stu["regNo"],
                        "studentName": stu["name"],
                        "department": stu["department"],
                        "section": stu["section"],
                        "batch": stu["batch"],
                        "hallId": plan["hall"]["id"],
                        "hallNumber": plan["hall"]["hallNumber"],
                        "building": plan["hall"]["building"],
                        "rowNumber": row_num,
                        "colNumber": col_num,
                        "seatNumber": seat_num,
                    }
                )
                count_in_hall += 1

            if slice_students:
                first_reg = slice_students[0]["regNo"]
                last_reg = slice_students[-1]["regNo"]
                department_breakdown.append(
                    {
                        "department": slot["department"],
                        "count": len(slice_students),
                        "firstRegNo": first_reg,
                        "lastRegNo": last_reg,
                        "regNoRange": format_reg_no_range(first_reg, last_reg),
                    }
                )

        used_hall_summaries.append(
            {
                "hallId": plan["hall"]["id"],
                "hallNumber": plan["hall"]["hallNumber"],
                "building": plan["hall"]["building"],
                "capacity": plan["hall"]["capacity"],
                "allocated": count_in_hall,
                "remainingCapacity": max(0, plan["hall"]["capacity"] - count_in_hall),
                "departmentBreakdown": department_breakdown,
                "isUsed": count_in_hall > 0,
                "isReserved": False,
            }
        )

    used_hall_ids = {h["hallId"] for h in used_hall_summaries}
    idle_eligible_halls = [
        {
            "hallId": h["id"],
            "hallNumber": h["hallNumber"],
            "building": h["building"],
            "capacity": h["capacity"],
            "allocated": 0,
            "remainingCapacity": h["capacity"],
            "departmentBreakdown": [],
            "isUsed": False,
            "isReserved": False,
        }
        for h in eligible_halls
        if h["id"] not in used_hall_ids
    ]

    hall_summaries = sorted(
        used_hall_summaries + idle_eligible_halls,
        key=lambda h: natural_reg_no_key(h["hallNumber"]),
    )

    unallocated_students: List[Dict[str, Any]] = []
    for d in dept_states:
        cursor = dept_cursors[d["department"]]
        if cursor < len(d["students"]):
            unallocated_students.extend(d["students"][cursor:])

    total_eligible_capacity = sum(h["capacity"] for h in eligible_halls)
    total_allocated = len(allocations)
    remaining_available_capacity = max(0, total_eligible_capacity - total_allocated)
    shortfall_seats = len(unallocated_students)

    additional_halls_required = 0
    if shortfall_seats > 0:
        ref_cap = (
            max(1, round(total_eligible_capacity / len(eligible_halls)))
            if eligible_halls
            else 60
        )
        additional_halls_required = math.ceil(shortfall_seats / ref_cap)

    return {
        "examDate": exam_date,
        "session": session,
        "selectedDepartments": ordered_dept_names,
        "targetMode": normalized_mode,
        "targetPercentage": pct,
        "customTargetPerDept": max(1, int(custom_target_per_dept or 1)) if normalized_mode == "CUSTOM" else None,
        "maxDeptsPerHall": max_depts,
        "selectedHallIds": [h["id"] for h in eligible_halls],
        "totalStudents": len(eligible_students),
        "totalAllocated": total_allocated,
        "hallsRequired": len(used_hall_summaries),
        "totalEligibleHalls": len(eligible_halls),
        "totalEligibleCapacity": total_eligible_capacity,
        "remainingAvailableCapacity": remaining_available_capacity,
        "shortfallSeats": shortfall_seats,
        "additionalHallsRequired": additional_halls_required,
        "reservedHalls": reserved_halls,
        "unavailableHalls": unavailable_halls,
        "unselectedHalls": unselected_halls,
        "departmentTargets": [
            {
                "department": d["department"],
                "totalStudents": d["total"],
                "targetPerHall": d["target"],
                "allocated": dept_cursors[d["department"]],
                "unallocated": max(0, d["total"] - dept_cursors[d["department"]]),
            }
            for d in dept_states
        ],
        "allocations": allocations,
        "hallSummaries": hall_summaries,
        "allocatedHalls": used_hall_summaries,
        "unallocatedStudents": unallocated_students,
        "columnsPerRow": cols,
    }


def build_department_wise_report_rows(
    plan: Dict[str, Any], department_filter: str = "ALL"
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for hall in plan.get("hallSummaries") or []:
        if (hall.get("allocated") or 0) <= 0:
            continue
        for bd in hall.get("departmentBreakdown") or []:
            if department_filter and department_filter != "ALL" and bd.get("department") != department_filter:
                continue
            rows.append(
                {
                    "hallId": hall.get("hallId"),
                    "hallNumber": hall.get("hallNumber"),
                    "building": hall.get("building", ""),
                    "department": bd.get("department"),
                    "firstRegNo": bd.get("firstRegNo"),
                    "lastRegNo": bd.get("lastRegNo"),
                    "regNoRange": bd.get("regNoRange"),
                    "studentCount": bd.get("count", 0),
                    "hallCapacity": hall.get("capacity", 0),
                }
            )
    return rows


def build_combined_hall_report_rows(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for hall in plan.get("hallSummaries") or []:
        if (hall.get("allocated") or 0) <= 0:
            continue
        parts = hall.get("departmentBreakdown") or []
        for idx, bd in enumerate(parts):
            rows.append(
                {
                    "hallId": hall.get("hallId"),
                    "hallNumber": hall.get("hallNumber"),
                    "building": hall.get("building", ""),
                    "department": bd.get("department"),
                    "firstRegNo": bd.get("firstRegNo"),
                    "lastRegNo": bd.get("lastRegNo"),
                    "regNoRange": bd.get("regNoRange"),
                    "studentCount": bd.get("count", 0),
                    "hallTotalAllocated": hall.get("allocated", 0),
                    "hallCapacity": hall.get("capacity", 0),
                    "isFirstDeptInHall": idx == 0,
                    "deptCountInHall": len(parts),
                }
            )
    return rows


def build_individual_student_report_rows(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = sorted(
        plan.get("allocations") or [],
        key=lambda a: (
            natural_reg_no_key(a.get("hallNumber")),
            str(a.get("department") or ""),
            natural_reg_no_key(a.get("regNo")),
        ),
    )
    return [
        {
            "sNo": idx + 1,
            "studentId": item.get("studentId"),
            "regNo": item.get("regNo"),
            "studentName": item.get("studentName"),
            "department": item.get("department"),
            "section": item.get("section", ""),
            "batch": item.get("batch", ""),
            "hallId": item.get("hallId"),
            "hallNumber": item.get("hallNumber"),
            "building": item.get("building", ""),
            "seatNumber": item.get("seatNumber"),
            "rowNumber": item.get("rowNumber"),
        }
        for idx, item in enumerate(items)
    ]


def validate_hall_allocation_plan(
    plan: Dict[str, Any],
    existing_session_allocations: Optional[List[Dict[str, Any]]] = None,
    max_depts_per_hall: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Validates internal consistency and cross-allocation conflicts for a session:
    - Zero duplicate students inside the plan
    - Zero capacity overflows and <= max_depts_per_hall departments per hall
    - Zero hall double-booking against existing confirmed allocations in same (examDate, session)
    - Zero duplicate student assignments against existing confirmed allocations in same (examDate, session)
    """
    errors: List[str] = []
    max_depts = max(1, int(max_depts_per_hall or plan.get("maxDeptsPerHall") or 2))
    alloc_id = str(plan.get("id") or "")
    exam_date = str(plan.get("examDate") or "").strip()
    session = str(plan.get("session") or "").strip()

    seen_students = set()
    duplicate_students_in_plan: List[str] = []
    for a in plan.get("allocations") or []:
        key = str(a.get("regNo") or "").strip().upper()
        if not key:
            continue
        if key in seen_students:
            duplicate_students_in_plan.append(a.get("regNo"))
        seen_students.add(key)

    if duplicate_students_in_plan:
        errors.append(
            f"Duplicate student hall assignments detected within plan: {', '.join(duplicate_students_in_plan[:5])}."
        )

    for hs in plan.get("hallSummaries") or []:
        allocated = int(hs.get("allocated") or 0)
        if allocated <= 0:
            continue
        capacity = int(hs.get("capacity") or 0)
        if capacity > 0 and allocated > capacity:
            errors.append(
                f"Hall {hs.get('hallNumber')} exceeds capacity ({allocated}/{capacity})."
            )
        depts = hs.get("departmentBreakdown") or []
        if len(depts) > max_depts:
            errors.append(
                f"Hall {hs.get('hallNumber')} mixes {len(depts)} departments, exceeding max {max_depts}."
            )

    current_hall_ids = {
        str(hs.get("hallId"))
        for hs in (plan.get("hallSummaries") or [])
        if (hs.get("allocated") or 0) > 0 and hs.get("hallId")
    }
    current_hall_numbers = {
        str(hs.get("hallNumber"))
        for hs in (plan.get("hallSummaries") or [])
        if (hs.get("allocated") or 0) > 0 and hs.get("hallNumber")
    }

    conflicting_halls: List[str] = []
    conflicting_students: List[str] = []

    for existing in existing_session_allocations or []:
        if alloc_id and str(existing.get("id") or "") == alloc_id:
            continue
        if str(existing.get("examDate") or "").strip() != exam_date:
            continue
        if str(existing.get("session") or "").strip() != session:
            continue

        for hs in existing.get("hallSummaries") or []:
            if (hs.get("allocated") or 0) <= 0:
                continue
            hid = str(hs.get("hallId") or "")
            hnum = str(hs.get("hallNumber") or "")
            if (hid and hid in current_hall_ids) or (hnum and hnum in current_hall_numbers):
                conflicting_halls.append(hnum or hid)

        for a in existing.get("allocations") or []:
            reg_key = str(a.get("regNo") or "").strip().upper()
            if reg_key and reg_key in seen_students:
                conflicting_students.append(a.get("regNo"))

    if conflicting_halls:
        unique_halls = sorted(set(conflicting_halls))
        errors.append(
            f"Hall(s) {', '.join(unique_halls)} already confirmed for {exam_date} ({session})."
        )
    if conflicting_students:
        unique_stus = sorted(set(conflicting_students))
        errors.append(
            f"Student(s) {', '.join(unique_stus[:5])} already assigned a hall for {exam_date} ({session})."
        )

    return {
        "isValid": len(errors) == 0,
        "errors": errors,
        "conflictingHalls": sorted(set(conflicting_halls)),
        "conflictingStudents": sorted(set(conflicting_students)),
    }


def lookup_student_hall_assignments(
    registration_number: str,
    allocations_records: List[Dict[str, Any]],
    exam_date: Optional[str] = None,
    session: Optional[str] = None,
) -> List[Dict[str, Any]]:
    target_reg = str(registration_number or "").strip().upper()
    if not target_reg:
        return []

    matches: List[Dict[str, Any]] = []
    for record in allocations_records or []:
        rec_date = str(record.get("examDate") or "")
        rec_session = str(record.get("session") or "")
        if exam_date and rec_date != exam_date:
            continue
        if session and rec_session != session:
            continue

        for stu in record.get("allocations") or []:
            if str(stu.get("regNo") or "").strip().upper() == target_reg:
                matches.append(
                    {
                        "allocationId": record.get("id"),
                        "examDate": rec_date,
                        "session": rec_session,
                        "regNo": stu.get("regNo"),
                        "studentName": stu.get("studentName"),
                        "department": stu.get("department"),
                        "section": stu.get("section", ""),
                        "batch": stu.get("batch", ""),
                        "hallId": stu.get("hallId"),
                        "hallNumber": stu.get("hallNumber"),
                        "building": stu.get("building", ""),
                        "seatNumber": stu.get("seatNumber"),
                        "rowNumber": stu.get("rowNumber"),
                        "colNumber": stu.get("colNumber"),
                    }
                )
    return matches
