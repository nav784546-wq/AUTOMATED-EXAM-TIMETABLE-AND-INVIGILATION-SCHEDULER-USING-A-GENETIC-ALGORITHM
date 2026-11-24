import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateScheduleConflicts,
  compareExamStudentOverlap,
} from './conflictEvaluator.js';

test('same department exams in different batches/semesters without shared students trigger department warning, NOT student clash', () => {
  const subjects = [
    { id: 's1', code: 'AIDS301', department: 'BCA (AI & DS)', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 50 },
    { id: 's2', code: 'AIDS501', department: 'BCA (AI & DS)', batch: '2023', semester: 5, section: 'Section A', enrolledCount: 48 },
  ];
  const students = [
    { id: 'st1', regNo: '24A001', enrolledSubjectIds: ['s1'] },
    { id: 'st2', regNo: '23A001', enrolledSubjectIds: ['s2'] },
  ];
  const faculty = [
    { id: 'f1', name: 'Prof. A', available: true },
    { id: 'f2', name: 'Prof. B', available: true },
  ];
  const halls = [
    { id: 'h1', hallNumber: 'A-101', capacity: 60, available: true },
    { id: 'h2', hallNumber: 'A-102', capacity: 60, available: true },
  ];

  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 's1',
      subjectCode: 'AIDS301',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section A',
      enrolledCount: 50,
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h1',
      hallCapacity: 60,
      invigilatorId: 'f1',
    },
    {
      examId: 'ex-2',
      subjectId: 's2',
      subjectCode: 'AIDS501',
      department: 'BCA (AI & DS)',
      batch: '2023',
      semester: 5,
      section: 'Section A',
      enrolledCount: 48,
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h2',
      hallCapacity: 60,
      invigilatorId: 'f2',
    },
  ];

  const res = evaluateScheduleConflicts(schedule, {
    faculty,
    subjects,
    students,
    halls,
    policy: { oneExamPerDeptPerDay: false, minGapDaysBetweenExams: 0 },
  });
  assert.equal(res.conflicts.studentClashes, 0);
  assert.equal(res.conflicts.totalHardViolations, 0);
  assert.equal(res.conflicts.departmentWarnings, 2);
  assert.equal(res.schedule[0].hasStudentClash, false);
  assert.equal(res.schedule[0].hasDepartmentWarning, true);

  // Under default policy, scheduling two exams in the same department on the same day triggers a hard date violation
  const defaultRes = evaluateScheduleConflicts(schedule, { faculty, subjects, students, halls });
  assert.equal(defaultRes.conflicts.departmentSameDayViolations, 1);
  assert.equal(defaultRes.schedule[0].hasDepartmentDateViolation, true);
});

test('overlapping enrolledSubjectIds across different departments triggers hard student clash', () => {
  const subjects = [
    { id: 's1', code: 'AIDS301', department: 'BCA (AI & DS)', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 50 },
    { id: 's4', code: 'ELEC401', department: 'ECE', batch: '2023', semester: 5, section: 'Section B', enrolledCount: 30 },
  ];
  const students = [
    { id: 'st1', regNo: '24A001', enrolledSubjectIds: ['s1', 's4'] },
  ];
  const faculty = [
    { id: 'f1', available: true },
    { id: 'f2', available: true },
  ];
  const halls = [
    { id: 'h1', capacity: 60, available: true },
    { id: 'h2', capacity: 60, available: true },
  ];

  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 's1',
      subjectCode: 'AIDS301',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section A',
      enrolledCount: 50,
      date: '2026-11-16',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h1',
      hallCapacity: 60,
      invigilatorId: 'f1',
    },
    {
      examId: 'ex-2',
      subjectId: 's4',
      subjectCode: 'ELEC401',
      department: 'ECE',
      batch: '2023',
      semester: 5,
      section: 'Section B',
      enrolledCount: 30,
      date: '2026-11-16',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h2',
      hallCapacity: 60,
      invigilatorId: 'f2',
    },
  ];

  const res = evaluateScheduleConflicts(schedule, { faculty, subjects, students, halls });
  assert.equal(res.conflicts.studentClashes, 2);
  assert.equal(res.conflicts.totalHardViolations, 2);
  assert.equal(res.schedule[0].hasStudentClash, true);
  assert.equal(res.schedule[1].hasStudentClash, true);
});

test('disjoint sections in same department, batch, and semester without shared students are not student clashes', () => {
  const overlap = compareExamStudentOverlap(
    {
      examId: 'e1',
      subjectId: 's1',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section A',
    },
    {
      examId: 'e2',
      subjectId: 's2',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section B',
    }
  );
  assert.equal(overlap.isStudentClash, false);
  assert.equal(overlap.isDepartmentWarning, true);
});
