import unittest

from backend.services.exam_date_validation import (
    DEFAULT_SCHEDULING_POLICY,
    normalize_scheduling_policy,
    validate_complete_exam_timetable,
    validate_department_independence,
    validate_minimum_exam_gap,
    validate_one_exam_per_department_per_day,
    validate_student_exam_conflicts,
)
from backend.services.genetic_algorithm import run_genetic_algorithm


def _make_exam(
    exam_id,
    subject_id,
    code,
    name,
    department,
    date_str,
    session="FN (09:30 - 12:30)",
    hall_id="h1",
    faculty_id="f1",
    section="Section A",
    batch="2024",
    semester=3,
    department_id=None,
):
    item = {
        "examId": exam_id,
        "subjectId": subject_id,
        "subjectCode": code,
        "subjectName": name,
        "department": department,
        "batch": batch,
        "semester": semester,
        "section": section,
        "enrolledCount": 40,
        "date": date_str,
        "session": session,
        "hallId": hall_id,
        "hallCapacity": 60,
        "invigilatorId": faculty_id,
        "facultyId": faculty_id,
    }
    if department_id is not None:
        item["departmentId"] = department_id
    return item


class ExamDateValidationTests(unittest.TestCase):
    def setUp(self):
        self.halls = [
            {"id": "h1", "hallNumber": "A-101", "capacity": 60, "available": True},
            {"id": "h2", "hallNumber": "A-102", "capacity": 60, "available": True},
            {"id": "h3", "hallNumber": "A-103", "capacity": 60, "available": True},
        ]
        self.faculty = [
            {"id": "f1", "name": "Prof. One", "department": "ECE", "available": True, "maxDuties": 6},
            {"id": "f2", "name": "Prof. Two", "department": "MECH", "available": True, "maxDuties": 6},
            {"id": "f3", "name": "Prof. Three", "department": "CIVIL", "available": True, "maxDuties": 6},
        ]
        self.departments = [
            {"id": "dept-aids", "name": "BCA (AI & DS)"},
            {"id": "dept-dt", "name": "BCA (DT)"},
            {"id": "dept-cs", "name": "B.Sc. Computer Science"},
        ]

    def test_1_same_dept_fn_and_an_on_same_day_rejected(self):
        schedule = [
            _make_exam("ex1", "s1", "TAM101", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "ENG101", "English", "BCA (AI & DS)", "2026-11-17", "AN (14:00 - 17:00)", "h2", "f2"),
        ]
        res = validate_complete_exam_timetable(
            schedule,
            departments=self.departments,
            halls=self.halls,
            faculty=self.faculty,
            policy=DEFAULT_SCHEDULING_POLICY,
        )
        self.assertFalse(res["isValid"])
        self.assertFalse(res["oneExamPerDay"]["valid"])
        self.assertEqual(res["counts"]["departmentSameDayViolations"], 1)
        self.assertIn("17.11.2026", res["warnings"][0])
        self.assertIn("Only one examination per day per department is allowed", res["warnings"][0])

    def test_2_same_dept_nov_17_and_18_rejected_minimum_gap(self):
        schedule = [
            _make_exam("ex1", "s1", "TAM101", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "ENG101", "English", "BCA (AI & DS)", "2026-11-18", "FN (09:30 - 12:30)", "h1", "f1"),
        ]
        res = validate_complete_exam_timetable(schedule, departments=self.departments, halls=self.halls, faculty=self.faculty)
        self.assertFalse(res["isValid"])
        self.assertEqual(res["counts"]["departmentGapViolations"], 1)
        self.assertIn(
            "Invalid Schedule: BCA (AI & DS) has Tamil (TAM101) on 17.11.2026 and English (ENG101) on 18.11.2026. A minimum of two complete days between examinations is required.",
            res["warnings"],
        )

    def test_3_same_dept_nov_17_and_19_rejected_minimum_gap(self):
        schedule = [
            _make_exam("ex1", "s1", "TAM101", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "ENG101", "English", "BCA (AI & DS)", "2026-11-19", "AN (14:00 - 17:00)", "h1", "f1"),
        ]
        res = validate_minimum_exam_gap(schedule, departments=self.departments)
        self.assertFalse(res["valid"])
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["violations"][0]["actualCompleteGapDays"], 1)

    def test_4_same_dept_nov_17_and_20_accepted_exact_two_complete_days(self):
        schedule = [
            _make_exam("ex1", "s1", "TAM101", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "ENG101", "English", "BCA (AI & DS)", "2026-11-20", "FN (09:30 - 12:30)", "h1", "f1"),
        ]
        res = validate_complete_exam_timetable(schedule, departments=self.departments, halls=self.halls, faculty=self.faculty)
        self.assertTrue(res["isValid"])
        self.assertTrue(res["canFinalize"])
        self.assertEqual(res["counts"]["departmentGapViolations"], 0)
        timeline = res["departmentTimelines"]["BCA (AI & DS)"]
        self.assertEqual(timeline[1]["completeGapDaysFromPrev"], 2)
        self.assertTrue(timeline[1]["gapValid"])

    def test_5_same_dept_nov_17_21_25_29_accepted_three_complete_days(self):
        schedule = [
            _make_exam("ex1", "s1", "TAM101", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "ENG101", "English", "BCA (AI & DS)", "2026-11-21", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex3", "s3", "MAT101", "Mathematics", "BCA (AI & DS)", "2026-11-25", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex4", "s4", "CS101", "Computer Science", "BCA (AI & DS)", "2026-11-29", "FN (09:30 - 12:30)", "h1", "f1"),
        ]
        res = validate_complete_exam_timetable(schedule, departments=self.departments, halls=self.halls, faculty=self.faculty)
        self.assertTrue(res["isValid"])
        timeline = res["departmentTimelines"]["BCA (AI & DS)"]
        self.assertEqual([t["completeGapDaysFromPrev"] for t in timeline[1:]], [3, 3, 3])

    def test_6_distinct_departments_sharing_date_allowed_independently(self):
        schedule = [
            _make_exam("ex1", "s1", "TAM101", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "DT101", "Tamil", "BCA (DT)", "2026-11-17", "FN (09:30 - 12:30)", "h2", "f2"),
        ]
        res = validate_complete_exam_timetable(schedule, departments=self.departments, halls=self.halls, faculty=self.faculty)
        self.assertTrue(res["isValid"])
        self.assertEqual(res["counts"]["departmentIndependenceViolations"], 0)
        self.assertEqual(len(res["departmentIndependence"]["sharedDates"]), 1)

        strict_pol = normalize_scheduling_policy({"allowMultipleDeptsSameDate": False})
        strict_res = validate_department_independence(schedule, departments=self.departments, policy=strict_pol)
        self.assertFalse(strict_res["valid"])
        self.assertEqual(strict_res["count"], 1)

    def test_7_multi_department_independent_gaps_both_valid(self):
        schedule = [
            _make_exam("ex1", "s1", "AIDS1", "Tamil", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "AIDS2", "English", "BCA (AI & DS)", "2026-11-20", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex3", "s3", "DT1", "Tamil", "BCA (DT)", "2026-11-17", "FN (09:30 - 12:30)", "h2", "f2"),
            _make_exam("ex4", "s4", "DT2", "English", "BCA (DT)", "2026-11-21", "AN (14:00 - 17:00)", "h2", "f2"),
        ]
        res = validate_complete_exam_timetable(schedule, departments=self.departments, halls=self.halls, faculty=self.faculty)
        self.assertTrue(res["isValid"])
        self.assertEqual(res["departmentTimelines"]["BCA (AI & DS)"][1]["completeGapDaysFromPrev"], 2)
        self.assertEqual(res["departmentTimelines"]["BCA (DT)"][1]["completeGapDaysFromPrev"], 3)

    def test_8_canonical_department_id_and_multi_section_gap_enforcement(self):
        # Canonical dept ID links trimmed/differently cased names; distinct dept IDs stay independent even with identical subject name
        schedule = [
            _make_exam("ex1", "s1", "MAT101", "Mathematics", "bca (ai & ds)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1", section="Section A", department_id="dept-aids"),
            _make_exam("ex2", "s2", "ENG101", "English", "BCA (AI & DS)", "2026-11-19", "FN (09:30 - 12:30)", "h2", "f2", section="Section B", department_id="dept-aids"),
            _make_exam("ex3", "s3", "MAT201", "Mathematics", "BCA (DT)", "2026-11-17", "FN (09:30 - 12:30)", "h3", "f3", section="Section A", department_id="dept-dt"),
        ]
        res = validate_complete_exam_timetable(schedule, departments=self.departments, halls=self.halls, faculty=self.faculty)
        self.assertFalse(res["isValid"])
        self.assertEqual(res["counts"]["departmentGapViolations"], 1)
        self.assertEqual(set(res["minimumExamGap"]["violatingExamIds"]), {"ex1", "ex2"})

    def test_9_shared_student_across_departments_in_same_slot_rejected(self):
        students = [
            {"id": "stu-1", "regNo": "24001", "enrolledSubjectIds": ["s1", "s2"]},
        ]
        schedule = [
            _make_exam("ex1", "s1", "AIDS1", "Elective A", "BCA (AI & DS)", "2026-11-17", "FN (09:30 - 12:30)", "h1", "f1"),
            _make_exam("ex2", "s2", "DT1", "Elective B", "BCA (DT)", "2026-11-17", "FN (09:30 - 12:30)", "h2", "f2"),
        ]
        res = validate_student_exam_conflicts(schedule, students=students, departments=self.departments)
        self.assertFalse(res["valid"])
        self.assertEqual(res["count"], 1)
        self.assertIn("share 1 enrolled student", res["violations"][0]["message"])

    def test_10_python_ga_produces_zero_department_date_and_gap_violations(self):
        subjects = [
            {"id": "s1", "code": "AIDS1", "name": "Tamil", "department": "BCA (AI & DS)", "departmentId": "dept-aids", "batch": "2024", "semester": 3, "section": "Section A", "enrolledCount": 40},
            {"id": "s2", "code": "AIDS2", "name": "English", "department": "BCA (AI & DS)", "departmentId": "dept-aids", "batch": "2024", "semester": 3, "section": "Section A", "enrolledCount": 40},
            {"id": "s3", "code": "AIDS3", "name": "Mathematics", "department": "BCA (AI & DS)", "departmentId": "dept-aids", "batch": "2024", "semester": 3, "section": "Section A", "enrolledCount": 40},
            {"id": "s4", "code": "DT1", "name": "Tamil", "department": "BCA (DT)", "departmentId": "dept-dt", "batch": "2024", "semester": 3, "section": "Section A", "enrolledCount": 35},
            {"id": "s5", "code": "DT2", "name": "English", "department": "BCA (DT)", "departmentId": "dept-dt", "batch": "2024", "semester": 3, "section": "Section A", "enrolledCount": 35},
        ]
        exams = [{"id": f"ex-{s['id']}", "subjectId": s["id"]} for s in subjects]
        result = run_genetic_algorithm(
            exams,
            subjects,
            self.halls,
            self.faculty,
            config={
                "populationSize": 25,
                "generations": 40,
                "availableDates": ["2026-11-16", "2026-11-17", "2026-11-18"],
            },
            students=[],
            departments=self.departments,
        )
        self.assertEqual(result["hardConflicts"], 0)
        check = validate_complete_exam_timetable(
            result["bestSchedule"],
            departments=self.departments,
            subjects=subjects,
            halls=self.halls,
            faculty=self.faculty,
        )
        self.assertTrue(check["isValid"])
        self.assertEqual(check["counts"]["departmentSameDayViolations"], 0)
        self.assertEqual(check["counts"]["departmentGapViolations"], 0)


if __name__ == "__main__":
    unittest.main()
