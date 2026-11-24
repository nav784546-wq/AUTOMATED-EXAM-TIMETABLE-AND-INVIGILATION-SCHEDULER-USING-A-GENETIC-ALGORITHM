import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardSummary,
  getAvailableSemesters,
  buildDepartmentExamDistribution,
} from './dashboardMetrics.js';

test('computeDashboardSummary computes scheduled exams, available classrooms, and pending invigilations', () => {
  const halls = [
    { id: 'h1', available: true },
    { id: 'h2', available: false },
    { id: 'h3', available: true },
  ];
  const faculty = [
    { id: 'f1', available: true },
    { id: 'f2', available: false },
  ];
  const schedule = [
    { examId: 'e1', invigilatorId: 'f1', invigilatorName: 'Dr. A', hasInvigilatorConflict: false },
    { examId: 'e2', invigilatorId: 'f2', invigilatorName: 'Prof. B', hasInvigilatorConflict: false },
    { examId: 'e3', invigilatorId: '', invigilatorName: '', hasInvigilatorConflict: false },
    { examId: 'e4', invigilatorId: 'f1', invigilatorName: 'Dr. A', hasInvigilatorConflict: true },
  ];

  const summary = computeDashboardSummary({
    schedule,
    halls,
    faculty,
    students: [{ id: 's1' }, { id: 's2' }],
    departments: ['BCA (AI & DS)', 'B.Tech'],
  });

  assert.equal(summary.totalScheduledExams, 4);
  assert.equal(summary.availableClassrooms, 2);
  assert.equal(summary.totalClassrooms, 3);
  assert.equal(summary.pendingInvigilations, 3); // unavailable f2, missing id, conflict
  assert.equal(summary.totalStudents, 2);
  assert.equal(summary.activeDepartments, 2);
  assert.equal(summary.totalFaculty, 2);
});

test('buildDepartmentExamDistribution aggregates scheduled exams by department and filters by semester', () => {
  const departments = ['BCA (AI & DS)', 'BCA (DT)', 'B.Sc. Computer Science (B.Sc. CSE)'];
  const subjects = [
    { id: 'sub-1', semester: 3 },
    { id: 'sub-2', semester: 3 },
    { id: 'sub-3', semester: 5 },
  ];
  const schedule = [
    { examId: 'e1', subjectId: 'sub-1', department: 'BCA (AI & DS)', enrolledCount: 50, semester: 3 },
    { examId: 'e2', subjectId: 'sub-2', department: 'BCA (DT)', enrolledCount: 45 },
    { examId: 'e3', subjectId: 'sub-3', department: 'BCA (AI & DS)', enrolledCount: 40, semester: 5 },
  ];

  const allDist = buildDepartmentExamDistribution({
    schedule,
    departments,
    subjects,
    semester: 'ALL',
  });
  assert.equal(allDist.length, 3);
  assert.equal(allDist.find((d) => d.department === 'BCA (AI & DS)').scheduledExams, 2);
  assert.equal(allDist.find((d) => d.department === 'BCA (DT)').scheduledExams, 1);
  assert.equal(allDist.find((d) => d.department === 'B.Sc. Computer Science (B.Sc. CSE)').shortDept, 'B.Sc. CSE');
  assert.equal(allDist.find((d) => d.department === 'B.Sc. Computer Science (B.Sc. CSE)').scheduledExams, 0);

  const sem3Dist = buildDepartmentExamDistribution({
    schedule,
    departments,
    subjects,
    semester: 3,
  });
  assert.equal(sem3Dist.find((d) => d.department === 'BCA (AI & DS)').scheduledExams, 1);
  assert.equal(sem3Dist.find((d) => d.department === 'BCA (DT)').scheduledExams, 1);
});

test('getAvailableSemesters returns sorted unique semester numbers', () => {
  const sems = getAvailableSemesters({
    subjects: [{ semester: 5 }, { semester: 1 }, { semester: 3 }, { semester: 3 }],
    schedule: [{ semester: 7 }],
  });
  assert.deepEqual(sems, [1, 3, 5, 7]);
});
