import re
from typing import List, Dict, Any

def natural_reg_no_key(stu: Dict[str, Any]):
    reg = str(stu.get('regNo') or '').strip().upper()
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', reg)]

def generate_seating_plan(students: List[Dict[str, Any]], halls: List[Dict[str, Any]], columns_per_row: int = 6):
    cols = max(1, columns_per_row)

    seen_reg_nos = set()
    unique_sorted = []
    sorted_copy = sorted(students, key=natural_reg_no_key)

    for stu in sorted_copy:
        key = str(stu.get('regNo') or '').strip().upper()
        if not key or key in seen_reg_nos:
            continue
        seen_reg_nos.add(key)
        unique_sorted.append(stu)

    dept_queues: Dict[str, List[Dict[str, Any]]] = {}
    for stu in unique_sorted:
        dept = stu.get('department') or 'General'
        if dept not in dept_queues:
            dept_queues[dept] = []
        dept_queues[dept].append(stu)

    dept_keys = list(dept_queues.keys())
    ordered_students = []

    if len(dept_keys) > 1:
        interleaved = []
        remaining = len(unique_sorted)
        while remaining > 0:
            for dept in dept_keys:
                queue = dept_queues.get(dept, [])
                if queue:
                    interleaved.append(queue.pop(0))
                    remaining -= 1
        ordered_students = interleaved
    else:
        # Single-department: arrange by section and registration number
        ordered_students = sorted(
            unique_sorted,
            key=lambda s: (str(s.get('section') or 'A'), str(s.get('regNo') or ''))
        )

    active_halls = [h for h in halls if h.get('available') and h.get('capacity', 0) > 0]
    allocations = []
    hall_summaries = []

    cursor = 0
    for hall in active_halls:
        cap = hall.get('capacity', 0)
        count_in_hall = 0

        while cursor < len(ordered_students) and count_in_hall < cap:
            stu = ordered_students[cursor]
            row_number = (count_in_hall // cols) + 1
            col_number = (count_in_hall % cols) + 1
            seat_number = count_in_hall + 1

            allocations.append({
                'studentId': stu.get('id'),
                'regNo': stu.get('regNo'),
                'studentName': stu.get('name'),
                'department': stu.get('department'),
                'section': stu.get('section') or 'A',
                'batch': stu.get('batch') or '2024',
                'hallId': hall.get('id'),
                'hallNumber': hall.get('hallNumber'),
                'rowNumber': row_number,
                'colNumber': col_number,
                'seatNumber': seat_number,
            })

            count_in_hall += 1
            cursor += 1

        hall_summaries.append({
            'hallId': hall.get('id'),
            'hallNumber': hall.get('hallNumber'),
            'building': hall.get('building'),
            'capacity': cap,
            'allocated': count_in_hall,
        })

    unallocated_students = ordered_students[cursor:]

    return {
        'allocations': allocations,
        'hallSummaries': hall_summaries,
        'unallocatedStudents': unallocated_students,
        'totalAllocated': len(allocations),
        'columnsPerRow': cols,
    }
