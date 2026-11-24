from datetime import timedelta
import random
from typing import Any, Dict, List, Optional

from backend.services.exam_date_validation import (
    normalize_scheduling_policy,
    parse_exam_date,
    resolve_department_identity,
    validate_complete_exam_timetable,
)

SESSIONS = ['FN (09:30 - 12:30)', 'AN (14:00 - 17:00)']
DEFAULT_DATES = [f"2026-11-{day:02d}" for day in range(16, 26)]


def _extend_dates_if_needed(
    dates: List[str],
    exams: List[Dict[str, Any]],
    subjects_map: Dict[str, Any],
    departments: Optional[List[Any]],
    policy: Dict[str, Any],
    is_single_day: bool,
) -> List[str]:
    clean_dates = sorted({d for d in (dates or DEFAULT_DATES) if parse_exam_date(d) is not None})
    if not clean_dates:
        clean_dates = list(DEFAULT_DATES)
    if is_single_day:
        return [clean_dates[0]]

    dept_counts: Dict[str, int] = {}
    for ex in exams:
        sub = subjects_map.get(ex.get('subjectId'), {})
        canon, _ = resolve_department_identity(
            {'subjectId': ex.get('subjectId'), 'department': sub.get('department'), 'departmentId': sub.get('departmentId')},
            departments,
            subjects_map,
        )
        dept_counts[canon] = dept_counts.get(canon, 0) + 1

    max_dept_exams = max(dept_counts.values()) if dept_counts else 0
    min_gap = policy['minGapDaysBetweenExams'] if (policy['oneExamPerDeptPerDay'] and not policy['allowSameDayFnAnPerDept']) else 0
    step = (min_gap + 1) if policy['oneExamPerDeptPerDay'] and not policy['allowSameDayFnAnPerDept'] else 1
    needed_span_days = max(1, (max_dept_exams - 1) * step + 1) if max_dept_exams > 1 else 1
    if not policy['allowMultipleDeptsSameDate'] and len(exams) > len(clean_dates):
        needed_span_days = max(needed_span_days, len(exams))

    first_dt = parse_exam_date(clean_dates[0])
    last_dt = parse_exam_date(clean_dates[-1])
    if first_dt and last_dt:
        current_span = (last_dt - first_dt).days + 1
        out = list(clean_dates)
        next_dt = last_dt + timedelta(days=1)
        while current_span < needed_span_days or len(out) < needed_span_days:
            iso = next_dt.isoformat()
            if iso not in out:
                out.append(iso)
            current_span = (next_dt - first_dt).days + 1
            next_dt = next_dt + timedelta(days=1)
        return sorted(out)
    return clean_dates


def _pick_spaced_dates_for_dept(
    count: int,
    candidate_dates: List[str],
    min_day_diff: int,
    same_day_allowed: bool,
) -> List[str]:
    if count <= 0:
        return []
    if len(candidate_dates) == 1:
        return [candidate_dates[0]] * count

    parsed_list = [(d, parse_exam_date(d)) for d in candidate_dates]
    parsed_list = [(d, dt) for d, dt in parsed_list if dt is not None]
    if not parsed_list:
        return [random.choice(candidate_dates) for _ in range(count)]

    # Try randomized greedy spacing
    for _attempt in range(12):
        chosen: List[str] = []
        chosen_dts = []
        shuffled = list(parsed_list)
        random.shuffle(shuffled)
        for _ in range(count):
            valid = [
                (d, dt)
                for d, dt in shuffled
                if all(
                    (same_day_allowed and dt == prev_dt) or abs((dt - prev_dt).days) >= min_day_diff
                    for prev_dt in chosen_dts
                )
            ]
            if not valid:
                break
            pick_d, pick_dt = random.choice(valid)
            chosen.append(pick_d)
            chosen_dts.append(pick_dt)
        if len(chosen) == count:
            return chosen

    # Deterministic fallback spacing
    chosen = []
    last_dt = None
    for d, dt in parsed_list:
        if last_dt is None or (dt - last_dt).days >= min_day_diff:
            chosen.append(d)
            last_dt = dt
            if len(chosen) == count:
                return chosen
    while len(chosen) < count:
        chosen.append(random.choice(candidate_dates))
    return chosen


def evaluate_chromosome(
    chromosome: List[Dict[str, Any]],
    subjects_map: Dict[str, Any],
    halls_map: Dict[str, Any],
    faculty_map: Dict[str, Any],
    departments: Optional[List[Any]] = None,
    students: Optional[List[Dict[str, Any]]] = None,
    policy: Optional[Dict[str, Any]] = None,
    is_single_day: bool = False,
):
    pol = normalize_scheduling_policy(policy)
    hard_conflicts = 0
    soft_violations = 0

    hall_slots: Dict[str, str] = {}
    faculty_slots: Dict[str, str] = {}
    faculty_duty_counts: Dict[str, int] = {}

    for gene in chromosome:
        exam_id = gene['examId']
        subject = subjects_map.get(gene['subjectId'], {})
        hall = halls_map.get(gene['hallId'], {})
        fac = faculty_map.get(gene['facultyId'], {})

        slot_key = f"{gene['date']}_{gene['session']}"

        hall_slot_key = f"{slot_key}_{gene['hallId']}"
        if hall_slot_key in hall_slots:
            hard_conflicts += 1
            gene['hasHallDoubleBooking'] = True
        else:
            hall_slots[hall_slot_key] = exam_id
            gene['hasHallDoubleBooking'] = False

        fac_slot_key = f"{slot_key}_{gene['facultyId']}"
        if fac_slot_key in faculty_slots or (fac and not fac.get('available', True)):
            hard_conflicts += 1
            gene['hasInvigilatorConflict'] = True
        else:
            faculty_slots[fac_slot_key] = exam_id
            gene['hasInvigilatorConflict'] = False

        enrolled = int(subject.get('enrolledCount', 50))
        cap = int(hall.get('capacity', 60))
        if enrolled > cap or (hall and not hall.get('available', True)):
            hard_conflicts += 1
            gene['hasCapacityIssue'] = True
        else:
            gene['hasCapacityIssue'] = False

        if fac.get('department') and fac.get('department') == subject.get('department'):
            soft_violations += 1
            gene['hasDepartmentBias'] = True
        else:
            gene['hasDepartmentBias'] = False

        fid = gene['facultyId']
        faculty_duty_counts[fid] = faculty_duty_counts.get(fid, 0) + 1
        if faculty_duty_counts[fid] > int(fac.get('maxDuties', 4)):
            hard_conflicts += 1
            gene['exceedsDuties'] = True
        else:
            gene['exceedsDuties'] = False

    # Build enriched items for authoritative date/gap/student validation
    enriched = []
    for gene in chromosome:
        sub = subjects_map.get(gene['subjectId'], {})
        enriched.append({
            'examId': gene['examId'],
            'subjectId': gene['subjectId'],
            'subjectCode': sub.get('code', ''),
            'subjectName': sub.get('name', ''),
            'department': sub.get('department', ''),
            'departmentId': sub.get('departmentId'),
            'batch': sub.get('batch', ''),
            'section': sub.get('section', ''),
            'semester': sub.get('semester', 1),
            'enrolledCount': sub.get('enrolledCount', 0),
            'date': gene['date'],
            'session': gene['session'],
            'hallId': gene['hallId'],
            'hallCapacity': halls_map.get(gene['hallId'], {}).get('capacity', 0),
            'invigilatorId': gene['facultyId'],
            'facultyId': gene['facultyId'],
        })

    effective_pol = dict(pol)
    if is_single_day:
        effective_pol['minGapDaysBetweenExams'] = 0

    val_report = validate_complete_exam_timetable(
        enriched,
        departments=departments,
        subjects=list(subjects_map.values()),
        students=students,
        halls=list(halls_map.values()),
        faculty=list(faculty_map.values()),
        policy=effective_pol,
    )

    student_clash_ids = set(val_report['studentConflicts']['violatingExamIds'])
    same_day_ids = set(val_report['oneExamPerDay']['violatingExamIds'])
    gap_ids = set(val_report['minimumExamGap']['violatingExamIds'])
    indep_ids = set(val_report['departmentIndependence']['violatingExamIds'])
    warning_ids = set(val_report['studentConflicts']['warningExamIds'])

    for gene in chromosome:
        eid = gene['examId']
        gene['hasStudentClash'] = eid in student_clash_ids
        gene['hasDepartmentDateViolation'] = eid in same_day_ids
        gene['hasDepartmentGapViolation'] = eid in gap_ids
        gene['hasDepartmentIndependenceViolation'] = eid in indep_ids
        gene['hasDepartmentWarning'] = (eid in warning_ids) and not gene['hasStudentClash']

    dept_policy_violations = (
        val_report['counts']['departmentSameDayViolations']
        + val_report['counts']['departmentGapViolations']
        + val_report['counts']['departmentIndependenceViolations']
    )
    student_clashes = val_report['counts']['studentClashes']
    total_hard = hard_conflicts + student_clashes + dept_policy_violations
    soft_violations += len(val_report['studentConflicts']['warnings'])

    fitness = 100.0 / (1.0 + total_hard * 25.0 + soft_violations * 2.5)
    return fitness, total_hard, soft_violations


def run_genetic_algorithm(
    exams: List[Dict[str, Any]],
    subjects: List[Dict[str, Any]],
    halls: List[Dict[str, Any]],
    faculty: List[Dict[str, Any]],
    config: Dict[str, Any],
    students: Optional[List[Dict[str, Any]]] = None,
    departments: Optional[List[Any]] = None,
):
    pop_size = max(10, min(500, int(config.get('populationSize', 40))))
    generations = max(1, min(1000, int(config.get('generations') or config.get('maxGenerations') or 50)))
    mutation_rate = max(0.0, min(1.0, float(config.get('mutationRate', 0.12))))
    crossover_rate = max(0.0, min(1.0, float(config.get('crossoverRate', 0.8))))
    max_elitism = min(10, max(1, pop_size // 2))
    elitism_count = max(1, min(max_elitism, int(config.get('elitismCount', 2))))
    tournament_size = max(2, min(10, pop_size, int(config.get('tournamentSize', 3))))
    early_stop_gens = max(0, min(500, int(config.get('earlyStopGenerations', 0))))

    policy_src = config.get('policy') or config.get('constraintConfig') or config
    pol = normalize_scheduling_policy(policy_src)

    is_single_day = config.get('scope') == 'SINGLE_DAY'
    raw_dates = config.get('availableDates') or DEFAULT_DATES
    subjects_map = {s['id']: s for s in subjects}

    if is_single_day:
        single_date = config.get('singleDayDate') or raw_dates[0]
        effective_dates = [single_date]
        single_session = config.get('singleDaySession')
        effective_sessions = (
            [single_session] if (single_session and single_session != 'BOTH') else list(SESSIONS)
        )
    else:
        effective_dates = _extend_dates_if_needed(
            list(raw_dates), exams, subjects_map, departments, pol, is_single_day=False
        )
        effective_sessions = list(SESSIONS)

    active_halls = [h for h in halls if h.get('available', True)] or halls
    active_faculty = [f for f in faculty if f.get('available', True)] or faculty

    halls_map = {h['id']: h for h in active_halls}
    faculty_map = {f['id']: f for f in active_faculty}

    min_day_diff = (
        (pol['minGapDaysBetweenExams'] + 1)
        if (not is_single_day and pol['oneExamPerDeptPerDay'] and not pol['allowSameDayFnAnPerDept'])
        else (1 if (not is_single_day and pol['oneExamPerDeptPerDay'] and not pol['allowSameDayFnAnPerDept']) else 0)
    )
    if not is_single_day and pol['minGapDaysBetweenExams'] > 0:
        min_day_diff = max(min_day_diff, pol['minGapDaysBetweenExams'] + 1)

    # Group exams by canonical department for smart spaced initialization
    exams_by_dept: Dict[str, List[Dict[str, Any]]] = {}
    for ex in exams:
        sub = subjects_map.get(ex.get('subjectId'), {})
        canon, _ = resolve_department_identity(
            {'subjectId': ex.get('subjectId'), 'department': sub.get('department'), 'departmentId': sub.get('departmentId')},
            departments,
            subjects_map,
        )
        exams_by_dept.setdefault(canon, []).append(ex)

    def create_random_chromosome():
        date_by_exam_id: Dict[str, str] = {}
        if is_single_day:
            for ex in exams:
                date_by_exam_id[ex['id']] = effective_dates[0]
        else:
            for _canon, dept_exams in exams_by_dept.items():
                picked = _pick_spaced_dates_for_dept(
                    len(dept_exams),
                    effective_dates,
                    min_day_diff=max(1, min_day_diff),
                    same_day_allowed=(not pol['oneExamPerDeptPerDay'] or pol['allowSameDayFnAnPerDept']),
                )
                for ex, dt_str in zip(dept_exams, picked):
                    date_by_exam_id[ex['id']] = dt_str

        chromo = []
        for ex in exams:
            sub = subjects_map.get(ex.get('subjectId'), {})
            suitable_halls = [h for h in active_halls if int(h.get('capacity', 0)) >= int(sub.get('enrolledCount', 0))]
            hall = random.choice(suitable_halls) if suitable_halls else random.choice(active_halls)
            other_fac = [f for f in active_faculty if f.get('department') != sub.get('department')]
            fac = random.choice(other_fac) if other_fac else random.choice(active_faculty)

            chromo.append({
                'examId': ex['id'],
                'subjectId': ex['subjectId'],
                'date': date_by_exam_id.get(ex['id'], random.choice(effective_dates)),
                'session': random.choice(effective_sessions),
                'hallId': hall['id'],
                'facultyId': fac['id'],
            })
        return chromo

    population = [create_random_chromosome() for _ in range(pop_size)]
    best_chromosome = None
    best_fitness = -1.0
    best_hard_conflicts = 9999
    best_soft_violations = 9999
    fitness_history = []

    best_gen = 0

    for gen in range(generations):
        evaluated = []
        for chromo in population:
            fit, hard, soft = evaluate_chromosome(
                chromo,
                subjects_map,
                halls_map,
                faculty_map,
                departments=departments,
                students=students,
                policy=pol,
                is_single_day=is_single_day,
            )
            evaluated.append((chromo, fit, hard, soft))
            if fit > best_fitness:
                best_fitness = fit
                best_chromosome = [dict(g) for g in chromo]
                best_hard_conflicts = hard
                best_soft_violations = soft
                best_gen = gen + 1

        fitness_history.append({
            'generation': gen + 1,
            'fitness': round(best_fitness, 2),
            'hardConflicts': best_hard_conflicts,
        })

        if early_stop_gens > 0 and best_hard_conflicts == 0 and ((gen + 1) - best_gen) >= early_stop_gens:
            break
        elif early_stop_gens == 0 and best_hard_conflicts == 0 and gen >= 15:
            break

        evaluated_sorted = sorted(evaluated, key=lambda x: x[1], reverse=True)
        new_pop = []
        for idx in range(elitism_count):
            elite_chrom = evaluated_sorted[idx][0] if idx < len(evaluated_sorted) else best_chromosome
            if elite_chrom:
                new_pop.append([dict(g) for g in elite_chrom])

        while len(new_pop) < pop_size:
            k_tour = min(tournament_size, len(evaluated))
            c1 = max(random.sample(evaluated, k_tour), key=lambda x: x[1])[0]
            c2 = max(random.sample(evaluated, k_tour), key=lambda x: x[1])[0]

            if random.random() < crossover_rate:
                child = [dict(c1[i] if random.random() < 0.5 else c2[i]) for i in range(len(c1))]
            else:
                child = [dict(g) for g in c1]

            for gene in child:
                if random.random() < mutation_rate:
                    if not is_single_day:
                        gene['date'] = random.choice(effective_dates)
                    gene['session'] = random.choice(effective_sessions)
                    sub = subjects_map.get(gene['subjectId'], {})
                    suitable_halls = [h for h in active_halls if int(h.get('capacity', 0)) >= int(sub.get('enrolledCount', 0))]
                    hall = random.choice(suitable_halls) if suitable_halls else random.choice(active_halls)
                    gene['hallId'] = hall['id']
                    gene['facultyId'] = random.choice(active_faculty)['id']

            new_pop.append(child)

        population = new_pop

    evaluate_chromosome(
        best_chromosome,
        subjects_map,
        halls_map,
        faculty_map,
        departments=departments,
        students=students,
        policy=pol,
        is_single_day=is_single_day,
    )

    schedule_details = []
    for g in best_chromosome:
        sub = subjects_map.get(g['subjectId'], {})
        hall = halls_map.get(g['hallId'], {})
        fac = faculty_map.get(g['facultyId'], {})

        schedule_details.append({
            'examId': g['examId'],
            'subjectId': g['subjectId'],
            'subjectCode': sub.get('code', 'N/A'),
            'subjectName': sub.get('name', 'N/A'),
            'department': sub.get('department', 'N/A'),
            'batch': sub.get('batch', '2024'),
            'section': sub.get('section', 'Section A'),
            'semester': sub.get('semester', 1),
            'enrolledCount': sub.get('enrolledCount', 0),
            'date': g['date'],
            'session': g['session'],
            'hallId': g['hallId'],
            'hallNumber': hall.get('hallNumber', 'N/A'),
            'hallCapacity': hall.get('capacity', 0),
            'building': hall.get('building', 'N/A'),
            'invigilatorId': g['facultyId'],
            'facultyId': g['facultyId'],
            'invigilatorName': fac.get('name', 'N/A'),
            'invigilatorDept': fac.get('department', 'N/A'),
            'hasStudentClash': g.get('hasStudentClash', False),
            'hasHallDoubleBooking': g.get('hasHallDoubleBooking', False),
            'hasInvigilatorConflict': g.get('hasInvigilatorConflict', False),
            'hasCapacityIssue': g.get('hasCapacityIssue', False),
            'hasDepartmentBias': g.get('hasDepartmentBias', False),
            'hasDepartmentWarning': g.get('hasDepartmentWarning', False),
            'hasDepartmentDateViolation': g.get('hasDepartmentDateViolation', False),
            'hasDepartmentGapViolation': g.get('hasDepartmentGapViolation', False),
            'hasDepartmentIndependenceViolation': g.get('hasDepartmentIndependenceViolation', False),
        })

    return {
        'bestSchedule': schedule_details,
        'fitness': round(best_fitness, 2),
        'hardConflicts': best_hard_conflicts,
        'softScore': best_soft_violations,
        'fitnessHistory': fitness_history,
        'isConflictFree': best_hard_conflicts == 0,
        'policy': pol,
        'effectiveDates': effective_dates,
    }
