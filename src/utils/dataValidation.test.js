import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSafeId,
  validateUniqueName,
  validateUniqueSection,
  validateUniqueSubjectCode,
  validateUniqueHallNumber,
  validateUniqueFacultyId,
  validateUniqueStudentRegNo,
  recalculateScheduleConflicts,
} from './dataValidation.js';

test('generateSafeId produces Firestore-rule-compliant IDs', () => {
  const id = generateSafeId('stu');
  assert.match(id, /^[a-zA-Z0-9_-]+$/);
  assert.ok(id.startsWith('stu-'));
});

test('uniqueness validators reject case-insensitive duplicates and allow editing own record', () => {
  const students = [{ id: 'stu-1', regNo: '24AIDS001' }];
  assert.equal(validateUniqueStudentRegNo(students, '24aids001').valid, false);
  assert.equal(validateUniqueStudentRegNo(students, '24aids001', 'stu-1').valid, true);
  assert.equal(validateUniqueStudentRegNo(students, '24AIDS002').valid, true);

  const halls = [{ id: 'hall-1', hallNumber: 'A-101' }];
  assert.equal(validateUniqueHallNumber(halls, 'a-101').valid, false);
  assert.equal(validateUniqueHallNumber(halls, 'a-101', 'hall-1').valid, true);

  const faculty = [{ id: 'fac-1', employeeId: 'FAC-101' }];
  assert.equal(validateUniqueFacultyId(faculty, 'fac-101').valid, false);

  const subjects = [{ id: 'sub-1', code: 'AIDS301' }];
  assert.equal(validateUniqueSubjectCode(subjects, 'aids301').valid, false);

  const depts = [{ id: 'dept-1', name: 'B.Tech' }];
  assert.equal(validateUniqueName(depts, 'b.tech', 'Department').valid, false);
  assert.equal(validateUniqueName(depts, 'b.tech', 'Department', 'dept-1').valid, true);

  const secs = [{ id: 'sec-1', department: 'B.Tech', name: 'Section A' }];
  assert.equal(validateUniqueSection(secs, 'b.tech', 'section a').valid, false);
  assert.equal(validateUniqueSection(secs, 'ECE', 'section a').valid, true);
});

test('recalculateScheduleConflicts detects double-booked halls, invigilators, and capacity issues', () => {
  const faculty = [
    { id: 'fac-1', name: 'Prof. A', available: true },
    { id: 'fac-2', name: 'Prof. B', available: false },
  ];
  const schedule = [
    {
      examId: 'e1',
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      department: 'B.Tech',
      hallId: 'h1',
      hallCapacity: 60,
      enrolledCount: 50,
      invigilatorId: 'fac-1',
    },
    {
      examId: 'e2',
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      department: 'ECE',
      hallId: 'h1',
      hallCapacity: 40,
      enrolledCount: 50,
      invigilatorId: 'fac-2',
    },
  ];
  const result = recalculateScheduleConflicts(schedule, faculty);
  assert.equal(result.conflicts.hallDoubleBookings, 2);
  assert.equal(result.conflicts.capacityViolations, 1);
  assert.equal(result.conflicts.invigilatorConflicts, 1);
  assert.equal(result.conflicts.studentClashes, 0);
  assert.equal(result.conflicts.totalHardViolations, 4);
});
