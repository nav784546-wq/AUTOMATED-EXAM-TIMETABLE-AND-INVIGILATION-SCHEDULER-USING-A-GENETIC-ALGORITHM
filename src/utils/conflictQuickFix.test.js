import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestQuickFixesForExam,
  buildCellQuickFixPlan,
  buildBatchAutoResolvePlan,
} from './conflictQuickFix.js';

const halls = [
  { id: 'h1', hallNumber: 'D-105', capacity: 120, available: true },
  { id: 'h2', hallNumber: 'B-201', capacity: 100, available: true },
  { id: 'h3', hallNumber: 'A-101', capacity: 60, available: true },
];

const faculty = [
  { id: 'f1', name: 'Prof. Deepika Iyer', department: 'B.Tech', available: true },
  { id: 'f2', name: 'Dr. Arvind Krishnan', department: 'BCA (AI & DS)', available: true },
  { id: 'f3', name: 'Dr. Suresh Babu', department: 'ECE', available: true },
];

const subjects = [
  { id: 's1', code: 'AIDS301', name: 'Applied Data Systems', department: 'BCA (AI & DS)', batch: '2024', semester: 3, enrolledCount: 58 },
  { id: 's2', code: 'AIDS302', name: 'Data Wrangling', department: 'BCA (AI & DS)', batch: '2024', semester: 3, enrolledCount: 56 },
  { id: 's3', code: 'BT301', name: 'Operating Systems', department: 'B.Tech', batch: '2024', semester: 3, enrolledCount: 64 },
  { id: 's4', code: 'BT302', name: 'Computer Networks', department: 'B.Tech', batch: '2024', semester: 3, enrolledCount: 54 },
];

test('suggestQuickFixesForExam prioritizes conflict-free slots that preserve hall and invigilator and avoid same-day double exams', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 's1',
      subjectCode: 'AIDS301',
      subjectName: 'Applied Data Systems',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 58,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h1',
      hallNumber: 'D-105',
      hallCapacity: 120,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-2',
      subjectId: 's2',
      subjectCode: 'AIDS302',
      subjectName: 'Data Wrangling',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 56,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f2',
      invigilatorName: 'Dr. Arvind Krishnan',
    },
  ];

  const relaxedSuggestions = suggestQuickFixesForExam({
    targetExam: schedule[1],
    schedule,
    subjects,
    students: [],
    halls,
    faculty,
    policy: { oneExamPerDeptPerDay: false, minGapDaysBetweenExams: 0 },
    availableDates: ['2026-11-17', '2026-11-18'],
  });

  assert.ok(relaxedSuggestions.length > 0);
  const relaxedBest = relaxedSuggestions[0];
  assert.equal(relaxedBest.isConflictFree, true);
  // 2026-11-18 FN should outrank 2026-11-17 AN because cohort already has AIDS301 on 2026-11-17
  assert.equal(relaxedBest.toDate, '2026-11-18');
  assert.equal(relaxedBest.toSession, 'FN (09:30 - 12:30)');
  assert.equal(relaxedBest.hallChanged, false);
  assert.equal(relaxedBest.invigilatorChanged, false);
  assert.equal(relaxedBest.applyPayload.hallId, 'h2');
  assert.equal(relaxedBest.applyPayload.invigilatorId, 'f2');

  // With default 2-day gap policy enabled, Quick Fix skips 18th & 19th and moves AIDS302 to 2026-11-20
  const gapAwareSuggestions = suggestQuickFixesForExam({
    targetExam: schedule[1],
    schedule,
    subjects,
    students: [],
    halls,
    faculty,
    availableDates: ['2026-11-17', '2026-11-18'],
  });
  assert.equal(gapAwareSuggestions[0].isConflictFree, true);
  assert.equal(gapAwareSuggestions[0].toDate, '2026-11-20');
  assert.equal(gapAwareSuggestions[0].hasDeptGapViolation, false);
});

test('suggestQuickFixesForExam automatically finds a free hall and invigilator when current ones are busy in candidate slot', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 's1',
      subjectCode: 'AIDS301',
      subjectName: 'Applied Data Systems',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 58,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h1',
      hallNumber: 'D-105',
      hallCapacity: 120,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-2',
      subjectId: 's2',
      subjectCode: 'AIDS302',
      subjectName: 'Data Wrangling',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 56,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    // Occupy h2 & f1 on 2026-11-17 AN, 2026-11-18 FN, and 2026-11-18 AN so h3 & f2/f3 must be chosen
    {
      examId: 'ex-3',
      subjectId: 's3',
      subjectCode: 'BT301',
      subjectName: 'Operating Systems',
      department: 'B.Tech',
      batch: '2024',
      semester: 3,
      enrolledCount: 64,
      date: '2026-11-18',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-4',
      subjectId: 's3',
      subjectCode: 'BT302',
      subjectName: 'Algorithms',
      department: 'B.Tech',
      batch: '2024',
      semester: 3,
      enrolledCount: 40,
      date: '2026-11-18',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-5',
      subjectId: 's3',
      subjectCode: 'BT303',
      subjectName: 'Networks',
      department: 'B.Tech',
      batch: '2024',
      semester: 3,
      enrolledCount: 40,
      date: '2026-11-17',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
  ];

  const suggestions = suggestQuickFixesForExam({
    targetExam: schedule[1],
    schedule,
    subjects,
    students: [],
    halls,
    faculty,
    policy: { oneExamPerDeptPerDay: false, minGapDaysBetweenExams: 0 },
    availableDates: ['2026-11-17', '2026-11-18'],
  });

  const best = suggestions[0];
  assert.equal(best.isConflictFree, true);
  assert.equal(best.isOverflowDate, false);
  assert.equal(best.hallChanged, true);
  assert.equal(best.invigilatorChanged, true);
  assert.notEqual(best.hallId, 'h2');
  assert.notEqual(best.invigilatorId, 'f1');
});

test('buildCellQuickFixPlan selects the lowest-disruption move across conflicting exams in a cell', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 's1',
      subjectCode: 'AIDS301',
      subjectName: 'Applied Data Systems',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 58,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h1',
      hallNumber: 'D-105',
      hallCapacity: 120,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-2',
      subjectId: 's2',
      subjectCode: 'AIDS302',
      subjectName: 'Data Wrangling',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 56,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f2',
      invigilatorName: 'Dr. Arvind Krishnan',
    },
  ];

  const plan = buildCellQuickFixPlan({
    cell: { isConflict: true, exams: schedule },
    schedule,
    subjects,
    students: [],
    halls,
    faculty,
    availableDates: ['2026-11-17', '2026-11-18'],
  });

  assert.ok(plan.recommended);
  assert.equal(plan.recommended.isConflictFree, true);
  assert.ok(plan.allOptions.length >= 2);
});

test('buildBatchAutoResolvePlan resolves multiple cohort conflicts sequentially without introducing new clashes', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 's1',
      subjectCode: 'AIDS301',
      subjectName: 'Applied Data Systems',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 58,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h1',
      hallNumber: 'D-105',
      hallCapacity: 120,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-2',
      subjectId: 's2',
      subjectCode: 'AIDS302',
      subjectName: 'Data Wrangling',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 56,
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f2',
      invigilatorName: 'Dr. Arvind Krishnan',
    },
    {
      examId: 'ex-3',
      subjectId: 's3',
      subjectCode: 'BT301',
      subjectName: 'Operating Systems',
      department: 'B.Tech',
      batch: '2024',
      semester: 3,
      enrolledCount: 64,
      date: '2026-11-18',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h1',
      hallNumber: 'D-105',
      hallCapacity: 120,
      invigilatorId: 'f1',
      invigilatorName: 'Prof. Deepika Iyer',
    },
    {
      examId: 'ex-4',
      subjectId: 's4',
      subjectCode: 'BT302',
      subjectName: 'Computer Networks',
      department: 'B.Tech',
      batch: '2024',
      semester: 3,
      enrolledCount: 54,
      date: '2026-11-18',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h2',
      hallNumber: 'B-201',
      hallCapacity: 100,
      invigilatorId: 'f3',
      invigilatorName: 'Dr. Suresh Babu',
    },
  ];

  const plan = buildBatchAutoResolvePlan({
    schedule,
    subjects,
    students: [],
    halls,
    faculty,
    availableDates: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'],
  });

  assert.ok(plan.beforeConflicts.totalHardViolations > 0);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.afterConflicts.totalHardViolations, 0);
  assert.ok(plan.changes[0].previousValues.date);
});
