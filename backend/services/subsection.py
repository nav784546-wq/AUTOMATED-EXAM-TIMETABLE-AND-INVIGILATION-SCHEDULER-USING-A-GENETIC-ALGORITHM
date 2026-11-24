import re
from typing import List, Dict, Any
from functools import cmp_to_key

def compare_student_names(a: Dict[str, Any], b: Dict[str, Any]) -> int:
    name_a = re.sub(r'\s+', ' ', str(a.get('name', '')).strip())
    name_b = re.sub(r'\s+', ' ', str(b.get('name', '')).strip())

    parts_a = name_a.split(' ') if name_a else ['']
    parts_b = name_b.split(' ') if name_b else ['']

    first_a = parts_a[0].lower()
    first_b = parts_b[0].lower()

    if first_a != first_b:
        return -1 if first_a < first_b else 1

    rest_a = ' '.join(parts_a[1:]).lower()
    rest_b = ' '.join(parts_b[1:]).lower()
    if rest_a != rest_b:
        return -1 if rest_a < rest_b else 1
    return 0

def get_subsection_labels(count: int) -> List[str]:
    safe_count = max(1, min(26, count))
    return [chr(65 + i) for i in range(safe_count)]

def normalize_subsection_label(section: str) -> str:
    raw = str(section or '').strip()
    if not raw:
        return 'A'
    match = re.match(r'^Section\s+([A-Za-z])$', raw, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return raw.upper()

def divide_department_students(students: List[Dict[str, Any]], department: str, subsection_count: int = 3):
    labels = get_subsection_labels(subsection_count)
    dept_students = [s for s in students if s.get('department') == department]

    # Deduplicate by regNo/id
    seen_reg = set()
    unique_students = []
    for stu in dept_students:
        reg_key = str(stu.get('regNo') or '').strip().upper()
        if not reg_key or reg_key in seen_reg:
            continue
        seen_reg.add(reg_key)
        unique_students.append(stu)

    # Sort A-Z by full name (first name primary, remaining names secondary)
    sorted_students = sorted(unique_students, key=cmp_to_key(compare_student_names))

    total = len(sorted_students)
    k = len(labels)
    base_size = total // k if k > 0 else 0
    remainder = total % k if k > 0 else 0

    subsections = []
    assigned_students = []
    cursor = 0

    for i in range(k):
        size = base_size + (1 if i < remainder else 0)
        label = labels[i]
        slice_students = sorted_students[cursor : cursor + size]
        updated_slice = []
        for s in slice_students:
            cloned = dict(s)
            cloned['section'] = label
            updated_slice.append(cloned)
        cursor += size

        subsections.append({
            'label': label,
            'count': len(updated_slice),
            'students': updated_slice,
        })
        assigned_students.extend(updated_slice)

    return {
        'department': department,
        'totalStudents': total,
        'subsectionCount': k,
        'subsections': subsections,
        'assignedStudents': assigned_students,
    }

