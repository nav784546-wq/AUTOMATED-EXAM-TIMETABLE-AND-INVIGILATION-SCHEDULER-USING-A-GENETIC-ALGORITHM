import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import backend.database as db_mod
import backend.server as server_mod
from backend.services.hall_allocation_service import (
    allocate_exam_halls,
    build_combined_hall_report_rows,
    build_department_wise_report_rows,
    build_individual_student_report_rows,
    lookup_student_hall_assignments,
    validate_hall_allocation_plan,
)


def make_students(dept, count, prefix="", start=1, width=4, section="Section A", batch="2024"):
    items = []
    for idx in range(count):
        num = str(start + idx).zfill(width)
        items.append(
            {
                "id": f"{dept.replace(' ', '_')}-{start + idx}",
                "regNo": f"{prefix}{num}",
                "name": f"{dept} Student {start + idx}",
                "department": dept,
                "section": section,
                "batch": batch,
                "semester": 3,
            }
        )
    return items


class TestHallAllocationServiceScenarios(unittest.TestCase):
    def test_scenario_1_single_department_60_students_sequential_leading_zeros(self):
        students = list(reversed(make_students("BCA (AI & DS)", 60)))
        halls = [
            {"id": f"h{i}", "hallNumber": f"Room {100 + i}", "building": "Main", "capacity": 30, "available": True}
            for i in range(1, 7)
        ]
        plan = allocate_exam_halls(
            students=students,
            halls=halls,
            selected_departments=["BCA (AI & DS)"],
            target_mode="CUSTOM",
            custom_target_per_dept=10,
        )
        self.assertEqual(plan["totalStudents"], 60)
        self.assertEqual(plan["totalAllocated"], 60)
        self.assertEqual(plan["hallsRequired"], 6)
        self.assertEqual(plan["shortfallSeats"], 0)
        rows = build_department_wise_report_rows(plan)
        self.assertEqual(
            [(r["hallNumber"], r["regNoRange"], r["studentCount"]) for r in rows],
            [
                ("Room 101", "0001–0010", 10),
                ("Room 102", "0011–0020", 10),
                ("Room 103", "0021–0030", 10),
                ("Room 104", "0031–0040", 10),
                ("Room 105", "0041–0050", 10),
                ("Room 106", "0051–0060", 10),
            ],
        )

    def test_scenario_2_two_departments_100_students_50_percent_target(self):
        s_a = make_students("Dept A", 60, prefix="A")
        s_b = make_students("Dept B", 40, prefix="B")
        halls = [
            {"id": "h1", "hallNumber": "Hall 101", "building": "Main", "capacity": 60, "available": True},
            {"id": "h2", "hallNumber": "Hall 102", "building": "Main", "capacity": 60, "available": True},
            {"id": "h3", "hallNumber": "Hall 103", "building": "Main", "capacity": 60, "available": True},
        ]
        plan = allocate_exam_halls(
            students=s_a + s_b,
            halls=halls,
            selected_departments=["Dept A", "Dept B"],
            target_mode="PERCENT_50",
        )
        self.assertEqual(plan["totalAllocated"], 100)
        self.assertEqual(plan["hallsRequired"], 2)
        combined = build_combined_hall_report_rows(plan)
        self.assertEqual(
            [(r["hallNumber"], r["department"], r["regNoRange"], r["studentCount"]) for r in combined],
            [
                ("Hall 101", "Dept A", "A0001–A0030", 30),
                ("Hall 101", "Dept B", "B0001–B0020", 20),
                ("Hall 102", "Dept A", "A0031–A0060", 30),
                ("Hall 102", "Dept B", "B0021–B0040", 20),
            ],
        )

    def test_scenario_3_unequal_department_strengths_no_overflow(self):
        s_a = make_students("BCA", 60, prefix="BCA")
        s_b = make_students("BBA", 25, prefix="BBA")
        halls = [
            {"id": "h1", "hallNumber": "H-1", "building": "Main", "capacity": 50, "available": True},
            {"id": "h2", "hallNumber": "H-2", "building": "Main", "capacity": 50, "available": True},
        ]
        plan = allocate_exam_halls(
            students=s_a + s_b,
            halls=halls,
            selected_departments=["BCA", "BBA"],
            target_mode="PERCENT_50",
        )
        self.assertEqual(plan["totalAllocated"], 85)
        self.assertEqual(plan["shortfallSeats"], 0)
        for hs in plan["allocatedHalls"]:
            self.assertLessEqual(len(hs["departmentBreakdown"]), 2)
            self.assertLessEqual(hs["allocated"], hs["capacity"])

    def test_scenario_4_more_than_two_departments_respects_max_depts_per_hall(self):
        students = (
            make_students("Dept A", 15, prefix="A")
            + make_students("Dept B", 15, prefix="B")
            + make_students("Dept C", 15, prefix="C")
            + make_students("Dept D", 15, prefix="D")
        )
        halls = [
            {"id": f"h{i}", "hallNumber": f"R-{i}", "building": "Main", "capacity": 30, "available": True}
            for i in range(1, 6)
        ]
        plan = allocate_exam_halls(
            students=students,
            halls=halls,
            selected_departments=["Dept A", "Dept B", "Dept C", "Dept D"],
            max_depts_per_hall=2,
        )
        self.assertEqual(plan["totalAllocated"], 60)
        for hs in plan["allocatedHalls"]:
            self.assertLessEqual(len(hs["departmentBreakdown"]), 2)
            self.assertLessEqual(hs["allocated"], hs["capacity"])
        # Configurable max_depts_per_hall=3
        plan3 = allocate_exam_halls(
            students=students,
            halls=[{"id": "big1", "hallNumber": "AUDI-1", "building": "Main", "capacity": 90, "available": True}],
            selected_departments=["Dept A", "Dept B", "Dept C", "Dept D"],
            max_depts_per_hall=3,
        )
        self.assertEqual(len(plan3["allocatedHalls"][0]["departmentBreakdown"]), 3)
        self.assertEqual(plan3["totalAllocated"], 45)
        self.assertEqual(plan3["shortfallSeats"], 15)

    def test_scenario_5_small_remainder_less_than_10_consolidated_cleanly(self):
        s_a = make_students("Dept A", 65, prefix="A")
        s_b = make_students("Dept B", 45, prefix="B")
        halls = [
            {"id": "h1", "hallNumber": "H-1", "building": "Main", "capacity": 60, "available": True},
            {"id": "h2", "hallNumber": "H-2", "building": "Main", "capacity": 60, "available": True},
            {"id": "h3", "hallNumber": "H-3", "building": "Main", "capacity": 60, "available": True},
        ]
        plan = allocate_exam_halls(
            students=s_a + s_b,
            halls=halls,
            selected_departments=["Dept A", "Dept B"],
            target_mode="CUSTOM",
            custom_target_per_dept=30,
        )
        # 5 remainder of Dept A (<10 and <target 30) consolidates into H-2 (15 free) -> only 2 halls used!
        self.assertEqual(plan["totalAllocated"], 110)
        self.assertEqual(plan["hallsRequired"], 2)
        self.assertEqual(plan["shortfallSeats"], 0)
        self.assertEqual([a["regNo"] for a in plan["allocations"] if a["department"] == "Dept A"], [f"A{str(i).zfill(4)}" for i in range(1, 66)])

    def test_scenario_6_mixed_hall_capacities_30_50_100_best_fit(self):
        s_a = make_students("Dept A", 60, prefix="A")
        s_b = make_students("Dept B", 40, prefix="B")
        halls = [
            {"id": "h30", "hallNumber": "H-30", "building": "Main", "capacity": 30, "available": True},
            {"id": "h50", "hallNumber": "H-50", "building": "Main", "capacity": 50, "available": True},
            {"id": "h100", "hallNumber": "H-100", "building": "Main", "capacity": 100, "available": True},
        ]
        plan = allocate_exam_halls(
            students=s_a + s_b,
            halls=halls,
            selected_departments=["Dept A", "Dept B"],
            target_percentage=50,
        )
        self.assertEqual(plan["totalAllocated"], 100)
        self.assertEqual(plan["hallsRequired"], 2)
        used_nums = {h["hallNumber"] for h in plan["allocatedHalls"]}
        self.assertEqual(used_nums, {"H-50", "H-100"})

    def test_scenario_7_insufficient_halls_returns_clear_shortfall(self):
        students = make_students("BCA", 100, prefix="24BCA")
        halls = [
            {"id": "h1", "hallNumber": "R-1", "building": "Main", "capacity": 40, "available": True},
            {"id": "h2", "hallNumber": "R-2", "building": "Main", "capacity": 30, "available": True},
        ]
        plan = allocate_exam_halls(students=students, halls=halls, selected_departments=["BCA"])
        self.assertEqual(plan["totalAllocated"], 70)
        self.assertEqual(plan["shortfallSeats"], 30)
        self.assertEqual(plan["additionalHallsRequired"], 1)
        self.assertEqual(plan["unallocatedStudents"][0]["regNo"], "24BCA0071")

    def test_scenario_8_leading_zero_preservation_and_alphanumeric_natural_sort(self):
        raw_regs = ["24CS010", "24CS002", "24CS001", "24CS009", "24CS011"]
        students = [
            {
                "id": f"s-{r}",
                "regNo": r,
                "name": f"Student {r}",
                "department": "CSE",
                "section": "Section A",
                "batch": "2024",
            }
            for r in raw_regs
        ]
        halls = [{"id": "h1", "hallNumber": "C-101", "building": "Main", "capacity": 20, "available": True}]
        plan = allocate_exam_halls(students=students, halls=halls, selected_departments=["CSE"])
        ordered_regs = [a["regNo"] for a in plan["allocations"]]
        self.assertEqual(ordered_regs, ["24CS001", "24CS002", "24CS009", "24CS010", "24CS011"])
        self.assertEqual(plan["allocatedHalls"][0]["departmentBreakdown"][0]["regNoRange"], "24CS001–24CS011")

    def test_scenario_9_multi_section_and_batch_within_department(self):
        sec_a = make_students("BCA", 15, prefix="24BCA", start=1, section="Section A", batch="2024")
        sec_b = make_students("BCA", 15, prefix="24BCA", start=16, section="Section B", batch="2024")
        halls = [{"id": "h1", "hallNumber": "A-101", "building": "Main", "capacity": 40, "available": True}]
        plan = allocate_exam_halls(
            students=sec_b + sec_a,
            halls=halls,
            selected_departments=["BCA"],
            target_percentage=100,
        )
        self.assertEqual(plan["totalAllocated"], 30)
        ind = build_individual_student_report_rows(plan)
        self.assertEqual(ind[0]["section"], "Section A")
        self.assertEqual(ind[15]["section"], "Section B")

    def test_scenario_10_multiple_sessions_same_date_isolated_and_configurable_halls(self):
        students_a = make_students("Dept A", 30, prefix="A")
        students_b = make_students("Dept B", 30, prefix="B")
        halls = [
            {"id": "h1", "hallNumber": "H-1", "building": "Main", "capacity": 40, "available": True},
            {"id": "h2", "hallNumber": "H-2", "building": "Main", "capacity": 40, "available": True},
        ]
        fn_plan = allocate_exam_halls(
            students=students_a,
            halls=halls,
            selected_departments=["Dept A"],
            exam_date="2026-11-17",
            session="FN",
            selected_hall_ids=["h1"],
        )
        fn_plan["id"] = "alloc-fn"
        self.assertEqual([h["hallNumber"] for h in fn_plan["allocatedHalls"]], ["H-1"])

        # Same date AN session can still use H-1 cleanly
        an_plan = allocate_exam_halls(
            students=students_a + students_b,
            halls=halls,
            selected_departments=["Dept B"],
            exam_date="2026-11-17",
            session="AN",
        )
        an_plan["id"] = "alloc-an"
        v_an = validate_hall_allocation_plan(an_plan, existing_session_allocations=[fn_plan])
        self.assertTrue(v_an["isValid"])

        # Same date FN session attempting to reuse H-1 or duplicate student fails validation
        dup_fn = allocate_exam_halls(
            students=students_a,
            halls=halls,
            selected_departments=["Dept A"],
            exam_date="2026-11-17",
            session="FN",
        )
        dup_fn["id"] = "alloc-fn-dup"
        v_dup = validate_hall_allocation_plan(dup_fn, existing_session_allocations=[fn_plan])
        self.assertFalse(v_dup["isValid"])
        self.assertIn("H-1", v_dup["conflictingHalls"])
        self.assertTrue(len(v_dup["conflictingStudents"]) > 0)

        matches = lookup_student_hall_assignments("A0005", [fn_plan, an_plan], exam_date="2026-11-17", session="FN")
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["hallNumber"], "H-1")


class TestHallAllocationHttpEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp_dir = tempfile.TemporaryDirectory()
        cls.orig_db_path = db_mod.DB_PATH
        db_mod.DB_PATH = os.path.join(cls.tmp_dir.name, "test_hall_alloc.db")
        db_mod.init_db()

        cls.server = HTTPServer(("127.0.0.1", 0), server_mod.ExamGridRequestHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        db_mod.DB_PATH = cls.orig_db_path
        cls.tmp_dir.cleanup()

    def _req(self, method, path, body=None):
        url = f"http://127.0.0.1:{self.port}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if body is not None else {}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8"))

    def test_generate_preview_confirm_report_student_lookup_and_conflict_409(self):
        # 1. Preview
        status, preview = self._req(
            "POST",
            "/api/hall-allocation/preview",
            {
                "examDate": "2026-11-20",
                "session": "FN",
                "selectedDepartments": ["BCA (AI & DS)", "BCA (DT)"],
                "targetPercentage": 50,
                "maxDeptsPerHall": 2,
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(preview["isPreview"])
        self.assertGreater(preview["totalAllocated"], 0)
        self.assertIn("combined", preview["reports"])

        # 2. Generate
        status, gen = self._req(
            "POST",
            "/api/hall-allocation/generate",
            {
                "examDate": "2026-11-20",
                "session": "FN",
                "selectedDepartments": ["BCA (AI & DS)", "BCA (DT)"],
                "targetPercentage": 50,
                "maxDeptsPerHall": 2,
            },
        )
        self.assertEqual(status, 200)
        self.assertFalse(gen["isPreview"])

        # 3. Confirm
        status, confirmed = self._req("POST", "/api/hall-allocation/confirm", gen)
        self.assertEqual(status, 200)
        self.assertTrue(confirmed["confirmed"])
        alloc_id = confirmed["id"]

        # 4. Duplicate confirm for same (date, session, students/hall) returns 409 Conflict
        status_dup, err_dup = self._req(
            "POST",
            "/api/hall-allocation/confirm",
            {**gen, "id": "hallalloc-duplicate-attempt"},
        )
        self.assertEqual(status_dup, 409)
        self.assertIn("error", err_dup)

        # 5. Report endpoint
        status_rep, rep = self._req(
            "GET",
            f"/api/hall-allocation/report?allocationId={alloc_id}&format=ALL",
        )
        self.assertEqual(status_rep, 200)
        self.assertEqual(rep["allocationId"], alloc_id)
        self.assertTrue(len(rep["combined"]) > 0)
        self.assertTrue(len(rep["individual"]) > 0)

        # 6. Student lookup endpoint (hit & 404 miss)
        first_reg = confirmed["allocations"][0]["regNo"]
        status_stu, stu_res = self._req("GET", f"/api/hall-allocation/student/{first_reg}")
        self.assertEqual(status_stu, 200)
        self.assertTrue(stu_res["found"])
        self.assertEqual(stu_res["registrationNumber"], first_reg)

        status_miss, miss_res = self._req("GET", "/api/hall-allocation/student/NO_SUCH_REG_999")
        self.assertEqual(status_miss, 404)
        self.assertFalse(miss_res["found"])


if __name__ == "__main__":
    unittest.main()
