/**
 * Pure dashboard metric & chart data builders for OverviewDashboard,
 * DashboardSummary, and DashboardWidget.
 */

export function abbreviateDepartment(departmentName) {
  const name = String(departmentName || '').trim();
  if (!name) return 'General';
  if (name === 'B.Sc. Computer Science (B.Sc. CSE)') return 'B.Sc. CSE';
  if (name.length <= 16) return name;
  return `${name.slice(0, 14)}…`;
}

export function computeDashboardSummary({
  schedule = [],
  halls = [],
  faculty = [],
  students = [],
  departments = [],
}) {
  const facultyById = new Map(faculty.map((f) => [f.id, f]));

  const totalScheduledExams = schedule.length;
  const totalClassrooms = halls.length;
  const availableClassrooms = halls.filter((h) => Boolean(h.available)).length;

  const pendingInvigilations = schedule.filter((item) => {
    const invId = item.invigilatorId || item.facultyId;
    if (!invId || !item.invigilatorName || item.invigilatorName === 'N/A') {
      return true;
    }
    if (item.hasInvigilatorConflict) {
      return true;
    }
    const fac = facultyById.get(invId);
    if (fac && !fac.available) {
      return true;
    }
    return false;
  }).length;

  return {
    totalScheduledExams,
    availableClassrooms,
    totalClassrooms,
    pendingInvigilations,
    totalStudents: students.length,
    activeDepartments: departments.length,
    totalFaculty: faculty.length,
  };
}

export function getAvailableSemesters({ schedule = [], subjects = [] }) {
  const semesterSet = new Set();
  for (const sub of subjects) {
    if (sub.semester !== undefined && sub.semester !== null && sub.semester !== '') {
      semesterSet.add(Number(sub.semester));
    }
  }
  for (const item of schedule) {
    if (item.semester !== undefined && item.semester !== null && item.semester !== '') {
      semesterSet.add(Number(item.semester));
    }
  }
  return Array.from(semesterSet)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export function buildDepartmentExamDistribution({
  schedule = [],
  departments = [],
  subjects = [],
  semester = 'ALL',
}) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const counts = new Map();

  for (const dept of departments) {
    const deptName = typeof dept === 'string' ? dept : dept?.name;
    if (deptName) {
      counts.set(deptName, { scheduledExams: 0, enrolledStudents: 0 });
    }
  }

  for (const item of schedule) {
    const itemSemester =
      item.semester ?? subjectById.get(item.subjectId)?.semester ?? null;

    if (semester !== 'ALL' && Number(itemSemester) !== Number(semester)) {
      continue;
    }

    const dept = item.department || 'General';
    if (!counts.has(dept)) {
      counts.set(dept, { scheduledExams: 0, enrolledStudents: 0 });
    }
    const entry = counts.get(dept);
    entry.scheduledExams += 1;
    entry.enrolledStudents += Number(item.enrolledCount || 0);
  }

  return Array.from(counts.entries()).map(([department, stats]) => ({
    department,
    shortDept: abbreviateDepartment(department),
    scheduledExams: stats.scheduledExams,
    enrolledStudents: stats.enrolledStudents,
  }));
}
